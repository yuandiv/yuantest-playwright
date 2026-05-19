# Reporter API

Reporter 负责生成和管理测试报告，支持 HTML 和 JSON 格式，并提供失败分析和仪表盘统计功能。

## Reporter 类

### 构造函数

```typescript
constructor(
  outputDir?: string,
  storage?: StorageProvider,
  diagnosisService?: DiagnosisService,
  flakyManager?: FlakyTestManager
)
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `outputDir` | `string` | `'./reports'` | 报告输出目录 |
| `storage` | `StorageProvider` | 默认存储提供者 | 存储抽象层 |
| `diagnosisService` | `DiagnosisService` | `null` | AI 诊断服务，用于失败分析 |
| `flakyManager` | `FlakyTestManager` | `undefined` | 不稳定测试管理器，用于根因分析 |

构造时会自动创建输出目录，并初始化内存缓存（最大缓存数量由 `CACHE_CONFIG.MAX_REPORT_CACHE_SIZE` 决定）。

### generateReport(runResult)

生成代码报告，输出 JSON 文件和 HTML 文件。

```typescript
async generateReport(runResult: RunResult): Promise<string>
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `runResult` | `RunResult` | 测试运行结果 |

**返回值：** HTML 报告文件路径（`string`）

**行为：**

1. 将运行结果写入 `{outputDir}/{runId}.json`
2. 若 HTML 报告不存在，从模板生成 `{outputDir}/{runId}.html`
3. 将结果加入内存缓存
4. 返回 HTML 报告路径

### analyzeFailures(runResult)

分析运行结果中的失败测试，返回失败分析列表。

```typescript
async analyzeFailures(runResult: RunResult): Promise<FailureAnalysis[]>
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `runResult` | `RunResult` | 测试运行结果 |

**返回值：** `FailureAnalysis[]`

**行为：**

1. 遍历所有 suite 中状态为 `failed` 的测试
2. 对每个失败测试进行错误分类（`categorizeError`）和生成建议（`generateSuggestions`）
3. 如果配置了 `diagnosisService` 且已启用，则对每个失败分析进行 AI 诊断
4. AI 诊断会结合 `flakyManager` 中的根因分析数据
5. 诊断结果会回写到 `flakyManager` 中对应的不稳定测试记录

### generateDashboard()

生成仪表盘统计数据。

```typescript
async generateDashboard(): Promise<DashboardStats>
```

**返回值：** `DashboardStats`

```typescript
interface DashboardStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  avgDuration: number;
  flakyTests: number;
  quarantinedTests: number;
  recentRuns: RunResult[];
}
```

### getReport(reportId)

获取指定运行的报告。

```typescript
async getReport(reportId: string): Promise<RunResult | null>
```

### deleteReport(reportId)

删除指定运行的报告（包括 JSON、HTML 和 Playwright HTML 报告目录）。

```typescript
async deleteReport(reportId: string): Promise<boolean>
```

### deleteAllReports()

删除所有报告。

```typescript
async deleteAllReports(): Promise<number>
```

**返回值：** 已删除的报告数量

### getAllReports()

获取所有报告。

```typescript
async getAllReports(): Promise<RunResult[]>
```

### clearCache()

清除内存缓存，强制下次调用 `getAllReports` 时重新从文件系统加载。

```typescript
clearCache(): void
```

### createPendingReport(runId, version)

创建待定报告（用于实时更新场景）。

```typescript
async createPendingReport(runId: string, version: string): Promise<RunResult>
```

**行为：** 创建一个状态为 `'running'` 的初始 `RunResult`，写入 JSON 文件并加入缓存。

### updatePendingReport(runId, testResult, suiteName)

更新待定报告中的测试结果。

```typescript
async updatePendingReport(runId: string, testResult: TestResult, suiteName: string): Promise<void>
```

**行为：**

1. 查找待定报告，若不存在则跳过
2. 查找或创建对应 suite
3. 若测试已存在则更新，否则添加新测试
4. 更新 suite 和报告的统计计数

### finalizePendingReport(runId, status)

完成待定报告，设置最终状态并生成完整报告。

```typescript
async finalizePendingReport(
  runId: string,
  status: 'success' | 'failed' | 'cancelled'
): Promise<string>
```

**行为：**

1. 设置报告状态、`endTime` 和 `duration`
2. 调用 `generateReport` 生成完整报告
3. 更新 JSON 文件
4. 从待定报告中移除
5. 返回 HTML 报告路径

### getPendingReport(runId)

获取待定报告。

```typescript
getPendingReport(runId: string): RunResult | undefined
```

### hasPendingReport(runId)

检查是否存在待定报告。

```typescript
hasPendingReport(runId: string): boolean
```

### updateTestResult(runId, testId, newResult)

更新报告中指定测试的结果（用于手动重跑场景）。

```typescript
async updateTestResult(runId: string, testId: string, newResult: TestResult): Promise<boolean>
```

**行为：**

1. 查找报告和对应测试
2. 将旧结果保存到 `runHistory` 中
3. 递增 `manualReruns` 计数
4. 用新结果替换旧结果（保留 `id`、`retries`、`manualReruns`、`runHistory`）
5. 更新 suite 和报告的统计计数
6. 写入 JSON 文件
7. 返回是否成功

## JSONReporter 类

继承自 `Reporter`，提供 JSON 格式报告生成。

### generateJSONReport(runResult)

生成 JSON 格式的报告字符串。

```typescript
async generateJSONReport(runResult: RunResult): Promise<string>
```

## 类型定义

### FailureAnalysis

```typescript
interface FailureAnalysis {
  testId: string;
  title: string;
  failureReason: string;
  category: 'assertion' | 'timeout' | 'network' | 'selector' | 'frame' | 'auth' | 'unknown';
  suggestions: string[];
  occurrences: number;
  lastOccurrence: number;
  firstOccurrence?: number;
  filePath?: string;
  lineNumber?: number;
  stackTrace?: string;
  browser?: string;
  aiDiagnosis?: AIDiagnosis;
}
```

### FailureAnalysisSummary

```typescript
interface FailureAnalysisSummary {
  total: number;
  persistent: number;
  emerging: number;
  firstTimeFailures: number;
  byClassification: Record<string, number>;
}
```

### ReportFailureSummary

```typescript
interface ReportFailureSummary {
  total: number;
  persistent: number;
  emerging: number;
  firstTimeFailures: number;
  byCategory: Record<string, number>;
}
```

### ReportFailureItem

```typescript
interface ReportFailureItem {
  testId: string;
  title: string;
  error: string;
  category: string;
  failureCount: number;
  lastFailureTime: number;
  firstFailureTime: number;
  filePath?: string;
  lineNumber?: number;
  suggestions: string[];
}
```

### FailureAnalysisResult

```typescript
type FailureAnalysisResult = FailureAnalysisSummary | FlakyTest[] | ImmediateFailure[];
```

联合类型，可以是失败分析摘要、不稳定测试列表或即时失败列表。

### ReportFailureResult

```typescript
type ReportFailureResult = ReportFailureSummary | ReportFailureItem[];
```

联合类型，可以是报告失败摘要或报告失败项列表。

### ImmediateFailure

```typescript
interface ImmediateFailure {
  testId: string;
  title: string;
  error?: string;
  status: string;
  timestamp: number;
  duration?: number;
}
```

### DashboardStats

```typescript
interface DashboardStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  avgDuration: number;
  flakyTests: number;
  quarantinedTests: number;
  recentRuns: RunResult[];
}
```

### AIDiagnosis

```typescript
interface AIDiagnosis {
  summary: string;
  rootCause: string;
  suggestions: string[];
  confidence: number;
  model: string;
  timestamp: number;
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  codeDiffs?: CodeDiff[];
  docLinks?: DocLink[];
  contextUsed: ContextUsed;
  reasoningSteps?: ReasoningStep[];
  calibratedConfidence: number;
  analysisMode: 'agent' | 'single' | 'fallback';
  relatedFailures?: string[];
}
```

### CodeDiff

```typescript
interface CodeDiff {
  filePath: string;
  unifiedDiff: string;
  description: string;
}
```

### DocLink

```typescript
interface DocLink {
  title: string;
  url: string;
}
```

### ContextUsed

```typescript
interface ContextUsed {
  sourceCode: boolean;
  screenshot: boolean;
  consoleLogs: boolean;
  stackTrace: boolean;
  historyData: boolean;
  environmentInfo: boolean;
}
```

### ReasoningStep

```typescript
interface ReasoningStep {
  step: number;
  tool?: string;
  input?: string;
  output?: string;
  thought: string;
}
```

## 示例

### 基本使用

```typescript
import { Reporter } from 'yuantest-playwright';

