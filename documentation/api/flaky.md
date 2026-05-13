# FlakyTestManager API Reference

FlakyTestManager is responsible for flaky test detection, isolation, root cause analysis, trend tracking, and failure prediction. It inherits from `ManagedManager`, providing complete lifecycle management (initialization, delayed save, refresh).

---

## Constructor

```typescript
new FlakyTestManager(storagePath?: string, config?: Partial<QuarantineConfig>, storage?: StorageProvider)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `storagePath` | `string` | `'./test-data'` | Data storage directory path, history files will be saved in `flaky-history.json` under this directory |
| `config` | `Partial<QuarantineConfig>` | `{}` | Quarantine configuration, supports partial override, unspecified fields use default values |
| `storage` | `StorageProvider` | `getStorage()` | Storage provider for file read/write operations, defaults to built-in storage implementation |

### Default Configuration Values

The constructor internally merges the following default values (from `FLAKY_CONFIG` constant):

| Field | Default Value | Description |
|------|--------|------|
| `enabled` | `true` | Whether to enable Flaky management |
| `threshold` | `0.3` | Flaky detection threshold (weighted failure rate) |
| `autoQuarantine` | `true` | Whether to automatically quarantine detected Flaky tests |
| `minimumRuns` | `5` | Minimum number of runs required to trigger quarantine |
| `autoReleaseAfterPasses` | `3` | Number of consecutive passes required for auto-release |
| `quarantineExpiryDays` | `30` | Quarantine expiry days |
| `decayRate` | `0.1` | Weighted decay rate |
| `confidenceLevel` | `0.95` | Statistical significance confidence level |
| `brokenThreshold` | `5` | Consecutive failure threshold for broken classification |
| `regressionWindow` | `5` | Regression analysis window size |
| `enableRootCauseAnalysis` | `true` | Whether to enable root cause analysis |
| `enableCorrelationAnalysis` | `true` | Whether to enable correlation analysis |
| `enableTrendTracking` | `true` | Whether to enable trend tracking |
| `enablePrediction` | `true` | Whether to enable failure prediction |
| `enableCausalGraph` | `true` | Whether to enable causal graph |
| `quarantineStrategy` | `'graduated'` | Quarantine strategy type |
| `maxQuarantineRatio` | `0.2` | Maximum quarantine ratio |
| `predictionSensitivity` | `0.5` | Prediction sensitivity |

### Example

```typescript
import { FlakyTestManager } from 'yuantest-playwright';

// Use default configuration
const manager = new FlakyTestManager();

// Custom configuration
const manager = new FlakyTestManager('./test-data', {
  threshold: 0.4,
  autoQuarantine: false,
  quarantineStrategy: 'hard',
});
```

---

## Core Methods

### recordTestResult()

Records a single test result, updates test history, classification, weighted failure rate, and triggers Flaky detection and auto-quarantine logic.

```typescript
async recordTestResult(result: TestResult): Promise<void>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `result` | `TestResult` | Test result object |

#### Behavior

- If the test already exists, appends history record (maximum 50 entries retained), recalculates failure rate, weighted failure rate, consecutive failures/passes, and classification
- If the test does not exist, creates a new `FlakyTest` record
- When test result is `failed` or `timedout`, triggers Flaky detection
- If prediction is enabled and history is sufficient (≥8 entries), detects duration anomalies
- If the test is quarantined and passes this time, increments consecutive pass count and checks if auto-release conditions are met
- After each call, checks and downgrades expired quarantined tests
- Clears causal graph cache and schedules delayed save

---

### recordRunResults()

Records all test results from a complete run, caches the run result to the recent runs list.

```typescript
async recordRunResults(runResult: RunResult): Promise<void>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `runResult` | `RunResult` | Run result object, containing suites and their tests |

#### Behavior

- Appends run result to `recentRuns` cache (maximum 20 entries retained)
- Iterates through all tests in suites, calls `recordTestResult()` for each

---

### getFlakyTests()

Gets the list of Flaky tests that meet the threshold, excluding tests classified as `broken`, `insufficient_data`, and `stable`.

```typescript
getFlakyTests(threshold?: number): FlakyTest[]
```

#### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `threshold` | `number` | `0.1` (`MONITOR_THRESHOLD`) | Weighted failure rate threshold |

#### Return Value

`FlakyTest[]` — List of Flaky tests sorted by weighted failure rate in descending order

---

### getAllFlakyTests()

Gets all tests that have failure records (failure rate > 0).

```typescript
getAllFlakyTests(): FlakyTest[]
```

#### Return Value

`FlakyTest[]` — List of tests sorted by weighted failure rate in descending order

---

### getTestById()

Gets a Flaky test record by test ID.

```typescript
getTestById(testId: string): FlakyTest | undefined
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`FlakyTest | undefined` — Test record, returns `undefined` if not found

---

### isQuarantined()

Checks if a specified test is in quarantine status.

