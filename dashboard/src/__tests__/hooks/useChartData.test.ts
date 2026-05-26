import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useChartData } from '../../hooks/useChartData';
import type { HealthMetric } from '../../types';

function createMockMetric(overrides: Partial<HealthMetric> = {}): HealthMetric {
  return {
    date: '2024-01-15',
    timestamp: Date.now(),
    runStatus: { passed: 45, failed: 5, total: 50, passRate: 90 },
    runDuration: 150000,
    testSuiteSize: { total: 50, passed: 45, failed: 5 },
    testFlakiness: { flakyCount: 2, flakyRate: 0.05, totalRuns: 15 },
    ...overrides,
  };
}

describe('useChartData', () => {
  it('returns empty chartData and null stats for empty array', () => {
    const { result } = renderHook(() => useChartData([]));
    expect(result.current.chartData).toEqual([]);
    expect(result.current.stats).toBeNull();
    expect(result.current.hasData).toBe(false);
  });

  it('returns empty chartData and null stats for non-array input', () => {
    const { result } = renderHook(() => useChartData(null as any));
    expect(result.current.chartData).toEqual([]);
    expect(result.current.stats).toBeNull();
  });

  it('maps HealthMetric to HealthTrendData correctly', () => {
    const metric = createMockMetric();
    const { result } = renderHook(() => useChartData([metric]));

    expect(result.current.chartData).toHaveLength(1);
    const chartItem = result.current.chartData[0];
    expect(chartItem.date).toBe('2024-01-15');
    expect(chartItem.passed).toBe(45);
    expect(chartItem.failed).toBe(5);
    expect(chartItem.passRate).toBe(90);
    expect(chartItem.duration).toBe(150000);
    expect(chartItem.suiteSize).toBe(50);
    expect(chartItem.flakyRate).toBe(5); // 0.05 * 100
    expect(chartItem.flakyCount).toBe(2);
  });

  it('multiplies flakyRate by 100', () => {
    const metric = createMockMetric({
      testFlakiness: { flakyCount: 3, flakyRate: 0.15, totalRuns: 20 },
    });
    const { result } = renderHook(() => useChartData([metric]));

    expect(result.current.chartData[0].flakyRate).toBe(15);
  });

  it('handles missing/invalid fields with safeNumber defaults', () => {
    const metric = createMockMetric({
      runStatus: { passed: undefined as any, failed: undefined as any, total: undefined as any, passRate: undefined as any },
      runDuration: undefined as any,
    });
    const { result } = renderHook(() => useChartData([metric]));

    expect(result.current.chartData[0].passed).toBe(0);
    expect(result.current.chartData[0].failed).toBe(0);
    expect(result.current.chartData[0].passRate).toBe(0);
    expect(result.current.chartData[0].duration).toBe(0);
  });

  it('calculates stats correctly for single data point', () => {
    const metric = createMockMetric();
    const { result } = renderHook(() => useChartData([metric]));

    const stats = result.current.stats!;
    expect(stats.latestPassRate).toBe(90);
    expect(stats.avgPassRate).toBe(90);
    expect(stats.avgDuration).toBe(150000);
    expect(stats.totalTests).toBe(50);
    expect(stats.totalFlaky).toBe(2);
    expect(stats.dataPoints).toBe(1);
  });

  it('calculates stats correctly for multiple data points', () => {
    const metrics = [
      createMockMetric({ date: '2024-01-13', runStatus: { passed: 40, failed: 10, total: 50, passRate: 80 }, runDuration: 100000 }),
      createMockMetric({ date: '2024-01-14', runStatus: { passed: 45, failed: 5, total: 50, passRate: 90 }, runDuration: 200000 }),
      createMockMetric({ date: '2024-01-15', runStatus: { passed: 48, failed: 2, total: 50, passRate: 96 }, runDuration: 150000 }),
    ];
    const { result } = renderHook(() => useChartData(metrics));

    const stats = result.current.stats!;
    expect(stats.latestPassRate).toBe(96);
    expect(stats.avgPassRate).toBeCloseTo(88.67, 0);
    expect(stats.avgDuration).toBeCloseTo(150000, 0);
    expect(stats.totalTests).toBe(150); // 50+50+50
    expect(stats.dataPoints).toBe(3);
  });

  it('calculates trend as stable when previous is 0', () => {
    const metrics = [
      createMockMetric({ date: '2024-01-14', runStatus: { passed: 0, failed: 0, total: 0, passRate: 0 } }),
      createMockMetric({ date: '2024-01-15', runStatus: { passed: 45, failed: 5, total: 50, passRate: 90 } }),
    ];
    const { result } = renderHook(() => useChartData(metrics));

    const stats = result.current.stats!;
    expect(stats.trends.passRate.direction).toBe('stable');
  });

  it('calculates trend as up when change > 0.5', () => {
    const metrics = [
      createMockMetric({ date: '2024-01-14', runStatus: { passed: 40, failed: 10, total: 50, passRate: 80 } }),
      createMockMetric({ date: '2024-01-15', runStatus: { passed: 48, failed: 2, total: 50, passRate: 96 } }),
    ];
    const { result } = renderHook(() => useChartData(metrics));

    const stats = result.current.stats!;
    expect(stats.trends.passRate.direction).toBe('up');
  });

  it('calculates trend as down when change < -0.5', () => {
    const metrics = [
      createMockMetric({ date: '2024-01-14', runStatus: { passed: 48, failed: 2, total: 50, passRate: 96 } }),
      createMockMetric({ date: '2024-01-15', runStatus: { passed: 40, failed: 10, total: 50, passRate: 80 } }),
    ];
    const { result } = renderHook(() => useChartData(metrics));

    const stats = result.current.stats!;
    expect(stats.trends.passRate.direction).toBe('down');
  });

  it('limits sparkline to 7 recent data points', () => {
    const metrics = Array.from({ length: 10 }, (_, i) =>
      createMockMetric({ date: `2024-01-${String(i + 1).padStart(2, '0')}` })
    );
    const { result } = renderHook(() => useChartData(metrics));

    const stats = result.current.stats!;
    expect(stats.sparkline.passRate).toHaveLength(7);
  });

  it('filters out data points without date', () => {
    const metrics = [
      createMockMetric({ date: '' }),
      createMockMetric({ date: '2024-01-15' }),
    ];
    const { result } = renderHook(() => useChartData(metrics as any));

    expect(result.current.chartData).toHaveLength(1);
    expect(result.current.chartData[0].date).toBe('2024-01-15');
  });

  it('hasData is true when chartData is non-empty', () => {
    const metric = createMockMetric();
    const { result } = renderHook(() => useChartData([metric]));
    expect(result.current.hasData).toBe(true);
  });
});
