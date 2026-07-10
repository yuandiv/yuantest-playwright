# Configuration Reference Documentation

YuanTest Playwright supports customizing behavior through configuration files, command-line arguments, Dashboard UI, and user preference files. This documentation is written based on type definitions and default constants in the source code, ensuring consistency with the actual implementation.

---

## Table of Contents

1. [TestConfig - Basic Test Configuration](#1-testconfig-basic-test-configuration)
2. [FlakyCriteriaConfig - Flaky Test Criteria Parameters](#2-flakycriteriaconfig-flaky-test-criteria-parameters)
3. [QuarantineCriteriaConfig - Quarantine Criteria Parameters](#3-quarantinecriteriaconfig-quarantine-criteria-parameters)
4. [TraceConfig - Trace Configuration](#4-traceconfig-trace-configuration)
5. [ArtifactConfig - Artifact Configuration](#5-artifactconfig-artifact-configuration)
6. [VisualTestingConfig - Visual Testing Configuration](#6-visualtestingconfig-visual-testing-configuration)
7. [AnnotationConfig - Annotation Configuration](#7-annotationconfig-annotation-configuration)
8. [TagConfig - Tag Configuration](#8-tagconfig-tag-configuration)
9. [QuarantineConfig - Quarantine Configuration](#9-quarantineconfig-quarantine-configuration)
10. [LLMConfig - LLM Configuration](#10-llmconfig-llm-configuration)
11. [AgentConfig - Agent Configuration](#11-agentconfig-agent-configuration)
12. [DashboardConfig - Dashboard Configuration](#12-dashboardconfig-dashboard-configuration)
13. [Default Constants Table](#13-default-constants-table)
14. [Configuration Methods](#14-configuration-methods)

---

## 1. TestConfig - Basic Test Configuration

`TestConfig` is the core configuration interface of YuanTest, defining the basic parameters for test execution.

```typescript
interface TestConfig {
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
  retryIndex?: number;
  testMatch?: string[];
  testIgnore?: string[];
  ignoreDirs?: string[];
  environmentTag?: string;
  quarantine?: QuarantineConfig;
}
```

### Parameter Description

| Parameter | Type | Required | Default | Description |
|--------|------|------|--------|------|
| `version` | `string` | Yes | `'1.0.0'` | Configuration version number, used to identify the configuration format |
| `testDir` | `string` | Yes | `'./'` | Root directory for test files |
| `outputDir` | `string` | No | `'./test-output'` | Test output directory |
| `baseURL` | `string` | No | - | Base URL for tests, passed to Playwright `use.baseURL` |
| `retries` | `number` | No | `0` | Number of retries on failure, integer, minimum value 0 |
| `timeout` | `number` | No | `30000` | Test timeout (milliseconds), positive integer |
| `workers` | `number` | No | `1` | Number of parallel workers, positive integer |
| `shards` | `number` | No | `1` | Number of shards, positive integer |
| `reporters` | `string[]` | No | - | List of custom reporters |
| `browsers` | `BrowserType[]` | No | `['chromium']` | List of test browsers, options: `'chromium'`, `'firefox'`, `'webkit'` |
| `headers` | `Record<string, string>` | No | - | Custom HTTP request headers, passed to Playwright `use.extraHTTPHeaders` |
| `flakyThreshold` | `number` | No | `0.3` | Flaky detection threshold (0~1), failure rate above this value is considered Flaky |
| `isolateFlaky` | `boolean` | No | `false` | Whether to automatically isolate Flaky tests |
| `traces` | `TraceConfig` | No | - | Trace configuration, see [TraceConfig](#4-traceconfig-trace-configuration) |
| `artifacts` | `ArtifactConfig` | No | - | Artifact configuration, see [ArtifactConfig](#5-artifactconfig-artifact-configuration) |
| `visualTesting` | `VisualTestingConfig` | No | - | Visual testing configuration, see [VisualTestingConfig](#6-visualtestingconfig-visual-testing-configuration) |
| `annotations` | `AnnotationConfig` | No | - | Annotation configuration, see [AnnotationConfig](#7-annotationconfig-annotation-configuration) |
| `tags` | `TagConfig` | No | - | Tag configuration, see [TagConfig](#8-tagconfig-tag-configuration) |
| `htmlReport` | `boolean` | No | `true` | Whether to generate Playwright HTML report |
| `htmlReportDir` | `string` | No | - | HTML report output subdirectory name, defaults to `html-report` |
| `parentRunId` | `string` | No | - | Parent run ID, used to associate child runs |
| `retryIndex` | `number` | No | - | Current retry index |
| `testMatch` | `string[]` | No | - | Glob patterns to match test files |
| `testIgnore` | `string[]` | No | - | Glob patterns to ignore test files |
| `ignoreDirs` | `string[]` | No | See below | List of directories to ignore, defaults to `FILE_PATTERNS.IGNORE_DIRS` |
| `environmentTag` | `string` | No | - | Environment tag for multi-environment reporting |
| `quarantine` | `QuarantineConfig` | No | - | Quarantine configuration, see [QuarantineConfig](#9-quarantineconfig-quarantine-configuration) |

Default value for `ignoreDirs`:

```
['node_modules', '__snapshots__', '__image_snapshots__', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.svelte-kit']
```

### QuarantineConfig

```typescript
interface QuarantineConfig {
  enabled: boolean;
  threshold: number;
  autoQuarantine: boolean;
}
```

> Full definition with all optional fields, see [QuarantineConfig](#9-quarantineconfig-quarantine-configuration).

### BrowserType

```typescript
type BrowserType = 'chromium' | 'firefox' | 'webkit';
```

---

## 2. FlakyCriteriaConfig - Flaky Test Criteria Parameters

`FlakyCriteriaConfig` defines the criteria for the Flaky test classifier, used to categorize tests into six types: `flaky`, `broken`, `regression`, `monitor`, `stable`, `insufficient_data`.

```typescript
interface FlakyCriteriaConfig {
  minimumRuns: number;
  flakyThreshold: number;
  monitorThreshold: number;
  stableThreshold: number;
  highThreshold: number;
  brokenConsecutiveThreshold: number;
  regressionWindow: number;
  regressionRecentFailRate: number;
  regressionOlderFailRate: number;
  decayRate: number;
  confidenceLevel: number;
  autoReleaseAfterPasses: number;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `minimumRuns` | `number` | `5` | Minimum number of runs, below this value classified as `insufficient_data` |
| `flakyThreshold` | `number` | `0.3` | Flaky threshold, weighted failure rate above this value is considered Flaky |
| `monitorThreshold` | `number` | `0.1` | Monitor threshold, failure rate between this value and Flaky threshold is marked as Monitor |
| `stableThreshold` | `number` | `0.05` | Stable threshold, failure rate below this value is considered Stable |
| `highThreshold` | `number` | `0.5` | High risk threshold, failure rate above this value is considered high-risk Flaky |
| `brokenConsecutiveThreshold` | `number` | `5` | Consecutive failure threshold for Broken, consecutive failures reaching this value is considered Broken |
| `regressionWindow` | `number` | `5` | Regression detection window size (most recent N runs) |
| `regressionRecentFailRate` | `number` | `0.6` | Regression recent failure rate threshold |
| `regressionOlderFailRate` | `number` | `0.2` | Regression older failure rate threshold |
| `decayRate` | `number` | `0.1` | Time decay rate, used for weighted failure rate calculation, more recent runs have higher weight |
| `confidenceLevel` | `number` | `0.95` | Wilson confidence interval level, used for statistical significance judgment |
| `autoReleaseAfterPasses` | `number` | `3` | Number of consecutive passes required for soft quarantine auto-release |

### Classification Logic

- **`insufficient_data`**: Total runs < `minimumRuns`
- **`stable`**: Weighted failure rate < `stableThreshold`
- **`monitor`**: `stableThreshold` ≤ weighted failure rate < `monitorThreshold`
- **`flaky`**: `flakyThreshold` ≤ weighted failure rate < `highThreshold`, and not Broken/Regression
- **`high`**: Weighted failure rate ≥ `highThreshold`
- **`broken`**: Consecutive failures ≥ `brokenConsecutiveThreshold`
- **`regression`**: Recent failure rate ≥ `regressionRecentFailRate` and older failure rate ≤ `regressionOlderFailRate`

---

## 3. QuarantineCriteriaConfig - Quarantine Criteria Parameters

`QuarantineCriteriaConfig` defines the criteria for test quarantine and retry strategies.

```typescript
interface QuarantineCriteriaConfig {
  softThreshold: number;
  hardThreshold: number;
  maxQuarantineRatio: number;
  autoReleaseHardQuarantinePasses: number;
  quarantineExpiryDays: number;
  quarantineExpiryDowngrade: boolean;
  retryMax: number;
  retryDelayMs: number;
  retryBackoff: number;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `softThreshold` | `number` | `0.15` | Soft quarantine threshold, failure rate above this value enters soft quarantine |
| `hardThreshold` | `number` | `0.4` | Hard quarantine threshold, failure rate above this value enters hard quarantine |
| `maxQuarantineRatio` | `number` | `0.2` | Maximum quarantine budget ratio, at most this proportion of tests can be quarantined |
| `autoReleaseHardQuarantinePasses` | `number` | `5` | Number of consecutive passes required for hard quarantine auto-release |
| `quarantineExpiryDays` | `number` | `30` | Quarantine expiry days, automatically processed after expiry |
| `quarantineExpiryDowngrade` | `boolean` | `true` | Whether to downgrade after quarantine expiry (hard quarantine→soft quarantine→release) |
| `retryMax` | `number` | `3` | Maximum number of quarantine retries |
| `retryDelayMs` | `number` | `1000` | Initial quarantine retry delay (milliseconds) |
| `retryBackoff` | `number` | `2` | Quarantine retry backoff multiplier, each retry delay is multiplied by this value |

### Isolation Levels

```typescript
type IsolationLevel = 'none' | 'monitor' | 'soft_quarantine' | 'hard_quarantine';
```

- **`none`**: Normal execution
- **`monitor`**: Monitor mode, records but does not quarantine
- **`soft_quarantine`**: Soft quarantine, tests still run but failures don't count toward overall failure rate
- **`hard_quarantine`**: Hard quarantine, tests are skipped and not run

### Quarantine Strategy Types

```typescript
type QuarantineStrategyType = 'skip' | 'retry_only' | 'soft' | 'hard' | 'graduated';
```

- **`skip`**: Skip directly
- **`retry_only`**: Retry only
- **`soft`**: Soft quarantine
- **`hard`**: Hard quarantine
- **`graduated`**: Graduated quarantine, progressively escalates based on failure severity

---

## 4. TraceConfig - Trace Configuration

`TraceConfig` controls Playwright Trace collection behavior.

```typescript
interface TraceConfig {
  enabled: boolean;
  mode: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  screenshots: boolean;
  snapshots: boolean;
  sources: boolean;
  attachments: boolean;
  outputDir?: string;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | Whether to enable Trace collection |
| `mode` | `'off' \| 'on' \| 'retain-on-failure' \| 'on-first-retry'` | `'on-first-retry'` | Trace collection mode |
| `screenshots` | `boolean` | `true` | Whether to record screenshots in Trace |
| `snapshots` | `boolean` | `true` | Whether to record DOM snapshots in Trace |
| `sources` | `boolean` | `true` | Whether to record source code information in Trace |
| `attachments` | `boolean` | `true` | Whether to record attachments in Trace |
| `outputDir` | `string` | - | Trace file output directory |

### Mode Description

| Mode | Description |
|------|------|
| `off` | Do not collect Trace |
| `on` | Collect Trace on every run |
| `retain-on-failure` | Only retain Trace on test failure |
| `on-first-retry` | Only collect Trace on first retry |

---

## 5. ArtifactConfig - Artifact Configuration

`ArtifactConfig` controls test artifact (screenshots, videos, downloads) collection behavior.

```typescript
interface ArtifactConfig {
  enabled: boolean;
  screenshots: 'off' | 'on' | 'only-on-failure';
  videos: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  downloads?: boolean;
  outputDir?: string;
  maxFileSize?: number;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | Whether to enable artifact collection |
| `screenshots` | `'off' \| 'on' \| 'only-on-failure'` | `'only-on-failure'` | Screenshot collection mode |
| `videos` | `'off' \| 'on' \| 'retain-on-failure' \| 'on-first-retry'` | `'retain-on-failure'` | Video collection mode |
| `downloads` | `boolean` | - | Whether to collect downloaded files |
| `outputDir` | `string` | - | Artifact output directory |
| `maxFileSize` | `number` | - | Maximum size of a single artifact file (bytes) |

### Screenshots Mode Description

| Mode | Description |
|------|------|
| `off` | Do not collect screenshots |
| `on` | Collect screenshots every time |
| `only-on-failure` | Only collect screenshots on test failure |

### Videos Mode Description

| Mode | Description |
|------|------|
| `off` | Do not record videos |
| `on` | Record videos every time |
| `retain-on-failure` | Only retain videos on test failure |
| `on-first-retry` | Only record videos on first retry |

---

## 6. VisualTestingConfig - Visual Testing Configuration

`VisualTestingConfig` controls visual regression testing (screenshot comparison) behavior.

```typescript
interface VisualTestingConfig {
  enabled: boolean;
  threshold: number;
  maxDiffPixelRatio: number;
  maxDiffPixels: number;
  updateSnapshots: boolean;
  compareWith?: string;
  outputDir?: string;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | Whether to enable visual testing |
| `threshold` | `number` | `0.2` | Pixel comparison threshold (0~1), single pixel color difference above this value is considered different |
| `maxDiffPixelRatio` | `number` | `0.01` | Maximum diff pixel ratio (0~1), diff pixels exceeding this proportion of total pixels is considered a mismatch |
| `maxDiffPixels` | `number` | `10` | Maximum diff pixel count (integer, minimum 0), diff pixels exceeding this count is considered a mismatch |
| `updateSnapshots` | `boolean` | `false` | Whether to update baseline snapshots |
| `compareWith` | `string` | - | Specify the baseline version or path for comparison |
| `outputDir` | `string` | - | Snapshot output directory, defaults to `{outputDir}/snapshots` |

### Visual Test Status

```typescript
type VisualTestStatus = 'identical' | 'different' | 'new' | 'missing' | 'regression';
```

| Status | Description |
|------|------|
| `identical` | Exactly matches the baseline |
| `different` | Has differences from the baseline |
| `new` | New snapshot, no baseline for comparison |
| `missing` | Baseline snapshot is missing |
| `regression` | Visual regression detected |

---

## 7. AnnotationConfig - Annotation Configuration

`AnnotationConfig` controls the recognition and handling of test annotations (such as `@skip`, `@fixme`, etc.).

```typescript
interface AnnotationConfig {
  enabled: boolean;
  respectSkip: boolean;
  respectOnly: boolean;
  respectFail: boolean;
  respectSlow: boolean;
  respectFixme: boolean;
  customAnnotations: Record<string, { action: 'skip' | 'fail' | 'slow' | 'mark' }>;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | Whether to enable annotation scanning |
| `respectSkip` | `boolean` | `true` | Whether to recognize `skip` annotation |
| `respectOnly` | `boolean` | `true` | Whether to recognize `only` annotation |
| `respectFail` | `boolean` | `true` | Whether to recognize `fail` annotation |
| `respectSlow` | `boolean` | `false` | Whether to recognize `slow` annotation |
| `respectFixme` | `boolean` | `true` | Whether to recognize `fixme` annotation |
| `customAnnotations` | `Record<string, { action: 'skip' \| 'fail' \| 'slow' \| 'mark' }>` | `{}` | Custom annotation mapping, key is annotation name, value is corresponding action |

### Built-in Annotation Types

```typescript
type AnnotationType = 'skip' | 'only' | 'fail' | 'slow' | 'fixme' | 'todo' | 'serial' | 'parallel';
```

### Custom Annotation Example

```typescript
annotations: {
  enabled: true,
  customAnnotations: {
    'flaky': { action: 'slow' },
    'unstable': { action: 'skip' },
    'known-issue': { action: 'mark' },
  },
}
```

---

## 8. TagConfig - Tag Configuration

`TagConfig` controls tag-based test filtering behavior.

```typescript
interface TagConfig {
  enabled: boolean;
  include?: string[];
  exclude?: string[];
  require?: string[];
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | Whether to enable tag filtering |
| `include` | `string[]` | - | Include tag list, only run tests containing these tags |
| `exclude` | `string[]` | - | Exclude tag list, exclude tests containing these tags |
| `require` | `string[]` | - | Required tag list, tests must contain all specified tags to run |

### Tag Filtering Logic

1. If `include` is set, only run tests containing at least one `include` tag
2. If `exclude` is set, exclude tests containing any `exclude` tag
3. If `require` is set, tests must contain all `require` tags to run
4. When all three conditions are active, the intersection is taken

---

## 9. QuarantineConfig - Quarantine Configuration

`QuarantineConfig` is the top-level quarantine configuration for the Flaky test manager, controlling the quarantine feature switch and advanced capabilities.

```typescript
interface QuarantineConfig {
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
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `true` | Whether to enable quarantine functionality |
| `threshold` | `number` | `0.3` | Quarantine trigger threshold (0~1), failure rate above this value triggers quarantine |
| `autoQuarantine` | `boolean` | `false` | Whether to automatically quarantine Flaky tests |
| `minimumRuns` | `number` | - | Minimum number of runs, overrides value in FlakyCriteriaConfig |
| `autoReleaseAfterPasses` | `number` | - | Consecutive passes for auto-release, overrides value in FlakyCriteriaConfig |
| `quarantineExpiryDays` | `number` | - | Quarantine expiry days, overrides value in QuarantineCriteriaConfig |
| `decayRate` | `number` | - | Time decay rate, overrides value in FlakyCriteriaConfig |
| `confidenceLevel` | `number` | - | Wilson confidence level, overrides value in FlakyCriteriaConfig |
| `brokenThreshold` | `number` | - | Broken threshold, overrides `brokenConsecutiveThreshold` in FlakyCriteriaConfig |
| `regressionWindow` | `number` | - | Regression detection window, overrides value in FlakyCriteriaConfig |
| `enableRootCauseAnalysis` | `boolean` | - | Whether to enable root cause analysis |
| `enableCorrelationAnalysis` | `boolean` | - | Whether to enable correlation analysis |
| `enableTrendTracking` | `boolean` | - | Whether to enable trend tracking |
| `enablePrediction` | `boolean` | - | Whether to enable failure prediction |
| `enableCausalGraph` | `boolean` | - | Whether to enable causal graph building |
| `quarantineStrategy` | `QuarantineStrategyType` | - | Quarantine strategy type, see [Quarantine Strategy Types](#quarantine-strategy-types) |
| `maxQuarantineRatio` | `number` | - | Maximum quarantine budget ratio, overrides value in QuarantineCriteriaConfig |
| `predictionSensitivity` | `number` | - | Prediction sensitivity (default `0.5`) |

---

## 10. LLMConfig - LLM Configuration

`LLMConfig` controls the LLM connection parameters for the AI diagnostic service, used for automatic analysis of test failure causes.

```typescript
interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  remark: string;
  maxTokens: number;
  temperature: number;
  maxAgentRounds: number;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | Whether to enable AI diagnostics |
| `apiKey` | `string` | `''` | LLM API key |
| `baseUrl` | `string` | `'http://localhost:11434'` | LLM API base URL (defaults to local Ollama) |
| `model` | `string` | `''` | Model name to use |
| `remark` | `string` | `''` | Configuration remark information |
| `maxTokens` | `number` | `4096` | Maximum number of tokens to generate |
| `temperature` | `number` | `0.3` | Generation temperature parameter (0~1), lower is more deterministic |
| `maxAgentRounds` | `number` | `5` | Maximum agent loop rounds |

### AI Diagnostic Modes

```typescript
type AnalysisMode = 'agent' | 'single' | 'fallback';
```

| Mode | Description |
|------|------|
| `agent` | Agent mode, multi-turn tool calls, deep analysis |
| `single` | Single call mode, quick diagnosis |
| `fallback` | Fallback mode, recovery plan after Agent failure |

### AI Diagnostic Tools

Agent mode supports the following tool calls (maximum 5 rounds):

| Tool Name | Description |
|--------|------|
| `read_source_file` | Read source code file |
| `search_codebase` | Search codebase |
| `query_test_history` | Query test history |
| `read_screenshot` | Read failure screenshot |

---

## 11. AgentConfig - Agent Configuration

AI Agent system configuration for test planning, generation, and healing.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `enabled` | `boolean` | No | `true` | Enable or disable the Agent system |
| `loopTarget` | `'vscode' \| 'claude' \| 'opencode'` | No | `'vscode'` | Target environment for agent definitions |
| `specsDir` | `string` | No | `'specs'` | Directory for storing test plans |
| `seedTest` | `string` | No | - | Reference seed test file path |
| `autoHeal` | `boolean` | No | `false` | Automatically apply generated patches |
| `maxHealRounds` | `number` | No | `3` | Maximum number of healing rounds |
| `projectRoot` | `string` | No | `process.cwd()` | Project root directory |
| `projectContext` | `ProjectContext` | No | - | Auto-loaded project context (see below) |

**ProjectContext** (auto-loaded, not user-configurable):

| Field | Type | Description |
|-------|------|-------------|
| `projectRoot` | `string` | Project root directory |
| `baseURL` | `string` | Parsed from playwright.config |
| `testDir` | `string` | Parsed from playwright.config |
| `timeout` | `number` | Parsed from playwright.config |
| `useViewport` | `{ width: number; height: number }` | Parsed from playwright.config |
| `fixtures` | `string` | Auto-discovered test fixtures path |
| `technology` | `string` | Detected tech stack (e.g., "React, Vite") |
| `packageJson` | `object` | Package name and dependencies |

---

## 12. DashboardConfig - Dashboard Configuration

Dashboard configuration controls the startup parameters for the Web visualization panel. This configuration is specified through `YuanTestConfigFile.dashboard` or CLI arguments.

```typescript
interface DashboardConfig {
  port: number;
  outputDir: string;
  dataDir: string;
}
```

### Parameter Description

| Parameter | Type | Default | Description |
|--------|------|--------|------|
| `port` | `number` | `3000` | Dashboard service listening port |
| `outputDir` | `string` | `'./test-reports'` | Report output directory |
| `dataDir` | `string` | `'./test-data'` | Data storage directory |

> **Note**: The CLI `ui` command default port is `5274` (`--port` option default value), but `dashboard.port` in the configuration file defaults to `3000`. CLI arguments take precedence over configuration file.

### CLI Arguments

```bash
yuantest ui -p, --port <number>   # Port number, default 5274
yuantest ui -o, --output <path>   # Report directory
yuantest ui -d, --data <path>     # Data directory
```

---

## 13. Default Constants Table

The following constants are defined in `src/constants/index.ts` and are the source of default configurations for all system modules.

### DEFAULTS - Basic Default Values

| Constant | Value | Description |
|--------|-----|------|
| `TEST_TIMEOUT` | `30000` | Test timeout (milliseconds) |
| `TEST_RETRIES` | `0` | Default retry count |
| `WORKERS` | `1` | Default worker count |
| `SHARDS` | `1` | Default shard count |
| `BROWSERS` | `['chromium']` | Default browser list |
| `PROJECT_NAME` | `'test-project'` | Default project name |
| `OUTPUT_DIR` | `'./test-output'` | Default output directory |
| `TEST_DIR` | `'./'` | Default test directory |
| `DATA_DIR` | `'./test-data'` | Default data directory |
| `REPORTS_DIR` | `'./test-reports'` | Default reports directory |

### FLAKY_CONFIG - Flaky Detection Constants

| Constant | Value | Description |
|--------|-----|------|
| `DEFAULT_THRESHOLD` | `0.3` | Flaky default threshold |
| `MONITOR_THRESHOLD` | `0.1` | Monitor default threshold |
| `HIGH_THRESHOLD` | `0.5` | High risk default threshold |
| `MAX_HISTORY_ENTRIES` | `50` | Maximum history entries |
| `MINIMUM_RUNS_FOR_QUARANTINE` | `5` | Minimum runs for quarantine |
| `AUTO_RELEASE_AFTER_PASSES` | `3` | Soft quarantine auto-release consecutive passes |
| `AUTO_RELEASE_HARD_QUARANTINE_PASSES` | `5` | Hard quarantine auto-release consecutive passes |
| `QUARANTINE_EXPIRY_DAYS` | `30` | Quarantine expiry days |
| `QUARANTINE_EXPIRY_DOWNGRADE` | `true` | Whether to downgrade after quarantine expiry |
| `DECAY_RATE` | `0.1` | Time decay rate |
| `CONFIDENCE_LEVEL` | `0.95` | Wilson confidence level |
| `BROKEN_CONSECUTIVE_THRESHOLD` | `5` | Consecutive failure threshold for Broken |
| `REGRESSION_WINDOW` | `5` | Regression detection window |
| `CORRELATION_CO_OCCURRENCE_THRESHOLD` | `0.6` | Correlation analysis co-occurrence threshold |
| `CORRELATION_MIN_RUNS` | `3` | Correlation analysis minimum runs |
| `TREND_AGGREGATION_WINDOW_DAYS` | `7` | Trend aggregation window (days) |
| `TREND_MIN_DATA_POINTS` | `5` | Trend analysis minimum data points |
| `TREND_CHANGE_POINT_THRESHOLD` | `0.3` | Change point detection threshold |
| `TREND_SEASONAL_MIN_CYCLES` | `3` | Seasonality analysis minimum cycles |
| `PREDICTION_WINDOW_RUNS` | `10` | Prediction window runs |
| `PREDICTION_DURATION_ANOMALY_ZSCORE` | `2.0` | Execution duration anomaly Z-Score threshold |
| `PREDICTION_MIN_HISTORY` | `8` | Prediction minimum history records |
| `PREDICTION_SENSITIVITY` | `0.5` | Prediction sensitivity |
| `QUARANTINE_MAX_RATIO` | `0.2` | Maximum quarantine budget ratio |
| `QUARANTINE_SOFT_THRESHOLD` | `0.15` | Soft quarantine threshold |
| `QUARANTINE_HARD_THRESHOLD` | `0.4` | Hard quarantine threshold |
| `QUARANTINE_RETRY_MAX` | `3` | Maximum quarantine retries |
| `QUARANTINE_RETRY_DELAY_MS` | `1000` | Quarantine retry delay (milliseconds) |
| `QUARANTINE_RETRY_BACKOFF` | `2` | Quarantine retry backoff multiplier |
| `CAUSAL_MIN_CORRELATION` | `0.4` | Causal graph minimum correlation |
| `CAUSAL_MAX_DEPTH` | `5` | Causal graph maximum depth |

#### HEALTH_SCORE_WEIGHTS - Health Score Weights

| Dimension | Weight | Description |
|------|------|------|
| `stability` | `0.35` | Stability weight |
| `trend` | `0.25` | Trend weight |
| `recoverability` | `0.20` | Recoverability weight |
| `predictability` | `0.20` | Predictability weight |

### CACHE_CONFIG - Cache Configuration Constants

| Constant | Value | Description |
|--------|-----|------|
| `MAX_REPORT_CACHE_SIZE` | `50` | Maximum report cache entries |
| `MAX_COMPLETED_RUNS` | `10` | Maximum completed runs to retain |
| `TEST_DISCOVERY_TTL` | `300000` | Test discovery cache TTL (milliseconds, 5 minutes) |
| `SAVE_DELAY_MS` | `1000` | Save delay (milliseconds) |
| `FLUSH_INTERVAL_MS` | `500` | Flush interval (milliseconds) |
| `MAX_QUEUE_SIZE` | `500` | Maximum write queue size |

### WEBSOCKET_CONFIG - WebSocket Configuration Constants

| Constant | Value | Description |
|--------|-----|------|
| `RECONNECT_BASE_DELAY` | `1000` | Reconnect base delay (milliseconds) |
| `RECONNECT_MAX_DELAY` | `30000` | Reconnect maximum delay (milliseconds) |
| `MAX_RECONNECT_ATTEMPTS` | `10` | Maximum reconnect attempts |

### FILE_PATTERNS - File Pattern Constants

#### TEST_EXTENSIONS - Test File Extensions

```
['.spec.ts', '.spec.tsx', '.test.ts', '.test.tsx']
```

#### CONFIG_NAMES - Playwright Config File Names

```
['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts', 'playwright.config.mjs']
```

#### IGNORE_DIRS - Ignore Directories

```
['node_modules', '__snapshots__', '__image_snapshots__', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.svelte-kit']
```

### DEFAULT_FLAKY_CRITERIA - Default Flaky Criteria Parameters

| Parameter | Value |
|--------|-----|
| `minimumRuns` | `5` |
| `flakyThreshold` | `0.3` |
| `monitorThreshold` | `0.1` |
| `stableThreshold` | `0.05` |
| `highThreshold` | `0.5` |
| `brokenConsecutiveThreshold` | `5` |
| `regressionWindow` | `5` |
| `regressionRecentFailRate` | `0.6` |
| `regressionOlderFailRate` | `0.2` |
| `decayRate` | `0.1` |
| `confidenceLevel` | `0.95` |
| `autoReleaseAfterPasses` | `3` |

### DEFAULT_QUARANTINE_CRITERIA - Default Quarantine Criteria Parameters

| Parameter | Value |
|--------|-----|
| `softThreshold` | `0.15` |
| `hardThreshold` | `0.4` |
| `maxQuarantineRatio` | `0.2` |
| `autoReleaseHardQuarantinePasses` | `5` |
| `quarantineExpiryDays` | `30` |
| `quarantineExpiryDowngrade` | `true` |
| `retryMax` | `3` |
| `retryDelayMs` | `1000` |
| `retryBackoff` | `2` |

---

## 14. Configuration Methods

YuanTest supports four configuration methods, in order of priority from highest to lowest:

### 14.1 Command Line Arguments

Command line arguments have the highest priority and override all other configuration sources.

#### `run` Command

```bash
yuantest run [testFiles...] [options]
```

| Option | Short | Type | Default | Description |
|------|------|------|--------|------|
| `--config` | `-c` | `string` | - | Configuration file path |
| `--project` | `-p` | `string` | - | Project name |
| `--test-dir` | `-t` | `string` | - | Test directory |
| `--output` | `-o` | `string` | - | Output directory |
| `--shards` | `-s` | `number` | `1` | Number of shards |
| `--workers` | `-w` | `number` | `1` | Number of workers |
| `--browsers` | `-b` | `string` | `'chromium'` | Browser list (comma-separated) |
| `--base-url` | - | `string` | - | Test base URL |
| `--timeout` | - | `number` | `30000` | Timeout (milliseconds) |
| `--retries` | - | `number` | `0` | Number of retries |
| `--trace` | - | `string` | `'on-first-retry'` | Trace mode |
| `--screenshot` | - | `string` | `'only-on-failure'` | Screenshot mode |
| `--video` | - | `string` | `'retain-on-failure'` | Video mode |
| `--tags` | - | `string` | - | Run tests with specified tags (comma-separated) |
| `--grep` | - | `string` | - | Grep filter pattern |
| `--project-filter` | - | `string` | - | Run specified browser project |
| `--update-snapshots` | - | `boolean` | `false` | Update visual test snapshots |
| `--visual-threshold` | - | `number` | `0.2` | Visual difference threshold |
| `--annotations` | - | `boolean` | `false` | Enable annotation scanning |
| `--html-report` | - | `boolean` | `true` | Generate HTML report |

#### `ui` Command

```bash
yuantest ui [options]
```

| Option | Short | Type | Default | Description |
|------|------|------|--------|------|
| `--port` | `-p` | `number` | `5274` | Dashboard port |
| `--output` | `-o` | `string` | - | Report directory |
| `--data` | `-d` | `string` | - | Data directory |

### 14.2 Configuration File

YuanTest searches for configuration files from the current directory upward in the following order:

1. `yuantest.config.ts`
2. `yuantest.config.js`
3. `yuantest.config.json`
4. `.yuantrc`
5. `.yuantrc.json`
6. `.yuantrc.js`

#### Configuration File Interface

```typescript
interface YuanTestConfigFile {
  version?: string;
  testDir?: string;
  outputDir?: string;
  baseURL?: string;
  retries?: number;
  timeout?: number;
  workers?: number;
  shards?: number;
  browsers?: BrowserType[];
  reporters?: string[];
  headers?: Record<string, string>;
  flakyThreshold?: number;
  isolateFlaky?: boolean;
  traces?: {
    enabled?: boolean;
    mode?: TraceConfig['mode'];
  };
  artifacts?: {
    enabled?: boolean;
    screenshots?: ArtifactConfig['screenshots'];
    videos?: ArtifactConfig['videos'];
  };
  visualTesting?: {
    enabled?: boolean;
    threshold?: number;
    maxDiffPixels?: number;
    updateSnapshots?: boolean;
  };
  annotations?: {
    enabled?: boolean;
    respectSkip?: boolean;
    respectOnly?: boolean;
    respectFail?: boolean;
    respectSlow?: boolean;
    respectFixme?: boolean;
  };
  tags?: {
    enabled?: boolean;
    include?: string[];
    exclude?: string[];
  };
  htmlReport?: boolean;
  dashboard?: {
    port?: number;
    outputDir?: string;
    dataDir?: string;
  };
  customErrorPatterns?: Array<{
    id: string;
    category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
    name: string;
    description: string;
    regex: string[];
    rootCauseTemplate: { zh: string; en: string };
    suggestionsTemplate: { zh: string[]; en: string[] };
    docLinks?: { title: string; url: string }[];
  }>;
}
```

#### Configuration File Example

```typescript
// yuantest.config.ts
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './test-output',
  baseURL: 'http://localhost:3000',
  retries: 2,
  timeout: 60000,
  workers: 4,
  shards: 2,
  browsers: ['chromium', 'firefox'],
  flakyThreshold: 0.3,
  isolateFlaky: true,
  traces: {
    enabled: true,
    mode: 'on-first-retry',
  },
  artifacts: {
    enabled: true,
    screenshots: 'only-on-failure',
    videos: 'retain-on-failure',
  },
  visualTesting: {
    enabled: true,
    threshold: 0.2,
    maxDiffPixels: 10,
    updateSnapshots: false,
  },
  annotations: {
    enabled: true,
    respectSkip: true,
    respectFixme: true,
  },
  tags: {
    enabled: true,
    include: ['smoke', 'regression'],
    exclude: ['slow'],
  },
  htmlReport: true,
  dashboard: {
    port: 3000,
    outputDir: './test-reports',
    dataDir: './test-data',
  },
});
```

### 14.3 user-preferences.json

The user preferences file is stored in `{dataDir}/user-preferences.json` and is automatically maintained by the Dashboard UI, used to persist runtime-modified configurations.

#### Stored Content

| Field | Type | Description |
|------|------|------|
| `lang` | `'zh' \| 'en'` | Interface language |
| `lastVersion` | `string` | Last used version number |
| `testDir` | `string` | Last used test directory |
| `autoQuarantine` | `boolean` | Whether to auto-quarantine |
| `flakyCriteria` | `Partial<FlakyCriteriaConfig>` | Flaky criteria parameter overrides |
| `quarantineCriteria` | `Partial<QuarantineCriteriaConfig>` | Quarantine criteria parameter overrides |
| `customErrorPatterns` | `ErrorPattern[]` | Custom error patterns |

#### Priority

User preferences file has lower priority than command line arguments and configuration files. Dashboard reads this file on startup to restore previous settings.

### 14.4 Dashboard UI

The Dashboard Web interface allows real-time modification of the following configurations:

- **Test Directory**: Set via `/api/v1/testdir` endpoint
- **Preferences**: Modify Flaky criteria parameters and quarantine criteria parameters via `/api/v1/preferences` endpoint
- **Auto Quarantine**: Toggle auto-quarantine feature via preferences
- **Custom Error Patterns**: Add/edit/delete error patterns via diagnostic management interface

Dashboard modifications are automatically saved to `user-preferences.json` and restored on next startup.

### 14.5 Configuration Merge Order

The final effective configuration is merged in the following order (later overrides earlier):

1. Code default values (`DEFAULTS`, `FLAKY_CONFIG` constants, etc.)
2. Configuration file (`yuantest.config.ts`, etc.)
3. User preferences (`user-preferences.json`)
4. Command line arguments

```
Default Values → Config File → User Preferences → CLI Arguments
      (low) ────────────────────────────────────────────→ (high)
```

### 14.6 Configuration Validation

All configurations are validated through Zod Schema on load. Validation rules include:

- `version`: Non-empty string
- `testDir`: Non-empty string
- `timeout`: Positive integer
- `retries`: Non-negative integer
- `workers`: Positive integer
- `shards`: Positive integer
- `flakyThreshold`: Number between 0~1
- `baseURL`: Valid URL format
- `browsers`: `'chromium'` | `'firefox'` | `'webkit'` enum values

Invalid configurations will throw validation errors on load.
