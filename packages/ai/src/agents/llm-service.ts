import { LLMConfig, ReasoningStep } from '@yuantest/contracts';
import { logger } from '@yuantest/core';
import { TokenBudget } from './token-budget';
import type { EventEmitter } from 'events';
import {
  AGENT_EVENT,
  AgentToken,
  AgentThinking,
  AgentToolCall,
  AgentToolResult,
  AgentDone,
  AgentError,
} from './agent-events';

export interface LLMChatOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
  timeout?: number;
  /** 外部取消信号（如 SSE 客户端断开），中止 LLM 请求 */
  signal?: AbortSignal;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMChatResult {
  content: string;
  finishReason?: string;
  usage?: TokenUsage;
}

export interface ToolCallInfo {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: string;
  };
}

type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent | null;
  tool_call_id?: string;
  tool_calls?: ToolCallInfo[];
}

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const DEFAULT_TIMEOUT = 120000;
const MAX_AGENT_ROUNDS = 30;
/**
 * 工具结果回灌 LLM 的最大字符数。
 * 超出部分截断并追加提示，避免页面快照/大结果导致上下文随轮次 O(n²) 膨胀。
 */
const MAX_TOOL_RESULT_CHARS = 3000;
/**
 * 截断时保留的头部/尾部字符数（头+尾合计不超过 MAX_TOOL_RESULT_CHARS）。
 * 与纯前截断相比，头尾双保留能让 LLM 同时看到页面快照的结构起始与结尾，
 * 避免"只看到开头、中段核心结构永远缺失"导致的反复重试。
 */
const MAX_TOOL_RESULT_HEAD = 2000;
const MAX_TOOL_RESULT_TAIL = 1000;
/**
 * 截断标记文案（条件引导，非"禁止重试"）：
 * - 明确"以相同参数重复调用无益"，切断原样重试的死循环诱因；
 * - 保留"改变前置状态后重试"（滚动/展开/点击后重拍）的合法性；
 * - 引导改用 browser_evaluate 提取结构化摘要。
 */
const TOOL_RESULT_TRUNCATION_HINT =
  '\n...(结果过长已截断，已保留开头与结尾；以相同参数重复调用不会获得新内容，请基于现有信息继续分析，或先滚动/展开/点击后再调用，或用 browser_evaluate 提取结构化摘要)';
/**
 * 单次 Agent Loop 允许的最大工具调用次数（含首次模型响应触发的工具调用）。
 * 超限后清空 tools 数组，强制模型给出最终文本响应，防止死循环烧 Token。
 * 可通过环境变量 AGENT_MAX_TOOL_CALLS 覆盖。
 */
const DEFAULT_MAX_TOOL_CALLS = (() => {
  const envValue = parseInt(process.env.AGENT_MAX_TOOL_CALLS ?? '', 10);
  return !isNaN(envValue) && envValue > 0 ? envValue : 10;
})();
/**
 * 单次 Agent Loop 允许的最大累计 total tokens。
 * 超限后强制收尾，防止异常情况下 Token 失控。
 * 可通过环境变量 AGENT_MAX_TOTAL_TOKENS 覆盖。
 */
const DEFAULT_MAX_TOTAL_TOKENS = (() => {
  const envValue = parseInt(process.env.AGENT_MAX_TOTAL_TOKENS ?? '', 10);
  return !isNaN(envValue) && envValue > 0 ? envValue : 100_000;
})();

/** 流式 chatWithTools 事件类型 */
export type ToolsStreamEvent =
  | { type: 'content_delta'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_calls'; toolCalls: ToolCallInfo[]; thinkingContent?: string | null }
  | {
      type: 'done';
      content: string;
      thinkingContent: string | null;
      usage?: TokenUsage;
      truncated?: boolean;
    };

/** 流式 Agent Loop 事件类型 */
export type AgentLoopStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'thinking'; data: string }
  | { type: 'tool_call'; data: { name: string; arguments: string } }
  | { type: 'tool_running'; data: { name: string } }
  | { type: 'tool_result'; data: { name: string; result: string } }
  | {
      type: 'done';
      data: {
        content: string;
        thinkingContent: string | null;
        analysisMode: 'agent' | 'single' | 'fallback';
        reasoningSteps: ReasoningStep[];
        totalUsage?: TokenUsage;
        truncated?: boolean;
      };
    };

interface RawAPIResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      finish_reason?: string;
      tool_calls?: ToolCallInfo[];
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/** 从 content 中解析 <think>...</think> 标签，返回清理后的内容和思考内容 */
function parseThinkingTags(content: string): {
  cleanContent: string;
  thinkingContent: string | null;
} {
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thinkingParts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = thinkRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      thinkingParts.push(match[1].trim());
    }
  }

  if (thinkingParts.length === 0) {
    return { cleanContent: content, thinkingContent: null };
  }

  let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // 容错：未闭合的 <think> 标签（模型输出中断等场景），剩余内容按思考处理，避免泄漏到正文
  const unclosedIdx = cleanContent.lastIndexOf('<think>');
  if (unclosedIdx !== -1) {
    const rest = cleanContent.slice(unclosedIdx + '<think>'.length).trim();
    if (rest) {
      thinkingParts.push(rest);
    }
    cleanContent = cleanContent.slice(0, unclosedIdx).trim();
  }

  return { cleanContent, thinkingContent: thinkingParts.join('\n') };
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/**
 * 实时拆分流式 content 增量中的 <think>...</think> 标签。
 * - 标签外文本 → content（正常正文）
 * - 标签内文本 → thinking（思考过程）
 * - 若缓冲区尾部是标签的部分前缀（跨 chunk 截断），保留在 rest 中待下一 chunk 续接
 */
