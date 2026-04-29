import { RunResult, TestResult, FailureAnalysis, DashboardStats, TestRunHistory } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { StorageProvider, getStorage } from '../storage';
import { CACHE_CONFIG, DEFAULTS } from '../constants';

function resolveTemplatesDir(): string {
  const distDir = path.join(__dirname, 'templates');
  if (fs.existsSync(distDir)) {
    return distDir;
  }
  const srcDir = path.join(__dirname, '..', '..', 'src', 'reporter', 'templates');
  if (fs.existsSync(srcDir)) {
    return srcDir;
  }
  throw new Error(`Report templates not found. Searched: ${distDir}, ${srcDir}`);
}

const TEMPLATES_DIR = resolveTemplatesDir();

export class Reporter {
  private outputDir: string;
  private reports: Map<string, RunResult> = new Map();
  private reportOrder: string[] = [];
  private maxCacheSize: number = CACHE_CONFIG.MAX_REPORT_CACHE_SIZE;
  private log = logger.child('Reporter');
  private storage: StorageProvider;
  private initialized: Promise<void>;
  private pendingReports: Map<string, RunResult> = new Map();

  constructor(outputDir: string = DEFAULTS.REPORTS_DIR, storage?: StorageProvider) {
    this.outputDir = outputDir;
    this.storage = storage || getStorage();
    this.initialized = this.storage.mkdir(this.outputDir);
  }

  private ensureReady(): Promise<void> {
    return this.initialized;
  }

  private evictOldest(): void {
    while (this.reportOrder.length > this.maxCacheSize) {
      const oldestId = this.reportOrder.shift();
      if (oldestId) {
        this.reports.delete(oldestId);
        this.log.debug(`Evicted report from cache: ${oldestId}`);
      }
    }
  }

  private addToCache(reportId: string, runResult: RunResult): void {
    if (this.reports.has(reportId)) {
      const index = this.reportOrder.indexOf(reportId);
      if (index > -1) {
        this.reportOrder.splice(index, 1);
      }
    }
    this.reports.set(reportId, runResult);
    this.reportOrder.push(reportId);
    this.evictOldest();
  }

  async generateReport(runResult: RunResult): Promise<string> {
    await this.ensureReady();
    const reportId = runResult.id;
    const reportPath = path.join(this.outputDir, `${reportId}.json`);
    const htmlReportPath = path.join(this.outputDir, `${reportId}.html`);

    this.addToCache(reportId, runResult);

    const htmlExists = fs.existsSync(htmlReportPath);

    const writeOps: Promise<void>[] = [this.storage.writeJSON(reportPath, runResult)];

    if (!htmlExists) {
      const htmlTemplate = fs.readFileSync(path.join(TEMPLATES_DIR, 'report.html'), 'utf-8');
      writeOps.push(this.storage.writeText(htmlReportPath, htmlTemplate));
    }

    await Promise.all(writeOps);

    this.emitReportEvent(runResult);

    return htmlReportPath;
  }

  private emitReportEvent(runResult: RunResult): void {
    console.log(`[Reporter] Report generated for run ${runResult.id}`);
  }

  async generateDashboard(): Promise<DashboardStats> {
    const runs = await this.getAllReports();
    const totalTests = runs.reduce((sum, r) => sum + r.totalTests, 0);
    const totalPassed = runs.reduce((sum, r) => sum + r.passed, 0);
    const passRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
    const avgDuration =
      runs.length > 0 ? runs.reduce((sum, r) => sum + (r.duration || 0), 0) / runs.length : 0;

    const flakyTests = runs.reduce((flaky, r) => [...flaky, ...r.flakyTests], [] as TestResult[]);

    return {
      totalRuns: runs.length,
      totalTests,
      passRate,
      avgDuration,
      flakyTests: flakyTests.length,
      quarantinedTests: 0,
      recentRuns: runs.slice(-10),
    };
  }

  async analyzeFailures(runResult: RunResult): Promise<FailureAnalysis[]> {
    const analyses: FailureAnalysis[] = [];

    for (const suite of runResult.suites) {
      for (const test of suite.tests.filter((t) => t.status === 'failed')) {
        const existing = analyses.find((a) => a.testId === test.id);
        if (existing) {
          existing.occurrences++;
        } else {
          analyses.push({
            testId: test.id,
            title: test.title,
            failureReason: test.error || 'Unknown error',
            category: this.categorizeError(test.error || ''),
            suggestions: this.generateSuggestions(test.error || ''),
            occurrences: 1,
            lastOccurrence: test.timestamp,
          });
        }
      }
    }

    return analyses;
  }

