/**
 * AgentEvents — 统一 Agent 事件流类型定义
 *
 * 设计目标（Phase D — 事件流与可观测性）：
 * - 把散落在 llm-service agentLoopStream / BaseAgent callLLM / ai-service sendMessage 中的
 *   事件命名（token / tool_call / tool_result / thinking / done / error）归一为
 *   agent.* 命名空间，便于 UI 端订阅与渲染
 * - 通过 EventEmitter 事件总线广播，UI / 遥测 / 日志层可各自订阅，互不耦合
 *
 * 事件命名约定（emit 时使用）：
 * - 'agent.start'      → AgentStart
 * - 'agent.token'      → AgentToken
 * - 'agent.thinking'   → AgentThinking
 * - 'agent.tool_call'  → AgentToolCall
 * - 'agent.tool_result' → AgentToolResult
 * - 'agent.message'    → AgentMessage（单次 LLM 调用完成）
 * - 'agent.persist'    → AgentPersist（结果落盘）
 * - 'agent.error'      → AgentError
 * - 'agent.interrupt'  → AgentInterrupt（HITL 暂停，等待 continue）
 * - 'agent.continue'   → AgentContinue（人工 continue 后恢复）
 * - 'agent.done'       → AgentDone
 */

import type { TokenUsage } from './llm-service';
import type { ReasoningStep } from '../../types';

/** Agent 主入口开始 */
export interface AgentStart {
  agentName: string;
  /** 关联的会话 / run / test 标识（可选） */
  sessionId?: string;
  runId?: string;
  testId?: string;
  /** 输入摘要（钩子/调用方可塞入，不强约束） */
  inputSummary?: string;
}

/** 流式 token �量 */
export interface AgentToken {
  agentName: string;
  /** 本次增量文本 */
  data: string;
  /** 关联的会话 id（可选） */
  sessionId?: string;
}

/** 流式思考内容增量 */
export interface AgentThinking {
  agentName: string;
  data: string;
  sessionId?: string;
}

/** 工具调用开始 */
export interface AgentToolCall {
  agentName: string;
  /** 工具名 */
  name: string;
  /** 工具参数（JSON 字符串，与 llm-service 一致） */
  arguments: string;
  /** 本轮轮次（可选，用于关联 tool_result） */
  round?: number;
  sessionId?: string;
}

/** 工具调用返回 */
export interface AgentToolResult {
  agentName: string;
  name: string;
  /** 工具执行结果（字符串） */
  result: string;
  /** 关联的 tool_call 轮次（可选） */
  round?: number;
  sessionId?: string;
}

/** 单次 LLM 调用完成（对应 BaseAgent.callLLM） */
export interface AgentMessage {
  agentName: string;
  systemPrompt?: string;
  userPrompt?: string;
  /** LLM 响应文本 */
  response: string;
  /** 本次调用的 token 用量 */
  usage?: TokenUsage;
  /** 调用耗时（毫秒） */
  durationMs: number;
  sessionId?: string;
}

/** 结果落盘 */
export interface AgentPersist {
  agentName: string;
  /** 持久化键（由调用方约定） */
  key: string;
  /** 待持久化的结果对象 */
  result: unknown;
  /** 持久化类别（如 'diagnosis' / 'cluster'） */
  category?: string;
  sessionId?: string;
}

/** Agent 执行过程中抛错 */
export interface AgentError {
  agentName: string;
  /** 错误对象 */
  error: Error | unknown;
  /** 错误发生时的上下文描述 */
  context?: string;
  sessionId?: string;
}

/**
 * HITL 暂停事件（对应 BaseAgent.interrupt / HealerAgent 的 patch-awaiting-approval）。
 *
 * 触发时机：Agent 在执行中遇到需要人工决策的关卡
 * （如 HealerAgent 生成补丁后等待审批），调用 `BaseAgent.interrupt(reason)` 时发出。
 *
 * UI 端订阅此事件后：
 * - 显示暂停原因与待审批内容（如补丁 diff）
 * - 提供继续/修改/终止按钮
 * - 用户决策后通过 `BaseAgent.continue(decision)` 恢复
 */
export interface AgentInterrupt {
  agentName: string;
  /** 进入中断的原因标识（如 'patch-awaiting-approval'） */
  reason: string;
  /**
   * 中断上下文（可由具体 Agent 自定义）。
   * 例：HealerAgent 可塞入 `{ round, patches, testFile }` 供 UI 渲染补丁预览。
   */
  payload?: Record<string, unknown>;
  sessionId?: string;
  /** 关联的 run / test 标识（可选） */
  runId?: string;
  testId?: string;
}

