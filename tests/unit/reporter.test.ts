import { Reporter, JSONReporter } from '../../src/reporter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Reporter', () => {
  let tmpDir: string;
  let reporter: Reporter;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reporter-test-'));
    reporter = new Reporter(tmpDir);
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should generate a report', async () => {
    const runResult = {
      id: 'run-test-1',
      version: 'test-project',
      status: 'success' as const,
      startTime: Date.now() - 5000,
      endTime: Date.now(),
      duration: 5000,
      suites: [{
        name: 'Suite 1',
        totalTests: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        duration: 5000,
        tests: [
          { id: 't1', title: 'Test 1', status: 'passed' as const, duration: 1000, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [] },
          { id: 't2', title: 'Test 2', status: 'passed' as const, duration: 2000, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [] },
          { id: 't3', title: 'Test 3', status: 'failed' as const, duration: 2000, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Expected true but got false' },
        ],
        timestamp: Date.now(),
      }],
      totalTests: 3,
      passed: 2,
      failed: 1,
      skipped: 0,
      flakyTests: [],
      metadata: {},
    };

    await reporter.generateReport(runResult);

    const report = await reporter.getReport('run-test-1');
    expect(report).toBeDefined();
    expect(report!.id).toBe('run-test-1');
    expect(report!.totalTests).toBe(3);
    expect(report!.passed).toBe(2);
    expect(report!.failed).toBe(1);
  });

  it('should list all reports', async () => {
    for (let i = 0; i < 3; i++) {
      await reporter.generateReport({
        id: `run-list-${i}`,
        version: 'test',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      });
    }

    const reports = await reporter.getAllReports();
    expect(reports.length).toBe(3);
  });

  it('should analyze failures', async () => {
    const runResult = {
      id: 'run-analysis',
      version: 'test',
      status: 'failed' as const,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 1000,
      suites: [{
        name: 'Suite',
        totalTests: 2,
        passed: 0,
        failed: 2,
        skipped: 0,
        duration: 1000,
        tests: [
          { id: 't1', title: 'Timeout Test', status: 'failed' as const, duration: 30000, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Timeout 30000ms exceeded' },
          { id: 't2', title: 'Selector Test', status: 'failed' as const, duration: 500, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Error: waiting for selector ".btn"' },
        ],
        timestamp: Date.now(),
      }],
      totalTests: 2,
      passed: 0,
      failed: 2,
      skipped: 0,
      flakyTests: [],
      metadata: {},
    };

    await reporter.generateReport(runResult);
    const report = await reporter.getReport('run-analysis');
    const analysis = await reporter.analyzeFailures(report!);

    expect(analysis.length).toBe(2);
    expect(analysis[0].category).toBe('timeout');
    expect(analysis[1].category).toBe('selector');
    expect(analysis[0].suggestions.length).toBeGreaterThan(0);
    expect(analysis[1].suggestions.length).toBeGreaterThan(0);
  });

  describe('deleteReport', () => {
    it('should delete a report', async () => {
      await reporter.generateReport({
        id: 'run-delete-test',
        version: 'test',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      });

      const result = await reporter.deleteReport('run-delete-test');
      expect(result).toBe(true);

      const report = await reporter.getReport('run-delete-test');
      expect(report).toBeNull();
    });

    it('should handle deleting non-existent report gracefully', async () => {
      const result = await reporter.deleteReport('non-existent-report-id');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('deleteAllReports', () => {
    it('should delete all reports', async () => {
      for (let i = 0; i < 3; i++) {
        await reporter.generateReport({
          id: `run-delete-all-${i}`,
          version: 'test',
          status: 'success' as const,
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 1000,
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        });
      }

      const deletedCount = await reporter.deleteAllReports();
      expect(deletedCount).toBe(3);

      const reports = await reporter.getAllReports();
      expect(reports.length).toBe(0);
    });
  });

  describe('generateDashboard', () => {
    it('should generate dashboard stats', async () => {
      await reporter.generateReport({
        id: 'run-dashboard-1',
        version: 'test',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 5000,
        suites: [{
          name: 'Suite',
          totalTests: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
          duration: 5000,
          tests: [
            { id: 't1', title: 'Test 1', status: 'passed' as const, duration: 1000, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [] },
            { id: 't2', title: 'Test 2', status: 'passed' as const, duration: 1000, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [] },
          ],
          timestamp: Date.now(),
        }],
        totalTests: 2,
        passed: 2,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      });

      const stats = await reporter.generateDashboard();
      expect(stats.totalRuns).toBe(1);
      expect(stats.totalTests).toBe(2);
      expect(stats.passRate).toBe(100);
    });

    it('should handle empty reports', async () => {
      const stats = await reporter.generateDashboard();
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalTests).toBe(0);
      expect(stats.passRate).toBe(0);
      expect(stats.avgDuration).toBe(0);
    });
  });

  describe('analyzeFailures', () => {
    it('should categorize network errors', async () => {
      const runResult = {
        id: 'run-network',
        version: 'test',
        status: 'failed' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [{
          name: 'Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 1000,
          tests: [
            { id: 't1', title: 'Network Test', status: 'failed' as const, duration: 500, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Network error: fetch failed' },
          ],
          timestamp: Date.now(),
        }],
        totalTests: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await reporter.generateReport(runResult);
      const report = await reporter.getReport('run-network');
      const analysis = await reporter.analyzeFailures(report!);

      expect(analysis.length).toBe(1);
      expect(analysis[0].category).toBe('network');
    });

    it('should categorize assertion errors', async () => {
      const runResult = {
        id: 'run-assertion',
        version: 'test',
        status: 'failed' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [{
          name: 'Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 1000,
          tests: [
            { id: 't1', title: 'Assertion Test', status: 'failed' as const, duration: 500, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'AssertionError: expect(true).toBe(false)' },
          ],
          timestamp: Date.now(),
        }],
        totalTests: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await reporter.generateReport(runResult);
      const report = await reporter.getReport('run-assertion');
      const analysis = await reporter.analyzeFailures(report!);

      expect(analysis.length).toBe(1);
      expect(analysis[0].category).toBe('assertion');
    });

    it('should categorize unknown errors', async () => {
      const runResult = {
        id: 'run-unknown',
        version: 'test',
        status: 'failed' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [{
          name: 'Suite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          duration: 1000,
          tests: [
            { id: 't1', title: 'Unknown Test', status: 'failed' as const, duration: 500, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Something went wrong' },
          ],
          timestamp: Date.now(),
        }],
        totalTests: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await reporter.generateReport(runResult);
      const report = await reporter.getReport('run-unknown');
      const analysis = await reporter.analyzeFailures(report!);

      expect(analysis.length).toBe(1);
      expect(analysis[0].category).toBe('unknown');
    });

    it('should count occurrences of same test failure', async () => {
      const runResult = {
        id: 'run-occurrences',
        version: 'test',
        status: 'failed' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [{
          name: 'Suite',
          totalTests: 2,
          passed: 0,
          failed: 2,
          skipped: 0,
          duration: 1000,
          tests: [
            { id: 't1', title: 'Same Test', status: 'failed' as const, duration: 500, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Error' },
            { id: 't1', title: 'Same Test', status: 'failed' as const, duration: 500, retries: 0, timestamp: Date.now(), browser: 'chromium' as const, screenshots: [], videos: [], traces: [], logs: [], error: 'Error' },
          ],
          timestamp: Date.now(),
        }],
        totalTests: 2,
        passed: 0,
        failed: 2,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await reporter.generateReport(runResult);
      const report = await reporter.getReport('run-occurrences');
      const analysis = await reporter.analyzeFailures(report!);

      expect(analysis.length).toBe(1);
      expect(analysis[0].occurrences).toBe(2);
    });
  });

  describe('getAllReports', () => {
    it('should return empty array when no reports exist', async () => {
      const reports = await reporter.getAllReports();
      expect(reports).toEqual([]);
    });

    it('should skip invalid report files', async () => {
      fs.writeFileSync(path.join(tmpDir, 'invalid.json'), 'not valid json', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'valid.json'), JSON.stringify({
        id: 'valid-run',
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
      }), 'utf8');

      const reports = await reporter.getAllReports();
      expect(reports.length).toBe(1);
      expect(reports[0].id).toBe('valid-run');
    });
  });

  describe('report with metadata', () => {
    it('should include metadata in report', async () => {
      const runResult = {
        id: 'run-metadata',
        version: 'test',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {
          annotations: [{ type: 'skip', testName: 'Test 1', file: 'test.ts' }],
          tags: [{ name: 'smoke', count: 5 }],
          traces: { total: 2, files: [] },
          artifacts: { total: 3, byType: { screenshot: 2, video: 1 } },
          visualTesting: { passRate: 100, identical: 5, different: 0, regression: 0, new: 0, results: [] },
        },
      };

      await reporter.generateReport(runResult);
      const report = await reporter.getReport('run-metadata');

      expect(report).toBeDefined();
      expect(report!.metadata).toBeDefined();
      expect(report!.metadata!.annotations).toBeDefined();
      expect(report!.metadata!.tags).toBeDefined();
    });
  });
});

describe('JSONReporter', () => {
  let tmpDir: string;
  let reporter: JSONReporter;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'json-reporter-test-'));
    reporter = new JSONReporter(tmpDir);
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should generate JSON report string', async () => {
    const runResult = {
      id: 'run-json',
      version: 'test',
      status: 'success' as const,
      startTime: Date.now(),
      endTime: Date.now(),
      duration: 1000,
      suites: [],
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flakyTests: [],
      metadata: {},
    };

    const jsonStr = await reporter.generateJSONReport(runResult);
    expect(jsonStr).toContain('run-json');
    expect(jsonStr).toContain('success');

    const parsed = JSON.parse(jsonStr);
    expect(parsed.id).toBe('run-json');
  });
});
