# API 参考

YuanTest Playwright 提供了完整的编程 API，可以在 Node.js 代码中直接使用。

## 安装

```bash
npm install yuantest-playwright
```

## 基本导入

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
} from 'yuantest-playwright';
```

## 核心模块

- [Orchestrator](orchestrator.md) - 测试编排器
- [Executor](executor.md) - 测试执行器
- [Reporter](reporter.md) - 报告生成器
- [FlakyTestManager](flaky.md) - Flaky 测试管理器
- [DashboardServer](dashboard.md) - Dashboard 服务器

## 快速示例

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
} from 'yuantest-playwright';

async function main() {
  // 1. 编排测试
  const orchestrator = new Orchestrator({
    projectName: 'my-app',
    testDir: './e2e',
    outputDir: './reports',
    shards: 4,
    browsers: ['chromium', 'firefox'],
  });
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();

  // 2. 执行测试
  const executor = new Executor(orchestrator.getConfig());

  // 监听事件
  executor.on('run_started', (data) => {
    console.log(`Run started: ${data.runId}`);
  });

  executor.on('test_result', (result) => {
    console.log(`[${result.status}] ${result.title} (${result.duration}ms)`);
  });

  executor.on('run_progress', (progress) => {
    console.log(`Progress: ${progress.passed}/${progress.totalTests} passed`);
  });

  executor.on('run_completed', async (result) => {
    // 3. 生成报告
    const reporter = new Reporter('./reports');
    const reportPath = await reporter.generateReport(result);
    console.log(`Report: ${reportPath}`);
  });

  const result = await executor.execute();
  console.log(`Final: ${result.passed}/${result.totalTests} passed`);

  // 4. 启动 Dashboard
  const server = new DashboardServer(5274, './reports', './test-data');
  await server.start();
}

main();
```

## 类型定义

主要类型定义：

```typescript
interface TestResult {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: Error;
  retries: number;
}

interface RunResult {
  runId: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestResult[];
}

interface OrchestratorConfig {
  projectName: string;
  testDir: string;
  outputDir: string;
  shards?: number;
  browsers?: string[];
  timeout?: number;
  retries?: number;
}
```
