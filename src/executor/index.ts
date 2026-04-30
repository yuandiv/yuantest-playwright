import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import {
  TestConfig,
  TestResult,
  RunResult,
  SuiteResult,
  BrowserType,
  ErrorCode,
  Artifact,
} from '../types';
import { PlaywrightRunnerError } from '../types';
import * as path from 'path';
import dayjs from 'dayjs';
import { TraceManager } from '../trace';
import { AnnotationManager } from '../annotations';
import { TagManager } from '../tags';
import { ArtifactManager } from '../artifacts';
import { VisualTestingManager } from '../visual';
import { FlakyTestManager } from '../flaky';
import { logger } from '../logger';
import { StorageProvider, getStorage } from '../storage';
import { PlaywrightConfigMerger } from '../config/merger';
import { stripAnsi } from '../utils/strings';
import { safePathForCLI, buildSpawnEnv } from '../utils/filesystem';

const PROGRESS_MARKER = '__PW_PROGRESS__';

interface PlaywrightJSONAttachment {
  name: string;
  contentType?: string;
  path?: string;
  body?: string;
}

interface PlaywrightJSONTestResult {
  workerIndex: number;
  parallelIndex: number;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  error?: { message?: string; value?: string; stack?: string };
  errors?: string[];
  stdout?: Array<{ text?: string; buffer?: string }>;
  stderr?: Array<{ text?: string; buffer?: string }>;
  retry: number;
  startTime: string;
  annotations: Array<{ type: string; description?: string }>;
  attachments: PlaywrightJSONAttachment[];
}

interface PlaywrightJSONTest {
  timeout: number;
  annotations: Array<{ type: string; description?: string }>;
  expectedStatus: string;
  projectId: string;
  projectName: string;
  results: PlaywrightJSONTestResult[];
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
}

interface PlaywrightJSONSpec {
  id: string;
  title: string;
  ok: boolean;
  tags: string[];
  tests: PlaywrightJSONTest[];
  file?: string;
  line?: number;
  column?: number;
}

interface PlaywrightJSONSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  specs: PlaywrightJSONSpec[];
  suites?: PlaywrightJSONSuite[];
}

interface PlaywrightJSONStats {
  startTime: string;
  duration: number;
  expected: number;
  skipped: number;
  unexpected: number;
  flaky: number;
}

interface PlaywrightJSONReport {
  config: Record<string, unknown>;
  suites: PlaywrightJSONSuite[];
  errors: unknown[];
  stats: PlaywrightJSONStats;
}

interface ProgressMessage {
  type: 'begin' | 'testBegin' | 'testEnd' | 'stdout' | 'stderr' | 'end';
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
  passed?: number;
  failed?: number;
  skipped?: number;
  unexpected?: number;
}

export class Executor extends EventEmitter {
  private config: TestConfig;
  private _currentRun: RunResult | null = null;
  private isRunning: boolean = false;
  private currentProcess: ChildProcess | null = null;
  private traceManager: TraceManager | null = null;
  private annotationManager: AnnotationManager | null = null;
  private tagManager: TagManager | null = null;
  private artifactManager: ArtifactManager | null = null;
  private visualManager: VisualTestingManager | null = null;
  private flakyManager: FlakyTestManager | null = null;
  private log = logger.child('Executor');
  private stderrBuffer = '';
  private realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
  private storage: StorageProvider;
  private skippedQuarantinedTests: string[] = [];
  private configMerger: PlaywrightConfigMerger;
  private resolvedOutputDir: string = '';
  private parentRunId: string | null = null;

  get currentRun(): RunResult | null {
    return this._currentRun;
  }

  private async filterQuarantinedTests(options?: {
    shardIndex?: number;
    shardTotal?: number;
    grepPattern?: string;
    grepInvertPattern?: string;
    tagFilter?: string[];
    updateSnapshots?: boolean;
    projectFilter?: string;
    testFiles?: string[];
    testLocations?: string[];
    parentRunId?: string;
  }): Promise<
    | {
        shardIndex?: number;
        shardTotal?: number;
        grepPattern?: string;
        grepInvertPattern?: string;
        tagFilter?: string[];
        updateSnapshots?: boolean;
        projectFilter?: string;
        testFiles?: string[];
        testLocations?: string[];
        parentRunId?: string;
      }
    | undefined
  > {
    if (!this.flakyManager || !options) {
      return options;
    }

    if (options.parentRunId) {
      this.log.info('Skipping quarantine filter for rerun (parentRunId present)');
      return options;
    }

    const grepInvertPattern = this.flakyManager.buildGrepInvertPattern();
    if (!grepInvertPattern) {
      return options;
    }

    const filteredOptions = { ...options, grepInvertPattern };

    const quarantinedTests = this.flakyManager.getQuarantinedTests();
    const quarantinedIds = new Set(quarantinedTests.map((t) => t.testId));

    if (filteredOptions.testFiles && filteredOptions.testFiles.length > 0) {
      const originalCount = filteredOptions.testFiles.length;
      filteredOptions.testFiles = filteredOptions.testFiles.filter((file) => {
        const shouldSkip = quarantinedIds.has(file);
        if (shouldSkip) {
          this.skippedQuarantinedTests.push(file);
        }
        return !shouldSkip;
      });

      if (filteredOptions.testFiles.length < originalCount) {
        this.log.info(
          `Filtered ${originalCount - filteredOptions.testFiles.length} quarantined test files`
        );
      }
    }

    if (filteredOptions.testLocations && filteredOptions.testLocations.length > 0) {
      const originalCount = filteredOptions.testLocations.length;
      filteredOptions.testLocations = filteredOptions.testLocations.filter((location) => {
        const shouldSkip = quarantinedIds.has(location);
        if (shouldSkip) {
          this.skippedQuarantinedTests.push(location);
        }
        return !shouldSkip;
      });

      if (filteredOptions.testLocations.length < originalCount) {
        this.log.info(
          `Filtered ${originalCount - filteredOptions.testLocations.length} quarantined test locations`
        );
      }
    }

    this.log.info(`Quarantine: excluding ${quarantinedTests.length} tests via --grep-invert`);

    return filteredOptions;
  }

