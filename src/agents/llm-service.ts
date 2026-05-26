import { LLMConfig, ReasoningStep } from '../types';
import { logger } from '../logger';

/** 基础聊天选项 */
export interface LLMChatOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
  timeout?: number;
}

/** Token 用量信息 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** 基础聊天结果 */
export interface LLMChatResult {
  content: string;
  finishReason?: string;
  usage?: TokenUsage;
}

/** LLM 工具调用返回的函数调用信息 */
export interface ToolCallInfo {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

/** chatWithTools 的消息内容类型 */
type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

/** chatWithTools 的消息类型 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: MessageContent | null;
  tool_call_id?: string;
  tool_calls?: ToolCallInfo[];
}

/** OpenAI function calling 格式的工具定义 schema */
export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Agent 循环的默认最大工具调用轮数 */
const DEFAULT_MAX_AGENT_ROUNDS = 5;

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT = 120000;

/**
 * 统一 LLM 调用服务
 * 整合 LLMClient 和 DiagnosisService 中的 LLM 调用逻辑，
 * 提供基础聊天、工具调用、流式输出和 Agent 循环等能力
 */
export class LLMService {
  private config: LLMConfig;
  private log = logger.child('LLMService');

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** 更新 LLM 配置 */
  updateConfig(config: LLMConfig): void {
    this.config = config;
  }

  /** 获取当前 LLM 配置 */
  getConfig(): LLMConfig {
    return this.config;
  }

  /**
   * 基础聊天接口（来自 LLMClient.chat）
   * 仅支持 system + user 消息，适用于简单的问答场景
   * @param options - 聊天选项，包含 systemPrompt、userPrompt 等
   * @returns 聊天结果，包含 content 和可选的 finishReason
   */
  async chat(options: LLMChatOptions): Promise<LLMChatResult> {
    const url = `${this.config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

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
          message?: { content?: string };
          finish_reason?: string;
        }[];
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };
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

      // 提取 token 用量信息
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined;

      return {
        content,
        finishReason: choice?.finish_reason,
        usage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 支持 function calling 的聊天接口（来自 DiagnosisService.callLLMWithTools）
   * 当 LLM 支持 tool calling 时，返回可能包含 tool_calls；
   * 当 LLM 不支持或直接给出最终答案时，仅返回 content
   * @param messages - 完整的聊天消息列表
   * @param config - LLM 配置
   * @param tools - 可选的工具定义 schema 列表
   * @returns 包含 content 和可选 toolCalls 的响应对象
   */
  async chatWithTools(
    messages: ChatMessage[],
    config: LLMConfig,
    tools?: ToolSchema[]
  ): Promise<{ content: string | null; toolCalls?: ToolCallInfo[]; usage?: TokenUsage }> {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

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
      } else {
        body.response_format = { type: 'json_object' };
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
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const message = data.choices?.[0]?.message;

      // 提取 token 用量信息
      const usage = data.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
            totalTokens: data.usage.total_tokens ?? 0,
          }
        : undefined;

      return {
        content: message?.content ?? null,
        toolCalls: message?.tool_calls,
        usage,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 流式调用 LLM API，逐块返回生成内容（来自 DiagnosisService.callLLMStream）
   * @param prompt - 包含 system 和 user 的提示对象
   * @param config - LLM 配置
   * @yields 逐块的文本内容片段
   */
  async *chatStream(
    prompt: { system: string; user: string },
    config: LLMConfig
  ): AsyncGenerator<string, void, unknown> {
    const url = `${config.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

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
            // 跳过无效 JSON
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Agent 多轮推理循环（来自 DiagnosisService.agentLoop）
   * 首先尝试带 tools 参数调用 LLM，如果 LLM 支持 function calling 则进入工具调用循环，
   * 最多执行 MAX_AGENT_ROUNDS 轮；如果不支持则自动降级为单次调用模式
   * @param prompt - 包含 system 和 user 的提示对象
   * @param config - LLM 配置
   * @param tools - 可选的工具定义 schema 列表
   * @param screenshotBase64 - 可选的截图 base64 编码
   * @param toolExecutor - 工具执行回调函数，接收工具名和参数，返回执行结果字符串
   * @returns 包含响应文本、推理步骤和分析模式的结果对象
   */
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
    // 累计 token 用量
    let accPrompt = 0;
    let accCompletion = 0;
    let accTotal = 0;

    /** 累加一次调用的 usage */
    const accumulateUsage = (usage?: TokenUsage) => {
      if (!usage) {
        return;
      }
      accPrompt += usage.promptTokens;
      accCompletion += usage.completionTokens;
      accTotal += usage.totalTokens;
    };

    /** 获取当前累计的 totalUsage */
    const getTotalUsage = (): TokenUsage | undefined => {
      if (accTotal === 0) {
        return undefined;
      }
      return { promptTokens: accPrompt, completionTokens: accCompletion, totalTokens: accTotal };
    };

    // 构建用户消息内容，支持附加截图
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
      // 首次调用：尝试带 tools 参数
      const firstResponse = await this.chatWithTools(messages, config, tools);
      accumulateUsage(firstResponse.usage);

      // LLM 未返回工具调用，判断是否需要降级
      if (!firstResponse.toolCalls || firstResponse.toolCalls.length === 0) {
        const content = firstResponse.content || '';
        if (!content && !firstResponse.toolCalls) {
          // LLM 不支持 tool_calling，降级为单次调用模式
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

      // 进入 Agent 工具调用循环
      const maxRounds = config.maxAgentRounds ?? DEFAULT_MAX_AGENT_ROUNDS;
      let currentToolCalls = firstResponse.toolCalls;
      let currentContent = firstResponse.content ?? null;
      let round = 0;

      while (currentToolCalls && currentToolCalls.length > 0 && round < maxRounds) {
        round++;

        // 将 assistant 的工具调用消息加入历史
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: currentContent,
          tool_calls: currentToolCalls,
        };
        messages.push(assistantMessage);

        // 逐个执行工具调用
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

          // 通过回调执行工具，若无回调则返回提示信息
          const toolResult = toolExecutor
            ? await toolExecutor(toolCall.function.name, args)
            : `Tool execution not available: ${toolCall.function.name}`;

          step.output = toolResult.slice(0, 500);
          reasoningSteps.push(step);

          // 将工具执行结果加入消息历史
          messages.push({
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCall.id,
          });
        }

        // 再次调用 LLM，获取下一轮响应
        const nextResponse = await this.chatWithTools(messages, config, tools);
        accumulateUsage(nextResponse.usage);

        // LLM 不再发起工具调用，返回最终结果
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

      // 达到最大轮数，获取最终响应（不带 tools 以强制生成文本）
      const finalResponse = await this.chatWithTools(messages, config);
      accumulateUsage(finalResponse.usage);
      return {
        responseText: finalResponse.content || '',
        reasoningSteps,
        analysisMode: 'agent',
        totalUsage: getTotalUsage(),
      };
    } catch (error) {
      // Agent 循环失败，降级为单次调用
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
