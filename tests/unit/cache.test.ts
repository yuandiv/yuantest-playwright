import { LRUCache, TTLCache, createCache } from '../../src/cache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>({ maxSize: 3 });
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeNull();
    });
  });

  describe('eviction', () => {
    it('should evict LRU entry when max size reached', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.size()).toBe(3);
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update access count on get', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      cache.get('key1');
      cache.get('key1');

      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('invalidate', () => {
    it('should invalidate by pattern', () => {
      cache.set('test:1', 'value1');
      cache.set('test:2', 'value2');
      cache.set('other:1', 'value3');

      cache.invalidate('test:');

      expect(cache.get('test:1')).toBeNull();
      expect(cache.get('test:2')).toBeNull();
      expect(cache.get('other:1')).toBe('value3');
    });

    it('should clear all when no pattern provided', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.invalidate();
      expect(cache.size()).toBe(0);
    });
  });

  describe('stats', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key1');
      cache.get('nonexistent');

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.666, 1);
    });

    it('should track size and memory', () => {
      cache.set('key1', 'value1', 100);
      cache.set('key2', 'value2', 200);

      const stats = cache.stats();
      expect(stats.size).toBe(2);
      expect(stats.memoryUsage).toBe(300);
    });
  });

  describe('iteration', () => {
    it('should return all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      const keys = cache.keys();
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });

    it('should return all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      const entries = cache.entries();
      expect(entries).toContainEqual(['key1', 'value1']);
      expect(entries).toContainEqual(['key2', 'value2']);
    });
  });
});

describe('TTLCache', () => {
  let cache: TTLCache<string>;

  beforeEach(() => {
    cache = new TTLCache<string>(200, { maxSize: 10 });
  });

  it('should expire entries after TTL', async () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');

    await new Promise(resolve => setTimeout(resolve, 300));
    expect(cache.get('key1')).toBeNull();
  });

  it('should check TTL on has()', async () => {
    cache.set('key1', 'value1');
    expect(cache.has('key1')).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 300));
    expect(cache.has('key1')).toBe(false);
  });
});

describe('createCache', () => {
  it('should create LRUCache instance', () => {
    const cache = createCache<string>({ maxSize: 5 });
    expect(cache).toBeInstanceOf(LRUCache);
  });

  it('should create cache with default options', () => {
    const cache = createCache();
    expect(cache).toBeInstanceOf(LRUCache);
  });
});
