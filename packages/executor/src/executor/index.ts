import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { StringDecoder } from 'string_decoder';
import {
  TestConfig,
  RunResult,
  RunMetadata,
  ErrorCode,
  Artifact,
  type IFlakyManager,
  type IResultEnrichers,
  type IAnnotationManager,
  type ITagManager,
  type IArtifactManager,
  type IVisualTestingManager,
} from '@yuantest/contracts';
import { PlaywrightRunnerError } from '@yuantest/contracts';
import * as path from 'path';
import dayjs from 'dayjs';
import { TraceManager } from '../trace';
import { logger } from '@yuantest/core';
import { StorageProvider, getStorage } from '@yuantest/core';
import { PlaywrightConfigMerger } from '@yuantest/core';
import { stripAnsi } from '@yuantest/core';
import { safePathForCLI, buildSpawnEnv, escapeShellArg } from '@yuantest/core';
import { checkEnvironment, MIN_PLAYWRIGHT_VERSION } from '@yuantest/core';
import { PROGRESS_MARKER } from '@yuantest/core';
import { PlaywrightReportParser, PlaywrightJSONReport } from './playwright-report-parser';
import { ProgressTracker } from './progress-tracker';

export class Executor extends EventEmitter {
  private config: TestConfig;
  private _currentRun: RunResult | null = null;
  private isRunning: boolean = false;
  private currentProcess: ChildProcess | null = null;
  private traceManager: TraceManager | null = null;
  private annotationManager: IAnnotationManager | null = null;
  private tagManager: ITagManager | null = null;
  private artifactManager: IArtifactManager | null = null;
  private visualManager: IVisualTestingManager | null = null;
  private flakyManager: IFlakyManager | null = null;
  private enrichers: IResultEnrichers | null = null;
  private log = logger.child('Executor');
  private lastExecuteOptions: {
    testFiles?: string[];
    testLocations?: string[];
    grepPattern?: string;
  } | null = null;
  private storage: StorageProvider;
  private skippedQuarantinedTests: string[] = [];
  private configMerger: PlaywrightConfigMerger;
  private resolvedOutputDir: string = '';
  private parentRunId: string | null = null;
  private progressTracker: ProgressTracker;
  private settled: boolean = false;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private stallCheckId: ReturnType<typeof setInterval> | null = null;

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

  constructor(
    config: TestConfig,
    storage?: StorageProvider,
    flakyManager?: IFlakyManager,
    enrichers?: IResultEnrichers
  ) {
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
    this.enrichers = enrichers || null;
    this.configMerger = new PlaywrightConfigMerger(this.storage);
    this.progressTracker = new ProgressTracker(this.storage);
    this.forwardProgressTrackerEvents();
    this.initializeManagers();
  }

  private forwardProgressTrackerEvents(): void {
    this.progressTracker.on('output', (data) => this.emit('output', data));
    this.progressTracker.on('run_progress', (data) => this.emit('run_progress', data));
    this.progressTracker.on('test_result', (data) => this.emit('test_result', data));
    this.progressTracker.on('all_tests_completed', (data) =>
      this.emit('all_tests_completed', data)
    );
    this.progressTracker.on('parse_error', (jsonStr: string) => {
      this.log.debug(`Failed to parse progress message: ${jsonStr}`);
    });
  }

