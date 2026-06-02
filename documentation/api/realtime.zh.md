# RealtimeReporter API 参考

RealtimeReporter 提供基于 WebSocket 的实时通信能力，用于测试运行事件推送，包括运行生命周期、测试结果、不稳定测试检测和报告更新。它继承自 `EventEmitter`，管理 WebSocket 连接、进度跟踪和批量结果广播。

---

## RealtimeReporter

### 构造函数

```typescript
new RealtimeReporter()
```

创建一个新的 RealtimeReporter 实例。WebSocket 服务器在调用 `initialize()` 之前不会启动。

### 示例

```typescript
import { RealtimeReporter } from 'yuantest-playwright';

const reporter = new RealtimeReporter();
```

---

### 实例方法

#### `initialize(server: Server): void`

初始化 WebSocket 服务器，挂载到已有的 HTTP 服务器上。监听 `/ws` 路径的升级请求。如果已经初始化，会先关闭之前的实例。新客户端连接时会收到当前正在运行的进度数据。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `server` | `Server` | 要挂载 WebSocket 服务器的 HTTP 服务器实例 |

```typescript
import { createServer } from 'http';

const server = createServer();
reporter.initialize(server);
server.listen(3001);
```

---

#### `broadcastRunStarted(runId: string, version: string, totalTests?: number): void`

向所有已连接的客户端广播 `run_started` 事件。初始化该运行的内部进度跟踪。

**参数：**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `runId` | `string` | | 唯一运行标识符 |
| `version` | `string` | | 测试运行版本号 |
| `totalTests` | `number` | `0` | 本次运行预期的测试总数 |

```typescript
reporter.broadcastRunStarted('run-001', '1.0.0', 50);
```

---

#### `broadcastRunProgress(runId: string, progress: Partial<RunProgress>): void`

广播带有更新进度数据的 `run_progress` 事件。将提供的部分进度数据合并到当前跟踪的进度中。仅当运行存在于进度映射中时才广播。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `progress` | `Partial<RunProgress>` | 要合并到当前状态的部分进度数据 |

```typescript
reporter.broadcastRunProgress('run-001', {
  progress: 60.5,
  currentTest: '登录功能测试',
  estimatedTimeRemaining: 5000,
});
```

---

#### `broadcastTestResult(runId: string, result: TestResult): void`

广播单个测试结果。结果在内部进行批量聚合，当批次达到 50 条或间隔 200ms 时刷新广播。进度计数器（passed、failed、skipped）会自动更新。如果当前批次中已存在相同 ID 的测试，会调整其计数器。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `result` | `TestResult` | 要广播的单个测试结果 |

```typescript
reporter.broadcastTestResult('run-001', {
  id: 'test-id-1',
  title: '登录功能测试',
  status: 'passed',
  duration: 1234,
  retries: 0,
  timestamp: Date.now(),
  browser: 'chromium',
});
```

---

#### `broadcastTestResultBatch(runId: string, results: TestResult[]): void`

立即广播一批测试结果，不经过内部批量聚合。所有结果的进度计数器会自动更新。如果结果数组为空，方法直接返回。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `results` | `TestResult[]` | 要广播的测试结果数组 |

```typescript
reporter.broadcastTestResultBatch('run-001', [
  { id: 'test-1', title: '测试 A', status: 'passed', duration: 100, retries: 0, timestamp: Date.now(), browser: 'chromium' },
  { id: 'test-2', title: '测试 B', status: 'failed', duration: 200, retries: 0, timestamp: Date.now(), browser: 'chromium' },
]);
```

---

#### `broadcastSuiteCompleted(runId: string, suiteName: string): void`

当测试套件执行完成时广播 `suite_completed` 事件。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `suiteName` | `string` | 已完成的套件名称 |

```typescript
reporter.broadcastSuiteCompleted('run-001', '登录模块');
```

---

#### `broadcastRunCompleted(runId: string, result: RunResult): void`

当测试运行完成时广播 `run_completed` 事件。将内部进度标记为已完成（status: `'completed'`，progress: `100`），并将运行 ID 添加到已完成列表中以便清理。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `result` | `RunResult` | 完整的运行结果数据 |

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