function splitThinkChunks(
  buffer: string,
  inThink: boolean
): { content: string; thinking: string; rest: string; inThink: boolean } {
  let content = '';
  let thinking = '';
  let i = 0;

  while (i < buffer.length) {
    if (!inThink) {
      const idx = buffer.indexOf(THINK_OPEN, i);
      if (idx === -1) {
        const tail = buffer.slice(i);
        const hold = partialPrefixLen(tail, THINK_OPEN);
        if (hold > 0) {
          content += tail.slice(0, tail.length - hold);
          return { content, thinking, rest: tail.slice(-hold), inThink: false };
        }
        content += tail;
        return { content, thinking, rest: '', inThink: false };
      }
      content += buffer.slice(i, idx);
      i = idx + THINK_OPEN.length;
      inThink = true;
    } else {
      const idx = buffer.indexOf(THINK_CLOSE, i);
      if (idx === -1) {
        const tail = buffer.slice(i);
        const hold = partialPrefixLen(tail, THINK_CLOSE);
        if (hold > 0) {
          thinking += tail.slice(0, tail.length - hold);
          return { content, thinking, rest: tail.slice(-hold), inThink: true };
        }
        thinking += tail;
        return { content, thinking, rest: '', inThink: true };
      }
      thinking += buffer.slice(i, idx);
      i = idx + THINK_CLOSE.length;
      inThink = false;
    }
  }

  return { content, thinking, rest: '', inThink };
}

/** tail 尾部是否为 tag 的部分前缀（跨 chunk 截断检测），返回需要保留的长度 */
function partialPrefixLen(tail: string, tag: string): number {
  const max = Math.min(tail.length, tag.length - 1);
  for (let len = max; len >= 1; len--) {
    if (tag.startsWith(tail.slice(-len))) {
      return len;
    }
  }
  return 0;
}

/**
 * 构建一轮 Agent Loop 的消息数组。
 * 从 baseMessages 出发，追加推理步骤 + 当前轮的 assistant 消息。
 */
function buildRoundMessages(
  baseMessages: LLMChatMessage[],
  reasoningSteps: ReasoningStep[],
  currentContent: string | null,
  currentToolCalls: ToolCallInfo[]
): LLMChatMessage[] {
  const msgs: LLMChatMessage[] = [...baseMessages];

  for (const step of reasoningSteps) {
    msgs.push({
      role: 'assistant',
      content: step.thought || null,
      tool_calls: [
        {
          id: `round_${step.step}`,
          type: 'function',
          function: { name: step.tool || '', arguments: step.input || '' },
        },
      ],
    });
    if (step.output) {
      msgs.push({
        role: 'tool',
        content: step.output,
        tool_call_id: `round_${step.step}`,
      });
    }
  }

  msgs.push({
    role: 'assistant',
    content: currentContent,
    tool_calls: currentToolCalls?.map((tc) => ({
      ...tc,
      type: tc.type || 'function',
    })),
  });

  return msgs;
}