```typescript
isQuarantined(testId: string): boolean
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`boolean` — Whether the test is quarantined

---

### quarantineTest()

Adds a specified test to quarantine, subject to quarantine budget limits.

```typescript
async quarantineTest(testId: string): Promise<boolean>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`Promise<boolean>` — Whether quarantine was successful. Returns `false` if test doesn't exist or exceeds budget

#### Behavior

- Returns `false` if test doesn't exist
- Checks quarantine budget, returns `false` if exceeds maximum ratio and test is not already quarantined
- Sets quarantine status, quarantine time, and resets consecutive pass count to zero
- If quarantine strategy is `graduated`, generates quarantine level based on strategy (`none`/`monitor` will be promoted to `soft_quarantine`); otherwise sets to `hard_quarantine`
- Triggers `quarantine_updated` event and immediately saves history

---

### releaseTest()

Releases the quarantine status of a specified test.

```typescript
async releaseTest(testId: string, options?: { resetHistory?: boolean }): Promise<boolean>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |
| `options` | `{ resetHistory?: boolean }` | Optional configuration |
| `options.resetHistory` | `boolean` | Whether to reset history records, defaults to `false`. When set to `true`, clears history, failure rate, classification, root cause, trend, health score, and all analysis data |

#### Return Value

`Promise<boolean>` — Whether release was successful. Returns `false` if test is not quarantined

#### Behavior

- Resets quarantine status, quarantine level, and consecutive pass count
- If `resetHistory` is `true`, clears all statistical data
- Triggers `quarantine_updated` event and immediately saves history

---

### getQuarantinedTests()

Gets the list of all tests in quarantine status.

```typescript
getQuarantinedTests(): FlakyTest[]
```

#### Return Value

`FlakyTest[]` — List of quarantined tests

---

### getQuarantinedTestTitles()

Gets the list of titles of all quarantined tests, filtering out empty titles.

```typescript
getQuarantinedTestTitles(): string[]
```

#### Return Value

`string[]` — List of quarantined test titles

---

### buildGrepInvertPattern()

Builds a regex pattern for Playwright `--grep-invert`, excluding tests with `hard_quarantine` and `soft_quarantine` isolation levels.

```typescript
buildGrepInvertPattern(): string | null
```

#### Return Value

`string | null` — Regex pattern string, returns `null` if no quarantined tests. Regex special characters in titles will be escaped

---

### clearHistory()

Clears test history records.

```typescript
async clearHistory(testId?: string): Promise<void>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Optional, specifies test ID. If not provided, clears all test history |

#### Behavior

- When `testId` is specified, only deletes that test record and quarantine status
- When not specified, clears all test records and quarantine sets
- Clears causal graph cache and immediately saves history

---

## Analysis Methods

### analyzeRootCause()

Performs root cause analysis on a specified test, combining run history and context information to determine the root cause of Flaky behavior.

```typescript
async analyzeRootCause(testId: string, context?: AnalysisContext): Promise<RootCauseAnalysis | null>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |
| `context` | `AnalysisContext` | Optional, analysis context. If not provided, uses internally cached `recentRuns` |

#### Return Value

`Promise<RootCauseAnalysis | null>` — Root cause analysis result. Returns `null` if root cause analysis is disabled, test doesn't exist, or has no history

#### AnalysisContext Type

```typescript
interface AnalysisContext {
  recentRuns: RunResult[];       // Recent N run results
  shardMap?: Map<string, number>; // Shard info mapping: testId -> shardId
  ciNodeInfo?: Map<string, string>; // CI node info: runId -> nodeLabel
}
```

---

### analyzeCorrelations()

Analyzes correlations between multiple Flaky tests in the same run. If multiple tests frequently fail together in the same run, it may indicate an environment issue.

```typescript
analyzeCorrelations(config?: Partial<CorrelationConfig>): CorrelationGroup[]
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `config` | `Partial<CorrelationConfig>` | Optional, correlation analysis configuration |

#### Return Value

`CorrelationGroup[]` — List of correlation groups. Returns empty array if correlation analysis is disabled

#### CorrelationConfig Type

```typescript
interface CorrelationConfig {
  coOccurrenceThreshold: number; // Co-occurrence threshold (Jaccard coefficient), default 0.6
  minRuns: number;               // Minimum number of runs, default 3
}
```

---

### analyzeTrend()

Performs trend analysis on a specified test, including time series aggregation, trend direction, change point detection, seasonal patterns, and forecasting.

```typescript
async analyzeTrend(testId: string, codeChanges?: CodeChangeCorrelation[]): Promise<TrendAnalysis | null>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |
| `codeChanges` | `CodeChangeCorrelation[]` | Optional, code change records for correlation analysis |

#### Return Value

`Promise<TrendAnalysis | null>` — Trend analysis result. Returns `null` if trend tracking is disabled, test doesn't exist, or insufficient history data (<5 entries)

#### Behavior

- After analysis completes, updates test's `trendAnalysis` and `healthScore`
- Schedules delayed save

---

### analyzeAllTrends()

Performs batch trend analysis on all Flaky tests.

```typescript
async analyzeAllTrends(codeChanges?: CodeChangeCorrelation[]): Promise<Map<string, TrendAnalysis>>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `codeChanges` | `CodeChangeCorrelation[]` | Optional, code change records |

