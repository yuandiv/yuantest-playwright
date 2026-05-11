# FlakyTestManager API

FlakyTestManager 负责管理和分析不稳定测试。

## 构造函数

```typescript
const flakyManager = new FlakyTestManager(dataDir: string);
```

## 方法

### initialize()

初始化管理器。

```typescript
await flakyManager.initialize(): Promise<void>
```

### recordTestRun(testId, passed)

记录测试运行结果。

```typescript
await flakyManager.recordTestRun(
  testId: string,
  passed: boolean
): Promise<void>
```

### getFlakyTests(threshold?)

获取 Flaky 测试列表。

```typescript
const flakyTests = await flakyManager.getFlakyTests(threshold?: number): Promise<FlakyTest[]>
```

### quarantineTest(testId)

隔离测试。

```typescript
await flakyManager.quarantineTest(testId: string): Promise<void>
```

### releaseTest(testId)

释放测试。

```typescript
await flakyManager.releaseTest(testId: string): Promise<void>
```

### getQuarantinedTests()

获取已隔离的测试。

```typescript
const quarantined = await flakyManager.getQuarantinedTests(): Promise<FlakyTest[]>
```

### getStats()

获取 Flaky 统计信息。

```typescript
const stats = await flakyManager.getStats(): Promise<FlakyStats>
```

### isQuarantined(testId)

检查测试是否被隔离。

```typescript
const quarantined = await flakyManager.isQuarantined(testId: string): Promise<boolean>
```

## 示例

### 基本使用

```typescript
import { FlakyTestManager } from 'yuantest-playwright';

const flakyManager = new FlakyTestManager('./test-data');
await flakyManager.initialize();

// 记录测试结果
await flakyManager.recordTestRun('test-login', true);
await flakyManager.recordTestRun('test-login', false);
await flakyManager.recordTestRun('test-login', true);

// 获取 Flaky 测试（失败率 > 30%）
const flakyTests = await flakyManager.getFlakyTests(0.3);
console.log(`Found ${flakyTests.length} flaky tests`);
```

### 隔离测试

```typescript
// 隔离特定测试
await flakyManager.quarantineTest('test-unstable-feature');

// 检查是否被隔离
const isQuarantined = await flakyManager.isQuarantined('test-unstable-feature');
console.log(`Is quarantined: ${isQuarantined}`);

// 释放测试
await flakyManager.releaseTest('test-unstable-feature');
```

### 查看统计

```typescript
const stats = await flakyManager.getStats();
console.log(`Total tests tracked: ${stats.totalTests}`);
console.log(`Flaky tests: ${stats.flakyCount}`);
console.log(`Quarantined: ${stats.quarantinedCount}`);
console.log(`Average failure rate: ${stats.averageFailureRate}`);
```

### 获取已隔离测试

```typescript
const quarantined = await flakyManager.getQuarantinedTests();
quarantined.forEach((test) => {
  console.log(`${test.testId}: ${test.failureRate * 100}% failure rate`);
  console.log(`  Quarantined at: ${test.quarantinedAt}`);
});
```

## 类型定义

```typescript
interface FlakyTest {
  testId: string;
  testName: string;
  file: string;
  totalRuns: number;
  failures: number;
  failureRate: number;
  lastFailure?: Date;
  quarantinedAt?: Date;
  history: TestRunRecord[];
}

interface TestRunRecord {
  timestamp: Date;
  passed: boolean;
  duration?: number;
}

interface FlakyStats {
  totalTests: number;
  flakyCount: number;
  quarantinedCount: number;
  averageFailureRate: number;
  topFlakyTests: FlakyTest[];
}
```
