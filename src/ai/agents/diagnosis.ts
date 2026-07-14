/**
 * DiagnosisAgent — 诊断 Agent，继承 BaseAgent
 *
 * 职责：分析失败的 Playwright 测试，给出结构化诊断（根因、修复建议、置信度）。
 */
import * as path from 'path';
import { BaseAgent } from './base-agent';
import type { LLMService } from './llm-service';
import type { ToolRegistry } from './tool-registry';
import type {
  AgentConfig,
  LLMConfig,
  AIDiagnosis,
  ContextUsed,
  RootCauseAnalysis,
} from '../../types';
import { matchPatterns, buildFewShotExamples, ErrorPattern } from '../../diagnosis/knowledge-base';
import { enrichContext, EnrichedContext } from '../../diagnosis/context-enricher';
import { DiagnosisCache } from '../../diagnosis/diagnosis-cache';
import { DiagnosisPersister } from '../../diagnosis/diagnosis-persister';
import { parseResponse } from '../../diagnosis/response-parser';

export class DiagnosisAgent extends BaseAgent {
  private cache: DiagnosisCache;
  private persister: DiagnosisPersister;
  private dataDir: string;

  constructor(
    config: AgentConfig,
    llmConfig: LLMConfig | null,
    llmService?: LLMService,
    dataDir?: string,
    cache?: DiagnosisCache,
    persister?: DiagnosisPersister
  ) {
    super(config, llmConfig, llmService);
    const resolvedDataDir = dataDir || path.join(config.projectRoot || process.cwd(), '.yuantest');
    this.dataDir = resolvedDataDir;
    this.cache = cache ?? new DiagnosisCache();
    this.persister = persister ?? new DiagnosisPersister(resolvedDataDir);
  }

  protected getAgentName(): string {
    return 'DiagnosisAgent';
  }

  // ─── 校准置信度 ─────────────────────────────────────────────

  private calibrateConfidence(
    rawConfidence: number,
    contextUsed: ContextUsed,
    patternMatched: boolean,
    historyConsistent: boolean
  ): number {
    let calibrated = rawConfidence * 0.6;
    if (patternMatched) {
      calibrated += 0.2;
    }
    if (contextUsed.screenshot) {
      calibrated += 0.1;
    }
    if (contextUsed.sourceCode) {
      calibrated += 0.1;
    }
    if (contextUsed.consoleLogs) {
      calibrated += 0.05;
    }
    if (historyConsistent) {
      calibrated += 0.1;
    }
    return Math.min(1, Math.max(0, calibrated));
  }

  // ─── 构建 Prompt ────────────────────────────────────────────

  private buildEnrichedPrompt(
    context: EnrichedContext,
    patterns: ErrorPattern[],
    testInfo: { title: string; error?: string },
    lang: string = 'zh'
  ): { system: string; user: string } {
    const isChinese = lang === 'zh';

    let system = isChinese
      ? '你是一位 Playwright 测试诊断专家。请深入分析测试失败原因并提供结构化诊断。'
      : 'You are a Playwright test diagnosis expert. Analyze the test failure in depth and provide a structured diagnosis.';

    const fewShotExamples = buildFewShotExamples(patterns, lang);
    if (fewShotExamples) {
      system += '\n\n' + fewShotExamples;
    }

    system += isChinese
      ? '\n\n你必须只返回有效的 JSON 格式，不要使用 markdown 格式，不要代码块。' +
        'JSON 必须包含以下字段：' +
        '"summary" (字符串: 简要失败摘要), ' +
        '"rootCause" (字符串: 识别的根本原因), ' +
        '"suggestions" (字符串数组: 可操作的修复建议), ' +
        '"confidence" (0 到 1 之间的数字: 你的置信度), ' +
        '"category" (字符串: 错误类别，可选值: timeout, selector, assertion, network, frame, auth, unknown), ' +
        '"codeDiffs" (数组: 建议的代码修改，每项包含 filePath, unifiedDiff, description), ' +
        '"docLinks" (数组: 相关文档链接，每项包含 title, url)。' +
        '请使用中文回复。'
      : '\n\nYou must respond with valid JSON only, no markdown formatting, no code blocks. ' +
        'The JSON must have these fields: ' +
        '"summary" (string: brief failure summary), ' +
        '"rootCause" (string: identified root cause), ' +
        '"suggestions" (string array: actionable fix suggestions), ' +
        '"confidence" (number between 0 and 1: your confidence level), ' +
        '"category" (string: error category, one of: timeout, selector, assertion, network, frame, auth, unknown), ' +
        '"codeDiffs" (array: suggested code changes, each with filePath, unifiedDiff, description), ' +
        '"docLinks" (array: related documentation links, each with title, url). ' +
        'Please respond in English.';

    let user = isChinese ? `测试: ${testInfo.title}\n` : `Test: ${testInfo.title}\n`;
    if (testInfo.error) {
      user += isChinese ? `错误: ${testInfo.error}\n` : `Error: ${testInfo.error}\n`;
    }
    if (context.sourceCode) {
      user += isChinese
        ? `\n源代码:\n${context.sourceCode}\n`
        : `\nSource code:\n${context.sourceCode}\n`;
    }

    return { system, user };
  }

  // ─── 诊断公共准备阶段（抽取 diagnose / diagnoseStream 的重复逻辑） ──