#### Return Value

`Promise<Map<string, TrendAnalysis>>` — Map of test ID to trend analysis results. Only analyzes tests with ≥5 history entries

---

### predictTestFailure()

Performs failure prediction on a specified test, based on signals like duration anomalies, failure patterns, environment shifts, and resource pressure.

```typescript
async predictTestFailure(testId: string): Promise<PredictionResult | null>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`Promise<PredictionResult | null>` — Prediction result. Returns `null` if prediction is disabled, test doesn't exist, or insufficient history (<8 entries)

#### Behavior

- After prediction completes, updates test's `lastPrediction` and `durationAnomaly`
- Schedules delayed save

---

### getHighRiskTests()

Batch gets high-risk test prediction results.

```typescript
async getHighRiskTests(): Promise<PredictionResult[]>
```

#### Return Value

`Promise<PredictionResult[]>` — List of tests predicted to fail. Returns empty array if prediction is disabled

---

### getDurationAnomalies()

Gets all tests with duration anomalies.

```typescript
async getDurationAnomalies(): Promise<DurationAnomaly[]>
```

#### Return Value

`Promise<DurationAnomaly[]>` — List of anomalies. Returns empty array if prediction is disabled

---

### buildCausalGraph()

Builds a causal dependency graph, combining test data, correlation groups, and run results.

```typescript
async buildCausalGraph(): Promise<CausalGraph>
```

#### Return Value

`Promise<CausalGraph>` — Causal graph. Returns empty graph if causal graph is disabled (`{ nodes: [], edges: [], rootCauses: [], impactMap: new Map(), builtAt: Date.now() }`)

#### Behavior

- Uses caching mechanism, returns cached causal graph if data hasn't changed
- When building a new graph, automatically calls `analyzeCorrelations()` to get correlation data

---

### analyzeImpact()

Analyzes the impact scope of a specified test.

```typescript
async analyzeImpact(testId: string): Promise<ImpactAnalysis | null>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`Promise<ImpactAnalysis | null>` — Impact analysis result. Returns `null` if causal graph is disabled

---

### getRootCauses()

Gets the list of root cause nodes from the causal graph.

```typescript
async getRootCauses(): Promise<CausalNode[]>
```

#### Return Value

`Promise<CausalNode[]>` — List of root cause nodes

---

## Statistics Methods

### getQuarantineStats()

Gets quarantine statistics.

```typescript
getQuarantineStats(): {
  totalTests: number;
  quarantined: number;
  flakyRate: number;
  topFlaky: FlakyTest[];
  expiredQuarantined: number;
  classificationBreakdown: Record<FlakyClassification, number>;
  budgetUtilization: number;
  avgHealthScore: number;
}
```

#### Return Value

| Field | Type | Description |
|------|------|------|
| `totalTests` | `number` | Total number of tracked tests |
| `quarantined` | `number` | Number of tests in quarantine |
| `flakyRate` | `number` | Flaky test ratio (percentage) |
| `topFlaky` | `FlakyTest[]` | Top 10 tests with highest failure rates |
| `expiredQuarantined` | `number` | Number of tests with expired quarantine |
| `classificationBreakdown` | `Record<FlakyClassification, number>` | Test count statistics by classification |
| `budgetUtilization` | `number` | Quarantine budget utilization rate |
| `avgHealthScore` | `number` | Average health score |

---

### getOverallHealthScore()

Gets the overall project health score, calculating a project-level score based on all test health scores.

```typescript
async getOverallHealthScore(): Promise<FlakyHealthScore>
```

#### Return Value

`Promise<FlakyHealthScore>` — Health score object

#### Score Calculation

- **stability** (weight 0.35): Stability based on weighted failure rate
- **trend** (weight 0.25): Trend direction score
- **recoverability** (weight 0.2): Recoverability score
- **predictability** (weight 0.2): Predictability score

#### Grade Mapping

| Score Range | Grade | Label |
|----------|------|------|
| ≥ 0.9 | A | Very Healthy |
| ≥ 0.75 | B | Mostly Healthy |
| ≥ 0.6 | C | Needs Attention |
| ≥ 0.4 | D | Unhealthy |
| < 0.4 | F | Severely Unhealthy |

#### Special Case

When there is no test data, returns `{ overall: 1, breakdown: { stability: 1, trend: 0.7, recoverability: 1, predictability: 0.5 }, grade: 'A', label: 'No test data' }`

---

### getFailureAnalysis()

Gets failure analysis results, supports filtering by type.

