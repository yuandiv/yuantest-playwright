# Logger API 参考

Logger 提供了一个结构化日志系统，支持文件输出、日志级别过滤和子日志器。它使用单例模式，并通过缓冲写入提升性能。默认的 `logger` 实例已预创建，可直接使用。

---

## Logger

`Logger` 是主日志类。它遵循单例模式，支持可配置的日志级别、基于文件的批量刷新输出和模块作用域的子日志器。

### 构造函数

Logger 使用私有构造函数。通过 `Logger.getInstance()` 或导出的 `logger` 常量访问单例实例。

```typescript
const logger = Logger.getInstance();
```

### 静态方法

#### `Logger.getInstance(): Logger`

获取 Logger 单例实例。首次调用时创建实例。

```typescript
import { Logger } from 'yuantest-playwright';

const logger = Logger.getInstance();
```

---

## 实例方法

### `init(logDir?: string, level?: string): Promise<void>`

使用日志目录和最低日志级别初始化日志器。必须在记录日志前调用。如果已初始化，后续调用返回已有的初始化 Promise。

| 参数 | 类型 | 说明 |
|------|------|------|
| `logDir` | `string` | 日志文件目录。默认为 `'./logs'` |
| `level` | `string` | 最低日志级别（`'DEBUG'`、`'INFO'`、`'WARN'`、`'ERROR'`）。默认为 `'INFO'` |

```typescript
await logger.init('./logs', 'DEBUG');
```

### `shutdown(): Promise<void>`

关闭日志器。停止刷新定时器，刷新所有剩余的缓冲日志条目，并关闭写入流。应在应用退出时调用。

```typescript
await logger.shutdown();
```

### `debug(module: string, message: string, error?: Error): void`

记录 DEBUG 级别的日志。仅当当前日志级别为 `DEBUG` 或更低时写入。

| 参数 | 类型 | 说明 |
|------|------|------|
| `module` | `string` | 模块名称或标识符 |
| `message` | `string` | 日志消息 |
| `error` | `Error` | 可选的错误对象（输出中包含堆栈跟踪） |

```typescript
logger.debug('TestRunner', 'Starting test execution');

logger.debug('StorageProvider', 'Cache miss for key', new Error('not found'));
```

### `info(module: string, message: string, error?: Error): void`

记录 INFO 级别的日志。仅当当前日志级别为 `INFO` 或更低时写入。

```typescript
logger.info('TestRunner', 'Test suite completed successfully');

logger.info('Server', 'Listening on port 5274');
```

### `warn(module: string, message: string, error?: Error): void`

记录 WARN 级别的日志。仅当当前日志级别为 `WARN` 或更低时写入。

```typescript
logger.warn('FlakyTestManager', 'High flaky test rate detected');

logger.warn('Cache', 'Cache size approaching limit');
```

### `error(module: string, message: string, error?: Error): void`

记录 ERROR 级别的日志。仅当当前日志级别为 `ERROR` 或更低时写入。

```typescript
logger.error('TestRunner', 'Test execution failed', new Error('Timeout exceeded'));

logger.error('StorageProvider', 'Failed to write report');
```

### `child(module: string): ChildLogger`

创建一个限定到特定模块的子日志器。子日志器自动在所有日志条目中包含模块名称，因此只需提供消息。

```typescript
const log = logger.child('MemoryStorage');

log.debug('Initializing storage');

log.info('Storage ready');

log.warn('Low memory');
```

### `setStorage(storage: StorageProvider): void`

设置用于创建日志目录的自定义存储提供者。设置后，日志器使用存储提供者创建日志目录，而不是直接使用 Node.js `fs`。

```typescript
import { getStorage } from 'yuantest-playwright';

logger.setStorage(getStorage());
```

---

## ChildLogger

`ChildLogger` 是由 `Logger.prototype.child()` 创建的模块作用域日志器。它将所有日志调用委托给父日志器，并预设模块名称。

### 构造函数

```typescript
new ChildLogger(module: string, logger: Logger)
```

### 实例方法

#### `debug(message: string, error?: Error): void`

使用预设的模块名称记录 DEBUG 级别日志。

```typescript
const log = logger.child('AgentService');

log.debug('Starting agent loop');
```

#### `info(message: string, error?: Error): void`

使用预设的模块名称记录 INFO 级别日志。

```typescript
log.info('Agent completed task');
```

#### `warn(message: string, error?: Error): void`

使用预设的模块名称记录 WARN 级别日志。

```typescript
log.warn('Retry attempt 3 of 5');
```

#### `error(message: string, error?: Error): void`

使用预设的模块名称记录 ERROR 级别日志。

```typescript
log.error('Agent failed', new Error('LLM timeout'));
```

---

## LogLevel

`LogLevel` 枚举定义了按严重程度升序排列的可用日志级别。

| 值 | 名称 | 说明 |
|-------|------|-------------|
| `0` | `DEBUG` | 详细的诊断信息 |
| `1` | `INFO` | 一般运行信息 |
| `2` | `WARN` | 可能需要关注的警告条件 |
| `3` | `ERROR` | 需要调查的错误条件 |

```typescript
import { LogLevel } from 'yuantest-playwright';

if (level === LogLevel.ERROR) {
  console.error('Critical error occurred');
}
```

---

## 模块导出

### `logger`

默认的单例日志器实例，已预创建可直接使用。

```typescript
import { logger } from 'yuantest-playwright';

await logger.init('./logs');

logger.info('App', 'Application started');
```

### `initLoggerStorage(storage: StorageProvider): void`

便捷函数，在默认日志器实例上设置存储提供者。

```typescript
import { initLoggerStorage, getStorage } from 'yuantest-playwright';

initLoggerStorage(getStorage());
```

---

## 日志输出格式

日志条目格式为：

```
[ISO_TIMESTAMP] [LEVEL] [MODULE] MESSAGE
  ERROR_STACK_TRACE
```

输出示例：

```
[2024-05-14T10:30:00.000Z] [INFO] [TestRunner] Test suite completed
[2024-05-14T10:30:01.000Z] [ERROR] [StorageProvider] Failed to write report
  Error: EACCES: permission denied
      at Object.write (fs.js:123:45)
```

---

## 类型定义

```typescript
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  private constructor();
  static getInstance(): Logger;
  init(logDir?: string, level?: string): Promise<void>;
  shutdown(): Promise<void>;
  debug(module: string, message: string, error?: Error): void;
  info(module: string, message: string, error?: Error): void;
  warn(module: string, message: string, error?: Error): void;
  error(module: string, message: string, error?: Error): void;
  child(module: string): ChildLogger;
  setStorage(storage: StorageProvider): void;
}

class ChildLogger {
  constructor(module: string, logger: Logger);
  debug(message: string, error?: Error): void;
  info(message: string, error?: Error): void;
  warn(message: string, error?: Error): void;
  error(message: string, error?: Error): void;
}

const logger: Logger;

function initLoggerStorage(storage: StorageProvider): void;
```
