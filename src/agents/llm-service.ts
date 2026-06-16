import { LLMConfig, ReasoningStep } from '../types';
import { logger } from '../logger';

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

export interface ChatMessage {
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
  | { type: 'done'; content: string; thinkingContent: string | null; usage?: TokenUsage };

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

  private async callAPI(
    config: LLMConfig,
    body: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<RawAPIResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT);

    try {
      const response = await fetch(this.buildURL(config), {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      return (await response.json()) as RawAPIResponse;
    } finally {
      clearTimeout(timeout);
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
    if (this.config.chatTemplateKwargs) { body.chat_template_kwargs = { enable_thinking: true }; }
    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    const data = await this.callAPI(this.config, body, options.timeout);
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
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
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolSchema[]
  ): Promise<{
    content: string | null;
    thinkingContent: string | null;
    toolCalls?: ToolCallInfo[];
    usage?: TokenUsage;
  }> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    };

    if (config.chatTemplateKwargs) {
      body.chat_template_kwargs = { enable_thinking: true };
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const data = await this.callAPI(config, body);
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
    };
  }

  async *chatStream(
    prompt: { system: string; user: string },
    config: LLMConfig
  ): AsyncGenerator<string, void, unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(this.buildURL(config), {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          max_tokens: config.maxTokens,
          temperature: config.temperature,
          stream: true,
          chat_template_kwargs: config.chatTemplateKwargs ? { enable_thinking: true } : undefined,
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
            // skip invalid JSON
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async *chatWithToolsStream(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolSchema[]
  ): AsyncGenerator<ToolsStreamEvent, void, unknown> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    };

    if (config.chatTemplateKwargs) {
      body.chat_template_kwargs = { enable_thinking: true };
    }

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(this.buildURL(config), {
        method: 'POST',
        headers: this.buildHeaders(config),
        body: JSON.stringify(body),
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

      // 累积状态
      let fullContent = '';
      let fullThinking: string | null = null;
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
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async *chatWithAgentLoopStream(
    prompt: { system: string; user: string; history?: ChatMessage[] },
    config: LLMConfig,
    tools?: ToolSchema[],
    screenshotBase64?: string,
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<string>
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

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt.system },
      ...(prompt.history || []),
      { role: 'user', content: userContent },
    ];

    try {
      const firstStream = this.chatWithToolsStream(messages, config, tools);
      let firstToolCalls: ToolCallInfo[] | null = null;
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
          // 将 chatWithToolsStream 中从 `` 解析出的思考内容转发给前端
          if (event.thinkingContent) {
            firstThinking = firstThinking
              ? firstThinking + '\n' + event.thinkingContent
              : event.thinkingContent;
            yield { type: 'thinking', data: event.thinkingContent };
          }
        } else if (event.type === 'done') {
          firstContent = event.content || firstContent;
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
      let currentToolCalls = firstToolCalls;
      let currentContent = firstContent ?? null;
      let round = 0;
      // Plan progress tracking: maps step index → status
      const planProgress: string[] = [];

      while (currentToolCalls && currentToolCalls.length > 0) {
        round++;

        if (round > MAX_AGENT_ROUNDS) {
          this.log.warn(`Agent loop reached max rounds (${MAX_AGENT_ROUNDS}), force terminating`);
          yield {
            type: 'done',
            data: {
              content: currentContent || 'Task has reached the maximum number of execution rounds. Please review the partial results above.',
              thinkingContent: collectedThinking,
              analysisMode: 'agent',
              reasoningSteps,
              totalUsage: getTotalUsage(),
            },
          };
          return;
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: currentContent,
          tool_calls: currentToolCalls?.map((tc) => ({
            ...tc,
            type: tc.type || 'function',
          })),
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

          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });

          planProgress.push(
            `[Round ${round}] ${toolCall.function.name}: completed`
          );
        }

        // ── Inject plan progress context for the next LLM call ──
        const progressContext: ChatMessage = {
          role: 'user',
          content: `[System: Progress (Round ${round}/${MAX_AGENT_ROUNDS})]\n\n已完成:\n${planProgress.join('\n')}\n\n请根据当前进展决定下一步：\n- 如果任务目标已达成，给出完整的最终答案\n- 如果还需要更多信息或操作，继续调用合适的工具\n- 如果遇到错误，分析原因并尝试其他方法`,
        };
        messages.push(progressContext);

        // 再次流式调用 LLM
        const nextStream = this.chatWithToolsStream(messages, config, tools);
        let nextToolCalls: ToolCallInfo[] | null = null;
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
            // 将 chatWithToolsStream 中从 `` 解析出的思考内容转发给前端
            if (event.thinkingContent) {
              nextThinking = nextThinking
                ? nextThinking + '\n' + event.thinkingContent
                : event.thinkingContent;
              yield { type: 'thinking', data: event.thinkingContent };
            }
          } else if (event.type === 'done') {
            nextContent = event.content || nextContent;
            nextThinking = event.thinkingContent ?? nextThinking;
            nextUsage = event.usage;
          }
        }