```typescript
async getFailureAnalysis(filter?: 'persistent' | 'emerging' | 'immediate'): Promise<FailureAnalysisResult>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `filter` | `'persistent' \| 'emerging' \| 'immediate'` | Optional, filter type |

#### Return Value

`Promise<FailureAnalysisResult>` — Returns different types based on filter condition:

| Filter Condition | Return Type | Description |
|----------|----------|------|
| Not provided | `FailureAnalysisSummary` | Failure analysis summary |
| `'persistent'` | `FlakyTest[]` | Persistently failing tests (classified as `broken`) |
| `'emerging'` | `FlakyTest[]` | Emerging failure tests (consecutive failures ≥2) |
| `'immediate'` | `ImmediateFailure[]` | First-time failures in the most recent run |

---

### getImmediateFailures()

Gets first-time failure tests in the most recent run (failures with no history).

```typescript
async getImmediateFailures(): Promise<ImmediateFailure[]>
```

#### Return Value

`Promise<ImmediateFailure[]>` — List of first-time failures. Returns empty array if no run records

---

## Configuration Methods

### setConfig()

Updates manager configuration, supports updating both Flaky criteria and quarantine criteria.

```typescript
setConfig(config: Partial<QuarantineConfig> & {
  flakyCriteria?: Partial<FlakyCriteriaConfig>;
  quarantineCriteria?: Partial<QuarantineCriteriaConfig>;
}): void
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `config` | `Partial<QuarantineConfig> & { flakyCriteria?, quarantineCriteria? }` | Configuration object, supports partial override |

#### Behavior

- `QuarantineConfig` part is directly merged and overridden
- `flakyCriteria` is merged via `mergeFlakyCriteria()`, retaining unspecified default values
- `quarantineCriteria` is merged via `mergeQuarantineCriteria()`, and rebuilds `QuarantineStrategyManager`

---

### getConfig()

Gets a copy of the current quarantine configuration.

```typescript
getConfig(): QuarantineConfig
```

#### Return Value

`QuarantineConfig` — Shallow copy of current configuration

---

### getEffectiveConfig()

Gets the currently effective complete configuration, including Flaky criteria and quarantine criteria with default values filled in.

```typescript
getEffectiveConfig(): {
  config: QuarantineConfig;
  flakyCriteria: FlakyCriteriaConfig;
  quarantineCriteria: QuarantineCriteriaConfig;
}
```

#### Return Value

| Field | Type | Description |
|------|------|------|
| `config` | `QuarantineConfig` | Quarantine configuration |
| `flakyCriteria` | `FlakyCriteriaConfig` | Flaky criteria configuration |
| `quarantineCriteria` | `QuarantineCriteriaConfig` | Quarantine criteria configuration |

---

## Quarantine Strategy Methods

### getQuarantineStrategy()

Gets the quarantine strategy for a specified test.

```typescript
async getQuarantineStrategy(testId: string): Promise<QuarantineStrategy | null>
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`Promise<QuarantineStrategy | null>` — Quarantine strategy. Returns `null` if test doesn't exist

#### Behavior

- If test already has `quarantineStrategy`, returns it directly
- Otherwise, dynamically generates via `generateQuarantineStrategy()`

---

### getQuarantineBudget()

Gets quarantine budget usage.

```typescript
getQuarantineBudget(): { allowed: boolean; remaining: number; utilization: number }
```

#### Return Value

| Field | Type | Description |
|------|------|------|
| `allowed` | `boolean` | Whether further quarantine is allowed |
| `remaining` | `number` | Remaining quarantine capacity |
| `utilization` | `number` | Current quarantine utilization rate |

---

### getTestsByIsolationLevel()

Gets tests grouped by isolation level.

```typescript
getTestsByIsolationLevel(): Record<IsolationLevel, FlakyTest[]>
```

#### Return Value

`Record<IsolationLevel, FlakyTest[]>` — Map of test lists by isolation level, containing `none`, `monitor`, `soft_quarantine`, `hard_quarantine` groups

---

### getTestsByClassification()

Gets test list by classification.

```typescript
getTestsByClassification(classification: FlakyClassification): FlakyTest[]
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `classification` | `FlakyClassification` | Classification type |

#### Return Value

`FlakyTest[]` — List of tests matching the classification, sorted by weighted failure rate in descending order

---

### getTestsToSkip()

Gets the list of test IDs to skip (tests with isolation level `hard_quarantine` or `soft_quarantine`).

```typescript
getTestsToSkip(): string[]
```

#### Return Value

`string[]` — List of test IDs to skip

---

### isQuarantineExpired()

Checks if the quarantine for a specified test has expired.

```typescript
isQuarantineExpired(testId: string): boolean
```

#### Parameters

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

#### Return Value

`boolean` — Whether quarantine has expired. Returns `false` if test doesn't exist or is not quarantined

#### Expiration Criteria

Quarantine is considered expired if quarantine time exceeds `quarantineExpiryDays` (default 30 days)

---

### getExpiredQuarantinedTests()

Gets the list of all tests with expired quarantine.

```typescript
getExpiredQuarantinedTests(): FlakyTest[]
```

#### Return Value

`FlakyTest[]` — List of expired quarantine tests

---

## Events

FlakyTestManager inherits from `ManagedManager` (EventEmitter) and emits the following events:

| Event Name | Trigger Condition | Payload |
|--------|----------|---------|
| `flaky_detected` | When a Flaky test is detected | `{ testId, title, failureRate, weightedFailureRate, classification, rootCause, isolationLevel, timestamp }` |
| `quarantine_updated` | When quarantine status changes | `{ testId, action: 'quarantined' \| 'released', flakyTest }` |
| `auto_released` | When a quarantined test is auto-released | `{ testId, title, consecutivePasses }` |
| `quarantine_downgraded` | When quarantine level is downgraded | `{ testId, title, fromLevel, toLevel }` |

---

## Complete Type Definitions

### FlakyTest

```typescript
interface FlakyTest {
  testId: string;                              // Unique test identifier
  title: string;                               // Test title
  failureRate: number;                         // Raw failure rate (0-1)
  totalRuns: number;                           // Total run count
  lastFailure?: number;                        // Last failure timestamp
  isQuarantined: boolean;                      // Whether in quarantine status
  quarantinedAt?: number;                      // Quarantine start timestamp
  consecutivePassesSinceQuarantine?: number;   // Consecutive passes since quarantine
  history: FlakyHistoryEntry[];                // History records
  classification: FlakyClassification;         // Test classification
  weightedFailureRate: number;                 // Weighted failure rate (recent weights higher)
  consecutiveFailures: number;                 // Current consecutive failure count
  consecutivePasses: number;                   // Current consecutive pass count
  lastClassifiedAt?: number;                   // Last classification timestamp
  rootCause?: RootCauseAnalysis;               // Root cause analysis result
  isolationLevel?: IsolationLevel;             // Isolation level
  quarantineStrategy?: QuarantineStrategy;     // Quarantine strategy
  trendAnalysis?: TrendAnalysis;               // Trend analysis result
  healthScore?: FlakyHealthScore;              // Health score
  durationAnomaly?: DurationAnomaly;           // Duration anomaly
  lastPrediction?: PredictionResult;           // Most recent prediction result
  aiDiagnosis?: AIDiagnosis;                   // AI diagnosis result
}
```

### FlakyHistoryEntry

```typescript
interface FlakyHistoryEntry {
  timestamp: number;                                    // Timestamp
  status: 'passed' | 'failed' | 'skipped' | 'timedout'; // Run status
  duration: number;                                     // Run duration (milliseconds)
  error?: string;                                       // Error message
}
```

### FlakyClassification

```typescript
type FlakyClassification =
  | 'flaky'              // Unstable: passes and failures alternate
  | 'broken'             // Broken: persistently failing (consecutive failures ≥5)
  | 'regression'         // Regression: recent failure rate significantly higher than earlier
  | 'monitor'            // Monitor: low failure rate but worth watching
  | 'stable'             // Stable: very low failure rate
  | 'insufficient_data'; // Insufficient data: not enough runs to determine
```

### IsolationLevel

```typescript
type IsolationLevel =
  | 'none'              // No isolation
  | 'monitor'           // Monitor mode
  | 'soft_quarantine'   // Soft quarantine (retry strategy)
  | 'hard_quarantine';  // Hard quarantine (skip test)
```

### QuarantineStrategyType

```typescript
type QuarantineStrategyType =
  | 'skip'       // Skip test
  | 'retry_only' // Retry only
  | 'soft'       // Soft quarantine
  | 'hard'       // Hard quarantine
  | 'graduated'; // Graduated quarantine
```

### QuarantineConfig

```typescript
interface QuarantineConfig {
  enabled: boolean;                       // Whether to enable Flaky management
  threshold: number;                      // Flaky detection threshold
  autoQuarantine: boolean;                // Whether to auto-quarantine
  minimumRuns?: number;                   // Minimum run count
  autoReleaseAfterPasses?: number;        // Consecutive passes required for auto-release
  quarantineExpiryDays?: number;          // Quarantine expiry days
  decayRate?: number;                     // Weighted decay rate
  confidenceLevel?: number;               // Statistical significance confidence level
  brokenThreshold?: number;               // Broken classification threshold
  regressionWindow?: number;              // Regression analysis window
  enableRootCauseAnalysis?: boolean;      // Enable root cause analysis
  enableCorrelationAnalysis?: boolean;    // Enable correlation analysis
  enableTrendTracking?: boolean;          // Enable trend tracking
  enablePrediction?: boolean;             // Enable failure prediction
  enableCausalGraph?: boolean;            // Enable causal graph
  quarantineStrategy?: QuarantineStrategyType; // Quarantine strategy type
  maxQuarantineRatio?: number;            // Maximum quarantine ratio
  predictionSensitivity?: number;         // Prediction sensitivity
}
```

### QuarantineStrategy

```typescript
interface QuarantineStrategy {
  testId: string;                         // Test ID
  strategy: QuarantineStrategyType;       // Strategy type
  isolationLevel: IsolationLevel;         // Isolation level
  retryPolicy: RetryPolicy;               // Retry policy
  reason: string;                         // Quarantine reason
  expiresAt?: number;                     // Expiry timestamp
}
```

### RetryPolicy

```typescript
interface RetryPolicy {
  maxRetries: number;         // Maximum retry count
  retryDelay: number;         // Retry delay (milliseconds)
  backoffMultiplier: number;  // Backoff multiplier
  retryOnPassOnly: boolean;   // Whether to retry only on pass
}
```

