import { EventEmitter } from 'events';
import { TestResult, RunResult, SuiteResult, BrowserType } from '../types';
import { PROGRESS_MARKER } from '../constants';
import { stripAnsi } from '../utils/strings';
import { StorageProvider } from '../storage';
import * as path from 'path';

interface PlaywrightJSONAttachment {
  name: string;
  contentType?: string;
  path?: string;
  body?: string;
}

export interface ProgressMessage {
  type: 'begin' | 'testBegin' | 'testEnd' | 'stdout' | 'stderr' | 'end' | 'globalError';
  totalTests?: number;
  test?: {
    id: string;
    title: string;
    fullTitle?: string;
    suiteTitle: string;
    status: string;
    duration: number;
    error?: string;
    retries: number;
    browser: string;
    file?: string;
    line?: number;
    column?: number;
    attachments: PlaywrightJSONAttachment[];
  };
  text?: string;
  consoleLogs?: string[];
  passed?: number;
  failed?: number;
  skipped?: number;
  unexpected?: number;
  message?: string;
  stack?: string;
}

export class ProgressTracker extends EventEmitter {
  private stderrBuffer = '';
  private realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
  private lastProgressTimestamp: number = 0;
  private suiteIndex: Map<string, SuiteResult> = new Map();
  private testIndex: Map<string, TestResult> = new Map();
  private testSuiteIndex: Map<string, SuiteResult> = new Map();
  private _currentRun: RunResult | null = null;
  private storage: StorageProvider;

  constructor(storage: StorageProvider) {
    super();
    this.storage = storage;
  }

  set currentRun(run: RunResult | null) {
    this._currentRun = run;
  }

  get currentRun(): RunResult | null {
    return this._currentRun;
  }

  get stats(): { passed: number; failed: number; skipped: number; totalTests: number } {
    return { ...this.realtimeStats };
  }

  get progressTimestamp(): number {
    return this.lastProgressTimestamp;
  }

  reset(): void {
    this.stderrBuffer = '';
    this.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
    this.lastProgressTimestamp = Date.now();
    this.suiteIndex.clear();
    this.testIndex.clear();
    this.testSuiteIndex.clear();
  }

  findExistingTest(testId: string): TestResult | undefined {
    return this.testIndex.get(testId);
  }

  getTestIndex(): Map<string, TestResult> {
    return this.testIndex;
  }

  getSuiteIndex(): Map<string, SuiteResult> {
    return this.suiteIndex;
  }

  getTestSuiteIndex(): Map<string, SuiteResult> {
    return this.testSuiteIndex;
  }

  handleData(chunk: string): void {
    this.stderrBuffer += chunk;

    const lines = this.stderrBuffer.split('\n');
    this.stderrBuffer = lines.pop() || '';

    for (const line of lines) {
      const markerIndex = line.indexOf(PROGRESS_MARKER);
      if (markerIndex === -1) {
        continue;
      }

      const jsonStr = line.substring(markerIndex + PROGRESS_MARKER.length);
      try {
        const msg: ProgressMessage = JSON.parse(jsonStr);
        this.processMessage(msg);
      } catch {
        this.emit('parse_error', jsonStr);
      }
    }
  }

  flushBuffer(): void {
    if (this.stderrBuffer) {
      this.handleData('\n');
    }
  }

  processMessage(msg: ProgressMessage): void {
    if (!this._currentRun) {
      return;
    }

    this.lastProgressTimestamp = Date.now();

    if (msg.type === 'begin' && msg.totalTests !== undefined) {
      this.realtimeStats.totalTests = msg.totalTests;
      this._currentRun.totalTests = msg.totalTests;
      this.emit('run_progress', {
        runId: this._currentRun.id,
        status: 'running',
        totalTests: msg.totalTests,
        passed: 0,
        failed: 0,
        skipped: 0,
      });
    } else if (msg.type === 'testBegin' && msg.test) {
      this.emit('output', {
        data: `▶ ${msg.test.fullTitle || msg.test.title}`,
        timestamp: Date.now(),
        runId: this._currentRun.id,
        type: 'info',
      });
      this.emit('run_progress', {
        runId: this._currentRun.id,
        status: 'running',
        totalTests: this.realtimeStats.totalTests,
        passed: this.realtimeStats.passed,
        failed: this.realtimeStats.failed,
        skipped: this.realtimeStats.skipped,
        currentTest: msg.test.fullTitle || msg.test.title,
      });
    } else if (msg.type === 'stdout' && msg.text) {
      this.emit('output', {
        data: stripAnsi(msg.text.replace(/\n$/, '')),
        timestamp: Date.now(),
        runId: this._currentRun.id,
        type: 'stdout',
      });
    } else if (msg.type === 'stderr' && msg.text) {
      this.emit('output', {
        data: stripAnsi(msg.text.replace(/\n$/, '')),
        timestamp: Date.now(),
        runId: this._currentRun.id,
        type: 'stderr',
      });
    } else if (msg.type === 'globalError' && msg.message) {
      if (!this._currentRun.metadata) {
        this._currentRun.metadata = {};
      }
      if (!this._currentRun.metadata.globalErrors) {
        this._currentRun.metadata.globalErrors = [];
      }
      this._currentRun.metadata.globalErrors.push({
        message: msg.message,
        stack: msg.stack || '',
        timestamp: Date.now(),
      });
      this.emit('output', {
        data: `⚠️ Global Error: ${msg.message}`,
        timestamp: Date.now(),
        runId: this._currentRun.id,
        type: 'stderr',
      });
      this._currentRun.status = 'failed';
      this.emit('run_failed');
    } else if (msg.type === 'testEnd' && msg.test) {
      this.processTestEnd(msg);
    }
  }

