import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { AgentConfig, LLMConfig } from '../types';

const GENERATOR_SYSTEM_PROMPT_ZH =
  '你是一位专业的 Playwright 测试工程师。你的任务是将测试计划转换为可执行的 Playwright 测试代码。' +
  '你需要根据 Markdown 测试计划中的场景和步骤，生成符合 Playwright Test 规范的 TypeScript 测试文件。' +
  '生成的代码应该：\n' +
  '1. 使用 page.locator 或 page.getByRole 等现代定位器\n' +
  '2. 包含适当的断言\n' +
  '3. 遵循测试最佳实践\n' +
  '4. 每个测试场景独立可运行\n\n' +
  '你必须只返回有效的 TypeScript 代码，不要使用 markdown 代码块包裹，不要额外解释。' +
  '代码应该以 import 语句开头。';

const GENERATOR_SYSTEM_PROMPT_EN =
  'You are a professional Playwright test engineer. Your task is to transform test plans into executable Playwright test code. ' +
  'You need to generate TypeScript test files that conform to the Playwright Test specification based on the scenarios and steps in the Markdown test plan. ' +
  'The generated code should:\n' +
  '1. Use modern locators like page.locator or page.getByRole\n' +
  '2. Include appropriate assertions\n' +
  '3. Follow testing best practices\n' +
  '4. Each test scenario should be independently runnable\n\n' +
  'You must return valid TypeScript code only, no markdown code blocks, no extra explanations. ' +
  'The code should start with import statements.';

export class GeneratorAgent {
  private config: AgentConfig;
  private llmConfig: LLMConfig | null;
  private log = logger.child('GeneratorAgent');

  constructor(config: AgentConfig, llmConfig: LLMConfig | null) {
    this.config = config;
    this.llmConfig = llmConfig;
  }

  async generateTests(
    planContent: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<string[]> {
    if (!this.llmConfig || !this.llmConfig.enabled) {
      throw new Error('LLM is not enabled');
    }

    const lang = 'zh';
    const systemPrompt = lang === 'zh' ? GENERATOR_SYSTEM_PROMPT_ZH : GENERATOR_SYSTEM_PROMPT_EN;

    let userPrompt =
      lang === 'zh'
        ? `请根据以下测试计划生成 Playwright 测试代码：\n\n${planContent}\n`
        : `Generate Playwright test code based on the following test plan:\n\n${planContent}\n`;

    if (options?.seedTest && fs.existsSync(options.seedTest)) {
      const seedContent = fs.readFileSync(options.seedTest, 'utf-8');
      userPrompt +=
        lang === 'zh'
          ? `\n参考 Seed Test（使用相同的 fixtures 和 import 路径）：\n\`\`\`typescript\n${seedContent}\n\`\`\`\n`
          : `\nReference Seed Test (use the same fixtures and import paths):\n\`\`\`typescript\n${seedContent}\n\`\`\`\n`;
    }

    const responseText = await this.callLLM(systemPrompt, userPrompt);
    const generatedFiles = this.extractAndSaveTests(responseText, options?.outputDir);

    return generatedFiles;
  }

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.llmConfig) {
      throw new Error('LLM config is not set');
    }

    const url = `${this.llmConfig.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.llmConfig.apiKey) {
        headers['Authorization'] = `Bearer ${this.llmConfig.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.llmConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: this.llmConfig.maxTokens || 8192,
          temperature: this.llmConfig.temperature || 0.2,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  private extractAndSaveTests(responseText: string, outputDir?: string): string[] {
    const projectRoot = this.config.projectRoot || process.cwd();
    const testDir = outputDir || path.resolve(projectRoot, 'tests');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const savedFiles: string[] = [];
    const codeBlocks = this.extractCodeBlocks(responseText);

    if (codeBlocks.length === 0) {
      const fileName = `generated-${Date.now()}.spec.ts`;
      const filePath = path.join(testDir, fileName);
      const cleanedCode = this.cleanCode(responseText);
      fs.writeFileSync(filePath, cleanedCode, 'utf-8');
      savedFiles.push(filePath);
      this.log.info(`Generated test file: ${filePath}`);
      return savedFiles;
    }

    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i];
      const testName = this.extractTestName(code);
      const fileName = testName
        ? `${testName}.spec.ts`
        : `generated-${Date.now()}-${i + 1}.spec.ts`;
      const filePath = path.join(testDir, fileName);
      fs.writeFileSync(filePath, code, 'utf-8');
      savedFiles.push(filePath);
      this.log.info(`Generated test file: ${filePath}`);
    }

    return savedFiles;
  }

  private extractCodeBlocks(text: string): string[] {
    const blocks: string[] = [];
    const regex = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const code = match[1].trim();
      if (code.includes('test(') || code.includes('test.describe') || code.includes('import')) {
        blocks.push(code);
      }
    }
    return blocks;
  }

  private extractTestName(code: string): string | null {
    const describeMatch = code.match(/test\.describe\(['"](.+?)['"]/);
    if (describeMatch) {
      return describeMatch[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
    }

    const testMatch = code.match(/test\(['"](.+?)['"]/);
    if (testMatch) {
      return testMatch[1]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
    }

    return null;
  }

  private cleanCode(text: string): string {
    let code = text;
    const codeBlockMatch = code.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
    }
    return code.trim();
  }
}