/**
 * HITL 恢复事件（对应 BaseAgent.continue）。
 *
 * 触发时机：UI 端通过 `BaseAgent.continue(decision)` 恢复被 `interrupt` 暂停的 Agent。
 *
 * `decision` 语义由具体 Agent 约定：
 * - HealerAgent：`{ approved: true }` 写入补丁；`{ approved: false, modifiedPatch?: string }` 修改或放弃
 */
export interface AgentContinue {
  agentName: string;
  /** 用户/调用方提供的恢复决策 */
  decision: Record<string, unknown>;
  sessionId?: string;
  runId?: string;
  testId?: string;
}

/** Agent Loop 完成（对应 llm-service agentLoopStream 的 done 事件） */
export interface AgentDone {
  agentName: string;
  /** 最终文本响应 */
  content: string;
  /** 思考内容累积 */
  thinkingContent: string | null;
  /** 分析模式：'agent'（多轮工具）/ 'single'（单次）/ 'fallback'（降级） */
  analysisMode: 'agent' | 'single' | 'fallback';
  /** 推理步骤链（工具调用历史） */
  reasoningSteps: ReasoningStep[];
  /** 累计 token 用量 */
  totalUsage?: TokenUsage;
  /** 是否被配额截断 */
  truncated?: boolean;
  sessionId?: string;
  /**
   * 缓冲区统一 flush（借鉴 anything-llm AIbitat `_pendingCitations`/`_toolAttachments`）。
   *
   * 在 agent loop 执行过程中，工具可能产生引用、附件等副作用。
   * 这些副作用不逐条 emit，而是缓冲在 BaseAgent 上，
   * 等响应最终化时随 done 事件一次性 flush，简化前端聚合逻辑。
   *
   * 默认空数组；仅当工具主动 push 到缓冲区时才非空。
   */
  pendingCitations?: PendingCitation[];
  pendingAttachments?: PendingAttachment[];
}

/**
 * 引用缓冲项（对应 anything-llm AIbitat `_pendingCitations`）。
 *
 * 工具执行过程中产生的文档引用/来源信息，
 * 缓冲在 BaseAgent 上，随 done 事件统一 flush。
 * UI 端可据此渲染"引用来源"侧栏。
 */
export interface PendingCitation {
  /** 引用唯一标识（前端 key 用） */
  id: string;
  /** 引用标题（如文档名、文件名） */
  title: string;
  /** 引用文本内容（片段） */
  text: string;
  /** 引用来源路径（可选，如 chunkSource） */
  chunkSource?: string;
  /** 相关性分数（可选，0-1） */
  score?: number;
}

/**
 * 附件缓冲项（对应 anything-llm AIbitat `_toolAttachments`）。
 *
 * 工具执行过程中产生的图片等附件，
 * 缓冲在 BaseAgent 上，随 done 事件统一 flush。
 * 这些附件会作为 user message 注入对话，使 provider 既有附件处理生效。
 */
export interface PendingAttachment {
  /** 附件名称（如 'screenshot.png'） */
  name: string;
  /** MIME 类型（如 'image/png'） */
  mime: string;
  /** 附件内容（Base64 编码字符串） */
  contentString: string;
}

/** 所有事件类型的联合（供 EventEmitter 监听时做类型 narrowing） */
export type AgentEvent =
  | { type: 'agent.start'; payload: AgentStart }
  | { type: 'agent.token'; payload: AgentToken }
  | { type: 'agent.thinking'; payload: AgentThinking }
  | { type: 'agent.tool_call'; payload: AgentToolCall }
  | { type: 'agent.tool_result'; payload: AgentToolResult }
  | { type: 'agent.message'; payload: AgentMessage }
  | { type: 'agent.persist'; payload: AgentPersist }
  | { type: 'agent.error'; payload: AgentError }
  | { type: 'agent.interrupt'; payload: AgentInterrupt }
  | { type: 'agent.continue'; payload: AgentContinue }
  | { type: 'agent.done'; payload: AgentDone };

/** 事件名常量（避免魔法字符串） */
export const AGENT_EVENT = {
  START: 'agent.start',
  TOKEN: 'agent.token',
  THINKING: 'agent.thinking',
  TOOL_CALL: 'agent.tool_call',
  TOOL_RESULT: 'agent.tool_result',
  MESSAGE: 'agent.message',
  PERSIST: 'agent.persist',
  ERROR: 'agent.error',
  INTERRUPT: 'agent.interrupt',
  CONTINUE: 'agent.continue',
  DONE: 'agent.done',
} as const;

export type AgentEventName = (typeof AGENT_EVENT)[keyof typeof AGENT_EVENT];
