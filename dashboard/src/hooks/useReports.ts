import { useState, useCallback } from 'react';
import * as api from '../services/api';
import type { RunReport, RunDetail } from '../types';

export function useReports() {
  const [reports, setReports] = useState<RunReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);

  const loadRunsFromServer = useCallback(async (): Promise<void> => {
    try {
      const response = await api.getRuns(20);
      if (!response) return;
      const runs = Array.isArray(response) ? response : (response as any).data || [];
      const newReports: RunReport[] = [];
      for (const run of runs) {
        const extractAllTestsFromPlaywright = (suites: any[]): any[] => {
          const tests: any[] = [];
          for (const suite of suites) {
            if (suite.specs && Array.isArray(suite.specs)) {
              tests.push(...suite.specs);
            }
            if (suite.suites && Array.isArray(suite.suites)) {
              tests.push(...extractAllTestsFromPlaywright(suite.suites));
            }
          }
          return tests;
        };

        const extractAllTestsFromRunResult = (suites: any[]): any[] => {
          const tests: any[] = [];
          for (const suite of suites) {
            if (suite.tests && Array.isArray(suite.tests)) {
              tests.push(...suite.tests);
            }
            if (suite.suites && Array.isArray(suite.suites)) {
              tests.push(...extractAllTestsFromRunResult(suite.suites));
            }
          }
          return tests;
        };

        let rawReport: any = null;
        try {
          const rawResponse = await fetch(`/api/v1/runs/${run.id}/raw`);
          if (rawResponse.ok) {
            rawReport = await rawResponse.json();
          }
        } catch (e) {
          console.warn('Failed to load raw Playwright report:', e);
        }

        const isPlaywrightFormat = rawReport?.suites?.some((s: any) => s.specs);
        const isRunResultFormat = rawReport?.suites?.some((s: any) => s.tests && !s.specs);

        let allTests: any[] = [];
        if (isPlaywrightFormat && rawReport?.suites) {
          allTests = extractAllTestsFromPlaywright(rawReport.suites);
        } else if (isRunResultFormat && rawReport?.suites) {
          allTests = extractAllTestsFromRunResult(rawReport.suites);
        } else if (run.suites) {
          allTests = extractAllTestsFromRunResult(run.suites);
        }

        const details = allTests.map((test: any) => {
          const testResult = test.tests?.[0]?.results?.[0] || test.results?.[0];
          const isPassed = test.ok === true || test.status === 'passed' || testResult?.status === 'passed';

          let attachments: any[] = [];

          if (testResult?.attachments && Array.isArray(testResult.attachments)) {
            attachments = testResult.attachments.map((att: any) => ({
              name: att.name,
              path: att.path,
              contentType: att.contentType,
              body: att.body,
            }));
          } else {
            if (test.screenshots && Array.isArray(test.screenshots)) {
              attachments.push(...test.screenshots.map((p: string) => ({
                name: 'screenshot',
                path: p,
                contentType: 'image/png',
              })));
            }
            if (test.videos && Array.isArray(test.videos)) {
              attachments.push(...test.videos.map((p: string) => ({
                name: 'video',
                path: p,
                contentType: 'video/webm',
              })));
            }
            if (test.traces && Array.isArray(test.traces)) {
              attachments.push(...test.traces.map((p: string) => ({
                name: 'trace',
                path: p,
                contentType: 'application/zip',
              })));
            }
          }

          let errorMessage = null;
          if (testResult?.error) {
            if (typeof testResult.error === 'string') {
              errorMessage = testResult.error;
            } else if (testResult.error.message) {
              errorMessage = testResult.error.message;
              if (testResult.error.stack) {
                errorMessage += '\n\nStack trace:\n' + testResult.error.stack;
              }
            } else if (testResult.error.value) {
              errorMessage = testResult.error.value;
            }
          } else if (test.error?.message) {
            errorMessage = test.error.message;
          } else if (test.error) {
            errorMessage = typeof test.error === 'string' ? test.error : test.error.message || String(test.error);
          }

          return {
            id: test.id || `${test.title}_${run.id}`,
            name: test.title,
            status: isPassed ? 'passed' as const : 'failed' as const,
            duration: ((test.duration || testResult?.duration || 0) / 1000).toFixed(2),
            error: errorMessage,
            attachments,
            file: test.file,
            line: test.line,
            retries: test.retries || testResult?.retry || 0,
            manualReruns: test.manualReruns || 0,
            runHistory: test.runHistory || undefined,
          };
        });

        newReports.push({
          id: run.id,
          timestamp: new Date(run.startTime).toISOString(),
          version: run.version || 'unknown',
          totalTests: run.totalTests,
          passed: run.passed,
          failed: run.failed,
          duration: ((run.duration || 0) / 1000).toFixed(2),
          details,
          htmlReportUrl: rawReport?.htmlReportUrl || null,
          skippedQuarantinedTests: run.metadata?.skippedQuarantinedTests || [],
          status: run.status === 'success' ? 'completed' : run.status,
        });
      }
      setReports(prev => {
        const newReportsMap = new Map(prev.map(r => [r.id, r]));
        for (const r of newReports) {
          newReportsMap.set(r.id, r);
        }
        return Array.from(newReportsMap.values())
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 50);
      });

      const runningReport = newReports.find(r => r.status === 'running');
      if (runningReport) {
        setIsExecutingFromReports(true);
        setActiveReportId(runningReport.id);
      }
    } catch (error) {
      console.error('Failed to load runs from server:', error);
    }
  }, []);

  // Track if a running report was found during loadRunsFromServer
  const [isExecutingFromReports, setIsExecutingFromReports] = useState(false);

  return {
    reports,
    setReports,
    activeReportId,
    setActiveReportId,
    loadRunsFromServer,
    isExecutingFromReports,
    setIsExecutingFromReports,
  };
}
