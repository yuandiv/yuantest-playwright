import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import {
  LLMConfig,
  AIDiagnosis,
  LLMStatus,
  ReasoningStep,
  ContextUsed,
  CodeDiff,
  DocLink,
} from '../types';
import { matchPatterns, buildFewShotExamples, ErrorPattern } from './knowledge-base';
import {
  enrichContext,
  EnrichedContext,
  readSourceCode,
  encodeScreenshot,
} from './context-enricher';
import { clusterFailures, FailureCluster } from './cluster';

/** 缓存条目接口 */
interface CacheEntry {
  result: AIDiagnosis;
  timestamp: number;
}

/** LLM 工具调用返回的函数调用信息 */
interface ToolCallInfo {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

/** callLLMWithTools 的消息内容类型 */
type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

/** callLLMWithTools 的消息类型 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent | null;
  tool_call_id?: string;
  tool_calls?: ToolCallInfo[];
}

/** Agent 循环的最大工具调用轮数 */
const MAX_AGENT_ROUNDS = 5;

/** 默认 LLM 配置 */
const DEFAULT_CONFIG: LLMConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  model: '',
  remark: '',
  maxTokens: 2048,
  temperature: 0.3,
};

/** 缓存最大条目数 */
const CACHE_MAX_SIZE = 100;

/** 缓存过期时间（毫秒） */
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * OpenAI function calling 格式的工具定义 schema
 * 包含 4 个工具：read_source_file、search_codebase、query_test_history、read_screenshot
 */
const TOOL_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_source_file',
      description: 'Read source code from a file path, optionally specifying line range',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
          startLine: { type: 'number', description: 'Start line number (optional)' },
          endLine: { type: 'number', description: 'End line number (optional)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_codebase',
      description: 'Search for a pattern in the codebase files',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex or string)' },
          filePattern: { type: 'string', description: 'File glob pattern to filter (optional)' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_test_history',
      description: 'Query historical test run records for a specific test',
      parameters: {
        type: 'object',
        properties: {
          testId: { type: 'string', description: 'Test ID to query' },
          limit: { type: 'number', description: 'Maximum number of records to return (default 5)' },
        },
        required: ['testId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_screenshot',
      description: 'Read the failure screenshot for a test (returns base64 encoded image)',
      parameters: {
        type: 'object',
        properties: {
          testId: { type: 'string', description: 'Test ID to get screenshot for' },
        },
        required: ['testId'],
      },
    },
  },
];

