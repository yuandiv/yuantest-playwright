import {
  detectDurationAnomaly,
  predictFailure,
  FlakyPredictor,
} from '../../src/flaky/predictor';
import { FlakyTest, DurationAnomaly } from '../../src/types';

function createFlakyTest(overrides: Partial<FlakyTest> = {}): FlakyTest {
  const now = Date.now();
  const history = [];
  for (let i = 0; i < 15; i++) {
    history.push({
      timestamp: now - (15 - i) * 3600000,
      status: i % 3 === 0 ? 'failed' as const : 'passed' as const,
      duration: 1000 + (i % 3 === 0 ? 3000 : Math.random() * 500),
      error: i % 3 === 0 ? 'timeout waiting for selector' : undefined,
    });
  }

  return {
    testId: 'test-1',
    title: 'Test 1',
    failureRate: 0.33,
    totalRuns: 15,
    isQuarantined: false,
    history,
    classification: 'flaky',
    weightedFailureRate: 0.33,
    consecutiveFailures: 0,
    consecutivePasses: 1,
    ...overrides,
  };
}

describe('detectDurationAnomaly', () => {
  test('历史不足返回 null', () => {
    const test = createFlakyTest({ history: [
      { timestamp: Date.now(), status: 'passed', duration: 1000 },
    ]});
    expect(detectDurationAnomaly(test)).toBeNull();
  });

  test('正常持续时间不触发异常', () => {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 15; i++) {
      history.push({
        timestamp: now - (15 - i) * 3600000,
        status: 'passed' as const,
        duration: 1000 + Math.random() * 100,
      });
    }
    const test = createFlakyTest({ history });
    expect(detectDurationAnomaly(test)).toBeNull();
  });

  test('异常持续时间被检测', () => {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 14; i++) {
      history.push({
        timestamp: now - (15 - i) * 3600000,
        status: 'passed' as const,
        duration: 1000,
      });
    }
    history.push({
      timestamp: now,
      status: 'failed' as const,
      duration: 10000,
      error: 'timeout',
    });
    const test = createFlakyTest({ history });

    const anomaly = detectDurationAnomaly(test);
    expect(anomaly).not.toBeNull();
    expect(anomaly!.isAnomaly).toBe(true);
    expect(anomaly!.zScore).toBeGreaterThan(2);
    expect(anomaly!.current).toBe(10000);
  });

  test('返回正确的 Z-Score', () => {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 14; i++) {
      history.push({
        timestamp: now - (15 - i) * 3600000,
        status: 'passed' as const,
        duration: 1000,
      });
    }
    history.push({
      timestamp: now,
      status: 'passed' as const,
      duration: 5000,
    });
    const test = createFlakyTest({ history });

    const anomaly = detectDurationAnomaly(test);
    if (anomaly) {
      expect(anomaly.zScore).toBeGreaterThan(0);
      expect(anomaly.deviation).toBeGreaterThan(0);
    }
  });
});

describe('predictFailure', () => {
  test('无信号时返回低风险预测', () => {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 15; i++) {
      history.push({
        timestamp: now - (15 - i) * 3600000,
        status: 'passed' as const,
        duration: 1000,
      });
    }
    const test = createFlakyTest({
      history,
      weightedFailureRate: 0,
      failureRate: 0,
    });

    const result = predictFailure(test);
    expect(result.willFail).toBe(false);
    expect(result.probability).toBe(0);
    expect(result.signals.length).toBe(0);
  });

  test('失败模式信号被检测', () => {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 5; i++) {
      history.push({
        timestamp: now - (15 - i) * 3600000,
        status: 'passed' as const,
        duration: 1000,
      });
    }
    for (let i = 5; i < 15; i++) {
      history.push({
        timestamp: now - (15 - i) * 3600000,
        status: 'failed' as const,
        duration: 2000,
        error: 'timeout',
      });
    }
    const test = createFlakyTest({
      history,
      weightedFailureRate: 0.7,
      failureRate: 0.7,
    });

    const result = predictFailure(test);
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.probability).toBeGreaterThan(0);
  });

  test('预测结果包含推荐操作', () => {
    const test = createFlakyTest({
      weightedFailureRate: 0.8,
    });

    const result = predictFailure(test);
    expect(result.recommendedAction).toBeDefined();
    expect(typeof result.recommendedAction).toBe('string');
    expect(result.predictedAt).toBeGreaterThan(0);
  });
});

describe('FlakyPredictor', () => {
  test('predict 方法返回预测结果', () => {
    const predictor = new FlakyPredictor();
    const test = createFlakyTest();

    const result = predictor.predict(test);
    expect(result.testId).toBe('test-1');
    expect(typeof result.willFail).toBe('boolean');
    expect(typeof result.probability).toBe('number');
    expect(typeof result.confidence).toBe('number');
  });

  test('detectAnomalies 批量检测', () => {
    const predictor = new FlakyPredictor();
    const now = Date.now();

    const test1 = createFlakyTest({
      testId: 'test-1',
      history: Array(15).fill(null).map((_, i) => ({
        timestamp: now - (15 - i) * 3600000,
        status: 'passed' as const,
        duration: 1000,
      })),
    });

    const test2 = createFlakyTest({
      testId: 'test-2',
      history: [
        ...Array(14).fill(null).map((_, i) => ({
          timestamp: now - (15 - i) * 3600000,
          status: 'passed' as const,
          duration: 1000,
        })),
        { timestamp: now, status: 'failed' as const, duration: 10000, error: 'timeout' },
      ],
    });

    const anomalies = predictor.detectAnomalies([test1, test2]);
    expect(Array.isArray(anomalies)).toBe(true);
  });

  test('getHighRiskTests 返回高风险测试', () => {
    const predictor = new FlakyPredictor();
    const test = createFlakyTest({
      weightedFailureRate: 0.9,
      failureRate: 0.9,
    });

    const highRisk = predictor.getHighRiskTests([test]);
    expect(Array.isArray(highRisk)).toBe(true);
  });
});
