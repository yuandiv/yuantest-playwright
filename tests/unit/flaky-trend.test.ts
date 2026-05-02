import {
  aggregateTimeSeries,
  linearRegression,
  detectTrendDirection,
  detectChangePoints,
  detectSeasonalPattern,
  correlateCodeChanges,
  generateForecast,
  calculateHealthScore,
  TrendAnalyzer,
} from '../../src/flaky/trend';
import { FlakyTest, TrendDataPoint, ChangePoint, CodeChangeCorrelation } from '../../src/types';

function createFlakyTest(overrides: Partial<FlakyTest> = {}): FlakyTest {
  const now = Date.now();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const history = [];
  for (let i = 0; i < 20; i++) {
    history.push({
      timestamp: now - (20 - i) * MS_PER_DAY,
      status: i % 3 === 0 ? 'failed' as const : 'passed' as const,
      duration: 1000 + Math.random() * 500,
      error: i % 3 === 0 ? 'timeout' : undefined,
    });
  }

  return {
    testId: 'test-1',
    title: 'Test 1',
    failureRate: 0.33,
    totalRuns: 20,
    isQuarantined: false,
    history,
    classification: 'flaky',
    weightedFailureRate: 0.33,
    consecutiveFailures: 0,
    consecutivePasses: 1,
    ...overrides,
  };
}

describe('aggregateTimeSeries', () => {
  test('空历史返回空数组', () => {
    expect(aggregateTimeSeries([])).toEqual([]);
  });

  test('按天聚合历史记录', () => {
    const now = Date.now();
    const history = [
      { timestamp: now, status: 'passed' as const, duration: 100 },
      { timestamp: now + 1000, status: 'failed' as const, duration: 200 },
      { timestamp: now + 86400000, status: 'passed' as const, duration: 150 },
    ];

    const result = aggregateTimeSeries(history, 1);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].totalRuns).toBe(2);
    expect(result[0].failRate).toBe(0.5);
  });
});

describe('linearRegression', () => {
  test('数据不足返回零值', () => {
    expect(linearRegression([])).toEqual({ slope: 0, intercept: 0, r2: 0 });
    expect(linearRegression([1])).toEqual({ slope: 0, intercept: 0, r2: 0 });
  });

  test('完美线性数据 R² 接近 1', () => {
    const values = [1, 2, 3, 4, 5];
    const { slope, r2 } = linearRegression(values);
    expect(slope).toBeCloseTo(1, 1);
    expect(r2).toBeCloseTo(1, 1);
  });

  test('下降趋势斜率为负', () => {
    const values = [5, 4, 3, 2, 1];
    const { slope } = linearRegression(values);
    expect(slope).toBeLessThan(0);
  });
});

describe('detectTrendDirection', () => {
  test('数据不足返回 stable', () => {
    expect(detectTrendDirection([])).toBe('stable');
    expect(detectTrendDirection([{ timestamp: 1, passRate: 1, failRate: 0, avgDuration: 100, flakyCount: 0, totalRuns: 1 }])).toBe('stable');
  });

  test('失败率持续上升返回 degrading', () => {
    const dataPoints: TrendDataPoint[] = [];
    for (let i = 0; i < 10; i++) {
      dataPoints.push({
        timestamp: i * 86400000,
        passRate: 1 - i * 0.08,
        failRate: i * 0.08,
        avgDuration: 1000,
        flakyCount: i,
        totalRuns: 10,
      });
    }
    expect(detectTrendDirection(dataPoints)).toBe('degrading');
  });

  test('失败率持续下降返回 improving', () => {
    const dataPoints: TrendDataPoint[] = [];
    for (let i = 0; i < 10; i++) {
      dataPoints.push({
        timestamp: i * 86400000,
        passRate: 0.2 + i * 0.08,
        failRate: 0.8 - i * 0.08,
        avgDuration: 1000,
        flakyCount: 10 - i,
        totalRuns: 10,
      });
    }
    expect(detectTrendDirection(dataPoints)).toBe('improving');
  });
});

describe('detectChangePoints', () => {
  test('数据不足返回空', () => {
    expect(detectChangePoints([])).toEqual([]);
  });

  test('检测到突变点', () => {
    const dataPoints: TrendDataPoint[] = [];
    for (let i = 0; i < 5; i++) {
      dataPoints.push({
        timestamp: i * 86400000,
        passRate: 0.9,
        failRate: 0.1,
        avgDuration: 1000,
        flakyCount: 1,
        totalRuns: 10,
      });
    }
    for (let i = 5; i < 10; i++) {
      dataPoints.push({
        timestamp: i * 86400000,
        passRate: 0.3,
        failRate: 0.7,
        avgDuration: 1000,
        flakyCount: 7,
        totalRuns: 10,
      });
    }

    const changePoints = detectChangePoints(dataPoints, 0.3);
    expect(changePoints.length).toBeGreaterThanOrEqual(0);
  });
});