  constructor(config: TestConfig, storage?: StorageProvider, flakyManager?: FlakyTestManager) {
    super();
    this.config = {
      retries: 0,
      timeout: 30000,
      workers: 1,
      shards: 1,
      browsers: ['chromium'],
      htmlReport: true,
      ...config,
    };
    this.storage = storage || getStorage();
    this.flakyManager = flakyManager || null;
    this.configMerger = new PlaywrightConfigMerger(this.storage);
    this.initializeManagers();
  }

  private initializeManagers(): void {
    if (this.config.traces?.enabled) {
      this.traceManager = new TraceManager(
        this.config.traces,
        path.join(this.config.outputDir, 'traces'),
        this.storage
      );
    }

    if (this.config.annotations?.enabled) {
      this.annotationManager = new AnnotationManager(this.config.annotations, this.storage);
    }

    if (this.config.tags?.enabled) {
      this.tagManager = new TagManager(this.config.tags, this.storage);
    }

    if (this.config.artifacts?.enabled) {
      this.artifactManager = new ArtifactManager(
        this.config.artifacts,
        path.join(this.config.outputDir, 'artifacts'),
        this.storage
      );
    }

    if (this.config.visualTesting?.enabled) {
      this.visualManager = new VisualTestingManager(
        this.config.visualTesting,
        path.join(this.config.outputDir, 'visual-testing'),
        this.storage
      );
    }
  }

  async execute(options?: {
    shardIndex?: number;
    shardTotal?: number;
    grepPattern?: string;
    tagFilter?: string[];
    updateSnapshots?: boolean;
    projectFilter?: string;
    testFiles?: string[];
    testLocations?: string[];
    parentRunId?: string;
  }): Promise<RunResult> {
    if (this.isRunning) {
      throw new PlaywrightRunnerError('Executor is already running', ErrorCode.ALREADY_RUNNING);
    }

    this.isRunning = true;
    const runId = this.generateRunId();
    const startTime = Date.now();

    this._currentRun = {
      id: runId,
      version: this.config.version,
      status: 'success',
      startTime,
      suites: [],
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      flakyTests: [],
      metadata: {},
    };

    this.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
    this.stderrBuffer = '';
    this.skippedQuarantinedTests = [];
    this.parentRunId = options?.parentRunId || null;

    this.log.info(`Run started: ${runId}`);
    this.emit('run_started', { runId, timestamp: startTime });

    try {
      const filteredOptions = await this.filterQuarantinedTests(options);
      await this.prepareRun(filteredOptions);
      await this.runPlaywrightTests(filteredOptions);
      await this.postProcessRun(runId);
      this._currentRun.status = 'success';
    } catch (error: unknown) {
      this._currentRun.status = 'failed';
      this.log.error(`Run failed: ${runId}`, error instanceof Error ? error : undefined);
      this.emit('error', { error: error instanceof Error ? error.message : String(error), runId });
    } finally {
      this.isRunning = false;
      this._currentRun.endTime = Date.now();
      this._currentRun.duration = this._currentRun.endTime - this._currentRun.startTime;
      this._currentRun.metadata!.skippedQuarantinedTests = this.skippedQuarantinedTests;
      this.log.info(
        `Run completed: ${runId} (${this._currentRun.passed}/${this._currentRun.totalTests} passed, ${this.skippedQuarantinedTests.length} quarantined tests skipped)`
      );
      this.emit('run_completed', this._currentRun);
    }

    return this._currentRun;
  }

  private async prepareRun(options?: {
    shardIndex?: number;
    shardTotal?: number;
    grepPattern?: string;
    grepInvertPattern?: string;
    tagFilter?: string[];
    updateSnapshots?: boolean;
    projectFilter?: string;
    testFiles?: string[];
    testLocations?: string[];
  }): Promise<void> {
    const outputDir = this.config.outputDir;
    if (!(await this.storage.exists(outputDir))) {
      await this.storage.mkdir(outputDir);
    }

    if (this.traceManager) {
      await this.traceManager.initialize();
    }

    if (this.artifactManager) {
      await this.artifactManager.initialize();
    }

    if (this.visualManager) {
      await this.visualManager.initialize();
    }

    if (this.annotationManager) {
      const annotations = await this.annotationManager.scanDirectory(this.config.testDir);
      this._currentRun!.metadata!.annotations = annotations.map((a) => ({
        type: a.type,
        testName: a.testName,
        file: a.file,
      }));

      const summary = this.annotationManager.getSummary();
      this.log.info(`Annotations scanned: ${summary.total} found`);
      this.emit('annotations_scanned', { runId: this._currentRun!.id, summary });
    }

    if (this.tagManager) {
      const tags = await this.tagManager.scanDirectory(this.config.testDir);
      this._currentRun!.metadata!.tags = tags.map((t) => ({
        name: t.name,
        count: t.testIds.length,
      }));

      const summary = this.tagManager.getSummary();
      this.log.info(
        `Tags scanned: ${summary.totalTags} tags, ${summary.totalTaggedTests} tagged tests`
      );
      this.emit('tags_scanned', { runId: this._currentRun!.id, summary });
    }
  }