const reporter = new Reporter('./reports');

// 生成报告
const reportPath = await reporter.generateReport(result);
console.log(`Report generated: ${reportPath}`);
```

### 失败分析

```typescript
const analysis = await reporter.analyzeFailures(result);
analysis.forEach((failure) => {
  console.log(`[${failure.category}] ${failure.title}`);
  console.log(`  Reason: ${failure.failureReason}`);
  console.log(`  Occurrences: ${failure.occurrences}`);
  failure.suggestions.forEach((s) => console.log(`  Suggestion: ${s}`));
  if (failure.aiDiagnosis) {
    console.log(`  AI Root Cause: ${failure.aiDiagnosis.rootCause}`);
    console.log(`  AI Confidence: ${failure.aiDiagnosis.confidence}`);
  }
});
```

### 仪表盘统计

```typescript
const dashboard = await reporter.generateDashboard();
console.log(`Total runs: ${dashboard.totalRuns}`);
console.log(`Pass rate: ${dashboard.passRate.toFixed(1)}%`);
console.log(`Average duration: ${dashboard.avgDuration.toFixed(0)}ms`);
console.log(`Flaky tests: ${dashboard.flakyTests}`);
```

### 查看历史报告

```typescript
const reports = await reporter.getAllReports();
reports.forEach((report) => {
  console.log(`${report.id}: ${report.passed}/${report.totalTests} passed`);
});

const report = await reporter.getReport('run_20240101_120000_abc123');
if (report) {
  console.log(`Run: ${report.id}`);
  console.log(`Duration: ${report.duration}ms`);
}
```

### 实时报告（待定报告）

```typescript
// 创建待定报告
const pendingReport = await reporter.createPendingReport('run_123', '1.0.0');

// 随着测试执行更新
await reporter.updatePendingReport('run_123', testResult1, 'Login Suite');
await reporter.updatePendingReport('run_123', testResult2, 'Login Suite');

// 完成报告
const htmlPath = await reporter.finalizePendingReport('run_123', 'success');
console.log(`Final report: ${htmlPath}`);
```

### 手动重跑更新

```typescript
const updated = await reporter.updateTestResult('run_123', 'test_456', newTestResult);
if (updated) {
  console.log('Test result updated successfully');
}
```

### 删除报告

```typescript
// 删除单个报告
const deleted = await reporter.deleteReport('run_123');
console.log(`Deleted: ${deleted}`);

// 删除所有报告
const count = await reporter.deleteAllReports();
console.log(`Deleted ${count} reports`);
```

### JSON 报告

```typescript
import { JSONReporter } from 'yuantest-playwright';

const jsonReporter = new JSONReporter('./reports');
const jsonStr = await jsonReporter.generateJSONReport(result);
console.log(jsonStr);
```