/**
 * 参数稳定序列化：排序键后再 JSON.stringify，使"同一工具+同一参数"在不同调用间
 * 产生一致的 key（无论模型返回的参数键顺序是否变化），用于重复调用防护判重。
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export class LLMService {
  private config: LLMConfig;
  private log = logger.child('LLMService');
  /**
   * 嵌套调用预算栈：工具执行期间（agent_generate 等嵌套调用 LLM）由
   * chatWithAgentLoopStream 将外层 TokenBudget 压栈，chat()/chatWithToolsStream
   * 结束时自动将 usage 累加到栈顶预算，使嵌套调用 token 计入外层配额。
   */
  private budgetStack: TokenBudget[] = [];

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** 将预算压栈（工具执行开始时调用） */
  pushBudget(budget: TokenBudget): void {
    this.budgetStack.push(budget);
  }

  /** 弹出预算（工具执行结束时调用） */
  popBudget(): void {
    this.budgetStack.pop();
  }

  /** 将 usage 累加到栈顶预算（嵌套调用结束时调用） */
  private accumulateNestedUsage(usage?: TokenUsage): void {
    if (!usage) {
      return;
    }
    const top = this.budgetStack[this.budgetStack.length - 1];
    top?.accumulate(usage);
  }

  updateConfig(config: LLMConfig): void {
    this.config = config;
  }

  getConfig(): LLMConfig {
    return this.config;
  }

  private buildURL(config: LLMConfig): string {
    return `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private buildHeaders(config: LLMConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  private extractUsage(data: RawAPIResponse): TokenUsage | undefined {
    return data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined;
  }

  /** 休眠辅助方法 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 带重试机制的 fetch 调用
   * - 仅对 5xx 服务端错误和网络异常重试，最多 3 次
   * - 4xx 客户端错误、AbortError（超时）不重试
   * - 指数退避：1s → 2s → 4s
   * - 每次重试都打印错误详情
   */
  private async fetchWithRetry(
    config: LLMConfig,
    body: Record<string, unknown>,
    timeoutMs?: number,
    retries: number = 5,
    signal?: AbortSignal
  ): Promise<Response> {
    // 超时优先级：显式传入 > 配置（推理型模型可按需调大）> 默认 120s
    const timeout = timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT;
    const url = this.buildURL(config);
    const headers = this.buildHeaders(config);

    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      // 合并外部取消信号（SSE 客户端断开）与内部超时，任一触发即中止请求
      const combinedSignal = signal
        ? AbortSignal.any([controller.signal, signal])
        : controller.signal;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: combinedSignal,
        });

        if (!response.ok) {
          const errorBody = !response.bodyUsed ? await response.text().catch(() => '') : '';
          const errorMsg = `LLM API returned ${response.status}: ${response.statusText}${
            errorBody ? `\nDetail: ${errorBody.slice(0, 500)}` : ''
          }`;

          // 4xx 客户端错误不重试，直接抛出
          if (response.status < 500) {
            this.log.error(`[LLM] 请求失败 (4xx, 不重试): ${errorMsg}`);
            throw new Error(errorMsg);
          }

          // 5xx 服务端错误，尝试重试
          if (attempt < retries) {
            this.log.warn(
              `[LLM] 服务端错误 ${response.status}, 正在重试 (${attempt}/${retries})...\n${errorMsg}`
            );
            await this.sleep(1000 * Math.pow(2, attempt - 1));
            continue;
          }

          this.log.error(`[LLM] 服务端错误，重试已达上限 (${retries}/${retries}): ${errorMsg}`);
          throw new Error('模型服务异常，请稍后重试');
        }

        return response;
      } catch (error) {
        // 区分外部取消（客户端断开）与内部超时，避免误报为"请求超时"
        if (error instanceof Error && error.name === 'AbortError') {
          if (signal?.aborted) {
            const msg = 'LLM API 请求已取消（客户端断开连接）';
            this.log.warn(`[LLM] ${msg}`);
            throw new Error(msg, { cause: error });
          }
          const msg = `LLM API 请求超时 (${timeout}ms, model: ${config.model})`;
          this.log.error(`[LLM] ${msg}`);
          throw new Error(msg, { cause: error });
        }

        // 网络异常可重试
        if (attempt < retries) {
          this.log.warn(
            `[LLM] 请求异常, 正在重试 (${attempt}/${retries}): ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          await this.sleep(1000 * Math.pow(2, attempt - 1));
          continue;
        }

        this.log.error(
          `[LLM] 请求异常，重试已达上限 (${retries}/${retries}): ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        throw error;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error('Unexpected: fetchWithRetry completed without returning or throwing');
  }

  private async callAPI(
    config: LLMConfig,
    body: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal
  ): Promise<RawAPIResponse> {
    const response = await this.fetchWithRetry(config, body, timeoutMs, undefined, signal);
    return (await response.json()) as RawAPIResponse;
  }

  /**
   * 验证 LLM API 连接是否可达。
   * 与 chat() 不同，此方法仅检查 HTTP 层面的连通性（URL、API Key、模型名是否有效），
   * 不依赖模型返回的具体内容。适用于连接测试场景。
   */
  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 1,
    };
    try {
      await this.callAPI(this.config, body, 15000);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  async chat(options: LLMChatOptions): Promise<LLMChatResult> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
      max_tokens: options.maxTokens ?? this.config.maxTokens,
      temperature: options.temperature ?? this.config.temperature ?? 0.2,
    };
    if (this.config.chatTemplateKwargs && !options.responseFormat) {
      body.chat_template_kwargs = { enable_thinking: true };
    }
    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    const data = await this.callAPI(this.config, body, options.timeout, options.signal);
    const choice = data.choices?.[0];
    const rawContent = choice?.message?.content;
    const reasoningContent = choice?.message?.reasoning_content;

    // 统一 think 处理（与 chatWithToolsStream / chatWithTools 一致）：
    // - content 中的 <think>...</think> 标签剥离，避免思考内容混入正文
    //   （如代码生成路径曾把思考内容当代码保存）
    // - 模型开启推理模式时 content 可能为空，回退到 reasoning_content（诊断等场景）
    let content = rawContent ? parseThinkingTags(rawContent).cleanContent : '';
    if (!content && reasoningContent) {
      content = reasoningContent;
    }
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    if (choice?.finish_reason === 'length') {
      this.log.warn(
        `LLM response was truncated (finish_reason=length). Consider increasing maxTokens. Current: ${options.maxTokens ?? this.config.maxTokens}`
      );
    }

    // 若处于工具嵌套调用中，将本次 usage 累加到外层 TokenBudget
    this.accumulateNestedUsage(this.extractUsage(data));

    return {
      content,
      finishReason: choice?.finish_reason,
      usage: this.extractUsage(data),
    };
  }

  async chatWithTools(
    messages: LLMChatMessage[],
    config: LLMConfig,
    tools?: ToolSchema[],
    responseFormat?: { type: string }
  ): Promise<{
    content: string | null;
    thinkingContent: string | null;
    toolCalls?: ToolCallInfo[];
    usage?: TokenUsage;
    truncated?: boolean;
  }> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    };

    if (config.chatTemplateKwargs && !responseFormat) {
      body.chat_template_kwargs = { enable_thinking: true };
    }

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const data = await this.callAPI(config, body);
    const finishReason = data.choices?.[0]?.finish_reason;
    const message = data.choices?.[0]?.message;

    // 优先从 reasoning_content 字段提取思考内容
    let thinkingContent: string | null = message?.reasoning_content ?? null;
    let content = message?.content ?? null;

    // 兼容：从 content 中解析 <think>...</think> 标签
    if (content) {
      const parsed = parseThinkingTags(content);
      content = parsed.cleanContent || null;
      if (!thinkingContent && parsed.thinkingContent) {
        thinkingContent = parsed.thinkingContent;
      }
    }

    return {
      content,
      thinkingContent,
      toolCalls: message?.tool_calls,
      usage: this.extractUsage(data),
      truncated: finishReason === 'length',
    };
  }

  async *chatStream(
    prompt: { system: string; user: string },
    config: LLMConfig,
    responseFormat?: { type: string }
  ): AsyncGenerator<string, void, unknown> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    };
    if (config.chatTemplateKwargs && !responseFormat) {
      body.chat_template_kwargs = { enable_thinking: true };
    }
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await this.fetchWithRetry(config, body);

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
          // skip invalid JSON
        }
      }
    }
  }

  async *chatWithToolsStream(
    messages: LLMChatMessage[],
    config: LLMConfig,
    tools?: ToolSchema[],
    responseFormat?: { type: string },
    signal?: AbortSignal
  ): AsyncGenerator<ToolsStreamEvent, void, unknown> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    };

    if (config.chatTemplateKwargs && !responseFormat) {
      body.chat_template_kwargs = { enable_thinking: true };
    }

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await this.fetchWithRetry(config, body, undefined, undefined, signal);

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // 累积状态
    let fullContent = '';
    let fullThinking: string | null = null;
    // 实时 <think> 标签拆分状态（跨 chunk 维护）
    let pendingBuffer = '';
    let inThinkTag = false;
    // 追加思考内容（去重：跳过与已累积内容相同的片段，避免 reasoning_content 与 content 中 <think> 重复）
    const appendThinking = (segment: string): boolean => {
      const trimmed = segment.trim();
      if (!trimmed) {
        return false;
      }
      if (fullThinking && fullThinking.includes(trimmed)) {
        return false;
      }
      fullThinking = fullThinking ? fullThinking + '\n' + trimmed : trimmed;
      return true;
    };
    let lastFinishReason: string | undefined;
    const toolCallMap = new Map<
      number,
      { id: string; type: string; name: string; arguments: string }
    >();
    let lastUsage: TokenUsage | undefined;

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
          const delta = data.choices?.[0]?.delta;

          if (data.choices?.[0]?.finish_reason) {
            lastFinishReason = data.choices[0].finish_reason;
          }

          if (!delta) {
            continue;
          }

          // 内容增量：实时拆分 <think>...</think> 标签，标签外文本作为正文、标签内文本作为思考
          if (delta.content) {
            pendingBuffer += delta.content;
            while (pendingBuffer.length > 0) {
              const res = splitThinkChunks(pendingBuffer, inThinkTag);
              // 整个缓冲区都是标签前缀（等待跨 chunk 续接），暂时不做处理
              if (!res.content && !res.thinking && res.rest.length === pendingBuffer.length) {
                break;
              }
              pendingBuffer = res.rest;
              inThinkTag = res.inThink;
              if (res.content) {
                fullContent += res.content;
                yield { type: 'content_delta', content: res.content };
              }
              if (res.thinking) {
                if (appendThinking(res.thinking)) {
                  yield { type: 'thinking_delta', content: res.thinking };
                }
              }
            }
          }

          // 思考内容增量
          if (delta.reasoning_content) {
            fullThinking = fullThinking
              ? fullThinking + delta.reasoning_content
              : delta.reasoning_content;
            yield { type: 'thinking_delta', content: delta.reasoning_content };
          }

          // 工具调用增量（按 index 累积）
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls as Array<{
              index?: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>) {
              const idx = tc.index ?? 0;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id || '',
                  type: tc.type || 'function',
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                });
              } else {
                const existing = toolCallMap.get(idx);
                if (!existing) {
                  continue;
                }
                if (tc.id) {
                  existing.id = tc.id;
                }
                if (tc.type) {
                  existing.type = tc.type;
                }
                if (tc.function?.name) {
                  existing.name += tc.function.name;
                }
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
              }
            }
          }

          // 提取 usage（某些 API 在最后一个 chunk 中返回）
          if (data.usage) {
            lastUsage = {
              promptTokens: data.usage.prompt_tokens ?? 0,
              completionTokens: data.usage.completion_tokens ?? 0,
              totalTokens: data.usage.total_tokens ?? 0,
            };
          }
        } catch {
          // skip invalid JSON
        }
      }
    }

    // 流结束：冲刷残留缓冲区（未闭合的 <think> 标签按思考处理，避免泄漏到正文）
    if (pendingBuffer) {
      if (inThinkTag) {
        appendThinking(pendingBuffer);
      } else {
        fullContent += pendingBuffer;
      }
      pendingBuffer = '';
      inThinkTag = false;
    }

    // 兜底：若 fullContent 中仍残留 <think> 标签（极端情况），剥离并补入思考内容
    if (fullContent) {
      const parsed = parseThinkingTags(fullContent);
      if (parsed.thinkingContent) {
        appendThinking(parsed.thinkingContent);
        fullContent = parsed.cleanContent;
      }
    }

    // 若处于工具嵌套调用中，将本次流式调用 usage 累加到外层 TokenBudget
    this.accumulateNestedUsage(lastUsage);

    // 流结束，判断是否有工具调用
    if (toolCallMap.size > 0) {
      const toolCalls: ToolCallInfo[] = [];
      for (const [_, tc] of toolCallMap) {
        toolCalls.push({
          id: tc.id,
          type: tc.type || 'function',
          function: { name: tc.name, arguments: tc.arguments },
        });
      }
      yield { type: 'tool_calls', toolCalls, thinkingContent: fullThinking };
    } else {
      yield {
        type: 'done',
        content: fullContent,
        thinkingContent: fullThinking,
        usage: lastUsage,
        truncated: lastFinishReason === 'length',
      };
    }
  }

  async *chatWithAgentLoopStream(
    prompt: { system: string; user: string; history?: LLMChatMessage[] },
    config: LLMConfig,
    tools?: ToolSchema[],
    screenshotBase64?: string,
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<string>,
    responseFormat?: { type: string },
    /**
     * 单次 Agent Loop 允许的最大工具调用次数（含首次）。
     * 超限后清空 tools 数组，强制模型给出最终文本响应。
     * 默认值由环境变量 AGENT_MAX_TOOL_CALLS 控制，回退到 10。
     */
    maxToolCalls: number = DEFAULT_MAX_TOOL_CALLS,
    /**
     * Phase D — 事件流与可观测性：可选的 EventEmitter 事件总线。
     * 调用方注入 BaseAgent.getEventBus()，本方法在 yield 前同时 emit agent.* 事件，
     * 供 UI / 遥测 / 日志层订阅，与 Agent 主流程解耦。
     * 不传则仅按原有 AgentLoopStreamEvent 流式返回，行为不变。
     */
    eventBus?: EventEmitter,
    /** 关联的会话 id（透传到事件载荷，便于 UI 关联） */
    sessionId?: string,
    /** 外部取消信号（如 SSE 客户端断开），中止 agent loop 及内部 LLM 请求 */
    signal?: AbortSignal
  ): AsyncGenerator<AgentLoopStreamEvent, void, unknown> {
    const agentName = 'AgentLoop'; // llm-service 无 agentName 概念，用固定标识
    /** 安全 emit：吞掉 listener 异常，避免污染主流程 */
    const safeEmit = (eventName: string, payload: unknown) => {
      if (!eventBus) return;
      try {
        eventBus.emit(eventName, payload);
      } catch (err) {
        this.log.warn(
          `emit ${eventName} listener failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    };
    const reasoningSteps: ReasoningStep[] = [];
    let accPrompt = 0;
    // 最近一次成功执行的工具完整结果（synthesizeFinalContent 强制收尾时拼入有效内容，
    // 避免最终回复退化为纯"已执行 N 次工具调用"清单）
    let lastFullToolResult = '';

    /**
     * 工具执行后若模型未给出正文（content 为空），用已执行工具的结果合成摘要，
     * 避免聊天流以空白消息"自动结束"（前端只显示思考过程/工具调用，看不到最终回复）。
     */
    const synthesizeFinalContent = (content: string | null | undefined): string => {
      const trimmed = (content || '').trim();
      if (trimmed) {
        return trimmed;
      }
      if (reasoningSteps.length === 0) {
        return content || '';
      }
      const lines = reasoningSteps.map((step) => {
        const output = (step.output || '').trim();
        return `- ${step.tool}: ${output ? output.slice(0, 200) : '已执行'}`;
      });
      let summary = `已执行 ${reasoningSteps.length} 次工具调用：\n${lines.join('\n')}`;
      // 强制收尾时拼入最后一次成功执行的完整工具结果（截断预览），
      // 避免最终回复退化为纯"已执行 N 次工具调用"清单，让用户拿到已获取的部分信息
      if (lastFullToolResult) {
        const preview =
          lastFullToolResult.length > 1500
            ? lastFullToolResult.slice(0, 1000) +
              '\n...[预览截断]...\n' +
              lastFullToolResult.slice(-500)
            : lastFullToolResult;
        summary += `\n\n[最后一次工具调用结果]\n${preview}`;
      }
      return `${summary}\n\n（模型未返回正文，以上为工具执行摘要与最近一次工具结果）`;
    };
    let accCompletion = 0;
    let accTotal = 0;
    let collectedThinking: string | null = null;

    // Token 配额追踪器：限制单次 Agent Loop 的工具调用次数和累计 Token
    const budget = new TokenBudget({
      maxToolCalls,
      maxTotalTokens: DEFAULT_MAX_TOTAL_TOKENS,
    });

    const accumulateUsage = (usage?: TokenUsage) => {
      if (!usage) {
        return;
      }
      accPrompt += usage.promptTokens;
      accCompletion += usage.completionTokens;
      accTotal += usage.totalTokens;
      // 同步到 TokenBudget，使 isTokenLimitReached() 能反映累计用量
      budget.accumulate(usage);
    };

    const getTotalUsage = (): TokenUsage | undefined => {
      if (accTotal === 0) {
        return undefined;
      }
      return { promptTokens: accPrompt, completionTokens: accCompletion, totalTokens: accTotal };
    };

    const collectThinking = (thinking: string | null) => {
      if (thinking) {
        collectedThinking = collectedThinking ? `${collectedThinking}\n${thinking}` : thinking;
      }
    };

    const userContent: MessageContent = screenshotBase64
      ? [
          { type: 'text', text: prompt.user },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${screenshotBase64}` } },
        ]
      : prompt.user;

    const messages: LLMChatMessage[] = [
      { role: 'system', content: prompt.system },
      ...(prompt.history || []),
      { role: 'user', content: userContent },
    ];

    try {
      const firstStream = this.chatWithToolsStream(messages, config, tools, responseFormat, signal);
      let firstToolCalls: ToolCallInfo[] | null = null;
      let firstContent = '';
      let firstThinking: string | null = null;
      let firstUsage: TokenUsage | undefined;

      for await (const event of firstStream) {
        if (event.type === 'content_delta') {
          firstContent += event.content;
          safeEmit(AGENT_EVENT.TOKEN, { agentName, data: event.content, sessionId } as AgentToken);
          yield { type: 'token', data: event.content };
        } else if (event.type === 'thinking_delta') {
          firstThinking = firstThinking ? firstThinking + event.content : event.content;
          safeEmit(AGENT_EVENT.THINKING, { agentName, data: event.content, sessionId } as AgentThinking);
          yield { type: 'thinking', data: event.content };
        } else if (event.type === 'tool_calls') {
          firstToolCalls = event.toolCalls;
          // 思考内容已在流中通过 thinking_delta 逐块发出，此处仅累积不再重复 yield
          if (event.thinkingContent) {
            firstThinking = firstThinking
              ? firstThinking + '\n' + event.thinkingContent
              : event.thinkingContent;
          }
        } else if (event.type === 'done') {
          firstContent = event.content ?? firstContent;
          firstThinking = event.thinkingContent ?? firstThinking;
          firstUsage = event.usage;
        }
      }

      accumulateUsage(firstUsage);
      collectThinking(firstThinking);

      // 无工具调用 -> 单次回复
      if (!firstToolCalls || firstToolCalls.length === 0) {
        if (!firstContent && !firstToolCalls) {
          // LLM 不支持 tool_calling，fallback
          this.log.info('LLM does not support tool_calling, falling back to single call mode');
          const fallbackText = await this.chat({
            systemPrompt: prompt.system,
            userPrompt: prompt.user,
            responseFormat,
            signal,
          });
          accumulateUsage(fallbackText.usage);
          safeEmit(AGENT_EVENT.TOKEN, { agentName, data: fallbackText.content, sessionId } as AgentToken);
          yield { type: 'token', data: fallbackText.content };
          safeEmit(AGENT_EVENT.DONE, {
            agentName,
            content: fallbackText.content,
            thinkingContent: collectedThinking,
            analysisMode: 'single',
            reasoningSteps: [],
            totalUsage: getTotalUsage(),
            sessionId,
          } as AgentDone);
          yield {
            type: 'done',
            data: {
              content: fallbackText.content,
              thinkingContent: collectedThinking,
              analysisMode: 'single',
              reasoningSteps: [],
              totalUsage: getTotalUsage(),
            },
          };
          return;
        }
        yield {
          type: 'done',
          data: {
            content: firstContent,
            thinkingContent: collectedThinking,
            analysisMode: 'single',
            reasoningSteps: [],
            totalUsage: getTotalUsage(),
          },
        };
        safeEmit(AGENT_EVENT.DONE, {
          agentName,
          content: firstContent,
          thinkingContent: collectedThinking,
          analysisMode: 'single',
          reasoningSteps: [],
          totalUsage: getTotalUsage(),
          sessionId,
        } as AgentDone);
        return;
      }

      // ── Plan-Execute Agent Loop ──────────────────────────────────────
      // baseMessages 是不变的系统消息+历史+用户消息基线
      const baseMessages: LLMChatMessage[] = [
        { role: 'system', content: prompt.system },
        ...(prompt.history || []),
        { role: 'user', content: userContent },
      ];
      let currentToolCalls = firstToolCalls;
      let currentContent = firstContent ?? null;
      let round = 0;
      // Plan progress tracking: structured task list injected into each round,
      // so the model can see planned vs completed subtasks for complex requests.
      // (string[] before; upgraded to items with status for task decomposition.)
      interface PlanItem {
        id: string;
        title: string;
        status: 'pending' | 'done' | 'blocked';
      }
      const planProgress: PlanItem[] = [];
      // 重复调用防护：记录"最近一次调用"及其连续相同调用次数。
      // 仅当连续（中间无其他工具/参数调用）出现相同工具+参数时才累加；
      // 穿插其他调用（如探索序列 snapshot→click→snapshot）会使计数重置，
      // 避免将正常的页面探索误判为死循环。
      let lastCallKey: string | null = null;
      let lastCallCount = 0;
      // 本轮是否触发了重复调用防护（对应工具调用被跳过未执行）
      let repeatedGuardTriggered = false;
      // 强制收尾原因（可由重复调用防护等非预算场景覆盖默认文案）
      let forcedTerminationReason: string | null = null;

      /**
       * 配额超限时的强制收尾分支：
       * 用空 tools 数组再次调用模型，强制其给出文本响应而非继续调用工具。
       * 使用箭头函数生成器以保留外层 this（LLMService 实例）绑定。
       */
      const emitForcedTermination = async function* (this: LLMService): AsyncGenerator<AgentLoopStreamEvent, void, unknown> {
        const reason =
          forcedTerminationReason ??
          (budget.isToolCallLimitReached()
            ? `max tool calls (${budget.maxToolCalls})`
            : `max total tokens (${budget.maxTotalTokens})`);
        this.log.warn(`Agent loop exceeded ${reason}, executing final call without tools`);
        // 强制收尾时也注入结构化任务进度，让模型在最终答复中能看到
        // 已完成（[✓]）与受阻（[!]）的子任务，并对照清单汇总
        const finalRoundMessages = buildRoundMessages(
          baseMessages,
          reasoningSteps,
          currentContent,
          []
        );
        if (planProgress.length > 0) {
          const planView = planProgress
            .map((p) => {
              const mark = p.status === 'done' ? '[✓]' : p.status === 'blocked' ? '[!]' : '[ ]';
              return `${mark} ${p.id} ${p.title}`;
            })
            .join('\n');
          finalRoundMessages.push({
            role: 'user',
            content: `[System: 最终任务进度]\n${planView}\n\n请基于以上进度与已执行结果，对照清单给出完整最终答案；若有 [!] 受阻项请说明原因与已获取的部分结果。`,
          });
        }
        const finalStream = this.chatWithToolsStream(
          finalRoundMessages,
          config,
          [],
          responseFormat,
          signal
        );
        let finalContent = '';
        let finalThinking: string | null = null;
        let finalUsage: TokenUsage | undefined;
        for await (const event of finalStream) {
          if (event.type === 'content_delta') {
            finalContent += event.content;
            safeEmit(AGENT_EVENT.TOKEN, { agentName, data: event.content, sessionId } as AgentToken);
            yield { type: 'token', data: event.content };
          } else if (event.type === 'thinking_delta') {
            finalThinking = finalThinking ? finalThinking + event.content : event.content;
            safeEmit(AGENT_EVENT.THINKING, { agentName, data: event.content, sessionId } as AgentThinking);
            yield { type: 'thinking', data: event.content };
          } else if (event.type === 'done') {
            finalContent = event.content ?? finalContent;
            finalThinking = event.thinkingContent ?? finalThinking;
            finalUsage = event.usage;
          }
        }
        accumulateUsage(finalUsage);
        collectThinking(finalThinking);
        const forcedFinalContent = synthesizeFinalContent(finalContent || currentContent || '');
        safeEmit(AGENT_EVENT.DONE, {
          agentName,
          content: forcedFinalContent,
          thinkingContent: collectedThinking,
          analysisMode: 'agent',
          reasoningSteps,
          totalUsage: getTotalUsage(),
          truncated: true,
          sessionId,
        } as AgentDone);
        yield {
          type: 'done',
          data: {
            content: forcedFinalContent,
            thinkingContent: collectedThinking,
            analysisMode: 'agent',
            reasoningSteps,
            totalUsage: getTotalUsage(),
            truncated: true,
          },
        };
      }.bind(this);

      while (currentToolCalls && currentToolCalls.length > 0) {
        round++;

        if (round > MAX_AGENT_ROUNDS) {
          this.log.warn(`Agent loop reached max rounds (${MAX_AGENT_ROUNDS}), force terminating`);
          safeEmit(AGENT_EVENT.DONE, {
            agentName,
            content:
              currentContent ||
              'Agent 执行已达到最大轮数/Token 预算上限，部分结果可能不完整。请检查上述输出。',
            thinkingContent: collectedThinking,
            analysisMode: 'agent',
            reasoningSteps,
            totalUsage: getTotalUsage(),
            truncated: true,
            sessionId,
          } as AgentDone);
          yield {
            type: 'done',
            data: {
              content:
                currentContent ||
                'Agent 执行已达到最大轮数/Token 预算上限，部分结果可能不完整。请检查上述输出。',
              thinkingContent: collectedThinking,
              analysisMode: 'agent',
              reasoningSteps,
              totalUsage: getTotalUsage(),
              truncated: true,
            },
          };
          return;
        }

        // 每轮从头构建消息数组：baseMessages + 已累积的 assistant+tool 消息
        const roundMessages = buildRoundMessages(
          baseMessages,
          reasoningSteps,
          currentContent,
          currentToolCalls
        );

        // 执行工具调用
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

          // ── 重复调用防护（死循环硬闸）──
          // 仅当【连续】出现相同工具+参数时才累加；中间穿插其他调用（如
          // snapshot→click→snapshot 的页面探索序列）会使计数重置为 1，
          // 避免把正常探索误判为死循环。
          const callKey = `${toolCall.function.name}:${stableStringify(args)}`;
          const count = callKey === lastCallKey ? lastCallCount + 1 : 1;
          lastCallKey = callKey;
          lastCallCount = count;

          if (count >= 3) {
            // 第 3 次连续原样重试：跳过该次执行，注入防护提示；
            // 不 break——同一轮中后续不同的工具调用（如点击）仍应执行，
            // 避免丢弃模型本轮已规划的其他合法动作。
            this.log.warn(
              `Repeated identical tool call (${callKey}) x${count}, skipping execution`
            );
            const guardMsg =
              `[System] 重复调用防护：工具 ${toolCall.function.name} 已以完全相同参数连续调用 ${count} 次，` +
              `结果均相同且无新信息。本次调用已跳过。请勿再以相同参数调用该工具；` +
              `如需更多信息请先滚动/展开/点击改变页面状态后重试，或用 browser_evaluate 提取结构化摘要，` +
              `或基于已有信息直接给出最终答案。`;
            step.output = guardMsg;
            reasoningSteps.push(step);
            planProgress.push({
              id: `T${planProgress.length + 1}`,
              title: `${toolCall.function.name} (skipped: 重复调用防护 x${count})`,
              status: 'blocked',
            });
            forcedTerminationReason = `repeated identical tool call (${callKey}) x${count}`;
            repeatedGuardTriggered = true;
            safeEmit(AGENT_EVENT.TOOL_RESULT, {
              agentName,
              name: toolCall.function.name,
              result: guardMsg,
              round,
              sessionId,
            } as AgentToolResult);
            yield { type: 'tool_result', data: { name: toolCall.function.name, result: guardMsg } };
            continue;
          }

          // 第 2 次连续原样重试：仍执行，但注入引导提示（下一轮 LLM 将看到）
          if (count === 2) {
            planProgress.push({
              id: `T${planProgress.length + 1}`,
              title: `[System] 提示：工具 ${toolCall.function.name}（相同参数）已连续执行过且结果相同，原样重试不会获得新信息，请先滚动/展开/点击或改用其他工具/参数。`,
              status: 'blocked',
            });
          }

          safeEmit(AGENT_EVENT.TOOL_CALL, {
            agentName,
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
            round,
            sessionId,
          } as AgentToolCall);
          yield {
            type: 'tool_call',
            data: { name: toolCall.function.name, arguments: toolCall.function.arguments },
          };

          // 工具执行开始：通知前端显示"执行中"状态（嵌套调用可能长时间无 token）
          yield { type: 'tool_running', data: { name: toolCall.function.name } };

          // 工具执行期间将外层预算压栈：嵌套 LLM 调用（agent_generate 等）
          // 的 usage 会由 chat()/chatWithToolsStream 累加到栈顶预算
          this.pushBudget(budget);
          let toolResult: string;
          try {
            toolResult = toolExecutor
              ? await toolExecutor(toolCall.function.name, args)
              : `Tool execution not available: ${toolCall.function.name}`;
          } finally {
            this.popBudget();
          }

          step.output = toolResult.slice(0, 500);
          // 记录最后一次成功执行的完整工具结果，供强制收尾拼入最终回复
          lastFullToolResult = toolResult;
          reasoningSteps.push(step);
          // 递增工具调用计数，供 TokenBudget 配额检查使用
          budget.recordToolCall();

          safeEmit(AGENT_EVENT.TOOL_RESULT, {
            agentName,
            name: toolCall.function.name,
            result: toolResult,
            round,
            sessionId,
          } as AgentToolResult);
          yield { type: 'tool_result', data: { name: toolCall.function.name, result: toolResult } };

          roundMessages.push({
            role: 'tool',
            // 工具结果回灌 LLM 前截断，避免页面快照/大结果使上下文随轮次 O(n²) 膨胀。
            // 采用头尾双保留：LLM 同时看到结构起始与结尾，截断标记为条件引导（非禁止重试）。
            content:
              toolResult.length > MAX_TOOL_RESULT_CHARS
                ? toolResult.slice(0, MAX_TOOL_RESULT_HEAD) +
                  '\n...[中段省略 ' +
                  (toolResult.length - MAX_TOOL_RESULT_HEAD - MAX_TOOL_RESULT_TAIL) +
                  ' 字符]...\n' +
                  toolResult.slice(-MAX_TOOL_RESULT_TAIL) +
                  TOOL_RESULT_TRUNCATION_HINT
                : toolResult,
            tool_call_id: toolCall.id,
          });

          planProgress.push({
            id: `T${planProgress.length + 1}`,
            title: `${toolCall.function.name}: completed`,
            status: 'done',
          });
        }

        // 重复调用防护触发：本轮已跳过重复的相同调用（其余不同工具仍已执行），
        // 直接进入无工具强制收尾，让模型基于已执行结果作答。
        // 注意：已执行的工具结果已保留在 reasoningSteps 中，收尾时模型仍可基于它们作答。
        if (repeatedGuardTriggered) {
          yield* emitForcedTermination();
          return;
        }

        // 配额检查：工具执行后立即判断是否超限，超限则强制收尾
        if (budget.isExceeded()) {
          yield* emitForcedTermination();
          return;
        }

        // ── Inject plan progress context for the next LLM call ──
        // 结构化任务清单视图：让模型看到已规划/已完成/受阻的子任务，
        // 支持复杂任务的拆解与逐项核对（而非旧的字符串流水账）。
        const planView = planProgress
          .map((p) => {
            const mark = p.status === 'done' ? '[✓]' : p.status === 'blocked' ? '[!]' : '[ ]';
            return `${mark} ${p.id} ${p.title}`;
          })
          .join('\n');
        roundMessages.push({
          role: 'user',
          content: `[System: Progress (Round ${round}/${MAX_AGENT_ROUNDS})]\n\n任务进度:\n${
            planView || '（暂无）'
          }\n\n请根据当前进展决定下一步：\n- 如果任务目标已达成，对照清单给出完整的最终答案\n- 如果还有未完成的子任务（[ ] 或 [!]），继续执行直到全部完成\n- 如果遇到错误，分析原因并尝试其他方法`,
        });

        // 再次流式调用 LLM
        const nextStream = this.chatWithToolsStream(roundMessages, config, tools, responseFormat, signal);
        let nextToolCalls: ToolCallInfo[] | null = null;
        let nextContent = '';
        let nextThinking: string | null = null;
        let nextUsage: TokenUsage | undefined;

        for await (const event of nextStream) {
          if (event.type === 'content_delta') {
            nextContent += event.content;
            safeEmit(AGENT_EVENT.TOKEN, { agentName, data: event.content, sessionId } as AgentToken);
            yield { type: 'token', data: event.content };
          } else if (event.type === 'thinking_delta') {
            nextThinking = nextThinking ? nextThinking + event.content : event.content;
            safeEmit(AGENT_EVENT.THINKING, { agentName, data: event.content, sessionId } as AgentThinking);
            yield { type: 'thinking', data: event.content };
          } else if (event.type === 'tool_calls') {
            nextToolCalls = event.toolCalls;
            // 思考内容已在流中通过 thinking_delta 逐块发出，此处仅累积不再重复 yield
            if (event.thinkingContent) {
              nextThinking = nextThinking
                ? nextThinking + '\n' + event.thinkingContent
                : event.thinkingContent;
            }
          } else if (event.type === 'done') {
            nextContent = event.content ?? nextContent;
            nextThinking = event.thinkingContent ?? nextThinking;
            nextUsage = event.usage;
          }
        }

        accumulateUsage(nextUsage);
        collectThinking(nextThinking);

        if (!nextToolCalls || nextToolCalls.length === 0) {
          const finalContent = synthesizeFinalContent(nextContent);
          safeEmit(AGENT_EVENT.DONE, {
            agentName,
            content: finalContent,
            thinkingContent: collectedThinking,
            analysisMode: 'agent',
            reasoningSteps,
            totalUsage: getTotalUsage(),
            sessionId,
          } as AgentDone);
          yield {
            type: 'done',
            data: {
              content: finalContent,
              thinkingContent: collectedThinking,
              analysisMode: 'agent',
              reasoningSteps,
              totalUsage: getTotalUsage(),
            },
          };
          return;
        }

        currentContent = nextContent ?? null;
        currentToolCalls = nextToolCalls;
      }

      // 兜底：不应到达这里，但以防万一
      const finalResponse = await this.chatWithTools(
        baseMessages,
        config,
        undefined,
        responseFormat
      );
      accumulateUsage(finalResponse.usage);
      collectThinking(finalResponse.thinkingContent);
      const fallbackFinalContent = synthesizeFinalContent(finalResponse.content || '');
      safeEmit(AGENT_EVENT.DONE, {
        agentName,
        content: fallbackFinalContent,
        thinkingContent: collectedThinking,
        analysisMode: 'agent',
        reasoningSteps,
        totalUsage: getTotalUsage(),
        sessionId,
      } as AgentDone);
      yield {
        type: 'done',
        data: {
          content: fallbackFinalContent,
          thinkingContent: collectedThinking,
          analysisMode: 'agent',
          reasoningSteps,
          totalUsage: getTotalUsage(),
        },
      };
    } catch (error) {
      this.log.warn(
        `Agent loop stream failed, falling back to single call: ${error instanceof Error ? error.message : String(error)}`
      );
      // 触发 agent.error 事件，供 UI / 遥测层感知降级
      safeEmit(AGENT_EVENT.ERROR, {
        agentName,
        error,
        context: 'agentLoopStream fallback',
        sessionId,
      } as AgentError);
      const fallbackText = await this.chat({
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        signal,
      });
      accumulateUsage(fallbackText.usage);
      safeEmit(AGENT_EVENT.TOKEN, { agentName, data: fallbackText.content, sessionId } as AgentToken);
      yield { type: 'token', data: fallbackText.content };
      const catchFallbackContent = synthesizeFinalContent(fallbackText.content);
      safeEmit(AGENT_EVENT.DONE, {
        agentName,
        content: catchFallbackContent,
        thinkingContent: collectedThinking,
        analysisMode: 'fallback',
        reasoningSteps: [],
        totalUsage: getTotalUsage(),
        sessionId,
      } as AgentDone);
      yield {
        type: 'done',
        data: {
          content: catchFallbackContent,
          thinkingContent: collectedThinking,
          analysisMode: 'fallback',
          reasoningSteps: [],
          totalUsage: getTotalUsage(),
        },
      };
    }
  }

  async chatWithAgentLoop(
    prompt: { system: string; user: string; history?: LLMChatMessage[] },
    config: LLMConfig,
    tools?: ToolSchema[],
    screenshotBase64?: string,
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<string>,
    responseFormat?: { type: string },
    /**
     * 单次 Agent Loop 允许的最大工具调用次数（含首次）。
     * 默认值由环境变量 AGENT_MAX_TOOL_CALLS 控制，回退到 10。
     */
    maxToolCalls: number = DEFAULT_MAX_TOOL_CALLS,
    /**
     * Phase D — 事件流与可观测性：透传给 chatWithAgentLoopStream，
     * 供 UI / 遥测层订阅 agent.* 事件。
     */
    eventBus?: EventEmitter,
    /** 关联的会话 id（透传到事件载荷） */
    sessionId?: string
  ): Promise<{
    responseText: string;
    thinkingContent: string | null;
    reasoningSteps: ReasoningStep[];
    analysisMode: 'agent' | 'single' | 'fallback';
    totalUsage?: TokenUsage;
    truncated?: boolean;
  }> {
    // 委托给流式版本，收集所有事件后重组为对象结果
    const stream = this.chatWithAgentLoopStream(
      prompt,
      config,
      tools,
      screenshotBase64,
      toolExecutor,
      responseFormat,
      maxToolCalls,
      eventBus,
      sessionId
    );

    let content = '';
    let thinking: string | null = null;
    const reasoningSteps: ReasoningStep[] = [];
    let analysisMode: 'agent' | 'single' | 'fallback' = 'agent';
    let totalUsage: TokenUsage | undefined;
    let truncated = false;

    for await (const event of stream) {
      if (event.type === 'token') {
        content += event.data;
      } else if (event.type === 'thinking') {
        thinking = thinking ? `${thinking}\n${event.data}` : event.data;
      } else if (event.type === 'tool_call') {
        reasoningSteps.push({
          step: reasoningSteps.length + 1,
          tool: event.data.name,
          input: event.data.arguments,
          thought: `Calling tool: ${event.data.name}`,
        });
      } else if (event.type === 'tool_result') {
        // tool_result 仅在流式中有意义，非流式版本跳过
        const lastStep = reasoningSteps[reasoningSteps.length - 1];
        if (lastStep) {
          lastStep.output = event.data.result?.slice(0, 500) ?? '';
        }
      } else if (event.type === 'done') {
        content = event.data.content ?? content;
        thinking = event.data.thinkingContent ?? thinking;
        analysisMode = event.data.analysisMode ?? analysisMode;
        reasoningSteps.push(...(event.data.reasoningSteps ?? []));
        totalUsage = event.data.totalUsage;
        truncated = event.data.truncated ?? false;
      }
    }

    return {
      responseText: content,
      thinkingContent: thinking,
      reasoningSteps,
      analysisMode,
      totalUsage,
      truncated,
    };
  }
}
