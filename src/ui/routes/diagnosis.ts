import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';
import { logger } from '../../logger';
import type { RootCauseAnalysis } from '../../types';

export function createDiagnosisRouter(deps: RouterDeps): Router {
  const router = Router();
  const _log = logger.child('DiagnosisRouter');

  router.get(
    '/llm/config',
    asyncHandler(async (req: Request, res: Response) => {
      const config = deps.diagnosisService.getMaskedConfig();
      res.json(config);
    })
  );

  router.put(
    '/llm/config',
    asyncHandler(async (req: Request, res: Response) => {
      const config = req.body;
      await deps.diagnosisService.saveConfig(config);
      deps.aiService.updateLLMConfig(config);
      const maskedConfig = deps.diagnosisService.getMaskedConfig();
      res.json(maskedConfig);
    })
  );

  router.get(
    '/llm/status',
    asyncHandler(async (req: Request, res: Response) => {
      const status = await deps.diagnosisService.getStatus();
      res.json(status);
    })
  );

  router.post(
    '/llm/test-connection',
    asyncHandler(async (req: Request, res: Response) => {
      const config = req.body;
      const result = await deps.diagnosisService.testConnection(config);
      res.json(result);
    })
  );

  router.post(
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
        testId,
      } = req.body;

      const config = deps.diagnosisService.getMaskedConfig();
      if (!config.enabled || !config.baseUrl || !config.model) {
        res.json({ enabled: false, diagnosis: null });
        return;
      }

      let enrichedScreenshots = screenshots as string[] | undefined;
      let enrichedLogs = logs as string[] | undefined;
      let enrichedStackTrace = stackTrace as string | undefined;
      let enrichedBrowser = browser as string | undefined;

      if (runId) {
        const historicalTest = await deps.findTestInfoByRunId(runId, testTitle, file, line);
        if (historicalTest) {
          enrichedScreenshots = enrichedScreenshots || historicalTest.screenshots;
          enrichedLogs = enrichedLogs || historicalTest.logs;
          enrichedStackTrace = enrichedStackTrace || historicalTest.stackTrace;
          enrichedBrowser = enrichedBrowser || historicalTest.browser;
        }
      }

      try {
        let rootCauseData: RootCauseAnalysis | undefined;
        try {
          const flakyTests = deps.flakyManager.current.getFlakyTests();
          const flakyTest = flakyTests.find((ft) => ft.testId === testId);
          if (flakyTest?.rootCause) {
            rootCauseData = flakyTest.rootCause;
          }
        } catch {
          // Ignore errors when accessing flaky test data
        }

        const diagnosis = await deps.diagnosisService.diagnose(
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
          lang || 'zh',
          runId,
          testId,
          rootCauseData
        );
        res.json({ enabled: true, diagnosis });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.json({ enabled: true, diagnosis: null, error: errorMessage });
      }
    })
  );

  router.post(
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
        testId,
      } = req.body;

      const config = deps.diagnosisService.getMaskedConfig();
      if (!config.enabled || !config.baseUrl || !config.model) {
        res.json({ enabled: false, diagnosis: null });
        return;
      }

      let enrichedScreenshots = screenshots as string[] | undefined;
      let enrichedLogs = logs as string[] | undefined;
      let enrichedStackTrace = stackTrace as string | undefined;
      let enrichedBrowser = browser as string | undefined;

      if (runId) {
        const historicalTest = await deps.findTestInfoByRunId(runId, testTitle, file, line);
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
        const stream = deps.diagnosisService.diagnoseStream(
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
          lang || 'zh',
          runId,
          testId
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

  router.get(
    '/diagnosis/persisted',
    asyncHandler(async (req: Request, res: Response) => {
      const { runId, testId } = req.query;

      if (!runId || !testId) {
        res.status(400).json({ error: 'runId and testId are required' });
        return;
      }

      try {
        const diagnosis = await deps.diagnosisService.loadDiagnosis(String(runId), String(testId));
        res.json({ found: !!diagnosis, diagnosis });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.json({ found: false, diagnosis: null, error: errorMessage });
      }
    })
  );

  router.get(
    '/diagnosis/cluster',
    asyncHandler(async (req: Request, res: Response) => {
      const { runId } = req.query;

      if (!runId) {
        res.status(400).json({ error: 'runId is required' });
        return;
      }

      try {
        const clusters = await deps.diagnosisService.loadClusterResult(String(runId));
        res.json({ found: !!clusters, clusters: clusters || [] });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.json({ found: false, clusters: [], error: errorMessage });
      }
    })
  );

  router.post(
    '/diagnosis/cluster',
    asyncHandler(async (req: Request, res: Response) => {
      const { testResults, lang, runId } = req.body;

      if (!Array.isArray(testResults)) {
        res.status(400).json({ error: 'testResults must be an array' });
        return;
      }

      try {
        const { clusterFailures } = await import('../../diagnosis/cluster');
        const clusters = clusterFailures(testResults);

        const config = deps.diagnosisService.getMaskedConfig();
        const llmEnabled = config.enabled && !!config.baseUrl && !!config.model;

        if (!llmEnabled) {
          const clusterResults = clusters.map((cluster) => ({
            clusterId: cluster.clusterId,
            category: cluster.category,
            testIds: cluster.testIds,
            similarity: cluster.similarity,
            errorMessage: cluster.errorMessage,
            diagnosis: null,
          }));
          if (runId) {
            await deps.diagnosisService.saveClusterResult(String(runId), clusterResults);
          }
          res.json({ enabled: false, clusters: clusterResults });
          return;
        }

        const diagnosisPromises = clusters.map(async (cluster) => {
          const representative = testResults.find(
            (t: Record<string, unknown>) => t.id === cluster.representativeTestId
          );
          if (!representative) {
            return {
              clusterId: cluster.clusterId,
              category: cluster.category,
              testIds: cluster.testIds,
              similarity: cluster.similarity,
              errorMessage: cluster.errorMessage,
              diagnosis: null,
            };
          }
          try {
            const diagnosis = await deps.diagnosisService.diagnose(
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
            return {
              clusterId: cluster.clusterId,
              category: cluster.category,
              testIds: cluster.testIds,
              similarity: cluster.similarity,
              errorMessage: cluster.errorMessage,
              diagnosis: {
                ...diagnosis,
                relatedFailures: cluster.testIds.filter(
                  (id: string) => id !== cluster.representativeTestId
                ),
              },
            };
          } catch {
            return {
              clusterId: cluster.clusterId,
              category: cluster.category,
              testIds: cluster.testIds,
              similarity: cluster.similarity,
              errorMessage: cluster.errorMessage,
              diagnosis: null,
            };
          }
        });

        const diagnoses = (await Promise.allSettled(diagnosisPromises))
          .map((result) => (result.status === 'fulfilled' ? result.value : null))
          .filter((r): r is NonNullable<typeof r> => r !== null);

        if (runId) {
          await deps.diagnosisService.saveClusterResult(String(runId), diagnoses);
        }

        res.json({ enabled: true, clusters: diagnoses });
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: errorMessage });
      }
    })
  );

  return router;
}
