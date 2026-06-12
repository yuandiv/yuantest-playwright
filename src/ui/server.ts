import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { getCustomPatterns, loadPatternsFromConfig } from '../diagnosis/knowledge-base';
import { Executor } from '../executor';
import { RunResult, TestResult } from '../types';
import { loadConfigFile } from '../config/loader';
import { logger } from '../logger';
import { StorageProvider } from '../storage';
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
import { createChatRouter } from './routes/chat';
import { createMiscRouter } from './routes/misc';

import { ServiceContainer } from '../container/service-container';
import { MutableRef } from '../container/mutable-ref';
import { TOKENS } from '../container/tokens';
import { registerCoreServices } from '../container/registrations';
import { buildRouterDeps } from '../container/router-deps-builder';

import { RealtimeReporter } from '../realtime';
import { Reporter } from '../reporter';
import { FlakyTestManager } from '../flaky';
import { TraceManager } from '../trace';
import { ArtifactManager } from '../artifacts';
import { VisualTestingManager } from '../visual';
import { DiagnosisService } from '../diagnosis';
import { UnifiedAIService } from '../ai/ai-service';
import { MCPConfigService } from './services/mcp-config-service';
import { TestDiscovery } from '../discovery';
import { LRUCache } from '../cache';

export class DashboardServer {
  private app: Express;
  private server: ReturnType<typeof createServer>;
  private container: ServiceContainer;
  private executor: { current: Executor | null } = { current: null };
  private port: number;
  private staticPath: string;
  private log = logger.child('DashboardServer');
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
    this.staticPath = path.join(__dirname, '../public');