### RootCauseAnalysis

```typescript
interface RootCauseAnalysis {
  testId: string;                   // Test ID
  primaryCause: RootCauseType;      // Primary root cause type
  confidence: number;               // Confidence (0-1)
  evidence: RootCauseEvidence[];     // Evidence list
  suggestedActions: string[];        // Suggested actions
  analyzedAt: number;                // Analysis timestamp
}
```

### RootCauseType

```typescript
type RootCauseType =
  | 'timing'            // Timing issue
  | 'data_race'         // Data race
  | 'environment'       // Environment issue
  | 'external_service'  // External service
  | 'test_order'        // Test order
  | 'resource_leak'     // Resource leak
  | 'assertion_flaky'   // Assertion instability
  | 'unknown';          // Unknown cause
```

### RootCauseEvidence

```typescript
interface RootCauseEvidence {
  type: RootCauseType;       // Root cause type
  indicators: string[];      // Indicator list
  confidence: number;        // Confidence (0-1)
  description: string;       // Description
}
```

### CorrelationGroup

```typescript
interface CorrelationGroup {
  groupId: string;                  // Correlation group ID
  testIds: string[];                // List of correlated test IDs
  correlationType: CorrelationType; // Correlation type
  confidence: number;               // Confidence (0-1)
  evidence: string;                 // Evidence description
}
```

### CorrelationType

```typescript
type CorrelationType =
  | 'same_run'            // Same run
  | 'same_shard'          // Same shard
  | 'same_time_window'    // Same time window
  | 'same_error_pattern'  // Same error pattern
  | 'same_file';          // Same file
```

### TrendAnalysis

```typescript
interface TrendAnalysis {
  testId: string;                           // Test ID
  direction: TrendDirection;                // Trend direction
  slope: number;                            // Slope
  r2: number;                               // R² goodness of fit
  dataPoints: TrendDataPoint[];             // Data points
  changePoints: ChangePoint[];              // Change points
  seasonalPattern: SeasonalPattern | null;  // Seasonal pattern
  codeChangeCorrelations: CodeChangeCorrelation[]; // Code change correlations
  forecast: TrendForecast;                  // Forecast
  analyzedAt: number;                       // Analysis timestamp
}
```

### TrendDirection

```typescript
type TrendDirection =
  | 'improving'  // Improving
  | 'stable'     // Stable
  | 'degrading'  // Degrading
  | 'volatile';  // Volatile
```

### TrendDataPoint

```typescript
interface TrendDataPoint {
  timestamp: number;    // Timestamp
  passRate: number;     // Pass rate
  failRate: number;     // Fail rate
  avgDuration: number;  // Average duration
  flakyCount: number;   // Flaky count
  totalRuns: number;    // Total run count
}
```

### ChangePoint

```typescript
interface ChangePoint {
  timestamp: number;    // Change point timestamp
  beforeRate: number;   // Failure rate before change point
  afterRate: number;    // Failure rate after change point
  magnitude: number;    // Change magnitude
  confidence: number;   // Confidence
}
```

### SeasonalPattern

```typescript
interface SeasonalPattern {
  period: 'hourly' | 'daily' | 'weekly'; // Period type
  peakHours: number[];                     // Peak hours
  peakDays: number[];                      // Peak days
  amplitude: number;                       // Amplitude
  confidence: number;                      // Confidence
}
```

### CodeChangeCorrelation

```typescript
interface CodeChangeCorrelation {
  commitHash: string;       // Commit hash
  commitMessage: string;    // Commit message
  timestamp: number;        // Commit timestamp
  author: string;           // Author
  affectedFiles: string[];  // List of affected files
  correlationScore: number; // Correlation score
  flakyRateBefore: number;  // Failure rate before change
  flakyRateAfter: number;   // Failure rate after change
}
```

### TrendForecast

```typescript
interface TrendForecast {
  next7Days: TrendDataPoint[];    // Next 7 days forecast
  confidence: number;              // Forecast confidence
  projectedDirection: TrendDirection; // Projected trend direction
}
```

### FlakyHealthScore

```typescript
interface FlakyHealthScore {
  overall: number;            // Overall score (0-1)
  breakdown: {
    stability: number;        // Stability score
    trend: number;            // Trend score
    recoverability: number;   // Recoverability score
    predictability: number;   // Predictability score
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F'; // Grade
  label: string;              // Grade label
}
```

### PredictionResult

```typescript
interface PredictionResult {
  testId: string;              // Test ID
  willFail: boolean;           // Whether failure is predicted
  probability: number;         // Failure probability
  confidence: number;          // Prediction confidence
  signals: PredictionSignal[]; // Prediction signal list
  recommendedAction: string;   // Recommended action
  predictedAt: number;         // Prediction timestamp
}
```

### PredictionSignal

```typescript
interface PredictionSignal {
  type: 'duration_anomaly' | 'failure_pattern' | 'environment_shift' | 'code_change' | 'resource_pressure';
  strength: number;                   // Signal strength
  description: string;                // Signal description
  data: Record<string, unknown>;      // Signal data
}
```

