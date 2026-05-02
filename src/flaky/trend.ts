import {
  FlakyTest,
  FlakyHistoryEntry,
  TrendDataPoint,
  TrendAnalysis,
  TrendDirection,
  ChangePoint,
  SeasonalPattern,
  CodeChangeCorrelation,
  TrendForecast,
  FlakyHealthScore,
} from '../types';
import { FLAKY_CONFIG } from '../constants';

/** 趋势分析配置 */
export interface TrendConfig {
  aggregationWindowDays: number;
  minDataPoints: number;
  changePointThreshold: number;
  seasonalMinCycles: number;
  forecastDays: number;
}

/** 默认趋势分析配置 */
const DEFAULT_TREND_CONFIG: TrendConfig = {
  aggregationWindowDays: FLAKY_CONFIG.TREND_AGGREGATION_WINDOW_DAYS,
  minDataPoints: FLAKY_CONFIG.TREND_MIN_DATA_POINTS,
  changePointThreshold: FLAKY_CONFIG.TREND_CHANGE_POINT_THRESHOLD,
  seasonalMinCycles: FLAKY_CONFIG.TREND_SEASONAL_MIN_CYCLES,
  forecastDays: 7,
};

/**
 * 将历史记录聚合为时间序列数据点
 * 按天聚合，计算每天的通过率、失败率、平均持续时间和 Flaky 计数
 * @param history - 测试运行历史记录数组
 * @param windowDays - 聚合窗口天数，默认 7
 * @returns 时间序列数据点数组
 */
export function aggregateTimeSeries(
  history: FlakyHistoryEntry[],
  windowDays: number = FLAKY_CONFIG.TREND_AGGREGATION_WINDOW_DAYS
): TrendDataPoint[] {
  if (history.length === 0) {
    return [];
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const earliest = sorted[0].timestamp;
  const latest = sorted[sorted.length - 1].timestamp;

  const buckets = new Map<
    string,
    { passed: number; failed: number; durations: number[]; total: number }
  >();

  for (const entry of sorted) {
    const bucketKey = new Date(entry.timestamp).toISOString().split('T')[0];
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { passed: 0, failed: 0, durations: [], total: 0 });
    }
    const bucket = buckets.get(bucketKey)!;
    bucket.total++;
    bucket.durations.push(entry.duration);
    if (entry.status === 'passed') {
      bucket.passed++;
    } else if (entry.status === 'failed' || entry.status === 'timedout') {
      bucket.failed++;
    }
  }

  const dataPoints: TrendDataPoint[] = [];
  const bucketKeys = Array.from(buckets.keys()).sort();

  for (const key of bucketKeys) {
    const bucket = buckets.get(key)!;
    const avgDuration =
      bucket.durations.length > 0
        ? bucket.durations.reduce((s, d) => s + d, 0) / bucket.durations.length
        : 0;

    dataPoints.push({
      timestamp: new Date(key).getTime(),
      passRate: bucket.total > 0 ? bucket.passed / bucket.total : 0,
      failRate: bucket.total > 0 ? bucket.failed / bucket.total : 0,
      avgDuration,
      flakyCount: bucket.failed,
      totalRuns: bucket.total,
    });
  }

  if (windowDays > 1 && dataPoints.length > 1) {
    return applyMovingAverage(dataPoints, windowDays);
  }

  return dataPoints;
}

/**
 * 应用移动平均平滑时间序列
 * 减少噪声，突出趋势
 * @param dataPoints - 原始时间序列数据点
 * @param windowSize - 移动平均窗口大小
 * @returns 平滑后的时间序列数据点
 */
function applyMovingAverage(dataPoints: TrendDataPoint[], windowSize: number): TrendDataPoint[] {
  return dataPoints.map((dp, i) => {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(dataPoints.length, i + Math.ceil(windowSize / 2));
    const window = dataPoints.slice(start, end);

    return {
      ...dp,
      passRate: window.reduce((s, w) => s + w.passRate, 0) / window.length,
      failRate: window.reduce((s, w) => s + w.failRate, 0) / window.length,
      avgDuration: window.reduce((s, w) => s + w.avgDuration, 0) / window.length,
    };
  });
}

/**
 * 计算线性回归拟合
 * 使用最小二乘法拟合直线 y = slope * x + intercept
 * @param values - 数值数组
 * @returns 斜率、截距和 R² 决定系数
 */
