export interface TestConfig {
  version: string;
  testDir: string;
  outputDir: string;
  baseURL?: string;
  retries?: number;
  timeout?: number;
  workers?: number;
  shards?: number;
  reporters?: string[];
  browsers?: BrowserType[];
  headers?: Record<string, string>;
  flakyThreshold?: number;
  isolateFlaky?: boolean;
  traces?: TraceConfig;
  artifacts?: ArtifactConfig;
  visualTesting?: VisualTestingConfig;
  annotations?: AnnotationConfig;
  tags?: TagConfig;
  htmlReport?: boolean;
  htmlReportDir?: string;
  parentRunId?: string;
  testMatch?: string[];
  testIgnore?: string[];
  ignoreDirs?: string[];
}

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export type AnnotationType =
  | 'skip'
  | 'only'
  | 'fail'
  | 'slow'
  | 'fixme'
  | 'todo'
  | 'serial'
  | 'parallel';

export interface Annotation {
  type: AnnotationType;
  description?: string;
  testId: string;
  testName: string;
  file: string;
}

export interface AnnotationConfig {
  enabled: boolean;
  respectSkip: boolean;
  respectOnly: boolean;
  respectFail: boolean;
  respectSlow: boolean;
  respectFixme: boolean;
  customAnnotations: Record<string, { action: 'skip' | 'fail' | 'slow' | 'mark' }>;
}

export interface TagConfig {
  enabled: boolean;
  include?: string[];
  exclude?: string[];
  require?: string[];
}

export interface TagInfo {
  name: string;
  testIds: string[];
  description?: string;
}

export interface TraceConfig {
  enabled: boolean;
  mode: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  screenshots: boolean;
  snapshots: boolean;
  sources: boolean;
  attachments: boolean;
  outputDir?: string;
}

export interface TraceFile {
  runId: string;
  testId: string;
  testName: string;
  filePath: string;
  size: number;
  timestamp: number;
  browser: BrowserType;
}

export interface ArtifactConfig {
  enabled: boolean;
  screenshots: 'off' | 'on' | 'only-on-failure';
  videos: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  downloads?: boolean;
  outputDir?: string;
  maxFileSize?: number;
}

export type ArtifactType = 'screenshot' | 'video' | 'download' | 'trace' | 'attachment';

export interface Artifact {
  id: string;
  runId: string;
  testId: string;
  testName: string;
  type: ArtifactType;
  filePath: string;
  fileName: string;
  size: number;
  mimeType: string;
  timestamp: number;
  browser: BrowserType;
}

export interface VisualTestingConfig {
  enabled: boolean;
  threshold: number;
  maxDiffPixelRatio: number;
  maxDiffPixels: number;
  updateSnapshots: boolean;
  compareWith?: string;
  outputDir?: string;
}

export type VisualTestStatus = 'identical' | 'different' | 'new' | 'missing' | 'regression';

export interface VisualTestResult {
  testId: string;
  testName: string;
  status: VisualTestStatus;
  baselinePath: string;
  comparisonPath: string;
  diffPath: string;
  diffPixelRatio: number;
  diffPixels: number;
  threshold: number;
  timestamp: number;
  browser: BrowserType;
}

export interface VisualTestComparison {
  baseline: string;
  current: string;
  diff: string;
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  matches: boolean;
}

export interface TestRunHistory {
  timestamp: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
}

export interface TestResult {
  id: string;
  title: string;
  fullTitle?: string;
  file?: string;
  line?: number;
  column?: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
  retries: number;
  manualReruns?: number;
  runHistory?: TestRunHistory[];
  timestamp: number;
  browser: BrowserType;
  shard?: number;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
  logs?: string[];
  stackTrace?: string;
}

export interface SuiteResult {
  name: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
  timestamp: number;
}

export interface RunMetadataAnnotation {
  type: string;
  testName: string;
  file: string;
}

export interface RunMetadataTag {
  name: string;
  count: number;
}

export interface RunMetadataTraceFile {
  testId: string;
  testName: string;
  size: number;
}

export interface RunMetadataTraces {
  total: number;
  files: RunMetadataTraceFile[];
}

