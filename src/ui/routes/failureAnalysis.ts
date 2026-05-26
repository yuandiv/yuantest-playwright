import { Router, Request, Response } from 'express';
import type { RouterDeps } from './types';
import { asyncHandler } from '../../middleware';
import { categorizeError, generateSuggestions } from '../../diagnosis/categorizer';
import type { ReportFailureSummary, ReportFailureItem } from '../../types';

export function createFailureAnalysisRouter(deps: RouterDeps): Router {
  const router = Router();

  router.get(
    '/failures/analysis',
    asyncHandler(async (req: Request, res: Response) => {
      const filter = req.query.filter as 'persistent' | 'emerging' | 'immediate' | undefined;

      const allReports = await deps.reporter.current.getAllReports();

      const failedTestMap = new Map<
        string,
        {
          count: number;
          error: string;
          title: string;
          lastFailureTime: number;
          firstFailureTime: number;
          filePath?: string;
          lineNumber?: number;
        }
      >();

      for (const report of allReports) {
        for (const suite of report.suites) {
          for (const test of suite.tests) {
            if (test.status === 'failed' || test.status === 'timedout') {
              const existing = failedTestMap.get(test.id);
              if (existing) {
                existing.count++;
                if (test.timestamp > existing.lastFailureTime) {
                  existing.lastFailureTime = test.timestamp;
                }
                if (test.timestamp < existing.firstFailureTime) {
                  existing.firstFailureTime = test.timestamp;
                }
              } else {
                failedTestMap.set(test.id, {
                  count: 1,
                  error: test.error || '',
                  title: test.title,
                  lastFailureTime: test.timestamp,
                  firstFailureTime: test.timestamp,
                  filePath: test.file,
                  lineNumber: test.line,
                });
              }
            }
          }
        }
      }

      if (!filter) {
        const byCategory: Record<string, number> = {};
        for (const [, info] of failedTestMap) {
          const cat = categorizeError(info.error);
          byCategory[cat] = (byCategory[cat] || 0) + 1;
        }

        const summary: ReportFailureSummary = {
          total: failedTestMap.size,
          persistent: Array.from(failedTestMap.values()).filter((t) => t.count >= 3).length,
          emerging: Array.from(failedTestMap.values()).filter((t) => t.count >= 2).length,
          firstTimeFailures: Array.from(failedTestMap.values()).filter((t) => t.count === 1).length,
          byCategory,
        };
        res.json(summary);
        return;
      }

      let filteredEntries: Array<
        [string, typeof failedTestMap extends Map<string, infer V> ? V : never]
      >;
      if (filter === 'persistent') {
        filteredEntries = Array.from(failedTestMap.entries()).filter(([, v]) => v.count >= 3);
      } else if (filter === 'emerging') {
        filteredEntries = Array.from(failedTestMap.entries()).filter(([, v]) => v.count >= 2);
      } else if (filter === 'immediate') {
        filteredEntries = Array.from(failedTestMap.entries()).filter(([, v]) => v.count === 1);
      } else {
        filteredEntries = [];
      }

      const items: ReportFailureItem[] = filteredEntries.map(([testId, info]) => ({
        testId,
        title: info.title,
        error: info.error,
        category: categorizeError(info.error),
        failureCount: info.count,
        lastFailureTime: info.lastFailureTime,
        firstFailureTime: info.firstFailureTime,
        filePath: info.filePath,
        lineNumber: info.lineNumber,
        suggestions: generateSuggestions(info.error, 'zh'),
      }));

      res.json(items);
    })
  );

  router.get(
    '/analysis/:runId',
    asyncHandler(async (req: Request, res: Response) => {
      const run = await deps.reporter.current.getReport(req.params.runId);
      if (!run) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      const analysis = await deps.reporter.current.analyzeFailures(run);
      res.json(analysis);
    })
  );

  return router;
}