### DurationAnomaly

```typescript
interface DurationAnomaly {
  testId: string;       // Test ID
  baseline: number;     // Baseline duration
  current: number;      // Current duration
  deviation: number;    // Deviation
  isAnomaly: boolean;   // Whether anomaly
  zScore: number;       // Z-score
  detectedAt: number;   // Detection timestamp
}
```

### CausalGraph

```typescript
interface CausalGraph {
  nodes: CausalNode[];              // Causal node list
  edges: CausalEdge[];              // Causal edge list
  rootCauses: CausalNode[];         // Root cause node list
  impactMap: Map<string, string[]>; // Impact map: node ID -> list of affected node IDs
  builtAt: number;                  // Build timestamp
}
```

### CausalNode

```typescript
interface CausalNode {
  id: string;                                                    // Node ID
  type: 'test' | 'infrastructure' | 'external_service' | 'shared_state'; // Node type
  label: string;                                                 // Node label
  metadata: Record<string, unknown>;                             // Node metadata
}
```

### CausalEdge

```typescript
interface CausalEdge {
  from: string;           // Source node ID
  to: string;             // Target node ID
  weight: number;         // Weight
  type: 'depends_on' | 'shares_resource' | 'same_environment' | 'sequential' | 'correlated_failure';
  confidence: number;     // Confidence
}
```

### ImpactAnalysis

```typescript
interface ImpactAnalysis {
  testId: string;                           // Test ID
  directlyAffected: string[];               // Directly affected test ID list
  indirectlyAffected: string[];             // Indirectly affected test ID list
  totalImpact: number;                      // Total impact count
  riskLevel: 'low' | 'medium' | 'high' | 'critical'; // Risk level
  recommendation: string;                   // Recommendation
}
```

### ImmediateFailure

```typescript
interface ImmediateFailure {
  testId: string;       // Test ID
  title: string;        // Test title
  error?: string;       // Error message
  status: string;       // Run status
  timestamp: number;    // Timestamp
  duration?: number;    // Run duration
}
```

### FailureAnalysisSummary

```typescript
interface FailureAnalysisSummary {
  total: number;                          // Total test count
  persistent: number;                     // Persistent failure count
  emerging: number;                       // Emerging failure count
  firstTimeFailures: number;              // First-time failure count
  byClassification: Record<string, number>; // Statistics by classification
}
```

### FailureAnalysisResult

```typescript
type FailureAnalysisResult =
  | FailureAnalysisSummary   // When filter is not provided
  | FlakyTest[]              // When filter is 'persistent' or 'emerging'
  | ImmediateFailure[];      // When filter is 'immediate'
```

### FlakyCriteriaConfig

```typescript
interface FlakyCriteriaConfig {
  minimumRuns: number;                  // Minimum run count, default 5
  flakyThreshold: number;               // Flaky threshold, default 0.3
  monitorThreshold: number;             // Monitor threshold, default 0.1
  stableThreshold: number;              // Stable threshold, default 0.05
  highThreshold: number;                // High risk threshold, default 0.5
  brokenConsecutiveThreshold: number;   // Broken consecutive failure threshold, default 5
  regressionWindow: number;             // Regression window, default 5
  regressionRecentFailRate: number;     // Regression recent failure rate threshold, default 0.6
  regressionOlderFailRate: number;      // Regression older failure rate threshold, default 0.2
  decayRate: number;                    // Decay rate, default 0.1
  confidenceLevel: number;              // Confidence level, default 0.95
  autoReleaseAfterPasses: number;       // Auto-release pass count, default 3
}
```

### QuarantineCriteriaConfig

```typescript
interface QuarantineCriteriaConfig {
  softThreshold: number;                      // Soft quarantine threshold, default 0.15
  hardThreshold: number;                      // Hard quarantine threshold, default 0.4
  maxQuarantineRatio: number;                 // Maximum quarantine ratio, default 0.2
  autoReleaseHardQuarantinePasses: number;    // Hard quarantine auto-release pass count, default 5
  quarantineExpiryDays: number;               // Quarantine expiry days, default 30
  quarantineExpiryDowngrade: boolean;         // Whether to downgrade on expiry, default true
  retryMax: number;                           // Maximum retry count, default 3
  retryDelayMs: number;                       // Retry delay (milliseconds), default 1000
  retryBackoff: number;                       // Retry backoff multiplier, default 2
}
```

### TestResult

```typescript
interface TestResult {
  id: string;                                          // Test ID
  title: string;                                       // Test title
  fullTitle?: string;                                  // Full title
  file?: string;                                       // File path
  line?: number;                                       // Line number
  column?: number;                                     // Column number
  status: 'passed' | 'failed' | 'skipped' | 'timedout'; // Run status
  duration: number;                                    // Run duration (milliseconds)
  error?: string;                                      // Error message
  retries: number;                                     // Retry count
  manualReruns?: number;                               // Manual rerun count
  runHistory?: TestRunHistory[];                       // Run history
  timestamp: number;                                   // Timestamp
  browser: BrowserType;                                // Browser type
  shard?: number;                                      // Shard number
  screenshots?: string[];                              // Screenshot paths
  videos?: string[];                                   // Video paths
  traces?: string[];                                   // Trace paths
  logs?: string[];                                     // Logs
  stackTrace?: string;                                 // Stack trace
}
```

