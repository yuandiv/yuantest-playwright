import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './base-agent';
import { LLMService } from './llm-service';
import { AgentConfig, LLMConfig } from '../../types';
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

export class GeneratorAgent extends BaseAgent {
  protected getAgentName(): string {
    return 'GeneratorAgent';
  }

  constructor(config: AgentConfig, llmConfig: LLMConfig | null, llmService?: LLMService) {
    super(config, llmConfig, llmService);
  }

  async generateTests(
    planContent: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<string[]> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const lang = this.config.language || 'zh';
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

    const responseText = await super.callLLM(systemPrompt, userPrompt);
    const projectRoot = this.config.projectRoot || process.cwd();
    const outputDir = options?.outputDir || path.resolve(projectRoot, 'tests');
    return AgentOutputParser.saveGeneratedCode(responseText, outputDir);
  }
}
