import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import {
  LLMConfig,
  AIDiagnosis,
  LLMStatus,
  ContextUsed,
  CodeDiff,
  DocLink,
  RootCauseAnalysis,
} from '../types';
import { matchPatterns, buildFewShotExamples, ErrorPattern } from './knowledge-base';
import { enrichContext, EnrichedContext } from './context-enricher';
import { LLMService } from '../agents/llm-service';
import { ToolRegistry } from '../agents/tool-registry';
import { TTLCache } from '../cache';

const DEFAULT_CONFIG: LLMConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  model: '',
  remark: '',
  maxTokens: 2048,
  temperature: 0.3,
};

const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

export class DiagnosisService {
  private dataDir: string;
  private config: LLMConfig;
  private cache = new TTLCache<AIDiagnosis>(CACHE_TTL_MS, { maxSize: CACHE_MAX_SIZE });
  private log = logger.child('DiagnosisService');
  private llmService: LLMService | null = null;
  private toolRegistry: ToolRegistry | null = null;

  constructor(dataDir: string, sharedLLMService?: LLMService, sharedToolRegistry?: ToolRegistry) {
    this.dataDir = dataDir;
    try {
      this.config = this.loadConfig();
    } catch {
      this.config = { ...DEFAULT_CONFIG };
    }
    if (sharedLLMService) {
      this.llmService = sharedLLMService;
    } else if (this.config.enabled) {
      this.llmService = new LLMService(this.config);
    }
    if (sharedToolRegistry) {
      this.toolRegistry = sharedToolRegistry;
    } else if (this.config.enabled) {
      this.toolRegistry = ToolRegistry.createDefaultRegistry(this.dataDir, process.cwd());
    }
  }

