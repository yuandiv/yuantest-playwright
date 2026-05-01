import {
  classifyTest,
  calculateWeightedFailureRate,
  calculateConsecutiveFailures,
  calculateConsecutivePasses,
  wilsonConfidenceInterval,
  isStatisticallySignificant,
} from '../../src/flaky/classifier';
import { FlakyTest, FlakyHistoryEntry, FlakyClassification } from '../../src/types';

function makeFlakyTest(overrides: Partial<FlakyTest> = {}): FlakyTest {
  return {
    testId: 'test-1',
    title: 'Test 1',
    failureRate: 0,
    totalRuns: 0,
    isQuarantined: false,
    history: [],
    classification: 'insufficient_data',
    weightedFailureRate: 0,
    consecutiveFailures: 0,
    consecutivePasses: 0,
    ...overrides,
  };
}

function makeHistory(statuses: Array<'passed' | 'failed' | 'timedout'>, baseTime = Date.now()): FlakyHistoryEntry[] {
  return statuses.map((status, i) => ({
    timestamp: baseTime - (statuses.length - i) * 3600000,
    status,
    duration: 100,
    error: status === 'failed' ? 'Test failed' : undefined,
  }));
}

describe('calculateWeightedFailureRate', () => {
  it('should return 0 for empty history', () => {
    expect(calculateWeightedFailureRate([])).toBe(0);
  });

  it('should return 1 for all recent failures', () => {
    const history = makeHistory(['failed', 'failed', 'failed']);
    const rate = calculateWeightedFailureRate(history);
    expect(rate).toBeCloseTo(1, 1);
  });

  it('should return 0 for all recent passes', () => {
    const history = makeHistory(['passed', 'passed', 'passed']);
    const rate = calculateWeightedFailureRate(history);
    expect(rate).toBeCloseTo(0, 1);
  });

  it('should weight recent failures higher than old failures', () => {
    const now = Date.now();
    const recentFailure: FlakyHistoryEntry = {
      timestamp: now - 1000,
      status: 'failed',
      duration: 100,
    };
    const oldPass: FlakyHistoryEntry = {
      timestamp: now - 30 * 24 * 3600000,
      status: 'passed',
      duration: 100,
    };

    const recentFailHistory = [oldPass, recentFailure];
    const rate = calculateWeightedFailureRate(recentFailHistory);
    expect(rate).toBeGreaterThan(0.5);
  });

  it('should weight old failures lower than recent passes', () => {
    const now = Date.now();
    const oldFailure: FlakyHistoryEntry = {
      timestamp: now - 30 * 24 * 3600000,
      status: 'failed',
      duration: 100,
    };
    const recentPass: FlakyHistoryEntry = {
      timestamp: now - 1000,
      status: 'passed',
      duration: 100,
    };

    const history = [oldFailure, recentPass];
    const rate = calculateWeightedFailureRate(history);
    expect(rate).toBeLessThan(0.5);
  });
});

describe('wilsonConfidenceInterval', () => {
  it('should return 0 for zero total', () => {
    const ci = wilsonConfidenceInterval(0, 0);
    expect(ci.lower).toBe(0);
    expect(ci.upper).toBe(0);
  });

  it('should return wide interval for small sample', () => {
    const ci = wilsonConfidenceInterval(1, 2);
    expect(ci.upper - ci.lower).toBeGreaterThan(0.3);
  });

  it('should return narrow interval for large sample', () => {
    const ci = wilsonConfidenceInterval(10, 20);
    expect(ci.upper - ci.lower).toBeLessThan(0.5);
  });

  it('should have lower bound near 0.3 for 10/20 failures', () => {
    const ci = wilsonConfidenceInterval(10, 20);
    expect(ci.lower).toBeGreaterThan(0.25);
    expect(ci.upper).toBeLessThan(0.75);
  });

  it('should clamp upper to 1', () => {
    const ci = wilsonConfidenceInterval(5, 5);
    expect(ci.upper).toBeLessThanOrEqual(1);
  });

  it('should clamp lower to 0', () => {
    const ci = wilsonConfidenceInterval(0, 5);
    expect(ci.lower).toBeGreaterThanOrEqual(0);
  });
});

describe('isStatisticallySignificant', () => {
  it('should return false for insufficient runs', () => {
    const test = makeFlakyTest({ totalRuns: 2, history: makeHistory(['failed', 'passed']) });
    expect(isStatisticallySignificant(test, 0.3, 5)).toBe(false);
  });

  it('should return false for small sample with high variance', () => {
    const test = makeFlakyTest({ totalRuns: 3, history: makeHistory(['failed', 'passed', 'failed']) });
    expect(isStatisticallySignificant(test, 0.3, 3)).toBe(false);
  });

  it('should return true for large sample with consistent failure rate', () => {
    const statuses: Array<'passed' | 'failed'> = [];
    for (let i = 0; i < 20; i++) {
      statuses.push(i < 10 ? 'failed' : 'passed');
    }
    const test = makeFlakyTest({ totalRuns: 20, history: makeHistory(statuses), failureRate: 0.5 });
    expect(isStatisticallySignificant(test, 0.2, 5)).toBe(true);
  });
});

