# Executor API

The Executor is responsible for test execution, running tests through the Playwright CLI. It inherits from `EventEmitter` and supports event listening.

## Executor Class

### Constructor

```typescript
constructor(config: TestConfig, storage?: StorageProvider, flakyManager?: FlakyTestManager)
```

Creates an Executor instance. The constructor merges default values for `config`:

| Field | Default Value |
|-------|---------------|
| `retries` | `0` |
| `timeout` | `30000` |
| `workers` | `1` |
| `shards` | `1` |
| `browsers` | `['chromium']` |
| `htmlReport` | `true` |

During construction, the following managers are automatically initialized based on configuration (only created when the corresponding configuration has `enabled` set to true):

- `TraceManager` — Trace management
- `AnnotationManager` — Annotation management
- `TagManager` — Tag management
- `ArtifactManager` — Artifact management
- `VisualTestingManager` — Visual testing management

### execute(options?)

Executes the test run.

```typescript
async execute(options?: {
  shardIndex?: number;
  shardTotal?: number;
  grepPattern?: string;
  tagFilter?: string[];
  updateSnapshots?: boolean;
  projectFilter?: string;
  testFiles?: string[];
  testLocations?: string[];
  parentRunId?: string;
}): Promise<RunResult>
```

#### Parameter Description

| Parameter | Type | Description |
|-----------|------|-------------|
| `shardIndex` | `number` | Shard index (0-based) |
| `shardTotal` | `number` | Total number of shards |
| `grepPattern` | `string` | Regex pattern to match test titles |
| `tagFilter` | `string[]` | List of tag filters |
| `updateSnapshots` | `boolean` | Whether to update snapshots |
| `projectFilter` | `string` | Playwright project filter |
| `testFiles` | `string[]` | Specified list of test files |
| `testLocations` | `string[]` | Specified list of test locations |
| `parentRunId` | `string` | Parent run ID, used for rerun scenarios |

#### Execution Flow

1. Check if already running, throw `PlaywrightRunnerError` (`ALREADY_RUNNING`) if currently running
2. Generate run ID (format: `run_YYYYMMDD_HHmmss_random_string`)
3. Initialize `RunResult` object
4. Filter quarantined tests
5. Prepare run environment (create output directory, initialize managers, scan annotations and tags)
6. Execute tests via Playwright CLI
7. Post-processing (move HTML report, discover trace files, discover artifacts, run visual tests)
8. Return `RunResult`

If an exception occurs during execution, `RunResult.status` will be set to `'failed'`. Regardless of success or failure, `endTime` and `duration` will be set, and the `run_completed` event will be triggered.

### cancel()

Cancels the currently running test.

```typescript
async cancel(): Promise<void>
```

Cancellation behavior:

- On Windows, uses `taskkill /F /T /PID` to terminate the process tree
- On Unix, sends `SIGTERM` first, then sends `SIGKILL` after 3 seconds if the process is still running
- Sets `RunResult.status` to `'cancelled'`
- Triggers `run_cancelled` event

### Other Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `getCurrentStatus()` | `Promise<RunResult \| null>` | Get current run result |
| `isCurrentlyRunning()` | `boolean` | Check if currently executing |
| `getConfig()` | `TestConfig` | Get a copy of the configuration |
| `getTestArtifacts(runId)` | `Promise<{ screenshots, videos, traces }>` | Get test artifacts for a specific run |
| `getTraceManager()` | `TraceManager \| null` | Get the trace manager |
| `getAnnotationManager()` | `AnnotationManager \| null` | Get the annotation manager |
| `getTagManager()` | `TagManager \| null` | Get the tag manager |
| `getArtifactManager()` | `ArtifactManager \| null` | Get the artifact manager |
| `getVisualManager()` | `VisualTestingManager \| null` | Get the visual testing manager |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `currentRun` | `RunResult \| null` | Current run result (read-only getter) |

## Events

The Executor inherits from `EventEmitter` and supports the following events:

| Event | Parameter | Description |
|-------|-----------|-------------|
| `run_started` | `{ runId: string, timestamp: number }` | Run started |
| `test_result` | `TestResult` | Individual test result |
| `run_progress` | `RunProgress` | Run progress update |
| `run_completed` | `RunResult` | Run completed |
| `run_cancelled` | `RunResult \| null` | Run was cancelled |
| `output` | `{ data: string, timestamp: number, runId: string, type?: string }` | Output data (stdout/stderr/info) |
| `error` | `{ error: string, runId: string }` | Error event |
| `annotations_scanned` | `{ runId: string, summary }` | Annotation scan completed |
| `tags_scanned` | `{ runId: string, summary }` | Tag scan completed |

