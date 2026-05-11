import { useMemo } from 'react';
import { HealthMetric, HealthTrendData, EnhancedChartStats, TrendIndicator } from '../types';

/**
 * 计算趋势指标
 * @param current - 当前值
 * @param previous - 之前值
 * @param isLowerBetter - 是否越低越好
 */
function calculateTrend(current: number, previous: number, isLowerBetter: boolean = false): TrendIndicator {
  if (previous === 0) {
    return {
      value: 0,
      direction: 'stable',
      isPositive: true,
      previousValue: previous,
    };
  }

  const change = current - previous;
  const direction = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'stable';
  const isPositive = isLowerBetter ? change < 0 : change > 0;

  return {
    value: Math.abs(change),
    direction,
    isPositive,
    previousValue: previous,
  };
}

/**
 * 图表数据处理 Hook
 * 负责将原始健康指标数据转换为图表数据格式，并计算统计信息和趋势
 * @param data - 原始健康指标数据数组
 * @returns 图表数据、统计信息和趋势数据
 */
function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return value;
}

export function useChartData(data: HealthMetric[]) {
  const chartData: HealthTrendData[] = useMemo(() => {
    if (!Array.isArray(data) || data.length === 0) return [];
    
    return data.map(d => ({
      date: d.date || '',
      passed: safeNumber(d?.runStatus?.passed, 0),
      failed: safeNumber(d?.runStatus?.failed, 0),
      passRate: safeNumber(d?.runStatus?.passRate, 0),
      duration: safeNumber(d?.runDuration, 0),
      suiteSize: safeNumber(d?.testSuiteSize?.total, 0),
      flakyRate: safeNumber(d?.testFlakiness?.flakyRate, 0) * 100,
      flakyCount: safeNumber(d?.testFlakiness?.flakyCount, 0),
    })).filter(d => d.date);
  }, [data]);

  const stats: EnhancedChartStats | null = useMemo(() => {
    if (chartData.length === 0) return null;

    const latest = chartData[chartData.length - 1];
    const previous = chartData.length > 1 ? chartData[chartData.length - 2] : latest;
    
    const avgPassRate = safeNumber(chartData.reduce((sum, d) => sum + safeNumber(d.passRate, 0), 0) / chartData.length, 0);
    const avgDuration = safeNumber(chartData.reduce((sum, d) => sum + safeNumber(d.duration, 0), 0) / chartData.length, 0);
    const avgFlakyRate = safeNumber(chartData.reduce((sum, d) => sum + safeNumber(d.flakyRate, 0), 0) / chartData.length, 0);
    const totalTests = chartData.reduce((sum, d) => sum + (safeNumber(d.passed, 0) + safeNumber(d.failed, 0)), 0);
    const totalFlaky = chartData.reduce((sum, d) => sum + safeNumber(d.flakyCount, 0), 0);

    const sparklineLength = Math.min(7, chartData.length);
    const recentData = chartData.slice(-sparklineLength);

    return {
      latestPassRate: safeNumber(latest?.passRate, 0),
      avgPassRate,
      avgDuration,
      avgFlakyRate,
      totalTests,
      totalFlaky,
      dataPoints: chartData.length,
      trends: {
        passRate: calculateTrend(safeNumber(latest?.passRate, 0), safeNumber(previous?.passRate, 0), false),
        duration: calculateTrend(safeNumber(latest?.duration, 0), safeNumber(previous?.duration, 0), true),
        totalTests: calculateTrend(safeNumber(latest?.suiteSize, 0), safeNumber(previous?.suiteSize, 0), false),
        flakyCount: calculateTrend(safeNumber(latest?.flakyCount, 0), safeNumber(previous?.flakyCount, 0), true),
      },
      sparkline: {
        passRate: recentData.map(d => safeNumber(d.passRate, 0)),
        duration: recentData.map(d => safeNumber(d.duration, 0) / 1000),
        totalTests: recentData.map(d => safeNumber(d.suiteSize, 0)),
        flakyCount: recentData.map(d => safeNumber(d.flakyCount, 0)),
      },
    };
  }, [chartData]);

  return {
    chartData,
    stats,
    hasData: chartData.length > 0,
  };
}
