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
export function useChartData(data: HealthMetric[]) {
  const chartData: HealthTrendData[] = useMemo(() => {
    return data.map(d => ({
      date: d.date,
      passed: d.runStatus.passed,
      failed: d.runStatus.failed,
      passRate: d.runStatus.passRate,
      duration: d.runDuration,
      suiteSize: d.testSuiteSize.total,
      flakyRate: d.testFlakiness.flakyRate * 100,
      flakyCount: d.testFlakiness.flakyCount,
    }));
  }, [data]);

  const stats: EnhancedChartStats | null = useMemo(() => {
    if (chartData.length === 0) return null;

    const latest = chartData[chartData.length - 1];
    const previous = chartData.length > 1 ? chartData[chartData.length - 2] : latest;
    
    const avgPassRate = chartData.reduce((sum, d) => sum + d.passRate, 0) / chartData.length;
    const avgDuration = chartData.reduce((sum, d) => sum + d.duration, 0) / chartData.length;
    const avgFlakyRate = chartData.reduce((sum, d) => sum + d.flakyRate, 0) / chartData.length;
    const totalTests = chartData.reduce((sum, d) => sum + (d.passed + d.failed), 0);
    const totalFlaky = chartData.reduce((sum, d) => sum + d.flakyCount, 0);

    const sparklineLength = Math.min(7, chartData.length);
    const recentData = chartData.slice(-sparklineLength);

    return {
      latestPassRate: latest.passRate,
      avgPassRate,
      avgDuration,
      avgFlakyRate,
      totalTests,
      totalFlaky,
      dataPoints: chartData.length,
      trends: {
        passRate: calculateTrend(latest.passRate, previous.passRate, false),
        duration: calculateTrend(latest.duration, previous.duration, true),
        totalTests: calculateTrend(latest.suiteSize, previous.suiteSize, false),
        flakyCount: calculateTrend(latest.flakyCount, previous.flakyCount, true),
      },
      sparkline: {
        passRate: recentData.map(d => d.passRate),
        duration: recentData.map(d => d.duration / 1000),
        totalTests: recentData.map(d => d.suiteSize),
        flakyCount: recentData.map(d => d.flakyCount),
      },
    };
  }, [chartData]);

  return {
    chartData,
    stats,
    hasData: chartData.length > 0,
  };
}
