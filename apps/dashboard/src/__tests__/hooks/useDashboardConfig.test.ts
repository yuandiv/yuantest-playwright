import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock the constants module
vi.mock('../../constants/dashboard', () => ({
  DEFAULT_CONFIG: {
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-15',
    },
    activeTab: 'runStatus',
    chartType: 'bar' as const,
  },
  STORAGE_KEY: 'healthDashboardConfig',
}));

import { useDashboardConfig } from '../../hooks/useDashboardConfig';

describe('useDashboardConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns default config when localStorage is empty', () => {
    const { result } = renderHook(() => useDashboardConfig());
    expect(result.current.config.activeTab).toBe('runStatus');
    expect(result.current.config.chartType).toBe('bar');
  });

  it('loads config from localStorage', () => {
    const savedConfig = { activeTab: 'runDuration', chartType: 'line' as const };
    localStorage.setItem('healthDashboardConfig', JSON.stringify(savedConfig));

    const { result } = renderHook(() => useDashboardConfig());
    expect(result.current.config.activeTab).toBe('runDuration');
    expect(result.current.config.chartType).toBe('line');
  });

  it('falls back to default when localStorage has invalid JSON', () => {
    localStorage.setItem('healthDashboardConfig', 'not-json');

    const { result } = renderHook(() => useDashboardConfig());
    expect(result.current.config.activeTab).toBe('runStatus');
  });

  it('updates config and saves to localStorage', () => {
    const { result } = renderHook(() => useDashboardConfig());

    act(() => {
      result.current.setConfig((prev: any) => ({ ...prev, activeTab: 'testFlakiness' }));
    });

    expect(result.current.config.activeTab).toBe('testFlakiness');
    const saved = JSON.parse(localStorage.getItem('healthDashboardConfig') || '{}');
    expect(saved.activeTab).toBe('testFlakiness');
  });

  it('resets config to defaults', () => {
    const { result } = renderHook(() => useDashboardConfig());

    act(() => {
      result.current.setConfig((prev: any) => ({ ...prev, activeTab: 'testFlakiness' }));
    });

    act(() => {
      result.current.resetConfig();
    });

    expect(result.current.config.activeTab).toBe('runStatus');
  });

  it('sets date range', () => {
    const { result } = renderHook(() => useDashboardConfig());

    act(() => {
      result.current.setDateRange('2024-01-01', '2024-01-31');
    });

    expect(result.current.config.dateRange.start).toBe('2024-01-01');
    expect(result.current.config.dateRange.end).toBe('2024-01-31');
  });

  it('sets active tab', () => {
    const { result } = renderHook(() => useDashboardConfig());

    act(() => {
      result.current.setActiveTab('failureAnalysis');
    });

    expect(result.current.config.activeTab).toBe('failureAnalysis');
  });
});
