import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';
import { getErrorMessage } from '../../types';
import { logger } from '../../logger';
import { checkEnvironment } from '../../utils/environment';

export function createTestDiscoveryRouter(deps: RouterDeps): Router {
  const router = Router();
  const log = logger.child('TestDiscoveryRouter');

  router.get('/tests', async (req: Request, res: Response) => {
    try {
      const testDir = (req.query.testDir as string) || deps.testDir.current;
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }

      const configPath = (req.query.configPath as string) || undefined;
      const structured = req.query.structured === 'true';
      const forceRefresh = req.query.force === 'true';

      if (forceRefresh) {
        deps.testDiscovery.invalidateCache(testDir);
        deps.cache.invalidate(`tests:${testDir}`);
      }

      const cacheKey = `tests:${testDir}:${configPath || 'default'}:${structured ? 'structured' : 'flat'}`;

      if (!forceRefresh) {
        const cached = deps.cache.get(cacheKey) as {
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
        const result = await deps.testDiscovery.discoverTestsStructured(
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
          deps.cache.set(cacheKey, response);
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
          deps.cache.set(cacheKey, response);
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
        deps.cache.set(cacheKey, response);
        res.json(response);
      } else {
        const result = await deps.testDiscovery.discoverTestsStructured(
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
          deps.cache.set(cacheKey, response);
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
          deps.cache.set(cacheKey, response);
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
        deps.cache.set(cacheKey, response);
        res.json(response);
      }
    } catch (error: unknown) {
      log.error('Failed to discover tests', error instanceof Error ? error : undefined);
      const envCheck = await checkEnvironment();
      res.status(500).json({
        error: getErrorMessage(error),
        environmentCheck: !envCheck.nodeOk || !envCheck.playwrightOk ? envCheck : undefined,
      });
    }
  });

  router.get('/tests/stats', async (req: Request, res: Response) => {
    try {
      const testDir = (req.query.testDir as string) || deps.testDir.current;
      if (!deps.isPathSafe(testDir)) {
        res.status(400).json({ error: 'Invalid testDir: path traversal is not allowed' });
        return;
      }

      const stats = await deps.testDiscovery.getTestStats(testDir);
      res.json(stats);
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.post(
    '/tests/refresh',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        deps.cache.invalidate('tests:');
        deps.testDiscovery.invalidateCache();
        const testDir = req.body?.testDir || deps.testDir.current;
        const configPath = req.body?.configPath;

        const result = await deps.testDiscovery.discoverTestsStructured(testDir, configPath, false);
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
        deps.cache.set(cacheKey, response);

        res.json({
          success: true,
          message: 'Tests cache refreshed',
          total: result.tests.length,
        });
      } catch (error: unknown) {
        log.error('Failed to refresh tests', error instanceof Error ? error : undefined);
        res.status(500).json({ error: getErrorMessage(error) });
      }
    })
  );

  router.get(
    '/tests/:testId/history',
    asyncHandler(async (req: Request, res: Response) => {
      const { testId } = req.params;
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 10));

      const allReports = await deps.reporter.current.getAllReports();
      const sortedReports = allReports
        .filter((r) => r.status !== 'running')
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

      const allHistoryEntries: Array<{
        runId: string;
        version: string;
        status: string;
        duration: number;
        error?: string;
        timestamp: number;
        retries: number;
        manualReruns?: number;
        htmlReportUrl: string | null;
        testId: string;
      }> = [];

      const path = await import('path');
      const fs = await import('fs');

      for (const report of sortedReports) {
        for (const suite of report.suites) {
          const test = suite.tests.find((t) => t.id === testId);
          if (test) {
            let htmlReportUrl: string | null = null;
            const htmlReportPath = path.resolve(deps.outputDir.current, 'html-reports', report.id);
            if (fs.existsSync(htmlReportPath)) {
              htmlReportUrl = `/html-reports/${report.id}/index.html`;
            }
            allHistoryEntries.push({
              runId: report.id,
              version: report.version,
              status: test.status,
              duration: test.duration,
              error: test.error,
              timestamp: test.timestamp || report.startTime,
              retries: test.retries || 0,
              manualReruns: test.manualReruns,
              htmlReportUrl,
              testId: test.id,
            });
            break;
          }
        }
      }

      const total = allHistoryEntries.length;
      const totalPages = Math.ceil(total / pageSize);
      const startIndex = (page - 1) * pageSize;
      const historyEntries = allHistoryEntries.slice(startIndex, startIndex + pageSize);

      const totalRuns = total;
      const passedCount = allHistoryEntries.filter((e) => e.status === 'passed').length;
      const failedCount = allHistoryEntries.filter((e) => e.status === 'failed').length;
      const stability = totalRuns > 0 ? ((passedCount / totalRuns) * 100).toFixed(2) : '0.00';

      let lastPassed: (typeof allHistoryEntries)[0] | undefined;
      let lastFailed: (typeof allHistoryEntries)[0] | undefined;
      let lastFlaky: (typeof allHistoryEntries)[0] | undefined;

      for (const entry of allHistoryEntries) {
        if (!lastPassed && entry.status === 'passed') {
          lastPassed = entry;
        }
        if (!lastFailed && entry.status === 'failed') {
          lastFailed = entry;
        }
        if (!lastFlaky && entry.retries > 0 && entry.status === 'passed') {
          lastFlaky = entry;
        }
        if (lastPassed && lastFailed && lastFlaky) {
          break;
        }
      }

      res.json({
        testId,
        summary: {
          stability: parseFloat(stability),
          totalRuns,
          passed: passedCount,
          failed: failedCount,
          lastPassed: lastPassed || null,
          lastFailed: lastFailed || null,
          lastFlaky: lastFlaky || null,
        },
        history: historyEntries,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      });
    })
  );

  return router;
}
