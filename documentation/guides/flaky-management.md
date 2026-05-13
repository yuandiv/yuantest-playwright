# Flaky Test Management In-Depth Guide

This guide provides an in-depth introduction to the design principles, core algorithms, and configuration methods of the Flaky Test Management System. All content is consistent with the project's source code implementation.

---

## Table of Contents

- [1. System Architecture Overview](#1-system-architecture-overview)
- [2. Classification Algorithm](#2-classification-algorithm)
  - [2.1 Six Classifications](#21-six-classifications)
  - [2.2 Time-Decay Weighted Failure Rate](#22-time-decay-weighted-failure-rate)
  - [2.3 Wilson Confidence Interval](#23-wilson-confidence-interval)
  - [2.4 Statistical Significance Test](#24-statistical-significance-test)
  - [2.5 Classification Decision Flow](#25-classification-decision-flow)
- [3. Root Cause Analysis](#3-root-cause-analysis)
  - [3.1 Seven Root Cause Types](#31-seven-root-cause-types)
  - [3.2 Detector Details](#32-detector-details)
  - [3.3 Suggested Actions](#33-suggested-actions)
- [4. Correlation Analysis](#4-correlation-analysis)
  - [4.1 Correlation Types](#41-correlation-types)
  - [4.2 Jaccard Co-occurrence Coefficient](#42-jaccard-co-occurrence-coefficient)
  - [4.3 Union-Find Merging](#43-union-find-merging)
  - [4.4 Correlation Type Determination](#44-correlation-type-determination)
- [5. Trend Tracking](#5-trend-tracking)
  - [5.1 Time Series Aggregation](#51-time-series-aggregation)
  - [5.2 Trend Direction Detection](#52-trend-direction-detection)
  - [5.3 Change Point Detection](#53-change-point-detection)
  - [5.4 Seasonal Pattern Detection](#54-seasonal-pattern-detection)
  - [5.5 Code Change Correlation](#55-code-change-correlation)
  - [5.6 Trend Forecasting](#56-trend-forecasting)
- [6. Quarantine Strategy](#6-quarantine-strategy)
  - [6.1 Isolation Levels](#61-isolation-levels)
  - [6.2 Strategy Types](#62-strategy-types)
  - [6.3 Graduated Isolation Determination](#63-graduated-isolation-determination)
  - [6.4 Root Cause-Aware Retry Strategy](#64-root-cause-aware-retry-strategy)
  - [6.5 Budget Control](#65-budget-control)
  - [6.6 Auto-Release and Expiry Downgrade](#66-auto-release-and-expiry-downgrade)
- [7. Health Score](#7-health-score)
  - [7.1 Four-Dimensional Scoring Model](#71-four-dimensional-scoring-model)
  - [7.2 Grade Mapping](#72-grade-mapping)
- [8. Causal Graph](#8-causal-graph)
  - [8.1 Node Types](#81-node-types)
  - [8.2 Edge Types](#82-edge-types)
  - [8.3 Graph Construction Flow](#83-graph-construction-flow)
  - [8.4 Root Cause Identification](#84-root-cause-identification)
  - [8.5 Impact Analysis](#85-impact-analysis)
- [9. Parameter Customization](#9-parameter-customization)
  - [9.1 FlakyCriteriaConfig (12 Parameters)](#91-flakycriteriaconfig-12-parameters)
  - [9.2 QuarantineCriteriaConfig (9 Parameters)](#92-quarantinecriteriaconfig-9-parameters)
  - [9.3 Customization Methods](#93-customization-methods)

---

## 1. System Architecture Overview

The Flaky Test Management System consists of the following core modules, corresponding to the `src/flaky/` directory in the source code:

| Module | Source File | Responsibility |
|--------|-------------|----------------|
| Classifier | `classifier.ts` | Classifies tests into 6 categories based on run history |
| Root Cause Analysis | `root-cause.ts` | Identifies 7 root cause types |
| Correlation Analysis | `correlation.ts` | Discovers co-occurrence correlations between tests |
| Trend Tracking | `trend.ts` | Time series analysis, change point detection, forecasting |
| Quarantine Strategy | `quarantine-strategy.ts` | Graduated isolation, retry strategies, budget management |
| Causal Graph | `causal-graph.ts` | Builds causal dependency graph, impact analysis |
| Manager | `index.ts` | `FlakyTestManager` orchestrates all modules |
| Config Merge | `config-merge.ts` | Safe merging of user configuration with defaults |

---

## 2. Classification Algorithm

> Source: `src/flaky/classifier.ts`

### 2.1 Six Classifications

The system classifies tests into the following 6 categories (`FlakyClassification`):

| Classification | Meaning | Decision Criteria |
|----------------|---------|-------------------|
| `flaky` | Alternating pass/fail | Weighted failure rate ≥ `flakyThreshold` (0.3) and < `highThreshold` (0.5) |
| `broken` | Consistently failing | Consecutive failures ≥ `brokenConsecutiveThreshold` (5) times |
| `regression` | Regression | Recent window failure rate ≥ `regressionRecentFailRate` (0.6) and older failure rate ≤ `regressionOlderFailRate` (0.2) |
| `monitor` | Needs attention | Weighted failure rate ≥ `monitorThreshold` (0.1) and < `flakyThreshold` (0.3) |
| `stable` | Stable | Weighted failure rate < `stableThreshold` (0.05) |
| `insufficient_data` | Insufficient data | Run count < `minimumRuns` (5) |

### 2.2 Time-Decay Weighted Failure Rate

The function `calculateWeightedFailureRate(history, decayRate=0.1)` uses exponential decay to weight historical records, making recent results have greater influence on classification:

```
weight = exp(-decayRate × ageInDays)
weightedFailureRate = Σ(weightedFailures) / Σ(weightedTotal)
```

**Decay Effect Example** (`decayRate = 0.1`):

| Time Distance | Weight | Description |
|---------------|--------|-------------|
| 1 day ago | ~0.90 | Nearly full weight |
| 7 days ago | ~0.50 | Weight halved |
| 14 days ago | ~0.25 | Quarter weight |
| 30 days ago | ~0.05 | Almost no influence |

Both `failed` and `timedout` statuses are counted as failures.

### 2.3 Wilson Confidence Interval

The function `wilsonConfidenceInterval(failures, total, confidence=0.95)` calculates the confidence interval for failure rate based on binomial distribution, avoiding overconfident flaky classification with small samples.

**Supported Confidence Levels and Corresponding Z Values**:

| Confidence Level | Z Value |
|------------------|---------|
| 0.90 | 1.645 |
| 0.95 | 1.96 |
| 0.99 | 2.576 |

**Core Formula**:

```
denominator = 1 + z²/n
centre = p + z²/(2n)
margin = z × √((p(1-p) + z²/(4n)) / n)

lower = max(0, (centre - margin) / denominator)
upper = min(1, (centre + margin) / denominator)
```

Where `p = failures / total`. The interval automatically widens for small samples, reflecting uncertainty.

### 2.4 Statistical Significance Test

The function `isStatisticallySignificant(test, threshold, minRuns, confidence=0.95)` determines whether the failure rate is statistically significant:

**Decision Criteria** (must satisfy all):
1. Run count ≥ `minRuns`
2. Wilson confidence interval **lower bound** ≥ `threshold`

> Note: The source code uses `ci.lower >= threshold`, meaning the confidence interval lower bound must exceed the threshold to be considered significant. This ensures significance is only determined when the failure rate is definitively high enough.

### 2.5 Classification Decision Flow

`classifyTest(test, config)` determines classification in the following priority order:

```
1. Run count < minimumRuns → insufficient_data
2. Consecutive failures ≥ brokenConsecutiveThreshold and last N runs all failed → broken
3. Matches regression pattern (high recent failure rate, low older failure rate) → regression
4. Weighted failure rate < stableThreshold → stable
5. Weighted failure rate ≥ flakyThreshold → flaky
6. Weighted failure rate ≥ monitorThreshold → monitor
7. Raw failure rate ≥ flakyThreshold but weighted failure rate < flakyThreshold → stable (improving)
8. Default → monitor
```

> **Key Detail**: Step 7 is an "improving" determination—if the raw failure rate is high but the time-decay weighted failure rate has decreased, it indicates the test is recovering, so it's classified as `stable`.

---

## 3. Root Cause Analysis

> Source: `src/flaky/root-cause.ts`

### 3.1 Seven Root Cause Types

`RootCauseType` contains the following 7 types + 1 fallback:

| Root Cause Type | Identifier | Core Judgment Basis |
|-----------------|------------|---------------------|
| Timing Issue | `timing` | Error contains timeout/waiting keywords, duration coefficient of variation > 0.5 |
| Data Race | `data_race` | Pass rate difference between shards ≥ 0.3 |
| Environment Dependency | `environment` | Failure timestamps show clustering pattern, or specific CI node failure rate ≥ 50% |
| External Service | `external_service` | Error contains network/fetch/ECONNREFUSED/5xx keywords |
| Test Order | `test_order` | Specific preceding test appears in ≥ 50% of failures |
| Resource Leak | `resource_leak` | Duration trend slope > 0.1, or memory-related errors |
| Assertion Flaky | `assertion_flaky` | Error contains assertion/expect keywords, and timing errors ≤ assertion errors |
| Unknown | `unknown` | Fallback type when all detectors fail to match |

### 3.2 Detector Details

#### 3.2.1 Timing Issue Detection `detectTimingIssue`

**Keyword List**: `timeout`, `timed out`, `waiting for selector`, `waiting for element`, `exceeded`, `navigation`, `waiting for`, `slow`

**Decision Logic**:
- Count errors containing above keywords in history as `keywordHits`
- Calculate duration coefficient of variation `CV = standard deviation / mean`
- If `keywordHits === 0` and `CV ≤ 0.5`, return null (not detected)
- Otherwise return evidence

**Confidence Calculation**:
```
confidence = min(1, (keywordHits / historyLength) × 0.7 + (CV > 0.5 ? 0.3 : 0))
```

**Duration Coefficient of Variation Threshold**: `DURATION_CV_THRESHOLD = 0.5`

#### 3.2.2 Data Race Detection `detectDataRace`

**Decision Logic**:
- Requires `shardMap` information in context
- Count pass/fail occurrences for the same test across different shards
- Calculate pass rate for each shard; if max pass rate - min pass rate ≥ 0.3, determine as data race
- Requires at least 2 shards to be meaningful

**Confidence Calculation**:
```
confidence = min(1, divergence + 0.2)
```

#### 3.2.3 Environment Dependency Detection `detectEnvironmentDependency`

**Two Detection Paths**:

1. **Time Clustering**: Failure timestamp intervals are significantly smaller than expected intervals (short interval ratio ≥ 50%), determined as time clustering
2. **Node Clustering**: Failure rate on specific CI node ≥ 50% (and that node has at least 2 runs)

**Confidence Calculation**:
```
confidence = (timeClustered ? 0.4 : 0) + (nodeClustered ? 0.5 : 0)
```

#### 3.2.4 External Service Detection `detectExternalService`

**Keyword List**: `network`, `fetch`, `econnrefused`, `econnreset`, `enetunreach`, `err_connection`, `cors`, `5xx`, `500`, `502`, `503`, `504`, `service unavailable`, `gateway timeout`, `bad gateway`, `internal server error`

**Confidence Calculation**:
```
confidence = min(1, (keywordHits / historyLength) × 0.8 + 0.2)
```

#### 3.2.5 Test Order Detection `detectTestOrderDependency`

**Decision Logic**:
- Requires at least 2 run records
- Find the ID of the preceding test when the target test fails
- If a specific preceding test appears in ≥ 50% of failures, and absolute count ≥ 2, determine as order dependency

**Confidence Calculation**:
```
confidence = min(1, (maxPrecedingCount / failCount) × 0.7 + 0.2)
```

#### 3.2.6 Resource Leak Detection `detectResourceLeak`

**Keyword List**: `memory`, `heap`, `out of memory`, `cannot allocate`, `too many open files`, `emfile`, `connection pool`, `max connections`, `resource`

**Decision Logic**:
- Count memory/resource related error keyword hits
- Calculate linear trend slope of duration (normalized)
- If `keywordHits === 0` and `trendSlope ≤ 0.1`, return null
- Duration trend threshold: `DURATION_TREND_THRESHOLD = 0.1`

**Confidence Calculation**:
```
confidence = min(1, (keywordHits > 0 ? 0.5 : 0) + (trendSlope > 0.1 ? 0.4 : 0))
```

#### 3.2.7 Assertion Flaky Detection `detectAssertionFlaky`

**Keyword List**: `assertion`, `assert`, `expect`, `to be`, `to equal`, `to match`, `received`, `expected`

**Decision Logic**:
- Count assertion-related keyword hits
- If timing error count > assertion error count, return null (more likely timing issue than assertion issue)
- This ensures assertion flaky doesn't get confused with timing issues

**Confidence Calculation**:
```
confidence = min(1, (keywordHits / historyLength) × 0.6 + 0.3)
```

### 3.3 Suggested Actions

`RootCauseAnalyzer.analyze()` returns `suggestedActions` automatically generated based on root cause type:

| Root Cause Type | Suggested Actions |
|-----------------|-------------------|
| `timing` | Increase timeout, add explicit waits, check page load performance, consider retry |
| `data_race` | Check shared state, ensure data independence, avoid global state, use beforeEach reset |
| `environment` | Check CI environment differences, ensure consistency, check resource contention, stagger execution |
| `external_service` | Add health checks, use mocks, increase retries, check SLA |
| `test_order` | Ensure independence, check state leakage, use beforeEach/afterEach, merge or split tests |
| `resource_leak` | Check unclosed connections, ensure cleanup, monitor memory, check browser instances |
| `assertion_flaky` | Check floating-point comparisons, avoid exact time matching, use loose matchers, check dynamic content |
| `unknown` | Collect more data, check non-deterministic logic, add logging |

---

## 4. Correlation Analysis

> Source: `src/flaky/correlation.ts`

### 4.1 Correlation Types

`CorrelationType` contains 5 correlation types:

| Type | Meaning |
|------|---------|
| `same_run` | Failed together in the same run |
| `same_shard` | Failed together in the same shard |
| `same_time_window` | Failed within the same time window |
| `same_error_pattern` | Share the same error pattern |
| `same_file` | Located in the same test file |

### 4.2 Jaccard Co-occurrence Coefficient

Uses Jaccard coefficient to measure the frequency of two tests failing together in the same run:

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

Where A and B are the sets of run IDs where each test failed.

**Threshold**: `CORRELATION_CO_OCCURRENCE_THRESHOLD = 0.6`, i.e., Jaccard coefficient ≥ 0.6 is considered correlated.

**Minimum Run Count**: `CORRELATION_MIN_RUNS = 3`, tests with insufficient runs don't participate in analysis.

### 4.3 Union-Find Merging

Uses Union-Find data structure to efficiently merge test pairs with high co-occurrence, forming correlation groups:

- **Path Compression**: `find()` operation with path compression, achieving near O(1) lookup
- **Union by Rank**: `union()` operation with union by rank, keeping the tree balanced

**Process**:
1. Calculate Jaccard coefficient for all eligible test pairs
2. Execute `union()` merge for pairs with coefficient ≥ 0.6
3. Iterate all tests, group by `find()` root node
4. Only keep groups with ≥ 2 members
5. Calculate average co-occurrence coefficient and dominant correlation type within each group

### 4.4 Correlation Type Determination

`determineCorrelationType()` determines the correlation type between two tests in the following priority order:

```
1. Same error pattern → same_error_pattern
2. Same file → same_file
3. Co-occurrence coefficient ≥ 0.8 → same_run
4. Default → same_time_window
```

**Same Error Pattern Determination**: Two tests' error keyword intersection ≥ 2, and intersection ratio to larger set ≥ 0.5.

**Same File Determination**: Extract `.spec.ts/.test.ts` etc. file paths from error stack traces, compare if they match.

---

## 5. Trend Tracking

> Source: `src/flaky/trend.ts`

### 5.1 Time Series Aggregation

`aggregateTimeSeries(history, windowDays=7)` aggregates history records into daily time series data points:

**Each Data Point Contains**:
- `passRate`: Pass rate for that day
- `failRate`: Failure rate for that day
- `avgDuration`: Average duration for that day
- `flakyCount`: Failure count for that day
- `totalRuns`: Total run count for that day

**Moving Average Smoothing**: When `windowDays > 1`, applies centered moving average smoothing with window size of `windowDays`, reducing noise to highlight trends.

### 5.2 Trend Direction Detection

`detectTrendDirection(dataPoints)` returns `TrendDirection`, containing 4 directions:

| Direction | Meaning | Decision Criteria |
|-----------|---------|-------------------|
| `improving` | Improving | Linear regression slope < -0.02 |
| `stable` | Stable | Slope between [-0.02, 0.02] |
| `degrading` | Degrading | Slope > 0.02 |
| `volatile` | Volatile | R² < 0.3 (poor linear fit) |

**Linear Regression**: Uses least squares method to fit `y = slope × x + intercept`, returning slope, intercept, and R² coefficient of determination.

> Note: Returns `stable` directly when data points < 3.

### 5.3 Change Point Detection

`detectChangePoints(dataPoints, threshold=0.3)` uses CUSUM algorithm to detect sudden changes in failure rate:

**Algorithm Flow**:
1. Calculate mean and standard deviation of failure rate sequence
2. For each data point, calculate cumulative sum `cusumPos` (positive deviation) and `cusumNeg` (negative deviation)
3. When cumulative sum exceeds `threshold × 5`, check failure rate change in windows before and after
4. If change magnitude ≥ `threshold`, record as change point
5. Reset cumulative sum and continue detection

**Change Point Contains**: `timestamp`, `beforeRate`, `afterRate`, `magnitude`, `confidence`

**Default Threshold**: `TREND_CHANGE_POINT_THRESHOLD = 0.3`

### 5.4 Seasonal Pattern Detection

`detectSeasonalPattern(history, minCycles=3)` analyzes whether failure rate shows periodic fluctuations:

**Detection Dimensions**:
- **By Hour**: Statistics of failure rate for each of 24 hours; if amplitude > overall failure rate × 0.5, identify peak hours
- **By Day of Week**: Statistics of failure rate for each of 7 days; same amplitude judgment

**Period Determination**:
- Has peak day of week → `weekly`
- Has peak hour → `daily`
- Otherwise → `hourly`

**Minimum Cycle Count**: `TREND_SEASONAL_MIN_CYCLES = 3`, requires at least 3 complete cycles of data.

**Peak Determination**: Failure rate for a time period > mean × 1.5.

### 5.5 Code Change Correlation

`correlateCodeChanges(changePoints, codeChanges)` correlates change points with code commits:

**Correlation Conditions**:
- Time difference between code commit and change point ≤ 3 days
- Correlation score = time proximity × change magnitude factor ≥ 0.3

**Time Proximity**: `1 - timeDiff / (3 × MS_PER_DAY)`

**Change Magnitude Factor**: `min(1, magnitude × 2)`

### 5.6 Trend Forecasting

`generateForecast(dataPoints, direction, seasonalPattern)` forecasts the next 7 days based on linear regression and seasonal pattern:

**Forecasting Method**:
1. Use linear regression to extrapolate base failure rate
2. If seasonal pattern exists, add seasonal adjustment `amplitude × 0.3` during peak hours/days
3. Forecast values clamped to [0, 1] range

**Forecast Direction**: slope < -0.01 → `improving`, slope > 0.01 → `degrading`, otherwise → `stable`

**Forecast Confidence**: `min(1, R² × 0.8 + seasonalConfidence × 0.2)`

---

## 6. Quarantine Strategy

> Source: `src/flaky/quarantine-strategy.ts`

### 6.1 Isolation Levels

`IsolationLevel` contains 4 levels, in increasing severity:

| Level | Meaning | Description |
|-------|---------|-------------|
| `none` | No isolation | Normal execution |
| `monitor` | Monitor | Continue execution but with increased observation |
| `soft_quarantine` | Soft quarantine | Retries allowed, not counted in main flow |
| `hard_quarantine` | Hard quarantine | Completely skipped, not executed |

### 6.2 Strategy Types

`QuarantineStrategyType` contains 5 strategies:

| Strategy | Corresponding Isolation Level | Description |
|----------|------------------------------|-------------|
| `skip` | none | Take no action |
| `retry_only` | monitor | Retry only, no isolation |
| `soft` | soft_quarantine | Soft quarantine |
| `hard` | hard_quarantine | Hard quarantine |
| `graduated` | — | Graduated strategy, automatically selects from above strategies based on severity |

### 6.3 Graduated Isolation Determination

`determineIsolationLevel()` decision logic under `graduated` strategy:

```
1. classification === 'broken' → hard_quarantine
2. classification === 'stable' or 'insufficient_data' → none
3. classification === 'monitor' → monitor
4. weightedFailureRate ≥ hardThreshold(0.4) → hard_quarantine
5. weightedFailureRate ≥ softThreshold(0.15) → soft_quarantine
6. weightedFailureRate > 0 → monitor
7. Default → none
```

**Strategy to Isolation Level Mapping**:

| IsolationLevel | QuarantineStrategyType |
|----------------|------------------------|
| `none` | `skip` |
| `monitor` | `retry_only` |
| `soft_quarantine` | `soft` |
| `hard_quarantine` | `hard` |

### 6.4 Root Cause-Aware Retry Strategy

`getRetryPolicyForRootCause()` customizes retry strategy based on root cause type:

| Root Cause Type | Max Retries | Retry Delay | Backoff Multiplier | Retry Only on Pass |
|-----------------|-------------|-------------|--------------------|--------------------|
| `timing` | retryMax(3) | retryDelayMs × 2 | backoff(2) | No |
| `external_service` | retryMax(3) | retryDelayMs × 3 | backoff(2) | No |
| `data_race` | 2 | retryDelayMs | 1 | Yes |
| `environment` | retryMax(3) | retryDelayMs × 2 | backoff(2) | No |
| `resource_leak` | 1 | retryDelayMs × 5 | 1 | Yes |
| `test_order` | 0 | 0 | 1 | Yes |
| `assertion_flaky` | 1 | retryDelayMs | 1 | Yes |
| `unknown` | retryMax(3) | retryDelayMs | backoff(2) | No |

**Design Philosophy**:
- Timing issues and external service issues are suitable for retry (doubled delay, increasing backoff)
- Test order issues are not suitable for retry (maxRetries = 0)
- Resource leaks and assertion flaky have limited retry benefit (maxRetries = 1, retry only on pass)

### 6.5 Budget Control

`checkQuarantineBudget()` limits the proportion of quarantined tests to total tests:

- **Maximum Quarantine Ratio**: `maxQuarantineRatio = 0.2` (at most 20% of tests can be quarantined)
- **Minimum Quarantine Count**: `minQuarantineCount = 3` (even if 20% is less than 3, allow quarantining 3)
- **Maximum Quarantine Count**: `max(3, ceil(totalTests × 0.2))`

**Handling Budget Insufficiency**:
- `QuarantineStrategyManager.generateStrategiesWithBudget()` sorts tests by priority
- Prioritize quarantining `hard_quarantine` > `soft_quarantine` > `monitor` > `none`
- Within same level, sort by weighted failure rate descending
- When budget insufficient, new tests are downgraded to `monitor` (retry_only), with reason appended "quarantine budget insufficient, downgraded to monitor"

### 6.6 Auto-Release and Expiry Downgrade

#### Auto-Release

`checkAutoRelease()` automatically releases quarantined tests after consecutive passes:

- **Soft Quarantine/Monitor**: Released after `autoReleaseAfterPasses` (3) consecutive passes
- **Hard Quarantine**: Released after `autoReleaseHardQuarantinePasses` (5) consecutive passes

Optionally reset history on release (`resetHistory: true`), clearing all statistics to start fresh.

#### Expiry Downgrade

`downgradeExpiredQuarantine()` automatically downgrades after quarantine exceeds `quarantineExpiryDays` (30 days):

- `hard_quarantine` → `monitor` (retry_only)
- `soft_quarantine` → `monitor` (retry_only)

> Note: Downgrade doesn't fully release the test, but reduces to monitor mode for continued observation. This feature is controlled by `quarantineExpiryDowngrade` (default `true`).

---

## 7. Health Score

> Source: `calculateHealthScore()` in `src/flaky/trend.ts`

### 7.1 Four-Dimensional Scoring Model

`FlakyHealthScore` computes overall health score by combining four dimensions:

| Dimension | Weight | Calculation |
|-----------|--------|-------------|
| `stability` | 0.35 | `1 - weightedFailureRate` |
| `trend` | 0.25 | improving=1, stable=0.7, degrading=0.3, volatile=0.2 |
| `recoverability` | 0.20 | `min(1, (passes / totalRuns) × 1.5)` |
| `predictability` | 0.20 | R² value of trend fit |

**Overall Score Formula**:

```
overall = stability × 0.35 + trend × 0.25 + recoverability × 0.2 + predictability × 0.2
```

### 7.2 Grade Mapping

| Grade | Score Range | Label |
|-------|-------------|-------|
| A | ≥ 0.9 | Very healthy |
| B | ≥ 0.75 | Mostly healthy |
| C | ≥ 0.6 | Needs attention |
| D | ≥ 0.4 | Unhealthy |
| F | < 0.4 | Severely unhealthy |

> Note: In the source code, grade B threshold is 0.75, C is 0.6, D is 0.4, slightly different from the 0.7/0.5/0.3 mentioned in user requirements. The source code takes precedence.

**Project-Level Health Score**: `FlakyTestManager.getOverallHealthScore()` averages each dimension across all tests, then calculates project-level score using the same weights and grade mapping. Returns perfect score A ("no test data") when no test data exists.

---

## 8. Causal Graph

> Source: `src/flaky/causal-graph.ts`

### 8.1 Node Types

`CausalNode` contains 4 node types:

| Type | Meaning | Source |
|------|---------|--------|
| `test` | Test node | Each flaky test corresponds to one node |
| `infrastructure` | Infrastructure node | Inferred from correlation groups (timing/environment/resource_leak/unknown) |
| `external_service` | External service node | Inferred from correlation groups (external_service root cause) |
| `shared_state` | Shared state node | Inferred from correlation groups (data_race/test_order/assertion_flaky) |

### 8.2 Edge Types

`CausalEdge` contains 5 edge types:

| Type | Meaning |
|------|---------|
| `depends_on` | Dependency relationship |
| `shares_resource` | Shared resource |
| `same_environment` | Same environment |
| `sequential` | Sequential dependency |
| `correlated_failure` | Correlated failure |

**Edge Types Generated in Actual Construction**:
- `same_error_pattern` type in correlation group → `correlated_failure` edge
- Other types in correlation group → `same_environment` edge
- Co-failure analysis in run results → `correlated_failure` edge

### 8.3 Graph Construction Flow

`CausalGraphBuilder.build(tests, correlationGroups, recentRuns)` construction flow:

1. **Build Test Nodes**: Generate one `test` type node for each flaky test
2. **Infer Infrastructure Nodes**: Infer shared root causes from correlation groups, create `infrastructure`/`external_service`/`shared_state` nodes
3. **Infer Dependency Edges**: Analyze co-failure patterns in run results, generate `correlated_failure` edges
4. **Identify Root Cause Nodes**: Identify root causes through in-degree/out-degree analysis
5. **Build Impact Map**: BFS traversal to calculate impact scope for each node

**Configuration Parameters**:
- `minCorrelation = 0.4`: Edges with co-failure correlation below this value are not generated
- `maxDepth = 5`: Maximum depth for impact map traversal

### 8.4 Root Cause Identification

`identifyRootCauses()` uses in-degree/out-degree analysis to identify root cause nodes:

**Decision Criteria** (satisfy one):
- Node type is not `test` (infrastructure/external_service/shared_state node)
- Out-degree > in-degree × 2 and out-degree > 0.5

**Sorting**: Sorted by out-degree descending; nodes with higher out-degree are more likely to be root causes.

### 8.5 Impact Analysis

`analyzeImpact(testId, graph)` calculates the impact scope of a specified test:

| Metric | Calculation |
|--------|-------------|
| Direct Impact | Nodes pointed to by edges from this node |
| Indirect Impact | Nodes in impact map excluding direct impact |
| Total Impact Score | Direct impact count × 2 + indirect impact count |

**Risk Level**:

| Total Impact Score | Risk Level | Recommendation |
|--------------------|------------|----------------|
| ≥ 10 | `critical` | Highest priority to address |
| ≥ 5 | `high` | Recommend fixing soon |
| ≥ 2 | `medium` | Fix when convenient |
| < 2 | `low` | Normal priority |

---

## 9. Parameter Customization

### 9.1 FlakyCriteriaConfig (12 Parameters)

> Source: `DEFAULT_FLAKY_CRITERIA` in `src/constants/index.ts`

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minimumRuns` | 5 | Minimum run count; below this classified as insufficient_data |
| `flakyThreshold` | 0.3 | Flaky classification threshold; weighted failure rate ≥ this value classified as flaky |
| `monitorThreshold` | 0.1 | Monitor threshold; weighted failure rate ≥ this value needs attention |
| `stableThreshold` | 0.05 | Stable threshold; weighted failure rate < this value classified as stable |
| `highThreshold` | 0.5 | High failure rate threshold; weighted failure rate ≥ this value triggers detection |
| `brokenConsecutiveThreshold` | 5 | Consecutive failure count threshold; reaching this value classified as broken |
| `regressionWindow` | 5 | Regression detection window size (last N runs) |
| `regressionRecentFailRate` | 0.6 | Regression detection: recent window failure rate threshold |
| `regressionOlderFailRate` | 0.2 | Regression detection: older failure rate threshold |
| `decayRate` | 0.1 | Time decay rate, controls how quickly historical weights decrease |
| `confidenceLevel` | 0.95 | Confidence level for Wilson confidence interval |
| `autoReleaseAfterPasses` | 3 | Consecutive passes required for soft quarantine auto-release |

### 9.2 QuarantineCriteriaConfig (9 Parameters)

> Source: `DEFAULT_QUARANTINE_CRITERIA` in `src/constants/index.ts`

| Parameter | Default | Description |
|-----------|---------|-------------|
| `softThreshold` | 0.15 | Soft quarantine threshold; weighted failure rate ≥ this value enters soft quarantine |
| `hardThreshold` | 0.4 | Hard quarantine threshold; weighted failure rate ≥ this value enters hard quarantine |
| `maxQuarantineRatio` | 0.2 | Maximum quarantine ratio; quarantined tests don't exceed 20% of total tests |
| `autoReleaseHardQuarantinePasses` | 5 | Consecutive passes required for hard quarantine auto-release |
| `quarantineExpiryDays` | 30 | Quarantine expiry days; auto-downgrade after exceeding |
| `quarantineExpiryDowngrade` | true | Whether to enable expiry downgrade (downgrade to monitor instead of release) |
| `retryMax` | 3 | Default maximum retry count |
| `retryDelayMs` | 1000 | Default retry delay (milliseconds) |
| `retryBackoff` | 2 | Retry backoff multiplier |

### 9.3 Customization Methods

The system provides three ways to customize parameters:

#### Method 1: user-preferences.json Configuration File

Add `flakyCriteria` and `quarantineCriteria` configuration sections in `user-preferences.json`:

```json
{
  "flakyCriteria": {
    "minimumRuns": 10,
    "flakyThreshold": 0.25,
    "decayRate": 0.15
  },
  "quarantineCriteria": {
    "softThreshold": 0.2,
    "maxQuarantineRatio": 0.15
  }
}
```

> Configuration merging is handled by `mergeFlakyCriteria()` and `mergeQuarantineCriteria()` in `config-merge.ts`, only overwriting fields with valid types; invalid type values use defaults.

#### Method 2: Dashboard UI Parameter Configuration Panel

Visually adjust parameters through the Dashboard's `CriteriaConfigDialog` component; changes take effect immediately.

#### Method 3: FlakyTestManager.setConfig() Method

Dynamically set through code:

```typescript
flakyTestManager.setConfig({
  flakyCriteria: {
    minimumRuns: 10,
    flakyThreshold: 0.25,
  },
  quarantineCriteria: {
    softThreshold: 0.2,
  },
});
```

The `setConfig()` method will:
1. Merge `QuarantineConfig` base configuration
2. Call `mergeFlakyCriteria()` to merge flaky criteria parameters
3. Call `mergeQuarantineCriteria()` to merge quarantine parameters
4. Rebuild `QuarantineStrategyManager` instance with new quarantine parameters

You can get the currently effective complete configuration (with defaults filled in) via `getEffectiveConfig()`.
