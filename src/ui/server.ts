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
import { Executor } from '../executor';
import { TestDiscovery, DiscoveredTest, DiscoveredDescribe, DiscoveredFile } from '../discovery';
import { DashboardStats, RunResult, TestConfig, getErrorMessage } from '../types';
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
import { Lang, setLang, getLang } from '../i18n';
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
  private executor: Executor | null = null;
  private port: number;
  private staticPath: string;
  private outputDir: string;
  private dataDir: string;
  private testDir: string;
  private log = logger.child('DashboardServer');
  private storage: StorageProvider;
  private testDiscovery: TestDiscovery;
  private cache: LRUCache<any>;

  constructor(
    port: number = 5274,
    outputDir: string = './test-reports',
    dataDir: string = './test-data'
  ) {
    this.port = port;
    this.outputDir = outputDir;
    this.dataDir = dataDir;
    this.testDir = './tests';
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
            files?: any;
            tests: any[];
            configValidation?: any;
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

        const testDir = runOptions.testDir || this.testDir || fileConfig?.testDir || './tests';
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

        this.executor.on('run_started', (data) => {
          this.realtimeReporter.broadcastRunStarted(data.runId, config.version);
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

        this.executor.on('test_result', (result) => {
          this.realtimeReporter.broadcastTestResult(
            this.executor?.currentRun?.id || config.version,
            result
          );
        });

        this.executor.on('run_completed', async (result: RunResult) => {
          this.realtimeReporter.broadcastRunProgress(result.id, {
            totalTests: result.totalTests,
          });
          this.realtimeReporter.broadcastRunCompleted(result.id, result);
          await this.reporter.generateReport(result);
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
          const testDir = config.testDir || './tests';
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

        let rawReport: any = null;
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
          const processSuite = (suite: any): any => {
            const processedSuite = { ...suite };

            if (processedSuite.specs && Array.isArray(processedSuite.specs)) {
              processedSuite.specs = processedSuite.specs.map((spec: any) => {
                if (spec.tests && Array.isArray(spec.tests)) {
                  spec.tests = spec.tests.map((test: any) => {
                    if (test.results && Array.isArray(test.results)) {
                      test.results = test.results.map((result: any) => {
                        if (result.attachments && Array.isArray(result.attachments)) {
                          result.attachments = result.attachments.map((attachment: any) => ({
                            ...attachment,
                            path: processAttachmentPath(attachment.path),
                          }));
                        }
                        return result;
                      });
                    }
                    return test;
                  });
                }
                return spec;
              });
            }

            if (processedSuite.tests && Array.isArray(processedSuite.tests)) {
              processedSuite.tests = processedSuite.tests.map((test: any) => {
                if (test.screenshots && Array.isArray(test.screenshots)) {
                  test.screenshots = test.screenshots.map(processAttachmentPath);
                }
                if (test.videos && Array.isArray(test.videos)) {
                  test.videos = test.videos.map(processAttachmentPath);
                }
                if (test.traces && Array.isArray(test.traces)) {
                  test.traces = test.traces.map(processAttachmentPath);
                }
                return test;
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
        const success = await this.reporter.deleteReport(req.params.id);
        if (!success) {
          res
            .status(HTTP_STATUS.NOT_FOUND)
            .json({ error: 'Run not found or could not be deleted' });
          return;
        }
        this.cache.invalidate('runs');
        res.json({ success: true, message: `Report ${req.params.id} deleted` });
      })
    );

    v1Router.delete(
      '/runs',
      asyncHandler(async (req: Request, res: Response) => {
        const count = await this.reporter.deleteAllReports();
        this.cache.invalidate('runs');
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
        const success = await this.flakyManager.releaseTest(req.params.testId);
        res.json({ success, testId: req.params.testId });
      })
    );

    v1Router.get(
      '/flaky/stats',
      asyncHandler(async (req: Request, res: Response) => {
        const stats = this.flakyManager.getQuarantineStats();
        res.json(stats);
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
          res.status(HTTP_STATUS.BAD_REQUEST).json({
            error: validationResult.error,
            configExists: validationResult.configExists,
            path: path.resolve(testDir),
          });
          return;
        }

        this.testDir = testDir;
        this.cache.invalidate('tests:');
        this.testDiscovery.invalidateCache();

        const existing =
          (await this.storage.readJSON<Record<string, string>>(
            path.join(this.dataDir, 'user-preferences.json')
          )) || {};
        const merged = { ...existing, testDir };
        await this.storage.writeJSON(path.join(this.dataDir, 'user-preferences.json'), merged);

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
          const tags = metadata.tags ? metadata.tags.map((t: any) => t.name) : [];
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

    this.app.use('/api/v1', v1Router);
    this.app.use(errorHandler);
  }

  private async resolveTestDirFromPlaywrightConfig(): Promise<string> {
    const fileConfig = await loadConfigFile();
    if (fileConfig?.testDir) {
      return fileConfig.testDir;
    }
    return this.testDir;
  }

  private setupStaticFiles(): void {
    const htmlReportsPath = path.resolve(this.outputDir, 'html-reports');
    if (fs.existsSync(htmlReportsPath)) {
      this.app.use('/html-reports', express.static(htmlReportsPath));
      this.log.info(`HTML reports available at http://localhost:${this.port}/html-reports`);
    }

    const playwrightReportPath = path.resolve(this.outputDir, '../test-sandbox/reports');
    if (fs.existsSync(playwrightReportPath)) {
      this.app.use('/playwright-report', express.static(playwrightReportPath));
      this.log.info(
        `Playwright HTML report available at http://localhost:${this.port}/playwright-report`
      );
    }

    const artifactsPath = path.resolve(this.outputDir, '../test-sandbox/artifacts');
    if (fs.existsSync(artifactsPath)) {
      this.app.use('/artifacts', express.static(artifactsPath));
      this.log.info(`Artifacts available at http://localhost:${this.port}/artifacts`);
    }

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
