# Executor API

Executor 负责测试执行，通过 Playwright CLI 运行测试。

## 构造函数

```typescript
const executor = new Executor(config: OrchestratorConfig);
```

## 方法

### execute(options?)

执行测试。

```typescript
const result = await executor.execute(options?: ExecuteOptions): Promise<RunResult>
```

#### ExecuteOptions

| 参数 | 类型 | 说明 |
|------|------|------|
| `grepPattern` | string | 匹配测试的模式 |
| `projectFilter` | string | 项目过滤器 |
| `updateSnapshots` | boolean | 是否更新快照 |

### stop()

停止当前执行。

```typescript
executor.stop(): void
```

### isRunning()

检查是否正在执行。

```typescript
const running = executor.isRunning(): boolean
```

## 事件

Executor 继承自 EventEmitter，支持以下事件：

| 事件 | 参数 | 说明 |
|------|------|------|
| `run_started` | `{ runId: string }` | 运行开始 |
| `test_result` | `TestResult` | 单个测试结果 |
| `run_progress` | `ProgressInfo` | 运行进度 |
| `run_completed` | `RunResult` | 运行完成 |
| `output` | `{ data: string }` | 输出数据 |
| `error` | `Error` | 错误事件 |

## 示例

### 基本使用

```typescript
import { Executor } from 'yuantest-playwright';

const executor = new Executor({
  projectName: 'my-app',
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
  updateSnapshots: false,
});
```

### 停止执行

```typescript
// 在另一个地方停止执行
setTimeout(() => {
  if (executor.isRunning()) {
    executor.stop();
    console.log('Execution stopped');
  }
}, 60000);
```

## 类型定义

```typescript
interface RunResult {
  runId: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
  startTime: Date;
  endTime: Date;
}

interface TestResult {
  id: string;
  title: string;
  file: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: {
    message: string;
    stack?: string;
  };
  retries: number;
  annotations?: string[];
}

interface ProgressInfo {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  currentTest?: string;
}

interface ExecuteOptions {
  grepPattern?: string;
  projectFilter?: string;
  updateSnapshots?: boolean;
}
```
