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
  DONE: 'agent.done',
} as const;

export type AgentEventName = (typeof AGENT_EVENT)[keyof typeof AGENT_EVENT];
