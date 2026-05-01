import { FlakyTest, FlakyClassification, FlakyHistoryEntry } from '../types';
import { FLAKY_CONFIG } from '../constants';

/** 分类器配置接口 */
export interface ClassifyConfig {
  minimumRuns: number;
  brokenThreshold: number;
  regressionWindow: number;
  decayRate: number;
  confidenceLevel: number;
  flakyThreshold: number;
  stableThreshold: number;
}

/** 默认分类器配置 */
const DEFAULT_CLASSIFY_CONFIG: ClassifyConfig = {
  minimumRuns: FLAKY_CONFIG.MINIMUM_RUNS_FOR_QUARANTINE,
  brokenThreshold: FLAKY_CONFIG.BROKEN_CONSECUTIVE_THRESHOLD,
  regressionWindow: FLAKY_CONFIG.REGRESSION_WINDOW,
  decayRate: FLAKY_CONFIG.DECAY_RATE,
  confidenceLevel: FLAKY_CONFIG.CONFIDENCE_LEVEL,
  flakyThreshold: FLAKY_CONFIG.DEFAULT_THRESHOLD,
  stableThreshold: 0.05,
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
  if (history.length === 0) return 0;

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
  if (total === 0) return { lower: 0, upper: 0 };

  const zScores: Record<number, number> = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };
  const z = zScores[confidence] || 1.96;

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
  if (test.totalRuns < minRuns) return false;

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
 * @returns 是否为回归模式
 */
function isRegression(history: FlakyHistoryEntry[], window: number): boolean {
  if (history.length < window) return false;

  const recentWindow = history.slice(-window);
  const olderHistory = history.slice(0, -window);

  if (olderHistory.length === 0) return false;

  const recentFailRate = recentWindow.filter(
    (h) => h.status === 'failed' || h.status === 'timedout'
  ).length / recentWindow.length;

  const olderFailRate = olderHistory.filter(
    (h) => h.status === 'failed' || h.status === 'timedout'
  ).length / olderHistory.length;

  return recentFailRate >= 0.6 && olderFailRate <= 0.2;
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

  if (isRegression(test.history, cfg.regressionWindow)) {
    return 'regression';
  }

  const weightedRate = calculateWeightedFailureRate(test.history, cfg.decayRate);

  if (weightedRate < cfg.stableThreshold) {
    return 'stable';
  }

  if (weightedRate >= cfg.flakyThreshold) {
    return 'flaky';
  }

  if (test.failureRate >= cfg.flakyThreshold && weightedRate < cfg.flakyThreshold) {
    return 'stable';
  }

  return 'flaky';
}
