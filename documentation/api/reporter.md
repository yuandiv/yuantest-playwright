# Reporter API

Reporter 负责生成测试报告，支持 HTML 和 JSON 格式。

## 构造函数

```typescript
const reporter = new Reporter(outputDir: string);
```

## 方法

### generateReport(result)

生成测试报告。

```typescript
const reportPath = await reporter.generateReport(result: RunResult): Promise<string>
```

### analyzeFailures(result)

分析失败原因。

```typescript
const analysis = await reporter.analyzeFailures(result: RunResult): Promise<FailureAnalysis[]>
```

### getReport(runId)

获取指定运行的报告。

```typescript
const report = await reporter.getReport(runId: string): Promise<ReportData | null>
```

### listReports(limit?)

列出所有报告。

```typescript
const reports = await reporter.listReports(limit?: number): Promise<ReportData[]>
```

### exportReport(runId, format)

导出报告。

```typescript
const exportPath = await reporter.exportReport(
  runId: string,
  format: 'html' | 'json'
): Promise<string>
```

## 示例

### 基本使用

```typescript
import { Reporter } from 'yuantest-playwright';

const reporter = new Reporter('./reports');

// 生成报告
const reportPath = await reporter.generateReport(result);
console.log(`Report generated: ${reportPath}`);

// 分析失败
const analysis = await reporter.analyzeFailures(result);
analysis.forEach((failure) => {
  console.log(`${failure.category}: ${failure.message}`);
  console.log(`Suggestion: ${failure.suggestion}`);
});
```

### 查看历史报告

```typescript
// 列出最近 10 条报告
const reports = await reporter.listReports(10);
reports.forEach((report) => {
  console.log(`${report.runId}: ${report.passed}/${report.totalTests} passed`);
});

// 获取特定报告
const report = await reporter.getReport('run_20240101_120000_abc123');
if (report) {
  console.log(`Run: ${report.runId}`);
  console.log(`Duration: ${report.duration}ms`);
}
```

### 导出报告

```typescript
// 导出 HTML 报告
const htmlPath = await reporter.exportReport(runId, 'html');

// 导出 JSON 报告
const jsonPath = await reporter.exportReport(runId, 'json');
```

## 类型定义

```typescript
interface ReportData {
  runId: string;
  projectName: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  startTime: Date;
  endTime: Date;
  results: TestResult[];
}

interface FailureAnalysis {
  testId: string;
  testTitle: string;
  category: FailureCategory;
  message: string;
  stack?: string;
  suggestion: string;
  relatedInfo?: string[];
}

type FailureCategory =
  | 'timeout'
  | 'assertion'
  | 'element_not_found'
  | 'network_error'
  | 'navigation'
  | 'unknown';
```
