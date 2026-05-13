# Reporter API

The Reporter is responsible for generating and managing test reports, supporting HTML and JSON formats, and providing failure analysis and dashboard statistics functionality.

## Reporter Class

### Constructor

```typescript
constructor(
  outputDir?: string,
  storage?: StorageProvider,
  diagnosisService?: DiagnosisService,
  flakyManager?: FlakyTestManager
)
```

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `outputDir` | `string` | `'./reports'` | Report output directory |
| `storage` | `StorageProvider` | Default storage provider | Storage abstraction layer |
| `diagnosisService` | `DiagnosisService` | `null` | AI diagnosis service for failure analysis |
| `flakyManager` | `FlakyTestManager` | `undefined` | Flaky test manager for root cause analysis |

During construction, the output directory is automatically created, and an in-memory cache is initialized (maximum cache size is determined by `CACHE_CONFIG.MAX_REPORT_CACHE_SIZE`).

### generateReport(runResult)

Generates a test report, outputting JSON and HTML files.

```typescript
async generateReport(runResult: RunResult): Promise<string>
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runResult` | `RunResult` | Test run result |

**Return Value:** HTML report file path (`string`)

**Behavior:**

1. Writes the run result to `{outputDir}/{runId}.json`
2. If HTML report does not exist, generates `{outputDir}/{runId}.html` from template
3. Adds the result to in-memory cache
4. Returns the HTML report path

### analyzeFailures(runResult)

Analyzes failed tests in the run result and returns a list of failure analyses.

