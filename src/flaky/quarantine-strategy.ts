import {
  FlakyTest,
  FlakyClassification,
  QuarantineStrategy,
  QuarantineStrategyType,
  IsolationLevel,
  RetryPolicy,
  RootCauseType,
} from '../types';
import { FLAKY_CONFIG } from '../constants';

/** 隔离策略配置 */
export interface QuarantineStrategyConfig {
  maxQuarantineRatio: number;
  softThreshold: number;
  hardThreshold: number;
  retryMax: number;
  retryDelayMs: number;
  retryBackoff: number;
  defaultStrategy: QuarantineStrategyType;
}

/** 默认隔离策略配置 */
const DEFAULT_STRATEGY_CONFIG: QuarantineStrategyConfig = {
  maxQuarantineRatio: FLAKY_CONFIG.QUARANTINE_MAX_RATIO,
  softThreshold: FLAKY_CONFIG.QUARANTINE_SOFT_THRESHOLD,
  hardThreshold: FLAKY_CONFIG.QUARANTINE_HARD_THRESHOLD,
  retryMax: FLAKY_CONFIG.QUARANTINE_RETRY_MAX,
  retryDelayMs: FLAKY_CONFIG.QUARANTINE_RETRY_DELAY_MS,
  retryBackoff: FLAKY_CONFIG.QUARANTINE_RETRY_BACKOFF,
  defaultStrategy: 'graduated',
};

/**
 * 根据根因类型确定重试策略
 * 不同根因需要不同的重试策略：时序问题适合重试，断言问题不适合
 * @param rootCauseType - 根因类型
 * @param baseConfig - 基础重试策略配置
 * @returns 定制的重试策略
 */
export function getRetryPolicyForRootCause(
  rootCauseType: RootCauseType | undefined,
  baseConfig: Partial<QuarantineStrategyConfig> = {}
): RetryPolicy {
  const cfg = { ...DEFAULT_STRATEGY_CONFIG, ...baseConfig };

  const policyMap: Record<string, RetryPolicy> = {
    timing: {
      maxRetries: cfg.retryMax,
      retryDelay: cfg.retryDelayMs * 2,
      backoffMultiplier: cfg.retryBackoff,
      retryOnPassOnly: false,
    },
    external_service: {
      maxRetries: cfg.retryMax,
      retryDelay: cfg.retryDelayMs * 3,
      backoffMultiplier: cfg.retryBackoff,
      retryOnPassOnly: false,
    },
    data_race: {
      maxRetries: 2,
      retryDelay: cfg.retryDelayMs,
      backoffMultiplier: 1,
      retryOnPassOnly: true,
    },
    environment: {
      maxRetries: cfg.retryMax,
      retryDelay: cfg.retryDelayMs * 2,
      backoffMultiplier: cfg.retryBackoff,
      retryOnPassOnly: false,
    },
    resource_leak: {
      maxRetries: 1,
      retryDelay: cfg.retryDelayMs * 5,
      backoffMultiplier: 1,
      retryOnPassOnly: true,
    },
    test_order: {
      maxRetries: 0,
      retryDelay: 0,
      backoffMultiplier: 1,
      retryOnPassOnly: true,
    },
    assertion_flaky: {
      maxRetries: 1,
      retryDelay: cfg.retryDelayMs,
      backoffMultiplier: 1,
      retryOnPassOnly: true,
    },
    unknown: {
      maxRetries: cfg.retryMax,
      retryDelay: cfg.retryDelayMs,
      backoffMultiplier: cfg.retryBackoff,
      retryOnPassOnly: false,
    },
  };

  return policyMap[rootCauseType || 'unknown'] || policyMap.unknown;
}

/**
 * 根据分类和失败率确定隔离级别
 * graduated 策略下，根据严重程度逐步升级隔离级别
 * @param classification - 测试分类
 * @param weightedFailureRate - 加权失败率
 * @param config - 策略配置
 * @returns 隔离级别
 */
