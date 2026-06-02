# ArtifactManager API Reference

ArtifactManager manages test artifacts such as screenshots, videos, traces, and downloads. It provides discovery, retrieval, cleanup, and statistics capabilities for all artifacts generated during test runs.

---

## Constructor

```typescript
new ArtifactManager(config: ArtifactConfig, baseDir: string, storage?: StorageProvider)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `config` | `ArtifactConfig` | | Artifact configuration |
| `baseDir` | `string` | | Base directory for artifact storage, overridden by `config.outputDir` if set |
| `storage` | `StorageProvider` | Auto-created | Custom storage provider instance |

### Example

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

## Instance Methods

### `discoverArtifacts(runId?: string): Promise<Artifact[]>`

Scan the artifact directory and discover all artifacts. If `runId` is provided, only scans the subdirectory for that run. Returns an array of discovered artifact objects.

```typescript
const allArtifacts = await manager.discoverArtifacts();

const runArtifacts = await manager.discoverArtifacts('run-20240514-001');
```

### `getArtifact(id: string, runId?: string): Promise<Artifact | null>`

Get a specific artifact by its ID. If no artifacts have been discovered yet, it will automatically call `discoverArtifacts`. Falls back to matching by file path if the ID is not found directly.

```typescript
const artifact = await manager.getArtifact('abc123');

const artifactWithRun = await manager.getArtifact('abc123', 'run-20240514-001');
```

### `getArtifactContent(filePath: string): Promise<Buffer | null>`

Read the binary content of an artifact file. Returns `null` if the file does not exist.

```typescript
const content = await manager.getArtifactContent('/path/to/screenshot.png');

if (content) {
  console.log(`Read ${content.length} bytes`);
}
```

### `deleteArtifact(filePath: string): Promise<boolean>`

Delete an artifact file. Returns `true` if the file was successfully deleted, `false` if the file does not exist.

```typescript
const deleted = await manager.deleteArtifact('/path/to/screenshot.png');
```

### `cleanArtifacts(olderThan?: number): Promise<number>`

Remove artifact files older than the specified threshold. The `olderThan` parameter is in milliseconds and defaults to 7 days (`7 * 24 * 60 * 60 * 1000`). Empty directories are also removed after cleaning. Returns the number of deleted files.

```typescript
const deletedCount = await manager.cleanArtifacts();

const deletedOld = await manager.cleanArtifacts(14 * 24 * 60 * 60 * 1000);
```

### `getArtifactsByType(type: ArtifactType, runId?: string): Promise<Artifact[]>`

Filter discovered artifacts by type. If no artifacts have been discovered yet, it will automatically call `discoverArtifacts`.

```typescript
const screenshots = await manager.getArtifactsByType('screenshot');

const videos = await manager.getArtifactsByType('video', 'run-20240514-001');
```

### `getArtifactsByTest(testId: string, runId?: string): Promise<Artifact[]>`

Filter discovered artifacts by test ID using partial matching. If no artifacts have been discovered yet, it will automatically call `discoverArtifacts`.

```typescript
const testArtifacts = await manager.getArtifactsByTest('login-test');

const runTestArtifacts = await manager.getArtifactsByTest('login-test', 'run-20240514-001');
```

### `getArtifactStats(runId?: string): Promise<ArtifactStats>`

Get aggregate statistics about discovered artifacts, including total count, total size, and breakdowns by type. If no artifacts have been discovered yet, it will automatically call `discoverArtifacts`.

```typescript
const stats = await manager.getArtifactStats();

console.log(`Total: ${stats.totalArtifacts}`);
console.log(`Size: ${manager.formatSize(stats.totalSize)}`);
console.log(`Screenshots: ${stats.byType.screenshot || 0}`);
```

### `formatSize(bytes: number): string`

Format a byte count into a human-readable size string with appropriate units (B, KB, MB, GB, TB).

```typescript
console.log(manager.formatSize(1024));
console.log(manager.formatSize(1048576));
console.log(manager.formatSize(0));
```

---

## Type Definitions

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
