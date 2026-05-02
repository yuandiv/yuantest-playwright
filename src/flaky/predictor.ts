import {
  FlakyTest,
  FlakyHistoryEntry,
  PredictionResult,
  PredictionSignal,
  DurationAnomaly,
} from '../types';
import { FLAKY_CONFIG } from '../constants';

/** 预测器配置 */
export interface PredictorConfig {
  windowRuns: number;
  durationAnomalyZScore: number;
  minHistory: number;
  sensitivity: number;
}

/** 默认预测器配置 */
const DEFAULT_PREDICTOR_CONFIG: PredictorConfig = {
  windowRuns: FLAKY_CONFIG.PREDICTION_WINDOW_RUNS,
  durationAnomalyZScore: FLAKY_CONFIG.PREDICTION_DURATION_ANOMALY_ZSCORE,
  minHistory: FLAKY_CONFIG.PREDICTION_MIN_HISTORY,
  sensitivity: FLAKY_CONFIG.PREDICTION_SENSITIVITY,
};

/**
 * 计算持续时间基线统计量
 * 使用历史数据计算均值和标准差作为基线
 * @param history - 测试运行历史记录
 * @param windowSize - 计算窗口大小
 * @returns 均值和标准差
 */
function calculateDurationBaseline(
  history: FlakyHistoryEntry[],
  windowSize: number
): { mean: number; std: number } {
  const durations = history
    .slice(-windowSize)
    .map((h) => h.duration)
    .filter((d) => d > 0);
  if (durations.length < 2) {
    return { mean: 0, std: 0 };
  }

  const mean = durations.reduce((s, d) => s + d, 0) / durations.length;
  const variance = durations.reduce((s, d) => s + (d - mean) ** 2, 0) / durations.length;
  const std = Math.sqrt(variance);

  return { mean, std };
}

/**
 * 检测持续时间异常
 * 使用 Z-Score 方法检测当前持续时间是否偏离基线
 * @param test - Flaky 测试对象
 * @param config - 预测器配置
 * @returns 持续时间异常信息，未检测到则返回 null
 */
export function detectDurationAnomaly(
  test: FlakyTest,
  config: Partial<PredictorConfig> = {}
): DurationAnomaly | null {
  const cfg = { ...DEFAULT_PREDICTOR_CONFIG, ...config };

  if (test.history.length < cfg.minHistory) {
    return null;
  }

  const baseline = calculateDurationBaseline(test.history, cfg.windowRuns);
  if (baseline.mean === 0 || baseline.std === 0) {
    return null;
  }

  const latest = test.history[test.history.length - 1];
  const zScore = (latest.duration - baseline.mean) / baseline.std;
  const isAnomaly = Math.abs(zScore) > cfg.durationAnomalyZScore;

  if (!isAnomaly) {
    return null;
  }

  return {
    testId: test.testId,
    baseline: Math.round(baseline.mean),
    current: latest.duration,
    deviation: Math.round(((latest.duration - baseline.mean) / baseline.mean) * 100) / 100,
    isAnomaly: true,
    zScore: Math.round(zScore * 100) / 100,
    detectedAt: Date.now(),
  };
}

/**
 * 检测失败模式信号
 * 分析最近的失败模式是否预示即将失败
 * @param test - Flaky 测试对象
 * @param config - 预测器配置
 * @returns 预测信号，未检测到则返回 null
 */
