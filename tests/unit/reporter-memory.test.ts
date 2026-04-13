import { Reporter } from '../../src/reporter';
import { MemoryStorage } from '../../src/storage';
import { RunResult } from '../../src/types';

describe('Reporter with MemoryStorage', () => {
  let storage: MemoryStorage;
  let reporter: Reporter;

  beforeEach(async () => {
    storage = new MemoryStorage();
    reporter = new Reporter('./test-reports', storage);
  });

  function createMockRunResult(overrides?: Partial<RunResult>): RunResult {
    return {
      id: 'run-test-001',
      version: 'test-project',
      status: 'success',
      startTime: Date.now() - 5000,
      endTime: Date.now(),
      duration: 5000,
      suites: [
        {
          name: 'Test Suite 1',
          totalTests: 3,
          passed: 2,
          failed: 1,
          skipped: 0,
          duration: 3000,
          tests: [
            {
              id: 'test-1',
              title: 'Test 1',
              status: 'passed',
              duration: 1000,
              timestamp: Date.now() - 4000,
              retries: 0,
              browser: 'chromium',
            },
            {
              id: 'test-2',
              title: 'Test 2',
              status: 'failed',
              duration: 1500,
              error: 'Expected true but received false',
              timestamp: Date.now() - 3000,
              retries: 0,
              browser: 'chromium',
            },
            {
              id: 'test-3',
              title: 'Test 3',
              status: 'passed',
              duration: 500,
              timestamp: Date.now() - 2000,
              retries: 0,
              browser: 'chromium',
            },
          ],
          timestamp: Date.now() - 5000,
        },
      ],
      totalTests: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      flakyTests: [],
      ...overrides,
    };
  }

  it('should generate and store a report', async () => {
    const runResult = createMockRunResult();
    const htmlPath = await reporter.generateReport(runResult);

    expect(htmlPath).toBeDefined();
    expect(htmlPath.endsWith('.html')).toBe(true);

    const stored = await reporter.getReport(runResult.id);
    expect(stored).toBeDefined();
    expect(stored!.id).toBe(runResult.id);
    expect(stored!.totalTests).toBe(3);
  });

  it('should retrieve all reports', async () => {
    const run1 = createMockRunResult({ id: 'run-001' });
    const run2 = createMockRunResult({ id: 'run-002' });

    await reporter.generateReport(run1);
    await reporter.generateReport(run2);

    const allReports = await reporter.getAllReports();
    expect(allReports.length).toBe(2);
  });

  it('should return null for non-existent report', async () => {
    const report = await reporter.getReport('non-existent');
    expect(report).toBeNull();
  });

  it('should analyze failures', async () => {
    const runResult = createMockRunResult();
    const analyses = await reporter.analyzeFailures(runResult);

    expect(analyses.length).toBe(1);
    expect(analyses[0].testId).toBe('test-2');
    expect(analyses[0].category).toBe('assertion');
    expect(analyses[0].suggestions.length).toBeGreaterThan(0);
  });

  it('should categorize timeout errors', async () => {
    const runResult = createMockRunResult({
      suites: [
        {
          name: 'Timeout Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 30000,
          tests: [
            {
              id: 'timeout-test',
              title: 'Timeout Test',
              status: 'failed',
              duration: 30000,
              error: 'Timeout of 30000ms exceeded',
              timestamp: Date.now(),
              retries: 0,
              browser: 'chromium',
            },
          ],
          timestamp: Date.now(),
        },
      ],
      totalTests: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    });

    const analyses = await reporter.analyzeFailures(runResult);
    expect(analyses[0].category).toBe('timeout');
  });

  it('should categorize selector errors', async () => {
    const runResult = createMockRunResult({
      suites: [
        {
          name: 'Selector Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 1000,
          tests: [
            {
              id: 'selector-test',
              title: 'Selector Test',
              status: 'failed',
              duration: 1000,
              error: 'Error: waiting for selector ".btn-submit" failed',
              timestamp: Date.now(),
              retries: 0,
              browser: 'chromium',
            },
          ],
          timestamp: Date.now(),
        },
      ],
      totalTests: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
    });

    const analyses = await reporter.analyzeFailures(runResult);
    expect(analyses[0].category).toBe('selector');
  });

  it('should generate dashboard stats', async () => {
    const run1 = createMockRunResult({ id: 'run-001', totalTests: 3, passed: 2, failed: 1, duration: 5000 });
    const run2 = createMockRunResult({ id: 'run-002', totalTests: 5, passed: 5, failed: 0, duration: 3000 });

    await reporter.generateReport(run1);
    await reporter.generateReport(run2);

    const stats = await reporter.generateDashboard();
    expect(stats.totalRuns).toBe(2);
    expect(stats.totalTests).toBe(8);
    expect(stats.passRate).toBeCloseTo(87.5, 0);
  });
});
