export { Orchestrator, ShardOptimizer } from './orchestrator';
export { Executor, ParallelExecutor } from './executor';
export { Reporter, JSONReporter } from './reporter';
export { RealtimeReporter, RealtimeReporterClient } from './realtime';
export { FlakyTestManager } from './flaky';
export {
  classifyTest,
  calculateWeightedFailureRate,
  calculateConsecutiveFailures,
  calculateConsecutivePasses,
  isStatisticallySignificant,
  wilsonConfidenceInterval,
} from './flaky/classifier';
export { RootCauseAnalyzer } from './flaky/root-cause';
export { analyzeCorrelations } from './flaky/correlation';
export {
  TrendAnalyzer,
  calculateHealthScore,
  aggregateTimeSeries,
  detectTrendDirection,
  detectChangePoints,
  detectSeasonalPattern,
  correlateCodeChanges,
  generateForecast,
  linearRegression,
} from './flaky/trend';
export { FlakyPredictor, detectDurationAnomaly, predictFailure } from './flaky/predictor';
export {
  QuarantineStrategyManager,
  generateQuarantineStrategy,
  checkQuarantineBudget,
  determineIsolationLevel,
  getRetryPolicyForRootCause,
} from './flaky/quarantine-strategy';
export { CausalGraphBuilder } from './flaky/causal-graph';
export { DashboardServer } from './ui/server';
export { PlaywrightConfigBuilder, PlaywrightConfigOptions } from './config';
export { loadConfigFile, mergeConfig, getDashboardConfig } from './config/loader';
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
} from './types';