describe('calculateConsecutiveFailures', () => {
  it('should return 0 for all passes', () => {
    expect(calculateConsecutiveFailures(makeHistory(['passed', 'passed']))).toBe(0);
  });

  it('should count trailing failures', () => {
    expect(calculateConsecutiveFailures(makeHistory(['passed', 'failed', 'failed']))).toBe(2);
  });

  it('should count all failures if all failed', () => {
    expect(calculateConsecutiveFailures(makeHistory(['failed', 'failed', 'failed']))).toBe(3);
  });

  it('should not count failures before a pass', () => {
    expect(calculateConsecutiveFailures(makeHistory(['failed', 'passed', 'failed']))).toBe(1);
  });

  it('should count timedout as failure', () => {
    expect(calculateConsecutiveFailures(makeHistory(['passed', 'timedout', 'failed']))).toBe(2);
  });
});

describe('calculateConsecutivePasses', () => {
  it('should return 0 for all failures', () => {
    expect(calculateConsecutivePasses(makeHistory(['failed', 'failed']))).toBe(0);
  });

  it('should count trailing passes', () => {
    expect(calculateConsecutivePasses(makeHistory(['failed', 'passed', 'passed']))).toBe(2);
  });

  it('should not count passes before a failure', () => {
    expect(calculateConsecutivePasses(makeHistory(['passed', 'failed', 'passed']))).toBe(1);
  });
});

describe('classifyTest', () => {
  it('should classify as insufficient_data for few runs', () => {
    const test = makeFlakyTest({
      totalRuns: 3,
      history: makeHistory(['failed', 'passed', 'failed']),
    });
    expect(classifyTest(test, { minimumRuns: 5 })).toBe('insufficient_data');
  });

  it('should classify as broken for consecutive failures', () => {
    const test = makeFlakyTest({
      totalRuns: 5,
      failureRate: 1,
      history: makeHistory(['failed', 'failed', 'failed', 'failed', 'failed']),
    });
    expect(classifyTest(test)).toBe('broken');
  });

  it('should classify as broken with minimum consecutive threshold', () => {
    const test = makeFlakyTest({
      totalRuns: 6,
      failureRate: 0.83,
      history: makeHistory(['passed', 'passed', 'failed', 'failed', 'failed', 'failed']),
    });
    expect(classifyTest(test, { brokenThreshold: 3 })).toBe('broken');
  });

  it('should classify as regression for recent failures after stable period', () => {
    const statuses: Array<'passed' | 'failed'> = [
      'passed', 'passed', 'passed', 'passed', 'passed',
      'failed', 'passed', 'failed', 'failed', 'passed',
    ];
    const test = makeFlakyTest({
      totalRuns: 10,
      failureRate: 0.4,
      history: makeHistory(statuses),
    });
    const result = classifyTest(test, { regressionWindow: 5, brokenThreshold: 4 });
    expect(['regression', 'flaky']).toContain(result);
  });

  it('should classify as stable for very low failure rate', () => {
    const statuses: Array<'passed' | 'failed'> = [
      'passed', 'passed', 'passed', 'passed', 'passed',
      'passed', 'passed', 'passed', 'passed', 'failed',
    ];
    const test = makeFlakyTest({
      totalRuns: 10,
      failureRate: 0.1,
      history: makeHistory(statuses),
    });
    const result = classifyTest(test, { minimumRuns: 5, stableThreshold: 0.05 });
    expect(['stable', 'flaky']).toContain(result);
  });

  it('should classify as flaky for alternating results', () => {
    const statuses: Array<'passed' | 'failed'> = [];
    for (let i = 0; i < 10; i++) {
      statuses.push(i % 2 === 0 ? 'passed' : 'failed');
    }
    const test = makeFlakyTest({
      totalRuns: 10,
      failureRate: 0.5,
      history: makeHistory(statuses),
    });
    expect(classifyTest(test)).toBe('flaky');
  });

  it('should not classify as broken if recent results are mixed', () => {
    const test = makeFlakyTest({
      totalRuns: 6,
      failureRate: 0.5,
      history: makeHistory(['failed', 'failed', 'passed', 'failed', 'passed', 'failed']),
    });
    expect(classifyTest(test)).not.toBe('broken');
  });
});
