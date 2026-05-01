import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { RealtimeReporter } from '../realtime';
import { Reporter } from '../reporter';
import { FlakyTestManager } from '../flaky';
import { TraceManager } from '../trace';
import { AnnotationManager } from '../annotations';
import { TagManager } from '../tags';
import { ArtifactManager } from '../artifacts';
import { VisualTestingManager } from '../visual';
import { DiagnosisService } from '../diagnosis';
import { Executor } from '../executor';
import { TestDiscovery } from '../discovery';
import { DashboardStats, RunResult, TestConfig, TestResult, getErrorMessage } from '../types';
import { loadConfigFile, mergeConfig } from '../config/loader';
import { logger } from '../logger';
import { StorageProvider, getStorage } from '../storage';
import { LRUCache } from '../cache';
import { asyncHandler, validateBody, errorHandler, notFoundHandler } from '../middleware';
import {
  StartRunRequestSchema,
  SetTestDirRequestSchema,
  SavePreferencesRequestSchema,
} from '../validation';
import { HTTP_STATUS } from '../constants';
import { Lang, setLang } from '../i18n';
import * as path from 'path';
import * as fs from 'fs';

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

function isPathSafe(inputPath: string): boolean {
  if (inputPath.includes('..')) {
    return false;
  }
  const resolved = path.resolve(inputPath);
  const normalized = path.normalize(inputPath);
  return (
    resolved.startsWith(process.cwd()) ||
    inputPath === normalized ||
    inputPath.startsWith('./') ||
    inputPath.startsWith('/')
  );
}

export class DashboardServer {
  private app: Express;
  private server: ReturnType<typeof createServer>;
  private realtimeReporter: RealtimeReporter;
  private reporter: Reporter;
  private flakyManager: FlakyTestManager;
  private traceManager: TraceManager;
  private artifactManager: ArtifactManager;
  private annotationManager: AnnotationManager;
  private tagManager: TagManager;
  private visualManager: VisualTestingManager;
  private diagnosisService: DiagnosisService;
  private executor: Executor | null = null;
  private port: number;
  private staticPath: string;
  private outputDir: string;
  private dataDir: string;
  private testDir: string;
  private log = logger.child('DashboardServer');
  private storage: StorageProvider;
  private testDiscovery: TestDiscovery;
  private cache: LRUCache<unknown>;

  constructor(
    port: number = 5274,
    outputDir: string = './test-reports',
    dataDir: string = './test-data'
  ) {
    this.port = port;
    this.outputDir = outputDir;
    this.dataDir = dataDir;
    this.testDir = './';
    this.staticPath = path.join(__dirname, '../public');
    this.storage = getStorage();
    this.testDiscovery = new TestDiscovery();
    this.cache = new LRUCache({
      maxSize: process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE, 10) : 100,
    });

    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.realtimeReporter = new RealtimeReporter();
    this.reporter = new Reporter(outputDir, this.storage);
    this.flakyManager = new FlakyTestManager(dataDir, {}, this.storage);

    this.traceManager = new TraceManager(
      {
        enabled: true,
        mode: 'on',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      },
      path.join(this.outputDir, '../traces')
    );

    this.artifactManager = new ArtifactManager(
      { enabled: true, screenshots: 'on', videos: 'on' },
      path.join(this.outputDir, '../artifacts')
    );

    this.annotationManager = new AnnotationManager();
    this.tagManager = new TagManager();

    this.visualManager = new VisualTestingManager(
      {
        enabled: true,
        threshold: 0.2,
        maxDiffPixelRatio: 0.01,
        maxDiffPixels: 10,
        updateSnapshots: false,
      },
      path.join(this.outputDir, '../visual-testing')
    );

    try {
      this.diagnosisService = new DiagnosisService(dataDir);
    } catch (error) {
      this.log.warn(`Failed to initialize DiagnosisService: ${error}`);
      this.diagnosisService = new DiagnosisService(dataDir);
    }

    this.server = createServer(this.app);

