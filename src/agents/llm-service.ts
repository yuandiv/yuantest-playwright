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

const DEFAULT_MAX_AGENT_ROUNDS = 5;
const DEFAULT_TIMEOUT = 120000;

interface RawAPIResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
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
    return `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
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
  ): Promise<{ content: string | null; toolCalls?: ToolCallInfo[]; usage?: TokenUsage }> {
    const body: Record<string, unknown> = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    } else {
      body.response_format = { type: 'json_object' };
    }

    const data = await this.callAPI(config, body);
    const message = data.choices?.[0]?.message;

    return {
      content: message?.content ?? null,
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
          response_format: { type: 'json_object' },
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

  async chatWithAgentLoop(
    prompt: { system: string; user: string },
    config: LLMConfig,
    tools?: ToolSchema[],
    screenshotBase64?: string,
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<{
    responseText: string;
    reasoningSteps: ReasoningStep[];
    analysisMode: 'agent' | 'single' | 'fallback';
    totalUsage?: TokenUsage;
  }> {
    const reasoningSteps: ReasoningStep[] = [];
    let accPrompt = 0;
    let accCompletion = 0;
    let accTotal = 0;

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
      const firstResponse = await this.chatWithTools(messages, config, tools);
      accumulateUsage(firstResponse.usage);

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
            reasoningSteps: [],
            analysisMode: 'single',
            totalUsage: getTotalUsage(),
          };
        }
        return {
          responseText: content,
          reasoningSteps: [],
          analysisMode: 'single',
          totalUsage: getTotalUsage(),
        };
      }

      const maxRounds = config.maxAgentRounds ?? DEFAULT_MAX_AGENT_ROUNDS;
      let currentToolCalls = firstResponse.toolCalls;
      let currentContent = firstResponse.content ?? null;
      let round = 0;

      while (currentToolCalls && currentToolCalls.length > 0 && round < maxRounds) {
        round++;

        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: currentContent,
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
        }

        const nextResponse = await this.chatWithTools(messages, config, tools);
        accumulateUsage(nextResponse.usage);

        if (!nextResponse.toolCalls || nextResponse.toolCalls.length === 0) {
          return {
            responseText: nextResponse.content || '',
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
      return {
        responseText: finalResponse.content || '',
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
        reasoningSteps: [],
        analysisMode: 'single',
        totalUsage: getTotalUsage(),
      };
    }
  }
}