export interface RunMetadataArtifacts {
  total: number;
  byType: Record<string, number>;
}

export interface RunMetadataVisualResult {
  testId: string;
  status: string;
  diffPixelRatio: number;
}

export interface RunMetadataVisualTesting {
  passRate: number;
  identical: number;
  different: number;
  regression: number;
  new: number;
  results: RunMetadataVisualResult[];
}

export interface RunMetadata {
  annotations?: RunMetadataAnnotation[];
  tags?: RunMetadataTag[];
  traces?: RunMetadataTraces;
  artifacts?: RunMetadataArtifacts;
  visualTesting?: RunMetadataVisualTesting;
  skippedQuarantinedTests?: string[];
  [key: string]: unknown;
}

export interface RunResult {
  id: string;
  version: string;
  status: 'success' | 'failed' | 'cancelled' | 'running';
  startTime: number;
  endTime?: number;
  duration?: number;
  suites: SuiteResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  flakyTests: TestResult[];
  metadata?: RunMetadata;
}

export type FlakyClassification =
  | 'flaky'
  | 'broken'
  | 'regression'
  | 'stable'
  | 'insufficient_data';

export type RootCauseType =
  | 'timing'
  | 'data_race'
  | 'environment'
  | 'external_service'
  | 'test_order'
  | 'resource_leak'
  | 'assertion_flaky'
  | 'unknown';

export interface RootCauseEvidence {
  type: RootCauseType;
  indicators: string[];
  confidence: number;
  description: string;
}

export interface RootCauseAnalysis {
  testId: string;
  primaryCause: RootCauseType;
  confidence: number;
  evidence: RootCauseEvidence[];
  suggestedActions: string[];
  analyzedAt: number;
}

export type CorrelationType =
  | 'same_run'
  | 'same_shard'
  | 'same_time_window'
  | 'same_error_pattern'
  | 'same_file';

export interface CorrelationGroup {
  groupId: string;
  testIds: string[];
  correlationType: CorrelationType;
  confidence: number;
  evidence: string;
}

export interface FlakyTest {
  testId: string;
  title: string;
  failureRate: number;
  totalRuns: number;
  lastFailure?: number;
  isQuarantined: boolean;
  quarantinedAt?: number;
  consecutivePassesSinceQuarantine?: number;
  history: FlakyHistoryEntry[];
  classification: FlakyClassification;
  weightedFailureRate: number;
  consecutiveFailures: number;
  consecutivePasses: number;
  lastClassifiedAt?: number;
  rootCause?: RootCauseAnalysis;
  isolationLevel?: IsolationLevel;
  quarantineStrategy?: QuarantineStrategy;
  trendAnalysis?: TrendAnalysis;
  healthScore?: FlakyHealthScore;
  durationAnomaly?: DurationAnomaly;
  lastPrediction?: PredictionResult;
}

export interface FlakyHistoryEntry {
  timestamp: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
}

export type QuarantineStrategyType = 'skip' | 'retry_only' | 'soft' | 'hard' | 'graduated';

export type IsolationLevel = 'none' | 'monitor' | 'soft_quarantine' | 'hard_quarantine';

export interface QuarantineStrategy {
  testId: string;
  strategy: QuarantineStrategyType;
  isolationLevel: IsolationLevel;
  retryPolicy: RetryPolicy;
  reason: string;
  expiresAt?: number;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelay: number;
  backoffMultiplier: number;
  retryOnPassOnly: boolean;
}

export interface TrendDataPoint {
  timestamp: number;
  passRate: number;
  failRate: number;
  avgDuration: number;
  flakyCount: number;
  totalRuns: number;
}

export type TrendDirection = 'improving' | 'stable' | 'degrading' | 'volatile';

export interface TrendAnalysis {
  testId: string;
  direction: TrendDirection;
  slope: number;
  r2: number;
  dataPoints: TrendDataPoint[];
  changePoints: ChangePoint[];
  seasonalPattern: SeasonalPattern | null;
  codeChangeCorrelations: CodeChangeCorrelation[];
  forecast: TrendForecast;
  analyzedAt: number;
}