  /**
   * 从配置文件加载 LLM 配置
   * @returns 合并默认值后的 LLM 配置对象
   */
  private loadConfig(): LLMConfig {
    const configPath = path.join(this.dataDir, 'llm-config.json');
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      this.log.warn(
        `Failed to load LLM config: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * 保存 LLM 配置到文件并清除缓存
   * @param config - 要保存的 LLM 配置
   */
  async saveConfig(config: LLMConfig): Promise<void> {
    this.config = config;
    this.clearCache();
    // 同步更新 LLMService
    this.updateLLMConfig(config);
    const configPath = path.join(this.dataDir, 'llm-config.json');
    try {
      await fs.promises.mkdir(this.dataDir, { recursive: true });
      await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.log.info('LLM config saved');
    } catch (error) {
      this.log.error(
        `Failed to save LLM config: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * 更新 LLM 配置，同步更新 LLMService 和 ToolRegistry
   * @param config - 新的 LLM 配置
   */
  updateLLMConfig(config: LLMConfig): void {
    if (this.llmService) {
      this.llmService.updateConfig(config);
    } else {
      this.llmService = new LLMService(config);
    }
    this.config = config;
    // 确保 ToolRegistry 也已初始化
    if (!this.toolRegistry) {
      this.toolRegistry = ToolRegistry.createDefaultRegistry(this.dataDir, process.cwd());
    }
  }

  /**
   * 获取当前 LLM 配置的副本（用于外部读取）
   * @returns LLM 配置对象的浅拷贝
   */
  getMaskedConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * 置信度校准函数
   * 基于原始置信度和上下文使用情况，对 LLM 给出的原始置信度进行校准
   * 校准公式：calibrated = rawConfidence * 0.6 + 各上下文因子加成
   * @param rawConfidence - LLM 返回的原始置信度
   * @param contextUsed - 实际使用的上下文信息
   * @param patternMatched - 是否匹配到知识库模式
   * @param historyConsistent - 历史数据是否一致（是否与当前诊断方向一致）
   * @returns 校准后的置信度，范围 [0, 1]
   */
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

  /**
   * 构建富集后的提示（包含知识库 few-shot 示例和完整上下文信息）
   * 替代原有的 buildPrompt 方法，支持更丰富的上下文和结构化输出要求
   * @param context - 富集后的上下文对象
   * @param patterns - 匹配到的错误模式列表
   * @param testInfo - 测试信息对象
   * @param lang - 语言标识，默认 'zh'
   * @returns 包含 system、user 和可选 screenshotBase64 的提示对象
   */
  private buildEnrichedPrompt(
    context: EnrichedContext,
    patterns: ErrorPattern[],
    testInfo: { title: string; error?: string },
    lang: string = 'zh'
  ): { system: string; user: string; screenshotBase64?: string } {
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
        ? `\n源代码上下文:\n${context.sourceCode}\n`
        : `\nSource Code Context:\n${context.sourceCode}\n`;
    }
    if (context.stackTrace) {
      user += isChinese
        ? `\n堆栈跟踪:\n${context.stackTrace}\n`
        : `\nStack Trace:\n${context.stackTrace}\n`;
    }
    if (context.consoleLogs.length > 0) {
      user += isChinese
        ? `\n控制台日志:\n${context.consoleLogs.join('\n')}\n`
        : `\nConsole Logs:\n${context.consoleLogs.join('\n')}\n`;
    }
    if (context.environmentInfo) {
      user += isChinese
        ? `\n环境信息:\n${context.environmentInfo}\n`
        : `\nEnvironment:\n${context.environmentInfo}\n`;
    }
    if (context.historyData) {
      user += isChinese ? `\n${context.historyData}\n` : `\n${context.historyData}\n`;
    }
    if (context.screenshotBase64) {
      user += isChinese
        ? '\n[附有失败截图，请分析截图内容以辅助诊断]\n'
        : '\n[A failure screenshot is attached, please analyze it to assist diagnosis]\n';
    }

    user += isChinese ? '\n请以 JSON 格式提供诊断结果。' : '\nProvide your diagnosis as JSON.';

    return {
      system,
      user,
      screenshotBase64: context.screenshotBase64,
    };
  }

  /**
   * 解析 LLM 响应文本为 AIDiagnosis 对象（扩展版，支持新增字段）
   * 优先尝试从 JSON 代码块中提取，其次尝试从全文匹配 JSON 对象
   * @param responseText - LLM 返回的原始文本
   * @param patterns - 匹配到的错误模式列表，用于推断 category 和填充 docLinks
   * @returns 解析后的 AIDiagnosis 对象
   */
  private parseResponse(responseText: string, patterns: ErrorPattern[] = []): AIDiagnosis {
    let text = responseText.trim();

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    const defaultContextUsed: ContextUsed = {
      sourceCode: false,
      screenshot: false,
      consoleLogs: false,
      stackTrace: false,
      historyData: false,
      environmentInfo: false,
    };

    try {
      const parsed = JSON.parse(text);

      const category =
        (parsed.category as AIDiagnosis['category']) || patterns[0]?.category || 'unknown';

      const codeDiffs: CodeDiff[] = Array.isArray(parsed.codeDiffs)
        ? parsed.codeDiffs.filter(
            (d: unknown) =>
              typeof d === 'object' && d !== null && 'filePath' in (d as Record<string, unknown>)
          )
        : [];

      const parsedDocLinks: DocLink[] = Array.isArray(parsed.docLinks)
        ? parsed.docLinks.filter(
            (d: unknown) =>
              typeof d === 'object' &&
              d !== null &&
              'title' in (d as Record<string, unknown>) &&
              'url' in (d as Record<string, unknown>)
          )
        : [];

      const docLinks: DocLink[] =
        parsedDocLinks.length > 0 ? parsedDocLinks : patterns.flatMap((p) => p.docLinks);

      const rawConfidence =
        typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;

      return {
        summary: String(parsed.summary || ''),
        rootCause: String(parsed.rootCause || ''),
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
        confidence: rawConfidence,
        model: this.config.model,
        timestamp: Date.now(),
        category,
        codeDiffs,
        docLinks,
        contextUsed: defaultContextUsed,
        reasoningSteps: [],
        calibratedConfidence: rawConfidence,
        analysisMode: 'single',
      };
    } catch {
      this.log.warn('Failed to parse LLM response as JSON, attempting fallback extraction');
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);

          const category =
            (parsed.category as AIDiagnosis['category']) || patterns[0]?.category || 'unknown';

          const codeDiffs: CodeDiff[] = Array.isArray(parsed.codeDiffs)
            ? parsed.codeDiffs.filter(
                (d: unknown) =>
                  typeof d === 'object' &&
                  d !== null &&
                  'filePath' in (d as Record<string, unknown>)
              )
            : [];

          const parsedDocLinks: DocLink[] = Array.isArray(parsed.docLinks)
            ? parsed.docLinks.filter(
                (d: unknown) =>
                  typeof d === 'object' &&
                  d !== null &&
                  'title' in (d as Record<string, unknown>) &&
                  'url' in (d as Record<string, unknown>)
              )
            : [];

          const docLinks: DocLink[] =
            parsedDocLinks.length > 0 ? parsedDocLinks : patterns.flatMap((p) => p.docLinks);

          const rawConfidence =
            typeof parsed.confidence === 'number'
              ? Math.min(1, Math.max(0, parsed.confidence))
              : 0.5;

          return {
            summary: String(parsed.summary || ''),
            rootCause: String(parsed.rootCause || ''),
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
            confidence: rawConfidence,
            model: this.config.model,
            timestamp: Date.now(),
            category,
            codeDiffs,
            docLinks,
            contextUsed: defaultContextUsed,
            reasoningSteps: [],
            calibratedConfidence: rawConfidence,
            analysisMode: 'single',
          };
        }
      } catch {
        // fallback below
      }