function detectFailurePatternSignal(
  test: FlakyTest,
  config: PredictorConfig
): PredictionSignal | null {
  if (test.history.length < config.minHistory) {
    return null;
  }

  const recentWindow = test.history.slice(-config.windowRuns);
  const recentFailRate =
    recentWindow.filter((h) => h.status === 'failed' || h.status === 'timedout').length /
    recentWindow.length;

  const olderWindow = test.history.slice(0, Math.max(0, test.history.length - config.windowRuns));
  if (olderWindow.length === 0) {
    return null;
  }

  const olderFailRate =
    olderWindow.filter((h) => h.status === 'failed' || h.status === 'timedout').length /
    olderWindow.length;

  const rateIncrease = recentFailRate - olderFailRate;

  if (rateIncrease <= 0.1) {
    return null;
  }

  const strength = Math.min(1, rateIncrease * 2);

  return {
    type: 'failure_pattern',
    strength: Math.round(strength * 100) / 100,
    description: `最近 ${config.windowRuns} 次运行失败率 ${(recentFailRate * 100).toFixed(0)}%，较之前 ${(olderFailRate * 100).toFixed(0)}% 上升`,
    data: {
      recentFailRate,
      olderFailRate,
      rateIncrease,
    },
  };
}

/**
 * 检测环境偏移信号
 * 分析测试持续时间分布是否发生系统性变化
 * @param test - Flaky 测试对象
 * @param config - 预测器配置
 * @returns 预测信号，未检测到则返回 null
 */
function detectEnvironmentShiftSignal(
  test: FlakyTest,
  config: PredictorConfig
): PredictionSignal | null {
  if (test.history.length < config.minHistory * 2) {
    return null;
  }

  const half = Math.floor(test.history.length / 2);
  const firstHalf = test.history.slice(0, half);
  const secondHalf = test.history.slice(half);

  const durations1 = firstHalf.map((h) => h.duration).filter((d) => d > 0);
  const durations2 = secondHalf.map((h) => h.duration).filter((d) => d > 0);

  if (durations1.length < 3 || durations2.length < 3) {
    return null;
  }

  const mean1 = durations1.reduce((s, d) => s + d, 0) / durations1.length;
  const mean2 = durations2.reduce((s, d) => s + d, 0) / durations2.length;

  if (mean1 === 0) {
    return null;
  }

  const shift = Math.abs(mean2 - mean1) / mean1;

  if (shift < 0.3) {
    return null;
  }

  const strength = Math.min(1, shift);

  return {
    type: 'environment_shift',
    strength: Math.round(strength * 100) / 100,
    description: `持续时间分布偏移 ${(shift * 100).toFixed(0)}%，可能环境发生变化`,
    data: {
      firstHalfMean: mean1,
      secondHalfMean: mean2,
      shift,
    },
  };
}

/**
 * 检测资源压力信号
 * 分析持续时间是否呈递增趋势，暗示资源泄漏
 * @param test - Flaky 测试对象
 * @param config - 预测器配置
 * @returns 预测信号，未检测到则返回 null
 */
function detectResourcePressureSignal(
  test: FlakyTest,
  config: PredictorConfig
): PredictionSignal | null {
  if (test.history.length < config.minHistory) {
    return null;
  }

  const durations = test.history
    .slice(-config.windowRuns)
    .map((h) => h.duration)
    .filter((d) => d > 0);
  if (durations.length < 5) {
    return null;
  }

  const n = durations.length;
  const meanX = (n - 1) / 2;
  const meanY = durations.reduce((s, d) => s + d, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (durations[i] - meanY);
    denominator += (i - meanX) ** 2;
  }

  if (denominator === 0 || meanY === 0) {
    return null;
  }

  const slope = numerator / denominator;
  const normalizedSlope = slope / meanY;

  if (normalizedSlope <= 0.05) {
    return null;
  }

  const strength = Math.min(1, normalizedSlope * 5);

  return {
    type: 'resource_pressure',
    strength: Math.round(strength * 100) / 100,
    description: `持续时间递增趋势(slope=${normalizedSlope.toFixed(3)})，可能存在资源压力`,
    data: {
      slope: normalizedSlope,
      meanDuration: meanY,
    },
  };
}

/**
 * 综合所有信号生成预测结果
 * 基于多信号加权融合判断测试是否可能失败
 * @param test - Flaky 测试对象
 * @param config - 预测器配置
 * @returns 预测结果
 */
