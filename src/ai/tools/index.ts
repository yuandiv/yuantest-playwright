/**
 * tools — 工具模块统一入口
 *
 * 职责：将 Builtin 工具工厂集中导出，供 ToolRegistry.createDefaultRegistry() 调用。
 */
export { ToolSchema, ToolDefinition, ToolInfo, ToolSource, makeSchema, defineTool } from './types';

// ── Builtin 工具工厂 ────────────────────────────────────────────────
export { createReadSourceFileTool } from './builtin/read-source-file';
export { createSearchCodebaseTool } from './builtin/search-codebase';
export { createQueryTestHistoryTool } from './builtin/query-test-history';
export { createReadScreenshotTool } from './builtin/read-screenshot';
export { createRunTestTool } from './builtin/run-test';
export { createApplyPatchTool } from './builtin/apply-patch';
export { createRequestUserInputTool } from './builtin/request-user-input';