      return {
        summary: responseText.slice(0, 200),
        rootCause: 'Unable to parse structured diagnosis from LLM response',
        suggestions: [],
        confidence: 0,
        model: this.config.model,
        timestamp: Date.now(),
        category: patterns[0]?.category || 'unknown',
        codeDiffs: [],
        docLinks: patterns.flatMap((p) => p.docLinks),
        contextUsed: defaultContextUsed,
        reasoningSteps: [],
        calibratedConfidence: 0,
        analysisMode: 'fallback',
      };
    }
  }

  /**
   * 生成缓存键（基于测试信息组合）
   * @param testInfo - 测试信息对象
   * @returns 唯一的缓存键字符串
   */
  private getCacheKey(testInfo: {
    title: string;
    error?: string;
    filePath?: string;
    lineNumber?: number;
  }): string {
    return `${testInfo.title}::${testInfo.error || ''}::${testInfo.filePath || ''}::${testInfo.lineNumber || ''}`;
  }

  /**
   * 从缓存中获取诊断结果（带 TTL 过期检查）
   * @param key - 缓存键
   * @returns 缓存的诊断结果，不存在或已过期返回 null
   */
  private getFromCache(key: string): AIDiagnosis | null {
    return this.cache.get(key);
  }

  /**
   * 将诊断结果存入缓存（TTLCache 内部处理 LRU 淘汰策略）
   * @param key - 缓存键
   * @param result - 诊断结果
   */
  private setCache(key: string, result: AIDiagnosis): void {
    this.cache.set(key, result);
  }

  /**
   * 确保 LLMService 和 ToolRegistry 已初始化
   * 如果未初始化则根据当前配置创建实例
   */
  private ensureServices(): void {
    if (!this.llmService) {
      this.llmService = new LLMService(this.config);
    }
    if (!this.toolRegistry) {
      this.toolRegistry = ToolRegistry.createDefaultRegistry(this.dataDir, process.cwd());
    }
  }

  /**
   * 执行 AI 诊断（重构版，使用 LLMService + ToolRegistry 替代重复实现）
   * 流程：enrichContext → matchPatterns → buildEnrichedPrompt → chatWithAgentLoop → parseResponse → calibrateConfidence
   * @param testInfo - 测试信息对象
   * @param lang - 语言标识，默认 'zh'
   * @returns AI 诊断结果
   */
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
    lang: string = 'zh',
    runId?: string,
    testId?: string,
    rootCause?: RootCauseAnalysis
  ): Promise<AIDiagnosis> {
    if (!this.config.enabled) {
      return {
        summary: lang === 'zh' ? 'AI 诊断未启用' : 'AI diagnosis is not enabled',
        rootCause: lang === 'zh' ? 'LLM 未在配置中启用' : 'LLM is not enabled in configuration',
        suggestions:
          lang === 'zh'
            ? ['在设置中启用 LLM 以使用 AI 诊断']
            : ['Enable LLM in settings to use AI diagnosis'],
        confidence: 0,
        model: '',
        timestamp: Date.now(),
        category: 'unknown',
        codeDiffs: [],
        docLinks: [],
        contextUsed: {
          sourceCode: false,
          screenshot: false,
          consoleLogs: false,
          stackTrace: false,
          historyData: false,
          environmentInfo: false,
        },
        reasoningSteps: [],
        calibratedConfidence: 0,
        analysisMode: 'fallback',
      };
    }

    const cacheKey = this.getCacheKey(testInfo) + `::${lang}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.log.debug('Returning cached diagnosis result');
      return cached;
    }

    if (runId && testId) {
      const persisted = await this.loadDiagnosis(runId, testId);
      if (persisted) {
        this.log.debug('Returning persisted diagnosis result');
        this.setCache(cacheKey, persisted);
        return persisted;
      }
    }

    try {
      const context = await enrichContext(testInfo, this.dataDir, rootCause);

      const patterns = matchPatterns(testInfo.error || '');

      const prompt = this.buildEnrichedPrompt(context, patterns, testInfo, lang);

      if (rootCause) {
        prompt.system += `\n\n## Root Cause Analysis Findings\n- Primary Cause: ${rootCause.primaryCause}\n- Confidence: ${(rootCause.confidence * 100).toFixed(0)}%\n- Suggested Actions: ${rootCause.suggestedActions.join(', ')}\n- Evidence: ${rootCause.evidence.map((e) => e.description).join('; ')}`;
      }

      // 确保 LLMService 和 ToolRegistry 已初始化
      this.ensureServices();

      // 获取工具 schema 列表
      const tools = (this.toolRegistry as ToolRegistry).getToolSchemas();

      // 使用 LLMService.chatWithAgentLoop 替代本地 agentLoop
      const toolExecutor = async (
        toolName: string,
        args: Record<string, unknown>
      ): Promise<string> => {
        try {
          return await (this.toolRegistry as ToolRegistry).executeTool(toolName, args);
        } catch (error) {
          return `Tool execution error (${toolName}): ${error instanceof Error ? error.message : String(error)}`;
        }
      };

      const { responseText, reasoningSteps, analysisMode } = await (
        this.llmService as LLMService
      ).chatWithAgentLoop(prompt, this.config, tools, prompt.screenshotBase64, toolExecutor);

      const diagnosis = this.parseResponse(responseText, patterns);

      const patternMatched = patterns.length > 0;
      const historyConsistent = context.historyData !== undefined;
      const calibratedConfidence = this.calibrateConfidence(
        diagnosis.confidence,
        context.contextUsed,
        patternMatched,
        historyConsistent
      );

      diagnosis.contextUsed = context.contextUsed;
      diagnosis.reasoningSteps =
        reasoningSteps.length > 0 ? reasoningSteps : diagnosis.reasoningSteps;
      diagnosis.analysisMode = analysisMode;
      diagnosis.calibratedConfidence = calibratedConfidence;

      if (!diagnosis.category || diagnosis.category === 'unknown') {
        if (patterns.length > 0) {
          diagnosis.category = patterns[0].category;
        }
      }

      if (calibratedConfidence < 0.5) {
        const warningMsg =
          lang === 'zh'
            ? '⚠️ 置信度较低，建议人工确认此诊断结果'
            : '⚠️ Low confidence, manual review recommended for this diagnosis';
        if (!diagnosis.suggestions.includes(warningMsg)) {
          diagnosis.suggestions.push(warningMsg);
        }
      }

      this.setCache(cacheKey, diagnosis);
      if (runId && testId) {
        await this.saveDiagnosis(runId, testId, diagnosis);
      }
      this.log.info(`Diagnosis completed for: ${testInfo.title}`);
      return diagnosis;
    } catch (error) {
      this.log.error(`Diagnosis failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        summary: lang === 'zh' ? '诊断失败' : 'Diagnosis failed',
        rootCause: error instanceof Error ? error.message : String(error),
        suggestions:
          lang === 'zh' ? ['检查 LLM 配置和连接'] : ['Check LLM configuration and connectivity'],
        confidence: 0,
        model: this.config.model,
        timestamp: Date.now(),
        category: 'unknown',
        codeDiffs: [],
        docLinks: [],
        contextUsed: {
          sourceCode: false,
          screenshot: false,
          consoleLogs: false,
          stackTrace: false,
          historyData: false,
          environmentInfo: false,
        },
        reasoningSteps: [],
        calibratedConfidence: 0,
        analysisMode: 'fallback',
      };
    }
  }

  /**
   * 流式执行 AI 诊断（重构版，使用 LLMService.chatStream 替代本地 callLLMStream）
   * 流式模式下使用简化的单次调用（不使用 Agent 循环，因为流式工具调用复杂度高）
   * @param testInfo - 测试信息对象
   * @param lang - 语言标识，默认 'zh'
   * @yields JSON 格式的事件流：start、chunk、complete、error
   */
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
    lang: string = 'zh',
    runId?: string,
    testId?: string
  ): AsyncGenerator<string, void, unknown> {
    if (!this.config.enabled) {
      const errorMsg = lang === 'zh' ? 'AI 诊断未启用' : 'AI diagnosis is not enabled';
      yield JSON.stringify({ error: errorMsg, type: 'error' });
      return;
    }

    if (runId && testId) {
      const persisted = await this.loadDiagnosis(runId, testId);
      if (persisted) {
        this.log.debug('Returning persisted diagnosis result via stream');
        yield JSON.stringify({ type: 'complete', diagnosis: persisted }) + '\n';
        return;
      }
    }

    try {
      yield JSON.stringify({ type: 'start', testTitle: testInfo.title }) + '\n';

      const context = await enrichContext(testInfo, this.dataDir);

      const patterns = matchPatterns(testInfo.error || '');

      const prompt = this.buildEnrichedPrompt(context, patterns, testInfo, lang);

      // 确保 LLMService 已初始化
      this.ensureServices();

      let fullResponse = '';

      // 使用 LLMService.chatStream 替代本地 callLLMStream
      for await (const chunk of (this.llmService as LLMService).chatStream(prompt, this.config)) {
        fullResponse += chunk;
        yield JSON.stringify({ type: 'chunk', content: chunk }) + '\n';
      }

      const diagnosis = this.parseResponse(fullResponse, patterns);

      const patternMatched = patterns.length > 0;
      const historyConsistent = context.historyData !== undefined;
      const calibratedConfidence = this.calibrateConfidence(
        diagnosis.confidence,
        context.contextUsed,
        patternMatched,
        historyConsistent
      );

      diagnosis.contextUsed = context.contextUsed;
      diagnosis.calibratedConfidence = calibratedConfidence;
      diagnosis.analysisMode = 'single';

      if (!diagnosis.category || diagnosis.category === 'unknown') {
        if (patterns.length > 0) {
          diagnosis.category = patterns[0].category;
        }
      }

      if (calibratedConfidence < 0.5) {
        const warningMsg =
          lang === 'zh'
            ? '⚠️ 置信度较低，建议人工确认此诊断结果'
            : '⚠️ Low confidence, manual review recommended for this diagnosis';
        if (!diagnosis.suggestions.includes(warningMsg)) {
          diagnosis.suggestions.push(warningMsg);
        }
      }

      const cacheKey = this.getCacheKey(testInfo) + `::${lang}`;
      this.setCache(cacheKey, diagnosis);
      if (runId && testId) {
        await this.saveDiagnosis(runId, testId, diagnosis);
      }

      yield JSON.stringify({ type: 'complete', diagnosis }) + '\n';
      this.log.info(`Stream diagnosis completed for: ${testInfo.title}`);
    } catch (error) {
      this.log.error(
        `Stream diagnosis failed: ${error instanceof Error ? error.message : String(error)}`
      );
      yield JSON.stringify({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      }) + '\n';
    }
  }

  /**
   * 测试 LLM 连接是否正常（使用 LLMService 替代手动 fetch）
   * @param config - 可选的 LLM 配置，不传则使用当前配置
   * @returns 连接测试结果，包含 success 和可选的 error 信息
   */
  async testConnection(config?: LLMConfig): Promise<{ success: boolean; error?: string }> {
    const cfg = config || this.config;
    if (!cfg.baseUrl) {
      return { success: false, error: 'No base URL configured' };
    }
    try {
      const url = `${cfg.baseUrl.replace(/\/+$/, '')}/v1/models`;
      const headers: Record<string, string> = {};
      if (cfg.apiKey) {
        headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        if (response.ok) {
          return { success: true };
        }
        return { success: false, error: `API returned ${response.status}: ${response.statusText}` };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 获取 LLM 服务状态（配置是否完整、连接是否正常）
   * @returns LLM 状态对象
   */
  async getStatus(): Promise<LLMStatus> {
    const configured =
      this.config.enabled && this.config.baseUrl.trim() !== '' && this.config.model.trim() !== '';

    if (!configured) {
      return { configured: false, connected: false, status: 'yellow' };
    }

    const { success } = await this.testConnection();
    if (success) {
      return { configured: true, connected: true, status: 'green' };
    }
    return { configured: true, connected: false, status: 'red' };
  }

  /**
   * 清除所有缓存
   */
  private getDiagnosisDir(): string {
    return path.join(this.dataDir, 'diagnosis');
  }

  async saveDiagnosis(runId: string, testId: string, diagnosis: AIDiagnosis): Promise<void> {
    try {
      const dir = this.getDiagnosisDir();
      await fs.promises.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${runId}.json`);

      let store: Record<string, AIDiagnosis> = {};
      try {
        if (fs.existsSync(filePath)) {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          store = JSON.parse(content);
        }
      } catch {
        store = {};
      }

      store[testId] = diagnosis;
      await fs.promises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
      this.log.debug(`Diagnosis persisted for runId=${runId}, testId=${testId}`);
    } catch (error) {
      this.log.warn(
        `Failed to persist diagnosis: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async loadDiagnosis(runId: string, testId: string): Promise<AIDiagnosis | null> {
    try {
      const filePath = path.join(this.getDiagnosisDir(), `${runId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const store = JSON.parse(content) as Record<string, AIDiagnosis>;
      return store[testId] || null;
    } catch (error) {
      this.log.warn(
        `Failed to load persisted diagnosis: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  async saveClusterResult(runId: string, clusters: unknown[]): Promise<void> {
    try {
      const dir = this.getDiagnosisDir();
      await fs.promises.mkdir(dir, { recursive: true });
      const filePath = path.join(dir, `${runId}-clusters.json`);
      await fs.promises.writeFile(filePath, JSON.stringify(clusters, null, 2), 'utf-8');
      this.log.debug(`Cluster result persisted for runId=${runId}`);
    } catch (error) {
      this.log.warn(
        `Failed to persist cluster result: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async loadClusterResult(runId: string): Promise<unknown[] | null> {
    try {
      const filePath = path.join(this.getDiagnosisDir(), `${runId}-clusters.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return JSON.parse(content) as unknown[];
    } catch (error) {
      this.log.warn(
        `Failed to load persisted cluster result: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
  async diagnoseWithHeal(
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
    lang: string = 'zh',
    runId?: string,
    testId?: string,
    rootCause?: RootCauseAnalysis
  ): Promise<AIDiagnosis> {
    const diagnosis = await this.diagnose(testInfo, lang, runId, testId, rootCause);

    if (
      this.config.enabled &&
      diagnosis.confidence >= 0.5 &&
      testInfo.filePath &&
      (diagnosis.category === 'selector' ||
        diagnosis.category === 'assertion' ||
        diagnosis.category === 'timeout')
    ) {
      try {
        const { AgentService } = await import('../agents');
        const agentService = new AgentService(this.dataDir, { autoHeal: false }, this.config);
        const healResult = await agentService.heal(testInfo.filePath, {
          runId,
          testId,
          error: testInfo.error,
          stackTrace: testInfo.stackTrace,
        });

        if (healResult.success && healResult.data && healResult.data.patches.length > 0) {
          diagnosis.healerPatch = healResult.data.patches[0];
        }
      } catch (error) {
        this.log.warn(
          `Healer integration failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return diagnosis;
  }
}
