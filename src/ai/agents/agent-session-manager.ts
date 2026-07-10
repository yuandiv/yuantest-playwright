import { AgentSessionContext } from '../../types';

/**
 * 会话上下文管理器。
 * 负责会话的创建、查询、更新和清理，
 * 将会话生命周期管理从 AgentService 中解耦。
 */
export class AgentSessionManager {
  private activeSessions: Map<string, AgentSessionContext> = new Map();

  /** 创建新的会话上下文 */
  createSession(): AgentSessionContext {
    const session: AgentSessionContext = {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
    this.activeSessions.set(session.sessionId, session);
    return session;
  }

  /** 获取指定会话 */
  getSession(sessionId: string): AgentSessionContext | undefined {
    return this.activeSessions.get(sessionId);
  }

  /** 更新会话状态 */
  updateSession(sessionId: string, updates: Partial<AgentSessionContext>): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      Object.assign(session, updates);
    }
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
