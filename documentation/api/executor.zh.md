# Executor API

Executor 负责测试执行，通过 Playwright CLI 运行测试。继承自 `EventEmitter`，支持事件监听。

## Executor 类

### 构造函数

```typescript
constructor(config: TestConfig, storage?: StorageProvider, flakyManager?: FlakyTestManager)
```

创建 Executor 实例。构造函数会对 `config` 进行默认值合并：

| 字段 | 默认值 |
|------|--------|
| `retries` | `0` |
| `timeout` | `30000` |
| `workers` | `1` |
| `shards` | `1` |
| `browsers` | `['chromium']` |
| `htmlReport` | `true` |

构造时会根据配置自动初始化以下管理器（仅在对应配置 `enabled` 时创建）：

- `TraceManager` — 追踪管理
- `AnnotationManager` — 注解管理
- `TagManager` — 标签管理
- `ArtifactManager` — 产物管理
- `VisualTestingManager` — 视觉测试管理

### execute(options?)

执行测试运行。

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

#### 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `shardIndex` | `number` | 分片索引（从 0 开始） |
| `shardTotal` | `number` | 分片总数 |
| `grepPattern` | `string` | 匹配测试标题的正则模式 |
| `tagFilter` | `string[]` | 标签过滤器列表 |
| `updateSnapshots` | `boolean` | 是否更新快照 |
| `projectFilter` | `string` | Playwright 项目过滤器 |
| `testFiles` | `string[]` | 指定测试文件列表 |
| `testLocations` | `string[]` | 指定测试位置列表 |
| `parentRunId` | `string` | 父运行 ID，用于重跑场景 |

#### 执行流程

1. 检查是否已在运行，若正在运行则抛出 `PlaywrightRunnerError`（`ALREADY_RUNNING`）
2. 生成运行 ID（格式：`run_YYYYMMDD_HHmmss_随机串`）
3. 初始化 `RunResult` 对象
4. 过滤隔离测试（quarantined tests）
5. 准备运行环境（创建输出目录、初始化管理器、扫描注解和标签）
6. 通过 Playwright CLI 执行测试
7. 后处理（移动 HTML 报告、发现追踪文件、发现产物、运行视觉测试）
8. 返回 `RunResult`

如果执行过程中发生异常，`RunResult.status` 会被设为 `'failed'`。无论成功或失败，都会设置 `endTime` 和 `duration`，并触发 `run_completed` 事件。

### cancel()

取消当前正在运行的测试。

```typescript
async cancel(): Promise<void>
```

取消行为：

- 在 Windows 上使用 `taskkill /F /T /PID` 终止进程树
- 在 Unix 上先发送 `SIGTERM`，3 秒后若进程仍在运行则发送 `SIGKILL`
- 将 `RunResult.status` 设为 `'cancelled'`
- 触发 `run_cancelled` 事件

### 其他方法

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `getCurrentStatus()` | `Promise<RunResult \| null>` | 获取当前运行结果 |
| `isCurrentlyRunning()` | `boolean` | 检查是否正在执行 |
| `getConfig()` | `TestConfig` | 获取配置副本 |
| `getTestArtifacts(runId)` | `Promise<{ screenshots, videos, traces }>` | 获取指定运行的测试产物 |
| `getTraceManager()` | `TraceManager \| null` | 获取追踪管理器 |
| `getAnnotationManager()` | `AnnotationManager \| null` | 获取注解管理器 |
| `getTagManager()` | `TagManager \| null` | 获取标签管理器 |
| `getArtifactManager()` | `ArtifactManager \| null` | 获取产物管理器 |
| `getVisualManager()` | `VisualTestingManager \| null` | 获取视觉测试管理器 |

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `currentRun` | `RunResult \| null` | 当前运行结果（只读 getter） |

## 事件

Executor 继承自 `EventEmitter`，支持以下事件：

| 事件 | 参数 | 说明 |
|------|------|------|
| `run_started` | `{ runId: string, timestamp: number }` | 运行开始 |
| `test_result` | `TestResult` | 单个测试结果 |
| `run_progress` | `RunProgress` | 运行进度更新 |
| `run_completed` | `RunResult` | 运行完成 |
| `run_cancelled` | `RunResult \| null` | 运行被取消 |
| `output` | `{ data: string, timestamp: number, runId: string, type?: string }` | 输出数据（stdout/stderr/info） |
| `error` | `{ error: string, runId: string }` | 错误事件 |
| `annotations_scanned` | `{ runId: string, summary }` | 注解扫描完成 |
| `tags_scanned` | `{ runId: string, summary }` | 标签扫描完成 |

## ParallelExecutor 类

并行执行器，创建多个 Executor 实例分片执行测试。

### 构造函数

```typescript
constructor(config: TestConfig, shardCount: number, storage?: StorageProvider)
```

创建 `shardCount` 个 Executor 实例，每个分片使用独立的输出目录（`outputDir/shard-{i}`）。

### 方法

| 方法 | 返回类型 | 说明 |
|------|----------|------|
| `execute()` | `Promise<RunResult[]>` | 并行执行所有分片 |
| `cancelAll()` | `Promise<void>` | 取消所有分片执行 |

## 类型定义

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

## 示例

### 基本使用

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

### 监听事件

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

### 使用过滤选项

```typescript
const result = await executor.execute({
  grepPattern: 'smoke',
  projectFilter: 'chromium',
  tagFilter: ['@critical'],
  updateSnapshots: false,
  testFiles: ['tests/login.spec.ts'],
});
```

### 分片执行

```typescript
const result = await executor.execute({
  shardIndex: 0,
  shardTotal: 4,
});
```

### 取消执行

```typescript
setTimeout(async () => {
  if (executor.isCurrentlyRunning()) {
    await executor.cancel();
    console.log('Execution cancelled');
  }
}, 60000);
```

### 并行执行

```typescript
import { ParallelExecutor } from 'yuantest-playwright';

const parallelExecutor = new ParallelExecutor(config, 4);
const results = await parallelExecutor.execute();
const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
console.log(`Total passed: ${totalPassed}`);
```
