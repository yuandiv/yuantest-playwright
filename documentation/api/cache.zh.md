# LRUCache API 参考

LRUCache 提供了一个基于内存的最近最少使用缓存，支持可配置的大小限制、内存限制和可选的 TTL（生存时间）支持。它追踪命中/未命中统计信息，并支持基于模式的失效操作。`TTLCache` 扩展了 `LRUCache`，增加了强制 TTL 过期功能。

---

## 构造函数

```typescript
new LRUCache<T>(options?: CacheOptions)
```

### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options` | `CacheOptions` | `{}` | 缓存配置选项 |

### CacheOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxSize` | `number` | `100` | 缓存最大条目数 |
| `maxMemory` | `number` | `104857600`（100 MB） | 最大内存使用量（字节） |
| `ttl` | `number` | `0` | 生存时间（毫秒）。`0` 表示不过期 |

### 示例

```typescript
import { LRUCache } from 'yuantest-playwright';

const cache = new LRUCache({ maxSize: 200, maxMemory: 50 * 1024 * 1024 });

cache.set('report-001', reportData, 1024);

const data = cache.get('report-001');
```

---

## 实例方法

### `get<R = T>(key: string): R | null`

根据键获取缓存值。如果键不存在或条目已过期（配置 TTL 时），返回 `null`。访问条目会增加其访问计数并更新时间戳，使其更不容易被淘汰。

```typescript
const report = cache.get<ReportData>('report-001');

if (report) {
  console.log(report.totalTests);
}
```

### `set(key: string, data: T, size?: number): void`

将值存储到缓存中。如果键已存在，则替换旧条目。如果添加条目会超过 `maxSize` 或 `maxMemory`，则淘汰最近最少使用的条目直到有足够空间。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `key` | `string` | | 缓存键 |
| `data` | `T` | | 要缓存的值 |
| `size` | `number` | `0` | 条目的估计内存大小（字节） |

```typescript
cache.set('config', { version: '1.0' });

cache.set('report', reportData, 2048);
```

### `has(key: string): boolean`

检查键是否存在于缓存中且未过期。如果键不存在或 TTL 已过，返回 `false`。

```typescript
if (cache.has('report-001')) {
  const data = cache.get('report-001');
}
```

### `delete(key: string): boolean`

根据键从缓存中删除指定条目。如果找到并删除条目返回 `true`，否则返回 `false`。

```typescript
const removed = cache.delete('report-001');
```

### `clear(): void`

清除缓存中的所有条目并重置命中/未命中统计。

```typescript
cache.clear();
```

### `invalidate(pattern?: string): void`

使缓存条目失效。如果提供了模式字符串，则只删除键中包含该模式的条目。如果未提供模式，则清除所有条目（等同于 `clear()`）。

```typescript
cache.invalidate('report-');

cache.invalidate();
```

### `size(): number`

获取缓存中当前的条目数。

```typescript
console.log(`Cache entries: ${cache.size()}`);
```

### `memoryUsage(): number`

获取所有缓存条目的当前总内存使用量（字节）。

```typescript
console.log(`Memory usage: ${cache.memoryUsage()} bytes`);
```

### `stats(): CacheStats`

获取综合缓存统计信息，包括大小、内存使用、命中次数、未命中次数和命中率。

```typescript
const stats = cache.stats();

console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Entries: ${stats.size}`);
console.log(`Memory: ${stats.memoryUsage} bytes`);
```

### `keys(): string[]`

获取所有缓存键的数组。

```typescript
const allKeys = cache.keys();

for (const key of allKeys) {
  console.log(key);
}
```

### `entries(): Array<[string, T]>`

获取所有缓存条目作为 `[key, value]` 对的数组。

```typescript
for (const [key, value] of cache.entries()) {
  console.log(`${key}: ${value}`);
}
```

---

## TTLCache

`TTLCache` 扩展了 `LRUCache`，增加了强制 TTL 过期功能。所有条目将在指定的生存时间后自动过期。

### 构造函数

```typescript
new TTLCache<T>(ttl: number, options?: Omit<CacheOptions, 'ttl'>)
```

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `ttl` | `number` | 生存时间（毫秒，必填） |
| `options` | `Omit<CacheOptions, 'ttl'>` | 可选缓存配置（不含 `ttl`） |

### 示例

```typescript
import { TTLCache } from 'yuantest-playwright';

const cache = new TTLCache(60000, { maxSize: 50 });

cache.set('session', sessionData);

const session = cache.get('session');
```

---

## createCache

创建 `LRUCache` 实例的工厂函数。

### 签名

```typescript
createCache<T>(options?: CacheOptions): LRUCache<T>
```

### 示例

```typescript
import { createCache } from 'yuantest-playwright';

const cache = createCache({ maxSize: 100, ttl: 30000 });
```

---

## 类型定义

```typescript
interface CacheOptions {
  maxSize?: number;
  maxMemory?: number;
  ttl?: number;
}

interface CacheStats {
  size: number;
  memoryUsage: number;
  hits: number;
  misses: number;
  hitRate: number;
}

class LRUCache<T = unknown> {
  constructor(options?: CacheOptions);
  get<R = T>(key: string): R | null;
  set(key: string, data: T, size?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  invalidate(pattern?: string): void;
  size(): number;
  memoryUsage(): number;
  stats(): CacheStats;
  keys(): string[];
  entries(): Array<[string, T]>;
}

class TTLCache<T = unknown> extends LRUCache<T> {
  constructor(ttl: number, options?: Omit<CacheOptions, 'ttl'>);
}

function createCache<T = unknown>(options?: CacheOptions): LRUCache<T>;
```
