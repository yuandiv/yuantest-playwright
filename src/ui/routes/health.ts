import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';
import { getErrorMessage } from '../../types';

export function createHealthRouter(deps: RouterDeps): Router {
  const router = Router();

  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      clients: deps.realtimeReporter.getConnectedClients(),
      isRunning: deps.executor.current?.isCurrentlyRunning() || false,
      timestamp: Date.now(),
    });
  });

  router.get('/config', async (req: Request, res: Response) => {
    try {
      const testDir = await deps.resolveTestDirFromPlaywrightConfig();
      res.json({ testDir });
    } catch (error: unknown) {
      res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  router.get(
    '/health/metrics',
    asyncHandler(async (req: Request, res: Response) => {
      const cacheKey = 'health:metrics';
      const cached = deps.cache.get(cacheKey);

      if (cached) {
        res.json(cached);
        return;
      }

      const allRuns = await deps.reporter.current.getAllReports();

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

      deps.cache.set(cacheKey, metrics);
      res.json(metrics);
    })
  );

  router.get(
    '/health/tags',
    asyncHandler(async (req: Request, res: Response) => {
      const tags = ['smoke', 'regression', 'e2e', 'performance', 'security', 'accessibility'];
      res.json(tags);
    })
  );

  router.get(
    '/health/branches',
    asyncHandler(async (req: Request, res: Response) => {
      const branches = ['main', 'develop', 'feature/new-ui', 'hotfix/login', 'release/v1.0'];
      res.json(branches);
    })
  );

  return router;
}