  /**
   * 准备诊断所需的通用上下文、Prompt 和 patterns。
   * 后续由 diagnose / diagnoseStream 分别调用 LLM 完成最终诊断。
   */
  private async prepareDiagnosis(
    testInfo: {
      title: string;
      error?: string;
      stackTrace?: string;
      filePath?: string;
      lineNumber?: number;
      screenshots?: string[];
      logs?: string[];
      browser?: string;
    },
    lang?: string,
    rootCauseData?: RootCauseAnalysis
  ): Promise<{
    prompt: { system: string; user: string };
    context: EnrichedContext;
    patterns: ErrorPattern[];
    llmConfig: LLMConfig | null;
    contextUsed: ContextUsed;
  }> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const patterns = testInfo.error ? matchPatterns(testInfo.error) : [];
    const llmConfig = this.getLLMConfig();
    const effectiveLang = lang || (llmConfig?.remark ? 'en' : 'zh');

    const context = await enrichContext(
      {
        title: testInfo.title,
        error: testInfo.error,
        stackTrace: testInfo.stackTrace,
        filePath: testInfo.filePath,
        lineNumber: testInfo.lineNumber,
        screenshots: testInfo.screenshots,
        logs: testInfo.logs,
        browser: testInfo.browser,
      },
      this.dataDir,
      rootCauseData
    );

    const prompt = this.buildEnrichedPrompt(context, patterns, testInfo, effectiveLang);

    const contextUsed: ContextUsed = {
      sourceCode: !!context.sourceCode,
      screenshot: false,
      consoleLogs: false,
      stackTrace: !!testInfo.stackTrace,
      historyData: false,
      environmentInfo: true,
    };

    return { prompt, context, patterns, llmConfig, contextUsed };
  }

  /** 对诊断结果进行置信度校准与上下文标记 */
  private finalizeDiagnosis(
    rawContent: string,
    patterns: ErrorPattern[],
    llmConfig: LLMConfig | null,
    contextUsed: ContextUsed
  ): AIDiagnosis {
    const diagnosis = parseResponse(rawContent, patterns, llmConfig?.model || '');
    diagnosis.calibratedConfidence = this.calibrateConfidence(
      diagnosis.confidence,
      contextUsed,
      patterns.length > 0,
      false
    );
    diagnosis.contextUsed = contextUsed;
    return diagnosis;
  }

  // ─── 核心诊断（非流式，走 BaseAgent.callLLM） ──────────────────

  async diagnose(
    testInfo: {
      title: string;
      error?: string;
      stackTrace?: string;
      filePath?: string;
      lineNumber?: number;
      screenshots?: string[];
      logs?: string[];
      browser?: string;
    },
    lang?: string,
    runId?: string,
    testId?: string,
    rootCauseData?: RootCauseAnalysis
  ): Promise<AIDiagnosis> {
    // 缓存命中
    const cacheKey = this.cache.getCacheKey(testInfo);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { prompt, context, patterns, llmConfig, contextUsed } = await this.prepareDiagnosis(
      testInfo,
      lang,
      rootCauseData
    );

    // 使用 BaseAgent.callLLM，统一 token 记录与异常处理
    const content = await this.callLLM(prompt.system, prompt.user, {
      maxTokens: llmConfig?.maxTokens || 4096,
      temperature: llmConfig?.temperature ?? 0.3,
      responseFormat: { type: 'json_object' },
    });

    const diagnosis = this.finalizeDiagnosis(content, patterns, llmConfig, contextUsed);

    this.cache.set(cacheKey, diagnosis);
    return diagnosis;
  }

  // ─── 核心诊断（流式） ────────────────────────────────────────

  async *diagnoseStream(
    testInfo: {
      title: string;
      error?: string;
      stackTrace?: string;
      filePath?: string;
      lineNumber?: number;
      screenshots?: string[];
      logs?: string[];
      browser?: string;
    },
    lang?: string,
    runId?: string,
    testId?: string,
    rootCauseData?: RootCauseAnalysis
  ): AsyncGenerator<string, AIDiagnosis, unknown> {
    const { prompt, context, patterns, llmConfig, contextUsed } = await this.prepareDiagnosis(
      testInfo,
      lang,
      rootCauseData
    );

    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const stream = this.llmService.chatStream(
      { system: prompt.system, user: prompt.user },
      llmConfig || {
        enabled: false,
        apiKey: '',
        baseUrl: '',
        model: '',
        remark: '',
        maxTokens: 4096,
        temperature: 0.3,
      },
      { type: 'json_object' }
    );

    let fullContent = '';
    for await (const token of stream) {
      fullContent += token;
      yield token;
    }

    return this.finalizeDiagnosis(fullContent, patterns, llmConfig, contextUsed);
  }

  // ─── 缓存 ───────────────────────────────────────────────────

  clearCache(): void {
    this.cache.clear();
  }

  // ─── 持久化（委托 Persister） ───────────────────────────────

  async saveDiagnosis(runId: string, testId: string, diagnosis: AIDiagnosis): Promise<void> {
    return this.persister.saveDiagnosis(runId, testId, diagnosis);
  }

  async loadDiagnosis(runId: string, testId: string): Promise<AIDiagnosis | null> {
    return this.persister.loadDiagnosis(runId, testId);
  }

  async saveClusterResult(runId: string, clusters: unknown[]): Promise<void> {
    return this.persister.saveClusterResult(runId, clusters);
  }

  async loadClusterResult(runId: string): Promise<unknown[] | null> {
    return this.persister.loadClusterResult(runId);
  }
}
