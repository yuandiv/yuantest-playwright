import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '@yuantest/core';
import { HTTP_STATUS } from '@yuantest/core';
import { loadConfigFile, mergeConfig } from '@yuantest/core';
import { Executor } from '../../executor';
import { logger } from '@yuantest/core';
import type { TestConfig, RunResult, DashboardStats } from '@yuantest/contracts';
import type { RunResultSummary } from '../../reporter';
import { validateBody } from '@yuantest/core';
import { StartRunRequestSchema } from '@yuantest/core';
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

export function createRunsRouter(deps: RouterDeps): Router {
  const router = Router();
  const log = logger.child('RunsRouter');

  router.post(
    '/runs',
    validateBody(StartRunRequestSchema),
    asyncHandler(async (req: Request, res: Response) => {
      if (deps.executor.current?.isCurrentlyRunning()) {
        res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
        return;
      }

      const runOptions = req.body;
      const fileConfig = await loadConfigFile();

      const testDir = runOptions.testDir || deps.testDir.current || fileConfig?.testDir || './';
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }

      const version = runOptions.version || '1.0.0';

      const playwrightMergedConfig = await deps.configMerger.mergeConfig(
        testDir,
        deps.outputDir.current
      );

      const config: TestConfig = mergeConfig(fileConfig, {
        version,
        testDir,
        outputDir: deps.outputDir.current,
        baseURL: fileConfig?.baseURL ?? playwrightMergedConfig.baseURL,
        retries: fileConfig?.retries ?? playwrightMergedConfig.retries,
        timeout: fileConfig?.timeout ?? playwrightMergedConfig.timeout,
        workers: fileConfig?.workers ?? playwrightMergedConfig.workers,
        shards: fileConfig?.shards ?? 1,
        browsers: fileConfig?.browsers || ['chromium'],
        environmentTag: fileConfig?.environmentTag || process.env.CI_ENVIRONMENT_NAME || undefined,
        htmlReport: true,
      });

      const executor = new Executor(config, deps.storage, deps.flakyManager.current);
      deps.executor.current = executor;

      executor.on('run_started', async (data) => {
        deps.realtimeReporter.broadcastRunStarted(data.runId, config.version, 0);
        deps.cache.invalidate('runs');
        deps.cache.invalidate('runs:summaries');
        deps.cache.invalidate('runs:all');
        try {
          const report = await deps.reporter.current.createPendingReport(
            data.runId,
            config.version
          );
          deps.realtimeReporter.broadcastReportCreated(report);
        } catch (error) {
          log.warn(
            `Failed to create pending report: ${error instanceof Error ? error.message : String(error)}`
          );
          deps.realtimeReporter.broadcastReportCreated({
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
        log.info(`Run started via API: ${data.runId}`);
      });

      executor.on('output', (data) => {
        deps.realtimeReporter.broadcastLog(data.runId || '', data.data, data.type);
      });

      executor.on('run_progress', (progress) => {
        deps.realtimeReporter.broadcastRunProgress(progress.runId, {
          currentTest: progress.currentTest,
          currentTestId: progress.currentTestId,
          totalTests: progress.totalTests,
          passed: progress.passed,
          failed: progress.failed,
          skipped: progress.skipped,
        });
      });

      executor.on('test_result', (result) => {
        const suiteName = result.fullTitle?.split(' > ').slice(0, -1).join(' > ') || 'Test Suite';

        deps.testResultBuffer.push({ result, suiteName });

        if (deps.testResultBuffer.length >= deps.TEST_RESULT_BATCH_SIZE) {
          deps.flushTestResultBuffer();
        } else if (!deps.testResultBufferTimer.current) {
          deps.testResultBufferTimer.current = setTimeout(() => {
            deps.flushTestResultBuffer();
          }, deps.TEST_RESULT_BATCH_INTERVAL);
          deps.testResultBufferTimer.current.unref();
        }
      });

      executor.on('run_completed', async (result: RunResult) => {
        deps.flushTestResultBuffer();

        deps.realtimeReporter.broadcastRunProgress(result.id, {
          totalTests: result.totalTests,
        });
        deps.realtimeReporter.broadcastRunCompleted(result.id, result);

        const status = result.status === 'success' ? 'success' : 'failed';

        try {
          await deps.reporter.current.finalizePendingReport(result.id, status);
        } catch (error) {
          log.warn(
            `Failed to finalize pending report, generating new report: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          await deps.reporter.current.generateReport(result);
        }

        await deps.flakyManager.current.recordRunResults(result);
        deps.reporter.current.clearCache();
        deps.cache.invalidate('runs');
        deps.cache.invalidate('runs:summaries');
        deps.cache.invalidate('runs:all');
        deps.cache.invalidate('health:');
        log.info(
          `Run completed via API: ${result.id} (${result.passed}/${result.totalTests} passed)`
        );
      });

      executor.on('run_cancelled', (result: RunResult | null) => {
        deps.flushTestResultBuffer();

        if (result) {
          deps.realtimeReporter.broadcastRunCompleted(result.id, result);
        }

        deps.reporter.current.clearCache();
        deps.cache.invalidate('runs');
        deps.cache.invalidate('runs:summaries');
        deps.cache.invalidate('runs:all');
        deps.cache.invalidate('health:');
        log.info(`Run cancelled via API: ${result?.id || 'unknown'}`);
      });

      executor.on('error', (data) => {
        deps.realtimeReporter.broadcastError(data.runId, data.error);
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
        log.info(
          `Running ${runOptions.testLocations.length} test locations: ${runOptions.testLocations.join(', ')}`
        );
      } else if (
        runOptions.testFiles &&
        Array.isArray(runOptions.testFiles) &&
        runOptions.testFiles.length > 0
      ) {
        executeOptions.testFiles = runOptions.testFiles;
        log.info(
          `Running ${runOptions.testFiles.length} test files: ${runOptions.testFiles.join(', ')}`
        );
      } else if (runOptions.describePattern) {
        executeOptions.grepPattern = runOptions.describePattern;
        log.info(`Running describe block with pattern: ${runOptions.describePattern}`);
      } else if (
        runOptions.testIds &&
        Array.isArray(runOptions.testIds) &&
        runOptions.testIds.length > 0
      ) {
        const testIds = runOptions.testIds as string[];
        const testDir = config.testDir || './';
        const discoveredTests = await deps.testDiscovery.discoverTests(testDir);

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
          log.info(
            `Running ${testLocations.length} tests at locations: ${testLocations.slice(0, 5).join(', ')}${testLocations.length > 5 ? '...' : ''}`
          );
        }

        if (notFoundIds.length > 0) {
          log.warn(`${notFoundIds.length} test IDs not found in discovery results`);
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

      executor.execute(executeOptions).catch((err) => {
        log.error('Execution error', err);
        deps.realtimeReporter.broadcastError('unknown', err.message);
      });
    })
  );

  router.post(
    '/runs/stop',
    asyncHandler(async (req: Request, res: Response) => {
      if (!deps.executor.current?.isCurrentlyRunning()) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'No execution is currently running' });
        return;
      }
      await deps.executor.current.cancel();
      res.json({ status: 'stopping', message: 'Execution cancellation requested' });
    })
  );

  router.get('/runs/status', async (req: Request, res: Response) => {
    const executorCurrent = deps.executor.current;
    const status = executorCurrent?.isCurrentlyRunning() || false;
    const currentRun = executorCurrent ? await executorCurrent.getCurrentStatus() : null;
    res.json({
      isRunning: status,
      currentRun:
        currentRun && executorCurrent
          ? {
              id: currentRun.id || null,
              version: executorCurrent.getConfig().version,
              totalTests: currentRun.totalTests,
              passed: currentRun.passed,
              failed: currentRun.failed,
              skipped: currentRun.skipped,
              testResults: executorCurrent.getCompletedTestResults(),
              testLocations: executorCurrent.getTestLocations(),
              testFiles: executorCurrent.getTestFiles(),
              grepPattern: executorCurrent.getGrepPattern(),
            }
          : null,
    });
  });

  router.get(
    '/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const cached = deps.cache.get('stats') as DashboardStats | null;
      if (cached) {
        res.json(cached);
        return;
      }

      const dashboard = await deps.reporter.current.generateDashboard();
      const flakyStats = deps.flakyManager.current.getQuarantineStats();
      const stats: DashboardStats = {
        ...dashboard,
        quarantinedTests: flakyStats.quarantined,
      };
      deps.cache.set('stats', stats);
      res.json(stats);
    })
  );

  router.get(
    '/runs',
    asyncHandler(async (req: Request, res: Response) => {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 20));
      const detailed = req.query.detailed === 'true';

      const pendingSummaries = deps.reporter.current.getPendingReportSummaries();

      if (detailed) {
        const cacheKey = `runs:all`;
        let allRuns = deps.cache.get(cacheKey) as RunResult[] | null;

        if (!allRuns) {
          allRuns = await deps.reporter.current.getAllReports();
          deps.cache.set(cacheKey, allRuns);
        }

        const mergedMap = new Map<string, RunResult>();
        for (const run of allRuns) {
          if (!deps.reporter.current.hasPendingReport(run.id)) {
            mergedMap.set(run.id, run);
          }
        }
        for (const ps of pendingSummaries) {
          const pending = deps.reporter.current.getPendingReport(ps.id);
          if (pending) {
            mergedMap.set(ps.id, pending);
          }
        }
        const mergedRuns = Array.from(mergedMap.values());

        const total = mergedRuns.length;
        const totalPages = Math.ceil(total / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedRuns = mergedRuns.slice().reverse().slice(startIndex, endIndex);

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
        return;
      }

      const cacheKey = `runs:summaries`;
      let allSummaries = deps.cache.get(cacheKey) as RunResultSummary[] | null;

      if (!allSummaries) {
        allSummaries = await deps.reporter.current.getReportSummaries();
        deps.cache.set(cacheKey, allSummaries);
      }

      const mergedSummaryMap = new Map<string, RunResultSummary>();
      for (const s of allSummaries) {
        if (!deps.reporter.current.hasPendingReport(s.id)) {
          mergedSummaryMap.set(s.id, s);
        }
      }
      for (const ps of pendingSummaries) {
        mergedSummaryMap.set(ps.id, ps);
      }
      const mergedSummaries = Array.from(mergedSummaryMap.values());

      const total = mergedSummaries.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedSummaries = mergedSummaries.slice().reverse().slice(startIndex, endIndex);

      const response: PaginatedResponse<RunResultSummary> = {
        data: paginatedSummaries,
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

  router.get(
    '/runs/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const run = await deps.reporter.current.getReport(req.params.id);
      if (!run) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
        return;
      }
      deps.processRunAttachmentPaths(run);
      res.json(run);
    })
  );

  router.get(
    '/runs/:id/raw',
    asyncHandler(async (req: Request, res: Response) => {
      const runId = req.params.id;

      let rawReport: Record<string, unknown> | null = null;
      let htmlReportUrl: string | null = null;

      const htmlReportPath = path.resolve(deps.outputDir.current, 'html-reports', runId);
      if (fs.existsSync(htmlReportPath)) {
        htmlReportUrl = `/html-reports/${runId}/index.html`;
        log.info(`Found HTML report for run ${runId} at ${htmlReportPath}`);
      }

      const pendingReport = deps.reporter.current.getPendingReport(runId);
      if (pendingReport) {
        rawReport = pendingReport as unknown as Record<string, unknown>;
        log.info(`Loaded pending report from memory for run ${runId}`);
      }

      if (!rawReport) {
        const runReportPath = path.resolve(deps.outputDir.current, `${runId}.json`);
        if (fs.existsSync(runReportPath)) {
          try {
            rawReport = await deps.storage.readJSON(runReportPath);
            log.info(`Loaded run report from ${runReportPath}`);
          } catch (error) {
            log.warn(`Failed to read run report: ${error}`);
          }
        }
      }

      if (!rawReport) {
        const latestJsonPath = path.resolve(deps.outputDir.current, 'results.json');
        if (fs.existsSync(latestJsonPath)) {
          try {
            rawReport = await deps.storage.readJSON(latestJsonPath);
            log.info(`Loaded latest Playwright report from ${latestJsonPath}`);
          } catch (error) {
            log.warn(`Failed to read latest report: ${error}`);
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
                              path: deps.processAttachmentPath(typedAttachment.path as string),
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
                typedTest.screenshots = typedTest.screenshots.map((p: string) =>
                  deps.processAttachmentPath(p)
                );
              }
              if (typedTest.videos && Array.isArray(typedTest.videos)) {
                typedTest.videos = typedTest.videos.map((p: string) =>
                  deps.processAttachmentPath(p)
                );
              }
              if (typedTest.traces && Array.isArray(typedTest.traces)) {
                typedTest.traces = typedTest.traces.map((p: string) =>
                  deps.processAttachmentPath(p)
                );
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

  router.delete(
    '/runs/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const report = await deps.reporter.current.getReport(req.params.id);
      const success = await deps.reporter.current.deleteReport(req.params.id);
      if (!success) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found or could not be deleted' });
        return;
      }
      if (report) {
        for (const suite of report.suites) {
          for (const test of suite.tests) {
            await deps.flakyManager.current.clearHistory(test.id);
          }
        }
      }
      deps.cache.invalidate('runs');
      deps.cache.invalidate('runs:summaries');
      deps.cache.invalidate('runs:all');
      deps.cache.invalidate('flaky');
      res.json({ success: true, message: `Report ${req.params.id} deleted` });
    })
  );

  router.delete(
    '/runs',
    asyncHandler(async (req: Request, res: Response) => {
      const count = await deps.reporter.current.deleteAllReports();
      await deps.flakyManager.current.clearHistory();
      deps.cache.invalidate('runs');
      deps.cache.invalidate('runs:summaries');
      deps.cache.invalidate('runs:all');
      deps.cache.invalidate('flaky');
      res.json({ success: true, message: `Deleted ${count} reports`, count });
    })
  );

  return router;
}
