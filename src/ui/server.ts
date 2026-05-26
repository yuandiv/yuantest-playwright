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
import { AgentService } from '../agents';
import { getCustomPatterns, loadPatternsFromConfig } from '../diagnosis/knowledge-base';
import { Executor } from '../executor';
import { TestDiscovery } from '../discovery';
import { RunResult, TestResult } from '../types';
import { loadConfigFile } from '../config/loader';
import { PlaywrightConfigMerger } from '../config/merger';
import { logger } from '../logger';
import { StorageProvider, getStorage } from '../storage';
import { LRUCache } from '../cache';
import { errorHandler, notFoundHandler } from '../middleware';
import { Lang, setLang } from '../i18n';
import * as path from 'path';
import * as fs from 'fs';

import type { RouterDeps } from './routes/types';
import {
  isPathSafe,
  processAttachmentPath,
  processRunAttachmentPaths,
  discoverFilesInDir,
} from './routes/helpers';
import { createHealthRouter } from './routes/health';
import { createTestDiscoveryRouter } from './routes/testDiscovery';
import { createRunsRouter } from './routes/runs';
import { createRerunRouter } from './routes/rerun';
import { createFlakyRouter } from './routes/flaky';
import { createFailureAnalysisRouter } from './routes/failureAnalysis';
import { createErrorPatternsRouter } from './routes/errorPatterns';
import { createDiagnosisRouter } from './routes/diagnosis';
import { createAgentsRouter } from './routes/agents';
import { createMiscRouter } from './routes/misc';

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
  private executor: { current: Executor | null } = { current: null };
  private port: number;
  private staticPath: string;
  private outputDir: { current: string };
  private dataDir: { current: string };
  private testDir: { current: string };
  private log = logger.child('DashboardServer');
  private storage: StorageProvider;
  private testDiscovery: TestDiscovery;
  private cache: LRUCache<unknown>;
  private agentService: AgentService;
  private configMerger: PlaywrightConfigMerger;
  private testResultBuffer: Array<{ result: TestResult; suiteName: string }> = [];
  private testResultBufferTimer: { current: NodeJS.Timeout | null } = { current: null };
  private readonly TEST_RESULT_BATCH_SIZE = 50;
  private readonly TEST_RESULT_BATCH_INTERVAL = 500;
  private deps!: RouterDeps;

  constructor(
    port: number = 5274,
    outputDir: string = './test-reports',
    dataDir: string = './test-data'
  ) {
    this.port = port;
    this.outputDir = { current: outputDir };
    this.dataDir = { current: dataDir };
    this.testDir = { current: './' };
    this.staticPath = path.join(__dirname, '../public');
    this.storage = getStorage();
    this.testDiscovery = new TestDiscovery();
    this.configMerger = new PlaywrightConfigMerger(this.storage);
    this.cache = new LRUCache({
      maxSize: process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE, 10) : 100,
    });
    this.agentService = new AgentService(dataDir);

    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.realtimeReporter = new RealtimeReporter();

    try {
      this.diagnosisService = new DiagnosisService(dataDir);
    } catch (error) {
      this.log.warn(`Failed to initialize DiagnosisService: ${error}`);
      this.diagnosisService = new DiagnosisService(dataDir);
    }

    this.flakyManager = new FlakyTestManager(dataDir, {}, this.storage);
    this.reporter = new Reporter(outputDir, this.storage, this.diagnosisService, this.flakyManager);

    this.traceManager = new TraceManager(
      {
        enabled: true,
        mode: 'on',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      },
      path.join(this.outputDir.current, 'test-results')
    );

    this.artifactManager = new ArtifactManager(
      { enabled: true, screenshots: 'on', videos: 'on' },
      path.join(this.outputDir.current, 'test-results')
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
      path.join(this.outputDir.current, '../visual-testing')
    );

    this.server = createServer(this.app);

    this.setupRoutes();
    this.setupStaticFiles();
  }

  private setupRoutes(): void {
    const v1Router = Router();

    // Language middleware
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

    // Build the dependency injection object
    this.deps = {
      executor: this.executor,
      reporter: { current: this.reporter },
      realtimeReporter: this.realtimeReporter,
      flakyManager: { current: this.flakyManager },
      diagnosisService: this.diagnosisService,
      agentService: this.agentService,
      testDiscovery: this.testDiscovery,
      cache: this.cache,
      storage: this.storage,
      configMerger: this.configMerger,
      traceManager: { current: this.traceManager },
      artifactManager: { current: this.artifactManager },
      annotationManager: this.annotationManager,
      tagManager: this.tagManager,
      visualManager: { current: this.visualManager },
      outputDir: this.outputDir,
      dataDir: this.dataDir,
      testDir: this.testDir,
      processAttachmentPath: (p: string) => processAttachmentPath(p, this.outputDir.current),
      processRunAttachmentPaths: (run: RunResult) =>
        processRunAttachmentPaths(run, this.outputDir.current),
      isPathSafe,
      discoverFilesInDir,
      invalidateAllCache: () => this.invalidateAllCache(),
      saveCustomErrorPatterns: () => this.saveCustomErrorPatterns(),
      findTestInfoByRunId: (runId, testTitle, file, line) =>
        this.findTestInfoByRunId(runId, testTitle, file, line),
      resolveTestDirFromPlaywrightConfig: () => this.resolveTestDirFromPlaywrightConfig(),
      updatePathsForTestDir: (testDir: string) => this.updatePathsForTestDir(testDir),
      testResultBuffer: this.testResultBuffer,
      testResultBufferTimer: this.testResultBufferTimer,
      flushTestResultBuffer: () => this.flushTestResultBuffer(),
      TEST_RESULT_BATCH_SIZE: this.TEST_RESULT_BATCH_SIZE,
      TEST_RESULT_BATCH_INTERVAL: this.TEST_RESULT_BATCH_INTERVAL,
    };

    // Mount route modules
    v1Router.use(createHealthRouter(this.deps));
    v1Router.use(createTestDiscoveryRouter(this.deps));
    v1Router.use(createRunsRouter(this.deps));
    v1Router.use(createRerunRouter(this.deps));
    v1Router.use(createFlakyRouter(this.deps));
    v1Router.use(createFailureAnalysisRouter(this.deps));
    v1Router.use(createErrorPatternsRouter(this.deps));
    v1Router.use(createDiagnosisRouter(this.deps));
    v1Router.use(createAgentsRouter(this.deps));
    v1Router.use(createMiscRouter(this.deps));

    this.app.use('/api/v1', v1Router);
    this.app.use(errorHandler);
  }

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
    return this.testDir.current;
  }

  private invalidateAllCache(): void {
    const startTime = Date.now();
    this.cache.invalidate('tests:');
    this.cache.invalidate('runs');
    this.cache.invalidate('runs:summaries');
    this.cache.invalidate('runs:all');
    this.cache.invalidate('stats');
    this.cache.invalidate('health:');
    this.cache.invalidate('traces:');
    this.cache.invalidate('artifacts:');
    this.testDiscovery.invalidateCache();
    const duration = Date.now() - startTime;
    this.log.debug(`All caches invalidated in ${duration}ms`);
  }

  private async updatePathsForTestDir(testDir: string): Promise<void> {
    const absoluteDir = path.resolve(testDir);
    this.testDir.current = testDir;
    this.outputDir.current = path.join(absoluteDir, 'test-reports');
    this.dataDir.current = path.join(absoluteDir, 'test-data');

    try {
      await this.storage.mkdir(this.outputDir.current);
    } catch (e) {
      this.log.warn(
        `Failed to create outputDir ${this.outputDir.current}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    try {
      await this.storage.mkdir(this.dataDir.current);
    } catch (e) {
      this.log.warn(
        `Failed to create dataDir ${this.dataDir.current}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    this.flakyManager = new FlakyTestManager(this.dataDir.current, {}, this.storage);
    this.reporter = new Reporter(
      this.outputDir.current,
      this.storage,
      this.diagnosisService,
      this.flakyManager
    );

    // Update mutable references in deps
    this.deps.flakyManager.current = this.flakyManager;
    this.deps.reporter.current = this.reporter;

    this.traceManager = new TraceManager(
      {
        enabled: true,
        mode: 'on',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      },
      path.join(this.outputDir.current, 'test-results')
    );
    this.deps.traceManager.current = this.traceManager;

    this.artifactManager = new ArtifactManager(
      { enabled: true, screenshots: 'on', videos: 'on' },
      path.join(this.outputDir.current, 'test-results')
    );
    this.deps.artifactManager.current = this.artifactManager;

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
    this.deps.visualManager.current = this.visualManager;

    void logger.init(this.dataDir.current);
    this.agentService.setProjectRoot(absoluteDir);

    this.invalidateAllCache();

    this.log.info(
      `Paths updated for test directory: ${absoluteDir}\n` +
        `  outputDir: ${this.outputDir.current}\n` +
        `  dataDir: ${this.dataDir.current}\n` +
        `  traces: ${path.join(this.outputDir.current, 'test-results')}\n` +
        `  artifacts: ${path.join(this.outputDir.current, 'test-results')}`
    );
  }

  private setupStaticFiles(): void {
    this.app.use('/html-reports', (req: Request, res: Response, next: NextFunction) => {
      const htmlReportsPath = path.resolve(this.outputDir.current, 'html-reports');
      if (fs.existsSync(htmlReportsPath)) {
        express.static(htmlReportsPath)(req, res, next);
      } else {
        next();
      }
    });

    this.app.use('/test-results', (req: Request, res: Response, next: NextFunction) => {
      const testResultsPath = path.resolve(this.outputDir.current, 'test-results');
      if (fs.existsSync(testResultsPath)) {
        express.static(testResultsPath)(req, res, next);
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

  private flushTestResultBuffer(): void {
    if (this.testResultBufferTimer.current) {
      clearTimeout(this.testResultBufferTimer.current);
      this.testResultBufferTimer.current = null;
    }

    if (this.testResultBuffer.length === 0) {
      return;
    }

    const batch = this.testResultBuffer.splice(0);
    const runId = this.executor.current?.currentRun?.id || '';

    this.reporter.updatePendingReportBatch(runId, batch).catch((err) => {
      this.log.warn(
        `Batch update pending report failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    const results = batch.map((b) => b.result);
    this.realtimeReporter.broadcastTestResultBatch(runId, results);

    const pendingReport = this.reporter.getPendingReport(runId);
    const isStillRunning = this.executor.current?.isCurrentlyRunning() ?? false;
    if (pendingReport) {
      this.realtimeReporter.broadcastReportUpdated(runId, {
        totalTests: pendingReport.totalTests,
        passed: pendingReport.passed,
        failed: pendingReport.failed,
        skipped: pendingReport.skipped,
        status: isStillRunning ? 'running' : 'completed',
      });
    }
  }

  async start(): Promise<void> {
    try {
      const prefs = await this.storage.readJSON<Record<string, unknown>>(
        path.join(this.dataDir.current, 'user-preferences.json')
      );
      if (prefs?.testDir && typeof prefs.testDir === 'string') {
        await this.updatePathsForTestDir(prefs.testDir);
        this.log.info(`Restored testDir from preferences: ${prefs.testDir}`);
      }
      if (prefs?.autoQuarantine !== undefined && typeof prefs.autoQuarantine === 'boolean') {
        this.flakyManager.setConfig({ autoQuarantine: prefs.autoQuarantine });
        this.log.info(`Restored autoQuarantine from preferences: ${prefs.autoQuarantine}`);
      }
      if (prefs?.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
        this.flakyManager.setConfig({
          flakyCriteria: prefs.flakyCriteria as Record<string, unknown>,
        });
        this.log.info('Restored flakyCriteria from preferences');
      }
      if (prefs?.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
        this.flakyManager.setConfig({
          quarantineCriteria: prefs.quarantineCriteria as Record<string, unknown>,
        });
        this.log.info('Restored quarantineCriteria from preferences');
      }
    } catch (e) {
      this.log.warn(`Failed to restore preferences: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const prefs = await this.storage.readJSON<Record<string, unknown>>(
        path.join(this.dataDir.current, 'user-preferences.json')
      );
      if (prefs?.customErrorPatterns && Array.isArray(prefs.customErrorPatterns)) {
        loadPatternsFromConfig(
          prefs.customErrorPatterns as Array<{
            id: string;
            category:
              | 'timeout'
              | 'selector'
              | 'assertion'
              | 'network'
              | 'frame'
              | 'auth'
              | 'unknown';
            name: string;
            description: string;
            regex: string[];
            rootCauseTemplate: { zh: string; en: string };
            suggestionsTemplate: { zh: string[]; en: string[] };
            docLinks?: { title: string; url: string }[];
          }>
        );
        this.log.info(
          `Loaded ${(prefs.customErrorPatterns as unknown[]).length} custom error patterns from user preferences`
        );
      }
    } catch (e) {
      this.log.warn(
        `Failed to load custom error patterns from user preferences: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    try {
      const fileConfig = await loadConfigFile();
      if (fileConfig?.customErrorPatterns && fileConfig.customErrorPatterns.length > 0) {
        loadPatternsFromConfig(fileConfig.customErrorPatterns);
        this.log.info(
          `Loaded ${fileConfig.customErrorPatterns.length} custom error patterns from config`
        );
      }
    } catch (e) {
      this.log.warn(
        `Failed to load custom error patterns from config: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    void logger.init(this.dataDir.current);
    this.realtimeReporter.initialize(this.server);

    return new Promise<void>((resolve) => {
      this.server.listen(this.port, () => {
        this.log.info(`Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  private async saveCustomErrorPatterns(): Promise<void> {
    try {
      const customPatterns = getCustomPatterns();
      const serializedPatterns = customPatterns.map((p) => ({
        id: p.id,
        category: p.category,
        name: p.name,
        description: p.description,
        regex: p.regex.map((r) => r.source),
        rootCauseTemplate: p.rootCauseTemplate,
        suggestionsTemplate: p.suggestionsTemplate,
        docLinks: p.docLinks,
      }));

      const existing =
        (await this.storage.readJSON<Record<string, unknown>>(
          path.join(this.dataDir.current, 'user-preferences.json')
        )) || {};
      const merged = { ...existing, customErrorPatterns: serializedPatterns };
      await this.storage.writeJSON(
        path.join(this.dataDir.current, 'user-preferences.json'),
        merged
      );
      this.log.info(`Saved ${serializedPatterns.length} custom error patterns to user preferences`);
    } catch (e) {
      this.log.warn(
        `Failed to save custom error patterns: ${e instanceof Error ? e.message : String(e)}`
      );
    }
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
    return this.executor.current;
  }
}