export class DiagnosisService {
  private dataDir: string;
  private config: LLMConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private log = logger.child('DiagnosisService');

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    try {
      this.config = this.loadConfig();
    } catch {
      this.config = { ...DEFAULT_CONFIG };
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
   * 获取当前 LLM 配置的副本（用于外部读取）
   * @returns LLM 配置对象的浅拷贝
   */
  getMaskedConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * 调用 LLM API（基础版本，仅支持 system + user 消息）
   * @param prompt - 包含 system 和 user 的提示对象
   * @param config - LLM 配置
   * @returns LLM 返回的文本内容
   */
  private async callLLM(
    prompt: { system: string; user: string },
    config: LLMConfig
  ): Promise<string> {
    const url = `${config.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature,
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

  /**
   * 调用 LLM API（支持 tools 参数和完整消息列表，用于 Agent 循环）
   * 当 LLM 支持 function calling 时，返回可能包含 tool_calls
   * 当 LLM 不支持或直接给出最终答案时，仅返回 content
   * @param messages - 完整的聊天消息列表
   * @param config - LLM 配置
   * @param tools - 可选的工具定义 schema 列表
   * @returns 包含 content 和可选 toolCalls 的响应对象
   */
  private async callLLMWithTools(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: typeof TOOL_SCHEMAS
  ): Promise<{ content: string | null; toolCalls?: ToolCallInfo[] }> {
    const url = `${config.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: {
          message?: {
            content?: string | null;
            tool_calls?: ToolCallInfo[];
          };
        }[];
      };

      const message = data.choices?.[0]?.message;
      return {
        content: message?.content ?? null,
        toolCalls: message?.tool_calls,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 流式调用 LLM API，逐块返回生成内容
   * @param prompt - 包含 system 和 user 的提示对象
   * @param config - LLM 配置
   * @yields 逐块的文本内容片段
   */
  async *callLLMStream(
    prompt: { system: string; user: string },
    config: LLMConfig
  ): AsyncGenerator<string, void, unknown> {
    const url = `${config.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine === 'data: [DONE]') {
            continue;
          }
          if (!trimmedLine.startsWith('data: ')) {
            continue;
          }

          const jsonStr = trimmedLine.slice(6);
          try {
            const data = JSON.parse(jsonStr);
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 执行 Agent 工具调用
   * 根据 toolName 分发到不同的工具实现，返回工具执行结果字符串
   * @param toolName - 工具名称
   * @param args - 工具调用参数
   * @returns 工具执行结果的字符串表示
   */
  private async executeToolCall(toolName: string, args: Record<string, unknown>): Promise<string> {
    try {
      switch (toolName) {
        case 'read_source_file': {
          const filePath = args.path as string;
          const startLine = args.startLine as number | undefined;
          const result = await readSourceCode(filePath, startLine);
          return result ?? `File not found or unable to read: ${filePath}`;
        }
        case 'search_codebase': {
          const pattern = args.pattern as string;
          const filePattern = args.filePattern as string | undefined;
          const cwd = process.cwd();
          const results: string[] = [];

          const searchDir = (dir: string, depth: number = 0) => {
            if (depth > 8 || results.length >= 20) {
              return;
            }
            try {
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const entry of entries) {
                if (results.length >= 20) {
                  break;
                }
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                  continue;
                }
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                  searchDir(fullPath, depth + 1);
                } else if (entry.isFile()) {
                  if (filePattern && !entry.name.match(filePattern.replace(/\*/g, '.*'))) {
                    continue;
                  }
                  try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const lines = content.split('\n');
                    for (let i = 0; i < lines.length; i++) {
                      if (results.length >= 20) {
                        break;
                      }
                      if (lines[i].includes(pattern)) {
                        results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                      }
                    }
                  } catch {
                    // Skip unreadable files
                  }
                }
              }
            } catch {
              // Skip inaccessible directories
            }
          };

          searchDir(cwd);
          return results.length > 0
            ? results.join('\n')
            : `No matches found for pattern: ${pattern}`;
        }
        case 'query_test_history': {
          const testId = args.testId as string;
          const limit = (args.limit as number) || 5;
          const historyPath = path.join(this.dataDir, 'history.json');

          try {
            if (!fs.existsSync(historyPath)) {
              return `No history file found at: ${historyPath}`;
            }
            const content = fs.readFileSync(historyPath, 'utf-8');
            const historyData = JSON.parse(content) as Array<{
              testId?: string;
              title?: string;
              status: string;
              error?: string;
              timestamp: number;
            }>;

            const records = historyData
              .filter((record) => record.testId === testId || record.title === testId)
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, limit);

            if (records.length === 0) {
              return `No history records found for test: ${testId}`;
            }

            return records
              .map(
                (record, index) =>
                  `[${index + 1}] ${new Date(record.timestamp).toISOString()} - Status: ${record.status}${record.error ? `, Error: ${record.error}` : ''}`
              )
              .join('\n');
          } catch (error) {
            return `Failed to read history: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        case 'read_screenshot': {
          const testId = args.testId as string;
          const screenshotsDir = path.join(this.dataDir, 'screenshots');

          try {
            if (!fs.existsSync(screenshotsDir)) {
              return `Screenshots directory not found: ${screenshotsDir}`;
            }

            const entries = fs.readdirSync(screenshotsDir);
            const matchedFiles = entries.filter(
              (name) => name.includes(testId) && (name.endsWith('.png') || name.endsWith('.jpg'))
            );

            if (matchedFiles.length === 0) {
              return `No screenshot found for test: ${testId}`;
            }

            const screenshotPath = path.join(screenshotsDir, matchedFiles[0]);
            const base64 = await encodeScreenshot([screenshotPath]);
            return base64
              ? `[Screenshot available as base64, length: ${base64.length}]`
              : `Failed to encode screenshot: ${screenshotPath}`;
          } catch (error) {
            return `Failed to read screenshot: ${error instanceof Error ? error.message : String(error)}`;
          }
        }
        default:
          return `Unknown tool: ${toolName}`;
      }
    } catch (error) {
      return `Tool execution error (${toolName}): ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Agent 多轮推理循环
   * 首先尝试带 tools 参数调用 LLM，如果 LLM 支持 function calling 则进入工具调用循环，
   * 最多执行 MAX_AGENT_ROUNDS 轮；如果不支持则自动降级为单次调用模式
   * @param prompt - 包含 system 和 user 的提示对象
   * @param config - LLM 配置
   * @param screenshotBase64 - 可选的截图 base64 编码
   * @returns 包含响应文本、推理步骤和分析模式的结果对象
   */
  private async agentLoop(
    prompt: { system: string; user: string },
    config: LLMConfig,
    screenshotBase64?: string
  ): Promise<{
    responseText: string;
    reasoningSteps: ReasoningStep[];
    analysisMode: 'agent' | 'single' | 'fallback';
  }> {
    const reasoningSteps: ReasoningStep[] = [];

    const userContent: MessageContent = screenshotBase64
      ? [
          { type: 'text', text: prompt.user },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${screenshotBase64}` },
          },
        ]
      : prompt.user;

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt.system },
      { role: 'user', content: userContent },
    ];

    try {
      const firstResponse = await this.callLLMWithTools(messages, config, TOOL_SCHEMAS);

      if (!firstResponse.toolCalls || firstResponse.toolCalls.length === 0) {
        const content = firstResponse.content || '';
        if (!content && !firstResponse.toolCalls) {
          this.log.info('LLM does not support tool_calling, falling back to single call mode');
          const fallbackText = await this.callLLM(prompt, config);
          return { responseText: fallbackText, reasoningSteps: [], analysisMode: 'single' };
        }
        return { responseText: content, reasoningSteps: [], analysisMode: 'single' };
      }

      let currentToolCalls = firstResponse.toolCalls;
      let round = 0;

      while (currentToolCalls && currentToolCalls.length > 0 && round < MAX_AGENT_ROUNDS) {
        round++;

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: firstResponse.content ?? null,
          tool_calls: currentToolCalls,
        };
        messages.push(assistantMessage);

        for (const toolCall of currentToolCalls) {
          const step: ReasoningStep = {
            step: round,
            tool: toolCall.function.name,
            input: toolCall.function.arguments,
            thought: `Calling tool: ${toolCall.function.name}`,
          };

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            args = {};
          }

          const toolResult = await this.executeToolCall(toolCall.function.name, args);
          step.output = toolResult.slice(0, 500);
          reasoningSteps.push(step);

          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        }

        const nextResponse = await this.callLLMWithTools(messages, config, TOOL_SCHEMAS);

        if (!nextResponse.toolCalls || nextResponse.toolCalls.length === 0) {
          return {
            responseText: nextResponse.content || '',
            reasoningSteps,
            analysisMode: 'agent',
          };
        }

        currentToolCalls = nextResponse.toolCalls;
      }

      const finalResponse = await this.callLLMWithTools(messages, config);
      return {
        responseText: finalResponse.content || '',
        reasoningSteps,
        analysisMode: 'agent',
      };
    } catch (error) {
      this.log.warn(
        `Agent loop failed, falling back to single call: ${error instanceof Error ? error.message : String(error)}`
      );
      const fallbackText = await this.callLLM(prompt, config);
      return { responseText: fallbackText, reasoningSteps: [], analysisMode: 'single' };
    }
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
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  /**
   * 将诊断结果存入缓存（LRU 淘汰策略）
   * @param key - 缓存键
   * @param result - 诊断结果
   */
  private setCache(key: string, result: AIDiagnosis): void {
    if (this.cache.size >= CACHE_MAX_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * 执行 AI 诊断（重构版，支持上下文富集、知识库匹配、多轮推理和置信度校准）
   * 新流程：enrichContext → matchPatterns → buildEnrichedPrompt → agentLoop → parseResponse → calibrateConfidence
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
    lang: string = 'zh'
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

    try {
      const context = await enrichContext(testInfo, this.dataDir);

      const patterns = matchPatterns(testInfo.error || '');

      const prompt = this.buildEnrichedPrompt(context, patterns, testInfo, lang);

      const { responseText, reasoningSteps, analysisMode } = await this.agentLoop(
        prompt,
        this.config,
        prompt.screenshotBase64
      );

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
   * 流式执行 AI 诊断（重构版，支持上下文富集和置信度校准）
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
    lang: string = 'zh'
  ): AsyncGenerator<string, void, unknown> {
    if (!this.config.enabled) {
      const errorMsg = lang === 'zh' ? 'AI 诊断未启用' : 'AI diagnosis is not enabled';
      yield JSON.stringify({ error: errorMsg, type: 'error' });
      return;
    }

    try {
      yield JSON.stringify({ type: 'start', testTitle: testInfo.title }) + '\n';

      const context = await enrichContext(testInfo, this.dataDir);

      const patterns = matchPatterns(testInfo.error || '');

      const prompt = this.buildEnrichedPrompt(context, patterns, testInfo, lang);

      let fullResponse = '';

      for await (const chunk of this.callLLMStream(prompt, this.config)) {
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
   * 测试 LLM 连接是否正常
   * @param config - 可选的 LLM 配置，不传则使用当前配置
   * @returns 连接测试结果，包含 success 和可选的 error 信息
   */
  async testConnection(config?: LLMConfig): Promise<{ success: boolean; error?: string }> {
    const testConfig = config || this.config;
    try {
      const url = `${testConfig.baseUrl}/v1/models`;
      const headers: Record<string, string> = {};
      if (testConfig.apiKey) {
        headers['Authorization'] = `Bearer ${testConfig.apiKey}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            success: false,
            error: `API returned ${response.status}: ${response.statusText}`,
          };
        }
        return { success: true };
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
  clearCache(): void {
    this.cache.clear();
  }
}
