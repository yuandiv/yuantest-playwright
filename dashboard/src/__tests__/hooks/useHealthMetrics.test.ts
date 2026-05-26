import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the API module - the hook uses `import * as api`
const mockGetHealthMetrics = vi.fn();

vi.mock('../../services/api', () => ({
  getHealthMetrics: (...args: any[]) => mockGetHealthMetrics(...args),
}));

import { useHealthMetrics } from '../../hooks/useHealthMetrics';

describe('useHealthMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state with empty metrics and hidden dashboard', () => {
    const { result } = renderHook(() => useHealthMetrics());
    expect(result.current.healthMetrics).toEqual([]);
    expect(result.current.showHealthDashboard).toBe(false);
  });

  it('loads health metrics successfully', async () => {
    const mockMetrics = [
      { date: '2024-01-15', timestamp: Date.now(), runStatus: { passed: 45, failed: 5, total: 50, passRate: 90 } },
    ];
    mockGetHealthMetrics.mockResolvedValue(mockMetrics);

    const { result } = renderHook(() => useHealthMetrics());

    await act(async () => {
      await result.current.loadHealthMetrics();
    });

    expect(result.current.healthMetrics).toEqual(mockMetrics);
    expect(mockGetHealthMetrics).toHaveBeenCalled();
  });

  it('does not update state when API returns null', async () => {
    mockGetHealthMetrics.mockResolvedValue(null);

    const { result } = renderHook(() => useHealthMetrics());

    await act(async () => {
      await result.current.loadHealthMetrics();
    });

    expect(result.current.healthMetrics).toEqual([]);
  });

  it('does not crash when API throws error', async () => {
    mockGetHealthMetrics.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useHealthMetrics());

    await act(async () => {
      await result.current.loadHealthMetrics();
    });

    expect(result.current.healthMetrics).toEqual([]);
  });

  it('toggles showHealthDashboard', () => {
    const { result } = renderHook(() => useHealthMetrics());
    expect(result.current.showHealthDashboard).toBe(false);

    act(() => {
      result.current.setShowHealthDashboard(true);
    });

    expect(result.current.showHealthDashboard).toBe(true);
  });
});
