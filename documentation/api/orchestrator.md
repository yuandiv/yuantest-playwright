# Orchestrator API

The Orchestrator is responsible for test orchestration, including test discovery, shard assignment, load balancing, and historical execution time analysis. It inherits from `ManagedManager` (based on `EventEmitter`), supporting asynchronous initialization and automatic persistence.

---

## Orchestrator Class

```typescript
import { Orchestrator } from 'yuantest-playwright';
```

### Constructor

```typescript
new Orchestrator(config: TestConfig, storage?: StorageProvider)
```

| Parameter | Type | Required | Default | Description |
|------|------|------|--------|------|
| `config` | `TestConfig` | Yes | - | Test configuration object |
| `storage` | `StorageProvider` | No | `getStorage()` | Storage provider for reading and writing persistent data |

The constructor internally fills missing optional fields in `config` using the `DEFAULTS` constant:

| Field | Default Value |
|------|--------|
| `retries` | `0` |
| `timeout` | `30000` |
| `workers` | `1` |
| `shards` | `1` |
| `browsers` | `['chromium']` |

It also sets the save delay to `CACHE_CONFIG.SAVE_DELAY_MS` (1000ms).

---

### Methods

#### `initialize(): Promise<void>`

Initializes the orchestrator. Calls the parent class `BaseManager.initialize()` to complete basic initialization (loading historical execution time data) and validates required configuration items.

- If `config.version` is not set, throws `PlaywrightRunnerError('Version is required', ErrorCode.INVALID_CONFIG)`
- If `config.testDir` is not set, throws `PlaywrightRunnerError('Test directory is required', ErrorCode.INVALID_CONFIG)`

```typescript
await orchestrator.initialize();
```

#### `orchestrate(): Promise<OrchestrationConfig>`

Performs basic test orchestration (distributed strategy). The process is as follows:

1. Calls `discoverTests()` to discover test files
2. Calls `distributeTests()` to evenly distribute tests across shards (round-robin method)
3. Returns `OrchestrationConfig` with `strategy` set to `'distributed'`

```typescript
const config = await orchestrator.orchestrate();
```

#### `optimizeSharding(): Promise<OrchestrationConfig>`

Performs intelligent shard orchestration (intelligent strategy). The process is as follows:

1. Calls `discoverTests()` to discover test files
2. Calls `estimateTestDurationDetailed()` for each test file to get enhanced time estimates
3. Uses `ShardOptimizer` for variance-aware load balancing optimization
4. Returns `OrchestrationConfig` with `strategy` set to `'intelligent'`

```typescript
const config = await orchestrator.optimizeSharding();
```

#### `getAssignmentsForShard(shardId: number): TestAssignment[]`

Gets the test assignment list for a specified shard.

| Parameter | Type | Description |
|------|------|------|
| `shardId` | `number` | Shard ID |

```typescript
const shardTests = orchestrator.getAssignmentsForShard(0);
```

#### `updateDurationHistory(testFile: string, duration: number): void`

Updates the historical execution time for a single test file. Uses the Welford online algorithm to calculate variance, EMA for time decay, while maintaining percentiles and extreme values. Automatically schedules persistence save after update.

| Parameter | Type | Description |
|------|------|------|
| `testFile` | `string` | Test file path |
| `duration` | `number` | Execution duration in milliseconds |

```typescript
orchestrator.updateDurationHistory('login.spec.ts', 1520);
```

#### `recordRunResults(results: Array<{ testId: string; duration: number }>): void`

Batch records test run results, calling `updateDurationHistory()` for each result.

| Parameter | Type | Description |
|------|------|------|
| `results` | `Array<{ testId: string; duration: number }>` | List of test results |

```typescript
orchestrator.recordRunResults([
  { testId: 'login.spec.ts', duration: 1520 },
  { testId: 'cart.spec.ts', duration: 3200 },
]);
```

#### `recordShardFeedback(feedback: ShardPredictionFeedback): void`