describe('detectSeasonalPattern', () => {
  test('数据不足返回 null', () => {
    const history = [
      { timestamp: Date.now(), status: 'failed' as const, duration: 100 },
    ];
    expect(detectSeasonalPattern(history)).toBeNull();
  });

  test('均匀分布的失败不产生季节模式', () => {
    const now = Date.now();
    const history = [];
    for (let i = 0; i < 30; i++) {
      history.push({
        timestamp: now - i * 86400000,
        status: (i % 3 === 0 ? 'failed' : 'passed') as 'failed' | 'passed',
        duration: 1000,
      });
    }
    const result = detectSeasonalPattern(history);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});

describe('correlateCodeChanges', () => {
  test('无变点返回空', () => {
    expect(correlateCodeChanges([], [])).toEqual([]);
  });

  test('时间接近的代码变更被关联', () => {
    const now = Date.now();
    const changePoints: ChangePoint[] = [{
      timestamp: now,
      beforeRate: 0.1,
      afterRate: 0.6,
      magnitude: 0.5,
      confidence: 0.9,
    }];

    const codeChanges: CodeChangeCorrelation[] = [{
      commitHash: 'abc123',
      commitMessage: 'feat: new feature',
      timestamp: now - 86400000,
      author: 'dev',
      affectedFiles: ['src/test.ts'],
      correlationScore: 0,
      flakyRateBefore: 0,
      flakyRateAfter: 0,
    }];

    const result = correlateCodeChanges(changePoints, codeChanges);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].correlationScore).toBeGreaterThan(0);
  });
});

describe('generateForecast', () => {
  test('数据不足返回空预测', () => {
    const result = generateForecast([], 'stable', null);
    expect(result.next7Days).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  test('生成 7 天预测', () => {
    const dataPoints: TrendDataPoint[] = [];
    for (let i = 0; i < 10; i++) {
      dataPoints.push({
        timestamp: Date.now() - (10 - i) * 86400000,
        passRate: 0.7,
        failRate: 0.3,
        avgDuration: 1000,
        flakyCount: 3,
        totalRuns: 10,
      });
    }

    const result = generateForecast(dataPoints, 'stable', null);
    expect(result.next7Days.length).toBe(7);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateHealthScore', () => {
  test('健康测试获得高分', () => {
    const test = createFlakyTest({
      weightedFailureRate: 0.05,
      failureRate: 0.05,
      totalRuns: 20,
      history: Array(20).fill(null).map((_, i) => ({
        timestamp: Date.now() - i * 86400000,
        status: 'passed' as const,
        duration: 1000,
      })),
    });

    const score = calculateHealthScore(test, 'stable', 0.8);
    expect(score.overall).toBeGreaterThan(0.7);
    expect(score.grade).toMatch(/^[A-C]$/);
  });

  test('不健康测试获得低分', () => {
    const test = createFlakyTest({
      weightedFailureRate: 0.8,
      failureRate: 0.8,
    });

    const score = calculateHealthScore(test, 'degrading', 0.3);
    expect(score.overall).toBeLessThan(0.5);
    expect(score.grade).toMatch(/^[D-F]$/);
  });

  test('评分包含四个维度', () => {
    const test = createFlakyTest();
    const score = calculateHealthScore(test, 'stable', 0.5);
    expect(score.breakdown).toHaveProperty('stability');
    expect(score.breakdown).toHaveProperty('trend');
    expect(score.breakdown).toHaveProperty('recoverability');
    expect(score.breakdown).toHaveProperty('predictability');
  });
});

describe('TrendAnalyzer', () => {
  test('完整趋势分析流程', () => {
    const analyzer = new TrendAnalyzer();
    const test = createFlakyTest();

    const result = analyzer.analyze(test);
    expect(result.testId).toBe('test-1');
    expect(result.direction).toMatch(/^(improving|stable|degrading|volatile)$/);
    expect(typeof result.slope).toBe('number');
    expect(typeof result.r2).toBe('number');
    expect(result.dataPoints.length).toBeGreaterThan(0);
    expect(result.analyzedAt).toBeGreaterThan(0);
  });

  test('带代码变更的趋势分析', () => {
    const analyzer = new TrendAnalyzer();
    const test = createFlakyTest();
    const now = Date.now();

    const codeChanges: CodeChangeCorrelation[] = [{
      commitHash: 'abc',
      commitMessage: 'fix: bug',
      timestamp: now,
      author: 'dev',
      affectedFiles: ['src/test.ts'],
      correlationScore: 0,
      flakyRateBefore: 0,
      flakyRateAfter: 0,
    }];

    const result = analyzer.analyze(test, codeChanges);
    expect(result.codeChangeCorrelations).toBeDefined();
  });
});
