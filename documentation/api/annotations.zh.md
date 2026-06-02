# AnnotationManager API 参考

AnnotationManager 提供测试注解扫描和管理功能，检测测试文件中的 Playwright 注解修饰符（`skip`、`fail`、`slow`、`fixme` 等），并支持基于注解的测试过滤和报告生成。

---

## 构造函数

```typescript
new AnnotationManager(config?: Partial<AnnotationConfig>, storage?: StorageProvider)
```

### 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `config` | `Partial<AnnotationConfig>` | — | 部分注解配置，与默认值合并 |
| `storage` | `StorageProvider` | `getStorage()` | 存储提供者实例 |

### 默认配置

| 字段 | 默认值 |
|-------|---------------|
| `enabled` | `true` |
| `respectSkip` | `true` |
| `respectOnly` | `true` |
| `respectFail` | `true` |
| `respectSlow` | `false` |
| `respectFixme` | `true` |
| `customAnnotations` | `{}` |

### 示例

```typescript
import { AnnotationManager } from 'yuantest-playwright';

const annotationManager = new AnnotationManager({
  enabled: true,
  respectSkip: true,
  respectFail: true,
  respectSlow: true,
});

const annotations = await annotationManager.scanDirectory('./tests');
```

---

## 实例方法

### `scanDirectory(testDir: string): Promise<Annotation[]>`

扫描目录中所有测试文件的注解。递归遍历目录，查找 `.ts`、`.spec.ts` 和 `.test.ts` 文件并逐一扫描注解模式。

| 参数 | 类型 | 描述 |
|------|------|------|
| `testDir` | `string` | 要扫描的测试目录路径 |

```typescript
const annotations = await annotationManager.scanDirectory('./tests');
console.log(`发现 ${annotations.length} 个注解`);
```

### `scanFile(filePath: string): Promise<Annotation[]>`

扫描单个测试文件的注解。检测 Playwright 修饰符模式（如 `test.skip()`、`test.fail()`）和基于注释的注解（如 `@skip`、`@fail`）。

| 参数 | 类型 | 描述 |
|------|------|------|
| `filePath` | `string` | 要扫描的测试文件路径 |

```typescript
const annotations = await annotationManager.scanFile('./tests/login.spec.ts');
for (const annotation of annotations) {
  console.log(`${annotation.type}: ${annotation.testName} 在 ${annotation.file}`);
}
```

### `getAnnotationsByType(type: AnnotationType): Annotation[]`

获取指定类型的所有注解。

| 参数 | 类型 | 描述 |
|------|------|------|
| `type` | `AnnotationType` | 要过滤的注解类型 |

```typescript
const skipAnnotations = annotationManager.getAnnotationsByType('skip');
const failAnnotations = annotationManager.getAnnotationsByType('fail');
```

### `getAnnotationsByFile(file: string): Annotation[]`

获取指定文件中的所有注解。

| 参数 | 类型 | 描述 |
|------|------|------|
| `file` | `string` | 要过滤的文件路径 |

```typescript
const fileAnnotations = annotationManager.getAnnotationsByFile('./tests/login.spec.ts');
```

### `getSummary(): AnnotationSummary`

获取所有已扫描注解的摘要，包括按类型和按文件分组的统计。

```typescript
const summary = annotationManager.getSummary();
console.log(`注解总数: ${summary.total}`);
console.log('按类型:', summary.byType);
console.log('按文件:', summary.byFile);
```

**返回类型：**

| 字段 | 类型 | 描述 |
|------|------|------|
| `total` | `number` | 注解总数 |
| `byType` | `Record<AnnotationType, number>` | 按类型分组的注解数量 |
| `byFile` | `Record<string, number>` | 按文件分组的注解数量 |

### `shouldSkipTest(testId: string): boolean`

检查测试是否应基于其注解被跳过。若测试具有 `skip` 注解（且 `respectSkip` 已启用）、`fixme` 注解（且 `respectFixme` 已启用）或 action 为 `'skip'` 的自定义注解，则返回 `true`。

| 参数 | 类型 | 描述 |
|------|------|------|
| `testId` | `string` | 要检查的测试 ID |

```typescript
if (annotationManager.shouldSkipTest('auth.spec.ts::login test')) {
  console.log('此测试应被跳过');
}
```

### `shouldExpectFail(testId: string): boolean`

检查测试是否预期失败。若测试具有 `fail` 注解（且 `respectFail` 已启用）或 action 为 `'fail'` 的自定义注解，则返回 `true`。

| 参数 | 类型 | 描述 |
|------|------|------|
| `testId` | `string` | 要检查的测试 ID |

```typescript
if (annotationManager.shouldExpectFail('auth.spec.ts::broken test')) {
  console.log('此测试预期失败');
}
```

### `isSlowTest(testId: string): boolean`

检查测试是否被标记为慢速测试。若测试具有 `slow` 注解且 `respectSlow` 已启用，则返回 `true`。

| 参数 | 类型 | 描述 |
|------|------|------|
| `testId` | `string` | 要检查的测试 ID |

```typescript
if (annotationManager.isSlowTest('auth.spec.ts::heavy test')) {
  console.log('此测试被标记为慢速测试');
}
```

### `getPlaywrightAnnotations(): Record<string, unknown>`

获取格式化为 Playwright 兼容注解标志的注解配置。返回一个对象，将所有受尊重的注解类型和 action 为 `'skip'` 的自定义注解映射为 `true`。

```typescript
const playwrightAnnotations = annotationManager.getPlaywrightAnnotations();
// { skip: true, fixme: true }
```

### `generateAnnotationReport(outputPath: string): Promise<string>`

生成所有已扫描注解的 JSON 报告。报告包含时间戳、摘要和详细注解列表。返回输出文件路径。

| 参数 | 类型 | 描述 |
|------|------|------|
| `outputPath` | `string` | 报告 JSON 文件的写入路径 |

```typescript
const reportPath = await annotationManager.generateAnnotationReport('./annotation-report.json');
console.log(`报告已保存至: ${reportPath}`);
```

**报告格式：**

```json
{
  "generatedAt": "2024-05-14T10:30:00.000Z",
  "summary": {
    "total": 5,
    "byType": { "skip": 3, "fail": 2 },
    "byFile": { "login.spec.ts": 2, "register.spec.ts": 3 }
  },
  "annotations": [
    {
      "type": "skip",
      "testName": "login test",
      "file": "tests/login.spec.ts",
      "description": "Skipping due to API changes"
    }
  ]
}
```

---

## 类型定义

```typescript
type AnnotationType =
  | 'skip'
  | 'only'
  | 'fail'
  | 'slow'
  | 'fixme'
  | 'todo'
  | 'serial'
  | 'parallel';

interface Annotation {
  type: AnnotationType;
  description?: string;
  testId: string;
  testName: string;
  file: string;
}

interface AnnotationConfig {
  enabled: boolean;
  respectSkip: boolean;
  respectOnly: boolean;
  respectFail: boolean;
  respectSlow: boolean;
  respectFixme: boolean;
  customAnnotations: Record<string, { action: 'skip' | 'fail' | 'slow' | 'mark' }>;
}

interface AnnotationSummary {
  total: number;
  byType: Record<AnnotationType, number>;
  byFile: Record<string, number>;
}
```
