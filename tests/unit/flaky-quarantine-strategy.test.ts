import {
  generateQuarantineStrategy,
  determineIsolationLevel,
  getRetryPolicyForRootCause,
  checkQuarantineBudget,
  prioritizeForQuarantine,
  QuarantineStrategyManager,
} from '../../src/flaky/quarantine-strategy';
import { FlakyTest, IsolationLevel, RootCauseType } from '../../src/types';

function createFlakyTest(overrides: Partial<FlakyTest> = {}): FlakyTest {
  return {
    testId: 'test-1',
    title: 'Test 1',
    failureRate: 0.4,
    totalRuns: 10,
    isQuarantined: false,
    history: [],
    classification: 'flaky',
    weightedFailureRate: 0.4,
    consecutiveFailures: 2,
    consecutivePasses: 0,
    ...overrides,
  };
}

describe('determineIsolationLevel', () => {
  test('broken 分类直接硬隔离', () => {
    const level = determineIsolationLevel('broken', 0.9);
    expect(level).toBe('hard_quarantine');
  });

  test('stable 分类不隔离', () => {
    const level = determineIsolationLevel('stable', 0.02);
    expect(level).toBe('none');
  });

  test('insufficient_data 不隔离', () => {
    const level = determineIsolationLevel('insufficient_data', 0.5);
    expect(level).toBe('none');
  });

  test('高失败率硬隔离', () => {
    const level = determineIsolationLevel('flaky', 0.6);
    expect(level).toBe('hard_quarantine');
  });

  test('中等失败率软隔离', () => {
    const level = determineIsolationLevel('flaky', 0.3);
    expect(level).toBe('soft_quarantine');
  });

  test('低失败率监控', () => {
    const level = determineIsolationLevel('flaky', 0.1);
    expect(level).toBe('monitor');
  });
});

describe('getRetryPolicyForRootCause', () => {
  test('timing 根因允许重试且延迟加倍', () => {
    const policy = getRetryPolicyForRootCause('timing');
    expect(policy.maxRetries).toBeGreaterThan(0);
    expect(policy.retryOnPassOnly).toBe(false);
  });

  test('external_service 根因允许重试', () => {
    const policy = getRetryPolicyForRootCause('external_service');
    expect(policy.maxRetries).toBeGreaterThan(0);
    expect(policy.retryOnPassOnly).toBe(false);
  });

  test('test_order 根因不重试', () => {
    const policy = getRetryPolicyForRootCause('test_order');
    expect(policy.maxRetries).toBe(0);
  });

  test('assertion_flaky 根因限制重试', () => {
    const policy = getRetryPolicyForRootCause('assertion_flaky');
    expect(policy.maxRetries).toBe(1);
    expect(policy.retryOnPassOnly).toBe(true);
  });

  test('unknown 根因使用默认策略', () => {
    const policy = getRetryPolicyForRootCause('unknown');
    expect(policy.maxRetries).toBeGreaterThan(0);
  });

  test('undefined 根因使用 unknown 策略', () => {
    const policy = getRetryPolicyForRootCause(undefined);
    expect(policy.maxRetries).toBeGreaterThan(0);
  });
});

describe('generateQuarantineStrategy', () => {
  test('为 flaky 测试生成策略', () => {
    const test = createFlakyTest();
    const strategy = generateQuarantineStrategy(test);

    expect(strategy.testId).toBe('test-1');
    expect(strategy.isolationLevel).toMatch(/^(none|monitor|soft_quarantine|hard_quarantine)$/);
    expect(strategy.retryPolicy).toBeDefined();
    expect(strategy.reason).toBeDefined();
    expect(typeof strategy.reason).toBe('string');
  });

  test('broken 测试生成硬隔离策略', () => {
    const test = createFlakyTest({ classification: 'broken', weightedFailureRate: 0.9 });
    const strategy = generateQuarantineStrategy(test);

    expect(strategy.isolationLevel).toBe('hard_quarantine');
  });

  test('策略包含过期时间', () => {
    const test = createFlakyTest({ classification: 'flaky', weightedFailureRate: 0.4 });
    const strategy = generateQuarantineStrategy(test);

    if (strategy.isolationLevel !== 'none') {
      expect(strategy.expiresAt).toBeGreaterThan(Date.now());
    }
  });
});

describe('checkQuarantineBudget', () => {
  test('预算充足时允许隔离', () => {
    const budget = checkQuarantineBudget(100, 5);
    expect(budget.allowed).toBe(true);
    expect(budget.remaining).toBeGreaterThan(0);
  });

  test('预算耗尽时拒绝隔离', () => {
    const budget = checkQuarantineBudget(100, 15);
    expect(budget.allowed).toBe(false);
    expect(budget.remaining).toBe(0);
  });

  test('计算利用率', () => {
    const budget = checkQuarantineBudget(100, 10);
    expect(budget.utilization).toBe(0.1);
  });
});

describe('prioritizeForQuarantine', () => {
  test('高失败率测试优先', () => {
    const test1 = createFlakyTest({ testId: 'low', weightedFailureRate: 0.2, isolationLevel: 'monitor' });
    const test2 = createFlakyTest({ testId: 'high', weightedFailureRate: 0.8, isolationLevel: 'hard_quarantine' });

    const result = prioritizeForQuarantine([test1, test2]);
    expect(result[0].testId).toBe('high');
  });
});

describe('QuarantineStrategyManager', () => {
  test('生成策略', () => {
    const manager = new QuarantineStrategyManager();
    const test = createFlakyTest();
    const strategy = manager.generateStrategy(test);

    expect(strategy.testId).toBe('test-1');
    expect(strategy.isolationLevel).toBeDefined();
  });

  test('带预算的策略生成', () => {
    const manager = new QuarantineStrategyManager();
    const tests = [
      createFlakyTest({ testId: 'test-1', weightedFailureRate: 0.6, isQuarantined: false, isolationLevel: 'hard_quarantine' }),
      createFlakyTest({ testId: 'test-2', weightedFailureRate: 0.3, isQuarantined: false, isolationLevel: 'soft_quarantine' }),
    ];

    const strategies = manager.generateStrategiesWithBudget(tests, 100);
    expect(strategies.size).toBe(2);
    expect(strategies.get('test-1')).toBeDefined();
    expect(strategies.get('test-2')).toBeDefined();
  });

  test('获取重试策略', () => {
    const manager = new QuarantineStrategyManager();
    const test = createFlakyTest({
      rootCause: {
        testId: 'test-1',
        primaryCause: 'timing',
        confidence: 0.8,
        evidence: [],
        suggestedActions: [],
        analyzedAt: Date.now(),
      },
    });

    const policy = manager.getRetryPolicy(test);
    expect(policy.maxRetries).toBeGreaterThan(0);
  });

  test('获取预算状态', () => {
    const manager = new QuarantineStrategyManager();
    const budget = manager.getBudgetStatus(100, 5);
    expect(budget.allowed).toBe(true);
  });
});