export interface ChangePoint {
  timestamp: number;
  beforeRate: number;
  afterRate: number;
  magnitude: number;
  confidence: number;
}

export interface SeasonalPattern {
  period: 'hourly' | 'daily' | 'weekly';
  peakHours: number[];
  peakDays: number[];
  amplitude: number;
  confidence: number;
}

export interface CodeChangeCorrelation {
  commitHash: string;
  commitMessage: string;
  timestamp: number;
  author: string;
  affectedFiles: string[];
  correlationScore: number;
  flakyRateBefore: number;
  flakyRateAfter: number;
}

export interface TrendForecast {
  next7Days: TrendDataPoint[];
  confidence: number;
  projectedDirection: TrendDirection;
}

export interface FlakyHealthScore {
  overall: number;
  breakdown: {
    stability: number;
    trend: number;
    recoverability: number;
    predictability: number;
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
}

export interface PredictionResult {
  testId: string;
  willFail: boolean;
  probability: number;
  confidence: number;
  signals: PredictionSignal[];
  recommendedAction: string;
  predictedAt: number;
}

export interface PredictionSignal {
  type:
    | 'duration_anomaly'
    | 'failure_pattern'
    | 'environment_shift'
    | 'code_change'
    | 'resource_pressure';
  strength: number;
  description: string;
  data: Record<string, unknown>;
}

export interface DurationAnomaly {
  testId: string;
  baseline: number;
  current: number;
  deviation: number;
  isAnomaly: boolean;
  zScore: number;
  detectedAt: number;
}

export interface CausalNode {
  id: string;
  type: 'test' | 'infrastructure' | 'external_service' | 'shared_state';
  label: string;
  metadata: Record<string, unknown>;
}

export interface CausalEdge {
  from: string;
  to: string;
  weight: number;
  type: 'depends_on' | 'shares_resource' | 'same_environment' | 'sequential' | 'correlated_failure';
  confidence: number;
}

export interface CausalGraph {
  nodes: CausalNode[];
  edges: CausalEdge[];
  rootCauses: CausalNode[];
  impactMap: Map<string, string[]>;
  builtAt: number;
}

export interface ImpactAnalysis {
  testId: string;
  directlyAffected: string[];
  indirectlyAffected: string[];
  totalImpact: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface QuarantineConfig {
  enabled: boolean;
  threshold: number;
  autoQuarantine: boolean;
  minimumRuns?: number;
  autoReleaseAfterPasses?: number;
  quarantineExpiryDays?: number;
  decayRate?: number;
  confidenceLevel?: number;
  brokenThreshold?: number;
  regressionWindow?: number;
  enableRootCauseAnalysis?: boolean;
  enableCorrelationAnalysis?: boolean;
  enableTrendTracking?: boolean;
  enablePrediction?: boolean;
  enableCausalGraph?: boolean;
  quarantineStrategy?: QuarantineStrategyType;
  maxQuarantineRatio?: number;
  predictionSensitivity?: number;
}

export interface OrchestrationConfig {
  totalShards: number;
  shardIndex: number;
  testAssignment: TestAssignment[];
  strategy: 'distributed' | 'weighted' | 'intelligent';
  flakyTests?: string[];
  quarantinedTests?: string[];
}

export interface TestAssignment {
  testId: string;
  shardId: number;
  priority: number;
  estimatedDuration?: number;
  durationConfidence?: number;
  durationVariance?: number;
  estimationSource?: 'history' | 'ema' | 'similar' | 'default';
}

export type RealTimeMessage =
  | {
      type: 'connected';
      payload: { message: string };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'run_started';
      payload: { runId: string; version: string; startTime: number };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'run_progress';
      payload: RunProgress;
      timestamp: number;
      runId: string;
    }
  | {
      type: 'run_completed';
      payload: RunResult;
      timestamp: number;
      runId: string;
    }
  | {
      type: 'test_result';
      payload: TestResult & { currentProgress: RunProgress };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'test_result_batch';
      payload: {
        results: TestResult[];
        currentProgress?: RunProgress;
      };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'suite_completed';
      payload: { suiteName: string; timestamp: number };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'error';
      payload: { error: string };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'flaky_detected';
      payload: {
        testId: string;
        title: string;
        failureRate: number;
        weightedFailureRate: number;
        classification: FlakyClassification;
        rootCause?: RootCauseType;
        timestamp: number;
      };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'quarantine_updated';
      payload: Record<string, unknown>;
      timestamp: number;
      runId: string;
    }
  | {
      type: 'log';
      payload: { message: string; timestamp: number; logType?: string };
      timestamp: number;
      runId: string;
    }
  | {
      type: 'report_created';
      payload: RunResult;
      timestamp: number;
      runId: string;
    }
  | {
      type: 'report_updated';
      payload: {
        runId: string;
        totalTests?: number;
        passed?: number;
        failed?: number;
        skipped?: number;
        status?: 'running' | 'completed' | 'failed' | 'cancelled';
        testResult?: TestResult;
      };
      timestamp: number;
      runId: string;
    };

export interface RunProgress {
  runId: string;
  status: 'running' | 'completed' | 'cancelled';
  progress: number;
  totalTests: number;
  currentSuite?: string;
  currentTest?: string;
  passed: number;
  failed: number;
  skipped: number;
  flakyTests: string[];
  startTime: number;
  estimatedTimeRemaining?: number;
}

export interface DashboardStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  avgDuration: number;
  flakyTests: number;
  quarantinedTests: number;
  recentRuns: RunResult[];
}

export interface FailureAnalysis {
  testId: string;
  title: string;
  failureReason: string;
  category: 'assertion' | 'timeout' | 'network' | 'selector' | 'unknown';
  suggestions: string[];
  occurrences: number;
  lastOccurrence: number;
  aiDiagnosis?: AIDiagnosis;
}

export interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  remark: string;
  maxTokens: number;
  temperature: number;
}