export function linearRegression(values: number[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  if (values.length < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }

  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;

  let ssXY = 0;
  let ssXX = 0;
  let ssTot = 0;

  for (let i = 0; i < n; i++) {
    ssXY += (i - xMean) * (values[i] - yMean);
    ssXX += (i - xMean) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }

  if (ssXX === 0 || ssTot === 0) {
    return { slope: 0, intercept: yMean, r2: 0 };
  }

  const slope = ssXY / ssXX;
  const intercept = yMean - slope * xMean;

  const ssRes = values.reduce((s, v, i) => {
    const predicted = slope * i + intercept;
    return s + (v - predicted) ** 2;
  }, 0);

  const r2 = Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2 };
}

/**
 * 检测趋势方向
 * 基于线性回归斜率和 R² 值判断趋势方向
 * @param dataPoints - 时间序列数据点
 * @returns 趋势方向
 */
export function detectTrendDirection(dataPoints: TrendDataPoint[]): TrendDirection {
  if (dataPoints.length < 3) {
    return 'stable';
  }

  const failRates = dataPoints.map((dp) => dp.failRate);
  const { slope, r2 } = linearRegression(failRates);

  if (r2 < 0.3) {
    return 'volatile';
  }

  const normalizedSlope = slope;

  if (normalizedSlope < -0.02) {
    return 'improving';
  }
  if (normalizedSlope > 0.02) {
    return 'degrading';
  }
  return 'stable';
}

/**
 * 检测变点
 * 使用 CUSUM 算法检测失败率的突变点
 * @param dataPoints - 时间序列数据点
 * @param threshold - 变点检测阈值
 * @returns 变点列表
 */
export function detectChangePoints(
  dataPoints: TrendDataPoint[],
  threshold: number = FLAKY_CONFIG.TREND_CHANGE_POINT_THRESHOLD
): ChangePoint[] {
  if (dataPoints.length < 4) {
    return [];
  }

  const failRates = dataPoints.map((dp) => dp.failRate);
  const mean = failRates.reduce((s, v) => s + v, 0) / failRates.length;
  const std = Math.sqrt(failRates.reduce((s, v) => s + (v - mean) ** 2, 0) / failRates.length);

  if (std === 0) {
    return [];
  }

  const changePoints: ChangePoint[] = [];
  let cusumPos = 0;
  let cusumNeg = 0;

  for (let i = 1; i < failRates.length; i++) {
    const deviation = (failRates[i] - mean) / std;
    cusumPos = Math.max(0, cusumPos + deviation - 0.5);
    cusumNeg = Math.min(0, cusumNeg + deviation + 0.5);

    if (cusumPos > threshold * 5 || cusumNeg < -threshold * 5) {
      const beforeWindow = failRates.slice(Math.max(0, i - 3), i);
      const afterWindow = failRates.slice(i, Math.min(failRates.length, i + 3));

      const beforeRate =
        beforeWindow.length > 0 ? beforeWindow.reduce((s, v) => s + v, 0) / beforeWindow.length : 0;
      const afterRate =
        afterWindow.length > 0 ? afterWindow.reduce((s, v) => s + v, 0) / afterWindow.length : 0;
      const magnitude = Math.abs(afterRate - beforeRate);

      if (magnitude >= threshold) {
        changePoints.push({
          timestamp: dataPoints[i].timestamp,
          beforeRate,
          afterRate,
          magnitude,
          confidence: Math.min(1, magnitude / threshold),
        });
      }

      cusumPos = 0;
      cusumNeg = 0;
    }
  }

  return changePoints;
}

/**
 * 检测季节模式
 * 分析失败率是否呈周期性波动（按小时、按天、按周）
 * @param history - 测试运行历史记录
 * @param minCycles - 最少周期数
 * @returns 季节模式，未检测到则返回 null
 */
