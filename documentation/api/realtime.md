# RealtimeReporter API Reference

RealtimeReporter provides WebSocket-based real-time communication for test run events, including run lifecycle, test results, flaky detection, and report updates. It extends `EventEmitter` and manages WebSocket connections, progress tracking, and batch result broadcasting.

---

## RealtimeReporter

### Constructor

```typescript
new RealtimeReporter()
```

Creates a new RealtimeReporter instance. The WebSocket server is not started until `initialize()` is called.

### Example

```typescript
import { RealtimeReporter } from 'yuantest-playwright';

const reporter = new RealtimeReporter();
```

---

### Instance Methods

#### `initialize(server: Server): void`

Initialize the WebSocket server by attaching to an existing HTTP server. Listens for upgrade requests on the `/ws` path. If already initialized, the previous instance is shut down first. New clients receive current running progress upon connection.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `server` | `Server` | HTTP server instance to attach the WebSocket server to |

```typescript
import { createServer } from 'http';

const server = createServer();
reporter.initialize(server);
server.listen(3001);
```

---

#### `broadcastRunStarted(runId: string, version: string, totalTests?: number): void`

Broadcast a `run_started` event to all connected clients. Initializes the internal progress tracking for the run.

**Parameters:**

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `runId` | `string` | | Unique run identifier |
| `version` | `string` | | Version of the test run |
| `totalTests` | `number` | `0` | Total number of tests expected in this run |

```typescript
reporter.broadcastRunStarted('run-001', '1.0.0', 50);
```

---

#### `broadcastRunProgress(runId: string, progress: Partial<RunProgress>): void`

Broadcast a `run_progress` event with updated progress data. Merges the provided partial progress into the current tracked progress for the run. Only broadcasts if the run exists in the progress map.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `progress` | `Partial<RunProgress>` | Partial progress data to merge into current state |

```typescript
reporter.broadcastRunProgress('run-001', {
  progress: 60.5,
  currentTest: 'Login Function Test',
  estimatedTimeRemaining: 5000,
});
```

---

#### `broadcastTestResult(runId: string, result: TestResult): void`

Broadcast a single test result. Results are batched internally and flushed either when the batch reaches 50 items or after a 200ms interval, whichever comes first. Progress counters (passed, failed, skipped) are updated automatically. If a test with the same ID already exists in the current batch, its counters are adjusted.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `result` | `TestResult` | Single test result to broadcast |

```typescript
reporter.broadcastTestResult('run-001', {
  id: 'test-id-1',
  title: 'Login Function Test',
  status: 'passed',
  duration: 1234,
  retries: 0,
  timestamp: Date.now(),
  browser: 'chromium',
});
```

---

#### `broadcastTestResultBatch(runId: string, results: TestResult[]): void`

Broadcast a batch of test results immediately without internal batching. Progress counters are updated for all results in the batch. If the results array is empty, the method returns immediately.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `results` | `TestResult[]` | Array of test results to broadcast |

```typescript
reporter.broadcastTestResultBatch('run-001', [
  { id: 'test-1', title: 'Test A', status: 'passed', duration: 100, retries: 0, timestamp: Date.now(), browser: 'chromium' },
  { id: 'test-2', title: 'Test B', status: 'failed', duration: 200, retries: 0, timestamp: Date.now(), browser: 'chromium' },
]);
```

---

#### `broadcastSuiteCompleted(runId: string, suiteName: string): void`

Broadcast a `suite_completed` event when a test suite finishes execution.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `suiteName` | `string` | Name of the completed suite |

```typescript
reporter.broadcastSuiteCompleted('run-001', 'Login Module');
```

---

#### `broadcastRunCompleted(runId: string, result: RunResult): void`

Broadcast a `run_completed` event when a test run finishes. Marks the internal progress as completed (status: `'completed'`, progress: `100`), and adds the run ID to the completed runs list for cleanup.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `result` | `RunResult` | Complete run result data |

```typescript
reporter.broadcastRunCompleted('run-001', {
  id: 'run-001',
  version: '1.0.0',
  status: 'success',
  startTime: 1715673600000,
  duration: 12345,
  suites: [],
  totalTests: 50,
  passed: 45,
  failed: 3,
  skipped: 2,
  flakyTests: [],
});
```

---

#### `broadcastFlakyDetected(runId: string, test: TestResult, extra?: { weightedFailureRate?: number; classification?: string; rootCause?: string }): void`

Broadcast a `flaky_detected` event when a flaky test is detected. Includes test identification, failure rate, classification, and optional root cause information.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `test` | `TestResult` | The flaky test result |
| `extra` | `object` | Optional additional flaky analysis data |
| `extra.weightedFailureRate` | `number` | Weighted failure rate (defaults to `0.5`) |
| `extra.classification` | `string` | Flaky classification (defaults to `'flaky'`) |
| `extra.rootCause` | `string` | Root cause description |

```typescript
reporter.broadcastFlakyDetected('run-001', testResult, {
  weightedFailureRate: 0.65,
  classification: 'timing',
  rootCause: 'race_condition',
});
```