  private processTestEnd(msg: ProgressMessage): void {
    if (!this._currentRun || !msg.test) {
      return;
    }

    const test = msg.test;
    const status: TestResult['status'] =
      test.status === 'passed'
        ? 'passed'
        : test.status === 'skipped'
          ? 'skipped'
          : test.status === 'timedOut'
            ? 'timedout'
            : 'failed';

    const testResult: TestResult = {
      id: test.id,
      title: test.title,
      fullTitle: test.fullTitle || test.title,
      file: test.file,
      line: test.line,
      column: test.column,
      status,
      duration: test.duration || 0,
      error: test.error ? stripAnsi(test.error) : undefined,
      stackTrace:
        test.error && test.error.includes('\n    at')
          ? stripAnsi(test.error.substring(test.error.indexOf('\n    at')))
          : undefined,
      retries: test.retries || 0,
      timestamp: Date.now(),
      browser: (test.browser || 'chromium') as BrowserType,
      screenshots:
        status !== 'passed'
          ? (test.attachments || [])
              .filter((a) => a.name === 'screenshot' || a.contentType?.startsWith('image/'))
              .map((a) => a.path || a.body)
              .filter((p): p is string => !!p)
          : undefined,
      videos:
        status !== 'passed'
          ? (test.attachments || [])
              .filter((a) => a.name === 'video' || a.contentType?.startsWith('video/'))
              .map((a) => a.path || a.body)
              .filter((p): p is string => !!p)
          : undefined,
      traces:
        status !== 'passed'
          ? (test.attachments || [])
              .filter((a) => a.name === 'trace')
              .map((a) => a.path || a.body)
              .filter((p): p is string => !!p)
          : undefined,
      logs: status !== 'passed' ? msg.consoleLogs || [] : undefined,
    };

    const suiteName = test.suiteTitle || 'Test Suite';
    let suite = this.suiteIndex.get(suiteName);
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
      this._currentRun.suites.push(suite);
      this.suiteIndex.set(suiteName, suite);
    }

    const existingTest = this.testIndex.get(testResult.id);
    if (existingTest) {
      const ownerSuite = this.testSuiteIndex.get(testResult.id) || suite;
      ownerSuite.duration -= existingTest.duration;
      const idx = ownerSuite.tests.indexOf(existingTest);
      if (idx >= 0) {
        ownerSuite.tests[idx] = testResult;
      }
      ownerSuite.duration += testResult.duration;

      if (existingTest.status === 'passed') {
        ownerSuite.passed--;
        this.realtimeStats.passed--;
      } else if (existingTest.status === 'failed' || existingTest.status === 'timedout') {
        ownerSuite.failed--;
        this.realtimeStats.failed--;
      } else if (existingTest.status === 'skipped') {
        ownerSuite.skipped--;
        this.realtimeStats.skipped--;
      }
    } else {
      suite.tests.push(testResult);
      suite.totalTests++;
      suite.duration += testResult.duration;
      this.testSuiteIndex.set(testResult.id, suite);

      if (status === 'passed') {
        suite.passed++;
        this.realtimeStats.passed++;
      } else if (status === 'failed' || status === 'timedout') {
        suite.failed++;
        this.realtimeStats.failed++;
      } else if (status === 'skipped') {
        suite.skipped++;
        this.realtimeStats.skipped++;
      }

      if (this.realtimeStats.totalTests === 0) {
        this._currentRun.totalTests++;
        this.realtimeStats.totalTests = this._currentRun.totalTests;
      }
    }
    this.testIndex.set(testResult.id, testResult);
    this._currentRun.passed = this.realtimeStats.passed;
    this._currentRun.failed = this.realtimeStats.failed;
    this._currentRun.skipped = this.realtimeStats.skipped;

