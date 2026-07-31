/**
 * DiagnosisCacheHook — 诊断缓存钩子
 *
 * 将 DiagnosisCache 包装为 AgentHooks 实现，通过 onStart 短路命中缓存，
 * 不再在 DiagnosisAgent 内部直接调用 cache.get/set。
 *
 * 设计要点：
 * - onStart 返回缓存命中结果以短路 Agent 主入口
 * - 缓存写入由 DiagnosisAgent 在 finalize 后通过 triggerOnPersist 触发
 *   （onPersist 在缓存钩子里不做处理，由 PersisterHook 处理）
 * - 缓存键由调用方通过 AgentContext.testId 传入，钩子据此查缓存
 */
import { AgentHooks, AgentContext } from './agent-hooks';
import { DiagnosisCache } from '../../diagnosis/diagnosis-cache';
import type { AIDiagnosis } from '@yuantest/contracts';

export class DiagnosisCacheHook implements AgentHooks {
  readonly name = 'diagnosis-cache';
  private cache: DiagnosisCache;
  /** 缓存键生成器：从 AgentContext 提取 testId 作为键 */
  private keyFn: (ctx: AgentContext) => string;

  constructor(
    cache: DiagnosisCache,
    keyFn: (ctx: AgentContext) => string = (ctx) => ctx.testId ?? ''
  ) {
    this.cache = cache;
    this.keyFn = keyFn;
  }

  /**
   * onStart：检查缓存命中
   * @returns 缓存命中的 AIDiagnosis，否则 null
   */
  async onStart(ctx: AgentContext, _input: unknown): Promise<AIDiagnosis | null> {
    const key = this.keyFn(ctx);
    if (!key) {
      return null;
    }
    return this.cache.get(key);
  }

  /**
   * 写入缓存（由调用方通过 triggerOnPersist 触发，category='diagnosis'）
   * 这里复用 onPersist 语义：persist 事件携带 result，钩子据此写缓存
   */
  async onPersist(ctx: AgentContext, event: { key: string; result: unknown; category?: string }): Promise<void> {
    if (event.category !== 'diagnosis') {
      return;
    }
    const key = event.key || this.keyFn(ctx);
    if (!key) {
      return;
    }
    this.cache.set(key, event.result as AIDiagnosis);
  }

  /** 清空缓存 */
  clear(): void {
    this.cache.clear();
  }
}
