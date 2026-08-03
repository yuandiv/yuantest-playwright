import {
  AgentSessionContext,
  AgentSessionState,
} from '@yuantest/contracts';
import { logger } from '@yuantest/core';

/**
 * 合法状态流转表。
 * key = 当前状态，value = 可流转到的下一状态集合。
 * 不在表中的流转视为非法，将被拒绝并记录警告。
 */
const VALID_TRANSITIONS: Record<AgentSessionState, AgentSessionState[]> = {
  idle: ['running'],
  running: ['running', 'interrupted', 'completed', 'error'],
  interrupted: ['running', 'error', 'completed'],
  completed: ['idle'],
  error: ['idle', 'running'],
};

/**
 * 会话上下文管理器。
 * 负责会话的创建、查询、更新和清理，
 * 将会话生命周期管理从 AgentService 中解耦。
 *
 * 同时维护会话状态机（HITL 支持）：
 * - `idle → running`（Agent 开始执行）
 * - `running → interrupted`（HITL 暂停，等待 continue）
 * - `running → completed | error`（Agent 调用结束）
 * - `interrupted → running`（人工 continue 后恢复）
 *
 * 状态流转受 `VALID_TRANSITIONS` 约束，非法流转被拒绝并记录警告，
 * 以便调用方尽早发现状态机使用错误。
 */
export class AgentSessionManager {
  private activeSessions: Map<string, AgentSessionContext> = new Map();
  private log = logger.child('AgentSessionManager');

  /** 创建新的会话上下文 */
  createSession(): AgentSessionContext {
    const session: AgentSessionContext = {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
      state: 'idle',
      stateUpdatedAt: Date.now(),
    };
    this.activeSessions.set(session.sessionId, session);
    return session;
  }

  /** 获取指定会话 */
  getSession(sessionId: string): AgentSessionContext | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * 更新会话任意字段（向后兼容入口）。
   * 注意：若 updates 中包含 `state`，将走状态机校验路径；
   * 若状态非法，state 字段不会被更新，但其他字段仍会更新。
   */
  updateSession(sessionId: string, updates: Partial<AgentSessionContext>): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return;
    }
    if ('state' in updates && updates.state !== undefined) {
      this.transitionState(session, updates.state, updates.interruptReason);
    }
    // 移除已由 transitionState 处理过的字段，避免重复赋值
    const { state: _s, interruptReason: _r, ...rest } = updates;
    Object.assign(session, rest);
  }

  /**
   * 驱动状态机流转。
   *
   * @param session 目标会话
   * @param nextState 期望的下一状态
   * @param interruptReason 进入 interrupted 时的原因（其他状态忽略）
   * @returns true 表示流转成功，false 表示非法流转（已记录警告）
   */
  transitionState(
    session: AgentSessionContext,
    nextState: AgentSessionState,
    interruptReason?: string
  ): boolean {
    const current = session.state ?? 'idle';
    const allowed = VALID_TRANSITIONS[current] ?? [];
    if (!allowed.includes(nextState)) {
      this.log.warn(
        `非法状态流转：${current} → ${nextState}（sessionId=${session.sessionId}）。` +
          `合法目标：[${allowed.join(', ')}]`
      );
      return false;
    }
    session.state = nextState;
    session.stateUpdatedAt = Date.now();
    // 仅在进入 interrupted 时记录原因；离开时清空
    if (nextState === 'interrupted') {
      session.interruptReason = interruptReason ?? 'unspecified';
    } else if (current === 'interrupted' && nextState === 'running') {
      session.interruptReason = undefined;
    }
    return true;
  }

  /**
   * 判断会话是否处于可 continue 的中断态。
   * 用于 HITL 场景：UI 端据此决定是否显示"继续"按钮。
   */
  isInterrupted(sessionId: string): boolean {
    return this.activeSessions.get(sessionId)?.state === 'interrupted';
  }

  /** 清理会话 */
  cleanupSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
  }

  /** 获取活跃会话数量 */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}
