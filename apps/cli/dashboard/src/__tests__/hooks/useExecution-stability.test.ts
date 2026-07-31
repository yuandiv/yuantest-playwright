import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockGetRunStatus = vi.fn();

vi.mock('../../services/api', () => ({
  getRunStatus: (...args: any[]) => mockGetRunStatus(...args),
}));

vi.mock('../../i18n', () => ({
  t: (key: string, _lang?: string) => key,
}));

vi.mock('../../utils/performance', () => ({
  BatchUpdater: vi.fn().mockImplementation(function(this: any, onFlush: (items: any[]) => void, options?: any) {
    let items: any[] = [];
    this.add = vi.fn((item: any) => {
      items.push(item);
      if (options?.immediateTypes && options?.getType) {
        const type = options.getType(item);
        if (options.immediateTypes.includes(type)) {
          const batch = [...items];
          items = [];
          onFlush(batch);
          return;
        }
      }
      if (items.length >= (options?.batchSize ?? 10)) {
        const batch = [...items];
        items = [];
        onFlush(batch);
      }
    });
    this.flush = vi.fn(() => {
      if (items.length > 0) {
        const batch = [...items];
        items = [];
        onFlush(batch);
      }
    });
    this.clear = vi.fn(() => {
      items = [];
    });
  }),
  MessageRateLimiter: vi.fn().mockImplementation(function(this: any, maxMessages: number = 20, timeWindow: number = 1000) {
    this.maxMessages = maxMessages;
    this.timeWindow = timeWindow;
    this.messageCounts = new Map<string, number[]>();
    this.shouldProcess = vi.fn((messageType: string) => {
      const now = Date.now();
      const timestamps = this.messageCounts.get(messageType) || [];
      const recentTimestamps = timestamps.filter((t: number) => now - t < this.timeWindow);
      if (recentTimestamps.length >= this.maxMessages) {
        return false;
      }
      recentTimestamps.push(now);
      this.messageCounts.set(messageType, recentTimestamps);
      return true;
    });
    this.clear = vi.fn(() => {
      this.messageCounts.clear();
    });
  }),
}));

import { useExecution } from '../../hooks/useExecution';

describe('useExecution Stability Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRunStatus.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('TE-01: 大量日志批量添加', () => {
    it('should batch 200+ log entries and truncate to MAX_LOGS', () => {
      const { result } = renderHook(() => useExecution());

      act(() => {
        for (let i = 0; i < 250; i++) {
          result.current.addLog(`Log message ${i}`, 'info');
        }
      });

      expect(result.current.logs.length).toBeLessThanOrEqual(100);
      expect(result.current.logs.length).toBeGreaterThan(0);
    });
  });

  describe('TE-02: 执行健康检查 — 服务端已停止', () => {
    it('should reset isExecuting when server reports not running', async () => {
      vi.useFakeTimers();
      mockGetRunStatus.mockResolvedValue({ isRunning: false });

      const { result } = renderHook(() => useExecution());

      act(() => {
        result.current.setIsExecuting(true);
      });

      expect(result.current.isExecuting).toBe(true);

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.isExecuting).toBe(false);
    });
  });

  describe('TE-03: 执行健康检查 — 网络错误', () => {
    it('should not reset isExecuting on network error', async () => {
      vi.useFakeTimers();

      const unhandledRejections: any[] = [];
      const handler = (reason: any) => unhandledRejections.push(reason);
      process.on('unhandledRejection', handler);

      mockGetRunStatus.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useExecution());

      act(() => {
        result.current.setIsExecuting(true);
      });

      expect(result.current.isExecuting).toBe(true);

      act(() => {
        vi.advanceTimersByTime(30000);
      });

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });

      expect(result.current.isExecuting).toBe(true);

      process.off('unhandledRejection', handler);
    });
  });

  describe('TE-04: restoreExecutionState — 大量 testResults', () => {
    it('should restore state with 500+ testResults efficiently', () => {
      const testResults = Array.from({ length: 500 }, (_, i) => ({
        id: `test-${i}`,
        status: i % 3 === 0 ? 'passed' : i % 3 === 1 ? 'failed' : 'skipped',
        duration: i * 100,
        error: i % 3 === 1 ? `Error in test ${i}` : undefined,
      }));

      const status = {
        isRunning: true,
        currentRun: {
          id: 'run-large',
          testResults,
          testLocations: [],
          testFiles: [],
        },
      };

      const testCasesRef = {
        current: Array.from({ length: 500 }, (_, i) => ({
          id: `test-${i}`,
          file: `tests/file${Math.floor(i / 10)}.spec.ts`,
          line: (i % 10) + 1,
        })),
      };

      const { result } = renderHook(() => useExecution());

      const startTime = Date.now();
      const output = result.current.restoreExecutionState(status as any, testCasesRef as any);
      const elapsed = Date.now() - startTime;

      expect(output).toBeDefined();
      expect(output!.completedMap.size).toBe(500);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('TE-05: MessageRateLimiter 限流', () => {
    it('should rate limit messages exceeding 20 per second', () => {
      const { result } = renderHook(() => useExecution());

      const limiter = result.current.messageRateLimiter.current;
      let allowedCount = 0;
      let blockedCount = 0;

      for (let i = 0; i < 25; i++) {
        if (limiter.shouldProcess('test_result')) {
          allowedCount++;
        } else {
          blockedCount++;
        }
      }

      expect(allowedCount).toBe(20);
      expect(blockedCount).toBe(5);
    });
  });
});
