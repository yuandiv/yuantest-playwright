# VisualTestingManager API Reference

VisualTestingManager provides visual regression testing capabilities by comparing baseline and current screenshots using pixel-level comparison. It manages baseline capture, current screenshot capture, diff generation, and result reporting.

---

## Constructor

```typescript
new VisualTestingManager(config: VisualTestingConfig, baseDir?: string, storage?: StorageProvider)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `config` | `VisualTestingConfig` | | Visual testing configuration |
| `baseDir` | `string` | `'./visual-testing'` | Base directory for visual testing output, overridden by `config.outputDir` if set |
| `storage` | `StorageProvider` | Auto-created | Custom storage provider instance |

### Example

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

## Instance Methods

### `initialize(): Promise<void>`

Initialize the visual testing directory structure. Creates `baseline`, `current`, `diff`, and `comparison` subdirectories under the base directory.

```typescript
await manager.initialize();
```

### `captureBaseline(testId: string, screenshotPath: string, browser?: BrowserType): Promise<string>`

Capture a screenshot as the baseline image for a test. Copies the screenshot file to the baseline directory. Returns the path where the baseline was saved.

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

Capture a screenshot as the current image for comparison. Copies the screenshot file to the current directory. Returns the path where the current screenshot was saved.

```typescript
const currentPath = await manager.captureCurrent(
  'login-test',
  './screenshots/login-current.png'
);
```

### `compare(testId: string, browser?: BrowserType): Promise<VisualTestComparison>`

Compare the baseline and current screenshots for a test using pixel-level comparison. Generates a diff image if the screenshots differ. Returns a comparison result with diff metrics.

```typescript
const comparison = await manager.compare('login-test');

if (comparison.matches) {
  console.log('Screenshots are identical');
} else {
  console.log(`Diff: ${comparison.diffPixels} pixels (${(comparison.diffRatio * 100).toFixed(2)}%)`);
}
```

### `runVisualTests(testIds: string[], browser?: BrowserType): Promise<VisualTestResult[]>`

Run visual comparison for multiple tests and collect results. Each test is compared against its baseline, and the result status is determined based on the comparison outcome and configuration thresholds.

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

Update the baseline screenshot for a test by copying the current screenshot to the baseline directory. Returns `true` if the baseline was updated, `false` if no current screenshot exists.

```typescript
const updated = await manager.updateBaseline('login-test');

if (updated) {
  console.log('Baseline updated successfully');
}
```

### `updateAllBaselines(browser?: BrowserType): Promise<number>`

Update all baselines by copying all current screenshots to the baseline directory. Returns the number of baselines updated.

```typescript
const count = await manager.updateAllBaselines();

console.log(`Updated ${count} baseline(s)`);
```

### `getResults(): VisualTestResult[]`

Get all visual test results from the current session. Returns an array of all results that have been collected by `runVisualTests`.

```typescript
const results = manager.getResults();

for (const result of results) {
  console.log(`${result.testName}: ${result.status}`);
}
```

### `getResult(testId: string): VisualTestResult | null>`

Get the visual test result for a specific test. Returns `null` if no result exists for the given test ID.

```typescript
const result = manager.getResult('login-test');

if (result) {
  console.log(`Status: ${result.status}, Diff: ${result.diffPixelRatio}`);
}
```

### `getSummary(): VisualTestSummary`

Get a summary of all visual test results, including counts by status and the overall pass rate. The pass rate is calculated as `(identical + new) / total`.

```typescript
const summary = manager.getSummary();

console.log(`Total: ${summary.total}`);
console.log(`Identical: ${summary.identical}`);
console.log(`Different: ${summary.different}`);
console.log(`New: ${summary.new}`);
console.log(`Missing: ${summary.missing}`);
console.log(`Regression: ${summary.regression}`);
console.log(`Pass Rate: ${(summary.passRate * 100).toFixed(1)}%`);
```

### `generateVisualReport(outputPath: string): Promise<string>`

Generate a JSON visual testing report containing the configuration, summary, and all test results. Returns the path where the report was saved.

```typescript
const reportPath = await manager.generateVisualReport('./reports/visual-report.json');

console.log(`Report saved to: ${reportPath}`);
```

---

## Type Definitions

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
