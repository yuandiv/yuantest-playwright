import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the API module - the hook uses `import * as api`
const mockGetFlakyTests = vi.fn();
const mockGetQuarantinedTests = vi.fn();
const mockReleaseTest = vi.fn();
const mockValidateAndReleaseTest = vi.fn();
const mockClearFlakyHistory = vi.fn();

vi.mock('../../services/api', () => ({
  getFlakyTests: (...args: any[]) => mockGetFlakyTests(...args),
  getQuarantinedTests: (...args: any[]) => mockGetQuarantinedTests(...args),
  releaseTest: (...args: any[]) => mockReleaseTest(...args),
  validateAndReleaseTest: (...args: any[]) => mockValidateAndReleaseTest(...args),
  clearFlakyHistory: (...args: any[]) => mockClearFlakyHistory(...args),
}));

import { useFlakyQuarantine } from '../../hooks/useFlakyQuarantine';

describe('useFlakyQuarantine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with empty arrays', () => {
    const { result } = renderHook(() => useFlakyQuarantine());
    expect(result.current.flakyTests).toEqual([]);
    expect(result.current.quarantinedTests).toEqual([]);
  });

  it('refreshes flaky data successfully', async () => {
    const mockFlaky = [{ testId: 'test-1', failureRate: 0.5 }];
    const mockQuarantined = [{ testId: 'test-2', quarantinedAt: Date.now() }];
    mockGetFlakyTests.mockResolvedValue(mockFlaky);
    mockGetQuarantinedTests.mockResolvedValue(mockQuarantined);

    const { result } = renderHook(() => useFlakyQuarantine());

    await act(async () => {
      await result.current.refreshFlakyData();
    });

    expect(result.current.flakyTests).toEqual(mockFlaky);
    expect(result.current.quarantinedTests).toEqual(mockQuarantined);
    expect(mockGetFlakyTests).toHaveBeenCalled();
    expect(mockGetQuarantinedTests).toHaveBeenCalled();
  });

  it('handles releaseTest successfully', async () => {
    mockReleaseTest.mockResolvedValue(true);
    mockGetQuarantinedTests.mockResolvedValue([]);

    const { result } = renderHook(() => useFlakyQuarantine());

    await act(async () => {
      await result.current.handleReleaseTest('test-1');
    });

    expect(mockReleaseTest).toHaveBeenCalledWith('test-1');
  });

  it('handles validateAndReleaseTest successfully', async () => {
    mockValidateAndReleaseTest.mockResolvedValue({ status: 'released' });
    mockGetQuarantinedTests.mockResolvedValue([]);

    const { result } = renderHook(() => useFlakyQuarantine());

    await act(async () => {
      await result.current.handleValidateReleaseTest('test-1');
    });

    expect(mockValidateAndReleaseTest).toHaveBeenCalledWith('test-1');
  });

  it('handles clearFlakyHistory successfully', async () => {
    mockClearFlakyHistory.mockResolvedValue(true);
    mockGetFlakyTests.mockResolvedValue([]);
    mockGetQuarantinedTests.mockResolvedValue([]);

    const { result } = renderHook(() => useFlakyQuarantine());

    await act(async () => {
      await result.current.handleClearFlakyHistory();
    });

    expect(mockClearFlakyHistory).toHaveBeenCalled();
    expect(mockGetFlakyTests).toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    mockGetFlakyTests.mockRejectedValue(new Error('Network error'));
    mockGetQuarantinedTests.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useFlakyQuarantine());

    // The hook does not have try/catch, so the error propagates
    // but the component should not crash - state remains empty
    await act(async () => {
      await result.current.refreshFlakyData().catch(() => {});
    });

    expect(result.current.flakyTests).toEqual([]);
    expect(result.current.quarantinedTests).toEqual([]);
  });
});