export function determineIsolationLevel(
  classification: FlakyClassification,
  weightedFailureRate: number,
  config: Partial<QuarantineStrategyConfig> = {}
): IsolationLevel {
  const cfg = { ...DEFAULT_STRATEGY_CONFIG, ...config };

  if (classification === 'broken') {
    return 'hard_quarantine';
  }
  if (classification === 'stable' || classification === 'insufficient_data') {
    return 'none';
  }

  if (weightedFailureRate >= cfg.hardThreshold) {
    return 'hard_quarantine';
  }
  if (weightedFailureRate >= cfg.softThreshold) {
    return 'soft_quarantine';
  }
  if (weightedFailureRate > 0) {
    return 'monitor';
  }

  return 'none';
}

/**
 * 根据隔离级别确定策略类型
 * @param isolationLevel - 隔离级别
 * @returns 策略类型
 */
export function getStrategyForIsolationLevel(
  isolationLevel: IsolationLevel
): QuarantineStrategyType {
  const strategyMap: Record<IsolationLevel, QuarantineStrategyType> = {
    none: 'skip',
    monitor: 'retry_only',
    soft_quarantine: 'soft',
    hard_quarantine: 'hard',
  };
  return strategyMap[isolationLevel];
}

/**
 * 为单个测试生成隔离策略
 * 综合分类、失败率、根因类型确定最佳隔离策略
 * @param test - Flaky 测试对象
 * @param config - 策略配置
 * @returns 隔离策略
 */
export function generateQuarantineStrategy(
  test: FlakyTest,
  config: Partial<QuarantineStrategyConfig> = {}
): QuarantineStrategy {
  const cfg = { ...DEFAULT_STRATEGY_CONFIG, ...config };

  const isolationLevel = determineIsolationLevel(
    test.classification,
    test.weightedFailureRate,
    cfg
  );

  const strategy =
    cfg.defaultStrategy === 'graduated'
      ? getStrategyForIsolationLevel(isolationLevel)
      : cfg.defaultStrategy;

  const retryPolicy = getRetryPolicyForRootCause(test.rootCause?.primaryCause, cfg);

  const reason = buildQuarantineReason(test, isolationLevel);

  const expiresAt =
    isolationLevel !== 'none'
      ? Date.now() + FLAKY_CONFIG.QUARANTINE_EXPIRY_DAYS * 24 * 60 * 60 * 1000
      : undefined;

  return {
    testId: test.testId,
    strategy,
    isolationLevel,
    retryPolicy,
    reason,
    expiresAt,
  };
}

/**
 * 构建隔离原因描述
 * @param test - Flaky 测试对象
 * @param isolationLevel - 隔离级别
 * @returns 原因描述
 */
function buildQuarantineReason(test: FlakyTest, isolationLevel: IsolationLevel): string {
  const parts: string[] = [];

  parts.push(`分类: ${test.classification}`);
  parts.push(`加权失败率: ${(test.weightedFailureRate * 100).toFixed(1)}%`);

  if (test.rootCause) {
    parts.push(`根因: ${test.rootCause.primaryCause}`);
  }

  if (test.consecutiveFailures > 0) {
    parts.push(`连续失败: ${test.consecutiveFailures} 次`);
  }

  const levelDescriptions: Record<IsolationLevel, string> = {
    none: '无需隔离',
    monitor: '监控模式：继续执行但增加观察',
    soft_quarantine: '软隔离：允许重试，不计入主流程',
    hard_quarantine: '硬隔离：完全跳过，不执行',
  };

  parts.push(levelDescriptions[isolationLevel]);

  return parts.join('；');
}

/**
 * 检查隔离预算
 * 限制被隔离测试占总测试数的比例，防止过度隔离
 * @param totalTests - 总测试数
 * @param currentQuarantined - 当前已隔离数
 * @param config - 策略配置
 * @returns 是否还有隔离预算
 */
