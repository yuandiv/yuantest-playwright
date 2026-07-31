/**
 * @yuantest/executor — 执行器
 *
 * 职责：跑测试、发进度事件；不写存储、不生成报告、不做分析。
 * 结果管理器（artifacts/annotations/tags/visual/flaky）经 contracts 接口注入。
 */
export { Orchestrator, ShardOptimizer } from './orchestrator';
export { Executor, ParallelExecutor } from './executor';
export { PlaywrightReportParser } from './executor/playwright-report-parser';
export type { PlaywrightJSONReport, ParsedReport } from './executor/playwright-report-parser';
export { ProgressTracker } from './executor/progress-tracker';
export type { ProgressMessage } from './executor/progress-tracker';
export { TraceManager } from './trace';
export { TestDiscovery } from './discovery';
export type {
  DiscoveredTest,
  DiscoveredDescribe,
  DiscoveredFile,
  DiscoveredSuite,
  TestDiscoveryResult,
  PaginatedTestDiscoveryResult,
} from './discovery';
