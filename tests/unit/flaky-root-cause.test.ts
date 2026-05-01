import { RootCauseAnalyzer, AnalysisContext } from '../../src/flaky/root-cause';
import { FlakyTest, FlakyHistoryEntry, RunResult, SuiteResult } from '../../src/types';

function makeFlakyTest(overrides: Partial<FlakyTest> = {}): FlakyTest {
  return {
    testId: 'test-1',
    title: 'Test 1',
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

function makeHistoryWithError(
  statuses: Array<'passed' | 'failed' | 'timedout'>,
  errors: Array<string | undefined>,
  baseTime = Date.now()
): FlakyHistoryEntry[] {
  return statuses.map((status, i) => ({
    timestamp: baseTime - (statuses.length - i) * 3600000,
    status,
    duration: 100 + Math.random() * 50,
    error: errors[i],
  }));
}

function makeRunResult(
  runId: string,
  testResults: Array<{ id: string; status: 'passed' | 'failed' | 'timedout'; shard?: number }>
): RunResult {
  const tests = testResults.map((t) => ({
    id: t.id,
    title: t.id,
    status: t.status,
    duration: 100,
    timestamp: Date.now(),
    retries: 0,
    browser: 'chromium' as const,
    shard: t.shard,
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

describe('RootCauseAnalyzer', () => {
  let analyzer: RootCauseAnalyzer;

  beforeEach(() => {
    analyzer = new RootCauseAnalyzer();
  });

  describe('timing issue detection', () => {
    it('should detect timing issues from timeout errors', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed', 'failed', 'passed'],
          [undefined, 'Timeout waiting for selector .btn', undefined, 'Navigation timeout exceeded', undefined]
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      const timingEvidence = result.evidence.find((e) => e.type === 'timing');
      expect(timingEvidence).toBeDefined();
      expect(timingEvidence!.confidence).toBeGreaterThan(0);
    });

    it('should not detect timing issues for non-timeout errors', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed', 'failed', 'passed'],
          [undefined, 'Assertion failed: expected 5', undefined, 'Assertion failed: expected 3', undefined]
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      const timingEvidence = result.evidence.find((e) => e.type === 'timing');
      expect(timingEvidence).toBeUndefined();
    });
  });

  describe('external service detection', () => {
    it('should detect external service issues from network errors', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed', 'failed', 'passed'],
          [undefined, 'Network request failed: ECONNREFUSED', undefined, 'fetch failed with 503', undefined]
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      const externalEvidence = result.evidence.find((e) => e.type === 'external_service');
      expect(externalEvidence).toBeDefined();
      expect(externalEvidence!.confidence).toBeGreaterThan(0);
    });

    it('should detect 5xx errors as external service issues', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['failed', 'passed', 'failed'],
          ['Internal server error 500', undefined, '502 Bad Gateway']
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      const externalEvidence = result.evidence.find((e) => e.type === 'external_service');
      expect(externalEvidence).toBeDefined();
    });
  });

  describe('assertion flaky detection', () => {
    it('should detect assertion issues from assertion errors', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed', 'failed', 'passed'],
          [undefined, 'AssertionError: expected 5 to equal 4', undefined, 'expect(received).toBe(expected)', undefined]
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      const assertionEvidence = result.evidence.find((e) => e.type === 'assertion_flaky');
      expect(assertionEvidence).toBeDefined();
    });
  });

  describe('data race detection', () => {
    it('should detect data race from shard inconsistency', () => {
      const test = makeFlakyTest({
        testId: 'test-1',
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed', 'failed'],
          [undefined, 'failed', undefined, 'failed']
        ),
      });

      const recentRuns: RunResult[] = [
        makeRunResult('run-1', [
          { id: 'test-1', status: 'passed', shard: 1 },
        ]),
        makeRunResult('run-2', [
          { id: 'test-1', status: 'failed', shard: 2 },
        ]),
        makeRunResult('run-3', [
          { id: 'test-1', status: 'passed', shard: 1 },
        ]),
        makeRunResult('run-4', [
          { id: 'test-1', status: 'failed', shard: 2 },
        ]),
      ];

      const context: AnalysisContext = {
        recentRuns,
        shardMap: new Map([['test-1', 2]]),
      };

      const result = analyzer.analyze(test, context);
      const dataRaceEvidence = result.evidence.find((e) => e.type === 'data_race');
      expect(dataRaceEvidence).toBeDefined();
    });
  });

  describe('resource leak detection', () => {
    it('should detect resource leak from memory errors', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed', 'failed'],
          [undefined, 'Out of memory: heap allocation failed', undefined, 'Cannot allocate memory']
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      const resourceEvidence = result.evidence.find((e) => e.type === 'resource_leak');
      expect(resourceEvidence).toBeDefined();
    });

    it('should detect resource leak from increasing duration trend', () => {
      const now = Date.now();
      const history: FlakyHistoryEntry[] = [100, 150, 200, 300, 450, 600, 800, 1100].map(
        (duration, i) => ({
          timestamp: now - (8 - i) * 3600000,
          status: i % 3 === 0 ? 'failed' as const : 'passed' as const,
          duration,
          error: i % 3 === 0 ? 'test failed' : undefined,
        })
      );

      const test = makeFlakyTest({ history });
      const result = analyzer.analyze(test, { recentRuns: [] });
      const resourceEvidence = result.evidence.find((e) => e.type === 'resource_leak');
      expect(resourceEvidence).toBeDefined();
    });
  });

  describe('test order dependency detection', () => {
    it('should detect test order dependency', () => {
      const test = makeFlakyTest({
        testId: 'test-1',
        history: makeHistoryWithError(
          ['failed', 'failed', 'failed'],
          ['failed', 'failed', 'failed']
        ),
      });

      const recentRuns: RunResult[] = [
        makeRunResult('run-1', [
          { id: 'test-setup', status: 'passed' },
          { id: 'test-1', status: 'failed' },
        ]),
        makeRunResult('run-2', [
          { id: 'test-setup', status: 'passed' },
          { id: 'test-1', status: 'failed' },
        ]),
        makeRunResult('run-3', [
          { id: 'test-setup', status: 'passed' },
          { id: 'test-1', status: 'failed' },
        ]),
      ];

      const result = analyzer.analyze(test, { recentRuns });
      const orderEvidence = result.evidence.find((e) => e.type === 'test_order');
      expect(orderEvidence).toBeDefined();
    });
  });

  describe('analysis result', () => {
    it('should return unknown when no evidence found', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['passed', 'failed', 'passed'],
          [undefined, 'some unknown error', undefined]
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      expect(result.testId).toBe('test-1');
      expect(result.evidence).toBeDefined();
      expect(result.suggestedActions).toBeDefined();
      expect(result.analyzedAt).toBeGreaterThan(0);
    });

    it('should sort evidence by confidence descending', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['failed', 'failed', 'failed', 'failed', 'failed'],
          ['Timeout waiting for selector', 'Network error ECONNREFUSED', 'Timeout exceeded', 'fetch failed', 'Timeout']
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      for (let i = 1; i < result.evidence.length; i++) {
        expect(result.evidence[i - 1].confidence).toBeGreaterThanOrEqual(
          result.evidence[i].confidence
        );
      }
    });

    it('should provide suggested actions for primary cause', () => {
      const test = makeFlakyTest({
        history: makeHistoryWithError(
          ['failed', 'passed', 'failed'],
          ['Timeout waiting for selector', undefined, 'Navigation timeout']
        ),
      });

      const result = analyzer.analyze(test, { recentRuns: [] });
      expect(result.suggestedActions.length).toBeGreaterThan(0);
    });
  });
});
