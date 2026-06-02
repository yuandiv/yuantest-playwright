# TestDiscovery API 参考

TestDiscovery 通过运行 `npx playwright test --list --reporter=json` 来发现和列出项目中的 Playwright 测试。它支持缓存、分页、按文件分组的结构化结果以及项目配置验证。

---

## 构造函数

```typescript
new TestDiscovery(storage?: StorageProvider, lang?: Lang)
```

### 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `storage` | `StorageProvider` | 自动创建 | 自定义存储提供者实例 |
| `lang` | `Lang` | | 配置验证消息的语言设置（`'zh'` 或 `'en'`） |

### 示例

```typescript
import { TestDiscovery } from 'yuantest-playwright';

const discovery = new TestDiscovery();

const tests = await discovery.discoverTests('./tests');
```

---

## 实例方法

### `discoverTests(testDir: string, configPath?: string, useCache?: boolean): Promise<DiscoveredTest[]>`

发现指定目录中的所有测试。返回发现的测试对象扁平数组。默认使用缓存结果（如果可用）。

```typescript
const tests = await discovery.discoverTests('./tests');

const testsWithConfig = await discovery.discoverTests('./tests', 'playwright.config.ts');

const freshTests = await discovery.discoverTests('./tests', undefined, false);
```

### `discoverTestsPaginated(testDir: string, options?: PaginationOptions): Promise<PaginatedTestDiscoveryResult>`

分页发现测试。返回包含请求页面的测试子集以及分页元数据的分页结果。

```typescript
const page1 = await discovery.discoverTestsPaginated('./tests', {
  page: 1,
  pageSize: 20,
});

console.log(`第 ${page1.page} 页，共 ${page1.totalPages} 页`);
console.log(`测试总数: ${page1.total}`);
```

### `discoverTestsStructured(testDir: string, configPath?: string, useCache?: boolean): Promise<TestDiscoveryResult>`

发现测试并返回按文件分组的结构化结果，包括 describe 块层级结构。还包含配置验证结果和遇到的任何错误。

```typescript
const result = await discovery.discoverTestsStructured('./tests');

console.log(`文件数: ${result.files.length}`);
console.log(`测试数: ${result.tests.length}`);

if (result.configValidation) {
  console.log(`配置有效: ${result.configValidation.valid}`);
}

if (result.error) {
  console.error(`发现错误: ${result.error}`);
}
```

### `getTestCount(testDir: string): Promise<number>`

获取指定目录中的测试总数。使用轻量级方法从 Playwright JSON 输出中计算 spec 数量，无需构建完整的发现结果。

```typescript
const count = await discovery.getTestCount('./tests');

console.log(`测试总数: ${count}`);
```

### `getTestStats(testDir: string): Promise<TestStats>`

获取聚合的测试统计信息，包括测试总数、文件总数以及按标签和按文件的分类。

```typescript
const stats = await discovery.getTestStats('./tests');

console.log(`测试总数: ${stats.totalTests}`);
console.log(`文件总数: ${stats.totalFiles}`);

for (const [tag, count] of Object.entries(stats.byTag)) {
  console.log(`  @${tag}: ${count} 个测试`);
}
```

### `invalidateCache(testDir?: string): void`

使发现缓存失效。如果提供了 `testDir`，仅使该目录的缓存失效。否则清除整个缓存。

```typescript
discovery.invalidateCache('./tests');

discovery.invalidateCache();
```

### `setLang(lang: Lang): void`

设置配置验证消息的语言。影响 Playwright 配置合并器中使用的错误消息语言。

```typescript
discovery.setLang('zh');

discovery.setLang('en');
```

### `validateProjectPath(projectDir: string): Promise<ConfigValidationResult>`

验证指定项目目录是否包含有效的 Playwright 配置。返回包含解析的配置路径和任何错误消息的验证结果。

```typescript
const validation = await discovery.validateProjectPath('./my-project');

if (validation.valid) {
  console.log(`找到配置: ${validation.configPath}`);
} else {
  console.error(`无效项目: ${validation.error}`);
}
```

---

## 静态方法

### `TestDiscovery.buildGrepPatternForDescribe(describeTitle: string): string`

构建用于匹配特定 describe 块标题的 grep 模式字符串。转义特殊正则字符并将模式锚定到标题开头。

```typescript
const pattern = TestDiscovery.buildGrepPatternForDescribe('登录模块');
```

### `TestDiscovery.buildGrepPatternForTests(tests: DiscoveredTest[]): string`

构建用于通过完整标题匹配多个测试的 grep 模式字符串。在转义特殊正则字符后，使用管道符 `|` 连接所有测试的完整标题。

```typescript
const pattern = TestDiscovery.buildGrepPatternForTests([
  { fullTitle: '登录 > 应该认证成功', id: '', title: '', file: '', line: 0, column: 0, tags: [], annotations: [], projectId: '', projectName: '' },
]);
```

---

## 类型定义

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
