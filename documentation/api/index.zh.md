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

| 模块 | 说明 | 详细文档 |
|------|------|----------|
| **Orchestrator** | 测试编排器，支持 distributed/weighted/intelligent 策略 | [Orchestrator API](orchestrator.md) |
| **Executor** | 测试执行器，调用 Playwright CLI 执行测试 | [Executor API](executor.md) |
| **Reporter** | 报告生成器，支持 JSON/HTML 报告和失败分析 | [Reporter API](reporter.md) |
| **FlakyTestManager** | Flaky 测试管理器，分类/根因/关联/趋势/预测/因果图/隔离 | [FlakyTestManager API](flaky.md) |
| **DashboardServer** | Dashboard 服务器，REST API + WebSocket 实时推送 | [DashboardServer API](dashboard.md) |

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
    outputDir: './test-reports',
    shards: 4,
    browsers: ['chromium', 'firefox'],
  });
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();

  // 2. 执行测试
  const executor = new Executor(orchestrator.getConfig());

  executor.on('run_started', (data) => {
    console.log(`Run started: ${data.runId}`);
  });

  executor.on('test_result', (result) => {
    console.log(`[${result.status}] ${result.title} (${result.duration}ms)`);
  });

  executor.on('run_completed', async (result) => {
    // 3. 生成报告
    const reporter = new Reporter('./test-reports');
    const reportPath = await reporter.generateReport(result);
    console.log(`Report: ${reportPath}`);
  });

  const result = await executor.execute();

  // 4. Flaky 测试管理
  const flakyManager = new FlakyTestManager('./test-data');
  await flakyManager.recordRunResults(result);

  // 查看分类
  const flakyTests = flakyManager.getFlakyTests();
  const brokenTests = flakyManager.getTestsByClassification('broken');

  // 根因分析
  for (const test of flakyTests) {
    const rootCause = await flakyManager.analyzeRootCause(test.testId);
    console.log(`${test.title}: ${rootCause?.primaryCause}`);
  }

  // 健康评分
  const health = flakyManager.getOverallHealthScore();
  console.log(`Health: ${health.grade} (${health.overall})`);

  // 5. AI Agent 系统
  const agentService = new AgentService('./test-data', { projectRoot: './' }, llmConfig);

  // 生成测试计划
  const planResult = await agentService.plan('用户登录流程');
  if (planResult.success && planResult.data) {
    console.log(`计划: ${planResult.data.title} (${planResult.data.scenarios.length} 个场景)`);
  }

  // 从计划生成测试代码
  if (planResult.data?.filePath) {
    const genResult = await agentService.generate(planResult.data.filePath);
    if (genResult.success && genResult.data) {
      console.log(`生成文件: ${genResult.data.join(', ')}`);
    }
  }

  // 修复失败测试
  const healResult = await agentService.heal('tests/login.spec.ts', {
    error: '等待选择器超时',
  });
  if (healResult.success && healResult.data) {
    console.log(`已修复: ${healResult.data.healed}, 补丁数: ${healResult.data.patches.length}`);
  }

  // 6. 启动 Dashboard
  const server = new DashboardServer({
    port: 5274,
    outputDir: './test-reports',
    dataDir: './test-data',
  });
  await server.start();
}

main();
```

## 核心类型

主要类型定义（完整定义请参考各模块文档）：

```typescript
// 测试结果
interface TestResult {
  id: string;
  title: string;
  fullTitle?: string;
  file?: string;
  line?: number;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
  browser: BrowserType;
  shard?: number;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
  logs?: string[];
  stackTrace?: string;
}

// 运行结果
interface RunResult {
  id: string;
  version: string;
  status: 'success' | 'failed' | 'cancelled' | 'running';
  suites: SuiteResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  flakyTests: TestResult[];
  metadata?: RunMetadata;
}

// Flaky 测试
interface FlakyTest {
  testId: string;
  title: string;
  failureRate: number;
  weightedFailureRate: number;
  totalRuns: number;
  classification: FlakyClassification;
  isQuarantined: boolean;
  isolationLevel?: IsolationLevel;
  rootCause?: RootCauseAnalysis;
  healthScore?: FlakyHealthScore;
  trendAnalysis?: TrendAnalysis;
  lastPrediction?: PredictionResult;
  aiDiagnosis?: AIDiagnosis;
}

// Flaky 分类
type FlakyClassification =
  | 'flaky' | 'broken' | 'regression'
  | 'monitor' | 'stable' | 'insufficient_data';

// 隔离级别
type IsolationLevel = 'none' | 'monitor' | 'soft_quarantine' | 'hard_quarantine';

// 健康评分
interface FlakyHealthScore {
  overall: number;
  breakdown: { stability: number; trend: number; recoverability: number; predictability: number; };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  label: string;
}

// Agent 结果
interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  agentType: 'planner' | 'generator' | 'healer';
  model?: string;
}

// 测试计划
interface TestPlan {
  id: string;
  title: string;
  description: string;
  scenarios: TestPlanScenario[];
  createdAt: number;
  seedTest?: string;
  filePath?: string;
}

// 修复补丁
interface HealerPatch {
  testId: string;
  testTitle: string;
  filePath: string;
  originalCode: string;
  patchedCode: string;
  unifiedDiff: string;
  confidence: number;
  reason: string;
  appliedAt?: number;
  appliedBy?: 'auto' | 'manual';
  verified?: boolean;
}
```
