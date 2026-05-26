import { describe, it, expect, vi } from 'vitest';

// Mock the i18n module
vi.mock('../../i18n', () => ({
  t: (key: string, _lang?: string) => key,
  Lang: undefined,
}));

import { formatDuration, getTrendLabel, getPassRateColor, getStabilityLevel, formatDate } from '../../utils/dashboardHelpers';

describe('formatDuration', () => {
  it('formats seconds when < 60s', () => {
    expect(formatDuration(45200, 'zh')).toBe('45.2s');
  });

  it('formats 0ms as 0.0s', () => {
    expect(formatDuration(0, 'zh')).toBe('0.0s');
  });

  it('formats minutes and seconds when >= 60s', () => {
    expect(formatDuration(150000, 'zh')).toBe('2m 30s');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(120000, 'zh')).toBe('2m 0s');
  });

  it('formats large durations', () => {
    expect(formatDuration(3661000, 'zh')).toBe('61m 1s');
  });
});

describe('getTrendLabel', () => {
  it('returns stable when diff < 2%', () => {
    const result = getTrendLabel(100, 99.5, 'zh');
    expect(result.color).toBe('text-gray-500');
    expect(result.icon).toBe('→');
  });

  it('returns up trend when current > avg by >= 2%', () => {
    const result = getTrendLabel(105, 100, 'zh');
    expect(result.color).toBe('text-green-600');
    expect(result.icon).toBe('↑');
    expect(result.text).toContain('5%');
  });

  it('returns down trend when current < avg by >= 2%', () => {
    const result = getTrendLabel(95, 100, 'zh');
    expect(result.color).toBe('text-red-500');
    expect(result.icon).toBe('↓');
    expect(result.text).toContain('5%');
  });

  it('inverts trend when invert=true', () => {
    const result = getTrendLabel(105, 100, 'zh', true);
    // Higher value with invert=true means negative trend
    expect(result.color).toBe('text-red-500');
    expect(result.icon).toBe('↓');
  });

  it('inverts up trend when invert=true and value is lower', () => {
    const result = getTrendLabel(95, 100, 'zh', true);
    // Lower value with invert=true means positive trend
    expect(result.color).toBe('text-green-600');
    expect(result.icon).toBe('↑');
  });
});

describe('getPassRateColor', () => {
  it('returns green for >= 80%', () => {
    expect(getPassRateColor(80)).toEqual({ color: 'text-green-600', barColor: '#16a34a' });
    expect(getPassRateColor(100)).toEqual({ color: 'text-green-600', barColor: '#16a34a' });
  });

  it('returns amber for 50-79%', () => {
    expect(getPassRateColor(50)).toEqual({ color: 'text-amber-600', barColor: '#d97706' });
    expect(getPassRateColor(79)).toEqual({ color: 'text-amber-600', barColor: '#d97706' });
  });

  it('returns red for < 50%', () => {
    expect(getPassRateColor(0)).toEqual({ color: 'text-red-600', barColor: '#dc2626' });
    expect(getPassRateColor(49)).toEqual({ color: 'text-red-600', barColor: '#dc2626' });
  });
});

describe('getStabilityLevel', () => {
  it('returns high for flakyRate <= 10', () => {
    expect(getStabilityLevel(0)).toEqual({ level: 'high', color: 'text-green-600', bg: 'bg-green-50 border-green-200' });
    expect(getStabilityLevel(10)).toEqual({ level: 'high', color: 'text-green-600', bg: 'bg-green-50 border-green-200' });
  });

  it('returns medium for flakyRate 10-30', () => {
    expect(getStabilityLevel(11)).toEqual({ level: 'medium', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' });
    expect(getStabilityLevel(30)).toEqual({ level: 'medium', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' });
  });

  it('returns low for flakyRate > 30', () => {
    expect(getStabilityLevel(31)).toEqual({ level: 'low', color: 'text-red-600', bg: 'bg-red-50 border-red-200' });
    expect(getStabilityLevel(100)).toEqual({ level: 'low', color: 'text-red-600', bg: 'bg-red-50 border-red-200' });
  });
});

describe('formatDate', () => {
  it('formats date in English', () => {
    const result = formatDate('2024-01-15', 'en');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('formats date in Chinese', () => {
    const result = formatDate('2024-01-15', 'zh');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