export function detectSeasonalPattern(
  history: FlakyHistoryEntry[],
  minCycles: number = FLAKY_CONFIG.TREND_SEASONAL_MIN_CYCLES
): SeasonalPattern | null {
  const failures = history.filter((h) => h.status === 'failed' || h.status === 'timedout');
  if (failures.length < minCycles * 2) {
    return null;
  }

  const hourCounts = new Map<number, { total: number; failed: number }>();
  const dayCounts = new Map<number, { total: number; failed: number }>();

  for (const entry of history) {
    const date = new Date(entry.timestamp);
    const hour = date.getHours();
    const day = date.getDay();

    if (!hourCounts.has(hour)) {
      hourCounts.set(hour, { total: 0, failed: 0 });
    }
    if (!dayCounts.has(day)) {
      dayCounts.set(day, { total: 0, failed: 0 });
    }

    hourCounts.get(hour)!.total++;
    dayCounts.get(day)!.total++;

    if (entry.status === 'failed' || entry.status === 'timedout') {
      hourCounts.get(hour)!.failed++;
      dayCounts.get(day)!.failed++;
    }
  }

  const hourRates: number[] = [];
  for (let h = 0; h < 24; h++) {
    const counts = hourCounts.get(h);
    if (counts && counts.total >= 2) {
      hourRates.push(counts.failed / counts.total);
    }
  }

  const dayRates: number[] = [];
  for (let d = 0; d < 7; d++) {
    const counts = dayCounts.get(d);
    if (counts && counts.total >= 2) {
      dayRates.push(counts.failed / counts.total);
    }
  }

  const overallRate = failures.length / history.length;

  let peakHours: number[] = [];
  let peakDays: number[] = [];
  let amplitude = 0;

  if (hourRates.length >= 8) {
    const hourMean = hourRates.reduce((s, v) => s + v, 0) / hourRates.length;
    amplitude = Math.max(...hourRates) - Math.min(...hourRates);

    if (amplitude > overallRate * 0.5) {
      peakHours = Array.from(hourCounts.entries())
        .filter(([, c]) => c.total >= 2 && c.failed / c.total > hourMean * 1.5)
        .map(([h]) => h);
    }
  }

  if (dayRates.length >= 4) {
    const dayMean = dayRates.reduce((s, v) => s + v, 0) / dayRates.length;

    if (Math.max(...dayRates) - Math.min(...dayRates) > overallRate * 0.5) {
      peakDays = Array.from(dayCounts.entries())
        .filter(([, c]) => c.total >= 2 && c.failed / c.total > dayMean * 1.5)
        .map(([d]) => d);
    }
  }

  if (peakHours.length === 0 && peakDays.length === 0) {
    return null;
  }

  const period = peakDays.length > 0 ? 'weekly' : peakHours.length > 0 ? 'daily' : 'hourly';
  const confidence = Math.min(1, (amplitude / Math.max(overallRate, 0.01)) * 0.5);

  return {
    period,
    peakHours,
    peakDays,
    amplitude,
    confidence: Math.round(confidence * 100) / 100,
  };
}

/**
 * 关联代码变更与 Flaky 率变化
 * 分析哪些代码提交可能与 Flaky 率变化相关
 * @param changePoints - 检测到的变点列表
 * @param codeChanges - 代码变更记录列表
 * @returns 代码变更关联列表
 */
