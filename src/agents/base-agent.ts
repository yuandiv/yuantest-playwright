import { logger } from '../logger';
import { LLMService, ToolSchema, TokenUsage } from './llm-service';
import { LLMClient } from './llm-client';
import { AgentConfig, LLMConfig, ReasoningStep } from '../types';

/** callLLM 方法的可选参数 */
export interface CallLLMOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
  timeout?: number;
}

/** callLLMWithAgentLoop 方法的返回结果 */
export interface AgentLoopResult {
  responseText: string;
  reasoningSteps: ReasoningStep[];
  analysisMode: 'agent' | 'single' | 'fallback';
}

/**
 * Agent 基类，封装 PlannerAgent、GeneratorAgent、HealerAgent 的共享逻辑
 * 包括配置管理、LLM 调用、Agent 循环等通用能力
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected llmService: LLMService | null;
  protected log = logger.child(this.getAgentName());
  /** 最近一次 callLLM / callLLMWithAgentLoop 调用的 token 用量 */
  public lastTokenUsage?: TokenUsage;

  constructor(config: AgentConfig, llmConfig: LLMConfig | null) {
    this.config = config;
    this.llmService = llmConfig ? new LLMService(llmConfig) : null;
  }

  /** 子类必须提供 Agent 名称，用于 logger 标识 */
  protected abstract getAgentName(): string;

  /** 获取当前 LLM 配置 */
  protected getLLMConfig(): LLMConfig | null {
    return this.llmService?.getConfig() ?? null;
  }

  /**
   * 更新 Agent 配置
   * 同时更新 AgentConfig 和 LLMService
   * @param extraParams 子类可 override 处理的额外参数
   */
  updateConfig(
    config: AgentConfig,
    llmConfig: LLMConfig | null,
    extraParams?: Record<string, unknown>
  ): void {
    this.config = config;
    if (llmConfig) {
      if (this.llmService) {
        this.llmService.updateConfig(llmConfig);
      } else {
        this.llmService = new LLMService(llmConfig);
      }
    } else {
      this.llmService = null;
    }
    // 子类可 override 处理 extraParams
  }

  /**
   * 基础 LLM 调用方法（单次调用模式）
   * 子类可通过 options 参数覆盖默认的 maxTokens、temperature 等配置
   */
  protected async callLLM(
    systemPrompt: string,
    userPrompt: string,
    options?: CallLLMOptions
  ): Promise<string> {
    if (!this.llmService) {
      throw new Error('LLM config is not set');
    }

    const llmConfig = this.llmService.getConfig();

    const result = await this.llmService.chat({
      systemPrompt,
      userPrompt,
      maxTokens: options?.maxTokens ?? llmConfig.maxTokens,
      temperature: options?.temperature ?? llmConfig.temperature ?? 0.2,
      responseFormat: options?.responseFormat,
      timeout: options?.timeout,
    });

    // 记录最近一次调用的 token 用量
    this.lastTokenUsage = result.usage;

    return result.content;
  }

  /**
   * Agent 循环调用方法（支持工具调用的多轮推理）
   * 子类可使用此方法实现更复杂的 Agent 交互逻辑
   */
  protected async callLLMWithAgentLoop(
    prompt: { system: string; user: string },
    tools: ToolSchema[],
    toolExecutor?: (toolName: string, args: Record<string, unknown>) => Promise<string>
  ): Promise<AgentLoopResult> {
    if (!this.llmService) {
      throw new Error('LLM config is not set');
    }

    const llmConfig = this.llmService.getConfig();

    const result = await this.llmService.chatWithAgentLoop(
      prompt,
      llmConfig,
      tools,
      undefined,
      toolExecutor
    );

    // 记录多轮调用的累计 token 用量
    this.lastTokenUsage = result.totalUsage;

    return result;
  }

  /**
   * 获取 LLMClient 兼容实例（用于过渡期，后续将移除）
   * @deprecated 仅用于向后兼容，新代码应直接使用 llmService
   */
  protected getLLMClientCompat(): LLMClient | null {
    if (!this.llmService) {
      return null;
    }
    const config = this.llmService.getConfig();
    return new LLMClient(config);
  }
}
