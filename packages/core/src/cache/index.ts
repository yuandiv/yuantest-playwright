import { CACHE_CONFIG } from '../constants';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  size: number;
}

interface CacheOptions {
  maxSize?: number;
  maxMemory?: number;
  ttl?: number;
}

export class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private maxMemory: number;
  private currentMemory: number = 0;
  private ttl: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize ?? CACHE_CONFIG.MAX_REPORT_CACHE_SIZE;
    this.maxMemory = options.maxMemory ?? 100 * 1024 * 1024;
    this.ttl = options.ttl ?? 0;
  }

  get<R = T>(key: string): R | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      this.misses++;
      return null;
    }

    entry.accessCount++;
    entry.timestamp = Date.now();
    this.hits++;
    return entry.data as unknown as R;
  }

  set(key: string, data: T, size: number = 0): void {
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      this.currentMemory -= existingEntry.size;
    }

    while (
      (this.cache.size >= this.maxSize || this.currentMemory + size > this.maxMemory) &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      accessCount: 1,
      size,
    });
    this.currentMemory += size;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.currentMemory -= entry.size;
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.currentMemory = 0;
    this.hits = 0;
    this.misses = 0;
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.delete(key);
      }
    }
  }

  size(): number {
    return this.cache.size;
  }

  memoryUsage(): number {
    return this.currentMemory;
  }

  stats(): {
    size: number;
    memoryUsage: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      memoryUsage: this.currentMemory,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  entries(): Array<[string, T]> {
    return Array.from(this.cache.entries()).map(([key, entry]) => [key, entry.data]);
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    let lowestAccess = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const score = entry.accessCount * 1000000 + (Date.now() - entry.timestamp);
      if (score < lowestAccess * 1000000 + oldestTime) {
        oldestKey = key;
        oldestTime = Date.now() - entry.timestamp;
        lowestAccess = entry.accessCount;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
    }
  }
}

export class TTLCache<T = unknown> extends LRUCache<T> {
  constructor(ttl: number, options: Omit<CacheOptions, 'ttl'> = {}) {
    super({ ...options, ttl });
  }
}

export function createCache<T = unknown>(options?: CacheOptions): LRUCache<T> {
  return new LRUCache<T>(options);
}