  private categorizeError(error: string): FailureAnalysis['category'] {
    const errorLower = error.toLowerCase();
    if (errorLower.includes('timeout')) {
      return 'timeout';
    }
    if (errorLower.includes('selector') || errorLower.includes('element')) {
      return 'selector';
    }
    if (errorLower.includes('network') || errorLower.includes('fetch')) {
      return 'network';
    }
    if (errorLower.includes('assertion') || errorLower.includes('expect')) {
      return 'assertion';
    }
    return 'unknown';
  }

  private generateSuggestions(error: string): string[] {
    const suggestions: string[] = [];
    const errorLower = error.toLowerCase();

    if (errorLower.includes('timeout')) {
      suggestions.push('Consider increasing the timeout value');
      suggestions.push('Check if the element is taking too long to load');
    }
    if (errorLower.includes('selector')) {
      suggestions.push('Verify the selector is correct');
      suggestions.push('Check if the element exists in the DOM');
    }
    if (errorLower.includes('network')) {
      suggestions.push('Check network connectivity');
      suggestions.push('Verify API endpoints are accessible');
    }
    if (suggestions.length === 0) {
      suggestions.push('Review the error message and stack trace');
      suggestions.push('Check recent code changes that may have caused this failure');
    }

    return suggestions;
  }

  async getReport(reportId: string): Promise<RunResult | null> {
    await this.ensureReady();
    const reportPath = path.join(this.outputDir, `${reportId}.json`);
    return this.storage.readJSON<RunResult>(reportPath);
  }

  async deleteReport(reportId: string): Promise<boolean> {
    await this.ensureReady();
    const reportPath = path.join(this.outputDir, `${reportId}.json`);
    const htmlReportPath = path.join(this.outputDir, `${reportId}.html`);
    const playwrightHtmlReportDir = path.join(this.outputDir, 'html-reports', reportId);

    try {
      await this.storage.remove(reportPath);
      try {
        await this.storage.remove(htmlReportPath);
      } catch {
        // HTML report might not exist, ignore
      }

      try {
        await this.storage.removeDir(playwrightHtmlReportDir);
        this.log.debug(`Deleted Playwright HTML report directory: ${playwrightHtmlReportDir}`);
      } catch {
        // Playwright HTML report directory might not exist, ignore
      }

      this.reports.delete(reportId);
      const index = this.reportOrder.indexOf(reportId);
      if (index > -1) {
        this.reportOrder.splice(index, 1);
      }

      this.log.info(`Deleted report: ${reportId}`);
      return true;
    } catch (error) {
      this.log.error(`Failed to delete report ${reportId}: ${error}`);
      return false;
    }
  }

