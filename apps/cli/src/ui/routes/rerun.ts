import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '@yuantest/core';
import { HTTP_STATUS } from '@yuantest/core';
import { loadConfigFile, mergeConfig } from '@yuantest/core';
import { Executor } from '../../executor';
import { logger } from '@yuantest/core';
import type { TestConfig, RunResult, TestResult } from '@yuantest/contracts';

export function createRerunRouter(deps: RouterDeps): Router {
  const router = Router();
  const log = logger.child('RerunRouter');

  router.post(
    '/runs/:runId/tests/:testId/rerun',
    asyncHandler(async (req: Request, res: Response) => {
      const { runId, testId } = req.params;
      const { testLocation } = req.body;

      if (!testLocation) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'testLocation is required' });
        return;
      }

      const report = await deps.reporter.current.getReport(runId);
      if (!report) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
        return;
      }

      let testInfo: { file?: string; line?: number } | null = null;
      let currentManualReruns = 0;
      for (const suite of report.suites) {
        const test = suite.tests.find((t) => t.id === testId);
        if (test) {
          testInfo = { file: test.file, line: test.line };
          currentManualReruns = test.manualReruns || 0;
          break;
        }
      }

      if (!testInfo || !testInfo.file || !testInfo.line) {
        res
          .status(HTTP_STATUS.NOT_FOUND)
          .json({ error: 'Test not found or missing file/line info' });
        return;
      }

      if (deps.executor.current?.isCurrentlyRunning()) {
        res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
        return;
      }

      const fileConfig = await loadConfigFile();
      const config: TestConfig = mergeConfig(fileConfig, {
        version: report.version,
        testDir: deps.testDir.current,
        outputDir: deps.outputDir.current,
        retries: 0,
        timeout: fileConfig?.timeout ?? 30000,
        workers: 1,
        browsers: ['chromium'],
        htmlReport: false,
        parentRunId: runId,
        retryIndex: currentManualReruns + 1,
      });

      const executor = new Executor(config, deps.storage, deps.flakyManager.current);
      deps.executor.current = executor;

      let testResult: TestResult | null = null;

      executor.on('test_result', (result) => {
        if (
          result.id === testId ||
          (testInfo && result.file === testInfo.file && result.line === testInfo.line)
        ) {
          testResult = result;
        }
      });

      executor.on('run_cancelled', (result: RunResult | null) => {
        if (result) {
          deps.realtimeReporter.broadcastRunCompleted(result.id, result);
        }
      });

      executor.on('error', (data) => {
        deps.realtimeReporter.broadcastError(data.runId, data.error);
      });

      res.json({ status: 'started', message: 'Test rerun initiated' });

      try {
        await executor.execute({
          testLocations: [testLocation],
          parentRunId: runId,
        });

        const remappedResult = executor.currentRun?.suites
          .flatMap((s) => s.tests)
          .find(
            (t) =>
              t.id === testId || (testInfo && t.file === testInfo.file && t.line === testInfo.line)
          );

        const finalResult = remappedResult || testResult;

        if (finalResult) {
          const updated = await deps.reporter.current.updateTestResult(runId, testId, finalResult);
          if (updated) {
            const updatedReport = await deps.reporter.current.getReport(runId);
            if (updatedReport) {
              const updatedTest = updatedReport.suites
                .flatMap((s) => s.tests)
                .find((t) => t.id === testId);
              const narrowedResult = finalResult as TestResult;
              deps.realtimeReporter.broadcastReportUpdated(runId, {
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
            log.info(`Test rerun completed and report updated: ${testId}`);
          } else {
            log.warn(`Failed to update test result in report: ${testId}`);
          }
        } else {
          log.warn(`Test result not found after rerun: ${testId}`);
        }

        deps.cache.invalidate('runs');
        deps.cache.invalidate('runs:summaries');
        deps.cache.invalidate('runs:all');
      } catch (error: unknown) {
        log.error('Test rerun failed', error instanceof Error ? error : undefined);
        deps.realtimeReporter.broadcastError(
          runId,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    })
  );

  router.post(
    '/runs/:runId/batch-rerun',
    asyncHandler(async (req: Request, res: Response) => {
      const { runId } = req.params;
      const { tests } = req.body as { tests: Array<{ testId: string; testLocation: string }> };

      if (!Array.isArray(tests) || tests.length === 0) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'tests array must be non-empty' });
        return;
      }

      for (const t of tests) {
        if (!t.testId || !t.testLocation) {
          res
            .status(HTTP_STATUS.BAD_REQUEST)
            .json({ error: 'Each test must have testId and testLocation' });
          return;
        }
      }

      const report = await deps.reporter.current.getReport(runId);
      if (!report) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
        return;
      }

      const allTestIds = new Set(report.suites.flatMap((s) => s.tests.map((t) => t.id)));
      const missingTestIds = tests.map((t) => t.testId).filter((id) => !allTestIds.has(id));
      if (missingTestIds.length > 0) {
        res
          .status(HTTP_STATUS.BAD_REQUEST)
          .json({ error: `TestIds not found: ${missingTestIds.join(', ')}` });
        return;
      }

      if (deps.executor.current?.isCurrentlyRunning()) {
        res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
        return;
      }

      const testInfoMap = new Map<string, { file?: string; line?: number }>();
      let maxManualReruns = 0;
      for (const suite of report.suites) {
        for (const test of suite.tests) {
          for (const t of tests) {
            if (test.id === t.testId) {
              testInfoMap.set(t.testId, { file: test.file, line: test.line });
              const reruns = test.manualReruns || 0;
              if (reruns > maxManualReruns) {
                maxManualReruns = reruns;
              }
            }
          }
        }
      }

      const fileConfig = await loadConfigFile();
      const config: TestConfig = mergeConfig(fileConfig, {
        version: report.version,
        testDir: deps.testDir.current,
        outputDir: deps.outputDir.current,
        retries: 0,
        timeout: fileConfig?.timeout ?? 30000,
        workers: 1,
        browsers: ['chromium'],
        htmlReport: false,
        parentRunId: runId,
        retryIndex: maxManualReruns + 1,
      });

      const executor = new Executor(config, deps.storage, deps.flakyManager.current);
      deps.executor.current = executor;

      const testResultMap = new Map<string, TestResult>();

      executor.on('test_result', (result) => {
        for (const t of tests) {
          const info = testInfoMap.get(t.testId);
          if (
            result.id === t.testId ||
            (info && result.file === info.file && result.line === info.line)
          ) {
            testResultMap.set(t.testId, result);
          }
        }
      });

      executor.on('run_cancelled', (result: RunResult | null) => {
        if (result) {
          deps.realtimeReporter.broadcastRunCompleted(result.id, result);
        }
      });

      executor.on('error', (data) => {
        deps.realtimeReporter.broadcastError(data.runId, data.error);
      });

      res.json({ status: 'started', message: 'Batch rerun initiated', count: tests.length });

      try {
        await executor.execute({
          testLocations: tests.map((t) => t.testLocation),
          parentRunId: runId,
        });

        for (const t of tests) {
          const info = testInfoMap.get(t.testId);
          const remappedResult = executor.currentRun?.suites
            .flatMap((s) => s.tests)
            .find(
              (rt) => rt.id === t.testId || (info && rt.file === info.file && rt.line === info.line)
            );

          const finalResult = remappedResult || testResultMap.get(t.testId) || null;

          if (finalResult) {
            const updated = await deps.reporter.current.updateTestResult(
              runId,
              t.testId,
              finalResult
            );
            if (updated) {
              const updatedReport = await deps.reporter.current.getReport(runId);
              if (updatedReport) {
                const updatedTest = updatedReport.suites
                  .flatMap((s) => s.tests)
                  .find((ut) => ut.id === t.testId);
                const narrowedResult = finalResult as TestResult;
                deps.realtimeReporter.broadcastReportUpdated(runId, {
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
              log.info(`Batch rerun completed and report updated: ${t.testId}`);
            } else {
              log.warn(`Failed to update test result in report: ${t.testId}`);
            }
          } else {
            log.warn(`Test result not found after batch rerun: ${t.testId}`);
          }
        }

        deps.cache.invalidate('runs');
        deps.cache.invalidate('runs:summaries');
        deps.cache.invalidate('runs:all');
      } catch (error: unknown) {
        log.error('Batch rerun failed', error instanceof Error ? error : undefined);
        deps.realtimeReporter.broadcastError(
          runId,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    })
  );

  router.get(
    '/runs/:runId/tests/:testId/retries',
    asyncHandler(async (req: Request, res: Response) => {
      const { runId, testId } = req.params;

      const report = await deps.reporter.current.getReport(runId);
      if (!report) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Run not found' });
        return;
      }

      let testResult: TestResult | null = null;
      for (const suite of report.suites) {
        const found = suite.tests.find((t) => t.id === testId);
        if (found) {
          testResult = found;
          break;
        }
      }

      if (!testResult) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found' });
        return;
      }

      const retryData: Array<{
        retryIndex: number;
        status: string;
        duration: number;
        error?: string;
        stackTrace?: string;
        logs?: string[];
        screenshots?: string[];
        videos?: string[];
        traces?: string[];
        timestamp: number;
      }> = [];

      if (testResult.runHistory && testResult.runHistory.length > 0) {
        for (let i = 0; i < testResult.runHistory.length; i++) {
          const entry = testResult.runHistory[i];
          retryData.push({
            retryIndex: i,
            status: entry.status,
            duration: entry.duration,
            error: entry.error,
            stackTrace: entry.stackTrace,
            logs: entry.logs,
            screenshots: entry.screenshots?.map((p: string) => deps.processAttachmentPath(p)),
            videos: entry.videos?.map((p: string) => deps.processAttachmentPath(p)),
            traces: entry.traces?.map((p: string) => deps.processAttachmentPath(p)),
            timestamp: entry.timestamp,
          });
        }
      }

      retryData.push({
        retryIndex: testResult.runHistory?.length ?? 0,
        status: testResult.status,
        duration: testResult.duration,
        error: testResult.error,
        stackTrace: testResult.stackTrace,
        logs: testResult.logs,
        screenshots: testResult.screenshots?.map((p: string) => deps.processAttachmentPath(p)),
        videos: testResult.videos?.map((p: string) => deps.processAttachmentPath(p)),
        traces: testResult.traces?.map((p: string) => deps.processAttachmentPath(p)),
        timestamp: testResult.timestamp,
      });

      const path = await import('path');
      const fs = await import('fs');
      const testResultsDir = path.resolve(deps.outputDir.current, 'test-results', runId);
      if (fs.existsSync(testResultsDir)) {
        try {
          const entries = fs.readdirSync(testResultsDir, { withFileTypes: true });
          const retryFolders = entries.filter((e) => e.isDirectory() && /-retry\d+$/.test(e.name));

          for (const folder of retryFolders) {
            const retryMatch = folder.name.match(/-retry(\d+)$/);
            if (!retryMatch) {
              continue;
            }
            const retryIndex = parseInt(retryMatch[1], 10) - 1;

            if (retryIndex >= 0 && retryIndex < retryData.length) {
              const entry = retryData[retryIndex];
              const folderPath = path.join(testResultsDir, folder.name);

              if (!entry.screenshots || entry.screenshots.length === 0) {
                const screenshots = deps.discoverFilesInDir(folderPath, [
                  '.png',
                  '.jpg',
                  '.jpeg',
                  '.webp',
                ]);
                if (screenshots.length > 0) {
                  entry.screenshots = screenshots.map((p) => deps.processAttachmentPath(p));
                }
              }
              if (!entry.videos || entry.videos.length === 0) {
                const videos = deps.discoverFilesInDir(folderPath, ['.webm', '.mp4', '.ogg']);
                if (videos.length > 0) {
                  entry.videos = videos.map((p) => deps.processAttachmentPath(p));
                }
              }
              if (!entry.traces || entry.traces.length === 0) {
                const traces = deps.discoverFilesInDir(folderPath, ['.zip', '.trace']);
                if (traces.length > 0) {
                  entry.traces = traces.map((p) => deps.processAttachmentPath(p));
                }
              }
            }
          }
        } catch (error: unknown) {
          log.warn(
            `Failed to scan retry folders: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      res.json(retryData);
    })
  );

  return router;
}
