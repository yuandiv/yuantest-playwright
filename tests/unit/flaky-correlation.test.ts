import { analyzeCorrelations } from '../../src/flaky/correlation';
import { FlakyTest, RunResult } from '../../src/types';

function makeFlakyTest(testId: string, overrides: Partial<FlakyTest> = {}): FlakyTest {
  return {
    testId,
    title: `Test ${testId}`,
    failureRate: 0.5,
    totalRuns: 10,
    isQuarantined: false,
    history: [],
    classification: 'flaky',
    weightedFailureRate: 0.5,
    consecutiveFailures: 0,
    consecutivePasses: 0,
    ...overrides,
  };
}

function makeRunResult(
  runId: string,
  testResults: Array<{ id: string; status: 'passed' | 'failed' | 'timedout' }>
): RunResult {
  const tests = testResults.map((t) => ({
    id: t.id,
    title: t.id,
    status: t.status,
    duration: 100,
    timestamp: Date.now(),
    retries: 0,
    browser: 'chromium' as const,
    screenshots: [],
    videos: [],
    traces: [],
    logs: [],
  }));

  return {
    id: runId,
    version: '1.0.0',
    status: 'success',
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    duration: 1000,
    suites: [{
      name: 'suite-1',
      totalTests: tests.length,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status === 'failed').length,
      skipped: 0,
      duration: 1000,
      tests,
      timestamp: Date.now(),
    }],
    totalTests: tests.length,
    passed: tests.filter((t) => t.status === 'passed').length,
    failed: tests.filter((t) => t.status === 'failed').length,
    skipped: 0,
    flakyTests: [],
  };
}

describe('analyzeCorrelations', () => {
  it('should return empty array for fewer than 2 tests', () => {
    const tests = [makeFlakyTest('test-1')];
    const result = analyzeCorrelations(tests, []);
    expect(result).toEqual([]);
  });

  it('should detect correlated tests that fail together', () => {
    const testA = makeFlakyTest('test-a', { totalRuns: 5 });
    const testB = makeFlakyTest('test-b', { totalRuns: 5 });

    const recentRuns: RunResult[] = [
      makeRunResult('run-1', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
      ]),
      makeRunResult('run-2', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
      ]),
      makeRunResult('run-3', [
        { id: 'test-a', status: 'passed' },
        { id: 'test-b', status: 'passed' },
      ]),
      makeRunResult('run-4', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
      ]),
    ];

    const result = analyzeCorrelations([testA, testB], recentRuns, {
      coOccurrenceThreshold: 0.5,
      minRuns: 3,
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].testIds).toContain('test-a');
    expect(result[0].testIds).toContain('test-b');
    expect(result[0].confidence).toBeGreaterThan(0);
  });

  it('should not correlate tests that fail independently', () => {
    const testA = makeFlakyTest('test-a', { totalRuns: 5 });
    const testB = makeFlakyTest('test-b', { totalRuns: 5 });

    const recentRuns: RunResult[] = [
      makeRunResult('run-1', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'passed' },
      ]),
      makeRunResult('run-2', [
        { id: 'test-a', status: 'passed' },
        { id: 'test-b', status: 'failed' },
      ]),
      makeRunResult('run-3', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'passed' },
      ]),
      makeRunResult('run-4', [
        { id: 'test-a', status: 'passed' },
        { id: 'test-b', status: 'failed' },
      ]),
    ];

    const result = analyzeCorrelations([testA, testB], recentRuns, {
      coOccurrenceThreshold: 0.5,
      minRuns: 3,
    });

    expect(result).toEqual([]);
  });

  it('should group three correlated tests together', () => {
    const testA = makeFlakyTest('test-a', { totalRuns: 5 });
    const testB = makeFlakyTest('test-b', { totalRuns: 5 });
    const testC = makeFlakyTest('test-c', { totalRuns: 5 });

    const recentRuns: RunResult[] = [
      makeRunResult('run-1', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
        { id: 'test-c', status: 'failed' },
      ]),
      makeRunResult('run-2', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
        { id: 'test-c', status: 'failed' },
      ]),
      makeRunResult('run-3', [
        { id: 'test-a', status: 'passed' },
        { id: 'test-b', status: 'passed' },
        { id: 'test-c', status: 'passed' },
      ]),
      makeRunResult('run-4', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
        { id: 'test-c', status: 'failed' },
      ]),
    ];

    const result = analyzeCorrelations([testA, testB, testC], recentRuns, {
      coOccurrenceThreshold: 0.5,
      minRuns: 3,
    });

    expect(result.length).toBeGreaterThan(0);
    const group = result[0];
    expect(group.testIds).toHaveLength(3);
    expect(group.testIds).toContain('test-a');
    expect(group.testIds).toContain('test-b');
    expect(group.testIds).toContain('test-c');
  });

  it('should respect minRuns config', () => {
    const testA = makeFlakyTest('test-a', { totalRuns: 2 });
    const testB = makeFlakyTest('test-b', { totalRuns: 2 });

    const result = analyzeCorrelations([testA, testB], [], {
      coOccurrenceThreshold: 0.5,
      minRuns: 5,
    });

    expect(result).toEqual([]);
  });

  it('should sort groups by confidence descending', () => {
    const testA = makeFlakyTest('test-a', { totalRuns: 5 });
    const testB = makeFlakyTest('test-b', { totalRuns: 5 });
    const testC = makeFlakyTest('test-c', { totalRuns: 5 });
    const testD = makeFlakyTest('test-d', { totalRuns: 5 });

    const recentRuns: RunResult[] = [
      makeRunResult('run-1', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
        { id: 'test-c', status: 'passed' },
        { id: 'test-d', status: 'passed' },
      ]),
      makeRunResult('run-2', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
        { id: 'test-c', status: 'failed' },
        { id: 'test-d', status: 'failed' },
      ]),
      makeRunResult('run-3', [
        { id: 'test-a', status: 'passed' },
        { id: 'test-b', status: 'passed' },
        { id: 'test-c', status: 'passed' },
        { id: 'test-d', status: 'passed' },
      ]),
      makeRunResult('run-4', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
        { id: 'test-c', status: 'failed' },
        { id: 'test-d', status: 'failed' },
      ]),
    ];

    const result = analyzeCorrelations([testA, testB, testC, testD], recentRuns, {
      coOccurrenceThreshold: 0.5,
      minRuns: 3,
    });

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].confidence).toBeGreaterThanOrEqual(result[i].confidence);
    }
  });

  it('should include evidence description in correlation groups', () => {
    const testA = makeFlakyTest('test-a', { totalRuns: 5 });
    const testB = makeFlakyTest('test-b', { totalRuns: 5 });

    const recentRuns: RunResult[] = [
      makeRunResult('run-1', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
      ]),
      makeRunResult('run-2', [
        { id: 'test-a', status: 'failed' },
        { id: 'test-b', status: 'failed' },
      ]),
      makeRunResult('run-3', [
        { id: 'test-a', status: 'passed' },
        { id: 'test-b', status: 'passed' },
      ]),
    ];

    const result = analyzeCorrelations([testA, testB], recentRuns, {
      coOccurrenceThreshold: 0.5,
      minRuns: 3,
    });

    if (result.length > 0) {
      expect(result[0].evidence).toBeDefined();
      expect(result[0].evidence.length).toBeGreaterThan(0);
    }
  });
});
