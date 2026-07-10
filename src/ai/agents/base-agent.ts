import * as path from 'path';
import { logger } from '../../logger';
import { LLMService, TokenUsage } from './llm-service';
import { ToolRegistry } from './tool-registry';
import { AgentConfig, LLMConfig } from '../../types';

/** callLLM 方法的可选参数 */
export interface CallLLMOptions {
  maxTokens?: number;
  temperature?: number;
  responseFormat?: { type: string };
  timeout?: number;
}

/**
 * Agent 基类，封装 PlannerAgent、GeneratorAgent、HealerAgent 的共享逻辑
 * 包括配置管理、LLM 调用、Agent 循环等通用能力
 */
export abstract class BaseAgent {
  protected config: AgentConfig;
  protected llmService: LLMService | null;
  /** LLM 是否可用（llmConfig 为 null 时保留实例但标记不可用） */
  private llmEnabled: boolean;
  /** 共享的 ToolRegistry 实例，由 AgentService 统一管理 */
  private toolRegistry: ToolRegistry | null = null;
  protected log = logger.child(this.getAgentName());
  /** 最近一次 callLLM / callLLMWithAgentLoop 调用的 token 用量 */
  public lastTokenUsage?: TokenUsage;

  constructor(config: AgentConfig, llmConfig: LLMConfig | null, llmService?: LLMService) {
    this.config = config;
    this.llmEnabled = llmConfig?.enabled ?? false;
    if (llmService) {
      this.llmService = llmService;
    } else {
      this.llmService = llmConfig ? new LLMService(llmConfig) : null;
    }
  }

  /** 子类必须提供 Agent 名称，用于 logger 标识 */
  protected abstract getAgentName(): string;

  /**
   * 子类声明需要的额外配置 key 列表。
   * AgentService 会根据此列表传递对应的 extraParams，
   * 避免使用 instanceof / 引用相等判断。
   */
  public getRequiredExtraConfigKeys(): string[] {
    return [];
  }

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
    _extraParams?: Record<string, unknown>
  ): void {
    this.config = config;
    if (llmConfig) {
      this.llmEnabled = llmConfig.enabled;
      if (this.llmService) {
        this.llmService.updateConfig(llmConfig);
      } else {
        this.llmService = new LLMService(llmConfig);
      }
    } else {
      // 保留 LLMService 实例，仅标记为不可用，避免后续重建
      this.llmEnabled = false;
    }
    // 子类可 override 处理 extraParams
  }

  /** LLM 是否已启用 */
  protected isLLMEnabled(): boolean {
    return this.llmEnabled && this.llmService !== null;
  }

  /** 设置共享的 ToolRegistry 实例 */
  setToolRegistry(registry: ToolRegistry | null): void {
    this.toolRegistry = registry;
  }

  /** 设置共享的 LLMService 实例 */
  setLLMService(service: LLMService | null): void {
    this.llmService = service;
    this.llmEnabled = service !== null && (service.getConfig()?.enabled ?? false);
  }

  /**
   * 获取 ToolRegistry 实例。
   * 优先使用共享实例，若无则按需创建（兼容独立使用场景）。
   */
  protected getOrCreateToolRegistry(): ToolRegistry {
    if (this.toolRegistry) {
      return this.toolRegistry;
    }
    const projectRoot = this.config.projectRoot || process.cwd();
    const dataDir = path.join(projectRoot, '.yuantest');
    return ToolRegistry.createDefaultRegistry(dataDir, projectRoot);
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
}
