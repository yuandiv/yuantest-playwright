import { useState, useCallback, useMemo } from 'react';
import * as api from '../services/api';
import type { RunReport } from '../types';
import { ReportDataService } from '../services/report-data-service';

export function useReports() {
  const [reports, setReports] = useState<RunReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  // Track if a running report was found during loadRunsFromServer
  const [isExecutingFromReports, setIsExecutingFromReports] = useState(false);

  const reportDataService = useMemo(() => new ReportDataService(), []);

  const loadRunsFromServer = useCallback(async (): Promise<void> => {
    try {
      const response = await api.getRuns(20);
      if (!response) return;
      const runs = Array.isArray(response) ? response : (response as any).data || [];

      const newReports: RunReport[] = [];
      for (const run of runs) {
        const rawReport = await loadRawReport(run.id);
        newReports.push(reportDataService.convertToRunReport(run, rawReport));
      }

      setReports((prev) => reportDataService.mergeReports(prev, newReports));

      const runningReport = reportDataService.findRunningReport(newReports);
      if (runningReport) {
        setIsExecutingFromReports(true);
        setActiveReportId(runningReport.id);
      }
    } catch (error) {
      console.error('Failed to load runs from server:', error);
    }
  }, [reportDataService]);

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

/**
 * 获取单条运行的原始 Playwright 报告
 *
 * 若请求失败或返回非 200，返回 null（由调用方处理兜底逻辑）
 */
async function loadRawReport(runId: number): Promise<any> {
  try {
    const response = await fetch(`/api/v1/runs/${runId}/raw`);
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.warn('Failed to load raw Playwright report:', e);
  }
  return null;
}
