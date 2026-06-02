import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockGetTestsStructured = vi.fn();
const mockGetAnnotations = vi.fn();

vi.mock('../../services/api', () => ({
  getTestsStructured: (...args: any[]) => mockGetTestsStructured(...args),
  getAnnotations: (...args: any[]) => mockGetAnnotations(...args),
}));

import { useTestTree } from '../../hooks/useTestTree';

function generateMockFiles(fileCount: number, testsPerFile: number) {
  const files = [];
  for (let f = 0; f < fileCount; f++) {
    const tests = [];
    for (let t = 0; t < testsPerFile; t++) {
      tests.push({
        id: `t-${f}-${t}`,
        title: `test-${f}-${t}`,
        fullTitle: `test-${f}-${t}`,
        file: `tests/file${f}.spec.ts`,
        line: t + 1,
        column: 0,
        tags: [],
        annotations: [],
      });
    }
    files.push({
      file: `tests/file${f}.spec.ts`,
      title: `file${f}.spec.ts`,
      describes: [],
      tests,
    });
  }
  return files;
}

function makeSingleFileMockResult(testId = 't1', title = 'test1') {
  return {
    total: 1,
    files: [{
      file: 'tests/a.spec.ts',
      title: 'a.spec.ts',
      describes: [],
      tests: [{ id: testId, title, fullTitle: title, file: 'tests/a.spec.ts', line: 1, column: 0, tags: [], annotations: [] }],
    }],
    tests: [],
  };
}

