# TestDiscovery API Reference

TestDiscovery discovers and lists Playwright tests in a project by running `npx playwright test --list --reporter=json`. It supports caching, pagination, structured results with file grouping, and project configuration validation.

---

## Constructor

```typescript
new TestDiscovery(storage?: StorageProvider, lang?: Lang)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `storage` | `StorageProvider` | Auto-created | Custom storage provider instance |
| `lang` | `Lang` | | Language setting for configuration validation messages (`'zh'` or `'en'`) |

### Example

```typescript
import { TestDiscovery } from 'yuantest-playwright';

const discovery = new TestDiscovery();

const tests = await discovery.discoverTests('./tests');
```

---

## Instance Methods

### `discoverTests(testDir: string, configPath?: string, useCache?: boolean): Promise<DiscoveredTest[]>`

Discover all tests in the specified directory. Returns a flat array of discovered test objects. Uses cached results by default if available.

```typescript
const tests = await discovery.discoverTests('./tests');

const testsWithConfig = await discovery.discoverTests('./tests', 'playwright.config.ts');

const freshTests = await discovery.discoverTests('./tests', undefined, false);
```

### `discoverTestsPaginated(testDir: string, options?: PaginationOptions): Promise<PaginatedTestDiscoveryResult>`

Discover tests with pagination support. Returns a paginated result containing the test subset for the requested page along with pagination metadata.

```typescript
const page1 = await discovery.discoverTestsPaginated('./tests', {
  page: 1,
  pageSize: 20,
});

console.log(`Page ${page1.page} of ${page1.totalPages}`);
console.log(`Total tests: ${page1.total}`);
```

### `discoverTestsStructured(testDir: string, configPath?: string, useCache?: boolean): Promise<TestDiscoveryResult>`

Discover tests and return structured results grouped by file, including describe block hierarchy. Also includes configuration validation results and any errors encountered.

```typescript
const result = await discovery.discoverTestsStructured('./tests');

console.log(`Files: ${result.files.length}`);
console.log(`Tests: ${result.tests.length}`);

if (result.configValidation) {
  console.log(`Config valid: ${result.configValidation.valid}`);
}

if (result.error) {
  console.error(`Discovery error: ${result.error}`);
}
```

### `getTestCount(testDir: string): Promise<number>`

Get the total number of tests in the specified directory. Uses a lightweight approach that counts specs from the Playwright JSON output without building the full discovery result.

```typescript
const count = await discovery.getTestCount('./tests');

console.log(`Total tests: ${count}`);
```

### `getTestStats(testDir: string): Promise<TestStats>`

Get aggregated test statistics including total test count, total file count, and breakdowns by tag and by file.

```typescript
const stats = await discovery.getTestStats('./tests');

console.log(`Total tests: ${stats.totalTests}`);
console.log(`Total files: ${stats.totalFiles}`);

for (const [tag, count] of Object.entries(stats.byTag)) {
  console.log(`  @${tag}: ${count} tests`);
}
```

### `invalidateCache(testDir?: string): void`

Invalidate the discovery cache. If `testDir` is provided, only invalidates the cache for that directory. Otherwise, clears the entire cache.

```typescript
discovery.invalidateCache('./tests');

discovery.invalidateCache();
```

### `setLang(lang: Lang): void`

Set the language for configuration validation messages. Affects the language used in error messages from the Playwright config merger.

```typescript
discovery.setLang('zh');

discovery.setLang('en');
```

### `validateProjectPath(projectDir: string): Promise<ConfigValidationResult>`

Validate whether the specified project directory contains a valid Playwright configuration. Returns a validation result with the resolved config path and any error message.

```typescript
const validation = await discovery.validateProjectPath('./my-project');

if (validation.valid) {
  console.log(`Config found at: ${validation.configPath}`);
} else {
  console.error(`Invalid project: ${validation.error}`);
}
```

---

## Static Methods

### `TestDiscovery.buildGrepPatternForDescribe(describeTitle: string): string`

Build a grep pattern string for matching a specific describe block title. Escapes special regex characters and anchors the pattern to the start of the title.

```typescript
const pattern = TestDiscovery.buildGrepPatternForDescribe('Login Module');
```

### `TestDiscovery.buildGrepPatternForTests(tests: DiscoveredTest[]): string`

Build a grep pattern string for matching multiple tests by their full titles. Joins all test full titles with the pipe `|` operator after escaping special regex characters.

```typescript
const pattern = TestDiscovery.buildGrepPatternForTests([
  { fullTitle: 'Login > should authenticate', id: '', title: '', file: '', line: 0, column: 0, tags: [], annotations: [], projectId: '', projectName: '' },
]);
```

---

## Type Definitions

```typescript
type Lang = 'zh' | 'en';

interface DiscoveredTest {
  id: string;
  title: string;
  fullTitle: string;
  file: string;
  line: number;
  column: number;
  tags: string[];
  annotations: Array<{ type: string; description?: string }>;
  projectId: string;
  projectName: string;
}

interface DiscoveredDescribe {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: DiscoveredTest[];
  describes: DiscoveredDescribe[];
}

interface DiscoveredFile {
  file: string;
  title: string;
  describes: DiscoveredDescribe[];
  tests: DiscoveredTest[];
}

interface TestDiscoveryResult {
  files: DiscoveredFile[];
  tests: DiscoveredTest[];
  configValidation?: ConfigValidationResult;
  error?: string;
  rawOutput?: string;
}

interface PaginatedTestDiscoveryResult {
  tests: DiscoveredTest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ConfigValidationResult {
  valid: boolean;
  configPath?: string;
  error?: string;
}

interface PaginationOptions {
  page?: number;
  pageSize?: number;
  configPath?: string;
}

interface TestStats {
  totalTests: number;
  totalFiles: number;
  byTag: Record<string, number>;
  byFile: Record<string, number>;
}
```
