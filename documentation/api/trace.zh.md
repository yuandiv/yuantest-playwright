# TraceManager API 参考

TraceManager 提供 Playwright 测试运行的 Trace 文件管理功能，包括 Trace 发现、查看、合并和清理。

---

## 构造函数

```typescript
new TraceManager(config: TraceConfig, baseDir?: string, storage?: StorageProvider)
```

### 参数

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `config` | `TraceConfig` | — | Trace 配置 |
| `baseDir` | `string` | `'./traces'` | Trace 文件的基础目录，若设置了 `config.outputDir` 则被覆盖 |
| `storage` | `StorageProvider` | `getStorage()` | 存储提供者实例 |

### 示例

```typescript
import { TraceManager } from 'yuantest-playwright';

const traceManager = new TraceManager(
  {
    enabled: true,
    mode: 'on-first-retry',
    screenshots: true,
    snapshots: true,
    sources: true,
    attachments: true,
  },
  './test-results/traces'
);

await traceManager.initialize();
```

---

## 实例方法

### `initialize(): Promise<void>`

初始化 TraceManager。确保 Trace 输出目录存在，若不存在则创建。此方法在构造时自动调用，可以通过 await 确保初始化完成。

```typescript
await traceManager.initialize();
```

### `discoverTraces(runId?: string): Promise<TraceFile[]>`

发现 Trace 目录中的所有 Trace 文件。递归扫描 `.zip` 和 `.trace` 文件。可通过运行 ID 过滤特定运行的 Trace。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `runId` | `string` | — | 可选的运行 ID，用于过滤特定运行目录的 Trace |

```typescript
const allTraces = await traceManager.discoverTraces();
const runTraces = await traceManager.discoverTraces('run_20240514_001');
```

### `getTrace(testId: string, runId?: string): Promise<TraceFile | null>`

通过测试 ID 获取特定的 Trace 文件。搜索已发现的 Trace，通过 `testId` 或文件路径包含关系匹配。未找到时返回 `null`。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `testId` | `string` | — | 要搜索的测试 ID |
| `runId` | `string` | — | 可选的运行 ID，用于缩小搜索范围 |

```typescript
const trace = await traceManager.getTrace('auth.spec.ts::login test');
if (trace) {
  console.log(`找到 Trace: ${trace.filePath}`);
}
```

### `getTraceContent(filePath: string): Promise<Buffer | null>`

读取 Trace 文件的二进制内容。返回文件内容的 Buffer，若文件不存在则返回 `null`。

| 参数 | 类型 | 描述 |
|------|------|------|
| `filePath` | `string` | Trace 文件的绝对路径 |

```typescript
const content = await traceManager.getTraceContent('/path/to/trace.zip');
if (content) {
  console.log(`Trace 大小: ${content.length} 字节`);
}
```

### `deleteTrace(filePath: string): Promise<boolean>`

删除一个 Trace 文件。成功删除返回 `true`，文件不存在或删除失败返回 `false`。

| 参数 | 类型 | 描述 |
|------|------|------|
| `filePath` | `string` | 要删除的 Trace 文件的绝对路径 |

```typescript
const deleted = await traceManager.deleteTrace('/path/to/trace.zip');
console.log(deleted ? 'Trace 已删除' : 'Trace 未找到或删除失败');
```

### `cleanTraces(olderThanMs?: number): Promise<number>`

清理超过指定时间的 Trace 文件。返回已删除的 Trace 文件数量。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `olderThanMs` | `number` | `604800000`（7 天） | 时间阈值，单位为毫秒 |

```typescript
const deletedCount = await traceManager.cleanTraces(3 * 24 * 60 * 60 * 1000);
console.log(`已删除 ${deletedCount} 个超过 3 天的 Trace`);
```

### `getTraceStats(): Promise<TraceStats>`

获取所有 Trace 文件的统计信息，包括总数、总大小、浏览器分布和最近的 Trace。

```typescript
const stats = await traceManager.getTraceStats();
console.log(`Trace 总数: ${stats.totalTraces}`);
console.log(`总大小: ${stats.totalSize} 字节`);
console.log(`按浏览器分布:`, stats.byBrowser);
console.log(`最近 Trace: ${stats.recentTraces.length}`);
```

**返回类型：**

| 字段 | 类型 | 描述 |
|------|------|------|
| `totalTraces` | `number` | Trace 文件总数 |
| `totalSize` | `number` | 所有 Trace 文件的总大小（字节） |
| `byBrowser` | `Record<string, number>` | 按浏览器分组的 Trace 数量 |
| `recentTraces` | `TraceFile[]` | 最多 20 个最近的 Trace 文件 |

### `openTraceViewer(tracePath: string, port?: number): Promise<string>`

为指定的 Trace 文件打开 Playwright Trace Viewer。启动本地 HTTP 服务器并返回查看器 URL。若查看器在 5 秒内未响应，则回退到指定端口的 URL。

| 参数 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `tracePath` | `string` | — | Trace 文件路径 |
| `port` | `number` | `9323` | Trace 查看器服务器端口 |

```typescript
const viewerUrl = await traceManager.openTraceViewer('/path/to/trace.zip', 9323);
console.log(`Trace 查看器地址: ${viewerUrl}`);
```

### `mergeTraces(tracePaths: string[], outputPath: string): Promise<string>`

使用 Playwright CLI 将多个 Trace 文件合并为一个。返回合并后 Trace 的输出路径。

| 参数 | 类型 | 描述 |
|------|------|------|
| `tracePaths` | `string[]` | 要合并的 Trace 文件路径数组 |
| `outputPath` | `string` | 合并后 Trace 文件的输出路径 |

```typescript
const mergedPath = await traceManager.mergeTraces(
  ['/path/to/trace1.zip', '/path/to/trace2.zip'],
  '/path/to/merged-trace.zip'
);
console.log(`合并后的 Trace 已保存至: ${mergedPath}`);
```

### `getTraceConfigForPlaywright(): Record<string, unknown>`

获取格式化为 Playwright `use` 选项的 Trace 配置。若禁用 Trace 则返回 `{ trace: 'off' }`，否则返回配置的 Trace 模式。

```typescript
const config = traceManager.getTraceConfigForPlaywright();
// { trace: 'on-first-retry' }
```

---

## 类型定义

```typescript
interface TraceConfig {
  enabled: boolean;
  mode: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  screenshots: boolean;
  snapshots: boolean;
  sources: boolean;
  attachments: boolean;
  outputDir?: string;
}

interface TraceFile {
  runId: string;
  testId: string;
  testName: string;
  filePath: string;
  size: number;
  timestamp: number;
  browser: BrowserType;
}

type BrowserType = 'chromium' | 'firefox' | 'webkit';

interface TraceStats {
  totalTraces: number;
  totalSize: number;
  byBrowser: Record<string, number>;
  recentTraces: TraceFile[];
}
```