describe('useTestTree Stability Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('T-01: 高频状态更新批处理', () => {
    it('should batch 100+ status updates with 200ms throttle', async () => {
      vi.useFakeTimers();

      mockGetTestsStructured.mockResolvedValue(makeSingleFileMockResult());
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      for (let i = 0; i < 100; i++) {
        result.current.scheduleStatusUpdate('t1', {
          status: i % 2 === 0 ? 'passed' : 'failed',
          lastDuration: i * 10,
          lastError: null,
        });
      }

      act(() => {
        vi.advanceTimersByTime(250);
      });

      act(() => {
        result.current.flushPendingStatusUpdates();
      });

      const tc = result.current.testCases.find(t => t.id === 't1');
      expect(tc).toBeDefined();
      expect(tc!.status).toBeDefined();
    });
  });

  describe('T-02: 状态更新竞态条件', () => {
    it('should resolve rapid status updates with last update winning', async () => {
      vi.useFakeTimers();

      mockGetTestsStructured.mockResolvedValue(makeSingleFileMockResult());
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      result.current.scheduleStatusUpdate('t1', { status: 'running', lastDuration: null, lastError: null });
      result.current.scheduleStatusUpdate('t1', { status: 'passed', lastDuration: 100, lastError: null });
      result.current.scheduleStatusUpdate('t1', { status: 'failed', lastDuration: 200, lastError: 'assertion error' });

      act(() => {
        vi.advanceTimersByTime(250);
      });

      act(() => {
        result.current.flushPendingStatusUpdates();
      });

      const tc = result.current.testCases.find(t => t.id === 't1');
      expect(tc!.status).toBe('failed');
      expect(tc!.lastDuration).toBe(200);
      expect(tc!.lastError).toBe('assertion error');
    });
  });

  describe('T-03: 未知 testId 的状态更新', () => {
    it('should not crash when updating non-existent testId', async () => {
      mockGetTestsStructured.mockResolvedValue(makeSingleFileMockResult());
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      expect(() => {
        result.current.scheduleStatusUpdate('non-existent-id', {
          status: 'passed',
          lastDuration: 50,
          lastError: null,
        });
      }).not.toThrow();

      act(() => {
        result.current.flushPendingStatusUpdates();
      });

      const tc = result.current.testCases.find(t => t.id === 't1');
      expect(tc!.status).toBeUndefined();
    });
  });

  describe('T-04: 大量用例状态恢复', () => {
    it('should restore 500+ test case statuses from localStorage', async () => {
      const files = generateMockFiles(50, 10);
      const savedStatuses = [];
      for (let f = 0; f < 50; f++) {
        for (let t = 0; t < 10; t++) {
          savedStatuses.push({
            id: `t-${f}-${t}`,
            status: t % 3 === 0 ? 'passed' : t % 3 === 1 ? 'failed' : 'skipped',
            lastDuration: t * 100,
            lastError: t % 3 === 1 ? `error-${f}-${t}` : null,
          });
        }
      }
      localStorage.setItem('testCasesStatus', JSON.stringify(savedStatuses));

      const mockResult = { total: 500, files, tests: [] };
      mockGetTestsStructured.mockResolvedValue(mockResult);
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      expect(result.current.testCases.length).toBe(500);

      const passedCount = result.current.testCases.filter(tc => tc.status === 'passed').length;
      const failedCount = result.current.testCases.filter(tc => tc.status === 'failed').length;
      const skippedCount = result.current.testCases.filter(tc => tc.status === 'skipped').length;
      expect(passedCount + failedCount + skippedCount).toBe(500);
    });
  });

  describe('T-05: localStorage 写入失败', () => {
    it('should not crash when localStorage.setItem throws QuotaExceededError', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      setItemSpy.mockImplementation((key: string, value: string) => {
        if (key === 'testCasesStatus') {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
        return undefined;
      });

      mockGetTestsStructured.mockResolvedValue(makeSingleFileMockResult());
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      result.current.scheduleStatusUpdate('t1', { status: 'passed', lastDuration: 100, lastError: null });

      act(() => {
        result.current.flushPendingStatusUpdates();
      });

      expect(result.current.testCases.find(t => t.id === 't1')!.status).toBe('passed');

      setItemSpy.mockRestore();
    });
  });

  describe('T-06: localStorage 数据损坏', () => {
    it('should gracefully handle corrupted localStorage data', async () => {
      localStorage.setItem('testCasesStatus', 'not-valid-json{{{');

      const cases = [
        { id: 't1', name: 'test1', fullTitle: 'test1', file: 'tests/a.spec.ts', line: 1, column: 0, lastDuration: null, lastError: null },
      ];

      const { result } = renderHook(() => useTestTree([]));

      const restored = result.current.restoreTestCasesFromLocalStorage(cases);
      expect(restored).toEqual(cases);
    });
  });

  describe('T-07: 从报告恢复状态 — 多报告', () => {
    it('should use the first completed report for restoration', () => {
      const cases = [
        { id: 't1', name: 'test1', fullTitle: 'test1', file: 'tests/a.spec.ts', line: 1, column: 0, lastDuration: null, lastError: null },
      ];

      const reports = [
        {
          id: 1, timestamp: new Date().toISOString(), version: '1.0.0',
          totalTests: 1, passed: 1, failed: 0, duration: '1.00',
          details: [{ id: 't1', name: 'test1', status: 'passed' as const, duration: '1.00', error: undefined }],
          status: 'completed' as const,
        },
        {
          id: 2, timestamp: new Date().toISOString(), version: '1.0.0',
          totalTests: 1, passed: 0, failed: 1, duration: '2.00',
          details: [{ id: 't1', name: 'test1', status: 'failed' as const, duration: '2.00', error: 'error' }],
          status: 'completed' as const,
        },
      ];

      const { result } = renderHook(() => useTestTree(reports));

      const restored = result.current.restoreTestCasesFromReports(cases, reports);
      expect(restored[0].status).toBe('passed');
    });
  });

  describe('T-08: loadTests 缓存 TTL', () => {
    it('should call API on each loadTests invocation', async () => {
      mockGetTestsStructured.mockResolvedValue(makeSingleFileMockResult());
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      await act(async () => {
        await result.current.loadTests();
      });

      expect(mockGetTestsStructured).toHaveBeenCalledTimes(2);
    });
  });

  describe('T-09: syncTestFilesWithTestCases 大数据量', () => {
    it('should sync 500+ test files with cases efficiently', async () => {
      const files = generateMockFiles(50, 10);
      const mockResult = { total: 500, files, tests: [] };
      mockGetTestsStructured.mockResolvedValue(mockResult);
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      const updatedCases = result.current.testCases.map((tc, i) => ({
        ...tc,
        status: i % 2 === 0 ? 'passed' : 'failed',
        lastDuration: i * 10,
        lastError: i % 2 !== 0 ? `error-${i}` : null,
      }));

      act(() => {
        result.current.setTestCases(updatedCases);
      });

      const synced = result.current.syncTestFilesWithTestCases(result.current.testFiles, result.current.testCases);

      expect(synced.length).toBe(50);
      const allTests = synced.flatMap(f => [...f.tests, ...f.describes.flatMap(d => d.tests)]);
      const passedTests = allTests.filter(t => t.status === 'passed');
      const failedTests = allTests.filter(t => t.status === 'failed');
      expect(passedTests.length + failedTests.length).toBe(500);
    });
  });

  describe('T-10: 树构建 — 深层嵌套路径', () => {
    it('should build tree from deeply nested fullTitle (10+ levels)', async () => {
      const levels = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'];
      const fullTitle = levels.join(' > ') + ' > deep test';

      const mockResult = {
        total: 1,
        files: [],
        tests: [{
          id: 'deep-1',
          title: 'deep test',
          fullTitle,
          file: 'tests/deep.spec.ts',
          line: 1,
          column: 0,
          tags: [],
          annotations: [],
        }],
      };
      mockGetTestsStructured.mockResolvedValue(mockResult);
      mockGetAnnotations.mockResolvedValue(null);

      const { result } = renderHook(() => useTestTree([]));

      await act(async () => {
        await result.current.loadTests();
      });

      expect(result.current.testFiles.length).toBe(1);
      expect(result.current.testFiles[0].file).toBe('tests/deep.spec.ts');

      let current = result.current.testFiles[0].describes;
      for (let i = 0; i < levels.length; i++) {
        expect(current.length).toBeGreaterThanOrEqual(1);
        current = current[0].describes;
      }
    });
  });
});