  private async writeProgressReporter(reporterPath: string): Promise<void> {
    const reporterCode = `
const fs = require('fs');
const path = require('path');
const MARKER = '${PROGRESS_MARKER}';

class ProgressReporter {
  onBegin(_config, suite) {
    const emit = (msg) => {
      process.stderr.write(MARKER + JSON.stringify(msg) + '\\n');
    };
    this.emit = emit;
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
    this.emit({
      type: 'testEnd',
      test: {
        id: test.id,
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
          return { name: a.name, contentType: a.contentType, path: a.path, body: a.body ? a.body.toString('utf-8') : undefined };
        })
      }
    });
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
    this.emit({ type: 'testEnd', test: { id: 'error', title: 'Error', suiteTitle: '', status: 'failed', duration: 0, error: error.message || String(error), retries: 0, browser: 'chromium', attachments: [] } });
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

  private handleProgressData(chunk: string): void {
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
        this.processProgressMessage(msg);
      } catch {
        this.log.debug(`Failed to parse progress message: ${jsonStr}`);
      }
    }
  }

  private processProgressMessage(msg: ProgressMessage): void {
    if (!this._currentRun) {
      return;
    }

    if (msg.type === 'begin' && msg.totalTests !== undefined) {
      this.realtimeStats.totalTests = msg.totalTests;
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
    } else if (msg.type === 'testEnd' && msg.test) {
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
        retries: test.retries || 0,
        timestamp: Date.now(),
        browser: (test.browser || 'chromium') as BrowserType,
        screenshots: (test.attachments || [])
          .filter((a) => a.name === 'screenshot' || a.contentType?.startsWith('image/'))
          .map((a) => a.path || a.body)
          .filter((p): p is string => !!p),
        videos: (test.attachments || [])
          .filter((a) => a.name === 'video' || a.contentType?.startsWith('video/'))
          .map((a) => a.path || a.body)
          .filter((p): p is string => !!p),
        traces: (test.attachments || [])
          .filter((a) => a.name === 'trace')
          .map((a) => a.path || a.body)
          .filter((p): p is string => !!p),
        logs: [],
      };

      const suiteName = test.suiteTitle || 'Test Suite';
      let suite = this._currentRun.suites.find((s) => s.name === suiteName);
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
      }

      const existingTestIndex = suite.tests.findIndex((t) => t.id === testResult.id);
      if (existingTestIndex >= 0) {
        const existingTest = suite.tests[existingTestIndex];
        suite.duration -= existingTest.duration;
        suite.tests[existingTestIndex] = testResult;
        suite.duration += testResult.duration;

        if (existingTest.status === 'passed') {
          suite.passed--;
          this.realtimeStats.passed--;
        } else if (existingTest.status === 'failed' || existingTest.status === 'timedout') {
          suite.failed--;
          this.realtimeStats.failed--;
        } else if (existingTest.status === 'skipped') {
          suite.skipped--;
          this.realtimeStats.skipped--;
        }
      } else {
        suite.tests.push(testResult);
        suite.totalTests++;
        suite.duration += testResult.duration;

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

        this._currentRun.totalTests++;
      }
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
  }

  private async runPlaywrightTests(options?: {
    shardIndex?: number;
    shardTotal?: number;
    grepPattern?: string;
    grepInvertPattern?: string;
    tagFilter?: string[];
    updateSnapshots?: boolean;
    projectFilter?: string;
    testFiles?: string[];
    testLocations?: string[];
  }): Promise<void> {
    const testDir = this.config.testDir;
    const mergedConfig = await this.configMerger.mergeConfig(testDir, this.config.outputDir);

    if (!mergedConfig.configPath) {
      this.log.warn(`No playwright.config.ts found in ${testDir}, tests may not run correctly`);
    }

    const configPath = mergedConfig.configPath;
    const cwd = configPath ? path.dirname(configPath) : path.resolve(testDir);

    const resolvedOutputDir = path.isAbsolute(this.config.outputDir)
      ? this.config.outputDir
      : path.resolve(cwd, this.config.outputDir);
    this.resolvedOutputDir = resolvedOutputDir;

    if (!path.isAbsolute(this.config.outputDir)) {
      this.log.info(
        `Output directory resolved: ${this.config.outputDir} -> ${resolvedOutputDir} (relative to project: ${cwd})`
      );
    }

    const jsonReportPath = path.join(resolvedOutputDir, 'results.json');
    const progressReporterPath = path.join(resolvedOutputDir, 'progress-reporter.cjs');
    await this.writeProgressReporter(progressReporterPath);

    const runId = this._currentRun?.id || `run_${Date.now()}`;
    const htmlReportPath = path.join(resolvedOutputDir, 'html-reports', runId);

    const playwrightReportDir = path.join(resolvedOutputDir, 'reports');
    if (!(await this.storage.exists(playwrightReportDir))) {
      const fs = await import('fs/promises');
      await fs.mkdir(playwrightReportDir, { recursive: true });
      this.log.info(`Created Playwright report directory: ${playwrightReportDir}`);
    }

    const args: string[] = ['test'];

    if (configPath) {
      const safeConfigPath = safePathForCLI(configPath);
      args.push(`--config=${safeConfigPath}`);
    }

    if (options?.testLocations && options.testLocations.length > 0) {
      for (const location of options.testLocations) {
        let testPath = location;
        if (path.isAbsolute(location)) {
          testPath = path.relative(cwd, location);
        }
        testPath = testPath.split(path.sep).join('/');
        const safePath = safePathForCLI(testPath);
        args.push(safePath);
      }
    } else if (options?.testFiles && options.testFiles.length > 0) {
      for (const file of options.testFiles) {
        let testPath = file;
        if (path.isAbsolute(file)) {
          testPath = path.relative(cwd, file);
        }
        testPath = testPath.split(path.sep).join('/');
        const safePath = safePathForCLI(testPath);
        args.push(safePath);
      }
    }

    if (options?.shardTotal && options.shardTotal > 1 && options.shardIndex !== undefined) {
      args.push(`--shard=${options.shardIndex + 1}/${options.shardTotal}`);
    }

    if (options?.tagFilter && options.tagFilter.length > 0 && this.tagManager) {
      const grepPattern = this.tagManager.buildGrepPattern(options.tagFilter);
      if (grepPattern) {
        args.push(`--grep=${grepPattern}`);
      }
    }

    if (options?.grepPattern) {
      args.push(`--grep=${options.grepPattern}`);
    }

    if (options?.grepInvertPattern) {
      args.push(`--grep-invert=${options.grepInvertPattern}`);
    }

    if (options?.projectFilter) {
      args.push(`--project=${options.projectFilter}`);
    }

    if (options?.updateSnapshots || this.config.visualTesting?.updateSnapshots) {
      args.push('--update-snapshots');
    }

    if (this.config.workers) {
      args.push(`--workers=${this.config.workers}`);
    }

    if (this.config.retries !== undefined) {
      args.push(`--retries=${this.config.retries}`);
    }

    if (this.config.htmlReport) {
      args.push(`--reporter=html,blob,json,${progressReporterPath}`);
    } else {
      args.push(`--reporter=blob,json,${progressReporterPath}`);
    }

    this.log.info(`Running Playwright tests via CLI`);
    this.log.info(`Command: npx playwright ${args.join(' ')}`);
    this.log.info(`Working directory: ${cwd}`);
    this.log.info(`Config path: ${configPath || 'none'}`);
    this.log.info(`Test directory: ${mergedConfig.testDirAbsolute}`);
    this.log.info(`Output directory (resolved): ${resolvedOutputDir}`);
    this.log.info(`HTML report will be generated at: ${htmlReportPath}`);
    this.log.info(`JSON report will be generated at: ${jsonReportPath}`);

    if (!(await this.storage.exists(mergedConfig.testDirAbsolute))) {
      this.log.warn(`Test directory does not exist: ${mergedConfig.testDirAbsolute}`);
    }

    if (mergedConfig.warnings.length > 0) {
      this.log.warn(`Config warnings: ${mergedConfig.warnings.join('; ')}`);
    }

    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn('npx', ['playwright', ...args], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: buildSpawnEnv({
          ...(this.config.htmlReport
            ? {
                PLAYWRIGHT_HTML_REPORT: playwrightReportDir,
                PLAYWRIGHT_BLOB_OUTPUT_DIR: path.join(resolvedOutputDir, 'blob-reports', runId),
              }
            : {
                PLAYWRIGHT_BLOB_OUTPUT_DIR: path.join(
                  resolvedOutputDir,
                  'blob-reports',
                  this.parentRunId || runId
                ),
              }),
          PLAYWRIGHT_JSON_OUTPUT_FILE: jsonReportPath,
        }),
      });

      this.currentProcess = proc;

      proc.stderr?.on('data', (chunk: Buffer) => {
        try {
          const text = chunk.toString();
          this.handleProgressData(text);
          const cleanText = text
            .split('\n')
            .filter((line) => !line.includes(PROGRESS_MARKER))
            .join('\n');
          const strippedCleanText = stripAnsi(cleanText);
          if (strippedCleanText.trim()) {
            this.emit('output', {
              data: strippedCleanText,
              timestamp: Date.now(),
              runId: this._currentRun?.id || '',
            });
          }
        } catch (error: unknown) {
          this.log.error('Error processing stderr:', error instanceof Error ? error : undefined);
        }
      });

      proc.on('error', (error) => {
        this.currentProcess = null;
        reject(
          new PlaywrightRunnerError(
            `Failed to spawn playwright process: ${error.message}`,
            'SPAWN_ERROR'
          )
        );
      });

      proc.on('close', (code) => {
        this.currentProcess = null;
        if (this.stderrBuffer) {
          this.handleProgressData('\n');
        }
        resolve(code ?? 1);
      });
    });

    if (await this.storage.exists(jsonReportPath)) {
      try {
        const reportContent = await this.storage.readText(jsonReportPath);
        if (reportContent) {
          const report: PlaywrightJSONReport = JSON.parse(reportContent);
          this.processJSONReport(report);
        }
      } catch (error: unknown) {
        this.log.warn(
          `Failed to parse JSON report: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      this.log.info(
        `JSON report not found at ${jsonReportPath}, using real-time progress data only`
      );
    }