export function predictFailure(
  test: FlakyTest,
  config: Partial<PredictorConfig> = {}
): PredictionResult {
  const cfg = { ...DEFAULT_PREDICTOR_CONFIG, ...config };
  const signals: PredictionSignal[] = [];

  const durationAnomaly = detectDurationAnomaly(test, cfg);
  if (durationAnomaly) {
    signals.push({
      type: 'duration_anomaly',
      strength: Math.min(1, Math.abs(durationAnomaly.zScore) / 5),
      description: `持续时间异常：基线 ${durationAnomaly.baseline}ms，当前 ${durationAnomaly.current}ms，Z-Score=${durationAnomaly.zScore}`,
      data: { zScore: durationAnomaly.zScore, deviation: durationAnomaly.deviation },
    });
  }

  const failurePattern = detectFailurePatternSignal(test, cfg);
  if (failurePattern) {
    signals.push(failurePattern);
  }

  const envShift = detectEnvironmentShiftSignal(test, cfg);
  if (envShift) {
    signals.push(envShift);
  }

  const resourcePressure = detectResourcePressureSignal(test, cfg);
  if (resourcePressure) {
    signals.push(resourcePressure);
  }

  if (signals.length === 0) {
    return {
      testId: test.testId,
      willFail: false,
      probability: 0,
      confidence: 0,
      signals: [],
      recommendedAction: '无需特别关注',
      predictedAt: Date.now(),
    };
  }

  const weightedProbability = signals.reduce((sum, sig) => sum + sig.strength, 0) / signals.length;
  const adjustedProbability = Math.min(
    1,
    weightedProbability + test.weightedFailureRate * cfg.sensitivity
  );

  const willFail = adjustedProbability >= 0.5;

  const confidence = Math.min(
    1,
    signals.length * 0.25 + Math.max(...signals.map((s) => s.strength)) * 0.5
  );

  let recommendedAction: string;
  if (adjustedProbability >= 0.7) {
    recommendedAction = '高概率失败，建议隔离或增加重试次数';
  } else if (adjustedProbability >= 0.5) {
    recommendedAction = '可能失败，建议密切监控并准备重试';
  } else if (adjustedProbability >= 0.3) {
    recommendedAction = '有失败风险，建议关注但不需立即行动';
  } else {
    recommendedAction = '低风险，正常执行即可';
  }

  return {
    testId: test.testId,
    willFail,
    probability: Math.round(adjustedProbability * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    signals,
    recommendedAction,
    predictedAt: Date.now(),
  };
}

/**
 * 预测器
 * 提供预测性 Flaky 检测能力
 */
export class FlakyPredictor {
  private config: PredictorConfig;

  constructor(config: Partial<PredictorConfig> = {}) {
    this.config = { ...DEFAULT_PREDICTOR_CONFIG, ...config };
  }

  /**
   * 对单个测试进行失败预测
   * @param test - Flaky 测试对象
   * @returns 预测结果
   */
  predict(test: FlakyTest): PredictionResult {
    return predictFailure(test, this.config);
  }

  /**
   * 批量检测持续时间异常
   * @param tests - Flaky 测试列表
   * @returns 检测到异常的测试列表
   */
  detectAnomalies(tests: FlakyTest[]): DurationAnomaly[] {
    const anomalies: DurationAnomaly[] = [];
    for (const test of tests) {
      const anomaly = detectDurationAnomaly(test, this.config);
      if (anomaly) {
        anomalies.push(anomaly);
      }
    }
    return anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  }

  /**
   * 获取高风险测试列表
   * @param tests - Flaky 测试列表
   * @returns 预测将失败的测试列表
   */
  getHighRiskTests(tests: FlakyTest[]): PredictionResult[] {
    return tests
      .map((t) => this.predict(t))
      .filter((r) => r.willFail)
      .sort((a, b) => b.probability - a.probability);
  }
}
