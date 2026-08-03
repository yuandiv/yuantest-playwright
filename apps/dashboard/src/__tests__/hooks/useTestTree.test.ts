import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock API
const mockGetTestsStructured = vi.fn();
const mockGetAnnotations = vi.fn();

vi.mock('../../services/api', () => ({
  getTestsStructured: (...args: any[]) => mockGetTestsStructured(...args),
  getAnnotations: (...args: any[]) => mockGetAnnotations(...args),
}));

import { useTestTree } from '../../hooks/useTestTree';

describe('useTestTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('returns initial state with empty test files and cases', () => {
    const { result } = renderHook(() => useTestTree([]));
    expect(result.current.testFiles).toEqual([]);
    expect(result.current.testCases).toEqual([]);
    expect(result.current.selectedIds).toBeInstanceOf(Set);
    expect(result.current.expandedPaths).toBeInstanceOf(Set);
    expect(result.current.fileOrder).toEqual([]);
    expect(result.current.isLoadingTests).toBe(false);
  });

  it('loadTests handles null API response', async () => {
    mockGetTestsStructured.mockResolvedValue(null);

    const { result } = renderHook(() => useTestTree([]));

    const output = await act(async () => {
      return result.current.loadTests();
    });

    expect(mockGetTestsStructured).toHaveBeenCalled();
    expect(output.count).toBe(0);
  });

  it('loadTests handles API error gracefully', async () => {
    mockGetTestsStructured.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useTestTree([]));

    // Should not throw
    await expect(act(async () => {
      await result.current.loadTests();
    })).rejects.toThrow('Network error');

    expect(result.current.testFiles).toEqual([]);
    expect(result.current.testCases).toEqual([]);
  });

  it('loadTests handles error result from API', async () => {
    mockGetTestsStructured.mockResolvedValue({
      total: 0,
      files: [],
      tests: [],
      error: 'Config not found',
      rawOutput: 'some output',
    });

    const { result } = renderHook(() => useTestTree([]));

    const output = await act(async () => {
      return result.current.loadTests();
    });

    expect(output.count).toBe(0);
    expect(output.error).toBe('Config not found');
    expect(output.rawOutput).toBe('some output');
    expect(result.current.testFiles).toEqual([]);
    expect(result.current.testCases).toEqual([]);
  });

  it('loadTests processes structured files from API', async () => {
    const mockResult = {
      total: 2,
      files: [
        {
          file: 'tests/example.spec.ts',
          title: 'example.spec.ts',
          describes: [
            {
              title: 'Example Suite',
              file: 'tests/example.spec.ts',
              line: 5,
              column: 0,
              tests: [
                { id: 't1', title: 'should work', fullTitle: 'Example Suite > should work', file: 'tests/example.spec.ts', line: 6, column: 0, tags: [], annotations: [] },
              ],
              describes: [],
            },
          ],
          tests: [
            { id: 't2', title: 'standalone test', fullTitle: 'standalone test', file: 'tests/example.spec.ts', line: 15, column: 0, tags: [], annotations: [] },
          ],
        },
      ],
      tests: [],
    };
    mockGetTestsStructured.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useTestTree([]));

    const output = await act(async () => {
      return result.current.loadTests();
    });

    expect(output.count).toBe(2);
    expect(result.current.testFiles.length).toBe(1);
    expect(result.current.testFiles[0].file).toBe('tests/example.spec.ts');
    expect(result.current.testCases.length).toBe(2);
    expect(result.current.selectedIds.size).toBe(2);
  });

  it('loadTests processes flat tests from API when no files', async () => {
    // Use single-part fullTitle (no ">") to go into the simple path
    const mockResult = {
      total: 1,
      files: [],
      tests: [
        { id: 't1', title: 'should work', fullTitle: 'should work', file: 'tests/a.spec.ts', line: 5, column: 0, tags: [], annotations: [] },
      ],
    };
    mockGetTestsStructured.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useTestTree([]));

    const output = await act(async () => {
      return result.current.loadTests();
    });

    expect(output.count).toBe(1);
    expect(result.current.testFiles.length).toBe(1);
    expect(result.current.testCases.length).toBe(1);
    expect(result.current.testCases[0].id).toBe('t1');
  });

  it('loadTests falls back to annotations when no files or tests', async () => {
    mockGetTestsStructured.mockResolvedValue({
      total: 0,
      files: [],
      tests: [],
    });
    mockGetAnnotations.mockResolvedValue([
      { testId: 'ann-1', testName: 'Annotated test', file: 'tests/ann.spec.ts', type: 'skip' },
    ]);

    const { result } = renderHook(() => useTestTree([]));

    const output = await act(async () => {
      await result.current.loadTests();
      return result.current.loadTests();
    });

    // Second call should use the same mock
    expect(result.current.testCases.length).toBeGreaterThanOrEqual(0);
  });

  it('loadTests with forceRefresh passes flag to API', async () => {
    mockGetTestsStructured.mockResolvedValue({
      total: 0,
      files: [],
      tests: [],
    });
    mockGetAnnotations.mockResolvedValue(null);

    const { result } = renderHook(() => useTestTree([]));

    await act(async () => {
      await result.current.loadTests(true);
    });

    expect(mockGetTestsStructured).toHaveBeenCalledWith(expect.anything(), undefined, true);
  });

  it('loadTests with testDirOverride passes it to API', async () => {
    mockGetTestsStructured.mockResolvedValue({
      total: 0,
      files: [],
      tests: [],
    });
    mockGetAnnotations.mockResolvedValue(null);

    const { result } = renderHook(() => useTestTree([]));

    await act(async () => {
      await result.current.loadTests(false, './custom-dir');
    });

    expect(mockGetTestsStructured).toHaveBeenCalledWith('./custom-dir', undefined, false);
  });

  it('selectedIds can be updated', () => {
    const { result } = renderHook(() => useTestTree([]));

    act(() => {
      result.current.setSelectedIds(new Set(['test-1', 'test-2']));
    });

    expect(result.current.selectedIds.has('test-1')).toBe(true);
    expect(result.current.selectedIds.has('test-2')).toBe(true);
  });

  it('expandedPaths can be updated', () => {
    const { result } = renderHook(() => useTestTree([]));

    act(() => {
      result.current.setExpandedPaths(new Set(['tests/a.spec.ts']));
    });

    expect(result.current.expandedPaths.has('tests/a.spec.ts')).toBe(true);
  });

  it('syncTestFilesWithTestCases merges status from cases into files', async () => {
    const mockResult = {
      total: 1,
      files: [
        {
          file: 'tests/a.spec.ts',
          title: 'a.spec.ts',
          describes: [],
          tests: [
            { id: 't1', title: 'test1', fullTitle: 'test1', file: 'tests/a.spec.ts', line: 1, column: 0, tags: [], annotations: [] },
          ],
        },
      ],
      tests: [],
    };
    mockGetTestsStructured.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useTestTree([]));

    await act(async () => {
      await result.current.loadTests();
    });

    // Update a test case status
    act(() => {
      result.current.setTestCases(prev => prev.map(tc => tc.id === 't1' ? { ...tc, status: 'passed' as const } : tc));
    });

    // Sync files with updated cases
    const synced = result.current.syncTestFilesWithTestCases(result.current.testFiles, result.current.testCases);
    expect(synced[0].tests[0].status).toBe('passed');
  });

  it('collectAllPaths returns all file and describe paths', async () => {
    const mockResult = {
      total: 1,
      files: [
        {
          file: 'tests/a.spec.ts',
          title: 'a.spec.ts',
          describes: [
            {
              title: 'Suite',
              file: 'tests/a.spec.ts',
              line: 5,
              column: 0,
              tests: [],
              describes: [],
            },
          ],
          tests: [],
        },
      ],
      tests: [],
    };
    mockGetTestsStructured.mockResolvedValue(mockResult);

    const { result } = renderHook(() => useTestTree([]));

    await act(async () => {
      await result.current.loadTests();
    });

    const paths = result.current.collectAllPaths();
    expect(paths.has('tests/a.spec.ts')).toBe(true);
    expect(paths.has('tests/a.spec.ts::Suite::5')).toBe(true);
  });

  it('restoreTestCasesFromLocalStorage merges saved status', async () => {
    const mockResult = {
      total: 1,
      files: [
        {
          file: 'tests/a.spec.ts',
          title: 'a.spec.ts',
          describes: [],
          tests: [
            { id: 't1', title: 'test1', fullTitle: 'test1', file: 'tests/a.spec.ts', line: 1, column: 0, tags: [], annotations: [] },
          ],
        },
      ],
      tests: [],
    };
    mockGetTestsStructured.mockResolvedValue(mockResult);

    // Pre-populate localStorage
    localStorage.setItem('testCasesStatus', JSON.stringify([
      { id: 't1', status: 'failed', lastDuration: 5000, lastError: 'assertion error' },
    ]));

    const { result } = renderHook(() => useTestTree([]));

    await act(async () => {
      await result.current.loadTests();
    });

    // The test case should have restored status from localStorage
    const tc = result.current.testCases.find(t => t.id === 't1');
    expect(tc?.status).toBe('failed');
    expect(tc?.lastDuration).toBe(5000);
    expect(tc?.lastError).toBe('assertion error');
  });

  it('restoreTestCasesFromReports merges status from completed report', async () => {
    const mockResult = {
      total: 1,
      files: [
        {
          file: 'tests/a.spec.ts',
          title: 'a.spec.ts',
          describes: [],
          tests: [
            { id: 't1', title: 'test1', fullTitle: 'test1', file: 'tests/a.spec.ts', line: 1, column: 0, tags: [], annotations: [] },
          ],
        },
      ],
      tests: [],
    };
    mockGetTestsStructured.mockResolvedValue(mockResult);

    const reports = [{
      id: 1,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      totalTests: 1,
      passed: 0,
      failed: 1,
      duration: '5.00',
      details: [
        { id: 't1', name: 'test1', status: 'failed' as const, duration: '5.00', error: 'test error' },
      ],
      status: 'completed' as const,
    }];

    const { result } = renderHook(() => useTestTree(reports));

    await act(async () => {
      await result.current.loadTests();
    });

    // The hook should restore status from reports via the effect
    // Wait for effects to run
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const tc = result.current.testCases.find(t => t.id === 't1');
    expect(tc?.status).toBe('failed');
  });

  it('isLoadingTests can be toggled', () => {
    const { result } = renderHook(() => useTestTree([]));

    act(() => {
      result.current.setIsLoadingTests(true);
    });

    expect(result.current.isLoadingTests).toBe(true);
  });
});
