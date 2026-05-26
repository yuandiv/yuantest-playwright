import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';
import { HTTP_STATUS } from '../../constants';
import { loadConfigFile, mergeConfig } from '../../config/loader';
import { Executor } from '../../executor';
import { logger } from '../../logger';
import type { TestConfig, RunResult } from '../../types';

export function createFlakyRouter(deps: RouterDeps): Router {
  const router = Router();
  const log = logger.child('FlakyRouter');

  router.get(
    '/flaky',
    asyncHandler(async (req: Request, res: Response) => {
      const threshold = parseFloat(req.query.threshold as string) || 0.3;
      const flakyTests = deps.flakyManager.current.getFlakyTests(threshold);
      res.json(flakyTests);
    })
  );

  router.get(
    '/flaky/quarantined',
    asyncHandler(async (req: Request, res: Response) => {
      const quarantined = deps.flakyManager.current.getQuarantinedTests();
      res.json(quarantined);
    })
  );

  router.post(
    '/flaky/:testId/quarantine',
    asyncHandler(async (req: Request, res: Response) => {
      const success = await deps.flakyManager.current.quarantineTest(req.params.testId);
      res.json({ success, testId: req.params.testId });
    })
  );

  router.post(
    '/flaky/:testId/release',
    asyncHandler(async (req: Request, res: Response) => {
      const { resetHistory } = req.body || {};
      const success = await deps.flakyManager.current.releaseTest(req.params.testId, {
        resetHistory,
      });
      res.json({ success, testId: req.params.testId });
    })
  );

  router.post(
    '/flaky/:testId/validate-release',
    asyncHandler(async (req: Request, res: Response) => {
      const testId = req.params.testId;
      const flakyTest = deps.flakyManager.current.getTestById(testId);

      if (!flakyTest) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found in flaky history' });
        return;
      }

      if (!deps.flakyManager.current.isQuarantined(testId)) {
        res.status(HTTP_STATUS.BAD_REQUEST).json({ error: 'Test is not quarantined' });
        return;
      }

      if (deps.executor.current?.isCurrentlyRunning()) {
        res.status(HTTP_STATUS.CONFLICT).json({ error: 'An execution is already in progress' });
        return;
      }

      const fileConfig = await loadConfigFile();
      const config: TestConfig = mergeConfig(fileConfig, {
        testDir: deps.testDir.current,
        outputDir: deps.outputDir.current,
        retries: 0,
        workers: 1,
        browsers: ['chromium'],
        htmlReport: false,
      });

      const executor = new Executor(config, deps.storage, deps.flakyManager.current);
      deps.executor.current = executor;

      const validationState: { result: 'passed' | 'failed' | 'unknown' } = { result: 'unknown' };

      executor.on('run_completed', (runResult: RunResult) => {
        const testResult = runResult.suites.flatMap((s) => s.tests).find((t) => t.id === testId);
        if (testResult) {
          validationState.result = testResult.status === 'passed' ? 'passed' : 'failed';
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

      res.json({ status: 'started', message: 'Validation run initiated', testId });

      try {
        await executor.execute();
        deps.cache.invalidate('runs');
        deps.cache.invalidate('runs:summaries');
        deps.cache.invalidate('runs:all');

        if (validationState.result === 'passed') {
          await deps.flakyManager.current.releaseTest(testId, { resetHistory: true });
          deps.realtimeReporter.broadcastQuarantineUpdated(testId, 'validated_released', {
            validationResult: validationState.result,
          });
        }
      } catch (error: unknown) {
        log.error('Validation run failed', error instanceof Error ? error : undefined);
      }
    })
  );

  router.get(
    '/flaky/stats',
    asyncHandler(async (req: Request, res: Response) => {
      const stats = deps.flakyManager.current.getQuarantineStats();
      res.json(stats);
    })
  );

  router.delete(
    '/flaky/history',
    asyncHandler(async (req: Request, res: Response) => {
      await deps.flakyManager.current.clearHistory();
      deps.cache.invalidate('flaky');
      res.json({ success: true, message: 'Flaky test history cleared' });
    })
  );

  router.get(
    '/flaky/:testId/root-cause',
    asyncHandler(async (req: Request, res: Response) => {
      const analysis = await deps.flakyManager.current.analyzeRootCause(req.params.testId);
      if (!analysis) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found or no history available' });
        return;
      }
      res.json(analysis);
    })
  );

  router.get(
    '/flaky/correlations',
    asyncHandler(async (req: Request, res: Response) => {
      const groups = deps.flakyManager.current.analyzeCorrelations();
      res.json(groups);
    })
  );

  router.get(
    '/flaky/by-classification',
    asyncHandler(async (req: Request, res: Response) => {
      const classification = req.query.classification as string;
      if (!classification) {
        const stats = deps.flakyManager.current.getQuarantineStats();
        res.json(stats.classificationBreakdown);
        return;
      }
      const tests = deps.flakyManager.current.getTestsByClassification(classification as any);
      res.json(tests);
    })
  );

  router.get(
    '/flaky/trend/:testId',
    asyncHandler(async (req: Request, res: Response) => {
      const trend = await deps.flakyManager.current.analyzeTrend(req.params.testId);
      if (!trend) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found or no trend data' });
        return;
      }
      res.json(trend);
    })
  );

  router.get(
    '/flaky/trends',
    asyncHandler(async (_req: Request, res: Response) => {
      const trends = await deps.flakyManager.current.analyzeAllTrends();
      res.json(Object.fromEntries(trends));
    })
  );

  router.get(
    '/flaky/health',
    asyncHandler(async (_req: Request, res: Response) => {
      const health = deps.flakyManager.current.getOverallHealthScore();
      res.json(health);
    })
  );

  router.get(
    '/flaky/prediction/:testId',
    asyncHandler(async (req: Request, res: Response) => {
      const prediction = await deps.flakyManager.current.predictTestFailure(req.params.testId);
      if (!prediction) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found or no prediction data' });
        return;
      }
      res.json(prediction);
    })
  );

  router.get(
    '/flaky/predictions/high-risk',
    asyncHandler(async (_req: Request, res: Response) => {
      const predictions = deps.flakyManager.current.getHighRiskTests();
      res.json(predictions);
    })
  );

  router.get(
    '/flaky/duration-anomalies',
    asyncHandler(async (_req: Request, res: Response) => {
      const anomalies = deps.flakyManager.current.getDurationAnomalies();
      res.json(anomalies);
    })
  );

  router.get(
    '/causal-graph',
    asyncHandler(async (_req: Request, res: Response) => {
      const graph = await deps.flakyManager.current.buildCausalGraph();
      const serialized = {
        nodes: graph.nodes,
        edges: graph.edges,
        rootCauses: graph.rootCauses,
        impactMap: Object.fromEntries(graph.impactMap),
        builtAt: graph.builtAt,
      };
      res.json(serialized);
    })
  );

  router.get(
    '/impact-analysis/:testId',
    asyncHandler(async (req: Request, res: Response) => {
      const impact = await deps.flakyManager.current.analyzeImpact(req.params.testId);
      if (!impact) {
        res.status(HTTP_STATUS.NOT_FOUND).json({ error: 'Test not found or no causal graph data' });
        return;
      }
      res.json(impact);
    })
  );

  return router;
}
