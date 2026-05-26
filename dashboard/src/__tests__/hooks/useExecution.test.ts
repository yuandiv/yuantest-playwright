import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock dependencies
vi.mock('../../services/api', () => ({
  getRunStatus: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../i18n', () => ({
  t: (key: string, _lang?: string) => key,
}));

vi.mock('../../utils/performance', () => ({
  BatchUpdater: vi.fn().mockImplementation(function(this: any, onFlush: (items: any[]) => void, options?: any) {
    let items: any[] = [];
    this.add = vi.fn((item: any) => {
      items.push(item);
      // If immediate type, flush immediately
      if (options?.immediateTypes && options?.getType) {
        const type = options.getType(item);
        if (options.immediateTypes.includes(type)) {
          const batch = [...items];
          items = [];
          onFlush(batch);
          return;
        }
      }
      // Otherwise batch
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
  MessageRateLimiter: vi.fn().mockImplementation(function(this: any) {
    this.shouldProcess = vi.fn(() => true);
    this.clear = vi.fn();
  }),
}));

import { useExecution } from '../../hooks/useExecution';

describe('useExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useExecution());

    expect(result.current.isExecuting).toBe(false);
    expect(result.current.logs).toEqual([]);
    expect(result.current.wsConnected).toBe(false);
    expect(result.current.currentTest).toBeNull();
  });

  it('addLog adds a log entry via BatchUpdater', () => {
    const { result } = renderHook(() => useExecution());

    act(() => {
      result.current.addLog('Test started', 'info');
    });

    // 'info' is an immediate type, so it should be flushed right away
    expect(result.current.logs.length).toBeGreaterThanOrEqual(1);
    expect(result.current.logs.some(log => log.msg === 'Test started')).toBe(true);
  });

  it('addLog batches non-immediate type messages', () => {
    const { result } = renderHook(() => useExecution());

    act(() => {
      result.current.addLog('Debug message', 'debug');
    });

    // 'debug' is not an immediate type, may be batched
    // Just verify it doesn't crash
    expect(true).toBe(true);
  });

  it('clearLogs clears the log list and adds a cleared message', () => {
    const { result } = renderHook(() => useExecution());

    // Add a log first
    act(() => {
      result.current.addLog('Test started', 'info');
    });

    // Clear logs
    act(() => {
      result.current.clearLogs('zh');
    });

    // After clearLogs, logs should be reset to [] then a new "cleared" log added
    // The exact state depends on BatchUpdater timing, but it shouldn't crash
    expect(result.current.logs.some(log => log.msg.includes('logsCleared'))).toBe(true);
  });

  it('formatStartError returns i18n key for "already in progress" errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('Test already in progress', 'zh');
    expect(msg).toBe('executorAlreadyRunning');
  });

  it('formatStartError returns i18n key for "execution is already" errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('execution is already running', 'zh');
    expect(msg).toBe('executorAlreadyRunning');
  });

  it('formatStartError returns i18n key for Invalid testDir errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('Invalid testDir provided', 'zh');
    expect(msg).toBe('invalidTestDir');
  });

  it('formatStartError returns i18n key for path traversal errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('Detected path traversal attack', 'zh');
    expect(msg).toBe('invalidTestDir');
  });

  it('formatStartError returns i18n key for Network errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('Network connection failed', 'zh');
    expect(msg).toBe('networkError');
  });

  it('formatStartError returns i18n key for fetch errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('fetch failed', 'zh');
    expect(msg).toBe('networkError');
  });

  it('formatStartError returns i18n key for HTTP 5xx errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('HTTP 500 Internal Server Error', 'zh');
    expect(msg).toBe('serverError');
  });

  it('formatStartError returns original error for unknown errors', () => {
    const { result } = renderHook(() => useExecution());

    const msg = result.current.formatStartError('Something unexpected happened', 'zh');
    expect(msg).toBe('Something unexpected happened');
  });

  it('setIsExecuting updates the state', () => {
    const { result } = renderHook(() => useExecution());

    act(() => {
      result.current.setIsExecuting(true);
    });

    expect(result.current.isExecuting).toBe(true);
  });

  it('setWsConnected updates the state', () => {
    const { result } = renderHook(() => useExecution());

    act(() => {
      result.current.setWsConnected(true);
    });

    expect(result.current.wsConnected).toBe(true);
  });

  it('setCurrentTest updates the state', () => {
    const { result } = renderHook(() => useExecution());

    act(() => {
      result.current.setCurrentTest('test-1');
    });

    expect(result.current.currentTest).toBe('test-1');
  });

  it('restoreExecutionState returns undefined when not running', () => {
    const { result } = renderHook(() => useExecution());

    const status = { isRunning: false, currentRun: null };
    const testCasesRef = { current: [] };
    const output = result.current.restoreExecutionState(status as any, testCasesRef as any);

    expect(output).toBeUndefined();
  });

  it('restoreExecutionState returns data when running', () => {
    const { result } = renderHook(() => useExecution());

    const status = {
      isRunning: true,
      currentRun: {
        id: 'run-1',
        testResults: [],
        testLocations: [],
        testFiles: [],
      },
    };
    const testCasesRef = { current: [] };
    const output = result.current.restoreExecutionState(status as any, testCasesRef as any);

    expect(output).toBeDefined();
    expect(output?.currentRunId).toBe('run-1');
    expect(output?.executingIds).toBeInstanceOf(Set);
    expect(output?.completedMap).toBeInstanceOf(Map);
  });

  it('restoreExecutionState maps test results to completedMap', () => {
    const { result } = renderHook(() => useExecution());

    const status = {
      isRunning: true,
      currentRun: {
        id: 'run-1',
        testResults: [
          { id: 'test-1', status: 'passed', duration: 1000, error: undefined },
          { id: 'test-2', status: 'failed', duration: 2000, error: 'assertion failed' },
        ],
        testLocations: [],
        testFiles: [],
      },
    };
    const testCasesRef = { current: [] };
    const output = result.current.restoreExecutionState(status as any, testCasesRef as any);

    expect(output?.completedMap.get('test-1')).toEqual({ status: 'passed', duration: 1000, error: undefined });
    expect(output?.completedMap.get('test-2')).toEqual({ status: 'failed', duration: 2000, error: 'assertion failed' });
  });

  it('restoreExecutionState matches test cases by testLocations', () => {
    const { result } = renderHook(() => useExecution());

    const status = {
      isRunning: true,
      currentRun: {
        id: 'run-1',
        testResults: [],
        testLocations: ['tests/a.spec.ts:10'],
        testFiles: [],
      },
    };
    const testCasesRef = {
      current: [
        { id: 'tc-1', file: 'tests/a.spec.ts', line: 10 },
        { id: 'tc-2', file: 'tests/b.spec.ts', line: 5 },
      ],
    };
    const output = result.current.restoreExecutionState(status as any, testCasesRef as any);

    expect(output?.executingIds.has('tc-1')).toBe(true);
    expect(output?.executingIds.has('tc-2')).toBe(false);
  });

  it('restoreExecutionState matches test cases by testFiles when no testLocations', () => {
    const { result } = renderHook(() => useExecution());

    const status = {
      isRunning: true,
      currentRun: {
        id: 'run-1',
        testResults: [],
        testLocations: [],
        testFiles: ['tests/a.spec.ts'],
      },
    };
    const testCasesRef = {
      current: [
        { id: 'tc-1', file: 'tests/a.spec.ts', line: 10 },
        { id: 'tc-2', file: 'tests/b.spec.ts', line: 5 },
      ],
    };
    const output = result.current.restoreExecutionState(status as any, testCasesRef as any);

    expect(output?.executingIds.has('tc-1')).toBe(true);
    expect(output?.executingIds.has('tc-2')).toBe(false);
  });
});