export function checkQuarantineBudget(
  totalTests: number,
  currentQuarantined: number,
  config: Partial<QuarantineStrategyConfig> = {}
): { allowed: boolean; remaining: number; utilization: number } {
  const cfg = { ...DEFAULT_STRATEGY_CONFIG, ...config };
  const maxQuarantined = Math.max(3, Math.ceil(totalTests * cfg.maxQuarantineRatio));
  const remaining = Math.max(0, maxQuarantined - currentQuarantined);
  const utilization = totalTests > 0 ? currentQuarantined / totalTests : 0;

  return {
    allowed: currentQuarantined < maxQuarantined,
    remaining,
    utilization: Math.round(utilization * 100) / 100,
  };
}

/**
 * 优先级排序：当隔离预算不足时，优先隔离最需要隔离的测试
 * @param tests - 待隔离测试列表
 * @returns 按优先级排序的测试列表（最需要隔离的排最前）
 */
export function prioritizeForQuarantine(tests: FlakyTest[]): FlakyTest[] {
  return [...tests].sort((a, b) => {
    const levelOrder: Record<IsolationLevel, number> = {
      hard_quarantine: 4,
      soft_quarantine: 3,
      monitor: 2,
      none: 1,
    };

    const levelA = a.isolationLevel || 'none';
    const levelB = b.isolationLevel || 'none';
    const levelDiff = levelOrder[levelB] - levelOrder[levelA];
    if (levelDiff !== 0) {
      return levelDiff;
    }

    return b.weightedFailureRate - a.weightedFailureRate;
  });
}

/**
 * 隔离策略管理器
 * 提供分级隔离、策略选择、预算管理、智能重试等高级隔离能力
 */
export class QuarantineStrategyManager {
  private config: QuarantineStrategyConfig;

  constructor(config: Partial<QuarantineStrategyConfig> = {}) {
    this.config = { ...DEFAULT_STRATEGY_CONFIG, ...config };
  }

  /**
   * 为测试生成隔离策略
   * @param test - Flaky 测试对象
   * @returns 隔离策略
   */
  generateStrategy(test: FlakyTest): QuarantineStrategy {
    return generateQuarantineStrategy(test, this.config);
  }

  /**
   * 批量生成隔离策略，考虑预算限制
   * @param tests - Flaky 测试列表
   * @param totalTests - 总测试数
   * @returns 隔离策略映射
   */
  generateStrategiesWithBudget(
    tests: FlakyTest[],
    totalTests: number
  ): Map<string, QuarantineStrategy> {
    const strategies = new Map<string, QuarantineStrategy>();
    const prioritized = prioritizeForQuarantine(tests);
    let quarantinedCount = tests.filter((t) => t.isQuarantined).length;

    for (const test of prioritized) {
      const budget = checkQuarantineBudget(totalTests, quarantinedCount, this.config);

      const strategy = this.generateStrategy(test);

      if (
        strategy.isolationLevel === 'hard_quarantine' ||
        strategy.isolationLevel === 'soft_quarantine'
      ) {
        if (!budget.allowed && !test.isQuarantined) {
          strategy.isolationLevel = 'monitor';
          strategy.strategy = 'retry_only';
          strategy.reason += '（隔离预算不足，降级为监控）';
        } else if (!test.isQuarantined) {
          quarantinedCount++;
        }
      }

      strategies.set(test.testId, strategy);
    }

    return strategies;
  }

  /**
   * 获取测试的重试策略
   * @param test - Flaky 测试对象
   * @returns 重试策略
   */
  getRetryPolicy(test: FlakyTest): RetryPolicy {
    return getRetryPolicyForRootCause(test.rootCause?.primaryCause, this.config);
  }

  /**
   * 获取预算使用情况
   * @param totalTests - 总测试数
   * @param currentQuarantined - 当前已隔离数
   * @returns 预算使用情况
   */
  getBudgetStatus(totalTests: number, currentQuarantined: number) {
    return checkQuarantineBudget(totalTests, currentQuarantined, this.config);
  }
}
