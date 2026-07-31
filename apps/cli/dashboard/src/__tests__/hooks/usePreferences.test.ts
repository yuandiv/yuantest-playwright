import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock API
const mockGetPreferences = vi.fn();
const mockSavePreferences = vi.fn();
const mockSetApiLang = vi.fn();

vi.mock('../../services/api', () => ({
  getPreferences: (...args: any[]) => mockGetPreferences(...args),
  savePreferences: (...args: any[]) => mockSavePreferences(...args),
  setApiLang: (...args: any[]) => mockSetApiLang(...args),
}));

import { usePreferences } from '../../hooks/usePreferences';

describe('usePreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPreferences.mockResolvedValue({
      lang: 'zh',
      lastVersion: '2.0.0',
      testDir: './e2e',
    });
    mockSavePreferences.mockResolvedValue(true);
  });

  it('returns default values initially', () => {
    const { result } = renderHook(() => usePreferences());

    // Before API response, should have defaults
    expect(result.current.lang).toBe('zh');
    expect(result.current.versionInput).toBe('1.0.0');
    expect(result.current.testDir).toBe('./');
  });

  it('loads preferences on mount', async () => {
    renderHook(() => usePreferences());

    // Wait for the async load
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockGetPreferences).toHaveBeenCalled();
  });

  it('updates state from loaded preferences', async () => {
    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.lang).toBe('zh');
    expect(result.current.versionInput).toBe('2.0.0');
    expect(result.current.testDir).toBe('./e2e');
  });

  it('calls setApiLang when loading preferences with lang', async () => {
    renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mockSetApiLang).toHaveBeenCalledWith('zh');
  });

  it('switches language and saves', async () => {
    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.switchLang('en');
    });

    expect(result.current.lang).toBe('en');
    expect(mockSetApiLang).toHaveBeenCalledWith('en');
    expect(mockSavePreferences).toHaveBeenCalledWith({ lang: 'en' });
  });

  it('handles null preferences gracefully', async () => {
    mockGetPreferences.mockResolvedValue(null);

    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Should keep defaults
    expect(result.current.lang).toBe('zh');
    expect(result.current.versionInput).toBe('1.0.0');
    expect(result.current.testDir).toBe('./');
  });

  it('handles partial preferences', async () => {
    mockGetPreferences.mockResolvedValue({ lang: 'en' });

    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.lang).toBe('en');
    // Other fields should keep defaults
    expect(result.current.versionInput).toBe('1.0.0');
    expect(result.current.testDir).toBe('./');
  });

  it('loads criteriaParams from preferences', async () => {
    mockGetPreferences.mockResolvedValue({
      lang: 'zh',
      flakyCriteria: { threshold: 0.5, minRuns: 5 },
      quarantineCriteria: { failureRate: 0.8 },
    });

    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(result.current.criteriaParams.flakyCriteria).toEqual({ threshold: 0.5, minRuns: 5 });
    expect(result.current.criteriaParams.quarantineCriteria).toEqual({ failureRate: 0.8 });
  });

  it('filters non-number values from criteriaParams', async () => {
    mockGetPreferences.mockResolvedValue({
      lang: 'zh',
      flakyCriteria: { threshold: 0.5, name: 'test' },
      quarantineCriteria: { failureRate: 0.8 },
    });

    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Only number values should be kept
    expect(result.current.criteriaParams.flakyCriteria).toEqual({ threshold: 0.5 });
  });

  it('setVersionInput updates state', async () => {
    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setVersionInput('3.0.0');
    });

    expect(result.current.versionInput).toBe('3.0.0');
  });

  it('setTestDir updates state', async () => {
    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setTestDir('./tests');
    });

    expect(result.current.testDir).toBe('./tests');
  });

  it('saves preferences when version changes to non-default value', async () => {
    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setVersionInput('3.0.0');
    });

    // Wait for the debounced save (1 second)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1200));
    });

    expect(mockSavePreferences).toHaveBeenCalledWith({ lastVersion: '3.0.0' });
  });

  it('setCriteriaParams updates state', async () => {
    const { result } = renderHook(() => usePreferences());

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.setCriteriaParams({ flakyCriteria: { threshold: 0.3 } });
    });

    expect(result.current.criteriaParams.flakyCriteria).toEqual({ threshold: 0.3 });
  });
});