Records shard prediction feedback and performs automatic calibration. Compares the predicted total duration with the actual total duration for each shard, using a learning rate to adjust the calibration factor. Only the most recent 20 feedback entries are retained, with calibration factor range `[0.5, 2.0]`.

| Parameter | Type | Description |
|------|------|------|
| `feedback` | `ShardPredictionFeedback` | Shard prediction feedback |

```typescript
orchestrator.recordShardFeedback({
  shardId: 0,
  predictedDuration: 10000,
  actualDuration: 12000,
  timestamp: Date.now(),
});
```

#### `getCalibrationFactor(): number`

Gets the current calibration factor.

```typescript
const factor = orchestrator.getCalibrationFactor();
```

#### `getPredictionFeedback(): ShardPredictionFeedback[]`

Gets a copy of all prediction feedback records.

```typescript
const feedbacks = orchestrator.getPredictionFeedback();
```

#### `validateConfig(): Promise<boolean>`

Validates whether the configuration is complete. Requires `version`, `testDir`, and `outputDir` to all be set.

```typescript
const valid = await orchestrator.validateConfig();
```

#### `getConfig(): TestConfig`

Gets a shallow copy of the current configuration.

```typescript
const config = orchestrator.getConfig();
```

#### `createPlaywrightConfig(): Promise<any>`

Generates a Playwright configuration object based on the current configuration.

```typescript
const pwConfig = await orchestrator.createPlaywrightConfig();
```

Generated configuration structure:

```typescript
{
  testDir: string;
  timeout: number;
  retries: number;
  workers: number;
  use: {
    baseURL: string | undefined;
    trace: 'on-first-retry';
    screenshot: 'only-on-failure';
    video: 'retain-on-failure';
  };
  projects: Array<{ name: string; use: { browserName: string } }>;
  reporter: string[] | [['list']];
}
```

#### `flush(): Promise<void>`

Immediately persists pending historical data to disk. Clears all delayed save timers and executes the save directly.

```typescript
await orchestrator.flush();
```

---

## Type Definitions

### OrchestrationConfig

Orchestration configuration, describing shard assignment results.

```typescript
interface OrchestrationConfig {
  /** Total number of shards */
  totalShards: number;
  /** Current shard index (default is 0) */
  shardIndex: number;
  /** Test assignment list */
  testAssignment: TestAssignment[];
  /** Orchestration strategy */
  strategy: 'distributed' | 'weighted' | 'intelligent';
  /** List of flaky test IDs (optional) */
  flakyTests?: string[];
  /** List of quarantined test IDs (optional) */
  quarantinedTests?: string[];
}
```

### TestAssignment

Test assignment information, describing the mapping between a single test and a shard.

```typescript
interface TestAssignment {
  /** Test file identifier (relative path) */
  testId: string;
  /** Assigned shard ID */
  shardId: number;
  /** Priority (default is 1) */
  priority: number;
  /** Estimated execution time (milliseconds) */
  estimatedDuration?: number;
  /** Estimation confidence (0~1, higher is more reliable) */
  durationConfidence?: number;
  /** Execution time variance (milliseconds²) */
  durationVariance?: number;
  /** Estimation source */
  estimationSource?: 'history' | 'ema' | 'similar' | 'default';
}
```

**estimationSource explanation:**

| Source | Description |
|------|------|
| `'history'` | Based on simple historical average (when run count < 3) |
| `'ema'` | Based on exponential moving average (when run count ≥ 3, highest confidence) |
| `'similar'` | Inferred from similar tests (tests with historical data in the same directory) |
| `'default'` | Uses default timeout as estimate (no historical data available) |

### TestConfig

Test configuration, required parameter for the Orchestrator constructor.

