import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock API
const mockGetRuns = vi.fn();

vi.mock('../../services/api', () => ({
  getRuns: (...args: any[]) => mockGetRuns(...args),
}));

import { useReports } from '../../hooks/useReports';

describe('useReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with empty reports', () => {
    const { result } = renderHook(() => useReports());
    expect(result.current.reports).toEqual([]);
    expect(result.current.activeReportId).toBeNull();
    expect(result.current.isExecutingFromReports).toBe(false);
  });

  it('sets active report ID', () => {
    const { result } = renderHook(() => useReports());

    act(() => {
      result.current.setActiveReportId(1);
    });

    expect(result.current.activeReportId).toBe(1);
  });

  it('clears active report ID', () => {
    const { result } = renderHook(() => useReports());

    act(() => {
      result.current.setActiveReportId(1);
    });

    act(() => {
      result.current.setActiveReportId(null);
    });

    expect(result.current.activeReportId).toBeNull();
  });

  it('loadRunsFromServer handles null response', async () => {
    mockGetRuns.mockResolvedValue(null);

    const { result } = renderHook(() => useReports());

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(mockGetRuns).toHaveBeenCalledWith(20);
    expect(result.current.reports).toEqual([]);
  });

  it('loadRunsFromServer handles API error gracefully', async () => {
    mockGetRuns.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useReports());

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(result.current.reports).toEqual([]);
  });

  it('loadRunsFromServer processes runs from array response', async () => {
    const mockRuns = [
      {
        id: 1,
        status: 'success',
        startTime: Date.now(),
        totalTests: 10,
        passed: 8,
        failed: 2,
        duration: 5000,
        version: '1.0.0',
        suites: [],
      },
    ];
    mockGetRuns.mockResolvedValue(mockRuns);

    // Mock fetch for raw report
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useReports());

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(mockGetRuns).toHaveBeenCalledWith(20);
    expect(result.current.reports.length).toBe(1);
    expect(result.current.reports[0].id).toBe(1);
    expect(result.current.reports[0].totalTests).toBe(10);
    expect(result.current.reports[0].passed).toBe(8);
    expect(result.current.reports[0].failed).toBe(2);
    expect(result.current.reports[0].status).toBe('completed'); // 'success' maps to 'completed'

    vi.unstubAllGlobals();
  });

  it('loadRunsFromServer processes runs from object with data property', async () => {
    const mockRuns = [
      {
        id: 2,
        status: 'failed',
        startTime: Date.now(),
        totalTests: 5,
        passed: 3,
        failed: 2,
        duration: 3000,
        version: '2.0.0',
        suites: [],
      },
    ];
    mockGetRuns.mockResolvedValue({ data: mockRuns });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useReports());

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(result.current.reports.length).toBe(1);
    expect(result.current.reports[0].id).toBe(2);
    expect(result.current.reports[0].status).toBe('failed');

    vi.unstubAllGlobals();
  });

  it('loadRunsFromServer sets activeReportId for running report', async () => {
    const mockRuns = [
      {
        id: 3,
        status: 'running',
        startTime: Date.now(),
        totalTests: 5,
        passed: 0,
        failed: 0,
        duration: 1000,
        version: '1.0.0',
        suites: [],
      },
    ];
    mockGetRuns.mockResolvedValue(mockRuns);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useReports());

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(result.current.activeReportId).toBe(3);
    expect(result.current.isExecutingFromReports).toBe(true);

    vi.unstubAllGlobals();
  });

  it('loadRunsFromServer merges with existing reports', async () => {
    const mockRuns1 = [
      {
        id: 1,
        status: 'success',
        startTime: Date.now() - 2000,
        totalTests: 5,
        passed: 5,
        failed: 0,
        duration: 3000,
        version: '1.0.0',
        suites: [],
      },
    ];
    mockGetRuns.mockResolvedValue(mockRuns1);

    const mockFetch = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useReports());

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(result.current.reports.length).toBe(1);

    // Second load with different run
    const mockRuns2 = [
      {
        id: 2,
        status: 'success',
        startTime: Date.now(),
        totalTests: 3,
        passed: 3,
        failed: 0,
        duration: 2000,
        version: '1.0.0',
        suites: [],
      },
    ];
    mockGetRuns.mockResolvedValue(mockRuns2);

    await act(async () => {
      await result.current.loadRunsFromServer();
    });

    expect(result.current.reports.length).toBe(2);

    vi.unstubAllGlobals();
  });

  it('setReports allows direct state update', () => {
    const { result } = renderHook(() => useReports());

    act(() => {
      result.current.setReports([{
        id: 99,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        totalTests: 1,
        passed: 1,
        failed: 0,
        duration: '1.00',
        details: [],
      }]);
    });

    expect(result.current.reports.length).toBe(1);
    expect(result.current.reports[0].id).toBe(99);
  });
});