        accumulateUsage(nextUsage);
        collectThinking(nextThinking);

        // Remove the injected progress context for the next round (will add fresh one)
        messages.pop();

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
      const finalResponse = await this.chatWithTools(messages, config);
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
    prompt: { system: string; user: string; history?: ChatMessage[] },
    config: LLMConfig,
    tools?: ToolSchema[],
    screenshotBase64?: string,
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{
    responseText: string;
    thinkingContent: string | null;
    reasoningSteps: ReasoningStep[];
    analysisMode: 'agent' | 'single' | 'fallback';
    totalUsage?: TokenUsage;
  }> {
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
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${screenshotBase64}` },
          },
        ]
      : prompt.user;

    const messages: ChatMessage[] = [
      { role: 'system', content: prompt.system },
      ...(prompt.history || []),
      { role: 'user', content: userContent },
    ];

    try {
      const firstResponse = await this.chatWithTools(messages, config, tools);
      accumulateUsage(firstResponse.usage);
      collectThinking(firstResponse.thinkingContent);

      if (!firstResponse.toolCalls || firstResponse.toolCalls.length === 0) {
        const content = firstResponse.content || '';
        if (!content && !firstResponse.toolCalls) {
          this.log.info('LLM does not support tool_calling, falling back to single call mode');
          const fallbackText = await this.chat({
            systemPrompt: prompt.system,
            userPrompt: prompt.user,
          });
          accumulateUsage(fallbackText.usage);
          return {
            responseText: fallbackText.content,
            thinkingContent: collectedThinking,
            reasoningSteps: [],
            analysisMode: 'single',
            totalUsage: getTotalUsage(),
          };
        }
        return {
          responseText: content,
          thinkingContent: collectedThinking,
          reasoningSteps: [],
          analysisMode: 'single',
          totalUsage: getTotalUsage(),
        };
      }

      // ── Plan-Execute Agent Loop ──────────────────────────────────────
      let currentToolCalls = firstResponse.toolCalls;
      let currentContent = firstResponse.content ?? null;
      let round = 0;
      const planProgress: string[] = [];

      while (currentToolCalls && currentToolCalls.length > 0) {
        round++;

        if (round > MAX_AGENT_ROUNDS) {
          this.log.warn(`Agent loop reached max rounds (${MAX_AGENT_ROUNDS}), force terminating`);
          return {
            responseText: currentContent || 'Task has reached the maximum number of execution rounds.',
            thinkingContent: collectedThinking,
            reasoningSteps,
            analysisMode: 'agent',
            totalUsage: getTotalUsage(),
          };
        }

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: currentContent,
          tool_calls: currentToolCalls?.map((tc) => ({
            ...tc,
            type: tc.type || 'function',
          })),
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

          const toolResult = toolExecutor
            ? await toolExecutor(toolCall.function.name, args)
            : `Tool execution not available: ${toolCall.function.name}`;

          step.output = toolResult.slice(0, 500);
          reasoningSteps.push(step);

          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });

          planProgress.push(
            `[Round ${round}] ${toolCall.function.name}: completed`
          );
        }

        // ── Inject plan progress context ──
        const progressContext: ChatMessage = {
          role: 'user',
          content: `[System: Progress (Round ${round}/${MAX_AGENT_ROUNDS})]\n\n已完成:\n${planProgress.join('\n')}\n\n请根据当前进展决定下一步：\n- 如果任务目标已达成，给出完整的最终答案\n- 如果还需要更多信息或操作，继续调用合适的工具\n- 如果遇到错误，分析原因并尝试其他方法`,
        };
        messages.push(progressContext);

        const nextResponse = await this.chatWithTools(messages, config, tools);
        accumulateUsage(nextResponse.usage);
        collectThinking(nextResponse.thinkingContent);

        messages.pop(); // Remove injected progress context

        if (!nextResponse.toolCalls || nextResponse.toolCalls.length === 0) {
          return {
            responseText: nextResponse.content || '',
            thinkingContent: collectedThinking,
            reasoningSteps,
            analysisMode: 'agent',
            totalUsage: getTotalUsage(),
          };
        }

        currentContent = nextResponse.content ?? null;
        currentToolCalls = nextResponse.toolCalls || [];
      }

      const finalResponse = await this.chatWithTools(messages, config);
      accumulateUsage(finalResponse.usage);
      collectThinking(finalResponse.thinkingContent);
      return {
        responseText: finalResponse.content || '',
        thinkingContent: collectedThinking,
        reasoningSteps,
        analysisMode: 'agent',
        totalUsage: getTotalUsage(),
      };
    } catch (error) {
      this.log.warn(
        `Agent loop failed, falling back to single call: ${error instanceof Error ? error.message : String(error)}`
      );
      const fallbackText = await this.chat({
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
      });
      accumulateUsage(fallbackText.usage);
      return {
        responseText: fallbackText.content,
        thinkingContent: collectedThinking,
        reasoningSteps: [],
        analysisMode: 'single',
        totalUsage: getTotalUsage(),
      };
    }
  }
}
