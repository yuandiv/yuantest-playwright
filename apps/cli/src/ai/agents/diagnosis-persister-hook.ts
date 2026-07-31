/**
 * DiagnosisPersisterHook — 诊断持久化钩子
 *
 * 将 DiagnosisPersister 包装为 AgentHooks 实现。
 * 通过 onPersist 事件触发磁盘写入，避免 DiagnosisAgent 内部直接调用 persister。
 *
 * 设计要点：
 * - onPersist 接收 category='diagnosis' | 'cluster' 事件，分发到对应 persister 方法
 * - 不实现 onStart（持久化不短路主入口）
 * - 不实现 onMessage/onError（持久化钩子不关心 LLM 调用细节）
 */
import { AgentHooks, AgentContext, AgentPersistEvent } from './agent-hooks';
import { DiagnosisPersister } from '../../diagnosis/diagnosis-persister';
import type { AIDiagnosis } from '../../types';

export class DiagnosisPersisterHook implements AgentHooks {
  readonly name = 'diagnosis-persister';
  private persister: DiagnosisPersister;
  /**
   * runId 解析器：从 AgentContext 提取 runId。
   * 默认取 ctx.runId；若调用方需要自定义可传入。
   */
  private runIdFn: (ctx: AgentContext) => string;

  constructor(
    persister: DiagnosisPersister,
    runIdFn: (ctx: AgentContext) => string = (ctx) => ctx.runId ?? ''
  ) {
    this.persister = persister;
    this.runIdFn = runIdFn;
  }

  /**
   * onPersist：根据 category 分发到 persister 对应方法
   * - category='diagnosis' → saveDiagnosis(runId, testId, AIDiagnosis)
   * - category='cluster'   → saveClusterResult(runId, unknown[])
   * - 其他 category 忽略
   */
  async onPersist(ctx: AgentContext, event: AgentPersistEvent): Promise<void> {
    const runId = this.runIdFn(ctx);
    if (!runId) {
      return;
    }

    if (event.category === 'diagnosis') {
      const testId = event.key || ctx.testId || '';
      if (!testId) {
        return;
      }
      await this.persister.saveDiagnosis(runId, testId, event.result as AIDiagnosis);
      return;
    }

    if (event.category === 'cluster') {
      await this.persister.saveClusterResult(runId, event.result as unknown[]);
      return;
    }
    // 未知 category 忽略
  }

  /** 暴露底层 persister 供 loadDiagnosis / loadClusterResult 等读路径使用 */
  getPersister(): DiagnosisPersister {
    return this.persister;
  }
}