  async deleteAllReports(): Promise<number> {
    await this.ensureReady();
    const files = await this.storage.readDir(this.outputDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    let deletedCount = 0;

    for (const file of jsonFiles) {
      const reportId = file.replace('.json', '');
      const success = await this.deleteReport(reportId);
      if (success) {
        deletedCount++;
      }
    }

    this.reports.clear();
    this.reportOrder = [];

    this.log.info(`Deleted ${deletedCount} reports`);
    return deletedCount;
  }

  async getAllReports(): Promise<RunResult[]> {
    await this.ensureReady();
    if (this.reports.size > 0) {
      return Array.from(this.reports.values());
    }
    const files = await this.storage.readDir(this.outputDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const results = await Promise.all(
      jsonFiles.map(async (file) => {
        try {
          const parsed = await this.storage.readJSON<RunResult>(path.join(this.outputDir, file));
          if (parsed && parsed.id && parsed.suites) {
            this.addToCache(parsed.id, parsed);
            return parsed;
          }
          return null;
        } catch (e: unknown) {
          this.log.warn(
            `Skipping invalid report file: ${file} - ${e instanceof Error ? e.message : String(e)}`
          );
          return null;
        }
      })
    );
    return results.filter((r): r is RunResult => r !== null);
  }

  /**
   * 清除内存缓存，强制下次调用 getAllReports 时重新从文件系统加载
   */
  clearCache(): void {
    this.reports.clear();
    this.reportOrder = [];
    this.log.debug('Reporter cache cleared');
  }

  async createPendingReport(runId: string, version: string): Promise<RunResult> {
    await this.ensureReady();

    const runResult: RunResult = {
      id: runId,
      version,
      status: 'running',
      startTime: Date.now(),
      suites: [],
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flakyTests: [],
      metadata: {},
    };

    this.pendingReports.set(runId, runResult);
    this.addToCache(runId, runResult);

    const reportPath = path.join(this.outputDir, `${runId}.json`);
    await this.storage.writeJSON(reportPath, runResult);

    this.log.info(`Created pending report: ${runId}`);
    return runResult;
  }

  async updatePendingReport(
    runId: string,
    testResult: TestResult,
    suiteName: string
  ): Promise<void> {
    const report = this.pendingReports.get(runId);
    if (!report) {
      this.log.warn(`Pending report not found: ${runId}`);
      return;
    }

    let suite = report.suites.find((s) => s.name === suiteName);
    if (!suite) {
      suite = {
        name: suiteName,
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        tests: [],
        timestamp: Date.now(),
      };
      report.suites.push(suite);
    }

    const existingTestIndex = suite.tests.findIndex((t) => t.id === testResult.id);
    if (existingTestIndex >= 0) {
      const existingTest = suite.tests[existingTestIndex];
      suite.duration -= existingTest.duration;
      suite.tests[existingTestIndex] = testResult;
      suite.duration += testResult.duration;

      if (existingTest.status === 'passed') {
        suite.passed--;
        report.passed--;
      } else if (existingTest.status === 'failed' || existingTest.status === 'timedout') {
        suite.failed--;
        report.failed--;
      } else if (existingTest.status === 'skipped') {
        suite.skipped--;
        report.skipped--;
      }
    } else {
      suite.tests.push(testResult);
      suite.totalTests++;
      suite.duration += testResult.duration;
      report.totalTests++;
    }

    if (testResult.status === 'passed') {
      suite.passed++;
      report.passed++;
    } else if (testResult.status === 'failed' || testResult.status === 'timedout') {
      suite.failed++;
      report.failed++;
    } else if (testResult.status === 'skipped') {
      suite.skipped++;
      report.skipped++;
    }

    this.addToCache(runId, report);
  }

  async finalizePendingReport(
    runId: string,
    status: 'success' | 'failed' | 'cancelled'
  ): Promise<string> {
    await this.ensureReady();

    const report = this.pendingReports.get(runId);
    if (!report) {
      throw new Error(`Pending report not found: ${runId}`);
    }

    report.status = status;
    report.endTime = Date.now();
    report.duration = report.endTime - report.startTime;

    const htmlReportPath = await this.generateReport(report);

    const reportPath = path.join(this.outputDir, `${runId}.json`);
    await this.storage.writeJSON(reportPath, report);

    this.pendingReports.delete(runId);

    this.log.info(`Finalized pending report: ${runId} with status: ${status}`);
    return htmlReportPath;
  }

  getPendingReport(runId: string): RunResult | undefined {
    return this.pendingReports.get(runId);
  }

  hasPendingReport(runId: string): boolean {
    return this.pendingReports.has(runId);
  }

  async updateTestResult(runId: string, testId: string, newResult: TestResult): Promise<boolean> {
    await this.ensureReady();

    const report = await this.getReport(runId);
    if (!report) {
      this.log.warn(`Report not found: ${runId}`);
      return false;
    }

    let testFound = false;
    for (const suite of report.suites) {
      const testIndex = suite.tests.findIndex(
        (t) => t.id === testId || (t.file === newResult.file && t.line === newResult.line)
      );
      if (testIndex >= 0) {
        const existingTest = suite.tests[testIndex];

        const historyEntry: TestRunHistory = {
          timestamp: existingTest.timestamp,
          status: existingTest.status,
          duration: existingTest.duration,
          error: existingTest.error,
        };

        if (!existingTest.runHistory) {
          existingTest.runHistory = [];
        }
        existingTest.runHistory.push(historyEntry);

        if (!existingTest.manualReruns) {
          existingTest.manualReruns = 0;
        }
        existingTest.manualReruns++;

        suite.tests[testIndex] = {
          ...newResult,
          id: existingTest.id,
          retries: existingTest.retries,
          manualReruns: existingTest.manualReruns,
          runHistory: existingTest.runHistory,
        };

        if (existingTest.status === 'passed') {
          suite.passed--;
          report.passed--;
        } else if (existingTest.status === 'failed' || existingTest.status === 'timedout') {
          suite.failed--;
          report.failed--;
        } else if (existingTest.status === 'skipped') {
          suite.skipped--;
          report.skipped--;
        }

        if (newResult.status === 'passed') {
          suite.passed++;
          report.passed++;
        } else if (newResult.status === 'failed' || newResult.status === 'timedout') {
          suite.failed++;
          report.failed++;
        } else if (newResult.status === 'skipped') {
          suite.skipped++;
          report.skipped++;
        }

        testFound = true;
        break;
      }
    }

    if (!testFound) {
      this.log.warn(`Test not found: ${testId} in report ${runId}`);
      return false;
    }

    this.addToCache(runId, report);

    const reportPath = path.join(this.outputDir, `${runId}.json`);
    await this.storage.writeJSON(reportPath, report);

    this.log.info(`Updated test result: ${testId} in report ${runId}`);
    return true;
  }
}

export class JSONReporter extends Reporter {
  async generateJSONReport(runResult: RunResult): Promise<string> {
    return JSON.stringify(runResult, null, 2);
  }
}
