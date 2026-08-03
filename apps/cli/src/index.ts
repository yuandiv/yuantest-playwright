export { Orchestrator, ShardOptimizer } from '@yuantest/executor';
export { Executor, ParallelExecutor } from '@yuantest/executor';
export { PlaywrightReportParser } from '@yuantest/executor';
export type { PlaywrightJSONReport, ParsedReport } from '@yuantest/executor';
export { ProgressTracker } from '@yuantest/executor';
export type { ProgressMessage } from '@yuantest/executor';
export { Reporter, JSONReporter } from '@yuantest/reporter';
export { RealtimeReporter, RealtimeReporterClient } from '@yuantest/reporter';
export { FlakyTestManager } from '@yuantest/flaky';
export { RootCauseAnalyzer } from '@yuantest/flaky';
export { TrendAnalyzer } from '@yuantest/flaky';
export { FlakyPredictor } from '@yuantest/flaky';
export { QuarantineStrategyManager } from '@yuantest/flaky';
export { CausalGraphBuilder } from '@yuantest/flaky';
export { AgentService } from './ai/agents';
export { ChatService } from './ai/chat/chat-service';
export { UnifiedAIService, SSEEvent } from './ai/ai-service';
export { PlannerAgent } from './ai/agents/planner';
export { GeneratorAgent } from './ai/agents/generator';
export { HealerAgent } from './ai/agents/healer';
export { DashboardServer } from './ui/server';
export {
  PlaywrightConfigBuilder,
  PlaywrightConfigOptions,
  loadConfigFile,
  mergeConfig,
  getDashboardConfig,
  PlaywrightConfigMerger,
  configMerger,
} from '@yuantest/core';
export type {
  YuanTestConfigFile,
  PlaywrightProjectConfig,
  PlaywrightConfigFile as PlaywrightNativeConfigFile,
  MergedPlaywrightConfig,
  ConfigValidationResult,
} from '@yuantest/core';
export { TraceManager } from '@yuantest/executor';
export { AnnotationManager } from '@yuantest/reporter';
export { TagManager } from '@yuantest/reporter';
export { ArtifactManager } from '@yuantest/reporter';
export { VisualTestingManager } from '@yuantest/reporter';
export { logger, Logger, ChildLogger } from '@yuantest/core';
export {
  StorageProvider,
  MemoryStorage,
  FilesystemStorage,
  getStorage,
  setStorage,
} from '@yuantest/core';
export { BaseManager, ManagedManager, Initializable } from '@yuantest/core';
export { LRUCache, TTLCache, createCache } from '@yuantest/core';
export { TestDiscovery } from '@yuantest/executor';
export type { PaginatedTestDiscoveryResult } from '@yuantest/executor';
export {
  asyncHandler,
  validateBody,
  validateQuery,
  validateParams,
  errorHandler,
  notFoundHandler,
  createAppError,
} from '@yuantest/core';
export {
  TestConfigSchema,
  StartRunRequestSchema,
  SetTestDirRequestSchema,
  SavePreferencesRequestSchema,
  validateTestConfig,
  validateStartRunRequest,
  validateSetTestDirRequest,
  validateSavePreferencesRequest,
  getDefaultConfig,
} from '@yuantest/core';
export {
  DEFAULTS,
  CACHE_CONFIG,
  FLAKY_CONFIG,
  WEBSOCKET_CONFIG,
  FILE_PATTERNS,
  HTTP_STATUS,
  PROGRESS_MARKER,
  LOG_LEVELS,
} from '@yuantest/core';

export { ServiceContainer } from '@yuantest/core';
export type { Factory, Lifecycle } from '@yuantest/core';
export { MutableRef } from '@yuantest/core';
export { TOKENS } from '@yuantest/core';
export type { ServiceToken } from '@yuantest/core';
export { registerCoreServices } from './container/registrations';
export type { ContainerOptions } from './container/registrations';

export {
  TestConfig,
  BrowserType,
  TestResult,
  SuiteResult,
  RunResult,
  FlakyTest,
  FlakyHistoryEntry,
  QuarantineConfig,
  OrchestrationConfig,
  TestAssignment,
  RealTimeMessage,
  RunProgress,
  DashboardStats,
  FailureAnalysis,
  PlaywrightRunnerError,
  AnnotationType,
  Annotation,
  AnnotationConfig,
  TagConfig,
  TagInfo,
  TraceConfig,
  TraceFile,
  ArtifactConfig,
  ArtifactType,
  Artifact,
  VisualTestingConfig,
  VisualTestStatus,
  VisualTestResult,
  VisualTestComparison,
  FlakyClassification,
  RootCauseType,
  RootCauseAnalysis,
  RootCauseEvidence,
  CorrelationType,
  CorrelationGroup,
  QuarantineStrategyType,
  IsolationLevel,
  QuarantineStrategy,
  RetryPolicy,
  TrendDataPoint,
  TrendDirection,
  TrendAnalysis,
  ChangePoint,
  SeasonalPattern,
  CodeChangeCorrelation,
  TrendForecast,
  FlakyHealthScore,
  PredictionResult,
  PredictionSignal,
  DurationAnomaly,
  CausalNode,
  CausalEdge,
  CausalGraph,
  ImpactAnalysis,
  AgentType,
  AgentLoopTarget,
  AgentConfig,
  TestPlan,
  TestPlanScenario,
  TestPlanStep,
  HealerPatch,
  AgentResult,
  AgentInitResult,
  AgentHealResult,
} from '@yuantest/contracts';