    this.container = new ServiceContainer();
    registerCoreServices(this.container, { port, outputDir, dataDir });

    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());

    this.server = createServer(this.app);

    this.setupRoutes();
    this.setupStaticFiles();
  }

  getContainer(): ServiceContainer {
    return this.container;
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
        this.container.resolve<TestDiscovery>(TOKENS.TestDiscovery).setLang(lang);
      }
      next();
    });

    this.deps = buildRouterDeps(this.container, {
      executor: this.executor,
      processAttachmentPath: (p: string) =>
        processAttachmentPath(
          p,
          this.container.resolve<MutableRef<string>>(TOKENS.OutputDir).current
        ),
      processRunAttachmentPaths: (run: RunResult) =>
        processRunAttachmentPaths(
          run,
          this.container.resolve<MutableRef<string>>(TOKENS.OutputDir).current
        ),
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
    });

    v1Router.use(createHealthRouter(this.deps));
    v1Router.use(createTestDiscoveryRouter(this.deps));
    v1Router.use(createRunsRouter(this.deps));
    v1Router.use(createRerunRouter(this.deps));
    v1Router.use(createFlakyRouter(this.deps));
    v1Router.use(createFailureAnalysisRouter(this.deps));
    v1Router.use(createErrorPatternsRouter(this.deps));
    v1Router.use(createDiagnosisRouter(this.deps));
    v1Router.use(createAgentsRouter(this.deps));
    v1Router.use(
      createChatRouter(
        this.container.resolve<UnifiedAIService>(TOKENS.UnifiedAIService),
        this.container.resolve<MCPConfigService>(TOKENS.MCPConfigService)
      )
    );
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
      const reporter = this.container.resolve<Reporter>(TOKENS.Reporter);
      const run = await reporter.getReport(runId);
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
    return this.container.resolve<MutableRef<string>>(TOKENS.TestDir).current;
  }

  private invalidateAllCache(): void {
    const startTime = Date.now();
    const cache = this.container.resolve<LRUCache<unknown>>(TOKENS.LRUCache);
    const testDiscovery = this.container.resolve<TestDiscovery>(TOKENS.TestDiscovery);
    cache.invalidate('tests:');
    cache.invalidate('runs');
    cache.invalidate('runs:summaries');
    cache.invalidate('runs:all');
    cache.invalidate('stats');
    cache.invalidate('health:');
    cache.invalidate('traces:');
    cache.invalidate('artifacts:');
    testDiscovery.invalidateCache();
    const duration = Date.now() - startTime;
    this.log.debug(`All caches invalidated in ${duration}ms`);
  }

  private async updatePathsForTestDir(testDir: string): Promise<void> {
    const absoluteDir = path.resolve(testDir);
    const outputDirRef = this.container.resolve<MutableRef<string>>(TOKENS.OutputDir);
    const dataDirRef = this.container.resolve<MutableRef<string>>(TOKENS.DataDir);
    const testDirRef = this.container.resolve<MutableRef<string>>(TOKENS.TestDir);

    testDirRef.current = testDir;
    outputDirRef.current = path.join(absoluteDir, 'test-reports');
    dataDirRef.current = path.join(absoluteDir, 'test-data');

    const storage = this.container.resolve<StorageProvider>(TOKENS.StorageProvider);

    try {
      await storage.mkdir(outputDirRef.current);
    } catch (e) {
      this.log.warn(
        `Failed to create outputDir ${outputDirRef.current}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    try {
      await storage.mkdir(dataDirRef.current);
    } catch (e) {
      this.log.warn(
        `Failed to create dataDir ${dataDirRef.current}: ${e instanceof Error ? e.message : String(e)}`
      );
    }

    const newFlakyManager = new FlakyTestManager(dataDirRef.current, {}, storage);
    const diagnosisService = this.container.resolve<DiagnosisService>(TOKENS.DiagnosisService);
    const newReporter = new Reporter(
      outputDirRef.current,
      storage,
      diagnosisService,
      newFlakyManager
    );

    this.container.override(TOKENS.FlakyTestManager, newFlakyManager);
    this.container.override(TOKENS.Reporter, newReporter);
    this.deps.flakyManager.current = newFlakyManager;
    this.deps.reporter.current = newReporter;

    const newTraceManager = new TraceManager(
      {
        enabled: true,
        mode: 'on',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      },
      path.join(outputDirRef.current, 'test-results')
    );
    this.container.override(TOKENS.TraceManager, newTraceManager);
    this.deps.traceManager.current = newTraceManager;

    const newArtifactManager = new ArtifactManager(
      { enabled: true, screenshots: 'on', videos: 'on' },
      path.join(outputDirRef.current, 'test-results')
    );
    this.container.override(TOKENS.ArtifactManager, newArtifactManager);
    this.deps.artifactManager.current = newArtifactManager;

    const newVisualManager = new VisualTestingManager(
      {
        enabled: true,
        threshold: 0.2,
        maxDiffPixelRatio: 0.01,
        maxDiffPixels: 10,
        updateSnapshots: false,
      },
      path.join(absoluteDir, 'visual-testing')
    );
    this.container.override(TOKENS.VisualTestingManager, newVisualManager);
    this.deps.visualManager.current = newVisualManager;

    void logger.init(dataDirRef.current);
    this.container.resolve<UnifiedAIService>(TOKENS.UnifiedAIService).setProjectRoot(absoluteDir);

    this.invalidateAllCache();

    this.log.info(
      `Paths updated for test directory: ${absoluteDir}\n` +
        `  outputDir: ${outputDirRef.current}\n` +
        `  dataDir: ${dataDirRef.current}\n` +
        `  traces: ${path.join(outputDirRef.current, 'test-results')}\n` +
        `  artifacts: ${path.join(outputDirRef.current, 'test-results')}`
    );
  }

  private setupStaticFiles(): void {
    const outputDirRef = this.container.resolve<MutableRef<string>>(TOKENS.OutputDir);

    this.app.use('/html-reports', (req: Request, res: Response, next: NextFunction) => {
      const htmlReportsPath = path.resolve(outputDirRef.current, 'html-reports');
      if (fs.existsSync(htmlReportsPath)) {
        express.static(htmlReportsPath)(req, res, next);
      } else {
        next();
      }
    });

    this.app.use('/test-results', (req: Request, res: Response, next: NextFunction) => {
      const testResultsPath = path.resolve(outputDirRef.current, 'test-results');
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

    const reporter = this.container.resolve<Reporter>(TOKENS.Reporter);
    const realtimeReporter = this.container.resolve<RealtimeReporter>(TOKENS.RealtimeReporter);

    reporter.updatePendingReportBatch(runId, batch).catch((err) => {
      this.log.warn(
        `Batch update pending report failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    const results = batch.map((b) => b.result);
    realtimeReporter.broadcastTestResultBatch(runId, results);

    const pendingReport = reporter.getPendingReport(runId);
    const isStillRunning = this.executor.current?.isCurrentlyRunning() ?? false;
    if (pendingReport) {
      realtimeReporter.broadcastReportUpdated(runId, {
        totalTests: pendingReport.totalTests,
        passed: pendingReport.passed,
        failed: pendingReport.failed,
        skipped: pendingReport.skipped,
        status: isStillRunning ? 'running' : 'completed',
      });
    }
  }

  async start(): Promise<void> {
    const dataDirRef = this.container.resolve<MutableRef<string>>(TOKENS.DataDir);
    const storage = this.container.resolve<StorageProvider>(TOKENS.StorageProvider);
    const flakyManager = this.container.resolve<FlakyTestManager>(TOKENS.FlakyTestManager);
    const realtimeReporter = this.container.resolve<RealtimeReporter>(TOKENS.RealtimeReporter);

    try {
      const prefs = await storage.readJSON<Record<string, unknown>>(
        path.join(dataDirRef.current, 'user-preferences.json')
      );
      if (prefs?.testDir && typeof prefs.testDir === 'string') {
        await this.updatePathsForTestDir(prefs.testDir);
        this.log.info(`Restored testDir from preferences: ${prefs.testDir}`);
      }
      if (prefs?.autoQuarantine !== undefined && typeof prefs.autoQuarantine === 'boolean') {
        flakyManager.setConfig({ autoQuarantine: prefs.autoQuarantine });
        this.log.info(`Restored autoQuarantine from preferences: ${prefs.autoQuarantine}`);
      }
      if (prefs?.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
        flakyManager.setConfig({
          flakyCriteria: prefs.flakyCriteria as Record<string, unknown>,
        });
        this.log.info('Restored flakyCriteria from preferences');
      }
      if (prefs?.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
        flakyManager.setConfig({
          quarantineCriteria: prefs.quarantineCriteria as Record<string, unknown>,
        });
        this.log.info('Restored quarantineCriteria from preferences');
      }
    } catch (e) {
      this.log.warn(`Failed to restore preferences: ${e instanceof Error ? e.message : String(e)}`);
    }

    try {
      const prefs = await storage.readJSON<Record<string, unknown>>(
        path.join(dataDirRef.current, 'user-preferences.json')
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

    void logger.init(dataDirRef.current);
    realtimeReporter.initialize(this.server);

    const aiService = this.container.resolve<UnifiedAIService>(TOKENS.UnifiedAIService);
    aiService.initMCP().catch((err) => {
      this.log.warn(
        `Failed to initialize MCP: ${err instanceof Error ? err.message : String(err)}`
      );
    });

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

      const dataDirRef = this.container.resolve<MutableRef<string>>(TOKENS.DataDir);
      const storage = this.container.resolve<StorageProvider>(TOKENS.StorageProvider);

      const existing =
        (await storage.readJSON<Record<string, unknown>>(
          path.join(dataDirRef.current, 'user-preferences.json')
        )) || {};
      const merged = { ...existing, customErrorPatterns: serializedPatterns };
      await storage.writeJSON(path.join(dataDirRef.current, 'user-preferences.json'), merged);
      this.log.info(`Saved ${serializedPatterns.length} custom error patterns to user preferences`);
    } catch (e) {
      this.log.warn(
        `Failed to save custom error patterns: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  async stop(): Promise<void> {
    const realtimeReporter = this.container.resolve<RealtimeReporter>(TOKENS.RealtimeReporter);
    await logger.shutdown();
    realtimeReporter.shutdown();
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        this.log.info('Dashboard stopped');
        resolve();
      });
    });
  }

  getRealtimeReporter(): RealtimeReporter {
    return this.container.resolve<RealtimeReporter>(TOKENS.RealtimeReporter);
  }

  getFlakyManager(): FlakyTestManager {
    return this.container.resolve<FlakyTestManager>(TOKENS.FlakyTestManager);
  }

  getReporter(): Reporter {
    return this.container.resolve<Reporter>(TOKENS.Reporter);
  }

  getExecutor(): Executor | null {
    return this.executor.current;
  }
}
