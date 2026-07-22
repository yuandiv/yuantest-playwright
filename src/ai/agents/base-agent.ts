import * as path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../../logger';
import { LLMService, TokenUsage } from './llm-service';
import { ToolRegistry } from './tool-registry';
import { AgentConfig, LLMConfig } from '../../types';
import {
  AgentHooks,
  AgentContext,
  AgentMessageEvent,
  AgentPersistEvent,
  AgentErrorEvent,
} from './agent-hooks';
import {
  AGENT_EVENT,
  AgentStart,
  AgentMessage,
  AgentPersist,
  AgentError,
} from './agent-events';

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
  /** 已注册的钩子列表，按注册顺序串行执行 */
  private hooks: AgentHooks[] = [];
  /** 当前 Agent 上下文（由 withContext 设置，供钩子读取） */
  private currentContext: AgentContext = { agentName: '' };
  /**
   * Agent 事件总线（Phase D — 事件流与可观测性）
   * UI / 遥测 / 日志层可通过 on() 订阅 agent.* 事件，与 Agent 主流程解耦。
   */
  private eventBus = new EventEmitter();
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

  // ─── 钩子（AgentHooks）注册与触发 ───────────────────────────

  /**
   * 订阅 Agent 事件总线（Phase D — 事件流与可观测性）。
   * UI / 遥测 / 日志层可通过此方法订阅 agent.* 事件，与 Agent 主流程解耦。
   *
   * @param eventName 事件名（见 AGENT_EVENT 常量）
   * @param listener 事件载荷监听器
   * @returns unsubscribe 函数
   */
  on(eventName: string, listener: (payload: unknown) => void): () => void {
    this.eventBus.on(eventName, listener);
    return () => {
      this.eventBus.off(eventName, listener);
    };
  }

  /** 一次性订阅：触发一次后自动注销 */
  once(eventName: string, listener: (payload: unknown) => void): () => void {
    this.eventBus.once(eventName, listener);
    return () => {
      this.eventBus.off(eventName, listener);
    };
  }

  /**
   * emit 辅助方法：把事件总线广播封装为类型安全的形式。
   * 同时吞掉 listener 异常，避免污染主流程。
   */
  private emitAgentEvent(eventName: string, payload: unknown): void {
    try {
      this.eventBus.emit(eventName, payload);
    } catch (err) {
      this.log.warn(
        `emit ${eventName} listener failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** 暴露事件总线实例，供 llm-service agentLoopStream 回调注入时直接 emit */
  getEventBus(): EventEmitter {
    return this.eventBus;
  }

  /**
   * 注册一个钩子。钩子按注册顺序串行执行。
   * 链式调用：`agent.use(hook1).use(hook2)`。
   */
  use(hook: AgentHooks): this {
    this.hooks.push(hook);
    this.log.debug(`Hook registered: ${hook.name} (total=${this.hooks.length})`);
    return this;
  }

  /**
   * 设置当前 Agent 上下文，供钩子读取 runId/testId/sessionId。
   * 返回一个 restore 函数，调用后恢复原上下文（用于 try/finally）。
   *
   * Phase D：同时触发 agent.start 事件，携带完整上下文。
   */
  withContext(ctx: Partial<AgentContext>): () => void {
    const previous = this.currentContext;
    this.currentContext = {
      agentName: this.getAgentName(),
      ...ctx,
    };
    // 触发 agent.start 事件
    const startPayload: AgentStart = {
      agentName: this.currentContext.agentName,
      sessionId: this.currentContext.sessionId,
      runId: this.currentContext.runId,
      testId: this.currentContext.testId,
    };
    this.emitAgentEvent(AGENT_EVENT.START, startPayload);
    return () => {
      this.currentContext = previous;
    };
  }

  /**
   * 触发 onStart 钩子链。
   * 任一钩子返回非 null 即短路（缓存命中）。
   */
  protected async triggerOnStart(input: unknown): Promise<unknown | null> {
    for (const hook of this.hooks) {
      if (!hook.onStart) continue;
      const result = await hook.onStart(this.currentContext, input);
      if (result !== null && result !== undefined) {
        return result;
      }
    }
    return null;
  }

  /** 触发 onMessage 钩子链，同时 emit agent.message 事件 */
  protected async triggerOnMessage(event: AgentMessageEvent): Promise<void> {
    // 先 emit 事件总线（UI / 遥测层订阅）
    const payload: AgentMessage = {
      agentName: this.currentContext.agentName,
      systemPrompt: event.systemPrompt,
      userPrompt: event.userPrompt,
      response: event.response,
      usage: event.usage,
      durationMs: event.durationMs,
      sessionId: this.currentContext.sessionId,
    };
    this.emitAgentEvent(AGENT_EVENT.MESSAGE, payload);
    // 再串行执行钩子链
    for (const hook of this.hooks) {
      if (hook.onMessage) {
        await hook.onMessage(this.currentContext, event);
      }
    }
  }

  /** 触发 onPersist 钩子链，同时 emit agent.persist 事件 */
  protected async triggerOnPersist(event: AgentPersistEvent): Promise<void> {
    const payload: AgentPersist = {
      agentName: this.currentContext.agentName,
      key: event.key,
      result: event.result,
      category: event.category,
      sessionId: this.currentContext.sessionId,
    };
    this.emitAgentEvent(AGENT_EVENT.PERSIST, payload);
    for (const hook of this.hooks) {
      if (hook.onPersist) {
        await hook.onPersist(this.currentContext, event);
      }
    }
  }

  /** 触发 onError 钩子链，同时 emit agent.error 事件 */
  protected async triggerOnError(event: AgentErrorEvent): Promise<void> {
    const payload: AgentError = {
      agentName: this.currentContext.agentName,
      error: event.error,
      context: event.context,
      sessionId: this.currentContext.sessionId,
    };
    this.emitAgentEvent(AGENT_EVENT.ERROR, payload);
    for (const hook of this.hooks) {
      if (hook.onError) {
        await hook.onError(this.currentContext, event);
      }
    }
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
   *
   * 钩子触发：
   * - 调用完成后触发 onMessage（携带 prompt 摘要、响应、token 用量、耗时）
   * - 异常时触发 onError，再重新抛出
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
    const startMs = Date.now();

    try {
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

      // 触发 onMessage 钩子（不阻塞主流程的错误传播）
      await this.triggerOnMessage({
        systemPrompt,
        userPrompt,
        response: result.content,
        usage: result.usage,
        durationMs: Date.now() - startMs,
      }).catch((err) => {
        this.log.warn(`onMessage hook failed: ${err instanceof Error ? err.message : String(err)}`);
      });

      return result.content;
    } catch (error) {
      // 触发 onError 钩子（吞掉钩子自身错误，仅记录）
      await this.triggerOnError({
        error,
        context: `callLLM(systemPrompt.length=${systemPrompt.length})`,
      }).catch((err) => {
        this.log.warn(`onError hook failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      throw error;
    }
  }
}
