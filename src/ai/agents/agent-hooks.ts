/**
 * AgentHooks — Agent 横切关注点插件接口（参考 anything-llm Aibitat 的 plugin 钩子）
 *
 * 设计目标：
 * - 将散落在各 Agent 中的缓存、持久化、遥测、日志等横切逻辑抽离为可插拔钩子
 * - 通过 `BaseAgent.use(hook)` 注册，钩子按注册顺序串行执行
 * - 钩子可选实现任意子集（只关心缓存的钩子无需实现 onPersist）
 *
 * 事件类型：
 * - onStart：Agent 主入口（如 diagnose / healTest / generateTests）调用前
 * - onMessage：单次 LLM 调用完成后（含 prompt 摘要、响应、token 用量）
 * - onPersist：Agent 产生需要持久化的结果时（如 AIDiagnosis）
 * - onError：Agent 执行过程中抛错时
 *
 * 每个事件携带 AgentContext（agentName + 可选 runId/testId/sessionId），
 * 钩子可据此做缓存键生成、日志打标、遥测上报等。
 */

/** 钩子触发时的 Agent 上下文 */
export interface AgentContext {
  /** Agent 标识，如 'DiagnosisAgent' / 'HealerAgent' */
  agentName: string;
  /** 关联的 run id（可选） */
  runId?: string;
  /** 关联的 test id（可选） */
  testId?: string;
  /** 会话 id（可选，用于跨调用关联） */
  sessionId?: string;
}

/** onMessage 事件载荷 */
export interface AgentMessageEvent {
  /** 系统提示（可为空） */
  systemPrompt?: string;
  /** 用户提示（可为空） */
  userPrompt?: string;
  /** LLM 响应文本 */
  response: string;
  /** 本次调用的 token 用量（可选） */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 调用耗时（毫秒） */
  durationMs: number;
}

/** onPersist 事件载荷 */
export interface AgentPersistEvent {
  /** 持久化键（由钩子自行解释，如 'runId::testId'） */
  key: string;
  /** 待持久化的结果对象 */
  result: unknown;
  /** 持久化类别（由调用方约定，如 'diagnosis' / 'cluster'） */
  category?: string;
}

/** onError 事件载荷 */
export interface AgentErrorEvent {
  /** 错误对象 */
  error: Error | unknown;
  /** 错误发生时的上下文描述（可选） */
  context?: string;
}

/**
 * AgentHooks 接口 — 钩子实现者只需 override 关心的方法。
 *
 * 用法示例（缓存钩子）：
 * ```ts
 * class CacheHook implements AgentHooks {
 *   constructor(private cache: Map<string, unknown>) {}
 *   async onStart(ctx: AgentContext, input: unknown) {
 *     // 返回缓存命中结果以短路 Agent 调用
 *     return this.cache.get(ctx.testId ?? '') ?? null;
 *   }
 *   async onMessage(ctx: AgentContext, event: AgentMessageEvent) {
 *     // 累积响应用于后续缓存
 *   }
 * }
 * ```
 */
export interface AgentHooks {
  /** 钩子名称（用于日志/调试） */
  readonly name: string;

  /**
   * Agent 主入口调用前触发。
   * 钩子可返回非 null 值以短路主入口（如缓存命中直接返回缓存结果）。
   * 多个钩子按注册顺序串行执行；任一返回非 null 则后续钩子跳过。
   *
   * @param ctx Agent 上下文
   * @param input 主入口的输入参数（钩子自行解释类型）
   * @returns 缓存命中时返回结果，否则返回 null
   */
  onStart?(ctx: AgentContext, input: unknown): Promise<unknown | null>;

  /**
   * 单次 LLM 调用完成后触发。
   * 钩子可据此做 token 统计、响应日志、缓存累积等。
   *
   * @param ctx Agent 上下文
   * @param event 消息事件载荷
   */
  onMessage?(ctx: AgentContext, event: AgentMessageEvent): Promise<void>;

  /**
   * Agent 产生需要持久化的结果时触发。
   * 钩子可据此写磁盘、写数据库等。
   *
   * @param ctx Agent 上下文
   * @param event 持久化事件载荷
   */
  onPersist?(ctx: AgentContext, event: AgentPersistEvent): Promise<void>;

  /**
   * Agent 执行过程中抛错时触发。
   * 钩子可据此做错误日志、告警、错误统计等。
   *
   * @param ctx Agent 上下文
   * @param event 错误事件载荷
   */
  onError?(ctx: AgentContext, event: AgentErrorEvent): Promise<void>;
}