## ParallelExecutor Class

A parallel executor that creates multiple Executor instances to run tests in shards.

### Constructor

```typescript
constructor(config: TestConfig, shardCount: number, storage?: StorageProvider)
```

Creates `shardCount` Executor instances, each shard using an independent output directory (`outputDir/shard-{i}`).

### Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `execute()` | `Promise<RunResult[]>` | Execute all shards in parallel |
| `cancelAll()` | `Promise<void>` | Cancel all shard executions |

## Type Definitions

### TestConfig

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
}
```

### BrowserType

```typescript
type BrowserType = 'chromium' | 'firefox' | 'webkit';
```

### TestResult

```typescript
interface TestResult {
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
```

### RunResult

```typescript
interface RunResult {
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
```

### SuiteResult

```typescript
interface SuiteResult {
  name: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
  timestamp: number;
}
```

### TestRunHistory

```typescript
interface TestRunHistory {
  timestamp: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
  stackTrace?: string;
  logs?: string[];
}
```

### RunMetadata

```typescript
interface RunMetadata {
  annotations?: RunMetadataAnnotation[];
  tags?: RunMetadataTag[];
  traces?: RunMetadataTraces;
  artifacts?: RunMetadataArtifacts;
  visualTesting?: RunMetadataVisualTesting;
  skippedQuarantinedTests?: string[];
  globalErrors?: RunMetadataGlobalError[];
  [key: string]: unknown;
}
```

### RunMetadataAnnotation

```typescript
interface RunMetadataAnnotation {
  type: string;
  testName: string;
  file: string;
}
```

### RunMetadataTag

```typescript
interface RunMetadataTag {
  name: string;
  count: number;
}
```

### RunMetadataTraces

```typescript
interface RunMetadataTraces {
  total: number;
  files: RunMetadataTraceFile[];
}
```

### RunMetadataTraceFile

```typescript
interface RunMetadataTraceFile {
  testId: string;
  testName: string;
  size: number;
}
```

### RunMetadataArtifacts

```typescript
interface RunMetadataArtifacts {
  total: number;
  byType: Record<string, number>;
}
```

### RunMetadataVisualTesting

```typescript
interface RunMetadataVisualTesting {
  passRate: number;
  identical: number;
  different: number;
  regression: number;
  new: number;
  results: RunMetadataVisualResult[];
}
```

### RunMetadataVisualResult

```typescript
interface RunMetadataVisualResult {
  testId: string;
  status: string;
  diffPixelRatio: number;
}
```

### RunMetadataGlobalError

```typescript
interface RunMetadataGlobalError {
  message: string;
  stack: string;
  timestamp: number;
}
```

## Examples

### Basic Usage

```typescript
import { Executor } from 'yuantest-playwright';

const executor = new Executor({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './reports',
});

const result = await executor.execute();
console.log(`Passed: ${result.passed}/${result.totalTests}`);
```

### Listening to Events

```typescript
executor.on('run_started', (data) => {
  console.log(`Run started: ${data.runId}`);
});

executor.on('test_result', (result) => {
  const icon = result.status === 'passed' ? '✓' : '✗';
  console.log(`${icon} ${result.title} (${result.duration}ms)`);
});

executor.on('run_progress', (progress) => {
  console.log(`Progress: ${progress.passed}/${progress.totalTests}`);
});

executor.on('run_completed', (result) => {
  console.log('Run completed!');
  console.log(`Passed: ${result.passed}`);
  console.log(`Failed: ${result.failed}`);
  console.log(`Skipped: ${result.skipped}`);
});

executor.on('output', (data) => {
  process.stdout.write(data.data);
});
```

### Using Filter Options

```typescript
const result = await executor.execute({
  grepPattern: 'smoke',
  projectFilter: 'chromium',
  tagFilter: ['@critical'],
  updateSnapshots: false,
  testFiles: ['tests/login.spec.ts'],
});
```

### Sharded Execution

```typescript
const result = await executor.execute({
  shardIndex: 0,
  shardTotal: 4,
});
```

### Canceling Execution

```typescript
setTimeout(async () => {
  if (executor.isCurrentlyRunning()) {
    await executor.cancel();
    console.log('Execution cancelled');
  }
}, 60000);
```

### Parallel Execution

```typescript
import { ParallelExecutor } from 'yuantest-playwright';

const parallelExecutor = new ParallelExecutor(config, 4);
const results = await parallelExecutor.execute();
const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
console.log(`Total passed: ${totalPassed}`);
```