### RunResult

```typescript
interface RunResult {
  id: string;                                          // Run ID
  version: string;                                     // Version number
  status: 'success' | 'failed' | 'cancelled' | 'running'; // Run status
  startTime: number;                                   // Start timestamp
  endTime?: number;                                    // End timestamp
  duration?: number;                                   // Total duration
  suites: SuiteResult[];                               // Test suite list
  totalTests: number;                                  // Total test count
  passed: number;                                      // Pass count
  failed: number;                                      // Fail count
  skipped: number;                                     // Skip count
  flakyTests: TestResult[];                            // Flaky test list
  metadata?: RunMetadata;                              // Run metadata
}
```

### SuiteResult

```typescript
interface SuiteResult {
  name: string;           // Suite name
  totalTests: number;     // Total test count
  passed: number;         // Pass count
  failed: number;         // Fail count
  skipped: number;        // Skip count
  duration: number;       // Duration
  tests: TestResult[];    // Test result list
  timestamp: number;      // Timestamp
}
```

---

## Constant Default Values

The following constants are from `FLAKY_CONFIG`, defining default parameters for each functional module:

| Constant | Value | Description |
|------|----|------|
| `DEFAULT_THRESHOLD` | `0.3` | Default Flaky detection threshold |
| `MONITOR_THRESHOLD` | `0.1` | Monitor threshold |
| `HIGH_THRESHOLD` | `0.5` | High risk threshold |
| `MAX_HISTORY_ENTRIES` | `50` | Maximum history entries |
| `MINIMUM_RUNS_FOR_QUARANTINE` | `5` | Minimum runs required for quarantine |
| `AUTO_RELEASE_AFTER_PASSES` | `3` | Auto-release consecutive pass count |
| `AUTO_RELEASE_HARD_QUARANTINE_PASSES` | `5` | Hard quarantine auto-release pass count |
| `QUARANTINE_EXPIRY_DAYS` | `30` | Quarantine expiry days |
| `QUARANTINE_EXPIRY_DOWNGRADE` | `true` | Whether to downgrade on expiry |
| `DECAY_RATE` | `0.1` | Weighted decay rate |
| `CONFIDENCE_LEVEL` | `0.95` | Statistical confidence level |
| `BROKEN_CONSECUTIVE_THRESHOLD` | `5` | Broken consecutive failure threshold |
| `REGRESSION_WINDOW` | `5` | Regression analysis window |
| `CORRELATION_CO_OCCURRENCE_THRESHOLD` | `0.6` | Correlation co-occurrence threshold |
| `CORRELATION_MIN_RUNS` | `3` | Minimum runs for correlation analysis |
| `TREND_AGGREGATION_WINDOW_DAYS` | `7` | Trend aggregation window (days) |
| `TREND_MIN_DATA_POINTS` | `5` | Minimum data points for trend analysis |
| `TREND_CHANGE_POINT_THRESHOLD` | `0.3` | Change point detection threshold |
| `TREND_SEASONAL_MIN_CYCLES` | `3` | Minimum cycles for seasonal pattern |
| `PREDICTION_WINDOW_RUNS` | `10` | Prediction window run count |
| `PREDICTION_DURATION_ANOMALY_ZSCORE` | `2.0` | Duration anomaly Z-score threshold |
| `PREDICTION_MIN_HISTORY` | `8` | Minimum history required for prediction |
| `PREDICTION_SENSITIVITY` | `0.5` | Prediction sensitivity |
| `QUARANTINE_MAX_RATIO` | `0.2` | Maximum quarantine ratio |
| `QUARANTINE_SOFT_THRESHOLD` | `0.15` | Soft quarantine threshold |
| `QUARANTINE_HARD_THRESHOLD` | `0.4` | Hard quarantine threshold |
| `QUARANTINE_RETRY_MAX` | `3` | Maximum quarantine retry count |
| `QUARANTINE_RETRY_DELAY_MS` | `1000` | Quarantine retry delay |
| `QUARANTINE_RETRY_BACKOFF` | `2` | Quarantine retry backoff multiplier |
| `CAUSAL_MIN_CORRELATION` | `0.4` | Causal graph minimum correlation |
| `CAUSAL_MAX_DEPTH` | `5` | Causal graph maximum depth |
| `HEALTH_SCORE_WEIGHTS.stability` | `0.35` | Stability weight |
| `HEALTH_SCORE_WEIGHTS.trend` | `0.25` | Trend weight |
| `HEALTH_SCORE_WEIGHTS.recoverability` | `0.2` | Recoverability weight |
| `HEALTH_SCORE_WEIGHTS.predictability` | `0.2` | Predictability weight |
