# TraceManager API Reference

TraceManager provides trace file management for Playwright test runs, including trace discovery, viewing, merging, and cleanup.

---

## Constructor

```typescript
new TraceManager(config: TraceConfig, baseDir?: string, storage?: StorageProvider)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `config` | `TraceConfig` | — | Trace configuration |
| `baseDir` | `string` | `'./traces'` | Base directory for trace files, overridden by `config.outputDir` if set |
| `storage` | `StorageProvider` | `getStorage()` | Storage provider instance |

### Example

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

## Instance Methods

### `initialize(): Promise<void>`

Initialize the TraceManager. Ensures the trace output directory exists, creating it if necessary. This method is called automatically during construction and can be awaited to guarantee initialization is complete.

```typescript
await traceManager.initialize();
```

### `discoverTraces(runId?: string): Promise<TraceFile[]>`

Discover all trace files in the trace directory. Scans for `.zip` and `.trace` files recursively. Optionally filter by a specific run ID.

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `runId` | `string` | — | Optional run ID to filter traces by a specific run directory |

```typescript
const allTraces = await traceManager.discoverTraces();
const runTraces = await traceManager.discoverTraces('run_20240514_001');
```

### `getTrace(testId: string, runId?: string): Promise<TraceFile | null>`

Get a specific trace file by test ID. Searches through discovered traces and matches by `testId` or file path inclusion. Returns `null` if not found.

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `testId` | `string` | — | Test ID to search for |
| `runId` | `string` | — | Optional run ID to narrow the search scope |

```typescript
const trace = await traceManager.getTrace('auth.spec.ts::login test');
if (trace) {
  console.log(`Found trace: ${trace.filePath}`);
}
```

### `getTraceContent(filePath: string): Promise<Buffer | null>`

Read the binary content of a trace file. Returns the file content as a Buffer, or `null` if the file does not exist.

| Parameter | Type | Description |
|------|------|------|
| `filePath` | `string` | Absolute path to the trace file |

```typescript
const content = await traceManager.getTraceContent('/path/to/trace.zip');
if (content) {
  console.log(`Trace size: ${content.length} bytes`);
}
```

### `deleteTrace(filePath: string): Promise<boolean>`

Delete a trace file. Returns `true` if the file was successfully deleted, `false` if the file did not exist or deletion failed.

| Parameter | Type | Description |
|------|------|------|
| `filePath` | `string` | Absolute path to the trace file to delete |

```typescript
const deleted = await traceManager.deleteTrace('/path/to/trace.zip');
console.log(deleted ? 'Trace deleted' : 'Trace not found or deletion failed');
```

### `cleanTraces(olderThanMs?: number): Promise<number>`

Clean up trace files older than the specified duration. Returns the number of deleted trace files.

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `olderThanMs` | `number` | `604800000` (7 days) | Age threshold in milliseconds |

```typescript
const deletedCount = await traceManager.cleanTraces(3 * 24 * 60 * 60 * 1000);
console.log(`Deleted ${deletedCount} traces older than 3 days`);
```

### `getTraceStats(): Promise<TraceStats>`

Get statistics about all trace files, including total count, total size, browser distribution, and recent traces.

```typescript
const stats = await traceManager.getTraceStats();
console.log(`Total traces: ${stats.totalTraces}`);
console.log(`Total size: ${stats.totalSize} bytes`);
console.log(`By browser:`, stats.byBrowser);
console.log(`Recent traces: ${stats.recentTraces.length}`);
```

**Return Type:**

| Field | Type | Description |
|------|------|------|
| `totalTraces` | `number` | Total number of trace files |
| `totalSize` | `number` | Total size of all trace files in bytes |
| `byBrowser` | `Record<string, number>` | Trace count grouped by browser |
| `recentTraces` | `TraceFile[]` | Up to 20 most recent trace files |

### `openTraceViewer(tracePath: string, port?: number): Promise<string>`

Open the Playwright Trace Viewer for a specific trace file. Spawns a local HTTP server and returns the viewer URL. If the viewer does not respond within 5 seconds, falls back to the specified port URL.

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `tracePath` | `string` | — | Path to the trace file |
| `port` | `number` | `9323` | Port for the trace viewer server |

```typescript
const viewerUrl = await traceManager.openTraceViewer('/path/to/trace.zip', 9323);
console.log(`Trace viewer available at: ${viewerUrl}`);
```

### `mergeTraces(tracePaths: string[], outputPath: string): Promise<string>`

Merge multiple trace files into a single trace file using the Playwright CLI. Returns the output path of the merged trace.

| Parameter | Type | Description |
|------|------|------|
| `tracePaths` | `string[]` | Array of trace file paths to merge |
| `outputPath` | `string` | Output path for the merged trace file |

```typescript
const mergedPath = await traceManager.mergeTraces(
  ['/path/to/trace1.zip', '/path/to/trace2.zip'],
  '/path/to/merged-trace.zip'
);
console.log(`Merged trace saved to: ${mergedPath}`);
```

### `getTraceConfigForPlaywright(): Record<string, unknown>`

Get the trace configuration formatted for Playwright's `use` options. Returns `{ trace: 'off' }` if tracing is disabled, otherwise returns the configured trace mode.

```typescript
const config = traceManager.getTraceConfigForPlaywright();
// { trace: 'on-first-retry' }
```

---

## Type Definitions

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