export function correlateCodeChanges(
  changePoints: ChangePoint[],
  codeChanges: CodeChangeCorrelation[]
): CodeChangeCorrelation[] {
  if (changePoints.length === 0 || codeChanges.length === 0) {
    return [];
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const correlated: CodeChangeCorrelation[] = [];

  for (const cp of changePoints) {
    for (const change of codeChanges) {
      const timeDiff = Math.abs(cp.timestamp - change.timestamp);
      if (timeDiff > 3 * MS_PER_DAY) {
        continue;
      }

      const temporalProximity = 1 - timeDiff / (3 * MS_PER_DAY);
      const magnitudeFactor = Math.min(1, cp.magnitude * 2);
      const correlationScore = temporalProximity * magnitudeFactor;

      if (correlationScore >= 0.3) {
        correlated.push({
          ...change,
          correlationScore: Math.round(correlationScore * 100) / 100,
          flakyRateBefore: cp.beforeRate,
          flakyRateAfter: cp.afterRate,
        });
      }
    }
  }

  return correlated.sort((a, b) => b.correlationScore - a.correlationScore);
}

/**
 * 生成趋势预测
 * 基于线性回归和季节模式预测未来 7 天的趋势
 * @param dataPoints - 历史时间序列数据点
 * @param direction - 当前趋势方向
 * @param seasonalPattern - 季节模式（可选）
 * @returns 趋势预测结果
 */
export function generateForecast(
  dataPoints: TrendDataPoint[],
  direction: TrendDirection,
  seasonalPattern: SeasonalPattern | null
): TrendForecast {
  if (dataPoints.length < 2) {
    return {
      next7Days: [],
      confidence: 0,
      projectedDirection: 'stable',
    };
  }

  const failRates = dataPoints.map((dp) => dp.failRate);
  const { slope, intercept, r2 } = linearRegression(failRates);

  const lastTimestamp = dataPoints[dataPoints.length - 1].timestamp;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const next7Days: TrendDataPoint[] = [];
  for (let d = 1; d <= 7; d++) {
    const timestamp = lastTimestamp + d * MS_PER_DAY;
    const projectedFailRate = Math.max(
      0,
      Math.min(1, slope * (failRates.length + d - 1) + intercept)
    );

    let seasonalAdjustment = 0;
    if (seasonalPattern) {
      const date = new Date(timestamp);
      if (seasonalPattern.peakHours.includes(date.getHours())) {
        seasonalAdjustment = seasonalPattern.amplitude * 0.3;
      }
      if (seasonalPattern.peakDays.includes(date.getDay())) {
        seasonalAdjustment += seasonalPattern.amplitude * 0.3;
      }
    }

    const adjustedFailRate = Math.max(0, Math.min(1, projectedFailRate + seasonalAdjustment));

    next7Days.push({
      timestamp,
      passRate: 1 - adjustedFailRate,
      failRate: adjustedFailRate,
      avgDuration: dataPoints[dataPoints.length - 1].avgDuration,
      flakyCount: Math.round(adjustedFailRate * 10),
      totalRuns: 10,
    });
  }

  const projectedDirection = slope < -0.01 ? 'improving' : slope > 0.01 ? 'degrading' : 'stable';

  return {
    next7Days,
    confidence:
      Math.round(
        Math.min(1, r2 * 0.8 + (seasonalPattern ? seasonalPattern.confidence * 0.2 : 0)) * 100
      ) / 100,
    projectedDirection,
  };
}

/**
 * 计算 Flaky 健康评分
 * 综合稳定性、趋势、可恢复性和可预测性四个维度
 * @param test - Flaky 测试对象
 * @param trendDirection - 趋势方向
 * @param trendR2 - 趋势拟合 R² 值
 * @returns 健康评分结果
 */
export function calculateHealthScore(
  test: FlakyTest,
  trendDirection: TrendDirection,
  trendR2: number
): FlakyHealthScore {
  const weights = FLAKY_CONFIG.HEALTH_SCORE_WEIGHTS;

  const stability = 1 - test.weightedFailureRate;

  const trendScores: Record<TrendDirection, number> = {
    improving: 1,
    stable: 0.7,
    degrading: 0.3,
    volatile: 0.2,
  };
  const trend = trendScores[trendDirection];

  const totalRuns = test.totalRuns;
  const passes = test.history.filter((h) => h.status === 'passed').length;
  const recoverability = totalRuns > 0 ? Math.min(1, (passes / totalRuns) * 1.5) : 0;

  const predictability = trendR2;

  const overall =
    stability * weights.stability +
    trend * weights.trend +
    recoverability * weights.recoverability +
    predictability * weights.predictability;

  const grade =
    overall >= 0.9
      ? 'A'
      : overall >= 0.75
        ? 'B'
        : overall >= 0.6
          ? 'C'
          : overall >= 0.4
            ? 'D'
            : 'F';

  const labels: Record<string, string> = {
    A: '非常健康',
    B: '基本健康',
    C: '需要关注',
    D: '不健康',
    F: '严重不健康',
  };

  return {
    overall: Math.round(overall * 100) / 100,
    breakdown: {
      stability: Math.round(stability * 100) / 100,
      trend: Math.round(trend * 100) / 100,
      recoverability: Math.round(recoverability * 100) / 100,
      predictability: Math.round(predictability * 100) / 100,
    },
    grade,
    label: labels[grade],
  };
}

/**
 * 趋势分析器
 * 对单个测试执行完整的趋势分析流程
 */
export class TrendAnalyzer {
  private config: TrendConfig;

  constructor(config: Partial<TrendConfig> = {}) {
    this.config = { ...DEFAULT_TREND_CONFIG, ...config };
  }

  /**
   * 对单个测试执行完整趋势分析
   * 包括时间序列聚合、趋势方向检测、变点检测、季节模式、预测
   * @param test - Flaky 测试对象
   * @param codeChanges - 代码变更记录（可选）
   * @returns 趋势分析结果
   */
  analyze(test: FlakyTest, codeChanges?: CodeChangeCorrelation[]): TrendAnalysis {
    const dataPoints = aggregateTimeSeries(test.history, this.config.aggregationWindowDays);
    const direction = detectTrendDirection(dataPoints);

    const failRates = dataPoints.map((dp) => dp.failRate);
    const { slope, r2 } = linearRegression(failRates);

    const changePoints = detectChangePoints(dataPoints, this.config.changePointThreshold);

    const seasonalPattern = detectSeasonalPattern(test.history, this.config.seasonalMinCycles);

    let codeChangeCorrelations: CodeChangeCorrelation[] = [];
    if (codeChanges && codeChanges.length > 0) {
      codeChangeCorrelations = correlateCodeChanges(changePoints, codeChanges);
    }

    const forecast = generateForecast(dataPoints, direction, seasonalPattern);

    return {
      testId: test.testId,
      direction,
      slope: Math.round(slope * 1000) / 1000,
      r2: Math.round(r2 * 100) / 100,
      dataPoints,
      changePoints,
      seasonalPattern,
      codeChangeCorrelations,
      forecast,
      analyzedAt: Date.now(),
    };
  }
}
