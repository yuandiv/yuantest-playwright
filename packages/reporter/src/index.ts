/**
 * @yuantest/reporter — 报告器
 *
 * 职责：报告生成、实时推送、结果管理（artifacts/annotations/tags/visual）。
 * 依赖：contracts、core、diagnosis（纯规则分类）；ai/flaky 仅经 contracts 接口注入。
 */
export { Reporter, JSONReporter } from './reporter';
export type { RunResultSummary } from './reporter';
export { RealtimeReporter, RealtimeReporterClient } from './realtime';
export { ArtifactManager } from './artifacts';
export { AnnotationManager } from './annotations';
export { TagManager } from './tags';
export { VisualTestingManager } from './visual';