当检测到不稳定测试时广播 `flaky_detected` 事件。包含测试标识、失败率、分类和可选的根因信息。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `test` | `TestResult` | 不稳定测试的结果 |
| `extra` | `object` | 可选的额外不稳定分析数据 |
| `extra.weightedFailureRate` | `number` | 加权失败率（默认 `0.5`） |
| `extra.classification` | `string` | 不稳定分类（默认 `'flaky'`） |
| `extra.rootCause` | `string` | 根因描述 |

```typescript
reporter.broadcastFlakyDetected('run-001', testResult, {
  weightedFailureRate: 0.65,
  classification: 'timing',
  rootCause: 'race_condition',
});
```

---

#### `broadcastError(runId: string, error: string): void`

当运行发生错误时广播 `error` 事件。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `error` | `string` | 错误消息 |

```typescript
reporter.broadcastError('run-001', '执行失败：进程退出码为 1');
```

---

#### `broadcastLog(runId: string, message: string, logType?: string): void`

广播带有日志消息的 `log` 事件。支持区分 `stdout`、`stderr` 和 `info` 等日志类型。

**参数：**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `runId` | `string` | | 唯一运行标识符 |
| `message` | `string` | | 日志消息内容 |
| `logType` | `string` | `'info'` | 日志类型（`'stdout'`、`'stderr'`、`'info'`） |

```typescript
reporter.broadcastLog('run-001', '正在运行测试：登录功能测试', 'info');
reporter.broadcastLog('run-001', '警告：检测到网络延迟', 'stderr');
```

---

#### `broadcastReportCreated(report: RunResult): void`

当生成新的测试报告时广播 `report_created` 事件。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `report` | `RunResult` | 创建的报告数据。`runId` 从 `report.id` 获取 |

```typescript
reporter.broadcastReportCreated(runResult);
```

---

#### `broadcastReportUpdated(runId: string, updates: { totalTests?: number; passed?: number; failed?: number; skipped?: number; status?: 'running' | 'completed' | 'failed' | 'cancelled'; testResult?: TestResult }): void`

当测试报告更新时广播 `report_updated` 事件。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |
| `updates` | `object` | 部分报告更新数据 |
| `updates.totalTests` | `number` | 更新的测试总数 |
| `updates.passed` | `number` | 更新的通过数 |
| `updates.failed` | `number` | 更新的失败数 |
| `updates.skipped` | `number` | 更新的跳过数 |
| `updates.status` | `string` | 更新的运行状态 |
| `updates.testResult` | `TestResult` | 包含的单个测试结果 |

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

当测试的隔离状态发生变化时广播 `quarantine_updated` 事件。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `testId` | `string` | 测试标识符 |
| `action` | `string` | 隔离操作（如 `'quarantined'`、`'released'`、`'validated_released'`） |
| `details` | `Record<string, unknown>` | 可选的隔离变更额外详情 |

```typescript
reporter.broadcastQuarantineUpdated('test-id-1', 'quarantined', { reason: '高失败率' });
```

---

#### `getProgress(runId: string): RunProgress | undefined`

获取指定运行的当前进度数据。

**参数：**

| 参数 | 类型 | 描述 |
|------|------|------|
| `runId` | `string` | 唯一运行标识符 |

**返回值：** `RunProgress | undefined` — 进度数据，如果运行未被跟踪则返回 `undefined`。

```typescript
const progress = reporter.getProgress('run-001');
if (progress) {
  console.log(`进度：${progress.progress}%，通过：${progress.passed}`);
}
```

---

#### `getAllProgress(): RunProgress[]`

获取所有已跟踪运行的进度数据，包括运行中和已完成的。

**返回值：** `RunProgress[]` — 所有运行进度条目的数组。

```typescript
const allProgress = reporter.getAllProgress();
allProgress.forEach((p) => {
  console.log(`${p.runId}: ${p.status} (${p.progress}%)`);
});
```

---

#### `getConnectedClients(): number`

获取当前已连接的 WebSocket 客户端数量。

**返回值：** `number` — 活跃的 WebSocket 连接数。

```typescript
const clientCount = reporter.getConnectedClients();
console.log(`${clientCount} 个客户端已连接`);
```

---

#### `shutdown(): void`

关闭 WebSocket 服务器并清理所有资源。关闭 WebSocket 服务器、移除 HTTP 服务器监听器，并清空所有客户端连接和进度数据。

```typescript
reporter.shutdown();
```

---

## RealtimeReporterClient

用于连接到 RealtimeReporter WebSocket 服务器的客户端。继承自 `EventEmitter`，提供带有指数退避和随机抖动的自动重连机制。

