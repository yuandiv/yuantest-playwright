# StorageProvider API 参考

StorageProvider 定义了文件系统操作的统一异步接口。提供两种实现：`FilesystemStorage` 用于真实文件系统访问，`MemoryStorage` 用于内存操作（适用于测试）。模块还导出 `getStorage` 和 `setStorage` 函数用于管理默认存储实例。

---

## StorageProvider 接口

`StorageProvider` 接口定义了所有存储实现的契约。

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

## 实例方法

### `readJSON<T>(filePath: string): Promise<T | null>`

读取并解析 JSON 文件。如果文件不存在或内容不是有效的 JSON，返回 `null`。

```typescript
const config = await storage.readJSON<AppConfig>('./config.json');

if (config) {
  console.log(config.version);
}
```

### `writeJSON(filePath: string, data: any): Promise<void>`

将数据序列化为格式化 JSON 并写入文件。如果父目录不存在则自动创建。

```typescript
await storage.writeJSON('./output/report.json', {
  totalTests: 50,
  passed: 45,
  failed: 5,
});
```

### `readText(filePath: string): Promise<string | null>`

读取文本文件为 UTF-8 字符串。如果文件不存在返回 `null`。

```typescript
const content = await storage.readText('./logs/test.log');

if (content) {
  console.log(content);
}
```

### `writeText(filePath: string, content: string): Promise<void>`

将 UTF-8 文本字符串写入文件。覆盖已有内容。如果父目录不存在则自动创建。

```typescript
await storage.writeText('./output/summary.txt', 'All tests passed.');
```

### `appendText(filePath: string, content: string): Promise<void>`

向文件追加文本内容。如果文件不存在则创建。如果父目录不存在则自动创建。

```typescript
await storage.appendText('./logs/test.log', 'Test completed at ' + new Date().toISOString() + '\n');
```

### `readBuffer(filePath: string): Promise<Buffer | null>`

读取文件为原始 Buffer。如果文件不存在返回 `null`。

```typescript
const buffer = await storage.readBuffer('./screenshots/test.png');

if (buffer) {
  console.log(`Screenshot size: ${buffer.length} bytes`);
}
```

### `writeBuffer(filePath: string, data: Buffer): Promise<void>`

将原始 Buffer 写入文件。如果父目录不存在则自动创建。

```typescript
await storage.writeBuffer('./output/data.bin', Buffer.from('binary data'));
```

### `readDir(dirPath: string): Promise<string[]>`

列出目录中的条目名称。如果目录不存在或不是目录，返回空数组。

```typescript
const files = await storage.readDir('./test-reports');

for (const file of files) {
  console.log(file);
}
```

### `exists(filePath: string): Promise<boolean>`

检查给定路径的文件或目录是否存在。

```typescript
const exists = await storage.exists('./config.json');

if (!exists) {
  await storage.writeJSON('./config.json', defaultConfig);
}
```

### `mkdir(dirPath: string): Promise<void>`

创建目录及所有必要的父目录（递归）。如果目录已存在则不做任何操作。

```typescript
await storage.mkdir('./test-reports/run-001');
```

### `remove(filePath: string): Promise<void>`

删除文件。如果文件不存在则不做任何操作。

```typescript
await storage.remove('./temp/cache.json');
```

### `removeDir(dirPath: string): Promise<void>`

递归删除目录及其所有内容。如果目录不存在则不做任何操作。

```typescript
await storage.removeDir('./temp');
```

### `stat(filePath: string): Promise<fs.Stats | null>`

获取文件或目录的状态信息。如果路径不存在返回 `null`。

```typescript
const stats = await storage.stat('./report.json');

if (stats) {
  console.log(`File size: ${stats.size} bytes`);
  console.log(`Is directory: ${stats.isDirectory()}`);
}
```

### `copy(src: string, dest: string): Promise<void>`

将文件从源路径复制到目标路径。自动创建目标路径的父目录。如果源文件不存在或是目录则不做任何操作。

```typescript
await storage.copy('./reports/latest.json', './archive/report-2024-05-14.json');
```

### `readDirWithTypes(dirPath: string): Promise<fs.Dirent[]>`

列出目录条目及其类型信息（文件 vs 目录）。如果目录不存在返回空数组。

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

`FilesystemStorage` 是默认实现，使用 Node.js `fs` 模块执行真实文件系统操作。它还实现了 `StorageProviderWithResult` 接口，用于返回结构化错误信息的操作。

### 构造函数

```typescript
new FilesystemStorage()
```

### 示例

```typescript
import { FilesystemStorage } from 'yuantest-playwright';

const storage = new FilesystemStorage();

await storage.writeText('./hello.txt', 'Hello, World!');

const content = await storage.readText('./hello.txt');
```

---

## MemoryStorage

`MemoryStorage` 是内存实现，将所有数据存储在 `Map` 中。适用于测试或不需要文件系统访问的场景。

### 构造函数

```typescript
new MemoryStorage()
```

### 额外方法

#### `clear(): void`

清除内存中存储的所有文件和目录。

```typescript
import { MemoryStorage } from 'yuantest-playwright';

const storage = new MemoryStorage();

await storage.writeText('./test.txt', 'hello');

storage.clear();

const content = await storage.readText('./test.txt');
```

---

## 模块函数

### `getStorage(): StorageProvider`

获取默认存储实例。如果未设置自定义存储，返回 `FilesystemStorage` 实例。

```typescript
import { getStorage } from 'yuantest-playwright';

const storage = getStorage();
```

### `setStorage(storage: StorageProvider): void`

设置默认存储实例。将默认的 `FilesystemStorage` 替换为自定义实现。

```typescript
import { setStorage, MemoryStorage } from 'yuantest-playwright';

setStorage(new MemoryStorage());
```

---

## 类型定义

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