```typescript
async analyzeFailures(runResult: RunResult): Promise<FailureAnalysis[]>
```

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runResult` | `RunResult` | Test run result |

**Return Value:** `FailureAnalysis[]`

**Behavior:**

1. Iterates through all tests with `failed` status in all suites
2. For each failed test, performs error classification (`categorizeError`) and generates suggestions (`generateSuggestions`)
3. If `diagnosisService` is configured and enabled, performs AI diagnosis for each failure analysis
4. AI diagnosis incorporates root cause analysis data from `flakyManager`
5. Diagnosis results are written back to the corresponding flaky test records in `flakyManager`

### generateDashboard()

Generates dashboard statistics.

```typescript
async generateDashboard(): Promise<DashboardStats>
```

**Return Value:** `DashboardStats`

```typescript
interface DashboardStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  avgDuration: number;
  flakyTests: number;
  quarantinedTests: number;
  recentRuns: RunResult[];
}
```

### getReport(reportId)

Retrieves the report for a specific run.

```typescript
async getReport(reportId: string): Promise<RunResult | null>
```

### deleteReport(reportId)

Deletes the report for a specific run (including JSON, HTML, and Playwright HTML report directory).

```typescript
async deleteReport(reportId: string): Promise<boolean>
```

### deleteAllReports()

Deletes all reports.

```typescript
async deleteAllReports(): Promise<number>
```

**Return Value:** Number of deleted reports

### getAllReports()

Retrieves all reports.

```typescript
async getAllReports(): Promise<RunResult[]>
```

### clearCache()

Clears the in-memory cache, forcing the next `getAllReports` call to reload from the file system.

```typescript
clearCache(): void
```

### createPendingReport(runId, version)

Creates a pending report (for real-time update scenarios).

```typescript
async createPendingReport(runId: string, version: string): Promise<RunResult>
```

**Behavior:** Creates an initial `RunResult` with status `'running'`, writes it to a JSON file, and adds it to the cache.

### updatePendingReport(runId, testResult, suiteName)

Updates the test result in a pending report.

```typescript
async updatePendingReport(runId: string, testResult: TestResult, suiteName: string): Promise<void>
```

**Behavior:**

1. Finds the pending report; if not found, skips
2. Finds or creates the corresponding suite
3. If the test already exists, updates it; otherwise, adds the new test
4. Updates suite and report statistics

### finalizePendingReport(runId, status)

Finalizes the pending report, sets the final status, and generates the complete report.

```typescript
async finalizePendingReport(
  runId: string,
  status: 'success' | 'failed' | 'cancelled'
): Promise<string>
```

**Behavior:**

1. Sets the report status, `endTime`, and `duration`
2. Calls `generateReport` to generate the complete report
3. Updates the JSON file
4. Removes from pending reports
5. Returns the HTML report path

### getPendingReport(runId)

Retrieves a pending report.

```typescript
getPendingReport(runId: string): RunResult | undefined
```

### hasPendingReport(runId)

Checks if a pending report exists.

```typescript
hasPendingReport(runId: string): boolean
```

### updateTestResult(runId, testId, newResult)

Updates the result of a specific test in a report (for manual rerun scenarios).

```typescript
async updateTestResult(runId: string, testId: string, newResult: TestResult): Promise<boolean>
```

**Behavior:**

1. Finds the report and corresponding test
2. Saves the old result to `runHistory`
3. Increments the `manualReruns` count
4. Replaces the old result with the new result (preserving `id`, `retries`, `manualReruns`, `runHistory`)
5. Updates suite and report statistics
6. Writes to JSON file
7. Returns whether successful

## JSONReporter Class

Inherits from `Reporter`, provides JSON format report generation.

### generateJSONReport(runResult)

Generates a JSON format report string.

```typescript
async generateJSONReport(runResult: RunResult): Promise<string>
```

## Type Definitions

### FailureAnalysis

```typescript
interface FailureAnalysis {
  testId: string;
  title: string;
  failureReason: string;
  category: 'assertion' | 'timeout' | 'network' | 'selector' | 'frame' | 'auth' | 'unknown';
  suggestions: string[];
  occurrences: number;
  lastOccurrence: number;
  firstOccurrence?: number;
  filePath?: string;
  lineNumber?: number;
  stackTrace?: string;
  browser?: string;
  aiDiagnosis?: AIDiagnosis;
}
```

### FailureAnalysisSummary

```typescript
interface FailureAnalysisSummary {
  total: number;
  persistent: number;
  emerging: number;
  firstTimeFailures: number;
  byClassification: Record<string, number>;
}
```

### ReportFailureSummary

```typescript
interface ReportFailureSummary {
  total: number;
  persistent: number;
  emerging: number;
  firstTimeFailures: number;
  byCategory: Record<string, number>;
}
```

### ReportFailureItem

```typescript
interface ReportFailureItem {
  testId: string;
  title: string;
  error: string;
  category: string;
  failureCount: number;
  lastFailureTime: number;
  firstFailureTime: number;
  filePath?: string;
  lineNumber?: number;
  suggestions: string[];
}
```

### FailureAnalysisResult

```typescript
type FailureAnalysisResult = FailureAnalysisSummary | FlakyTest[] | ImmediateFailure[];
```

Union type, can be a failure analysis summary, a list of flaky tests, or a list of immediate failures.

### ReportFailureResult

```typescript
type ReportFailureResult = ReportFailureSummary | ReportFailureItem[];
```

Union type, can be a report failure summary or a list of report failure items.

### ImmediateFailure

```typescript
interface ImmediateFailure {
  testId: string;
  title: string;
  error?: string;
  status: string;
  timestamp: number;
  duration?: number;
}
```

### DashboardStats

```typescript
interface DashboardStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  avgDuration: number;
  flakyTests: number;
  quarantinedTests: number;
  recentRuns: RunResult[];
}
```

### AIDiagnosis

```typescript
interface AIDiagnosis {
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
```

### CodeDiff

```typescript
interface CodeDiff {
  filePath: string;
  unifiedDiff: string;
  description: string;
}
```

### DocLink

```typescript
interface DocLink {
  title: string;
  url: string;
}
```

### ContextUsed

```typescript
interface ContextUsed {
  sourceCode: boolean;
  screenshot: boolean;
  consoleLogs: boolean;
  stackTrace: boolean;
  historyData: boolean;
  environmentInfo: boolean;
}
```

### ReasoningStep

```typescript
interface ReasoningStep {
  step: number;
  tool?: string;
  input?: string;
  output?: string;
  thought: string;
}
```

## Examples

### Basic Usage

```typescript
import { Reporter } from 'yuantest-playwright';

const reporter = new Reporter('./reports');

// Generate report
const reportPath = await reporter.generateReport(result);
console.log(`Report generated: ${reportPath}`);
```

### Failure Analysis

```typescript
const analysis = await reporter.analyzeFailures(result);
analysis.forEach((failure) => {
  console.log(`[${failure.category}] ${failure.title}`);
  console.log(`  Reason: ${failure.failureReason}`);
  console.log(`  Occurrences: ${failure.occurrences}`);
  failure.suggestions.forEach((s) => console.log(`  Suggestion: ${s}`));
  if (failure.aiDiagnosis) {
    console.log(`  AI Root Cause: ${failure.aiDiagnosis.rootCause}`);
    console.log(`  AI Confidence: ${failure.aiDiagnosis.confidence}`);
  }
});
```

### Dashboard Statistics

```typescript
const dashboard = await reporter.generateDashboard();
console.log(`Total runs: ${dashboard.totalRuns}`);
console.log(`Pass rate: ${dashboard.passRate.toFixed(1)}%`);
console.log(`Average duration: ${dashboard.avgDuration.toFixed(0)}ms`);
console.log(`Flaky tests: ${dashboard.flakyTests}`);
```

### Viewing Historical Reports

```typescript
const reports = await reporter.getAllReports();
reports.forEach((report) => {
  console.log(`${report.id}: ${report.passed}/${report.totalTests} passed`);
});

const report = await reporter.getReport('run_20240101_120000_abc123');
if (report) {
  console.log(`Run: ${report.id}`);
  console.log(`Duration: ${report.duration}ms`);
}
```

### Real-time Reporting (Pending Reports)

```typescript
// Create pending report
const pendingReport = await reporter.createPendingReport('run_123', '1.0.0');

// Update as tests execute
await reporter.updatePendingReport('run_123', testResult1, 'Login Suite');
await reporter.updatePendingReport('run_123', testResult2, 'Login Suite');

// Finalize report
const htmlPath = await reporter.finalizePendingReport('run_123', 'success');
console.log(`Final report: ${htmlPath}`);
```

### Manual Rerun Update

```typescript
const updated = await reporter.updateTestResult('run_123', 'test_456', newTestResult);
if (updated) {
  console.log('Test result updated successfully');
}
```

### Deleting Reports

```typescript
// Delete a single report
const deleted = await reporter.deleteReport('run_123');
console.log(`Deleted: ${deleted}`);

// Delete all reports
const count = await reporter.deleteAllReports();
console.log(`Deleted ${count} reports`);
```

### JSON Report

```typescript
import { JSONReporter } from 'yuantest-playwright';

const jsonReporter = new JSONReporter('./reports');
const jsonStr = await jsonReporter.generateJSONReport(result);
console.log(jsonStr);
```