    if (exitCode !== 0) {
      this.log.warn(`Playwright tests finished with exit code: ${exitCode}`);
      if (this._currentRun && this._currentRun.failed > 0) {
        this._currentRun.status = 'failed';
      }
    }
  }

  private processJSONReport(report: PlaywrightJSONReport): void {
    if (!this._currentRun) {
      return;
    }

    const jsonSuites: SuiteResult[] = [];
    let jsonTotal = 0;
    let jsonPassed = 0;
    let jsonFailed = 0;
    let jsonSkipped = 0;
    const jsonFlaky: TestResult[] = [];

    const processSuite = (suite: PlaywrightJSONSuite, parentFile?: string, parentLine?: number) => {
      const suiteResult: SuiteResult = {
        name: suite.title,
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        tests: [],
        timestamp: Date.now(),
      };

      const currentFile = suite.file || parentFile;
      const currentLine = suite.line || parentLine;

      for (const spec of suite.specs) {
        for (const test of spec.tests) {
          const lastResult = test.results[test.results.length - 1];
          if (!lastResult) {
            continue;
          }

          const mapped = this.mapJSONTestResult(spec, test, lastResult, currentFile, currentLine);

          const existingTest = this.findExistingTest(mapped.id);
          if (existingTest) {
            if (!existingTest.screenshots?.length && mapped.screenshots?.length) {
              existingTest.screenshots = mapped.screenshots;
            }
            if (!existingTest.videos?.length && mapped.videos?.length) {
              existingTest.videos = mapped.videos;
            }
            if (!existingTest.traces?.length && mapped.traces?.length) {
              existingTest.traces = mapped.traces;
            }
            if (mapped.error && !existingTest.error) {
              existingTest.error = mapped.error;
            }
            if (lastResult.retry > 0 && !existingTest.retries) {
              existingTest.retries = lastResult.retry;
            }
            if (!existingTest.file && mapped.file) {
              existingTest.file = mapped.file;
            }
            if (!existingTest.line && mapped.line) {
              existingTest.line = mapped.line;
            }
          } else {
            suiteResult.tests.push(mapped);
            suiteResult.totalTests++;
            suiteResult.duration += lastResult.duration || 0;

            if (mapped.status === 'passed') {
              suiteResult.passed++;
            } else if (mapped.status === 'failed' || mapped.status === 'timedout') {
              suiteResult.failed++;
            } else if (mapped.status === 'skipped') {
              suiteResult.skipped++;
            }

            this.emit('test_result', mapped);
          }

          if (lastResult.retry > 0) {
            jsonFlaky.push(mapped);
          }
        }
      }

      if (suite.suites) {
        for (const childSuite of suite.suites) {
          const childResult = processSuite(childSuite, currentFile, currentLine);
          suiteResult.totalTests += childResult.totalTests;
          suiteResult.passed += childResult.passed;
          suiteResult.failed += childResult.failed;
          suiteResult.skipped += childResult.skipped;
          suiteResult.duration += childResult.duration;
          suiteResult.tests.push(...childResult.tests);
        }
      }

      if (suiteResult.totalTests > 0) {
        jsonSuites.push(suiteResult);
      }

      return suiteResult;
    };

    for (const suite of report.suites) {
      processSuite(suite);
    }

    jsonTotal = jsonSuites.reduce((sum, s) => sum + s.totalTests, 0);
    jsonPassed = jsonSuites.reduce((sum, s) => sum + s.passed, 0);
    jsonFailed = jsonSuites.reduce((sum, s) => sum + s.failed, 0);
    jsonSkipped = jsonSuites.reduce((sum, s) => sum + s.skipped, 0);

    for (const jsonSuite of jsonSuites) {
      const existingSuite = this._currentRun.suites.find((s) => s.name === jsonSuite.name);
      if (!existingSuite) {
        this._currentRun.suites.push(jsonSuite);
      } else {
        for (const test of jsonSuite.tests) {
          if (!existingSuite.tests.find((t) => t.id === test.id)) {
            existingSuite.tests.push(test);
            existingSuite.totalTests++;
            existingSuite.duration += test.duration;
            if (test.status === 'passed') {
              existingSuite.passed++;
            } else if (test.status === 'failed' || test.status === 'timedout') {
              existingSuite.failed++;
            } else if (test.status === 'skipped') {
              existingSuite.skipped++;
            }
          }
        }
      }
    }

    this._currentRun.totalTests = this._currentRun.suites.reduce((sum, s) => sum + s.totalTests, 0);
    this._currentRun.passed = this._currentRun.suites.reduce((sum, s) => sum + s.passed, 0);
    this._currentRun.failed = this._currentRun.suites.reduce((sum, s) => sum + s.failed, 0);
    this._currentRun.skipped = this._currentRun.suites.reduce((sum, s) => sum + s.skipped, 0);

    const flakyIds = new Set(this._currentRun.flakyTests.map((f) => f.id));
    for (const f of jsonFlaky) {
      if (!flakyIds.has(f.id)) {
        this._currentRun.flakyTests.push(f);
        flakyIds.add(f.id);
      }
    }

    this.log.info(
      `Test run completed in ${report.stats.duration}ms (unexpected: ${report.stats.unexpected}, flaky: ${report.stats.flaky}, skipped: ${report.stats.skipped})`
    );

    this.emit('run_progress', {
      runId: this._currentRun.id,
      status: 'running',
      totalTests: this._currentRun.totalTests,
      passed: this._currentRun.passed,
      failed: this._currentRun.failed,
      skipped: this._currentRun.skipped,
    });
  }

  private processOwnJSONReport(report: any): void {
    if (!this._currentRun) {
      return;
    }

    this.log.info('Processing own JSON report format');

    for (const suite of report.suites) {
      for (const test of suite.tests) {
        const existingTest = this.findExistingTest(test.id);
        if (!existingTest) {
          this.emit('test_result', test);
        }
      }
    }

    this._currentRun.totalTests = this._currentRun.suites.reduce((sum, s) => sum + s.totalTests, 0);
    this._currentRun.passed = this._currentRun.suites.reduce((sum, s) => sum + s.passed, 0);
    this._currentRun.failed = this._currentRun.suites.reduce((sum, s) => sum + s.failed, 0);
    this._currentRun.skipped = this._currentRun.suites.reduce((sum, s) => sum + s.skipped, 0);
  }

  private findExistingTest(testId: string): TestResult | undefined {
    for (const suite of this._currentRun?.suites || []) {
      const found = suite.tests.find((t) => t.id === testId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private mapJSONTestResult(
    spec: PlaywrightJSONSpec,
    test: PlaywrightJSONTest,
    result: PlaywrightJSONTestResult,
    parentFile?: string,
    parentLine?: number
  ): TestResult {
    const status: TestResult['status'] =
      result.status === 'passed'
        ? 'passed'
        : result.status === 'skipped'
          ? 'skipped'
          : result.status === 'timedOut'
            ? 'timedout'
            : 'failed';

    const testId = spec.id || `${spec.file || parentFile}:${spec.line || parentLine}:${spec.title}`;

    return {
      id: testId,
      title: spec.title || 'Unknown Test',
      fullTitle: spec.title,
      file: spec.file || parentFile,
      line: spec.line || parentLine,
      column: spec.column,
      status,
      duration: result.duration || 0,
      error:
        result.error?.message || result.error?.value
          ? stripAnsi(result.error?.message || result.error?.value || '')
          : undefined,
      retries: result.retry || 0,
      timestamp: Date.now(),
      browser: (test.projectName || 'chromium') as BrowserType,
      screenshots: (result.attachments || [])
        .filter(
          (a: PlaywrightJSONAttachment) =>
            a.name === 'screenshot' || a.contentType?.startsWith('image/')
        )
        .map((a: PlaywrightJSONAttachment) => a.path || a.body)
        .filter((p): p is string => !!p),
      videos: (result.attachments || [])
        .filter(
          (a: PlaywrightJSONAttachment) => a.name === 'video' || a.contentType?.startsWith('video/')
        )
        .map((a: PlaywrightJSONAttachment) => a.path || a.body)
        .filter((p): p is string => !!p),
      traces: (result.attachments || [])
        .filter((a: PlaywrightJSONAttachment) => a.name === 'trace')
        .map((a: PlaywrightJSONAttachment) => a.path || a.body)
        .filter((p): p is string => !!p),
      logs: [],
    };
  }

  private async postProcessRun(runId: string): Promise<void> {
    if (this.config.htmlReport) {
      await this.moveHTMLReport(runId);
    } else if (this.parentRunId) {
      await this.mergeBlobReport(runId);
    }

    if (this.traceManager) {
      try {
        const traces = await this.traceManager.discoverTraces(runId);
        this._currentRun!.metadata!.traces = {
          total: traces.length,
          files: traces.map((t) => ({
            testId: t.testId,
            testName: t.testName,
            size: t.size,
          })),
        };
      } catch (error: unknown) {
        this.log.warn(
          `Trace discovery failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (this.artifactManager) {
      try {
        const artifacts = await this.artifactManager.discoverArtifacts(runId);
        this._currentRun!.metadata!.artifacts = {
          total: artifacts.length,
          byType: artifacts.reduce((acc: Record<string, number>, a: Artifact) => {
            acc[a.type] = (acc[a.type] || 0) + 1;
            return acc;
          }, {}),
        };
      } catch (error: unknown) {
        this.log.warn(
          `Artifact discovery failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    if (this.visualManager) {
      try {
        const testIds = this._currentRun!.suites.flatMap((s) => s.tests).map((t) => t.id);
        const visualResults = await this.visualManager.runVisualTests(testIds);
        const visualSummary = this.visualManager.getSummary();
        this._currentRun!.metadata!.visualTesting = {
          ...visualSummary,
          results: visualResults.map((r) => ({
            testId: r.testId,
            status: r.status,
            diffPixelRatio: r.diffPixelRatio,
          })),
        };
      } catch (error: unknown) {
        this.log.warn(
          `Visual testing failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }

  private async moveHTMLReport(runId: string): Promise<void> {
    const playwrightReportDir = path.join(this.resolvedOutputDir, 'reports');
    const targetReportDir = path.join(this.resolvedOutputDir, 'html-reports', runId);

    this.log.info(`Checking for Playwright HTML report at: ${playwrightReportDir}`);

    try {
      if (await this.storage.exists(playwrightReportDir)) {
        this.log.info(`Playwright report directory exists: ${playwrightReportDir}`);

        const indexFile = path.join(playwrightReportDir, 'index.html');
        if (await this.storage.exists(indexFile)) {
          this.log.info(`Found index.html, moving report to: ${targetReportDir}`);

          const fs = await import('fs/promises');

          if (await this.storage.exists(targetReportDir)) {
            await fs.rm(targetReportDir, { recursive: true });
            this.log.info(`Removed existing target directory: ${targetReportDir}`);
          }

          await fs.mkdir(path.dirname(targetReportDir), { recursive: true });
          await fs.rename(playwrightReportDir, targetReportDir);
          this.log.info(
            `Successfully moved Playwright HTML report from ${playwrightReportDir} to ${targetReportDir}`
          );
        } else {
          this.log.warn(
            `Playwright report directory exists but index.html not found at: ${indexFile}`
          );
          const files = await this.storage.readDir(playwrightReportDir);
          this.log.warn(`Files in report directory: ${files.join(', ')}`);
        }
      } else {
        this.log.warn(`Playwright report directory not found at: ${playwrightReportDir}`);
      }
    } catch (error: unknown) {
      this.log.error(
        `Failed to move Playwright HTML report: ${error instanceof Error ? error.message : String(error)}`
      );
      if (error instanceof Error && error.stack) {
        this.log.error(`Stack trace: ${error.stack}`);
      }
    }
  }

  private async mergeBlobReport(runId: string): Promise<void> {
    const blobReportDir = path.join(this.resolvedOutputDir, 'blob-reports', this.parentRunId!);
    const originalHtmlReportDir = path.join(
      this.resolvedOutputDir,
      'html-reports',
      this.parentRunId!
    );

    this.log.info(
      `Attempting to merge blob report for rerun: ${runId} into original report: ${this.parentRunId!}`
    );
    this.log.info(`Blob report directory: ${blobReportDir}`);
    this.log.info(`Original HTML report directory: ${originalHtmlReportDir}`);

    try {
      if (!(await this.storage.exists(blobReportDir))) {
        this.log.warn(`Blob report directory not found at: ${blobReportDir}, skipping merge`);
        return;
      }

      const fs = await import('fs/promises');
      const blobFiles = (await fs.readdir(blobReportDir)).filter((f: string) => f.endsWith('.zip'));
      this.log.info(
        `Found ${blobFiles.length} blob file(s) in ${blobReportDir}: ${blobFiles.join(', ')}`
      );

      if (blobFiles.length < 2) {
        this.log.warn(
          `Only ${blobFiles.length} blob file(s) found. Need at least 2 (original + rerun) to merge. ` +
            `The original run may not have saved a blob report. Keeping original HTML report unchanged.`
        );
        return;
      }

      const mergedOutputDir = path.join(
        this.resolvedOutputDir,
        'html-reports',
        `${this.parentRunId}-merged`
      );

      const mergeArgs = ['playwright', 'merge-reports', blobReportDir, '--reporter=html'];

      this.log.info(`Running merge command: npx ${mergeArgs.join(' ')}`);

      const mergeExitCode = await new Promise<number>((resolve, reject) => {
        const proc = spawn('npx', mergeArgs, {
          cwd: this.resolvedOutputDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          env: buildSpawnEnv({
            PLAYWRIGHT_HTML_REPORT: mergedOutputDir,
          }),
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });

        proc.on('close', (code: number | null) => {
          if (stdout) {
            this.log.info(`Merge stdout: ${stdout}`);
          }
          if (stderr) {
            this.log.info(`Merge stderr: ${stderr}`);
          }
          resolve(code ?? 1);
        });

        proc.on('error', (err: Error) => {
          this.log.error(`Merge process error: ${err.message}`);
          reject(err);
        });
      });

      if (mergeExitCode === 0) {
        if (await this.storage.exists(originalHtmlReportDir)) {
          await fs.rm(originalHtmlReportDir, { recursive: true });
          this.log.info(`Removed original HTML report directory: ${originalHtmlReportDir}`);
        }

        await fs.rename(mergedOutputDir, originalHtmlReportDir);
        this.log.info(`Successfully merged blob report into: ${originalHtmlReportDir}`);
      } else {
        this.log.error(`Merge reports command failed with exit code: ${mergeExitCode}`);
      }
    } catch (error: unknown) {
      this.log.error(
        `Failed to merge blob report: ${error instanceof Error ? error.message : String(error)}`
      );
      if (error instanceof Error && error.stack) {
        this.log.error(`Stack trace: ${error.stack}`);
      }
    } finally {
      try {
        const fs = await import('fs/promises');
        const mergedOutputDir = path.join(
          this.resolvedOutputDir,
          'html-reports',
          `${this.parentRunId}-merged`
        );
        if (await this.storage.exists(mergedOutputDir)) {
          await fs.rm(mergedOutputDir, { recursive: true });
          this.log.info(`Cleaned up merged output directory: ${mergedOutputDir}`);
        }
      } catch (cleanupError: unknown) {
        this.log.warn(
          `Failed to cleanup merged output: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
        );
      }
    }
  }

  private generateRunId(): string {
    return `run_${dayjs().format('YYYYMMDD_HHmmss')}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async cancel(): Promise<void> {
    if (this.currentProcess) {
      this.log.info('Cancelling running tests...');
      const pid = this.currentProcess.pid;

      if (pid) {
        if (process.platform === 'win32') {
          await this.killProcessTreeWindows(pid);
        } else {
          this.killProcessTreeUnix(pid);
        }
      }

      this.currentProcess = null;
      this.isRunning = false;

      if (this._currentRun) {
        this._currentRun.status = 'cancelled';
        this._currentRun.endTime = Date.now();
        this._currentRun.duration = this._currentRun.endTime - this._currentRun.startTime;
      }

      this.emit('run_cancelled', this._currentRun);
      this.log.info('Test execution cancelled');
    }
  }

  /**
   * 在 Windows 平台上杀死整个进程树
   * 使用 taskkill 命令确保所有子进程都被终止
   */
  private async killProcessTreeWindows(pid: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const killProcess = spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], {
        stdio: 'ignore',
      });

      killProcess.on('close', (code) => {
        if (code === 0) {
          this.log.info(`Process tree killed successfully (PID: ${pid})`);
        } else {
          this.log.warn(`taskkill exited with code ${code}, trying fallback...`);
          if (this.currentProcess) {
            this.currentProcess.kill('SIGKILL');
          }
        }
        resolve();
      });

      killProcess.on('error', (err) => {
        this.log.error(`Failed to kill process tree: ${err.message}`);
        if (this.currentProcess) {
          this.currentProcess.kill('SIGKILL');
        }
        resolve();
      });
    });
  }

  /**
   * 在 Unix 平台上杀死整个进程树
   * 首先尝试 SIGTERM，然后是 SIGKILL
   */
  private killProcessTreeUnix(pid: number): void {
    try {
      process.kill(-pid, 'SIGTERM');

      setTimeout(() => {
        try {
          process.kill(-pid, 0);
          this.log.info('Process still running, sending SIGKILL...');
          process.kill(-pid, 'SIGKILL');
        } catch {
          this.log.info('Process terminated successfully');
        }
      }, 3000);
    } catch (err) {
      this.log.warn(`Failed to kill process group, trying direct kill: ${err}`);
      if (this.currentProcess) {
        this.currentProcess.kill('SIGTERM');
        setTimeout(() => {
          if (this.currentProcess) {
            this.currentProcess.kill('SIGKILL');
          }
        }, 3000);
      }
    }
  }

  async getCurrentStatus(): Promise<RunResult | null> {
    return this._currentRun;
  }

  isCurrentlyRunning(): boolean {
    return this.isRunning;
  }

  getConfig(): TestConfig {
    return { ...this.config };
  }

  async getTestArtifacts(runId: string): Promise<{
    screenshots: string[];
    videos: string[];
    traces: string[];
  }> {
    const artifactsDir = path.join(this.config.outputDir, runId);
    return {
      screenshots: await this.getFilesInDir(path.join(artifactsDir, 'screenshots')),
      videos: await this.getFilesInDir(path.join(artifactsDir, 'videos')),
      traces: await this.getFilesInDir(path.join(artifactsDir, 'traces')),
    };
  }

  private async getFilesInDir(dir: string): Promise<string[]> {
    if (!(await this.storage.exists(dir))) {
      return [];
    }
    return this.storage.readDir(dir);
  }

  getTraceManager(): TraceManager | null {
    return this.traceManager;
  }

  getAnnotationManager(): AnnotationManager | null {
    return this.annotationManager;
  }

  getTagManager(): TagManager | null {
    return this.tagManager;
  }

  getArtifactManager(): ArtifactManager | null {
    return this.artifactManager;
  }

  getVisualManager(): VisualTestingManager | null {
    return this.visualManager;
  }
}

export class ParallelExecutor {
  private executors: Executor[] = [];
  private log = logger.child('ParallelExecutor');

  constructor(config: TestConfig, shardCount: number, storage?: StorageProvider) {
    for (let i = 0; i < shardCount; i++) {
      const shardConfig = { ...config };
      shardConfig.outputDir = path.join(config.outputDir, `shard-${i}`);
      this.executors.push(new Executor(shardConfig, storage));
    }
    this.log.info(`Initialized parallel executor with ${shardCount} shards`);
  }

  async execute(): Promise<RunResult[]> {
    this.log.info(`Starting parallel execution across ${this.executors.length} shards`);
    return Promise.all(
      this.executors.map((e, i) =>
        e.execute({
          shardIndex: i,
          shardTotal: this.executors.length,
        })
      )
    );
  }

  async cancelAll(): Promise<void> {
    for (const executor of this.executors) {
      await executor.cancel();
    }
  }
}
