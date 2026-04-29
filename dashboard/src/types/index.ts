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
}

export interface FlakyTest {
  title: string;
  failureRate: number;
  totalRuns: number;
  lastFailure?: string;
  testId: string;
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