  private initializeManagers(): void {
    // TraceManager 属执行器域，包内直接创建；其余结果管理器由 apps 层经 IResultEnrichers 注入
    if (this.config.traces?.enabled) {
      this.traceManager = new TraceManager(
        this.config.traces,
        path.join(this.config.outputDir, 'test-results'),
        this.storage
      );
    }

    if (this.config.annotations?.enabled && this.enrichers?.annotations) {
      this.annotationManager = this.enrichers.annotations;
    }

    if (this.config.tags?.enabled && this.enrichers?.tags) {
      this.tagManager = this.enrichers.tags;
    }

    if (this.config.artifacts?.enabled && this.enrichers?.artifacts) {
      this.artifactManager = this.enrichers.artifacts;
    }

    if (this.config.visualTesting?.enabled && this.enrichers?.visual) {
      this.visualManager = this.enrichers.visual;
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

    try {
      const envCheck = await checkEnvironment();
      if (!envCheck.playwrightAvailable) {
        throw new PlaywrightRunnerError(
          'Playwright CLI is not available. Please install @playwright/test (npm install @playwright/test)',
          'ENV_ERROR' as ErrorCode
        );
      }
      if (!envCheck.playwrightOk) {
        this.log.warn(
          `Playwright version ${envCheck.playwrightVersion} is below minimum ${MIN_PLAYWRIGHT_VERSION}, execution may fail`
        );
      }

      const runId = this.generateRunId();
      const startTime = Date.now();

      this.progressTracker.reset();

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
      this.progressTracker.currentRun = this._currentRun;

      this.skippedQuarantinedTests = [];
      this.parentRunId = options?.parentRunId || null;
      this.lastExecuteOptions = {
        testFiles: options?.testFiles,
        testLocations: options?.testLocations,
        grepPattern: options?.grepPattern,
      };

      this.log.info(`Run started: ${runId}`);
      this.emit('run_started', { runId, timestamp: startTime });

      try {
        const filteredOptions = await this.filterQuarantinedTests(options);
        await this.prepareRun(filteredOptions);
        await this.runPlaywrightTests(filteredOptions);
      } catch (error: unknown) {
        this._currentRun.status = 'failed';
        this.log.error(`Run failed: ${runId}`, error instanceof Error ? error : undefined);
        this.emit('error', {
          error: error instanceof Error ? error.message : String(error),
          runId,
        });
      }

      // 测试运行结束后立即发射完成信号，不等待后处理
      this._currentRun.endTime = Date.now();
      this._currentRun.duration = this._currentRun.endTime - this._currentRun.startTime;
      (this._currentRun.metadata as RunMetadata).skippedQuarantinedTests =
        this.skippedQuarantinedTests;
      this.log.info(
        `Run completed: ${runId} (${this._currentRun.passed}/${this._currentRun.totalTests} passed, ${this.skippedQuarantinedTests.length} quarantined tests skipped)`
      );
      this.emit('run_completed', this._currentRun);

      // 后处理（移动报告、trace/artifact 发现等）在完成信号之后执行，不阻塞
      try {
        await this.postProcessRun(runId);
        if (this._currentRun.status !== 'failed' && this._currentRun.status !== 'cancelled') {
          this._currentRun.status = 'success';
        }
      } catch (error: unknown) {
        this.log.warn(
          `Post-processing failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      return this._currentRun;
    } finally {
      this.isRunning = false;
    }
  }

  private async prepareRun(_options?: {
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
      const run = this._currentRun as RunResult;
      run.metadata = run.metadata || {};
      (run.metadata as RunMetadata).annotations = annotations.map((a) => ({
        type: a.type,
        testName: a.testName,
        file: a.file,
      }));

      const summary = this.annotationManager.getSummary();
      this.log.info(`Annotations scanned: ${summary.total} found`);
      this.emit('annotations_scanned', { runId: run.id, summary });
    }

    if (this.tagManager) {
      const tags = await this.tagManager.scanDirectory(this.config.testDir);
      const run = this._currentRun as RunResult;
      run.metadata = run.metadata || {};
      (run.metadata as RunMetadata).tags = tags.map((t) => ({
        name: t.name,
        count: t.testIds.length,
      }));

      const summary = this.tagManager.getSummary();
      this.log.info(
        `Tags scanned: ${summary.totalTags} tags, ${summary.totalTaggedTests} tagged tests`
      );
      this.emit('tags_scanned', { runId: run.id, summary });
    }
  }

  private async writeEnvironmentTagConfig(
    originalConfigPath: string,
    environmentTag: string,
    outputDir: string,
    runId: string
  ): Promise<string | null> {
    try {
      const fs = await import('fs/promises');
      const tempDir = path.join(outputDir, 'temp-configs');
      if (!(await this.storage.exists(tempDir))) {
        await fs.mkdir(tempDir, { recursive: true });
      }

      const ext = path.extname(originalConfigPath);
      const tempConfigPath = path.join(tempDir, `env-tag-${runId}${ext}`);

      const isTs = ext === '.ts' || ext === '.mts';
      const relativePath = path.relative(tempDir, originalConfigPath).split(path.sep).join('/');

      let tempConfigCode: string;
      if (isTs) {
        tempConfigCode = `import { defineConfig } from '@playwright/test';
import baseConfig from '${relativePath}';

export default defineConfig({
  ...baseConfig,
  tag: '${environmentTag.replace(/'/g, "\\'")}',
});
`;
      } else {
        tempConfigCode = `const { defineConfig } = require('@playwright/test');
const baseConfig = require('${relativePath}');

module.exports = defineConfig({
  ...baseConfig,
  tag: '${environmentTag.replace(/'/g, "\\'")}',
});
`;
      }

      await fs.writeFile(tempConfigPath, tempConfigCode, 'utf-8');
      this.log.info(`Generated temp config with tag "${environmentTag}" at: ${tempConfigPath}`);

      return tempConfigPath;
    } catch (error: unknown) {
      this.log.warn(
        `Failed to generate temp config with environment tag: ${error instanceof Error ? error.message : String(error)}. ` +
          `Falling back to original config. Make sure your playwright.config.ts sets tag: process.env.CI_ENVIRONMENT_NAME`
      );
      return null;
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
    this.settled = false;
    this.timeoutId = null;
    this.stallCheckId = null;

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
    await this.progressTracker.writeReporter(progressReporterPath);

    const runId = this._currentRun?.id || `run_${Date.now()}`;
    const htmlReportPath = path.join(resolvedOutputDir, 'html-reports', runId);

    const playwrightReportDir = path.join(resolvedOutputDir, 'reports');
    if (!(await this.storage.exists(playwrightReportDir))) {
      const fs = await import('fs/promises');
      await fs.mkdir(playwrightReportDir, { recursive: true });
      this.log.info(`Created Playwright report directory: ${playwrightReportDir}`);
    }

    const args: string[] = ['test'];

    let effectiveConfigPath = configPath;

    if (configPath && this.config.environmentTag) {
      const tempConfigPath = await this.writeEnvironmentTagConfig(
        configPath,
        this.config.environmentTag,
        resolvedOutputDir,
        runId
      );
      if (tempConfigPath) {
        effectiveConfigPath = tempConfigPath;
        this.log.info(
          `Using temp config with environment tag "${this.config.environmentTag}": ${tempConfigPath}`
        );
      }
    }

    if (effectiveConfigPath) {
      const safeConfigPath = safePathForCLI(effectiveConfigPath);
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

    if (this.parentRunId && this.config.retryIndex) {
      const retryTempDir = path.join(
        resolvedOutputDir,
        'test-results',
        `${this.parentRunId}_retry${this.config.retryIndex}_temp`
      );
      const safeRetryTempDir = safePathForCLI(retryTempDir);
      args.push(`--output=${safeRetryTempDir}`);
      this.log.info(
        `Rerun output directory (temp): ${retryTempDir} (retry #${this.config.retryIndex})`
      );
    } else {
      const runOutputDir = path.join(resolvedOutputDir, 'test-results', runId);
      const safeRunOutputDir = safePathForCLI(runOutputDir);
      args.push(`--output=${safeRunOutputDir}`);
      this.log.info(`Playwright output directory: ${runOutputDir}`);
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

    // 默认不设进程级超时，仅当用户显式配置 processTimeout > 0 时启用
    // 已有 stall 检测（300s 无进度告警）作为防护
    const effectiveTimeout =
      this.config.processTimeout && this.config.processTimeout > 0 ? this.config.processTimeout : 0;

    const exitCode = await new Promise<number>((resolve, reject) => {
      // Windows（shell:true）下参数只拼接不转义，含空格路径会被 cmd 拆词并输出
      // GBK 中文错误 → UTF-8 解码成乱码、进程立即退出；此处逐参数转义修复
      const proc = spawn('npx', ['playwright', ...args.map(escapeShellArg)], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: buildSpawnEnv({
          NODE_OPTIONS: '--max-old-space-size=4096',
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
          ...(this.config.environmentTag
            ? {
                YUANTEST_ENVIRONMENT_TAG: this.config.environmentTag,
                CI_ENVIRONMENT_NAME: this.config.environmentTag,
              }
            : {}),
        }),
      });

      this.currentProcess = proc;

      // 流式解码：避免多字节 UTF-8 字符被 chunk 边界截断产生乱码
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');

      proc.stdout?.on('data', (chunk: Buffer) => {
        // stdout 由 ProgressReporter 通过 progress channel 统一处理，
        // 此处仅记录到日志，不再发射 output 事件以避免重复打印
        const text = stdoutDecoder.write(chunk);
        const strippedText = stripAnsi(text);
        if (strippedText.trim()) {
          this.log.debug(`[stdout] ${strippedText.trim()}`);
        }
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        try {
          const text = stderrDecoder.write(chunk);
          this.progressTracker.handleData(text);
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

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let stallCheckId: ReturnType<typeof setInterval> | null = null;

      let cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (stallCheckId) {
          clearInterval(stallCheckId);
          stallCheckId = null;
        }
      };

      let stallWarningCount = 0;
      const MAX_STALL_WARNINGS = 3;

      stallCheckId = setInterval(async () => {
        if (settled) {
          if (stallCheckId) {
            clearInterval(stallCheckId);
            stallCheckId = null;
          }
          return;
        }
        // 检查进程是否已退出但未触发 exit/close 事件
        if (proc.exitCode !== null) {
          this.log.warn('Process has exited but close event was not received, finalizing...');
          finalize(proc.exitCode);
          return;
        }
        const elapsed = Date.now() - this.progressTracker.progressTimestamp;
        if (elapsed > 300000) {
          stallWarningCount++;

          // 检查是否所有测试用例均已收到结果，若进程未退出则强制结束
          const stats = this.progressTracker.stats;
          if (
            stats.totalTests > 0 &&
            stats.passed + stats.failed + stats.skipped >= stats.totalTests
          ) {
            this.log.warn(
              `All ${stats.totalTests} tests completed but process still running after ${Math.round(elapsed / 1000)}s stall, force finalizing...`
            );
            if (proc.pid) {
              if (process.platform === 'win32') {
                await this.killProcessTreeWindows(proc.pid);
              } else {
                this.killProcessTreeUnix(proc.pid);
              }
            }
            finalize(0);
            return;
          }

          this.log.warn(
            `No progress received for ${Math.round(elapsed / 1000)}s, process may be stalled (warning ${stallWarningCount}/${MAX_STALL_WARNINGS})`
          );

          if (stallWarningCount >= MAX_STALL_WARNINGS) {
            this.log.error(
              `Process stalled after ${Math.round(elapsed / 1000)}s (${MAX_STALL_WARNINGS} consecutive warnings), killing process tree...`
            );
            this.emit('output', {
              data: `⚠️ Process stalled after ${Math.round(elapsed / 1000)}s with no progress, terminating forcefully`,
              timestamp: Date.now(),
              runId: this._currentRun?.id || '',
              type: 'stderr',
            });
            if (proc.pid) {
              if (process.platform === 'win32') {
                await this.killProcessTreeWindows(proc.pid);
              } else {
                this.killProcessTreeUnix(proc.pid);
              }
            }
            finalize(1);
          }
        } else {
          stallWarningCount = 0;
        }
      }, 60000);
      stallCheckId.unref();

      const finalize = (code: number) => {
        if (settled) {
          return;
        }
        settled = true;
        this.settled = true;
        cleanup();
        this.currentProcess = null;
        this.progressTracker.flushBuffer();
        resolve(code);
      };

      // 监听 all_tests_completed 事件：所有测试用例均已收到结果，
      // 若进程还在运行则设置短等待期（30s）后强制结束
      let allTestsCompletedGraceTimer: ReturnType<typeof setTimeout> | null = null;
      const onAllTestsCompleted = () => {
        if (settled) {
          return;
        }
        if (allTestsCompletedGraceTimer) {
          return;
        } // 已有一个等待定时器，不重复设置
        this.log.info(
          'All tests completed via progress reporter, waiting 30s for process to exit gracefully...'
        );
        allTestsCompletedGraceTimer = setTimeout(async () => {
          if (settled) {
            return;
          }
          this.log.warn(
            'Process did not exit within 30s after all tests completed, force finalizing...'
          );
          if (proc.pid) {
            if (process.platform === 'win32') {
              await this.killProcessTreeWindows(proc.pid);
            } else {
              this.killProcessTreeUnix(proc.pid);
            }
          }
          finalize(0);
        }, 30000);
        allTestsCompletedGraceTimer.unref();
      };
      this.progressTracker.on('all_tests_completed', onAllTestsCompleted);

      // 在 cleanup 中移除监听
      const origCleanup = cleanup;
      cleanup = () => {
        origCleanup();
        this.progressTracker.off('all_tests_completed', onAllTestsCompleted);
        if (allTestsCompletedGraceTimer) {
          clearTimeout(allTestsCompletedGraceTimer);
          allTestsCompletedGraceTimer = null;
        }
      };

      timeoutId =
        effectiveTimeout > 0
          ? setTimeout(async () => {
              if (settled) {
                return;
              }
              this.log.warn(`Process timeout after ${effectiveTimeout}ms, killing process tree...`);
              this.emit('output', {
                data: `⚠️ Execution timed out after ${Math.round(effectiveTimeout / 1000)}s, terminating process...`,
                timestamp: Date.now(),
                runId: this._currentRun?.id || '',
                type: 'stderr',
              });

              if (proc.pid) {
                if (process.platform === 'win32') {
                  await this.killProcessTreeWindows(proc.pid);
                } else {
                  this.killProcessTreeUnix(proc.pid);
                }
              }

              if (this._currentRun) {
                this._currentRun.status = 'failed';
                if (!this._currentRun.metadata) {
                  this._currentRun.metadata = {};
                }
                if (!this._currentRun.metadata.globalErrors) {
                  this._currentRun.metadata.globalErrors = [];
                }
                this._currentRun.metadata.globalErrors.push({
                  message: `Execution timed out after ${Math.round(effectiveTimeout / 1000)}s`,
                  stack: '',
                  timestamp: Date.now(),
                });
              }

              finalize(1);
            }, effectiveTimeout)
          : null;

      proc.on('error', (error) => {
        if (settled) {
          return;
        }
        cleanup();
        this.currentProcess = null;
        reject(
          new PlaywrightRunnerError(
            `Failed to spawn playwright process: ${error.message}`,
            'SPAWN_ERROR'
          )
        );
      });

      // exit 事件先于 close 触发，确保即使 close 不触发（Windows + shell:true 场景）Promise 也能 resolve
      proc.on('exit', (code) => {
        finalize(code ?? 1);
      });

      proc.on('close', (code) => {
        finalize(code ?? 1);
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
      if (
        this._currentRun &&
        this._currentRun.failed > 0 &&
        this._currentRun.status !== 'cancelled'
      ) {
        this._currentRun.status = 'failed';
      }
    }
  }

  private processJSONReport(report: PlaywrightJSONReport): void {
    if (!this._currentRun) {
      return;
    }

    const parsed = PlaywrightReportParser.parseReport(report);
    const testIndex = this.progressTracker.getTestIndex();
    const suiteIndex = this.progressTracker.getSuiteIndex();
    const testSuiteIndex = this.progressTracker.getTestSuiteIndex();

    for (const jsonSuite of parsed.suites) {
      const existingSuite = suiteIndex.get(jsonSuite.name);
      if (!existingSuite) {
        this._currentRun.suites.push(jsonSuite);
        suiteIndex.set(jsonSuite.name, jsonSuite);
        for (const test of jsonSuite.tests) {
          const existingTest = testIndex.get(test.id);
          if (!existingTest) {
            testIndex.set(test.id, test);
            testSuiteIndex.set(test.id, jsonSuite);
            this.emit('test_result', test);
          }
        }
      } else {
        for (const test of jsonSuite.tests) {
          const existingTest = testIndex.get(test.id);
          if (existingTest) {
            if (!existingTest.screenshots?.length && test.screenshots?.length) {
              existingTest.screenshots = test.screenshots;
            }
            if (!existingTest.videos?.length && test.videos?.length) {
              existingTest.videos = test.videos;
            }
            if (!existingTest.traces?.length && test.traces?.length) {
              existingTest.traces = test.traces;
            }
            if (test.error && !existingTest.error) {
              existingTest.error = test.error;
            }
            if (test.retries > 0 && !existingTest.retries) {
              existingTest.retries = test.retries;
            }
            if (!existingTest.file && test.file) {
              existingTest.file = test.file;
            }
            if (!existingTest.line && test.line) {
              existingTest.line = test.line;
            }
            // 用最终报告状态纠正实时状态（若实时事件 id 不匹配/丢失导致用例树残留中间态，
            // 结束阶段必须收敛为最终 passed/failed/skipped，并重发事件供 dashboard 更新）
            if (existingTest.status !== test.status) {
              const ownerSuite = testSuiteIndex.get(test.id) || existingSuite;
              if (existingTest.status === 'passed') {
                ownerSuite.passed--;
              } else if (existingTest.status === 'failed' || existingTest.status === 'timedout') {
                ownerSuite.failed--;
              } else if (existingTest.status === 'skipped') {
                ownerSuite.skipped--;
              }
              existingTest.status = test.status;
              existingTest.duration = test.duration || existingTest.duration;
              if (test.status === 'passed') {
                ownerSuite.passed++;
              } else if (test.status === 'failed' || test.status === 'timedout') {
                ownerSuite.failed++;
              } else if (test.status === 'skipped') {
                ownerSuite.skipped++;
              }
              this.emit('test_result', existingTest);
            }
          } else {
            existingSuite.tests.push(test);
            existingSuite.totalTests++;
            existingSuite.duration += test.duration;
            testIndex.set(test.id, test);
            testSuiteIndex.set(test.id, existingSuite);
            if (test.status === 'passed') {
              existingSuite.passed++;
            } else if (test.status === 'failed' || test.status === 'timedout') {
              existingSuite.failed++;
            } else if (test.status === 'skipped') {
              existingSuite.skipped++;
            }
            this.emit('test_result', test);
          }
        }
      }
    }

    this._currentRun.totalTests = this._currentRun.suites.reduce((sum, s) => sum + s.totalTests, 0);
    this._currentRun.passed = this._currentRun.suites.reduce((sum, s) => sum + s.passed, 0);
    this._currentRun.failed = this._currentRun.suites.reduce((sum, s) => sum + s.failed, 0);
    this._currentRun.skipped = this._currentRun.suites.reduce((sum, s) => sum + s.skipped, 0);

    const flakyIds = new Set(this._currentRun.flakyTests.map((f) => f.id));
    for (const f of parsed.flakyTests) {
      if (!flakyIds.has(f.id)) {
        this._currentRun.flakyTests.push(f);
        flakyIds.add(f.id);
      }
    }

    this.log.info(
      `Test run completed in ${parsed.stats.duration}ms (unexpected: ${parsed.stats.unexpected}, flaky: ${parsed.stats.flaky}, skipped: ${parsed.stats.skipped})`
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

  private async postProcessRun(runId: string): Promise<void> {
    if (this.config.htmlReport) {
      await this.moveHTMLReport(runId);
    } else if (this.parentRunId) {
      await this.mergeBlobReport(runId);
    }

    if (this.parentRunId && this.config.retryIndex) {
      await this.moveRetryArtifacts();
    }

    if (this.traceManager) {
      try {
        const traces = await this.traceManager.discoverTraces(runId);
        const currentRun = this._currentRun as RunResult;
        currentRun.metadata = currentRun.metadata || {};
        (currentRun.metadata as RunMetadata).traces = {
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
        const currentRun = this._currentRun as RunResult;
        currentRun.metadata = currentRun.metadata || {};
        (currentRun.metadata as RunMetadata).artifacts = {
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
        const currentRun = this._currentRun as RunResult;
        const testIds = currentRun.suites.flatMap((s) => s.tests).map((t) => t.id);
        const visualResults = await this.visualManager.runVisualTests(testIds);
        const visualSummary = this.visualManager.getSummary();
        currentRun.metadata = currentRun.metadata || {};
        (currentRun.metadata as RunMetadata).visualTesting = {
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
    const parentRunId = this.parentRunId as string;
    const blobReportDir = path.join(this.resolvedOutputDir, 'blob-reports', parentRunId);
    const originalHtmlReportDir = path.join(this.resolvedOutputDir, 'html-reports', parentRunId);

    this.log.info(
      `Attempting to merge blob report for rerun: ${runId} into original report: ${parentRunId}`
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
        const proc = spawn('npx', mergeArgs.map(escapeShellArg), {
          cwd: this.resolvedOutputDir,
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true,
          env: buildSpawnEnv({
            PLAYWRIGHT_HTML_REPORT: mergedOutputDir,
          }),
        });

        let stdout = '';
        let stderr = '';
        // 流式解码：避免多字节 UTF-8 字符被 chunk 边界截断产生乱码
        const stdoutDecoder = new StringDecoder('utf8');
        const stderrDecoder = new StringDecoder('utf8');

        proc.stdout?.on('data', (chunk: Buffer) => {
          stdout += stdoutDecoder.write(chunk);
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          stderr += stderrDecoder.write(chunk);
        });

        proc.on('close', (code: number | null) => {
          stdout += stdoutDecoder.end();
          stderr += stderrDecoder.end();
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

  private async moveRetryArtifacts(): Promise<void> {
    if (!this.parentRunId || !this.config.retryIndex) {
      return;
    }

    const retryTempDir = path.join(
      this.resolvedOutputDir,
      'test-results',
      `${this.parentRunId}_retry${this.config.retryIndex}_temp`
    );
    const originalRunDir = path.join(this.resolvedOutputDir, 'test-results', this.parentRunId);

    if (!(await this.storage.exists(retryTempDir))) {
      this.log.warn(`Retry temp directory not found: ${retryTempDir}, skipping artifact move`);
      return;
    }

    try {
      const fs = await import('fs/promises');

      if (!(await this.storage.exists(originalRunDir))) {
        await fs.mkdir(originalRunDir, { recursive: true });
      }

      const entries = await fs.readdir(retryTempDir, { withFileTypes: true });
      const pathMappings: Map<string, string> = new Map();

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const sourcePath = path.join(retryTempDir, entry.name);
          const targetName = `${entry.name}-retry${this.config.retryIndex}`;
          const targetPath = path.join(originalRunDir, targetName);

          if (await this.storage.exists(targetPath)) {
            await fs.rm(targetPath, { recursive: true });
          }

          await fs.rename(sourcePath, targetPath);
          pathMappings.set(sourcePath.replace(/\\/g, '/'), targetPath.replace(/\\/g, '/'));
          this.log.info(
            `Moved retry artifact: ${entry.name} -> ${targetName} (retry #${this.config.retryIndex})`
          );
        } else if (entry.isFile()) {
          const sourcePath = path.join(retryTempDir, entry.name);
          const targetName = `${entry.name}-retry${this.config.retryIndex}`;
          const targetPath = path.join(originalRunDir, targetName);

          await fs.rename(sourcePath, targetPath);
          pathMappings.set(sourcePath.replace(/\\/g, '/'), targetPath.replace(/\\/g, '/'));
          this.log.info(
            `Moved retry file: ${entry.name} -> ${targetName} (retry #${this.config.retryIndex})`
          );
        }
      }

      this.remapArtifactPaths(pathMappings);

      await fs.rm(retryTempDir, { recursive: true });
      this.log.info(`Cleaned up retry temp directory: ${retryTempDir}`);
    } catch (error: unknown) {
      this.log.error(
        `Failed to move retry artifacts: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private remapArtifactPaths(pathMappings: Map<string, string>): void {
    if (!this._currentRun || pathMappings.size === 0) {
      return;
    }

    const remapList = (paths: string[] | undefined): string[] => {
      if (!paths) {
        return [];
      }
      return paths.map((p) => {
        const normalized = p.replace(/\\/g, '/');
        for (const [oldPrefix, newPrefix] of pathMappings) {
          if (normalized.startsWith(oldPrefix)) {
            return normalized.replace(oldPrefix, newPrefix);
          }
        }
        return p;
      });
    };

    for (const suite of this._currentRun.suites) {
      for (const test of suite.tests) {
        test.screenshots = remapList(test.screenshots);
        test.videos = remapList(test.videos);
        test.traces = remapList(test.traces);
      }
    }
  }

  private generateRunId(): string {
    return `run_${dayjs().format('YYYYMMDD_HHmmss')}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupTimers(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.stallCheckId) {
      clearInterval(this.stallCheckId);
      this.stallCheckId = null;
    }
  }

  async cancel(): Promise<void> {
    if (this.currentProcess) {
      this.log.info('Cancelling running tests...');
      const pid = this.currentProcess.pid;

      // 设置 settled 标志，防止 close/exit 事件触发 finalize
      this.settled = true;
      this.cleanupTimers();
      this.progressTracker.flushBuffer();

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

  getTestLocations(): string[] | null {
    if (!this.isRunning || !this.lastExecuteOptions) {
      return null;
    }
    return this.lastExecuteOptions.testLocations ?? null;
  }

  getTestFiles(): string[] | null {
    if (!this.isRunning || !this.lastExecuteOptions) {
      return null;
    }
    return this.lastExecuteOptions.testFiles ?? null;
  }

  getGrepPattern(): string | null {
    if (!this.isRunning || !this.lastExecuteOptions) {
      return null;
    }
    return this.lastExecuteOptions.grepPattern ?? null;
  }

  getCompletedTestResults(): Array<{
    id: string;
    title: string;
    status: string;
    duration: number;
    error?: string;
    file?: string;
    line?: number;
  }> {
    if (!this.isRunning) {
      return [];
    }
    return Array.from(this.progressTracker.getTestIndex().values()).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      duration: t.duration,
      error: t.error,
      file: t.file,
      line: t.line,
    }));
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

  getAnnotationManager(): IAnnotationManager | null {
    return this.annotationManager;
  }

  getTagManager(): ITagManager | null {
    return this.tagManager;
  }

  getArtifactManager(): IArtifactManager | null {
    return this.artifactManager;
  }

  getVisualManager(): IVisualTestingManager | null {
    return this.visualManager;
  }
}

export class ParallelExecutor {
  private executors: Executor[] = [];
  private log = logger.child('ParallelExecutor');
  private config: TestConfig;

  constructor(config: TestConfig, shardCount: number, storage?: StorageProvider) {
    this.config = config;
    for (let i = 0; i < shardCount; i++) {
      const shardConfig = { ...config };
      shardConfig.outputDir = path.join(config.outputDir, `shard-${i}`);
      this.executors.push(new Executor(shardConfig, storage));
    }
    this.log.info(`Initialized parallel executor with ${shardCount} shards`);
  }

  async execute(concurrencyLimit?: number): Promise<RunResult[]> {
    const limit = concurrencyLimit || Math.min(this.executors.length, 4);
    this.log.info(
      `Starting parallel execution across ${this.executors.length} shards (concurrency: ${limit})`
    );

    const results: RunResult[] = new Array(this.executors.length);
    let nextIndex = 0;

    const runNext = async (): Promise<void> => {
      while (nextIndex < this.executors.length) {
        const index = nextIndex++;
        try {
          results[index] = await this.executors[index].execute({
            shardIndex: index,
            shardTotal: this.executors.length,
          });
        } catch (error: unknown) {
          this.log.error(
            `Shard ${index} failed: ${error instanceof Error ? error.message : String(error)}`
          );
          results[index] = {
            id: `shard-${index}-failed`,
            version: this.config.version || '1.0.0',
            status: 'failed',
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 0,
            suites: [],
            totalTests: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            flakyTests: [],
            metadata: { shardError: error instanceof Error ? error.message : String(error) },
          };
        }
      }
    };

    const workers = Array.from({ length: Math.min(limit, this.executors.length) }, () => runNext());
    await Promise.all(workers);

    return results;
  }

  async executeAndMergeReports(): Promise<{ results: RunResult[]; mergedReportDir?: string }> {
    const results = await this.execute();

    try {
      const mergedReportDir = await this.mergeShardReports();
      return { results, mergedReportDir };
    } catch (error: unknown) {
      this.log.error(
        `Failed to merge shard reports: ${error instanceof Error ? error.message : String(error)}`
      );
      return { results };
    }
  }

  async mergeShardReports(): Promise<string | undefined> {
    const allBlobDir = path.join(this.config.outputDir, 'all-blob-reports');
    const fs = await import('fs/promises');

    if (!(await this.storageExists(allBlobDir))) {
      await fs.mkdir(allBlobDir, { recursive: true });
    }

    for (let i = 0; i < this.executors.length; i++) {
      const shardBlobDir = path.join(this.config.outputDir, `shard-${i}`, 'blob-reports');
      try {
        if (await this.storageExists(shardBlobDir)) {
          const entries = await fs.readdir(shardBlobDir);
          for (const entry of entries) {
            if (entry.endsWith('.zip')) {
              const srcPath = path.join(shardBlobDir, entry);
              const destPath = path.join(allBlobDir, `shard-${i}-${entry}`);
              await fs.copyFile(srcPath, destPath);
              this.log.info(`Copied blob report: ${srcPath} -> ${destPath}`);
            }
          }
        } else {
          const shardBlobSubDirs = await this.findBlobReportDirs(
            path.join(this.config.outputDir, `shard-${i}`)
          );
          for (const subDir of shardBlobSubDirs) {
            const entries = await fs.readdir(subDir);
            for (const entry of entries) {
              if (entry.endsWith('.zip')) {
                const srcPath = path.join(subDir, entry);
                const destPath = path.join(allBlobDir, `shard-${i}-${entry}`);
                await fs.copyFile(srcPath, destPath);
                this.log.info(`Copied blob report: ${srcPath} -> ${destPath}`);
              }
            }
          }
        }
      } catch (error: unknown) {
        this.log.warn(
          `Failed to copy blob reports from shard ${i}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const blobFiles = (await fs.readdir(allBlobDir)).filter((f: string) => f.endsWith('.zip'));
    if (blobFiles.length === 0) {
      this.log.warn('No blob report files found to merge');
      return undefined;
    }

    this.log.info(`Found ${blobFiles.length} blob report file(s) to merge`);

    const mergedOutputDir = path.join(this.config.outputDir, 'html-reports', 'merged-shards');

    const mergeArgs = ['playwright', 'merge-reports', allBlobDir, '--reporter=html'];

    this.log.info(`Running merge command: npx ${mergeArgs.join(' ')}`);

    const mergeExitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn('npx', mergeArgs.map(escapeShellArg), {
        cwd: this.config.outputDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: buildSpawnEnv({
          PLAYWRIGHT_HTML_REPORT: mergedOutputDir,
        }),
      });

      let stdout = '';
      let stderr = '';
      // 流式解码：避免多字节 UTF-8 字符被 chunk 边界截断产生乱码
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += stdoutDecoder.write(chunk);
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += stderrDecoder.write(chunk);
      });

      proc.on('close', (code: number | null) => {
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();
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
      this.log.info(
        `Successfully merged ${blobFiles.length} shard reports into: ${mergedOutputDir}`
      );
      return mergedOutputDir;
    } else {
      this.log.error(`Merge reports command failed with exit code: ${mergeExitCode}`);
      return undefined;
    }
  }

  private async storageExists(dirPath: string): Promise<boolean> {
    try {
      const fs = await import('fs/promises');
      await fs.access(dirPath);
      return true;
    } catch {
      return false;
    }
  }

  private async findBlobReportDirs(baseDir: string): Promise<string[]> {
    const dirs: string[] = [];
    try {
      const fs = await import('fs/promises');
      const blobReportsBase = path.join(baseDir, 'blob-reports');
      if (await this.storageExists(blobReportsBase)) {
        const entries = await fs.readdir(blobReportsBase, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subDir = path.join(blobReportsBase, entry.name);
            const files = await fs.readdir(subDir);
            if (files.some((f: string) => f.endsWith('.zip'))) {
              dirs.push(subDir);
            }
          }
        }
        if (dirs.length === 0) {
          const files = await fs.readdir(blobReportsBase);
          if (files.some((f: string) => f.endsWith('.zip'))) {
            dirs.push(blobReportsBase);
          }
        }
      }
    } catch {
      // ignore
    }
    return dirs;
  }

  async cancelAll(): Promise<void> {
    for (const executor of this.executors) {
      await executor.cancel();
    }
  }
}
