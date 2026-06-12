export { Orchestrator, ShardOptimizer } from './orchestrator';
export { Executor, ParallelExecutor } from './executor';
export { PlaywrightReportParser } from './executor/playwright-report-parser';
export type { PlaywrightJSONReport, ParsedReport } from './executor/playwright-report-parser';
export { ProgressTracker } from './executor/progress-tracker';
export type { ProgressMessage } from './executor/progress-tracker';
export { Reporter, JSONReporter } from './reporter';
export { RealtimeReporter, RealtimeReporterClient } from './realtime';
export { FlakyTestManager } from './flaky';
export { RootCauseAnalyzer } from './flaky/root-cause';
export { TrendAnalyzer } from './flaky/trend';
export { FlakyPredictor } from './flaky/predictor';
export { QuarantineStrategyManager } from './flaky/quarantine-strategy';
export { CausalGraphBuilder } from './flaky/causal-graph';
export { AgentService } from './agents';
export { ChatService } from './chat/chat-service';
export { UnifiedAIService, SSEEvent } from './ai/ai-service';
export { PlannerAgent } from './agents/planner';
export { GeneratorAgent } from './agents/generator';
export { HealerAgent } from './agents/healer';
export { DashboardServer } from './ui/server';
export {
  PlaywrightConfigBuilder,
  PlaywrightConfigOptions,
  loadConfigFile,
  mergeConfig,
  getDashboardConfig,
  PlaywrightConfigMerger,
  configMerger,
} from './config';
export type {
  YuanTestConfigFile,
  PlaywrightProjectConfig,
  PlaywrightConfigFile as PlaywrightNativeConfigFile,
  MergedPlaywrightConfig,
  ConfigValidationResult,
} from './config';
export { TraceManager } from './trace';
export { AnnotationManager } from './annotations';
export { TagManager } from './tags';
export { ArtifactManager } from './artifacts';
export { VisualTestingManager } from './visual';
export { logger, Logger, ChildLogger } from './logger';
export {
  StorageProvider,
  MemoryStorage,
  FilesystemStorage,
  getStorage,
  setStorage,
} from './storage';
export { BaseManager, ManagedManager, Initializable } from './base';
export { LRUCache, TTLCache, createCache } from './cache';
export { TestDiscovery } from './discovery';
export type { PaginatedTestDiscoveryResult } from './discovery';
export {
  asyncHandler,
  validateBody,
  validateQuery,
  validateParams,
  errorHandler,
  notFoundHandler,
  createAppError,
} from './middleware';
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
} from './validation';
export {
  DEFAULTS,
  CACHE_CONFIG,
  FLAKY_CONFIG,
  WEBSOCKET_CONFIG,
  FILE_PATTERNS,
  HTTP_STATUS,
  PROGRESS_MARKER,
  LOG_LEVELS,
} from './constants';

export { ServiceContainer } from './container/service-container';
export type { Factory, Lifecycle } from './container/service-container';
export { MutableRef } from './container/mutable-ref';
export { TOKENS } from './container/tokens';
export type { ServiceToken } from './container/tokens';
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
} from './types';