    if (testResult.retries > 0) {
      this._currentRun.flakyTests.push(testResult);
    }

    this.emit('test_result', testResult);
    this.emit('run_progress', {
      runId: this._currentRun.id,
      status: 'running',
      totalTests: this.realtimeStats.totalTests,
      passed: this.realtimeStats.passed,
      failed: this.realtimeStats.failed,
      skipped: this.realtimeStats.skipped,
      currentTest: testResult.fullTitle || testResult.title,
    });
  }

  async writeReporter(reporterPath: string): Promise<void> {
    const reporterCode = `
const fs = require('fs');
const path = require('path');
const MARKER = '${PROGRESS_MARKER}';

class ProgressReporter {
  onBegin(_config, suite) {
    const emit = (msg) => {
      try {
        process.stderr.write(MARKER + JSON.stringify(msg) + '\\n');
      } catch (e) {
        // 静默忽略序列化或写入错误，不中断 Playwright reporter 调用链
      }
    };
    this.emit = emit;
    this.consoleLogs = new Map();
    emit({ type: 'begin', totalTests: suite.allTests().length });
  }

  onTestBegin(test, result) {
    const fullTitle = this.getFullTitle(test);
    this.emit({ type: 'testBegin', test: { title: test.title, fullTitle: fullTitle } });
  }

  onStdOut(chunk, test, result) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    if (text.trim()) {
      if (test) {
        this.emit({ type: 'stdout', test: { title: test.title, fullTitle: this.getFullTitle(test) }, text: text });
      } else {
        this.emit({ type: 'stdout', test: null, text: text });
      }
    }
  }

  onStdErr(chunk, test, result) {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
    if (text.trim()) {
      if (test && /error|warn|ERR/i.test(text)) {
        const testId = test.id;
        if (!this.consoleLogs.has(testId)) {
          this.consoleLogs.set(testId, []);
        }
        this.consoleLogs.get(testId).push(text.trim());
      }
      if (test) {
        this.emit({ type: 'stderr', test: { title: test.title, fullTitle: this.getFullTitle(test) }, text: text });
      } else {
        this.emit({ type: 'stderr', test: null, text: text });
      }
    }
  }

  onTestEnd(test, result) {
    const suiteTitle = test.parent ? test.parent.title : '';
    const lastResult = result;
    const fullTitle = this.getFullTitle(test);
    const location = test.location || {};
    const testId = test.id;
    const consoleLogs = this.consoleLogs.has(testId) ? this.consoleLogs.get(testId) : [];
    this.emit({
      type: 'testEnd',
      test: {
        id: testId,
        title: test.title,
        fullTitle: fullTitle,
        suiteTitle: suiteTitle,
        status: lastResult.status,
        duration: lastResult.duration,
        error: lastResult.error ? (lastResult.error.message || '') : undefined,
        retries: lastResult.retry || 0,
        browser: (test.parent && test.parent.project) ? test.parent.project.name : 'chromium',
        file: location.file,
        line: location.line,
        column: location.column,
        attachments: (lastResult.attachments || []).map(function(a) {
          return { name: a.name, contentType: a.contentType, path: a.path };
        })
      },
      consoleLogs: consoleLogs
    });
    this.consoleLogs.delete(testId);
  }

  getFullTitle(test) {
    const titles = [];
    let current = test.parent;
    while (current && current.title) {
      if (current.title && !current.title.endsWith('.ts') && !current.title.endsWith('.tsx') && !current.title.endsWith('.js') && !current.title.endsWith('.jsx')) {
        titles.unshift(current.title);
      }
      current = current.parent;
    }
    titles.push(test.title);
    return titles.join(' > ');
  }

  onEnd(result) {
    this.emit({ type: 'end', passed: 0, failed: 0, skipped: 0 });
  }

  onError(error) {
    this.emit({ type: 'globalError', message: error.message || String(error), stack: error.stack || '' });
  }

  printsToStdio() {
    return false;
  }
}

module.exports = ProgressReporter;
`;
    const reporterDir = path.dirname(reporterPath);
    if (!(await this.storage.exists(reporterDir))) {
      const fs = await import('fs/promises');
      await fs.mkdir(reporterDir, { recursive: true });
    }
    await this.storage.writeText(reporterPath, reporterCode);
  }
}
