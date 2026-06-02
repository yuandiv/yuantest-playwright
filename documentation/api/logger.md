# Logger API Reference

Logger provides a structured logging system with file output, log level filtering, and child logger support. It uses a singleton pattern with buffered writes for performance. The default `logger` instance is pre-created and ready to use.

---

## Logger

`Logger` is the main logging class. It follows the singleton pattern and supports configurable log levels, file-based output with batched flushing, and module-scoped child loggers.

### Constructor

Logger uses a private constructor. Access the singleton instance via `Logger.getInstance()` or the exported `logger` constant.

```typescript
const logger = Logger.getInstance();
```

### Static Methods

#### `Logger.getInstance(): Logger`

Get the singleton Logger instance. Creates the instance on first call.

```typescript
import { Logger } from 'yuantest-playwright';

const logger = Logger.getInstance();
```

---

## Instance Methods

### `init(logDir?: string, level?: string): Promise<void>`

Initialize the logger with a log directory and minimum log level. Must be called before logging. If already initialized, subsequent calls return the existing init promise.

| Parameter | Type | Description |
|------|------|------|
| `logDir` | `string` | Directory for log files. Defaults to `'./logs'` |
| `level` | `string` | Minimum log level (`'DEBUG'`, `'INFO'`, `'WARN'`, `'ERROR'`). Defaults to `'INFO'` |

```typescript
await logger.init('./logs', 'DEBUG');
```

### `shutdown(): Promise<void>`

Shut down the logger. Stops the flush timer, flushes any remaining buffered log entries, and closes the write stream. Should be called when the application exits.

```typescript
await logger.shutdown();
```

### `debug(module: string, message: string, error?: Error): void`

Log a debug-level message. Only written if the current log level is `DEBUG` or lower.

| Parameter | Type | Description |
|------|------|------|
| `module` | `string` | Module name or identifier |
| `message` | `string` | Log message |
| `error` | `Error` | Optional error object (stack trace is included in output) |

```typescript
logger.debug('TestRunner', 'Starting test execution');

logger.debug('StorageProvider', 'Cache miss for key', new Error('not found'));
```

### `info(module: string, message: string, error?: Error): void`

Log an info-level message. Only written if the current log level is `INFO` or lower.

```typescript
logger.info('TestRunner', 'Test suite completed successfully');

logger.info('Server', 'Listening on port 5274');
```

### `warn(module: string, message: string, error?: Error): void`

Log a warning-level message. Only written if the current log level is `WARN` or lower.

```typescript
logger.warn('FlakyTestManager', 'High flaky test rate detected');

logger.warn('Cache', 'Cache size approaching limit');
```

### `error(module: string, message: string, error?: Error): void`

Log an error-level message. Only written if the current log level is `ERROR` or lower.

```typescript
logger.error('TestRunner', 'Test execution failed', new Error('Timeout exceeded'));

logger.error('StorageProvider', 'Failed to write report');
```

### `child(module: string): ChildLogger`

Create a child logger scoped to a specific module. The child logger automatically includes the module name in all log entries, so you only need to provide the message.

```typescript
const log = logger.child('MemoryStorage');

log.debug('Initializing storage');

log.info('Storage ready');

log.warn('Low memory');
```

### `setStorage(storage: StorageProvider): void`

Set a custom storage provider for log directory creation. If set, the logger uses the storage provider to create the log directory instead of Node.js `fs` directly.

```typescript
import { getStorage } from 'yuantest-playwright';

logger.setStorage(getStorage());
```

---

## ChildLogger

`ChildLogger` is a module-scoped logger created by `Logger.prototype.child()`. It delegates all logging calls to the parent logger with the module name pre-set.

### Constructor

```typescript
new ChildLogger(module: string, logger: Logger)
```

### Instance Methods

#### `debug(message: string, error?: Error): void`

Log a debug-level message with the pre-set module name.

```typescript
const log = logger.child('AgentService');

log.debug('Starting agent loop');
```

#### `info(message: string, error?: Error): void`

Log an info-level message with the pre-set module name.

```typescript
log.info('Agent completed task');
```

#### `warn(message: string, error?: Error): void`

Log a warning-level message with the pre-set module name.

```typescript
log.warn('Retry attempt 3 of 5');
```

#### `error(message: string, error?: Error): void`

Log an error-level message with the pre-set module name.

```typescript
log.error('Agent failed', new Error('LLM timeout'));
```

---

## LogLevel

`LogLevel` enum defines the available log levels in ascending severity order.

| Value | Name | Description |
|-------|------|-------------|
| `0` | `DEBUG` | Detailed diagnostic information |
| `1` | `INFO` | General operational information |
| `2` | `WARN` | Warning conditions that may need attention |
| `3` | `ERROR` | Error conditions requiring investigation |

```typescript
import { LogLevel } from 'yuantest-playwright';

if (level === LogLevel.ERROR) {
  console.error('Critical error occurred');
}
```

---

## Module Exports

### `logger`

The default singleton logger instance, pre-created and ready to use.

```typescript
import { logger } from 'yuantest-playwright';

await logger.init('./logs');

logger.info('App', 'Application started');
```

### `initLoggerStorage(storage: StorageProvider): void`

Convenience function that sets the storage provider on the default logger instance.

```typescript
import { initLoggerStorage, getStorage } from 'yuantest-playwright';

initLoggerStorage(getStorage());
```

---

## Log Output Format

Log entries are formatted as:

```
[ISO_TIMESTAMP] [LEVEL] [MODULE] MESSAGE
  ERROR_STACK_TRACE
```

Example output:

```
[2024-05-14T10:30:00.000Z] [INFO] [TestRunner] Test suite completed
[2024-05-14T10:30:01.000Z] [ERROR] [StorageProvider] Failed to write report
  Error: EACCES: permission denied
      at Object.write (fs.js:123:45)
```

---

## Type Definitions

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
