import { FlakyTest, FlakyClassification, FlakyHistoryEntry } from '../types';
import { FLAKY_CONFIG } from '../constants';

function normalQuantile(p: number): number {
  if (p <= 0) {
    return -Infinity;
  }
  if (p >= 1) {
    return Infinity;
  }
  if (p === 0.5) {
    return 0;
  }

  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.38357751867269e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838;
  const c4 = -2.549732539343734;
  const c5 = 4.374664141464968;
  const c6 = 2.938163982698783;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996;
  const d4 = 3.754408661907416;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number, r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
}

/** 分类器配置接口 */
export interface ClassifyConfig {
  minimumRuns: number;
  brokenThreshold: number;
  regressionWindow: number;
  decayRate: number;
  confidenceLevel: number;
  flakyThreshold: number;
  monitorThreshold: number;
  stableThreshold: number;
  regressionRecentFailRate: number;
  regressionOlderFailRate: number;
}

/** 默认分类器配置 */
const DEFAULT_CLASSIFY_CONFIG: ClassifyConfig = {
  minimumRuns: FLAKY_CONFIG.MINIMUM_RUNS_FOR_QUARANTINE,
  brokenThreshold: FLAKY_CONFIG.BROKEN_CONSECUTIVE_THRESHOLD,
  regressionWindow: FLAKY_CONFIG.REGRESSION_WINDOW,
  decayRate: FLAKY_CONFIG.DECAY_RATE,
  confidenceLevel: FLAKY_CONFIG.CONFIDENCE_LEVEL,
  flakyThreshold: FLAKY_CONFIG.DEFAULT_THRESHOLD,
  monitorThreshold: FLAKY_CONFIG.MONITOR_THRESHOLD,
  stableThreshold: 0.05,
  regressionRecentFailRate: 0.6,
  regressionOlderFailRate: 0.2,
};

/**
 * 计算时间衰减加权失败率
 * 使用指数衰减函数：weight = exp(-decayRate * ageInDays)
 * 最近的运行结果权重最高，随时间指数递减
 * @param history - 测试运行历史记录数组
 * @param decayRate - 衰减率，默认 0.1（7天前的权重约50%）
 * @returns 加权失败率，范围 [0, 1]
 */
export function calculateWeightedFailureRate(
  history: FlakyHistoryEntry[],
  decayRate: number = FLAKY_CONFIG.DECAY_RATE
): number {
  if (history.length === 0) {
    return 0;
  }

  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let weightedFailures = 0;
  let weightedTotal = 0;

  for (const entry of history) {
    const ageInDays = (now - entry.timestamp) / MS_PER_DAY;
    const weight = Math.exp(-decayRate * ageInDays);

    weightedTotal += weight;
    if (entry.status === 'failed' || entry.status === 'timedout') {
      weightedFailures += weight;
    }
  }

  return weightedTotal > 0 ? weightedFailures / weightedTotal : 0;
}

/**
 * 计算 Wilson 置信区间
 * 基于二项分布的置信区间，在小样本时自动扩大区间
 * 避免因样本量不足而过度自信地判定 Flaky
 * @param failures - 失败次数
 * @param total - 总运行次数
 * @param confidence - 置信水平，默认 0.95
 * @returns 置信区间的下界和上界
 */
export function wilsonConfidenceInterval(
  failures: number,
  total: number,
  confidence: number = 0.95
): { lower: number; upper: number } {
  if (total === 0) {
    return { lower: 0, upper: 0 };
  }

  const zScores: Record<number, number> = {
    0.8: 1.282,
    0.85: 1.44,
    0.9: 1.645,
    0.95: 1.96,
    0.99: 2.576,
    0.999: 3.291,
  };
  const z = zScores[confidence] || normalQuantile(0.5 + confidence / 2);

  const p = failures / total;
  const n = total;
  const denominator = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);

  return {
    lower: Math.max(0, (centre - margin) / denominator),
    upper: Math.min(1, (centre + margin) / denominator),
  };
}

/**
 * 判断失败率是否具有统计显著性
 * 要求最低运行次数 + Wilson 置信区间下界超过阈值
 * @param test - Flaky 测试对象
 * @param threshold - 失败率阈值
 * @param minRuns - 最低运行次数要求
 * @param confidence - 置信水平
 * @returns 是否具有统计显著性
 */