/** 代码差异信息 */
export interface CodeDiff {
  filePath: string;
  unifiedDiff: string;
  description: string;
}

/** 文档链接 */
export interface DocLink {
  title: string;
  url: string;
}

/** AI诊断使用的上下文信息 */
export interface ContextUsed {
  sourceCode: boolean;
  screenshot: boolean;
  consoleLogs: boolean;
  stackTrace: boolean;
  historyData: boolean;
  environmentInfo: boolean;
}

/** AI推理步骤 */
export interface ReasoningStep {
  step: number;
  tool?: string;
  input?: string;
  output?: string;
  thought: string;
}

export interface AIDiagnosis {
  summary: string;
  rootCause: string;
  suggestions: string[];
  confidence: number;
  model: string;
  timestamp: number;
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  codeDiffs?: CodeDiff[];
  docLinks?: DocLink[];
  contextUsed: ContextUsed;
  reasoningSteps?: ReasoningStep[];
  calibratedConfidence: number;
  analysisMode: 'agent' | 'single' | 'fallback';
  relatedFailures?: string[];
}

export interface LLMStatus {
  configured: boolean;
  connected: boolean;
  status: 'green' | 'yellow' | 'red';
}

export enum ErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PARSE_ERROR = 'PARSE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  IO_ERROR = 'IO_ERROR',
  INVALID_CONFIG = 'INVALID_CONFIG',
  ALREADY_RUNNING = 'ALREADY_RUNNING',
  OPERATION_FAILED = 'OPERATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
}

export class PlaywrightRunnerError extends Error {
  constructor(
    message: string,
    public code: ErrorCode | string,
    public cause?: Error,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'PlaywrightRunnerError';
  }

  static isRetryable(code: ErrorCode | string): boolean {
    return [ErrorCode.IO_ERROR, ErrorCode.PERMISSION_DENIED].includes(code as ErrorCode);
  }
}

export type Result<T, E = PlaywrightRunnerError> = { ok: true; value: T } | { ok: false; error: E };

export const Ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const Err = <E extends PlaywrightRunnerError>(error: E): Result<never, E> => ({
  ok: false,
  error,
});

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

export function createError(
  code: ErrorCode,
  message: string,
  cause?: unknown
): PlaywrightRunnerError {
  const causeError = cause instanceof Error ? cause : undefined;
  return new PlaywrightRunnerError(message, code, causeError);
}
