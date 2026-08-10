import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './base-agent';
import { LLMService } from './llm-service';
import { AgentConfig, LLMConfig, GeneratedTestResult } from '@yuantest/contracts';
import { AgentOutputParser } from './output-parser';
import { TestRunner } from './test-runner';

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
 * 修复轮次的 LLM 系统提示词（双语）。
 * 复用 BaseAgent.callLLM 单次调用，让 LLM 据错误信息重新生成完整文件内容。
 */
const FIXER_SYSTEM_PROMPT_ZH =
  '你是一位专业的 Playwright 测试工程师。之前生成的测试代码运行失败，请根据错误信息和当前代码，重新生成一份完整、可运行的 TypeScript 测试文件。' +
  '只返回有效的 TypeScript 代码，不要 markdown 代码块，不要额外解释，以 import 语句开头。';

const FIXER_SYSTEM_PROMPT_EN =
  'You are a professional Playwright test engineer. Previously generated test code failed to run. Based on the error message and current code, regenerate a complete, runnable TypeScript test file. ' +
  'Return valid TypeScript code only, no markdown code blocks, no extra explanations, starting with import statements.';

/** 默认验证修复轮次上限，避免过长循环烧 token */
const DEFAULT_MAX_VALIDATE_ROUNDS = 2;

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

    // 双保险：chat() 已统一剥离 <think> 标签（与 chatWithTools 一致），
    // 此处再剥离一次以防御 reasoning_content 回退等边界场景，
    // 避免思考内容被当作代码保存
    const cleanedResponse = responseText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // 若剥离后无有效内容，说明模型只返回了思考过程（未给出代码），避免落盘垃圾文件
    if (!cleanedResponse) {
      return [];
    }

    return AgentOutputParser.saveGeneratedCode(cleanedResponse, outputDir);
  }

  /**
   * 生成测试代码后立即运行验证，失败则进入轻量修复循环。
   *
   * 流程：
   * 1. 调用 generateTests 落盘
   * 2. 对每个落盘文件调用 TestRunner.runSingleTest 验证
   * 3. 失败的文件进入修复循环（maxValidateRounds 上限）：
   *    - 用 FIXER 系统提示词 + 当前代码 + 错误信息重新生成
   *    - 覆盖写盘后再次验证
   * 4. 返回 GeneratedTestResult，含最终每文件的通过状态与失败原因
   *
   * 设计要点：
   * - 复用现有 TestRunner + AgentOutputParser.saveGeneratedCode，零新依赖
   * - 修复循环用 BaseAgent.callLLM 单次调用重新生成完整文件，
   *   而非细粒度补丁（GeneratorAgent 不持有 PatchApplier）
   * - 默认 maxValidateRounds=2，避免过长烧 token；可 opt-in 覆盖
   * - 向后兼容：原 generateTests 不动，本方法为 opt-in 入口
   *
   * @param planContent Markdown 测试计划内容
   * @param options 输出目录、seedTest、验证轮次上限
   */
  async generateAndValidate(
    planContent: string,
    options?: {
      outputDir?: string;
      seedTest?: string;
      /** 验证修复轮次上限（默认 2） */
      maxValidateRounds?: number;
    }
  ): Promise<GeneratedTestResult> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const projectRoot = this.config.projectRoot || process.cwd();
    const outputDir = options?.outputDir || path.resolve(projectRoot, 'tests');
    const maxRounds = options?.maxValidateRounds ?? DEFAULT_MAX_VALIDATE_ROUNDS;
    const runner = new TestRunner();
    const lang = this.config.language || 'zh';

    // 1. 首次生成落盘
    const files = await this.generateTests(planContent, {
      outputDir,
      seedTest: options?.seedTest,
    });

    // 2. 逐文件验证 + 修复循环
    let roundsUsed = 0;
    let allPassed = true;
    let finalError: string | undefined;
    let finalStackTrace: string | undefined;

    for (const filePath of files) {
      let passed = false;
      let currentError = '';
      let currentStackTrace = '';

      for (let round = 0; round <= maxRounds; round++) {
        const summary = await runner.runSingleTest(filePath, projectRoot);
        passed = summary.passed;

        if (passed) {
          break;
        }
        // 记录本轮失败原因，供下一轮修复注入 prompt
        currentError = summary.error || 'Unknown error';
        currentStackTrace = summary.stackTrace || '';

        if (round >= maxRounds) {
          // 达上限仍未通过，停止该文件的修复
          break;
        }

        // 3. 修复：让 LLM 据当前代码 + 错误信息重新生成完整文件
        roundsUsed = Math.max(roundsUsed, round + 1);
        const fixedContent = await this.regenerateFile(
          filePath,
          currentError,
          currentStackTrace,
          lang
        );
        if (fixedContent === null) {
          // 重新生成失败，停止该文件的修复
          break;
        }
        fs.writeFileSync(filePath, fixedContent, 'utf-8');
      }

      if (!passed) {
        allPassed = false;
        finalError = currentError;
        finalStackTrace = currentStackTrace;
      }
    }

    return {
      files,
      passed: allPassed,
      roundsUsed,
      finalError: allPassed ? undefined : finalError,
      finalStackTrace: allPassed ? undefined : finalStackTrace,
    };
  }

  /**
   * 内部修复辅助：据当前文件内容 + 错误信息，让 LLM 重新生成完整文件内容。
   * 返回 null 表示重新生成失败（LLM 未给出有效代码）。
   */
  private async regenerateFile(
    filePath: string,
    error: string,
    stackTrace: string,
    lang: string
  ): Promise<string | null> {
    if (!this.llmService) {
      return null;
    }
    const fileName = path.basename(filePath);
    let currentContent = '';
    try {
      currentContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // 文件读取失败时仍尝试重新生成
    }

    const systemPrompt = lang === 'zh' ? FIXER_SYSTEM_PROMPT_ZH : FIXER_SYSTEM_PROMPT_EN;
    let userPrompt =
      lang === 'zh'
        ? `请修复以下测试文件的运行错误：\n\n文件名: ${fileName}\n\n`
        : `Please fix the runtime errors in the following test file:\n\nFile: ${fileName}\n\n`;
    userPrompt +=
      lang === 'zh'
        ? `当前代码:\n\`\`\`typescript\n${currentContent}\n\`\`\`\n\n`
        : `Current code:\n\`\`\`typescript\n${currentContent}\n\`\`\`\n\n`;
    if (error) {
      userPrompt += lang === 'zh' ? `错误信息: ${error}\n\n` : `Error: ${error}\n\n`;
    }
    if (stackTrace) {
      userPrompt +=
        lang === 'zh'
          ? `堆栈跟踪:\n${stackTrace.slice(0, 2000)}\n\n`
          : `Stack trace:\n${stackTrace.slice(0, 2000)}\n\n`;
    }

    const responseText = await super.callLLM(systemPrompt, userPrompt);
    // 从响应中提取代码块，若无代码块则按原样 cleanCode 处理
    const codeBlocks = AgentOutputParser.extractCodeBlocks(responseText);
    const cleaned =
      codeBlocks.length > 0 ? codeBlocks[0] : AgentOutputParser.cleanCode(responseText);
    return cleaned || null;
  }
}