### 构造函数

```typescript
new RealtimeReporterClient(url?: string)
```

**参数：**

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `url` | `string` | `'ws://localhost:3001'` | WebSocket 服务器地址 |

### 示例

```typescript
import { RealtimeReporterClient } from 'yuantest-playwright';

const client = new RealtimeReporterClient('ws://localhost:5274/ws');
```

---

### 实例方法

#### `connect(): Promise<void>`

连接到 WebSocket 服务器。连接建立后 Promise 解析。成功时触发 `'connected'` 事件。连接关闭时自动尝试使用指数退避策略重连。

**返回值：** `Promise<void>`

```typescript
await client.connect();
```

---

#### `disconnect(): void`

断开与 WebSocket 服务器的连接并禁用自动重连。将重连尝试计数器设置为最大值以阻止后续重连尝试。

```typescript
client.disconnect();
```

---

#### `isConnected(): boolean`

检查客户端当前是否已连接到 WebSocket 服务器。

**返回值：** `boolean` — 已连接返回 `true`，否则返回 `false`。

```typescript
if (client.isConnected()) {
  console.log('客户端已连接');
}
```

---

### 事件

`RealtimeReporterClient` 继承自 `EventEmitter`，触发以下事件：

#### `'connected'`

WebSocket 连接建立时触发。

```typescript
client.on('connected', (payload) => {
  console.log('已连接：', payload.message);
});
```

#### `'disconnected'`

WebSocket 连接关闭时触发。

```typescript
client.on('disconnected', () => {
  console.log('已断开与服务器的连接');
});
```

#### `'message'`

每条传入消息都会触发，携带完整的 `RealTimeMessage` 对象。

```typescript
client.on('message', (message) => {
  console.log('收到：', message.type, message.payload);
});
```

#### 服务端事件类型

所有服务端事件类型使用消息的 `type` 字段作为独立事件触发。payload 作为事件参数传递。

| 事件 | Payload 类型 | 描述 |
|------|------|------|
| `'connected'` | `{ message: string }` | 连接已建立 |
| `'run_started'` | `{ runId: string; version: string; startTime: number }` | 运行已开始 |
| `'run_progress'` | `RunProgress` | 运行进度已更新 |
| `'run_completed'` | `RunResult` | 运行已完成 |
| `'test_result'` | `TestResult & { currentProgress: RunProgress }` | 单个测试结果 |
| `'test_result_batch'` | `{ results: TestResult[]; currentProgress?: RunProgress }` | 批量测试结果 |
| `'suite_completed'` | `{ suiteName: string; timestamp: number }` | 套件已完成 |
| `'error'` | `{ error: string }` | 运行错误 |
| `'flaky_detected'` | `{ testId: string; title: string; failureRate: number; weightedFailureRate: number; classification: FlakyClassification; rootCause?: RootCauseType; timestamp: number }` | 检测到不稳定测试 |
| `'quarantine_updated'` | `Record<string, unknown>` | 隔离状态已变更 |
| `'log'` | `{ message: string; timestamp: number; logType?: string }` | 日志消息 |
| `'report_created'` | `RunResult` | 报告已创建 |
| `'report_updated'` | `{ runId: string; totalTests?: number; passed?: number; failed?: number; skipped?: number; status?: string; testResult?: TestResult }` | 报告已更新 |

```typescript
client.on('run_started', (payload) => {
  console.log(`运行已开始：${payload.runId}`);
});

client.on('test_result_batch', (payload) => {
  console.log(`批量结果：${payload.results.length} 个测试`);
});

client.on('flaky_detected', (payload) => {
  console.log(`不稳定测试：${payload.title}，分类：${payload.classification}`);
});
```

---

### 重连行为

客户端在断开连接时自动重连，配置如下：

| 配置项 | 值 | 描述 |
|------|------|------|
| `MAX_RECONNECT_ATTEMPTS` | `10` | 最大重连尝试次数 |
| `RECONNECT_BASE_DELAY` | `1000` | 首次重连的基础延迟（毫秒） |
| `RECONNECT_MAX_DELAY` | `30000` | 最大延迟上限（毫秒） |

延迟使用带随机抖动的指数退避算法：`baseDelay * 2^attempt`，附加 50-100% 的随机化，上限为 `RECONNECT_MAX_DELAY`。

---

## 类型定义

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
