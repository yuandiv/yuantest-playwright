import * as fs from 'fs';
import * as path from 'path';
import { LLMService } from './llm-service';
import { AgentOutputParser } from './output-parser';

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

/**
 * GeneratorService — 将测试计划转换为可执行的 Playwright 测试代码。
 * 单次 LLM 调用，纯 input→output 转换。
 */
export class GeneratorService {
  constructor(
    private llmService: LLMService,
    private projectRoot: string = process.cwd()
  ) {}

  async generateTests(
    planContent: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<string[]> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const llmConfig = this.llmService.getConfig();
    const lang = (llmConfig as { language?: string })?.language === 'en' ? 'en' : 'zh';
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

    const result = await this.llmService.chat({
      systemPrompt,
      userPrompt,
      temperature: 0.2,
    });

    return this.extractAndSaveTests(result.content, options?.outputDir);
  }

  // ─── 文件处理 ──────────────────────────────────────────────────────────

  private extractAndSaveTests(responseText: string, outputDir?: string): string[] {
    const testDir = outputDir || path.resolve(this.projectRoot, 'tests');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const savedFiles: string[] = [];
    const codeBlocks = AgentOutputParser.extractCodeBlocks(responseText);

    if (codeBlocks.length === 0) {
      const fileName = `generated-${Date.now()}.spec.ts`;
      const filePath = path.join(testDir, fileName);
      const cleanedCode = AgentOutputParser.cleanCode(responseText);
      fs.writeFileSync(filePath, cleanedCode, 'utf-8');
      savedFiles.push(filePath);
      return savedFiles;
    }

    const usedFileNames = new Set<string>();

    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i];
      const testName = this.extractTestName(code);
      let fileName = testName ? `${testName}.spec.ts` : `generated-${Date.now()}-${i + 1}.spec.ts`;

      if (usedFileNames.has(fileName)) {
        const baseName = testName || `generated-${Date.now()}`;
        let suffix = 2;
        while (usedFileNames.has(`${baseName}-${suffix}.spec.ts`)) {
          suffix++;
        }
        fileName = `${baseName}-${suffix}.spec.ts`;
      }
      usedFileNames.add(fileName);

      const filePath = path.join(testDir, fileName);
      fs.writeFileSync(filePath, code, 'utf-8');
      savedFiles.push(filePath);
    }

    return savedFiles;
  }

  private extractTestName(code: string): string | null {
    const describeMatch = code.match(/test\.describe\(['"](.+?)['"]/);
    if (describeMatch) {
      const slug = this.generateSlug(describeMatch[1]);
      return slug || null;
    }

    const testMatch = code.match(/test\(['"](.+?)['"]/);
    if (testMatch) {
      const slug = this.generateSlug(testMatch[1]);
      return slug || null;
    }

    return null;
  }

  private generateSlug(text: string): string {
    let slug = text.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
    slug = slug.replace(/-+/g, '-');
    slug = slug.replace(/^-+|-+$/g, '');
    return slug.slice(0, 50);
  }
}