export function isStatisticallySignificant(
  test: FlakyTest,
  threshold: number,
  minRuns: number,
  confidence: number = 0.95
): boolean {
  if (test.totalRuns < minRuns) {
    return false;
  }

  const failures = test.history.filter(
    (h) => h.status === 'failed' || h.status === 'timedout'
  ).length;
  const ci = wilsonConfidenceInterval(failures, test.totalRuns, confidence);

  return ci.lower >= threshold;
}

/**
 * 计算连续失败次数
 * 从最近一次运行开始向前计数，直到遇到非失败状态
 * @param history - 测试运行历史记录数组
 * @returns 连续失败次数
 */
export function calculateConsecutiveFailures(history: FlakyHistoryEntry[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === 'failed' || history[i].status === 'timedout') {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * 计算连续通过次数
 * 从最近一次运行开始向前计数，直到遇到非通过状态
 * @param history - 测试运行历史记录数组
 * @returns 连续通过次数
 */
export function calculateConsecutivePasses(history: FlakyHistoryEntry[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].status === 'passed') {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * 检测回归模式
 * 回归特征：前期稳定通过，最近窗口内持续失败
 * @param history - 测试运行历史记录数组
 * @param window - 回归检测窗口大小
 * @param config - 分类器配置（可选）
 * @returns 是否为回归模式
 */
function isRegression(
  history: FlakyHistoryEntry[],
  window: number,
  config: Partial<ClassifyConfig> = {}
): boolean {
  if (history.length < window) {
    return false;
  }

  const recentWindow = history.slice(-window);
  const olderHistory = history.slice(0, -window);

  if (olderHistory.length === 0) {
    return false;
  }

  const recentFailRate =
    recentWindow.filter((h) => h.status === 'failed' || h.status === 'timedout').length /
    recentWindow.length;

  const olderFailRate =
    olderHistory.filter((h) => h.status === 'failed' || h.status === 'timedout').length /
    olderHistory.length;

  const recentThreshold =
    config.regressionRecentFailRate ?? DEFAULT_CLASSIFY_CONFIG.regressionRecentFailRate;
  const olderThreshold =
    config.regressionOlderFailRate ?? DEFAULT_CLASSIFY_CONFIG.regressionOlderFailRate;

  return recentFailRate >= recentThreshold && olderFailRate <= olderThreshold;
}

/**
 * 对测试进行分类
 * 根据运行历史、失败率、连续失败/通过次数等指标
 * 将测试分为 flaky / broken / regression / stable / insufficient_data
 * @param test - Flaky 测试对象
 * @param config - 分类器配置（可选，使用默认值）
 * @returns 分类结果
 */
export function classifyTest(
  test: FlakyTest,
  config: Partial<ClassifyConfig> = {}
): FlakyClassification {
  const cfg = { ...DEFAULT_CLASSIFY_CONFIG, ...config };

  if (test.totalRuns < cfg.minimumRuns) {
    return 'insufficient_data';
  }

  const consecutiveFailures = calculateConsecutiveFailures(test.history);

  if (consecutiveFailures >= cfg.brokenThreshold) {
    const recentWindow = test.history.slice(-cfg.brokenThreshold);
    const allRecentFailed = recentWindow.every(
      (h) => h.status === 'failed' || h.status === 'timedout'
    );
    if (allRecentFailed) {
      return 'broken';
    }
  }

  if (isRegression(test.history, cfg.regressionWindow, cfg)) {
    return 'regression';
  }

  const weightedRate = calculateWeightedFailureRate(test.history, cfg.decayRate);

  if (weightedRate < cfg.stableThreshold) {
    return 'stable';
  }

  if (weightedRate >= cfg.flakyThreshold) {
    return 'flaky';
  }

  if (weightedRate >= cfg.monitorThreshold) {
    return 'monitor';
  }

  if (test.failureRate >= cfg.flakyThreshold && weightedRate < cfg.flakyThreshold) {
    return 'stable';
  }

  return 'monitor';
}
