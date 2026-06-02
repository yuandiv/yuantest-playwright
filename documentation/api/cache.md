# LRUCache API Reference

LRUCache provides an in-memory least-recently-used cache with configurable size limits, memory limits, and optional TTL (time-to-live) support. It tracks hit/miss statistics and supports pattern-based invalidation. `TTLCache` extends `LRUCache` with mandatory TTL expiration.

---

## Constructor

```typescript
new LRUCache<T>(options?: CacheOptions)
```

### Parameters

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `options` | `CacheOptions` | `{}` | Cache configuration options |

### CacheOptions

| Property | Type | Default | Description |
|------|------|--------|------|
| `maxSize` | `number` | `100` | Maximum number of entries in the cache |
| `maxMemory` | `number` | `104857600` (100 MB) | Maximum memory usage in bytes |
| `ttl` | `number` | `0` | Time-to-live in milliseconds. `0` means no expiration |

### Example

```typescript
import { LRUCache } from 'yuantest-playwright';

const cache = new LRUCache({ maxSize: 200, maxMemory: 50 * 1024 * 1024 });

cache.set('report-001', reportData, 1024);

const data = cache.get('report-001');
```

---

## Instance Methods

### `get<R = T>(key: string): R | null`

Retrieve a cached value by key. Returns `null` if the key does not exist or the entry has expired (when TTL is configured). Accessing an entry increments its access count and updates its timestamp, making it less likely to be evicted.

```typescript
const report = cache.get<ReportData>('report-001');

if (report) {
  console.log(report.totalTests);
}
```

### `set(key: string, data: T, size?: number): void`

Store a value in the cache with the given key. If the key already exists, the old entry is replaced. If adding the entry would exceed `maxSize` or `maxMemory`, the least recently used entries are evicted until there is enough room.

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `key` | `string` | | Cache key |
| `data` | `T` | | Value to cache |
| `size` | `number` | `0` | Estimated memory size of the entry in bytes |

```typescript
cache.set('config', { version: '1.0' });

cache.set('report', reportData, 2048);
```

### `has(key: string): boolean`

Check whether a key exists in the cache and has not expired. Returns `false` if the key is missing or the TTL has elapsed.

```typescript
if (cache.has('report-001')) {
  const data = cache.get('report-001');
}
```

### `delete(key: string): boolean`

Remove a specific entry from the cache by key. Returns `true` if the entry was found and removed, `false` otherwise.

```typescript
const removed = cache.delete('report-001');
```

### `clear(): void`

Remove all entries from the cache and reset hit/miss statistics.

```typescript
cache.clear();
```

### `invalidate(pattern?: string): void`

Invalidate cache entries. If a pattern string is provided, only entries whose keys include the pattern are removed. If no pattern is given, all entries are cleared (equivalent to `clear()`).

```typescript
cache.invalidate('report-');

cache.invalidate();
```

### `size(): number`

Get the current number of entries in the cache.

```typescript
console.log(`Cache entries: ${cache.size()}`);
```

### `memoryUsage(): number`

Get the current total memory usage in bytes across all cache entries.

```typescript
console.log(`Memory usage: ${cache.memoryUsage()} bytes`);
```

### `stats(): CacheStats`

Get comprehensive cache statistics including size, memory usage, hit count, miss count, and hit rate.

```typescript
const stats = cache.stats();

console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Entries: ${stats.size}`);
console.log(`Memory: ${stats.memoryUsage} bytes`);
```

### `keys(): string[]`

Get an array of all cache keys.

```typescript
const allKeys = cache.keys();

for (const key of allKeys) {
  console.log(key);
}
```

### `entries(): Array<[string, T]>`

Get an array of all cache entries as `[key, value]` pairs.

```typescript
for (const [key, value] of cache.entries()) {
  console.log(`${key}: ${value}`);
}
```

---

## TTLCache

`TTLCache` extends `LRUCache` with mandatory TTL expiration. All entries will automatically expire after the specified time-to-live duration.

### Constructor

```typescript
new TTLCache<T>(ttl: number, options?: Omit<CacheOptions, 'ttl'>)
```

### Parameters

| Parameter | Type | Description |
|------|------|------|
| `ttl` | `number` | Time-to-live in milliseconds (required) |
| `options` | `Omit<CacheOptions, 'ttl'>` | Optional cache configuration (without `ttl`) |

### Example

```typescript
import { TTLCache } from 'yuantest-playwright';

const cache = new TTLCache(60000, { maxSize: 50 });

cache.set('session', sessionData);

const session = cache.get('session');
```

---

## createCache

Factory function for creating `LRUCache` instances.

### Signature

```typescript
createCache<T>(options?: CacheOptions): LRUCache<T>
```

### Example

```typescript
import { createCache } from 'yuantest-playwright';

const cache = createCache({ maxSize: 100, ttl: 30000 });
```

---

## Type Definitions

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