    this.setupRoutes();
    this.setupStaticFiles();
  }

  private setupRoutes(): void {
    const v1Router = Router();

    v1Router.use((req: Request, res: Response, next: NextFunction) => {
      const lang =
        (req.query.lang as Lang) ||
        (req.headers['accept-language']?.startsWith('zh') ? 'zh' : 'en') ||
        'zh';
      if (lang === 'zh' || lang === 'en') {
        setLang(lang);
        this.testDiscovery.setLang(lang);
      }
      next();
    });

    v1Router.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        uptime: process.uptime(),
        clients: this.realtimeReporter.getConnectedClients(),
        isRunning: this.executor?.isCurrentlyRunning() || false,
        timestamp: Date.now(),
      });
    });

    v1Router.get('/config', async (req: Request, res: Response) => {
      try {
        const testDir = await this.resolveTestDirFromPlaywrightConfig();
        res.json({ testDir });
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    v1Router.get('/tests', async (req: Request, res: Response) => {
      try {
        const testDir = (req.query.testDir as string) || this.testDir;
        if (!isPathSafe(testDir)) {
          res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }

        const configPath = (req.query.configPath as string) || undefined;
        const structured = req.query.structured === 'true';
        const forceRefresh = req.query.force === 'true';

        if (forceRefresh) {
          this.testDiscovery.invalidateCache(testDir);
          this.cache.invalidate(`tests:${testDir}`);
        }

        const cacheKey = `tests:${testDir}:${configPath || 'default'}:${structured ? 'structured' : 'flat'}`;

        if (!forceRefresh) {
          const cached = this.cache.get(cacheKey) as {
            total: number;
            files?: unknown;
            tests: unknown[];
            configValidation?: unknown;
          } | null;
          if (cached) {
            res.json(cached);
            return;
          }
        }

        if (structured) {
          const result = await this.testDiscovery.discoverTestsStructured(
            testDir,
            configPath,
            !forceRefresh
          );

          if (result.configValidation && !result.configValidation.valid) {
            const response = {
              total: 0,
              files: [],
              tests: [],
              configValidation: result.configValidation,
              error: result.configValidation.error,
            };
            this.cache.set(cacheKey, response);
            res.json(response);
            return;
          }

          if (result.error) {
            const response = {
              total: 0,
              files: [],
              tests: [],
              configValidation: result.configValidation,
              error: result.error,
              rawOutput: result.rawOutput,
            };
            this.cache.set(cacheKey, response);
            res.json(response);
            return;
          }

          const response = {
            total: result.tests.length,
            files: result.files,
            tests: result.tests.map((t) => ({
              id: t.id,
              title: t.title,
              fullTitle: t.fullTitle,
              file: t.file,
              line: t.line,
              column: t.column,
              tags: t.tags,
              annotations: t.annotations,
            })),
            configValidation: result.configValidation,
          };
          this.cache.set(cacheKey, response);
          res.json(response);
        } else {
          const result = await this.testDiscovery.discoverTestsStructured(
            testDir,
            configPath,
            !forceRefresh
          );

          if (result.configValidation && !result.configValidation.valid) {
            const response = {
              total: 0,
              tests: [],
              configValidation: result.configValidation,
              error: result.configValidation.error,
            };
            this.cache.set(cacheKey, response);
            res.json(response);
            return;
          }

          if (result.error) {
            const response = {
              total: 0,
              tests: [],
              configValidation: result.configValidation,
              error: result.error,
              rawOutput: result.rawOutput,
            };
            this.cache.set(cacheKey, response);
            res.json(response);
            return;
          }

          const response = {
            total: result.tests.length,
            tests: result.tests.map((t) => ({
              id: t.id,
              title: t.title,
              fullTitle: t.fullTitle,
              file: t.file,
              line: t.line,
              column: t.column,
              tags: t.tags,
              annotations: t.annotations,
            })),
            configValidation: result.configValidation,
          };
          this.cache.set(cacheKey, response);
          res.json(response);
        }
      } catch (error: unknown) {
        this.log.error('Failed to discover tests', error instanceof Error ? error : undefined);
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    v1Router.get('/tests/stats', async (req: Request, res: Response) => {
      try {
        const testDir = (req.query.testDir as string) || this.testDir;
        if (!isPathSafe(testDir)) {
          res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }

        const stats = await this.testDiscovery.getTestStats(testDir);
        res.json(stats);
      } catch (error: unknown) {
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    v1Router.post('/tests/refresh', async (req: Request, res: Response) => {
      try {
        this.cache.invalidate('tests:');
        this.testDiscovery.invalidateCache();
        const testDir = req.body?.testDir || this.testDir;
        const configPath = req.body?.configPath;

        const result = await this.testDiscovery.discoverTestsStructured(testDir, configPath, false);
        const response = {
          total: result.tests.length,
          files: result.files,
          tests: result.tests.map((t) => ({
            id: t.id,
            title: t.title,
            fullTitle: t.fullTitle,
            file: t.file,
            line: t.line,
            column: t.column,
            tags: t.tags,
            annotations: t.annotations,
          })),
        };

        const cacheKey = `tests:${testDir}:${configPath || 'default'}:structured`;
        this.cache.set(cacheKey, response);

        res.json({
          success: true,
          message: 'Tests cache refreshed',
          total: result.tests.length,
        });
      } catch (error: unknown) {
        this.log.error('Failed to refresh tests', error instanceof Error ? error : undefined);
        res.status(500).json({ error: getErrorMessage(error) });
      }
    });

    v1Router.post(
      '/runs',
      validateBody(StartRunRequestSchema),
      asyncHandler(async (req: Request, res: Response) => {
        if (this.executor?.isCurrentlyRunning()) {
          res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
          return;
        }

        const runOptions = req.body;
        const fileConfig = await loadConfigFile();

        const testDir = runOptions.testDir || this.testDir || fileConfig?.testDir || './';
        if (!isPathSafe(testDir)) {
          res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }

        const version = runOptions.version || '1.0.0';

        const config: TestConfig = mergeConfig(fileConfig, {
          version,
          testDir,
          outputDir: this.outputDir,
          baseURL: runOptions.baseURL || fileConfig?.baseURL,
          retries: runOptions.retries ?? fileConfig?.retries ?? 0,
          timeout: runOptions.timeout ?? fileConfig?.timeout ?? 30000,
          workers: runOptions.workers ?? fileConfig?.workers ?? 1,
          shards: runOptions.shards ?? fileConfig?.shards ?? 1,
          browsers: runOptions.browsers || fileConfig?.browsers || ['chromium'],
          htmlReport: true,
        });

        this.executor = new Executor(config, this.storage, this.flakyManager);

        this.executor.on('run_started', async (data) => {
          this.realtimeReporter.broadcastRunStarted(data.runId, config.version, 0);
          try {
            const report = await this.reporter.createPendingReport(data.runId, config.version);
            this.realtimeReporter.broadcastReportCreated(report);
          } catch (error) {
            this.log.warn(
              `Failed to create pending report: ${error instanceof Error ? error.message : String(error)}`
            );
            this.realtimeReporter.broadcastReportCreated({
              id: data.runId,
              version: config.version,
              status: 'running',
              startTime: Date.now(),
              suites: [],
              totalTests: 0,
              passed: 0,
              failed: 0,
              skipped: 0,
              flakyTests: [],
              metadata: {},
            });
          }
          this.log.info(`Run started via API: ${data.runId}`);
        });

        this.executor.on('output', (data) => {
          this.realtimeReporter.broadcastLog(data.runId || '', data.data, data.type);
        });

        this.executor.on('run_progress', (progress) => {
          this.realtimeReporter.broadcastRunProgress(progress.runId, {
            currentTest: progress.currentTest,
            totalTests: progress.totalTests,
            passed: progress.passed,
            failed: progress.failed,
            skipped: progress.skipped,
          });
        });

        this.executor.on('test_result', async (result) => {
          const suiteName = result.fullTitle?.split(' > ').slice(0, -1).join(' > ') || 'Test Suite';
          const runId = this.executor?.currentRun?.id || '';

          await this.reporter.updatePendingReport(runId, result, suiteName);

          this.realtimeReporter.broadcastTestResult(runId, result);

          const pendingReport = this.reporter.getPendingReport(runId);
          if (pendingReport) {
            this.realtimeReporter.broadcastReportUpdated(runId, {
              totalTests: pendingReport.totalTests,
              passed: pendingReport.passed,
              failed: pendingReport.failed,
              skipped: pendingReport.skipped,
              status: 'running',
              testResult: result,
            });
          }
        });

        this.executor.on('run_completed', async (result: RunResult) => {
          const status = result.status === 'success' ? 'success' : 'failed';

          try {
            await this.reporter.finalizePendingReport(result.id, status);
          } catch (error) {
            this.log.warn(
              `Failed to finalize pending report, generating new report: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            await this.reporter.generateReport(result);
          }

          this.realtimeReporter.broadcastRunProgress(result.id, {
            totalTests: result.totalTests,
          });
          this.realtimeReporter.broadcastRunCompleted(result.id, result);

          await this.flakyManager.recordRunResults(result);
          this.reporter.clearCache();
          this.cache.invalidate('runs');
          this.cache.invalidate('health:');
          this.log.info(
            `Run completed via API: ${result.id} (${result.passed}/${result.totalTests} passed)`
          );
        });

        this.executor.on('error', (data) => {
          this.realtimeReporter.broadcastError(data.runId, data.error);
        });

        const executeOptions: {
          grepPattern?: string;
          tagFilter?: string[];
          projectFilter?: string;
          updateSnapshots?: boolean;
          testFiles?: string[];
          testLocations?: string[];
        } = {};

        if (
          runOptions.testLocations &&
          Array.isArray(runOptions.testLocations) &&
          runOptions.testLocations.length > 0
        ) {
          executeOptions.testLocations = runOptions.testLocations;
          this.log.info(
            `Running ${runOptions.testLocations.length} test locations: ${runOptions.testLocations.join(', ')}`
          );
        } else if (
          runOptions.testFiles &&
          Array.isArray(runOptions.testFiles) &&
          runOptions.testFiles.length > 0
        ) {
          executeOptions.testFiles = runOptions.testFiles;
          this.log.info(
            `Running ${runOptions.testFiles.length} test files: ${runOptions.testFiles.join(', ')}`
          );
        } else if (runOptions.describePattern) {
          executeOptions.grepPattern = runOptions.describePattern;
          this.log.info(`Running describe block with pattern: ${runOptions.describePattern}`);
        } else if (
          runOptions.testIds &&
          Array.isArray(runOptions.testIds) &&
          runOptions.testIds.length > 0
        ) {
          const testIds = runOptions.testIds as string[];
          const testDir = config.testDir || './';
          const discoveredTests = await this.testDiscovery.discoverTests(testDir);

          const testLocations: string[] = [];
          const notFoundIds: string[] = [];

          for (const testId of testIds) {
            const discovered = discoveredTests.find((t) => t.id === testId);
            if (discovered) {
              testLocations.push(`${discovered.file}:${discovered.line}`);
            } else {
              notFoundIds.push(testId);
            }
          }

          if (testLocations.length > 0) {
            executeOptions.testLocations = testLocations;
            this.log.info(
              `Running ${testLocations.length} tests at locations: ${testLocations.slice(0, 5).join(', ')}${testLocations.length > 5 ? '...' : ''}`
            );
          }

          if (notFoundIds.length > 0) {
            this.log.warn(`${notFoundIds.length} test IDs not found in discovery results`);
          }
        }

        if (runOptions.grepPattern) {
          executeOptions.grepPattern = runOptions.grepPattern;
        }
        if (runOptions.tagFilter) {
          executeOptions.tagFilter = runOptions.tagFilter;
        }
        if (runOptions.projectFilter) {
          executeOptions.projectFilter = runOptions.projectFilter;
        }
        if (runOptions.updateSnapshots) {
          executeOptions.updateSnapshots = runOptions.updateSnapshots;
        }

        res.json({ status: 'started', message: 'Test execution initiated' });

        this.executor.execute(executeOptions).catch((err) => {
          this.log.error('Execution error', err);
          this.realtimeReporter.broadcastError('unknown', err.message);
        });
      })
    );

    v1Router.post(
      '/runs/stop',
      asyncHandler(async (req: Request, res: Response) => {
        if (!this.executor?.isCurrentlyRunning()) {
          res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No execution is currently running' });
          return;
        }
        await this.executor.cancel();
        res.json({ status: 'stopping', message: 'Execution cancellation requested' });
      })
    );

    v1Router.get('/runs/status', async (req: Request, res: Response) => {
      const status = this.executor?.isCurrentlyRunning() || false;
      const currentRun = this.executor ? await this.executor.getCurrentStatus() : null;
      res.json({
        isRunning: status,
        currentRun: currentRun
          ? {
              id: currentRun.id || null,
              version: this.executor!.getConfig().version,
            }
          : null,
      });
    });

    v1Router.get(
      '/stats',
      asyncHandler(async (req: Request, res: Response) => {
        const cached = this.cache.get('stats') as DashboardStats | null;
        if (cached) {
          res.json(cached);
          return;
        }

        const dashboard = await this.reporter.generateDashboard();
        const flakyStats = this.flakyManager.getQuarantineStats();
        const stats: DashboardStats = {
          ...dashboard,
          quarantinedTests: flakyStats.quarantined,
        };
        this.cache.set('stats', stats);
        res.json(stats);
      })
    );

    v1Router.get(
      '/runs',
      asyncHandler(async (req: Request, res: Response) => {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));

        const cacheKey = `runs:all`;
        let allRuns = this.cache.get(cacheKey) as RunResult[] | null;

        if (!allRuns) {
          allRuns = await this.reporter.getAllReports();
          this.cache.set(cacheKey, allRuns);
        }

        const total = allRuns.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedRuns = allRuns.slice().reverse().slice(startIndex, endIndex);

        const response: PaginatedResponse<RunResult> = {
          data: paginatedRuns,
          pagination: {
            page,
            pageSize,
            total,
            totalPages,
          },
        };

        res.json(response);
      })
    );

    v1Router.get(
      '/runs/:id',
      asyncHandler(async (req: Request, res: Response) => {
        const run = await this.reporter.getReport(req.params.id);
        if (!run) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
          return;
        }
        res.json(run);
      })
    );

    v1Router.get(
      '/runs/:id/raw',
      asyncHandler(async (req: Request, res: Response) => {
        const runId = req.params.id;

        let rawReport: Record<string, unknown> | null = null;
        let htmlReportUrl: string | null = null;

        const htmlReportPath = path.resolve(this.outputDir, 'html-reports', runId);
        if (fs.existsSync(htmlReportPath)) {
          htmlReportUrl = `/html-reports/${runId}/index.html`;
          this.log.info(`Found HTML report for run ${runId} at ${htmlReportPath}`);
        }

        const runReportPath = path.resolve(this.outputDir, `${runId}.json`);
        if (fs.existsSync(runReportPath)) {
          try {
            rawReport = await this.storage.readJSON(runReportPath);
            this.log.info(`Loaded run report from ${runReportPath}`);
          } catch (error) {
            this.log.warn(`Failed to read run report: ${error}`);
          }
        }

        if (!rawReport) {
          const latestJsonPath = path.resolve(this.outputDir, 'results.json');
          if (fs.existsSync(latestJsonPath)) {
            try {
              rawReport = await this.storage.readJSON(latestJsonPath);
              this.log.info(`Loaded latest Playwright report from ${latestJsonPath}`);
            } catch (error) {
              this.log.warn(`Failed to read latest report: ${error}`);
            }
          }
        }

        if (!rawReport) {
          res.status(HTTP_STATUS.NOT_FOUND).json({
            error: 'Raw report not found',
            hint: 'Run tests first to generate the report',
          });
          return;
        }

        const processAttachmentPath = (attachmentPath: string): string => {
          if (!attachmentPath) {
            return attachmentPath;
          }

          const normalizedPath = attachmentPath.replace(/\\/g, '/');

          if (normalizedPath.includes('test-sandbox/artifacts')) {
            return normalizedPath.replace(/^.*test-sandbox\/artifacts/, '/artifacts');
          } else if (normalizedPath.includes('test-sandbox/reports')) {
            return normalizedPath.replace(/^.*test-sandbox\/reports/, '/html-reports');
          } else if (normalizedPath.includes(this.outputDir.replace(/\\/g, '/'))) {
            const normalizedOutputDir = this.outputDir.replace(/\\/g, '/');
            const relativePath = normalizedPath.replace(normalizedOutputDir, '');
            if (relativePath.startsWith('/html-reports')) {
              return relativePath;
            } else {
              return `/artifacts${relativePath}`;
            }
          }

          return attachmentPath;
        };

        if (rawReport.suites && Array.isArray(rawReport.suites)) {
          const processSuite = (suite: Record<string, unknown>): Record<string, unknown> => {
            const processedSuite = { ...suite };

            if (processedSuite.specs && Array.isArray(processedSuite.specs)) {
              processedSuite.specs = processedSuite.specs.map((spec: unknown) => {
                const typedSpec = spec as Record<string, unknown>;
                if (typedSpec.tests && Array.isArray(typedSpec.tests)) {
                  typedSpec.tests = typedSpec.tests.map((test: unknown) => {
                    const typedTest = test as Record<string, unknown>;
                    if (typedTest.results && Array.isArray(typedTest.results)) {
                      typedTest.results = typedTest.results.map((result: unknown) => {
                        const typedResult = result as Record<string, unknown>;
                        if (typedResult.attachments && Array.isArray(typedResult.attachments)) {
                          typedResult.attachments = typedResult.attachments.map(
                            (attachment: unknown) => {
                              const typedAttachment = attachment as Record<string, unknown>;
                              return {
                                ...typedAttachment,
                                path: processAttachmentPath(typedAttachment.path as string),
                              };
                            }
                          );
                        }
                        return typedResult;
                      });
                    }
                    return typedTest;
                  });
                }
                return typedSpec;
              });
            }

            if (processedSuite.tests && Array.isArray(processedSuite.tests)) {
              processedSuite.tests = processedSuite.tests.map((test: unknown) => {
                const typedTest = test as Record<string, unknown>;
                if (typedTest.screenshots && Array.isArray(typedTest.screenshots)) {
                  typedTest.screenshots = typedTest.screenshots.map(processAttachmentPath);
                }
                if (typedTest.videos && Array.isArray(typedTest.videos)) {
                  typedTest.videos = typedTest.videos.map(processAttachmentPath);
                }
                if (typedTest.traces && Array.isArray(typedTest.traces)) {
                  typedTest.traces = typedTest.traces.map(processAttachmentPath);
                }
                return typedTest;
              });
            }

            if (processedSuite.suites && Array.isArray(processedSuite.suites)) {
              processedSuite.suites = processedSuite.suites.map(processSuite);
            }

            return processedSuite;
          };

          rawReport.suites = rawReport.suites.map(processSuite);
        }

        res.json({
          ...rawReport,
          htmlReportUrl,
        });
      })
    );

    v1Router.delete(
      '/runs/:id',
      asyncHandler(async (req: Request, res: Response) => {
        const report = await this.reporter.getReport(req.params.id);
        const success = await this.reporter.deleteReport(req.params.id);
        if (!success) {
          res
            .status(HTTP_STATUS.NOT_FOUND)
            .json({ error: 'Run not found or could not be deleted' });
          return;
        }
        if (report) {
          for (const suite of report.suites) {
            for (const test of suite.tests) {
              await this.flakyManager.clearHistory(test.id);
            }
          }
        }
        this.cache.invalidate('runs');
        this.cache.invalidate('flaky');
        res.json({ success: true, message: `Report ${req.params.id} deleted` });
      })
    );

    v1Router.post(
      '/runs/:runId/tests/:testId/rerun',
      asyncHandler(async (req: Request, res: Response) => {
        const { runId, testId } = req.params;
        const { testLocation } = req.body;

        if (!testLocation) {
          res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'testLocation is required' });
          return;
        }

        const report = await this.reporter.getReport(runId);
        if (!report) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
          return;
        }

        let testInfo: { file?: string; line?: number } | null = null;
        for (const suite of report.suites) {
          const test = suite.tests.find((t) => t.id === testId);
          if (test) {
            testInfo = { file: test.file, line: test.line };
            break;
          }
        }

        if (!testInfo || !testInfo.file || !testInfo.line) {
          res
            .status(HTTP_STATUS.NOT_FOUND)
            .json({ error: 'Test not found or missing file/line info' });
          return;
        }

        if (this.executor?.isCurrentlyRunning()) {
          res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
          return;
        }

        const fileConfig = await loadConfigFile();
        const config: TestConfig = mergeConfig(fileConfig, {
          version: report.version,
          testDir: this.testDir,
          outputDir: this.outputDir,
          retries: 0,
          timeout: fileConfig?.timeout ?? 30000,
          workers: 1,
          browsers: ['chromium'],
          htmlReport: false,
          parentRunId: runId,
        });

        this.executor = new Executor(config, this.storage, this.flakyManager);

        let testResult: TestResult | null = null;

        this.executor.on('test_result', (result) => {
          if (
            result.id === testId ||
            (testInfo && result.file === testInfo.file && result.line === testInfo.line)
          ) {
            testResult = result;
          }
        });

        res.json({ status: 'started', message: 'Test rerun initiated' });

        try {
          await this.executor.execute({
            testLocations: [testLocation],
            parentRunId: runId,
          });

          if (testResult) {
            const updated = await this.reporter.updateTestResult(runId, testId, testResult);
            if (updated) {
              const updatedReport = await this.reporter.getReport(runId);
              if (updatedReport) {
                const updatedTest = updatedReport.suites
                  .flatMap((s) => s.tests)
                  .find((t) => t.id === testId);
                const narrowedResult = testResult as TestResult;
                this.realtimeReporter.broadcastReportUpdated(runId, {
                  totalTests: updatedReport.totalTests,
                  passed: updatedReport.passed,
                  failed: updatedReport.failed,
                  skipped: updatedReport.skipped,
                  status: 'completed',
                  testResult: updatedTest
                    ? {
                        ...narrowedResult,
                        manualReruns: updatedTest.manualReruns,
                        runHistory: updatedTest.runHistory,
                      }
                    : narrowedResult,
                });
              }
              this.log.info(`Test rerun completed and report updated: ${testId}`);
            } else {
              this.log.warn(`Failed to update test result in report: ${testId}`);
            }
          } else {
            this.log.warn(`Test result not found after rerun: ${testId}`);
          }

          this.cache.invalidate('runs');
        } catch (error: unknown) {
          this.log.error('Test rerun failed', error instanceof Error ? error : undefined);
          this.realtimeReporter.broadcastError(
            runId,
            error instanceof Error ? error.message : 'Unknown error'
          );
        }
      })
    );

    v1Router.delete(
      '/runs',
      asyncHandler(async (req: Request, res: Response) => {
        const count = await this.reporter.deleteAllReports();
        await this.flakyManager.clearHistory();
        this.cache.invalidate('runs');
        this.cache.invalidate('flaky');
        res.json({ success: true, message: `Deleted ${count} reports`, count });
      })
    );

    v1Router.get(
      '/flaky',
      asyncHandler(async (req: Request, res: Response) => {
        const threshold = parseFloat(req.query.threshold as string) || 0.3;
        const flakyTests = this.flakyManager.getFlakyTests(threshold);
        res.json(flakyTests);
      })
    );

    v1Router.get(
      '/flaky/quarantined',
      asyncHandler(async (req: Request, res: Response) => {
        const quarantined = this.flakyManager.getQuarantinedTests();
        res.json(quarantined);
      })
    );

    v1Router.post(
      '/flaky/:testId/quarantine',
      asyncHandler(async (req: Request, res: Response) => {
        const success = await this.flakyManager.quarantineTest(req.params.testId);
        res.json({ success, testId: req.params.testId });
      })
    );

    v1Router.post(
      '/flaky/:testId/release',
      asyncHandler(async (req: Request, res: Response) => {
        const { resetHistory } = req.body || {};
        const success = await this.flakyManager.releaseTest(req.params.testId, { resetHistory });
        res.json({ success, testId: req.params.testId });
      })
    );

    v1Router.post(
      '/flaky/:testId/validate-release',
      asyncHandler(async (req: Request, res: Response) => {
        const testId = req.params.testId;
        const flakyTest = this.flakyManager.getTestById(testId);

        if (!flakyTest) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found in flaky history' });
          return;
        }

        if (!this.flakyManager.isQuarantined(testId)) {
          res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Test is not quarantined' });
          return;
        }

        if (this.executor?.isCurrentlyRunning()) {
          res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
          return;
        }

        const fileConfig = await loadConfigFile();
        const config: TestConfig = mergeConfig(fileConfig, {
          testDir: this.testDir,
          outputDir: this.outputDir,
          retries: 0,
          workers: 1,
          browsers: ['chromium'],
          htmlReport: false,
        });

        this.executor = new Executor(config, this.storage, this.flakyManager);

        const validationState: { result: 'passed' | 'failed' | 'unknown' } = { result: 'unknown' };

        this.executor.on('run_completed', (runResult: RunResult) => {
          const testResult = runResult.suites.flatMap((s) => s.tests).find((t) => t.id === testId);
          if (testResult) {
            validationState.result = testResult.status === 'passed' ? 'passed' : 'failed';
          }
        });

        res.json({ status: 'started', message: 'Validation run initiated', testId });

        try {
          await this.executor.execute();
          this.cache.invalidate('runs');

          if (validationState.result === 'passed') {
            await this.flakyManager.releaseTest(testId, { resetHistory: true });
            this.realtimeReporter.broadcastQuarantineUpdated(testId, 'validated_released', {
              validationResult: validationState.result,
            });
          }
        } catch (error: unknown) {
          this.log.error('Validation run failed', error instanceof Error ? error : undefined);
        }
      })
    );

    v1Router.get(
      '/flaky/stats',
      asyncHandler(async (req: Request, res: Response) => {
        const stats = this.flakyManager.getQuarantineStats();
        res.json(stats);
      })
    );

    v1Router.delete(
      '/flaky/history',
      asyncHandler(async (req: Request, res: Response) => {
        await this.flakyManager.clearHistory();
        this.cache.invalidate('flaky');
        res.json({ success: true, message: 'Flaky test history cleared' });
      })
    );

    v1Router.get(
      '/flaky/:testId/root-cause',
      asyncHandler(async (req: Request, res: Response) => {
        const analysis = await this.flakyManager.analyzeRootCause(req.params.testId);
        if (!analysis) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found or no history available' });
          return;
        }
        res.json(analysis);
      })
    );

    v1Router.get(
      '/flaky/correlations',
      asyncHandler(async (req: Request, res: Response) => {
        const groups = this.flakyManager.analyzeCorrelations();
        res.json(groups);
      })
    );

    v1Router.get(
      '/flaky/by-classification',
      asyncHandler(async (req: Request, res: Response) => {
        const classification = req.query.classification as string;
        if (!classification) {
          const stats = this.flakyManager.getQuarantineStats();
          res.json(stats.classificationBreakdown);
          return;
        }
        const tests = this.flakyManager.getTestsByClassification(classification as any);
        res.json(tests);
      })
    );

    v1Router.get(
      '/analysis/:runId',
      asyncHandler(async (req: Request, res: Response) => {
        const run = await this.reporter.getReport(req.params.runId);
        if (!run) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
          return;
        }
        const analysis = await this.reporter.analyzeFailures(run);
        res.json(analysis);
      })
    );

    v1Router.get(
      '/progress',
      asyncHandler(async (req: Request, res: Response) => {
        const progress = this.realtimeReporter.getAllProgress();
        res.json(progress);
      })
    );

    v1Router.get(
      '/progress/:runId',
      asyncHandler(async (req: Request, res: Response) => {
        const progress = this.realtimeReporter.getProgress(req.params.runId);
        if (!progress) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found or not running' });
          return;
        }
        res.json(progress);
      })
    );

    v1Router.get(
      '/traces',
      asyncHandler(async (req: Request, res: Response) => {
        const cacheKey = 'traces:all';
        const cached = this.cache.get(cacheKey) as Awaited<
          ReturnType<TraceManager['discoverTraces']>
        > | null;
        if (cached) {
          res.json(cached);
          return;
        }

        const traces = await this.traceManager.discoverTraces();
        this.cache.set(cacheKey, traces);
        res.json(traces);
      })
    );

    v1Router.get(
      '/traces/stats',
      asyncHandler(async (req: Request, res: Response) => {
        const cacheKey = 'traces:stats';
        const cached = this.cache.get(cacheKey) as Awaited<
          ReturnType<TraceManager['getTraceStats']>
        > | null;
        if (cached) {
          res.json(cached);
          return;
        }

        const stats = await this.traceManager.getTraceStats();
        this.cache.set(cacheKey, stats);
        res.json(stats);
      })
    );

    v1Router.get(
      '/artifacts',
      asyncHandler(async (req: Request, res: Response) => {
        const runId = req.query.runId as string;
        const cacheKey = `artifacts:${runId || 'all'}`;
        const cached = this.cache.get(cacheKey) as Awaited<
          ReturnType<ArtifactManager['discoverArtifacts']>
        > | null;
        if (cached) {
          res.json(cached);
          return;
        }

        const artifacts = await this.artifactManager.discoverArtifacts(runId);
        this.cache.set(cacheKey, artifacts);
        res.json(artifacts);
      })
    );

    v1Router.get(
      '/artifacts/:id',
      asyncHandler(async (req: Request, res: Response) => {
        const content = await this.artifactManager.getArtifactContent(req.params.id);
        if (!content) {
          res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Artifact not found' });
          return;
        }
        res.send(content);
      })
    );

    v1Router.get(
      '/artifacts/stats',
      asyncHandler(async (req: Request, res: Response) => {
        const cacheKey = 'artifacts:stats';
        const cached = this.cache.get(cacheKey) as Awaited<
          ReturnType<ArtifactManager['getArtifactStats']>
        > | null;
        if (cached) {
          res.json(cached);
          return;
        }

        const stats = await this.artifactManager.getArtifactStats();
        this.cache.set(cacheKey, stats);
        res.json(stats);
      })
    );

    v1Router.get(
      '/annotations',
      asyncHandler(async (req: Request, res: Response) => {
        const testDir = (req.query.testDir as string) || this.testDir;
        if (!isPathSafe(testDir)) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }
        const annotations = await this.annotationManager.scanDirectory(testDir);
        res.json(annotations);
      })
    );

    v1Router.get(
      '/annotations/summary',
      asyncHandler(async (req: Request, res: Response) => {
        const testDir = (req.query.testDir as string) || this.testDir;
        if (!isPathSafe(testDir)) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }
        await this.annotationManager.scanDirectory(testDir);
        const summary = this.annotationManager.getSummary();
        res.json(summary);
      })
    );

    v1Router.get(
      '/tags',
      asyncHandler(async (req: Request, res: Response) => {
        const testDir = (req.query.testDir as string) || this.testDir;
        if (!isPathSafe(testDir)) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }
        const tags = await this.tagManager.scanDirectory(testDir);
        res.json(tags);
      })
    );

    v1Router.get(
      '/tags/summary',
      asyncHandler(async (req: Request, res: Response) => {
        const testDir = (req.query.testDir as string) || this.testDir;
        if (!isPathSafe(testDir)) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }
        await this.tagManager.scanDirectory(testDir);
        const summary = this.tagManager.getSummary();
        res.json(summary);
      })
    );

    v1Router.get(
      '/visual/stats',
      asyncHandler(async (req: Request, res: Response) => {
        const summary = this.visualManager.getSummary();
        res.json(summary);
      })
    );

    v1Router.get(
      '/preferences',
      asyncHandler(async (req: Request, res: Response) => {
        const prefs = await this.storage.readJSON<Record<string, string>>(
          path.join(this.dataDir, 'user-preferences.json')
        );
        res.json(prefs || {});
      })
    );

    v1Router.post(
      '/preferences',
      validateBody(SavePreferencesRequestSchema),
      asyncHandler(async (req: Request, res: Response) => {
        const existing =
          (await this.storage.readJSON<Record<string, string>>(
            path.join(this.dataDir, 'user-preferences.json')
          )) || {};
        const merged = { ...existing, ...req.body };
        await this.storage.writeJSON(path.join(this.dataDir, 'user-preferences.json'), merged);
        res.json(merged);
      })
    );

    v1Router.post(
      '/testdir',
      validateBody(SetTestDirRequestSchema),
      asyncHandler(async (req: Request, res: Response) => {
        const { testDir } = req.body;

        if (!isPathSafe(testDir)) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'Invalid testDir: path traversal is not allowed' });
          return;
        }

        const validationResult = await this.testDiscovery.validateProjectPath(testDir);

        if (!validationResult.valid) {
          this.invalidateAllCache();
          res.status(HTTP_STATUS.BAD_REQUEST).json({
            error: validationResult.error,
            configExists: validationResult.configExists,
            path: path.resolve(testDir),
          });
          return;
        }

        await this.updatePathsForTestDir(testDir);

        try {
          const existing =
            (await this.storage.readJSON<Record<string, string>>(
              path.join(this.dataDir, 'user-preferences.json')
            )) || {};
          const merged = { ...existing, testDir };
          await this.storage.writeJSON(path.join(this.dataDir, 'user-preferences.json'), merged);
        } catch (prefError) {
          this.log.warn(
            `Failed to save preferences: ${prefError instanceof Error ? prefError.message : String(prefError)}`
          );
        }

        res.json({
          success: true,
          testDir,
          resolvedPath: validationResult.testDirAbsolute,
          configPath: validationResult.configPath,
          configExists: validationResult.configExists,
          warnings: validationResult.warnings,
        });
      })
    );

    v1Router.get(
      '/testdir/validate',
      asyncHandler(async (req: Request, res: Response) => {
        const testDir = req.query.testDir as string;

        if (!testDir) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'testDir query parameter is required' });
          return;
        }

        if (!isPathSafe(testDir)) {
          res.status(HTTP_STATUS.BAD_REQUEST).json({
            valid: false,
            error: 'Invalid testDir: path traversal is not allowed',
          });
          return;
        }

        const validationResult = await this.testDiscovery.validateProjectPath(testDir);

        res.json({
          valid: validationResult.valid,
          configPath: validationResult.configPath,
          configExists: validationResult.configExists,
          testDir: validationResult.testDir,
          testDirAbsolute: validationResult.testDirAbsolute,
          error: validationResult.error,
          warnings: validationResult.warnings,
        });
      })
    );

    v1Router.get(
      '/reports/paths',
      asyncHandler(async (req: Request, res: Response) => {
        const playwrightReportPath = path.resolve(this.outputDir, '../test-sandbox/reports');
        const artifactsPath = path.resolve(this.outputDir, '../test-sandbox/artifacts');

        res.json({
          playwrightReport: fs.existsSync(playwrightReportPath) ? '/playwright-report' : null,
          artifacts: fs.existsSync(artifactsPath) ? '/artifacts' : null,
          reportExists:
            fs.existsSync(playwrightReportPath) && fs.readdirSync(playwrightReportPath).length > 0,
        });
      })
    );

    v1Router.get(
      '/health/metrics',
      asyncHandler(async (req: Request, res: Response) => {
        const cacheKey = 'health:metrics';
        const cached = this.cache.get(cacheKey);

        if (cached) {
          res.json(cached);
          return;
        }

        const allRuns = await this.reporter.getAllReports();

        const metrics = allRuns.map((run, index) => {
          const date = new Date(run.startTime);
          const total = run.totalTests;
          const passed = run.passed;
          const failed = run.failed;
          const passRate = total > 0 ? (passed / total) * 100 : 0;

          const flakyTests = run.flakyTests || [];
          const flakyCount = flakyTests.length;
          const totalRuns = allRuns.length - index;
          const flakyRate = totalRuns > 0 ? flakyCount / totalRuns : 0;

          const metadata = run.metadata || {};
          const tags = metadata.tags ? metadata.tags.map((t: { name: string }) => t.name) : [];
          const branch = (metadata.branch as string) || 'main';

          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          const localDate = `${year}-${month}-${day} ${hours}:${minutes}`;

          return {
            date: localDate,
            timestamp: run.startTime,
            runStatus: {
              passed,
              failed,
              total,
              passRate,
            },
            runDuration: run.duration || 0,
            testSuiteSize: {
              total,
              passed,
              failed,
            },
            testFlakiness: {
              flakyCount,
              flakyRate,
              totalRuns,
            },
            tags: tags.length > 0 ? tags : ['default'],
            branch,
          };
        });

        this.cache.set(cacheKey, metrics);
        res.json(metrics);
      })
    );

    v1Router.get(
      '/health/tags',
      asyncHandler(async (req: Request, res: Response) => {
        const tags = ['smoke', 'regression', 'e2e', 'performance', 'security', 'accessibility'];
        res.json(tags);
      })
    );

    v1Router.get(
      '/health/branches',
      asyncHandler(async (req: Request, res: Response) => {
        const branches = ['main', 'develop', 'feature/new-ui', 'hotfix/login', 'release/v1.0'];
        res.json(branches);
      })
    );

    v1Router.get(
      '/llm/config',
      asyncHandler(async (req: Request, res: Response) => {
        const config = this.diagnosisService.getMaskedConfig();
        res.json(config);
      })
    );

    v1Router.put(
      '/llm/config',
      asyncHandler(async (req: Request, res: Response) => {
        const config = req.body;
        await this.diagnosisService.saveConfig(config);
        const maskedConfig = this.diagnosisService.getMaskedConfig();
        res.json(maskedConfig);
      })
    );

    v1Router.get(
      '/llm/status',
      asyncHandler(async (req: Request, res: Response) => {
        const status = await this.diagnosisService.getStatus();
        res.json(status);
      })
    );

    v1Router.post(
      '/llm/test-connection',
      asyncHandler(async (req: Request, res: Response) => {
        const config = req.body;
        const result = await this.diagnosisService.testConnection(config);
        res.json(result);
      })
    );

    v1Router.post(
      '/diagnosis',
      asyncHandler(async (req: Request, res: Response) => {
        const {
          testTitle,
          error,
          stackTrace,
          file,
          line,
          lang,
          screenshots,
          logs,
          browser,
          runId,
        } = req.body;

        const config = this.diagnosisService.getMaskedConfig();
        if (!config.enabled || !config.baseUrl || !config.model) {
          res.json({ enabled: false, diagnosis: null });
          return;
        }

        let enrichedScreenshots = screenshots as string[] | undefined;
        let enrichedLogs = logs as string[] | undefined;
        let enrichedStackTrace = stackTrace as string | undefined;
        let enrichedBrowser = browser as string | undefined;

        if (runId) {
          const historicalTest = await this.findTestInfoByRunId(runId, testTitle, file, line);
          if (historicalTest) {
            enrichedScreenshots = enrichedScreenshots || historicalTest.screenshots;
            enrichedLogs = enrichedLogs || historicalTest.logs;
            enrichedStackTrace = enrichedStackTrace || historicalTest.stackTrace;
            enrichedBrowser = enrichedBrowser || historicalTest.browser;
          }
        }

        try {
          const diagnosis = await this.diagnosisService.diagnose(
            {
              title: testTitle,
              error,
              stackTrace: enrichedStackTrace,
              filePath: file,
              lineNumber: line,
              screenshots: enrichedScreenshots,
              logs: enrichedLogs,
              browser: enrichedBrowser,
            },
            lang || 'zh'
          );
          res.json({ enabled: true, diagnosis });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.json({ enabled: true, diagnosis: null, error: errorMessage });
        }
      })
    );

    v1Router.post(
      '/diagnosis/stream',
      asyncHandler(async (req: Request, res: Response) => {
        const {
          testTitle,
          error,
          stackTrace,
          file,
          line,
          lang,
          screenshots,
          logs,
          browser,
          runId,
        } = req.body;

        const config = this.diagnosisService.getMaskedConfig();
        if (!config.enabled || !config.baseUrl || !config.model) {
          res.json({ enabled: false, diagnosis: null });
          return;
        }

        let enrichedScreenshots = screenshots as string[] | undefined;
        let enrichedLogs = logs as string[] | undefined;
        let enrichedStackTrace = stackTrace as string | undefined;
        let enrichedBrowser = browser as string | undefined;

        if (runId) {
          const historicalTest = await this.findTestInfoByRunId(runId, testTitle, file, line);
          if (historicalTest) {
            enrichedScreenshots = enrichedScreenshots || historicalTest.screenshots;
            enrichedLogs = enrichedLogs || historicalTest.logs;
            enrichedStackTrace = enrichedStackTrace || historicalTest.stackTrace;
            enrichedBrowser = enrichedBrowser || historicalTest.browser;
          }
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        try {
          const stream = this.diagnosisService.diagnoseStream(
            {
              title: testTitle,
              error,
              stackTrace: enrichedStackTrace,
              filePath: file,
              lineNumber: line,
              screenshots: enrichedScreenshots,
              logs: enrichedLogs,
              browser: enrichedBrowser,
            },
            lang || 'zh'
          );

          for await (const chunk of stream) {
            res.write(`data: ${chunk}\n\n`);
          }

          res.end();
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
          res.end();
        }
      })
    );

    /**
     * 批量聚类诊断端点
     * 接收多个测试结果，基于错误相似度进行聚类，然后对每个聚类的代表测试执行 AI 诊断
     * 返回聚类结果及每个聚类的诊断信息
     */
    v1Router.post(
      '/diagnosis/cluster',
      asyncHandler(async (req: Request, res: Response) => {
        const { testResults, lang } = req.body;

        if (!Array.isArray(testResults)) {
          res.status(400).json({ error: 'testResults must be an array' });
          return;
        }

        const config = this.diagnosisService.getMaskedConfig();
        if (!config.enabled || !config.baseUrl || !config.model) {
          res.json({ enabled: false, clusters: [] });
          return;
        }

        try {
          const { clusterFailures } = await import('../diagnosis/cluster');
          const clusters = clusterFailures(testResults);

          const diagnoses = [];
          for (const cluster of clusters) {
            const representative = testResults.find(
              (t: any) => t.id === cluster.representativeTestId
            );
            if (representative) {
              const diagnosis = await this.diagnosisService.diagnose(
                {
                  title: representative.title || representative.name || '',
                  error: representative.error,
                  stackTrace: representative.stackTrace,
                  filePath: representative.file,
                  lineNumber: representative.line,
                  screenshots: representative.screenshots,
                  logs: representative.logs,
                  browser: representative.browser,
                },
                lang || 'zh'
              );
              diagnoses.push({
                clusterId: cluster.clusterId,
                category: cluster.category,
                testIds: cluster.testIds,
                similarity: cluster.similarity,
                diagnosis: {
                  ...diagnosis,
                  relatedFailures: cluster.testIds.filter(
                    (id: string) => id !== cluster.representativeTestId
                  ),
                },
              });
            }
          }

          res.json({ enabled: true, clusters: diagnoses });
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          res.status(500).json({ error: errorMessage });
        }
      })
    );

    this.app.use('/api/v1', v1Router);
    this.app.use(errorHandler);
  }

  /**
   * 根据 runId 和测试标识从历史运行结果中查找匹配的测试信息
   * 用于在诊断请求中补充更完整的测试上下文（如 screenshots、logs、stackTrace 等）
   * @param runId - 运行 ID
   * @param testTitle - 测试标题（优先匹配）
   * @param file - 测试文件路径
   * @param line - 测试行号
   * @returns 匹配到的 TestResult 或 null
   */
  private async findTestInfoByRunId(
    runId: string,
    testTitle?: string,
    file?: string,
    line?: number
  ): Promise<TestResult | null> {
    try {
      const run = await this.reporter.getReport(runId);
      if (!run) {
        return null;
      }

      for (const suite of run.suites) {
        const matched = suite.tests.find((t) => {
          if (testTitle && (t.title === testTitle || t.fullTitle === testTitle)) {
            return true;
          }
          if (file && line && t.file === file && t.line === line) {
            return true;
          }
          return false;
        });
        if (matched) {
          return matched;
        }
      }
    } catch (error) {
      this.log.warn(
        `Failed to load run result for runId=${runId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return null;
  }

  private async resolveTestDirFromPlaywrightConfig(): Promise<string> {
    const fileConfig = await loadConfigFile();
    if (fileConfig?.testDir) {
      return fileConfig.testDir;
    }
    return this.testDir;
  }

  private invalidateAllCache(): void {
    const startTime = Date.now();
    this.cache.invalidate('tests:');
    this.cache.invalidate('runs');
    this.cache.invalidate('stats');
    this.cache.invalidate('traces:');
    this.cache.invalidate('artifacts:');
    this.testDiscovery.invalidateCache();
    const duration = Date.now() - startTime;
    this.log.debug(`All caches invalidated in ${duration}ms`);
  }

  private async updatePathsForTestDir(testDir: string): Promise<void> {
    const absoluteDir = path.resolve(testDir);
    this.testDir = testDir;
    this.outputDir = path.join(absoluteDir, 'test-reports');
    this.dataDir = path.join(absoluteDir, 'test-data');

    try {
      await this.storage.mkdir(this.outputDir);
    } catch (e) {
      this.log.warn(
        `Failed to create outputDir ${this.outputDir}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    try {
      await this.storage.mkdir(this.dataDir);
    } catch (e) {
      this.log.warn(
        `Failed to create dataDir ${this.dataDir}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    this.reporter = new Reporter(this.outputDir, this.storage);
    this.flakyManager = new FlakyTestManager(this.dataDir, {}, this.storage);

    this.traceManager = new TraceManager(
      {
        enabled: true,
        mode: 'on',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      },
      path.join(absoluteDir, 'traces')
    );

    this.artifactManager = new ArtifactManager(
      { enabled: true, screenshots: 'on', videos: 'on' },
      path.join(absoluteDir, 'test-sandbox', 'artifacts')
    );

    this.visualManager = new VisualTestingManager(
      {
        enabled: true,
        threshold: 0.2,
        maxDiffPixelRatio: 0.01,
        maxDiffPixels: 10,
        updateSnapshots: false,
      },
      path.join(absoluteDir, 'visual-testing')
    );

    logger.init(this.dataDir);

    this.invalidateAllCache();

    this.log.info(
      `Paths updated for test directory: ${absoluteDir}\n` +
        `  outputDir: ${this.outputDir}\n` +
        `  dataDir: ${this.dataDir}\n` +
        `  traces: ${path.join(absoluteDir, 'traces')}\n` +
        `  artifacts: ${path.join(absoluteDir, 'test-sandbox', 'artifacts')}`
    );
  }

  private setupStaticFiles(): void {
    this.app.use('/html-reports', (req: Request, res: Response, next: NextFunction) => {
      const htmlReportsPath = path.resolve(this.outputDir, 'html-reports');
      if (fs.existsSync(htmlReportsPath)) {
        express.static(htmlReportsPath)(req, res, next);
      } else {
        next();
      }
    });

    this.app.use('/playwright-report', (req: Request, res: Response, next: NextFunction) => {
      const playwrightReportPath = path.resolve(this.outputDir, '../test-sandbox/reports');
      if (fs.existsSync(playwrightReportPath)) {
        express.static(playwrightReportPath)(req, res, next);
      } else {
        next();
      }
    });

    this.app.use('/artifacts', (req: Request, res: Response, next: NextFunction) => {
      const artifactsPath = path.resolve(this.outputDir, '../test-sandbox/artifacts');
      if (fs.existsSync(artifactsPath)) {
        express.static(artifactsPath)(req, res, next);
      } else {
        next();
      }
    });

    if (fs.existsSync(this.staticPath)) {
      this.app.use(express.static(this.staticPath));
      this.app.get('*', (req: Request, res: Response) => {
        res.sendFile(path.join(this.staticPath, 'index.html'));
      });
    } else {
      this.app.use(notFoundHandler);
    }
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      logger.init(this.dataDir);
      this.realtimeReporter.initialize(this.server);

      this.server.listen(this.port, () => {
        this.log.info(`Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    await logger.shutdown();
    this.realtimeReporter.shutdown();
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        this.log.info('Dashboard stopped');
        resolve();
      });
    });
  }

  getRealtimeReporter(): RealtimeReporter {
    return this.realtimeReporter;
  }

  getFlakyManager(): FlakyTestManager {
    return this.flakyManager;
  }

  getReporter(): Reporter {
    return this.reporter;
  }

  getExecutor(): Executor | null {
    return this.executor;
  }
}
