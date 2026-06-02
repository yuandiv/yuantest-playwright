# TagManager API 参考

TagManager 提供测试标签扫描和管理功能，通过 `@tag()` 调用和内置简写标签（如 `@smoke`、`@regression`）检测测试文件中的标签，并支持基于标签的测试过滤和报告生成。

---

## 构造函数

```typescript
new TagManager(config?: Partial<TagConfig>, storage?: StorageProvider)
```

### 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `config` | `Partial<TagConfig>` | — | 部分标签配置，与默认值合并 |
| `storage` | `StorageProvider` | `getStorage()` | 存储提供者实例 |

### 默认配置

| 字段 | 默认值 |
|-------|---------------|
| `enabled` | `true` |
| `include` | `undefined` |
| `exclude` | `undefined` |
| `require` | `undefined` |

### 示例

```typescript
import { TagManager } from 'yuantest-playwright';

const tagManager = new TagManager({
  enabled: true,
  include: ['smoke', 'critical'],
  exclude: ['flaky'],
});

const tags = await tagManager.scanDirectory('./tests');
```

---

## 实例方法

### `scanDirectory(testDir: string): Promise<TagInfo[]>`

扫描目录中所有测试文件的标签。递归遍历目录，查找 `.ts` 文件并逐一扫描标签模式。

| 参数 | 类型 | 描述 |
|------|------|------|
| `testDir` | `string` | 要扫描的测试目录路径 |

```typescript
const tags = await tagManager.scanDirectory('./tests');
console.log(`发现 ${tags.length} 个标签`);
```

### `scanFile(filePath: string): Promise<void>`

扫描单个测试文件的标签。检测 `@tag('name')` 模式和内置简写标签（如 `@smoke`、`@regression`、`@p0`、`@critical` 等）。结果存储在内部，可通过 `getTags()` 访问。

| 参数 | 类型 | 描述 |
|------|------|------|
| `filePath` | `string` | 要扫描的测试文件路径 |

```typescript
await tagManager.scanFile('./tests/login.spec.ts');
const tags = tagManager.getTags();
```

### `getTags(): TagInfo[]`

获取所有已发现的标签。

```typescript
const tags = tagManager.getTags();
for (const tag of tags) {
  console.log(`标签: ${tag.name}, 测试数: ${tag.testIds.length}`);
}
```

### `getTestsByTag(tagName: string): string[]`

获取与指定标签关联的所有测试 ID。

| 参数 | 类型 | 描述 |
|------|------|------|
| `tagName` | `string` | 要查找的标签名称 |

```typescript
const smokeTests = tagManager.getTestsByTag('smoke');
console.log(`冒烟测试数: ${smokeTests.length}`);
```

### `getTagsForTest(testId: string): string[]`

获取与指定测试关联的所有标签。

| 参数 | 类型 | 描述 |
|------|------|------|
| `testId` | `string` | 要查找的测试 ID |

```typescript
const tags = tagManager.getTagsForTest('auth.spec.ts::login test');
console.log(`测试标签: ${tags.join(', ')}`);
```

### `getFilteredTests(allTestIds: string[], include?: string[], exclude?: string[], require?: string[]): string[]`

基于标签条件过滤测试 ID 列表。支持三种过滤模式：

- **include**：仅保留具有指定标签中至少一个的测试（OR 逻辑）
- **exclude**：移除具有指定标签中任一个的测试
- **require**：仅保留具有所有指定标签的测试（AND 逻辑）

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `allTestIds` | `string[]` | — | 要过滤的完整测试 ID 列表 |
| `include` | `string[]` | — | 要包含的标签（OR 逻辑） |
| `exclude` | `string[]` | — | 要排除的标签 |
| `require` | `string[]` | — | 必须全部存在的标签（AND 逻辑） |

```typescript
const allTests = ['test1', 'test2', 'test3', 'test4'];

const smokeTests = tagManager.getFilteredTests(allTests, ['smoke']);

const nonFlakyTests = tagManager.getFilteredTests(allTests, undefined, ['flaky']);

const criticalSmoke = tagManager.getFilteredTests(allTests, undefined, undefined, ['critical', 'smoke']);
```

### `buildGrepPattern(include?: string[], exclude?: string[]): string`

从标签列表构建 grep 模式字符串，适用于 Playwright 的 `--grep` 选项。使用 `|` 连接包含标签（OR 逻辑）。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `include` | `string[]` | — | 要包含在 grep 模式中的标签 |
| `exclude` | `string[]` | — | 要排除的标签（保留供未来使用） |

```typescript
const pattern = tagManager.buildGrepPattern(['smoke', 'critical']);
console.log(pattern);
// "smoke|critical"
```

### `getSummary(): TagSummary`

获取所有已发现标签的摘要，包括标签总数、带标签测试总数和按数量排序的标签统计。

```typescript
const summary = tagManager.getSummary();
console.log(`标签总数: ${summary.totalTags}`);
console.log(`带标签测试总数: ${summary.totalTaggedTests}`);
for (const tag of summary.tags) {
  console.log(`  ${tag.name}: ${tag.count} 个测试`);
}
```

**返回类型：**

| 字段 | 类型 | 描述 |
|------|------|------|
| `totalTags` | `number` | 唯一标签总数 |
| `totalTaggedTests` | `number` | 至少有一个标签的测试总数 |
| `tags` | `Array<{ name: string; count: number }>` | 按数量降序排列的标签统计 |

### `generateTagReport(outputPath: string): Promise<string>`

生成所有已发现标签的 JSON 报告。报告包含时间戳、摘要和详细标签信息。返回输出文件路径。

| 参数 | 类型 | 描述 |
|------|------|------|
| `outputPath` | `string` | 报告 JSON 文件的写入路径 |

```typescript
const reportPath = await tagManager.generateTagReport('./tag-report.json');
console.log(`报告已保存至: ${reportPath}`);
```

**报告格式：**

```json
{
  "generatedAt": "2024-05-14T10:30:00.000Z",
  "summary": {
    "totalTags": 5,
    "totalTaggedTests": 12,
    "tags": [
      { "name": "smoke", "count": 8 },
      { "name": "critical", "count": 4 },
      { "name": "regression", "count": 3 }
    ]
  },
  "tags": [
    {
      "name": "smoke",
      "testIds": ["auth.spec.ts::login test", "auth.spec.ts::register test"]
    }
  ]
}
```

---

## 支持的简写标签

以下简写标签无需使用 `@tag()` 语法即可自动识别：

| 标签 | 描述 |
|-----|------|
| `@smoke` | 冒烟测试 |
| `@regression` | 回归测试 |
| `@critical` | 关键路径测试 |
| `@p0` | 优先级 0 测试 |
| `@p1` | 优先级 1 测试 |
| `@p2` | 优先级 2 测试 |
| `@sanity` | 健全性检查测试 |
| `@e2e` | 端到端测试 |
| `@unit` | 单元测试 |
| `@integration` | 集成测试 |
| `@slow` | 慢速测试 |
| `@fast` | 快速测试 |
| `@flaky` | 不稳定测试 |

---

## 类型定义

```typescript
interface TagConfig {
  enabled: boolean;
  include?: string[];
  exclude?: string[];
  require?: string[];
}

interface TagInfo {
  name: string;
  testIds: string[];
  description?: string;
}

interface TagSummary {
  totalTags: number;
  totalTaggedTests: number;
  tags: Array<{ name: string; count: number }>;
}
```
