# VisualTestingManager API 参考

VisualTestingManager 提供视觉回归测试功能，通过像素级比较来对比基线截图和当前截图。它管理基线捕获、当前截图捕获、差异图生成和结果报告。

---

## 构造函数

```typescript
new VisualTestingManager(config: VisualTestingConfig, baseDir?: string, storage?: StorageProvider)
```

### 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `config` | `VisualTestingConfig` | | 视觉测试配置 |
| `baseDir` | `string` | `'./visual-testing'` | 视觉测试输出的基础目录，如果设置了 `config.outputDir` 则会被覆盖 |
| `storage` | `StorageProvider` | 自动创建 | 自定义存储提供者实例 |

### 示例

```typescript
import { VisualTestingManager } from 'yuantest-playwright';

const manager = new VisualTestingManager(
  {
    enabled: true,
    threshold: 0.2,
    maxDiffPixelRatio: 0.01,
    maxDiffPixels: 10,
    updateSnapshots: false,
  },
  './visual-testing'
);

await manager.initialize();
```

---

## 实例方法

### `initialize(): Promise<void>`

初始化视觉测试目录结构。在基础目录下创建 `baseline`、`current`、`diff` 和 `comparison` 子目录。

```typescript
await manager.initialize();
```

### `captureBaseline(testId: string, screenshotPath: string, browser?: BrowserType): Promise<string>`

将截图捕获为测试的基线图像。将截图文件复制到基线目录。返回基线保存的路径。

```typescript
const baselinePath = await manager.captureBaseline(
  'login-test',
  './screenshots/login.png'
);

const baselinePathFirefox = await manager.captureBaseline(
  'login-test',
  './screenshots/login.png',
  'firefox'
);
```

### `captureCurrent(testId: string, screenshotPath: string, browser?: BrowserType): Promise<string>`

将截图捕获为用于比较的当前图像。将截图文件复制到当前目录。返回当前截图保存的路径。

```typescript
const currentPath = await manager.captureCurrent(
  'login-test',
  './screenshots/login-current.png'
);
```

### `compare(testId: string, browser?: BrowserType): Promise<VisualTestComparison>`

使用像素级比较对比测试的基线截图和当前截图。如果截图不同则生成差异图。返回包含差异指标的比较结果。

```typescript
const comparison = await manager.compare('login-test');

if (comparison.matches) {
  console.log('截图一致');
} else {
  console.log(`差异: ${comparison.diffPixels} 像素 (${(comparison.diffRatio * 100).toFixed(2)}%)`);
}
```

### `runVisualTests(testIds: string[], browser?: BrowserType): Promise<VisualTestResult[]>`

对多个测试运行视觉比较并收集结果。每个测试与其基线进行比较，根据比较结果和配置阈值确定结果状态。

```typescript
const results = await manager.runVisualTests([
  'login-test',
  'register-test',
  'dashboard-test',
]);

for (const result of results) {
  console.log(`${result.testId}: ${result.status}`);
}
```

### `updateBaseline(testId: string, browser?: BrowserType): Promise<boolean>`

通过将当前截图复制到基线目录来更新测试的基线截图。基线更新成功返回 `true`，当前截图不存在返回 `false`。

```typescript
const updated = await manager.updateBaseline('login-test');

if (updated) {
  console.log('基线更新成功');
}
```

### `updateAllBaselines(browser?: BrowserType): Promise<number>`

通过将所有当前截图复制到基线目录来更新所有基线。返回更新的基线数量。

```typescript
const count = await manager.updateAllBaselines();

console.log(`更新了 ${count} 个基线`);
```

### `getResults(): VisualTestResult[]`

获取当前会话的所有视觉测试结果。返回由 `runVisualTests` 收集的所有结果数组。

```typescript
const results = manager.getResults();

for (const result of results) {
  console.log(`${result.testName}: ${result.status}`);
}
```

### `getResult(testId: string): VisualTestResult | null`

获取特定测试的视觉测试结果。如果给定测试 ID 不存在结果则返回 `null`。

```typescript
const result = manager.getResult('login-test');

if (result) {
  console.log(`状态: ${result.status}, 差异: ${result.diffPixelRatio}`);
}
```

### `getSummary(): VisualTestSummary`

获取所有视觉测试结果的摘要，包括按状态的计数和总体通过率。通过率计算公式为 `(identical + new) / total`。

```typescript
const summary = manager.getSummary();

console.log(`总数: ${summary.total}`);
console.log(`一致: ${summary.identical}`);
console.log(`不同: ${summary.different}`);
console.log(`新增: ${summary.new}`);
console.log(`缺失: ${summary.missing}`);
console.log(`回归: ${summary.regression}`);
console.log(`通过率: ${(summary.passRate * 100).toFixed(1)}%`);
```

### `generateVisualReport(outputPath: string): Promise<string>`

生成包含配置、摘要和所有测试结果的 JSON 视觉测试报告。返回报告保存的路径。

```typescript
const reportPath = await manager.generateVisualReport('./reports/visual-report.json');

console.log(`报告已保存至: ${reportPath}`);
```

---

## 类型定义

```typescript
type BrowserType = 'chromium' | 'firefox' | 'webkit';

type VisualTestStatus = 'identical' | 'different' | 'new' | 'missing' | 'regression';

interface VisualTestingConfig {
  enabled: boolean;
  threshold: number;
  maxDiffPixelRatio: number;
  maxDiffPixels: number;
  updateSnapshots: boolean;
  compareWith?: string;
  outputDir?: string;
}

interface VisualTestResult {
  testId: string;
  testName: string;
  status: VisualTestStatus;
  baselinePath: string;
  comparisonPath: string;
  diffPath: string;
  diffPixelRatio: number;
  diffPixels: number;
  threshold: number;
  timestamp: number;
  browser: BrowserType;
}

interface VisualTestComparison {
  baseline: string;
  current: string;
  diff: string;
  diffPixels: number;
  totalPixels: number;
  diffRatio: number;
  matches: boolean;
}

interface VisualTestSummary {
  total: number;
  identical: number;
  different: number;
  new: number;
  missing: number;
  regression: number;
  passRate: number;
}
```
