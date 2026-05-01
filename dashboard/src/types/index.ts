export interface TestCase {
  id: string;
  name: string;
  fullTitle: string;
  file: string;
  line: number;
  column: number;
  group?: string;
  status?: 'idle' | 'pending' | 'running' | 'passed' | 'failed';
  lastDuration: number | null;
  lastError: string | null;
}

export interface TestDescribe {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: TestCase[];
  describes: TestDescribe[];
}

export interface TestFile {
  file: string;
  title: string;
  describes: TestDescribe[];
  tests: TestCase[];
}

export interface RunReport {
  id: number;
  timestamp: string;
  version: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped?: number;
  duration: string;
  details: RunDetail[];
  htmlReportUrl?: string | null;
  skippedQuarantinedTests?: string[];
  status?: 'running' | 'completed' | 'failed' | 'cancelled';
}

export interface TestAttachment {
  name: string;
  path?: string;
  contentType?: string;
  body?: string;
}

export interface RunDetail {
  id: string;
  name: string;
  status: 'passed' | 'failed';
  duration: string;
  error: string | null;
  attachments?: TestAttachment[];
  file?: string;
  line?: number;
  retries?: number;
  manualReruns?: number;
  aiDiagnosis?: AIDiagnosis | null;
  screenshots?: string[];
  logs?: string[];
  browser?: string;
  stackTrace?: string;
}

export type FlakyClassification = 'flaky' | 'broken' | 'regression' | 'stable' | 'insufficient_data';

/** 不稳定测试筛选类型 */
export type FilterType = 'all' | 'high' | 'medium' | 'low' | 'broken' | 'regression' | 'flaky';

export type RootCauseType =
  | 'timing'
  | 'data_race'
  | 'environment'
  | 'external_service'
  | 'test_order'
  | 'resource_leak'
  | 'assertion_flaky'
  | 'unknown';

export interface RootCauseAnalysis {
  testId: string;
  primaryCause: RootCauseType;
  confidence: number;
  evidence: { type: RootCauseType; indicators: string[]; confidence: number; description: string }[];
  suggestedActions: string[];
  analyzedAt: number;
}

export interface CorrelationGroup {
  groupId: string;
  testIds: string[];
  correlationType: 'same_run' | 'same_shard' | 'same_time_window' | 'same_error_pattern' | 'same_file';
  confidence: number;
  evidence: string;
}

export interface FlakyTest {
  title: string;
  failureRate: number;
  totalRuns: number;
  lastFailure?: string;
  testId: string;
  classification?: FlakyClassification;
  weightedFailureRate?: number;
  consecutiveFailures?: number;
  consecutivePasses?: number;
  rootCause?: RootCauseAnalysis;
}

export interface QuarantinedTest {
  title: string;
  totalRuns: number;
  failureRate: number;
  testId: string;
  quarantinedAt?: number;
  isExpired?: boolean;
  consecutivePassesSinceQuarantine?: number;
}

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  tests: TestCase[];
  isExpanded: boolean;
}

export interface ServerRun {
  id: string;
  startTime: string;
  version: string;
  status: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  suites?: ServerSuite[];
}

export interface ServerSuite {
  title?: string;
  name?: string;
  specs?: ServerTest[];
  tests?: ServerTest[];
  duration?: number;
}

export interface ServerTest {
  id?: string;
  title: string;
  ok?: boolean;
  status?: string;
  duration: number;
  error?: { message?: string };
  results?: Array<{ attachments?: Array<{ name: string; path?: string; contentType?: string }> }>;
}

export interface HealthMetric {
  date: string;
  timestamp: number;
  runStatus: {
    passed: number;
    failed: number;
    total: number;
    passRate: number;
  };
  runDuration: number;
  testSuiteSize: {
    total: number;
    passed: number;
    failed: number;
  };
  testFlakiness: {
    flakyCount: number;
    flakyRate: number;
    totalRuns: number;
  };
  tags?: string[];
  branch?: string;
}

export interface DashboardConfig {
  dateRange: {
    start: string;
    end: string;
  };
  activeTab: 'runStatus' | 'runDuration' | 'testSuiteSize' | 'testFlakiness';
  chartType: 'line' | 'bar' | 'area';
}

export interface HealthTrendData {
  date: string;
  passed: number;
  failed: number;
  passRate: number;
  duration: number;
  suiteSize: number;
  flakyRate: number;
  flakyCount: number;
}

export interface TrendIndicator {
  value: number;
  direction: 'up' | 'down' | 'stable';
  isPositive: boolean;
  previousValue: number;
}

export interface EnhancedChartStats {
  latestPassRate: number;
  avgPassRate: number;
  avgDuration: number;
  avgFlakyRate: number;
  totalTests: number;
  totalFlaky: number;
  dataPoints: number;
  trends: {
    passRate: TrendIndicator;
    duration: TrendIndicator;
    totalTests: TrendIndicator;
    flakyCount: TrendIndicator;
  };
  sparkline: {
    passRate: number[];
    duration: number[];
    totalTests: number[];
    flakyCount: number[];
  };
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

export interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  remark: string;
  maxTokens: number;
  temperature: number;
}

export interface LLMStatus {
  configured: boolean;
  connected: boolean;
  status: 'green' | 'yellow' | 'red';
}

/** 测试结果 */
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

/** 测试运行历史记录 */
export interface TestRunHistory {
  timestamp: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
}

/** 浏览器类型 */
export type BrowserType = 'chromium' | 'firefox' | 'webkit';
