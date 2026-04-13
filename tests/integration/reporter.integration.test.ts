import { Reporter } from '../../src/reporter';
import { RunResult, TestResult, SuiteResult } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Reporter Integration', () => {
  let tmpDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-test-'));
    outputDir = path.join(tmpDir, 'reports');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createMockRunResult = (overrides: Partial<RunResult> = {}): RunResult => {
    const testResult: TestResult = {
      id: 'test-1',
      title: 'Example Test',
      status: 'passed',
      duration: 1000,
      timestamp: Date.now(),
      browser: 'chromium',
      retries: 0,
      logs: [],
    };

    const suite: SuiteResult = {
      name: 'Example Suite',
      totalTests: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      duration: 1000,
      tests: [testResult],
      timestamp: Date.now(),
    };

    return {
      id: 'run-test-123',
      version: 'test-project',
      status: 'success',
      startTime: Date.now(),
      duration: 1000,
      suites: [suite],
      totalTests: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      flakyTests: [],
      metadata: {},
      ...overrides,
    };
  };

  describe('Report Generation', () => {
    it('should generate JSON report', async () => {
      const reporter = new Reporter(outputDir);
      const runResult = createMockRunResult();

      const reportPath = await reporter.generateReport(runResult);

      expect(reportPath).toContain('.html');
      expect(fs.existsSync(reportPath)).toBe(true);
    });

    it('should save JSON report file', async () => {
      const reporter = new Reporter(outputDir);
      const runResult = createMockRunResult();

      await reporter.generateReport(runResult);

      const jsonPath = path.join(outputDir, `${runResult.id}.json`);
      expect(fs.existsSync(jsonPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      expect(content.id).toBe(runResult.id);
      expect(content.version).toBe('test-project');
    });

    it('should generate HTML report file', async () => {
      const reporter = new Reporter(outputDir);
      const runResult = createMockRunResult();

      await reporter.generateReport(runResult);

      const htmlPath = path.join(outputDir, `${runResult.id}.html`);
      expect(fs.existsSync(htmlPath)).toBe(true);

      const content = fs.readFileSync(htmlPath, 'utf-8');
      expect(content).toContain('test-project');
      expect(content).toContain('Example Suite');
    });
  });

  describe('Report Retrieval', () => {
    it('should retrieve saved report by ID', async () => {
      const reporter = new Reporter(outputDir);
      const runResult = createMockRunResult();

      await reporter.generateReport(runResult);

      const retrieved = await reporter.getReport(runResult.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(runResult.id);
      expect(retrieved!.version).toBe('test-project');
    });

    it('should return null for non-existent report', async () => {
      const reporter = new Reporter(outputDir);

      const retrieved = await reporter.getReport('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('should retrieve all reports', async () => {
      const reporter = new Reporter(outputDir);

      const runResult1 = createMockRunResult({ id: 'run-1' });
      const runResult2 = createMockRunResult({ id: 'run-2' });

      await reporter.generateReport(runResult1);
      await reporter.generateReport(runResult2);

      const allReports = await reporter.getAllReports();

      expect(allReports.length).toBe(2);
      expect(allReports.map(r => r.id)).toContain('run-1');
      expect(allReports.map(r => r.id)).toContain('run-2');
    });
  });

  describe('Failure Analysis', () => {
    it('should analyze failed tests', async () => {
      const reporter = new Reporter(outputDir);

      const failedTest: TestResult = {
        id: 'test-failed',
        title: 'Failing Test',
        status: 'failed',
        duration: 2000,
        error: 'Timeout waiting for element',
        timestamp: Date.now(),
        browser: 'chromium',
        retries: 0,
        logs: [],
      };

      const runResult = createMockRunResult({
        suites: [{
          name: 'Suite with Failure',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 2000,
          tests: [failedTest],
          timestamp: Date.now(),
        }],
        passed: 0,
        failed: 1,
      });

      const analysis = await reporter.analyzeFailures(runResult);

      expect(analysis.length).toBe(1);
      expect(analysis[0].title).toBe('Failing Test');
      expect(analysis[0].category).toBe('timeout');
      expect(analysis[0].suggestions.length).toBeGreaterThan(0);
    });

    it('should categorize selector errors', async () => {
      const reporter = new Reporter(outputDir);

      const failedTest: TestResult = {
        id: 'test-selector',
        title: 'Selector Error Test',
        status: 'failed',
        duration: 1000,
        error: 'Element not found: selector #missing',
        timestamp: Date.now(),
        browser: 'chromium',
        retries: 0,
        logs: [],
      };

      const runResult = createMockRunResult({
        suites: [{
          name: 'Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 1000,
          tests: [failedTest],
          timestamp: Date.now(),
        }],
        passed: 0,
        failed: 1,
      });

      const analysis = await reporter.analyzeFailures(runResult);

      expect(analysis[0].category).toBe('selector');
    });

    it('should categorize network errors', async () => {
      const reporter = new Reporter(outputDir);

      const failedTest: TestResult = {
        id: 'test-network',
        title: 'Network Error Test',
        status: 'failed',
        duration: 1000,
        error: 'Network request failed: connection refused',
        timestamp: Date.now(),
        browser: 'chromium',
        retries: 0,
        logs: [],
      };

      const runResult = createMockRunResult({
        suites: [{
          name: 'Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 1000,
          tests: [failedTest],
          timestamp: Date.now(),
        }],
        passed: 0,
        failed: 1,
      });

      const analysis = await reporter.analyzeFailures(runResult);

      expect(analysis[0].category).toBe('network');
    });
  });

  describe('Dashboard Stats', () => {
    it('should generate dashboard statistics', async () => {
      const reporter = new Reporter(outputDir);

      await reporter.generateReport(createMockRunResult({ id: 'run-1', passed: 5, failed: 1, totalTests: 6 }));
      await reporter.generateReport(createMockRunResult({ id: 'run-2', passed: 4, failed: 2, totalTests: 6 }));

      const stats = await reporter.generateDashboard();

      expect(stats.totalRuns).toBe(2);
      expect(stats.totalTests).toBe(12);
      expect(stats.passRate).toBeCloseTo(75, 0);
    });
  });
});
