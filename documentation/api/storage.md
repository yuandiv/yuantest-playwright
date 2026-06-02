# StorageProvider API Reference

StorageProvider defines a unified async interface for file system operations. Two implementations are provided: `FilesystemStorage` for real file system access and `MemoryStorage` for in-memory operations (useful for testing). The module also exports `getStorage` and `setStorage` functions for managing the default storage instance.

---

## StorageProvider Interface

The `StorageProvider` interface defines the contract for all storage implementations.

```typescript
interface StorageProvider {
  readJSON<T>(filePath: string): Promise<T | null>;
  writeJSON(filePath: string, data: any): Promise<void>;
  readText(filePath: string): Promise<string | null>;
  writeText(filePath: string, content: string): Promise<void>;
  appendText(filePath: string, content: string): Promise<void>;
  readBuffer(filePath: string): Promise<Buffer | null>;
  writeBuffer(filePath: string, data: Buffer): Promise<void>;
  readDir(dirPath: string): Promise<string[]>;
  exists(filePath: string): Promise<boolean>;
  mkdir(dirPath: string): Promise<void>;
  remove(filePath: string): Promise<void>;
  removeDir(dirPath: string): Promise<void>;
  stat(filePath: string): Promise<fs.Stats | null>;
  copy(src: string, dest: string): Promise<void>;
  readDirWithTypes(dirPath: string): Promise<fs.Dirent[]>;
}
```

---

## Instance Methods

### `readJSON<T>(filePath: string): Promise<T | null>`

Read and parse a JSON file. Returns `null` if the file does not exist or the content is not valid JSON.

```typescript
const config = await storage.readJSON<AppConfig>('./config.json');

if (config) {
  console.log(config.version);
}
```

### `writeJSON(filePath: string, data: any): Promise<void>`

Serialize data as formatted JSON and write to a file. Automatically creates parent directories if they do not exist.

```typescript
await storage.writeJSON('./output/report.json', {
  totalTests: 50,
  passed: 45,
  failed: 5,
});
```

### `readText(filePath: string): Promise<string | null>`

Read a text file as a UTF-8 string. Returns `null` if the file does not exist.

```typescript
const content = await storage.readText('./logs/test.log');

if (content) {
  console.log(content);
}
```

### `writeText(filePath: string, content: string): Promise<void>`

Write a UTF-8 text string to a file. Overwrites existing content. Automatically creates parent directories if they do not exist.

```typescript
await storage.writeText('./output/summary.txt', 'All tests passed.');
```

### `appendText(filePath: string, content: string): Promise<void>`

Append text content to a file. If the file does not exist, it is created. Automatically creates parent directories if they do not exist.

```typescript
await storage.appendText('./logs/test.log', 'Test completed at ' + new Date().toISOString() + '\n');
```

### `readBuffer(filePath: string): Promise<Buffer | null>`

Read a file as a raw Buffer. Returns `null` if the file does not exist.

```typescript
const buffer = await storage.readBuffer('./screenshots/test.png');

if (buffer) {
  console.log(`Screenshot size: ${buffer.length} bytes`);
}
```

### `writeBuffer(filePath: string, data: Buffer): Promise<void>`

Write a raw Buffer to a file. Automatically creates parent directories if they do not exist.

```typescript
await storage.writeBuffer('./output/data.bin', Buffer.from('binary data'));
```

### `readDir(dirPath: string): Promise<string[]>`

List the names of entries in a directory. Returns an empty array if the directory does not exist or is not a directory.

```typescript
const files = await storage.readDir('./test-reports');

for (const file of files) {
  console.log(file);
}
```

### `exists(filePath: string): Promise<boolean>`

Check whether a file or directory exists at the given path.

```typescript
const exists = await storage.exists('./config.json');

if (!exists) {
  await storage.writeJSON('./config.json', defaultConfig);
}
```

### `mkdir(dirPath: string): Promise<void>`

Create a directory and all necessary parent directories (recursive). Does nothing if the directory already exists.

```typescript
await storage.mkdir('./test-reports/run-001');
```

### `remove(filePath: string): Promise<void>`

Remove a file. Does nothing if the file does not exist.

```typescript
await storage.remove('./temp/cache.json');
```

### `removeDir(dirPath: string): Promise<void>`

Recursively remove a directory and all its contents. Does nothing if the directory does not exist.

