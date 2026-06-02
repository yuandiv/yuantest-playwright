# ArtifactManager API 参考

ArtifactManager 管理测试产物，如截图、视频、Trace 和下载文件。它提供了测试运行期间生成的所有产物的发现、检索、清理和统计功能。

---

## 构造函数

```typescript
new ArtifactManager(config: ArtifactConfig, baseDir: string, storage?: StorageProvider)
```

### 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `config` | `ArtifactConfig` | | 产物配置 |
| `baseDir` | `string` | | 产物存储的基础目录，如果设置了 `config.outputDir` 则会被覆盖 |
| `storage` | `StorageProvider` | 自动创建 | 自定义存储提供者实例 |

### 示例

```typescript
import { ArtifactManager } from 'yuantest-playwright';

const manager = new ArtifactManager(
  {
    enabled: true,
    screenshots: 'only-on-failure',
    videos: 'retain-on-failure',
    downloads: false,
  },
  './test-reports/artifacts'
);

await manager.initialize();
```

---

## 实例方法

### `discoverArtifacts(runId?: string): Promise<Artifact[]>`

扫描产物目录并发现所有产物。如果提供了 `runId`，则只扫描该次运行的子目录。返回发现的产物对象数组。

```typescript
const allArtifacts = await manager.discoverArtifacts();

const runArtifacts = await manager.discoverArtifacts('run-20240514-001');
```

### `getArtifact(id: string, runId?: string): Promise<Artifact | null>`

通过 ID 获取特定产物。如果尚未发现任何产物，将自动调用 `discoverArtifacts`。如果直接按 ID 未找到，会回退到按文件路径匹配。

```typescript
const artifact = await manager.getArtifact('abc123');

const artifactWithRun = await manager.getArtifact('abc123', 'run-20240514-001');
```

### `getArtifactContent(filePath: string): Promise<Buffer | null>`

读取产物文件的二进制内容。如果文件不存在则返回 `null`。

```typescript
const content = await manager.getArtifactContent('/path/to/screenshot.png');

if (content) {
  console.log(`读取了 ${content.length} 字节`);
}
```

### `deleteArtifact(filePath: string): Promise<boolean>`

删除产物文件。成功删除返回 `true`，文件不存在返回 `false`。

```typescript
const deleted = await manager.deleteArtifact('/path/to/screenshot.png');
```

### `cleanArtifacts(olderThan?: number): Promise<number>`

删除超过指定阈值的旧产物文件。`olderThan` 参数单位为毫秒，默认为 7 天（`7 * 24 * 60 * 60 * 1000`）。清理后也会删除空目录。返回删除的文件数量。

```typescript
const deletedCount = await manager.cleanArtifacts();

const deletedOld = await manager.cleanArtifacts(14 * 24 * 60 * 60 * 1000);
```

### `getArtifactsByType(type: ArtifactType, runId?: string): Promise<Artifact[]>`

按类型筛选已发现的产物。如果尚未发现任何产物，将自动调用 `discoverArtifacts`。

```typescript
const screenshots = await manager.getArtifactsByType('screenshot');

const videos = await manager.getArtifactsByType('video', 'run-20240514-001');
```

### `getArtifactsByTest(testId: string, runId?: string): Promise<Artifact[]>`

按测试 ID 使用部分匹配筛选已发现的产物。如果尚未发现任何产物，将自动调用 `discoverArtifacts`。

```typescript
const testArtifacts = await manager.getArtifactsByTest('login-test');

const runTestArtifacts = await manager.getArtifactsByTest('login-test', 'run-20240514-001');
```

### `getArtifactStats(runId?: string): Promise<ArtifactStats>`

获取已发现产物的聚合统计信息，包括总数、总大小和按类型的分类。如果尚未发现任何产物，将自动调用 `discoverArtifacts`。

```typescript
const stats = await manager.getArtifactStats();

console.log(`总数: ${stats.totalArtifacts}`);
console.log(`大小: ${manager.formatSize(stats.totalSize)}`);
console.log(`截图: ${stats.byType.screenshot || 0}`);
```

### `formatSize(bytes: number): string`

将字节数格式化为人类可读的大小字符串，使用适当的单位（B、KB、MB、GB、TB）。

```typescript
console.log(manager.formatSize(1024));
console.log(manager.formatSize(1048576));
console.log(manager.formatSize(0));
```

---

## 类型定义

```typescript
type ArtifactType = 'screenshot' | 'video' | 'download' | 'trace' | 'attachment';

interface ArtifactConfig {
  enabled: boolean;
  screenshots: 'off' | 'on' | 'only-on-failure';
  videos: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  downloads?: boolean;
  outputDir?: string;
  maxFileSize?: number;
}

interface Artifact {
  id: string;
  runId: string;
  testId: string;
  testName: string;
  type: ArtifactType;
  filePath: string;
  fileName: string;
  size: number;
  mimeType: string;
  timestamp: number;
  browser: BrowserType;
}

type BrowserType = 'chromium' | 'firefox' | 'webkit';

interface ArtifactStats {
  total: number;
  totalArtifacts: number;
  byType: Record<string, number>;
  totalSize: number;
  byTypeSize: Record<string, number>;
}
```
