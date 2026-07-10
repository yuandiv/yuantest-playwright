import { LLMConfig, ReasoningStep } from '../../types';
import { logger } from '../../logger';

export interface LLMChatOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
  timeout?: number;
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

/** 流式 chatWithTools 事件类型 */
export type ToolsStreamEvent =
  | { type: 'content_delta'; content: string }
  | { type: 'thinking_delta'; content: string }
  | { type: 'tool_calls'; toolCalls: ToolCallInfo[]; thinkingContent?: string | null }
  | { type: 'done'; content: string; thinkingContent: string | null; usage?: TokenUsage; truncated?: boolean };

/** 流式 Agent Loop 事件类型 */
export type AgentLoopStreamEvent =
  | { type: 'token'; data: string }
  | { type: 'thinking'; data: string }
  | { type: 'tool_call'; data: { name: string; arguments: string } }
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

  const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { cleanContent, thinkingContent: thinkingParts.join('\n') };
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
      tool_calls: [{
        id: `round_${step.step}`,
        type: 'function',
        function: { name: step.tool || '', arguments: step.input || '' },
      }],
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

export class LLMService {
  private config: LLMConfig;
  private log = logger.child('LLMService');

  constructor(config: LLMConfig) {
    this.config = config;
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
    retries: number = 5
  ): Promise<Response> {
    const timeout = timeoutMs ?? DEFAULT_TIMEOUT;
    const url = this.buildURL(config);
    const headers = this.buildHeaders(config);

    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
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
        // 超时不重试
        if (error instanceof Error && error.name === 'AbortError') {
          const msg = `LLM API 请求超时 (${timeout}ms, model: ${config.model})`;
          this.log.error(`[LLM] ${msg}`);
          throw new Error(msg);
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
    timeoutMs?: number
  ): Promise<RawAPIResponse> {
    const response = await this.fetchWithRetry(config, body, timeoutMs);
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
      messages: [
        { role: 'user', content: 'hi' },
      ],
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
    if (this.config.chatTemplateKwargs && !options.responseFormat) { body.chat_template_kwargs = { enable_thinking: true }; }
    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    const data = await this.callAPI(this.config, body, options.timeout);
    const choice = data.choices?.[0];
    const rawContent = choice?.message?.content;
    const reasoningContent = choice?.message?.reasoning_content;

    // 当模型开启推理模式时，部分模型会将实际回复放在 reasoning_content 中，
    // 而 content 可能为 null/空，这里做兜底处理
    const content = rawContent || reasoningContent || '';
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    if (choice?.finish_reason === 'length') {
      this.log.warn(
        `LLM response was truncated (finish_reason=length). Consider increasing maxTokens. Current: ${options.maxTokens ?? this.config.maxTokens}`
      );
    }

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
    responseFormat?: { type: string }
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

    const response = await this.fetchWithRetry(config, body);

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // 累积状态
    let fullContent = '';
    let fullThinking: string | null = null;
    let lastFinishReason: string | undefined;
    const toolCallMap = new Map<number, { id: string; type: string; name: string; arguments: string }>();
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

          // 内容增量
          if (delta.content) {
            fullContent += delta.content;
            yield { type: 'content_delta', content: delta.content };
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

    // 解析 <think...</think 标签
    if (fullContent) {
      const parsed = parseThinkingTags(fullContent);
      if (parsed.thinkingContent) {
        fullThinking = fullThinking
          ? fullThinking + '\n' + parsed.thinkingContent
          : parsed.thinkingContent;
        fullContent = parsed.cleanContent;
      }
    }

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
    responseFormat?: { type: string }
  ): AsyncGenerator<AgentLoopStreamEvent, void, unknown> {
    const reasoningSteps: ReasoningStep[] = [];
    let accPrompt = 0;
    let accCompletion = 0;
    let accTotal = 0;
    let collectedThinking: string | null = null;

    const accumulateUsage = (usage?: TokenUsage) => {
      if (!usage) {
        return;
      }
      accPrompt += usage.promptTokens;
      accCompletion += usage.completionTokens;
      accTotal += usage.totalTokens;
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
      const firstStream = this.chatWithToolsStream(messages, config, tools, responseFormat);      let firstToolCalls: ToolCallInfo[] | null = null;
      let firstContent = '';
      let firstThinking: string | null = null;
      let firstUsage: TokenUsage | undefined;

      for await (const event of firstStream) {
        if (event.type === 'content_delta') {
          firstContent += event.content;
          yield { type: 'token', data: event.content };
        } else if (event.type === 'thinking_delta') {
          firstThinking = firstThinking ? firstThinking + event.content : event.content;
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
          });
          accumulateUsage(fallbackText.usage);
          yield { type: 'token', data: fallbackText.content };
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
      // Plan progress tracking: maps step index → status
      const planProgress: string[] = [];

      while (currentToolCalls && currentToolCalls.length > 0) {
        round++;

        const totalUsage = getTotalUsage();
        if (round > MAX_AGENT_ROUNDS) {
          this.log.warn(`Agent loop reached max rounds (${MAX_AGENT_ROUNDS}), force terminating`);
          yield {
            type: 'done',
            data: {
              content: currentContent || 'Agent 执行已达到最大轮数/Token 预算上限，部分结果可能不完整。请检查上述输出。',
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
        const roundMessages = buildRoundMessages(baseMessages, reasoningSteps, currentContent, currentToolCalls);

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

          yield {
            type: 'tool_call',
            data: { name: toolCall.function.name, arguments: toolCall.function.arguments },
          };

          const toolResult = toolExecutor
            ? await toolExecutor(toolCall.function.name, args)
            : `Tool execution not available: ${toolCall.function.name}`;

          step.output = toolResult.slice(0, 500);
          reasoningSteps.push(step);

          yield { type: 'tool_result', data: { name: toolCall.function.name, result: toolResult } };

          roundMessages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });

          planProgress.push(
            `[Round ${round}] ${toolCall.function.name}: completed`
          );
        }

        // ── Inject plan progress context for the next LLM call ──
        roundMessages.push({
          role: 'user',
          content: `[System: Progress (Round ${round}/${MAX_AGENT_ROUNDS})]\n\n已完成:\n${planProgress.join('\n')}\n\n请根据当前进展决定下一步：\n- 如果任务目标已达成，给出完整的最终答案\n- 如果还需要更多信息或操作，继续调用合适的工具\n- 如果遇到错误，分析原因并尝试其他方法`,
        });

        // 再次流式调用 LLM
        const nextStream = this.chatWithToolsStream(roundMessages, config, tools, responseFormat);        let nextToolCalls: ToolCallInfo[] | null = null;
        let nextContent = '';
        let nextThinking: string | null = null;
        let nextUsage: TokenUsage | undefined;

        for await (const event of nextStream) {
          if (event.type === 'content_delta') {
            nextContent += event.content;
            yield { type: 'token', data: event.content };
          } else if (event.type === 'thinking_delta') {
            nextThinking = nextThinking ? nextThinking + event.content : event.content;
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
          yield {
            type: 'done',
            data: {
              content: nextContent,
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
      const finalResponse = await this.chatWithTools(baseMessages, config, undefined, responseFormat);
      accumulateUsage(finalResponse.usage);
      collectThinking(finalResponse.thinkingContent);
      yield {
        type: 'done',
        data: {
          content: finalResponse.content || '',
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
      const fallbackText = await this.chat({
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
      });
      accumulateUsage(fallbackText.usage);
      yield { type: 'token', data: fallbackText.content };
      yield {
        type: 'done',
        data: {
          content: fallbackText.content,
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
    responseFormat?: { type: string }
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
      prompt, config, tools, screenshotBase64, toolExecutor, responseFormat
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