```typescript
await storage.removeDir('./temp');
```

### `stat(filePath: string): Promise<fs.Stats | null>`

Get file or directory status information. Returns `null` if the path does not exist.

```typescript
const stats = await storage.stat('./report.json');

if (stats) {
  console.log(`File size: ${stats.size} bytes`);
  console.log(`Is directory: ${stats.isDirectory()}`);
}
```

### `copy(src: string, dest: string): Promise<void>`

Copy a file from source to destination. Automatically creates parent directories for the destination. Does nothing if the source file does not exist or is a directory.

```typescript
await storage.copy('./reports/latest.json', './archive/report-2024-05-14.json');
```

### `readDirWithTypes(dirPath: string): Promise<fs.Dirent[]>`

List directory entries with type information (file vs directory). Returns an empty array if the directory does not exist.

```typescript
const entries = await storage.readDirWithTypes('./test-results');

for (const entry of entries) {
  if (entry.isDirectory()) {
    console.log(`[DIR] ${entry.name}`);
  } else {
    console.log(`[FILE] ${entry.name}`);
  }
}
```

---

## FilesystemStorage

`FilesystemStorage` is the default implementation that performs real file system operations using Node.js `fs` module. It also implements `StorageProviderWithResult` for operations that return structured error information.

### Constructor

```typescript
new FilesystemStorage()
```

### Example

```typescript
import { FilesystemStorage } from 'yuantest-playwright';

const storage = new FilesystemStorage();

await storage.writeText('./hello.txt', 'Hello, World!');

const content = await storage.readText('./hello.txt');
```

---

## MemoryStorage

`MemoryStorage` is an in-memory implementation that stores all data in a `Map`. It is useful for testing or scenarios where no file system access is desired.

### Constructor

```typescript
new MemoryStorage()
```

### Additional Methods

#### `clear(): void`

Clear all stored files and directories from memory.

```typescript
import { MemoryStorage } from 'yuantest-playwright';

const storage = new MemoryStorage();

await storage.writeText('./test.txt', 'hello');

storage.clear();

const content = await storage.readText('./test.txt');
```

---

## Module Functions

### `getStorage(): StorageProvider`

Get the default storage instance. If no custom storage has been set, returns a `FilesystemStorage` instance.

```typescript
import { getStorage } from 'yuantest-playwright';

const storage = getStorage();
```

### `setStorage(storage: StorageProvider): void`

Set the default storage instance. This replaces the default `FilesystemStorage` with a custom implementation.

```typescript
import { setStorage, MemoryStorage } from 'yuantest-playwright';

setStorage(new MemoryStorage());
```

---

## Type Definitions

```typescript
interface StorageProvider {
  readJSON<T>(filePath: string): Promise<T | null>;
  writeJSON(filePath: string, data: any): Promise<void>;
  readText(filePath: string): Promise<string | null>;
  writeText(filePath: string, content: string): Promise<void>;
  appendText(filePath: string, content: string): Promise<void>;
  readBuffer(filePath: string): Promise<Buffer | null>;
  writeBuffer(filePath: string, data: Buffer): Promise<void>;
  readDir(dirPath: string): Promise<string[]>;
  exists(filePath: string): Promise<boolean>;
  mkdir(dirPath: string): Promise<void>;
  remove(filePath: string): Promise<void>;
  removeDir(dirPath: string): Promise<void>;
  stat(filePath: string): Promise<fs.Stats | null>;
  copy(src: string, dest: string): Promise<void>;
  readDirWithTypes(dirPath: string): Promise<fs.Dirent[]>;
}

interface StorageProviderWithResult {
  readJSONWithResult<T>(filePath: string): Promise<Result<T>>;
  readTextWithResult(filePath: string): Promise<Result<string>>;
  readBufferWithResult(filePath: string): Promise<Result<Buffer>>;
  readDirWithResult(dirPath: string): Promise<Result<string[]>>;
  statWithResult(filePath: string): Promise<Result<fs.Stats>>;
  removeWithResult(filePath: string): Promise<Result<void>>;
}

class FilesystemStorage implements StorageProvider, StorageProviderWithResult {}

class MemoryStorage implements StorageProvider {
  clear(): void;
}

function getStorage(): StorageProvider;

function setStorage(storage: StorageProvider): void;
```