```typescript
interface TestConfig {
  /** Version identifier (required) */
  version: string;
  /** Test directory (required) */
  testDir: string;
  /** Output directory (required) */
  outputDir: string;
  /** Base URL */
  baseURL?: string;
  /** Number of retries, default 0 */
  retries?: number;
  /** Timeout (ms), default 30000 */
  timeout?: number;
  /** Number of workers, default 1 */
  workers?: number;
  /** Number of shards, default 1 */
  shards?: number;
  /** Reporter list */
  reporters?: string[];
  /** Browser list, default ['chromium'] */
  browsers?: BrowserType[];
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Flaky test threshold */
  flakyThreshold?: number;
  /** Whether to isolate flaky tests */
  isolateFlaky?: boolean;
  /** Test file match patterns */
  testMatch?: string[];
  /** Test file ignore patterns */
  testIgnore?: string[];
  /** Ignored directories */
  ignoreDirs?: string[];
  // ... other optional configurations
}

type BrowserType = 'chromium' | 'firefox' | 'webkit';
```

### ShardPredictionFeedback

Shard prediction feedback, used for calibrating time estimates.

```typescript
interface ShardPredictionFeedback {
  /** Shard ID */
  shardId: number;
  /** Predicted duration (milliseconds) */
  predictedDuration: number;
  /** Actual duration (milliseconds) */
  actualDuration: number;
  /** Feedback timestamp */
  timestamp: number;
}
```

---

## Orchestration Strategy Explanation

### distributed (Even Distribution)

- **Usage**: Call `orchestrate()`
- **Algorithm**: Round-robin assignment, distributing test files sequentially across shards
- **Characteristics**: Simple and fast, does not depend on historical data; each test still calculates time estimates, but they do not affect assignment decisions
- **Use Cases**: First run, no historical data, test cases have similar execution times

### weighted (Weighted Distribution)

- **Current Status**: Reserved in type definitions, not yet implemented as an independent strategy in code
- **Design Intent**: Weighted assignment based on historical execution times to balance total duration across shards

### intelligent (Intelligent Sharding)

- **Usage**: Call `optimizeSharding()`
- **Algorithm**: Variance-aware load balancing based on `ShardOptimizer`, with core features including:
  1. **Risk-aware Load Calculation**: Shard load = Σ(estimatedDuration) + riskPenalty × Σ(√variance), explicitly modeling uncertainty
  2. **Multi-objective Optimization**: Primary objective is minimizing maximum shard load (makespan), secondary objective is minimizing variance risk difference between shards
  3. **Confidence Weighting**: Tests with low confidence have higher uncertainty in estimated time, receiving larger risk penalties during assignment
  4. **Two-phase Assignment**:
     - Phase 1: High-risk tests are assigned first, selecting the shard with minimum cumulative variance (risk dispersion)
     - Phase 2: Stable tests are assigned using LPT (Longest Processing Time first) to the shard with lowest effective load
  5. **Pairwise Swap Rebalancing**: After assignment, attempts to reduce inter-shard load differences by swapping tests
- **Use Cases**: Has historical execution data, test cases have large execution time differences, requires precise load balancing

---

## ShardOptimizer Class

Variance-aware intelligent shard optimizer, used internally by `Orchestrator.optimizeSharding()`.

```typescript
import { ShardOptimizer } from 'yuantest-playwright';
```

### Constructor

```typescript
new ShardOptimizer(durationHistory?: Map<string, TestDurationHistory>, calibrationFactor?: number)
```

| Parameter | Type | Required | Default | Description |
|------|------|------|--------|------|
| `durationHistory` | `Map<string, TestDurationHistory>` | No | `new Map()` | Historical execution time data |
| `calibrationFactor` | `number` | No | `1.0` | Calibration factor |

### Methods

#### `optimize(assignments: TestAssignment[], totalShards: number): Promise<Map<number, TestAssignment[]>>`

Performs variance-aware shard optimization, returning a mapping from shard ID to test assignment list.

| Parameter | Type | Description |
|------|------|------|
| `assignments` | `TestAssignment[]` | Test assignment list (must include estimatedDuration, durationConfidence, durationVariance) |
| `totalShards` | `number` | Total number of shards |

#### `getShardLoads(): number[]`

Gets the load for each shard after the most recent optimization (milliseconds).

---

## Time Estimation Algorithm

The Orchestrator uses enhanced time estimation (`estimateTestDurationDetailed`), with the following decision logic:

1. **No historical data** (`runCount === 0`):
   - Attempts to infer from similar tests (≥2 tests with sufficient history in the same directory)
   - Inference successful: Uses median, confidence `0.3`, source `'similar'`
   - Inference failed: Uses `DEFAULTS.TEST_TIMEOUT`, confidence `0.1`, source `'default'`

2. **Insufficient historical data** (`runCount < 3`):
   - Blends historical average with similar inference (weighted by run count)
   - Confidence calculated based on coefficient of variation and run count, max `0.5`
   - Source `'history'`

3. **Sufficient historical data** (`runCount ≥ 3`):
   - Uses EMA (exponential moving average, α = 0.3)
   - Confidence calculated based on coefficient of variation and run count, max `1.0`
   - Source `'ema'`

All estimates are multiplied by the calibration factor (`calibrationFactor`), which is automatically adjusted through `recordShardFeedback()`.

### Key Constants

| Constant | Value | Description |
|------|----|------|
| `EMA_ALPHA` | `0.3` | EMA smoothing coefficient |
| `MIN_RUNS_FOR_CONFIDENCE` | `3` | Minimum run count required for high confidence |
| `HIGH_VARIANCE_THRESHOLD` | `0.4` | Threshold for identifying high-risk tests |
| `CALIBRATION_LEARNING_RATE` | `0.2` | Calibration factor learning rate |
| `MAX_CALIBRATION_FACTOR` | `2.0` | Calibration factor upper limit |
| `MIN_CALIBRATION_FACTOR` | `0.5` | Calibration factor lower limit |

---

## Usage Examples

### Basic Orchestration (distributed strategy)

```typescript
import { Orchestrator } from 'yuantest-playwright';

const orchestrator = new Orchestrator({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './test-output',
  shards: 4,
  browsers: ['chromium', 'firefox'],
});

await orchestrator.initialize();
const config = await orchestrator.orchestrate();

console.log(`Total shards: ${config.totalShards}`);
console.log(`Orchestration strategy: ${config.strategy}`);
console.log(`Test assignment count: ${config.testAssignment.length}`);
```

### Intelligent Sharding (intelligent strategy)

```typescript
import { Orchestrator } from 'yuantest-playwright';

const orchestrator = new Orchestrator({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './test-output',
  shards: 4,
});

await orchestrator.initialize();
const config = await orchestrator.optimizeSharding();

console.log(`Orchestration strategy: ${config.strategy}`);
config.testAssignment.forEach((assignment) => {
  console.log(
    `Test: ${assignment.testId}, ` +
    `Shard: ${assignment.shardId}, ` +
    `Estimated duration: ${assignment.estimatedDuration}ms, ` +
    `Confidence: ${assignment.durationConfidence}, ` +
    `Source: ${assignment.estimationSource}`
  );
});
```

### Get Tests for a Specific Shard

```typescript
const shard0Tests = orchestrator.getAssignmentsForShard(0);
console.log(`Shard 0 contains ${shard0Tests.length} tests`);
```

### Record Run Results and Feedback Calibration

```typescript
// Record test run results
orchestrator.recordRunResults([
  { testId: 'login.spec.ts', duration: 1520 },
  { testId: 'cart.spec.ts', duration: 3200 },
  { testId: 'checkout.spec.ts', duration: 5800 },
]);

// Record shard prediction feedback, triggers automatic calibration
orchestrator.recordShardFeedback({
  shardId: 0,
  predictedDuration: 10000,
  actualDuration: 12000,
  timestamp: Date.now(),
});

// View current calibration factor
console.log(`Calibration factor: ${orchestrator.getCalibrationFactor()}`);
```

### Generate Playwright Configuration

```typescript
const pwConfig = await orchestrator.createPlaywrightConfig();
// pwConfig can be used directly with Playwright Test Runner
```

### Manually Update Historical Data for a Single Test

```typescript
orchestrator.updateDurationHistory('login.spec.ts', 1520);
```

### Ensure Data Persistence Before Program Exit

```typescript
await orchestrator.flush();
```
