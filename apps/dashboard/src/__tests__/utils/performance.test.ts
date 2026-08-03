import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle, debounce, BatchUpdater, MessageRateLimiter } from '../../utils/performance';

describe('throttle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('calls function immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('throttles subsequent calls within limit', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled('a');
    throttled('b');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('executes trailing call after limit', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled('a');
    throttled('b');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });
});

describe('debounce', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('only executes last call when called multiple times', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    debounced('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });
});

describe('BatchUpdater', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('flushes when batchSize is reached', () => {
    const onFlush = vi.fn();
    const updater = new BatchUpdater(onFlush, { batchSize: 3, flushDelay: 1000 });
    updater.add(1);
    updater.add(2);
    expect(onFlush).not.toHaveBeenCalled();
    updater.add(3);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('flushes on flushDelay timeout', () => {
    const onFlush = vi.fn();
    const updater = new BatchUpdater(onFlush, { batchSize: 10, flushDelay: 100 });
    updater.add(1);
    updater.add(2);
    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([1, 2]);
  });

  it('flushes immediately for immediateTypes', () => {
    const onFlush = vi.fn();
    const updater = new BatchUpdater(onFlush, {
      batchSize: 10,
      flushDelay: 1000,
      immediateTypes: ['urgent'],
      getType: (item: { type: string; value?: number }) => item.type,
    });
    updater.add({ type: 'normal', value: 1 });
    expect(onFlush).not.toHaveBeenCalled();
    updater.add({ type: 'urgent', value: 2 });
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('clears pending items', () => {
    const onFlush = vi.fn();
    const updater = new BatchUpdater(onFlush, { batchSize: 10, flushDelay: 100 });
    updater.add(1);
    updater.add(2);
    updater.clear();
    vi.advanceTimersByTime(200);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('manual flush triggers onFlush', () => {
    const onFlush = vi.fn();
    const updater = new BatchUpdater(onFlush, { batchSize: 100, flushDelay: 10000 });
    updater.add(1);
    updater.add(2);
    updater.flush();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith([1, 2]);
  });
});

describe('MessageRateLimiter', () => {
  it('allows messages within limit', () => {
    const limiter = new MessageRateLimiter(5, 1000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.shouldProcess('test')).toBe(true);
    }
  });

  it('blocks messages exceeding limit', () => {
    const limiter = new MessageRateLimiter(3, 1000);
    limiter.shouldProcess('test');
    limiter.shouldProcess('test');
    limiter.shouldProcess('test');
    expect(limiter.shouldProcess('test')).toBe(false);
  });

  it('tracks different message types independently', () => {
    const limiter = new MessageRateLimiter(2, 1000);
    limiter.shouldProcess('typeA');
    limiter.shouldProcess('typeA');
    expect(limiter.shouldProcess('typeA')).toBe(false);
    expect(limiter.shouldProcess('typeB')).toBe(true);
  });

  it('resets counts on clear', () => {
    const limiter = new MessageRateLimiter(2, 1000);
    limiter.shouldProcess('test');
    limiter.shouldProcess('test');
    expect(limiter.shouldProcess('test')).toBe(false);
    limiter.clear();
    expect(limiter.shouldProcess('test')).toBe(true);
  });
});