---

#### `broadcastError(runId: string, error: string): void`

Broadcast an `error` event when a run error occurs.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `error` | `string` | Error message |

```typescript
reporter.broadcastError('run-001', 'Execution failed: process exited with code 1');
```

---

#### `broadcastLog(runId: string, message: string, logType?: string): void`

Broadcast a `log` event with a log message. Supports differentiating between log types such as `stdout`, `stderr`, and `info`.

**Parameters:**

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `runId` | `string` | | Unique run identifier |
| `message` | `string` | | Log message content |
| `logType` | `string` | `'info'` | Log type (`'stdout'`, `'stderr'`, `'info'`) |

```typescript
reporter.broadcastLog('run-001', 'Running test: Login Function Test', 'info');
reporter.broadcastLog('run-001', 'Warning: slow network detected', 'stderr');
```

---

#### `broadcastReportCreated(report: RunResult): void`

Broadcast a `report_created` event when a new test report is generated.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `report` | `RunResult` | The created report data. The `runId` is derived from `report.id` |

```typescript
reporter.broadcastReportCreated(runResult);
```

---

#### `broadcastReportUpdated(runId: string, updates: { totalTests?: number; passed?: number; failed?: number; skipped?: number; status?: 'running' | 'completed' | 'failed' | 'cancelled'; testResult?: TestResult }): void`

Broadcast a `report_updated` event when a test report is updated with new data.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |
| `updates` | `object` | Partial report update data |
| `updates.totalTests` | `number` | Updated total test count |
| `updates.passed` | `number` | Updated passed count |
| `updates.failed` | `number` | Updated failed count |
| `updates.skipped` | `number` | Updated skipped count |
| `updates.status` | `string` | Updated run status |
| `updates.testResult` | `TestResult` | Individual test result to include |

```typescript
reporter.broadcastReportUpdated('run-001', {
  totalTests: 50,
  passed: 45,
  failed: 3,
  skipped: 2,
  status: 'completed',
});
```

---

#### `broadcastQuarantineUpdated(testId: string, action: string, details?: Record<string, unknown>): void`

Broadcast a `quarantine_updated` event when quarantine status changes for a test.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test identifier |
| `action` | `string` | Quarantine action (e.g. `'quarantined'`, `'released'`, `'validated_released'`) |
| `details` | `Record<string, unknown>` | Optional additional details about the quarantine change |

```typescript
reporter.broadcastQuarantineUpdated('test-id-1', 'quarantined', { reason: 'High failure rate' });
```

---

#### `getProgress(runId: string): RunProgress | undefined`

Get the current progress data for a specific run.

**Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Unique run identifier |

**Returns:** `RunProgress | undefined` — The progress data, or `undefined` if the run is not tracked.

```typescript
const progress = reporter.getProgress('run-001');
if (progress) {
  console.log(`Progress: ${progress.progress}%, Passed: ${progress.passed}`);
}
```

---

#### `getAllProgress(): RunProgress[]`

Get progress data for all tracked runs, both running and completed.

**Returns:** `RunProgress[]` — Array of all run progress entries.

```typescript
const allProgress = reporter.getAllProgress();
allProgress.forEach((p) => {
  console.log(`${p.runId}: ${p.status} (${p.progress}%)`);
});
```

---

#### `getConnectedClients(): number`

Get the current number of connected WebSocket clients.

**Returns:** `number` — Number of active WebSocket connections.

```typescript
const clientCount = reporter.getConnectedClients();
console.log(`${clientCount} clients connected`);
```

---

#### `shutdown(): void`

Shut down the WebSocket server and clean up all resources. Closes the WebSocket server, removes HTTP server listeners, and clears all client connections and progress data.

```typescript
reporter.shutdown();
```

---

## RealtimeReporterClient

Client for connecting to a RealtimeReporter WebSocket server. Extends `EventEmitter` and provides automatic reconnection with exponential backoff and jitter.

### Constructor

```typescript
new RealtimeReporterClient(url?: string)
```

**Parameters:**

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `url` | `string` | `'ws://localhost:3001'` | WebSocket server URL |

### Example

```typescript
import { RealtimeReporterClient } from 'yuantest-playwright';

const client = new RealtimeReporterClient('ws://localhost:5274/ws');
```

---

### Instance Methods

#### `connect(): Promise<void>`

Connect to the WebSocket server. Resolves when the connection is established. Emits a `'connected'` event on success. On connection close, automatically attempts reconnection with exponential backoff.

**Returns:** `Promise<void>`

```typescript
await client.connect();
```

---

#### `disconnect(): void`

Disconnect from the WebSocket server and disable automatic reconnection. Sets the reconnect attempt counter to the maximum to prevent further reconnection attempts.

```typescript
client.disconnect();
```

---

#### `isConnected(): boolean`

Check whether the client is currently connected to the WebSocket server.

**Returns:** `boolean` — `true` if connected, `false` otherwise.

```typescript
if (client.isConnected()) {
  console.log('Client is connected');
}
```

---

### Events

The `RealtimeReporterClient` extends `EventEmitter` and emits the following events:

#### `'connected'`

Emitted when the WebSocket connection is established.

```typescript
client.on('connected', (payload) => {
  console.log('Connected:', payload.message);
});
```

#### `'disconnected'`

Emitted when the WebSocket connection is closed.

```typescript
client.on('disconnected', () => {
  console.log('Disconnected from server');
});
```

#### `'message'`

Emitted for every incoming message with the full `RealTimeMessage` object.

```typescript
client.on('message', (message) => {
  console.log('Received:', message.type, message.payload);
});
```

#### Server Event Types

All server event types are emitted as separate events using the message `type` field. The payload is passed as the event argument.

| Event | Payload Type | Description |
|------|------|------|
| `'connected'` | `{ message: string }` | Connection established |
| `'run_started'` | `{ runId: string; version: string; startTime: number }` | Run started |
| `'run_progress'` | `RunProgress` | Run progress updated |
| `'run_completed'` | `RunResult` | Run completed |
| `'test_result'` | `TestResult & { currentProgress: RunProgress }` | Single test result |
| `'test_result_batch'` | `{ results: TestResult[]; currentProgress?: RunProgress }` | Batch test results |
| `'suite_completed'` | `{ suiteName: string; timestamp: number }` | Suite completed |
| `'error'` | `{ error: string }` | Run error |
| `'flaky_detected'` | `{ testId: string; title: string; failureRate: number; weightedFailureRate: number; classification: FlakyClassification; rootCause?: RootCauseType; timestamp: number }` | Flaky test detected |
| `'quarantine_updated'` | `Record<string, unknown>` | Quarantine status changed |
| `'log'` | `{ message: string; timestamp: number; logType?: string }` | Log message |
| `'report_created'` | `RunResult` | Report created |
| `'report_updated'` | `{ runId: string; totalTests?: number; passed?: number; failed?: number; skipped?: number; status?: string; testResult?: TestResult }` | Report updated |

```typescript
client.on('run_started', (payload) => {
  console.log(`Run started: ${payload.runId}`);
});

client.on('test_result_batch', (payload) => {
  console.log(`Batch results: ${payload.results.length} tests`);
});

client.on('flaky_detected', (payload) => {
  console.log(`Flaky: ${payload.title}, classification: ${payload.classification}`);
});
```

---

### Reconnection Behavior

The client automatically reconnects on disconnection with the following configuration:

| Setting | Value | Description |
|------|------|------|
| `MAX_RECONNECT_ATTEMPTS` | `10` | Maximum number of reconnection attempts |
| `RECONNECT_BASE_DELAY` | `1000` | Base delay in milliseconds before first reconnect |
| `RECONNECT_MAX_DELAY` | `30000` | Maximum delay cap in milliseconds |

The delay uses exponential backoff with random jitter: `baseDelay * 2^attempt` with 50-100% randomization, capped at `RECONNECT_MAX_DELAY`.

---

## Type Definitions

```typescript
interface RunProgress {
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

interface SuiteResult {
  name: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestResult[];
}

interface FlakyTest {
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
}

type FlakyClassification =
  | 'flaky'
  | 'broken'
  | 'regression'
  | 'monitor'
  | 'stable'
  | 'insufficient_data';

type RootCauseType =
  | 'timing'
  | 'data_race'
  | 'environment'
  | 'external_service'
  | 'test_order'
  | 'resource_leak'
  | 'assertion_flaky'
  | 'unknown';

type RealTimeMessage =
  | { type: 'connected'; payload: { message: string }; timestamp: number; runId: string }
  | { type: 'run_started'; payload: { runId: string; version: string; startTime: number }; timestamp: number; runId: string }
  | { type: 'run_progress'; payload: RunProgress; timestamp: number; runId: string }
  | { type: 'run_completed'; payload: RunResult; timestamp: number; runId: string }
  | { type: 'test_result'; payload: TestResult & { currentProgress: RunProgress }; timestamp: number; runId: string }
  | { type: 'test_result_batch'; payload: { results: TestResult[]; currentProgress?: RunProgress }; timestamp: number; runId: string }
  | { type: 'suite_completed'; payload: { suiteName: string; timestamp: number }; timestamp: number; runId: string }
  | { type: 'error'; payload: { error: string }; timestamp: number; runId: string }
  | { type: 'flaky_detected'; payload: { testId: string; title: string; failureRate: number; weightedFailureRate: number; classification: FlakyClassification; rootCause?: RootCauseType; timestamp: number }; timestamp: number; runId: string }
  | { type: 'quarantine_updated'; payload: Record<string, unknown>; timestamp: number; runId: string }
  | { type: 'log'; payload: { message: string; timestamp: number; logType?: string }; timestamp: number; runId: string }
  | { type: 'report_created'; payload: RunResult; timestamp: number; runId: string }
  | { type: 'report_updated'; payload: { runId: string; totalTests?: number; passed?: number; failed?: number; skipped?: number; status?: 'running' | 'completed' | 'failed' | 'cancelled'; testResult?: TestResult }; timestamp: number; runId: string };
```
