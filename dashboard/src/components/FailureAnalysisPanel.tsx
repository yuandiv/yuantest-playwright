import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Lang, t } from '../i18n';
import { RunReport, AIDiagnosis, LLMConfig } from '../types';
import * as api from '../services/api';
import { ClusterCard } from './ClusterCard';

interface FailureAnalysisPanelProps {
  lang: Lang;
  reports: RunReport[];
  onRefresh: () => Promise<void>;
  onNavigateToFlakyTests?: () => void;
}

type FilterMode = 'none' | 'persistent' | 'emerging' | 'immediate';

interface SummaryData {
  total: number;
  persistent: number;
  emerging: number;
  firstTimeFailures: number;
  byCategory: Record<string, number>;
}

interface FailureItem {
  id: string;
  title: string;
  error?: string;
  category?: string;
  failureCount?: number;
  lastFailureTime?: number;
  firstFailureTime?: number;
  suggestions?: string[];
}

interface ClusterData {
  clusterId: string;
  category: string;
  testIds: string[];
  similarity: number;
  diagnosis: AIDiagnosis | null;
  representativeError?: string;
}

function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return value;
}

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; text: string }> = {
  timeout: { icon: 'fas fa-clock', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'bg-yellow-100 text-yellow-700' },
  selector: { icon: 'fas fa-crosshairs', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'bg-purple-100 text-purple-700' },
  network: { icon: 'fas fa-wifi', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'bg-blue-100 text-blue-700' },
  assertion: { icon: 'fas fa-exclamation-triangle', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', text: 'bg-red-100 text-red-700' },
  unknown: { icon: 'fas fa-question-circle', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', text: 'bg-gray-100 text-gray-700' },
};

function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;
}

function categorizeErrorLocal(error: string): string {
  const lower = error.toLowerCase();
  if (/timeout|timed?\s*out|exceeded.*time/.test(lower)) return 'timeout';
  if (/selector|element.*not.*found|waiting.*locator|no.*element/.test(lower)) return 'selector';
  if (/network|fetch|econnrefused|dns|net::|request.*fail|err_connection|cors/.test(lower)) return 'network';
  if (/assert|expect.*received|expected.*but/.test(lower)) return 'assertion';
  if (/frame|iframe|context.*destroyed|page.*closed/.test(lower)) return 'frame';
  if (/auth|unauthorized|forbidden|401|403|login|token/.test(lower)) return 'auth';
  return 'unknown';
}

function FailureAnalysisPanel({ lang, reports, onRefresh, onNavigateToFlakyTests }: FailureAnalysisPanelProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('none');
  const [filteredItems, setFilteredItems] = useState<FailureItem[]>([]);
  const [runAnalysis, setRunAnalysis] = useState<FailureItem[]>([]);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [analyzingCluster, setAnalyzingCluster] = useState(false);
  const [llmEnabled, setLlmEnabled] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [customPatterns, setCustomPatterns] = useState<any[]>([]);
  const [showAddPattern, setShowAddPattern] = useState(false);
  const [newPattern, setNewPattern] = useState({
    id: '',
    category: 'unknown' as string,
    name: '',
    description: '',
    regex: '',
    rootCauseZh: '',
    rootCauseEn: '',
    suggestionsZh: '',
    suggestionsEn: '',
  });

  const testToClusterMap = useMemo(() => {
    const map = new Map<string, number>();
    clusters.forEach((cluster, index) => {
      cluster.testIds.forEach(testId => {
        map.set(testId, index + 1);
      });
    });
    return map;
  }, [clusters]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const computeSummaryFromReports = useCallback((reportList: RunReport[]): SummaryData | null => {
    if (!reportList || reportList.length === 0) return null;

    const failedTestMap = new Map<string, { count: number; error: string; title: string }>();
    for (const report of reportList) {
      const details = report.details || [];
      for (const detail of details) {
        if (detail.status === 'failed') {
          const key = detail.name || detail.id;
          const existing = failedTestMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            failedTestMap.set(key, {
              count: 1,
              error: detail.error || '',
              title: detail.name,
            });
          }
        }
      }
    }

    if (failedTestMap.size === 0) return null;

    const byCategory: Record<string, number> = {};
    for (const [, info] of failedTestMap) {
      const cat = categorizeErrorLocal(info.error);
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return {
      total: failedTestMap.size,
      persistent: Array.from(failedTestMap.values()).filter(t => t.count >= 3).length,
      emerging: Array.from(failedTestMap.values()).filter(t => t.count >= 2).length,
      firstTimeFailures: Array.from(failedTestMap.values()).filter(t => t.count === 1).length,
      byCategory,
    };
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getFailureAnalysis();
      if (data && !Array.isArray(data)) {
        const summaryData = data as unknown as SummaryData;
        if (summaryData.total > 0) {
          setSummary(summaryData);
        } else {
          const fromReports = computeSummaryFromReports(reports);
          setSummary(fromReports || summaryData);
        }
      } else {
        const fromReports = computeSummaryFromReports(reports);
        if (fromReports) {
          setSummary(fromReports);
        }
      }
    } catch (e) {
      const fromReports = computeSummaryFromReports(reports);
      if (fromReports) {
        setSummary(fromReports);
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load failure analysis');
      }
    } finally {
      setLoading(false);
    }
  }, [reports, computeSummaryFromReports]);

  const loadLLMConfig = useCallback(async () => {
    try {
      const config = await api.getLLMConfig();
      setLlmEnabled(config?.enabled ?? false);
    } catch {
      setLlmEnabled(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    loadLLMConfig();
  }, [loadSummary, loadLLMConfig]);

  useEffect(() => {
    if (!reports || reports.length === 0) return;
    if (summary && summary.total > 0) return;
    const fromReports = computeSummaryFromReports(reports);
    if (fromReports) {
      setSummary(fromReports);
    }
  }, [reports, summary, computeSummaryFromReports]);

  const computeFilteredItemsFromReports = useCallback((mode: FilterMode, reportList: RunReport[]): FailureItem[] => {
    if (!reportList || reportList.length === 0) return [];

    const failedTestMap = new Map<string, { count: number; error: string; title: string; lastFailureTime: number }>();
    for (const report of reportList) {
      const details = report.details || [];
      for (const detail of details) {
        if (detail.status === 'failed') {
          const key = detail.name || detail.id;
          const existing = failedTestMap.get(key);
          if (existing) {
            existing.count++;
            existing.lastFailureTime = new Date(report.timestamp).getTime();
          } else {
            failedTestMap.set(key, {
              count: 1,
              error: detail.error || '',
              title: detail.name,
              lastFailureTime: new Date(report.timestamp).getTime(),
            });
          }
        }
      }
    }

    const items: FailureItem[] = [];
    for (const [key, info] of failedTestMap) {
      const isPersistent = info.count >= 3;
      const isEmerging = info.count >= 2;
      const isFirstTime = info.count === 1;

      if (mode === 'persistent' && !isPersistent) continue;
      if (mode === 'emerging' && !isEmerging) continue;
      if (mode === 'immediate' && !isFirstTime) continue;

      items.push({
        id: key,
        title: info.title,
        error: info.error,
        category: categorizeErrorLocal(info.error),
        failureCount: info.count,
        lastFailureTime: info.lastFailureTime,
        suggestions: [],
      });
    }

    return items;
  }, []);

  const loadFilteredData = useCallback(async (mode: FilterMode) => {
    if (mode === 'none') {
      setFilteredItems([]);
      return;
    }
    try {
      const data = await api.getFailureAnalysis(mode);
      if (data && Array.isArray(data) && data.length > 0) {
        const items: FailureItem[] = (data as any[]).map((d: any) => ({
          id: d.testId || d.id,
          title: d.title,
          error: d.error,
          category: d.category,
          failureCount: d.failureCount || d.occurrences,
          lastFailureTime: d.lastFailureTime,
          firstFailureTime: d.firstFailureTime,
          suggestions: d.suggestions || [],
        }));
        setFilteredItems(items);
      } else {
        const fromReports = computeFilteredItemsFromReports(mode, reports);
        setFilteredItems(fromReports);
      }
    } catch {
      const fromReports = computeFilteredItemsFromReports(mode, reports);
      setFilteredItems(fromReports);
    }
  }, [reports, computeFilteredItemsFromReports]);

  useEffect(() => {
    loadFilteredData(filterMode);
  }, [filterMode, loadFilteredData]);

  const computeRunAnalysisFromReport = useCallback((runId: number, reportList: RunReport[]): FailureItem[] => {
    const report = reportList.find(r => r.id === runId);
    if (!report) return [];

    const details = report.details || [];
    const failedDetails = details.filter(d => d.status === 'failed');
    if (failedDetails.length === 0) return [];

    return failedDetails.map(detail => ({
      id: detail.id,
      title: detail.name,
      error: detail.error || undefined,
      category: categorizeErrorLocal(detail.error || ''),
      failureCount: 1,
      suggestions: [],
    }));
  }, []);

  const loadRunAnalysis = useCallback(async (runId: number) => {
    try {
      const data = await api.getRunAnalysis(runId);
      if (data && Array.isArray(data) && data.length > 0) {
        setRunAnalysis(data as FailureItem[]);
      } else {
        const fromReports = computeRunAnalysisFromReport(runId, reports);
        setRunAnalysis(fromReports);
      }
    } catch {
      const fromReports = computeRunAnalysisFromReport(runId, reports);
      setRunAnalysis(fromReports);
    }
  }, [reports, computeRunAnalysisFromReport]);

  useEffect(() => {
    if (selectedRunId !== null) {
      loadRunAnalysis(selectedRunId);
      setClusters([]);
      // 尝试恢复持久化的聚类结果
      const loadPersistedClusters = async () => {
        try {
          const result = await api.getPersistedClusterResult(selectedRunId);
          if (result.found && result.clusters.length > 0) {
            const report = reports.find(r => r.id === selectedRunId);
            const failedDetails = report?.details.filter(d => d.status === 'failed') || [];
            setClusters(result.clusters.map(c => {
              const representativeTest = failedDetails.find(d => d.id === c.testIds[0]);
              return {
                clusterId: c.clusterId,
                category: c.category,
                testIds: c.testIds,
                similarity: c.similarity,
                diagnosis: c.diagnosis as AIDiagnosis | null,
                representativeError: representativeTest?.error || c.errorMessage,
              };
            }));
          }
        } catch {
          // 忽略恢复失败
        }
      };
      loadPersistedClusters();
    }
  }, [selectedRunId, loadRunAnalysis]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      await loadSummary();
      if (selectedRunId !== null) {
        await loadRunAnalysis(selectedRunId);
      }
      if (filterMode !== 'none') {
        await loadFilteredData(filterMode);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClusterAnalysis = async () => {
    if (selectedRunId === null) return;
    const report = reports.find(r => r.id === selectedRunId);
    if (!report) return;
    const failedDetails = report.details.filter(d => d.status === 'failed');
    if (failedDetails.length < 2) return;

    if (!llmEnabled) return;

    setAnalyzingCluster(true);
    try {
      const testResults = failedDetails.map(d => ({
        id: d.id,
        title: d.name,
        error: d.error || undefined,
        stackTrace: d.stackTrace || undefined,
        file: d.file || undefined,
        line: d.line || undefined,
        screenshots: d.screenshots || undefined,
        logs: d.logs || undefined,
        browser: d.browser || undefined,
      }));
      const result = await api.requestClusterDiagnosis(testResults, lang, selectedRunId);
      if (result && result.clusters) {
        setClusters(result.clusters.map(c => {
          const representativeTest = failedDetails.find(d => d.id === c.testIds[0]);
          return {
            clusterId: c.clusterId,
            category: c.category,
            testIds: c.testIds,
            similarity: c.similarity,
            diagnosis: c.diagnosis as AIDiagnosis | null,
            representativeError: representativeTest?.error || c.errorMessage,
          };
        }));
      }
    } catch {
      setClusters([]);
    } finally {
      setAnalyzingCluster(false);
    }
  };

  const handleCardClick = (mode: FilterMode) => {
    setFilterMode(prev => prev === mode ? 'none' : mode);
  };

  const loadCustomPatterns = useCallback(async () => {
    try {
      const data = await api.getCustomErrorPatterns();
      if (data) {
        setCustomPatterns(data);
      }
    } catch {
      setCustomPatterns([]);
    }
  }, []);

  useEffect(() => {
    loadCustomPatterns();
  }, [loadCustomPatterns]);

  const handleAddPattern = async () => {
    if (!newPattern.id || !newPattern.name || !newPattern.regex) return;
    try {
      await api.addErrorPattern({
        id: newPattern.id,
        category: newPattern.category as any,
        name: newPattern.name,
        description: newPattern.description,
        regex: newPattern.regex.split('\n').filter(Boolean),
        rootCauseTemplate: { zh: newPattern.rootCauseZh, en: newPattern.rootCauseEn },
        suggestionsTemplate: {
          zh: newPattern.suggestionsZh.split('\n').filter(Boolean),
          en: newPattern.suggestionsEn.split('\n').filter(Boolean),
        },
      });
      setShowAddPattern(false);
      setNewPattern({ id: '', category: 'unknown', name: '', description: '', regex: '', rootCauseZh: '', rootCauseEn: '', suggestionsZh: '', suggestionsEn: '' });
      await loadCustomPatterns();
    } catch {
      // ignore
    }
  };

  const handleDeletePattern = async (patternId: string) => {
    try {
      await api.deleteErrorPattern(patternId);
      await loadCustomPatterns();
    } catch {
      // ignore
    }
  };

  const selectedReport = reports.find(r => r.id === selectedRunId);
  const failedCountInSelectedRun = selectedReport?.details.filter(d => d.status === 'failed').length ?? 0;

  const groupedRunAnalysis = runAnalysis.reduce<Record<string, FailureItem[]>>((acc, item) => {
    const cat = item.category || 'unknown';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
          <p className="text-gray-500 text-sm">{t('loading', lang)}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <i className="fas fa-exclamation-circle text-2xl text-red-500"></i>
          </div>
          <p className="text-red-500 text-sm mb-3">{error}</p>
          <button
            onClick={loadSummary}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-all cursor-pointer"
          >
            {t('retryDiagnosis', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mb-4">
            <i className="fas fa-chart-bar text-2xl text-gray-400"></i>
          </div>
          <p className="text-gray-500 text-sm mb-1">{t('noFailureData', lang)}</p>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="mt-3 px-4 py-2 bg-blue-50 text-blue-600 text-sm rounded-lg hover:bg-blue-100 transition-all cursor-pointer disabled:opacity-50"
          >
            <i className={`fas fa-sync-alt mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`}></i>
            {t('refresh', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5">
        <div className="flex flex-wrap gap-3 mb-5 items-center">
          {onNavigateToFlakyTests && (
            <button
              onClick={onNavigateToFlakyTests}
              className="text-xs px-3 py-1.5 rounded-lg border text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100 cursor-pointer"
            >
              <i className="fas fa-arrow-left mr-1"></i>{t('backToFlakyTests', lang) || '不稳定用例'}
            </button>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-gray-700">
              <i className="fas fa-play-circle mr-1.5 text-gray-400"></i>
              {t('selectRun', lang)}
            </label>
            <select
              value={selectedRunId ?? ''}
              onChange={e => setSelectedRunId(e.target.value ? Number(e.target.value) : null)}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all min-w-[220px]"
            >
              <option value="">{t('selectRun', lang)}</option>
              {reports.slice(0, 20).map(r => (
                <option key={r.id} value={r.id}>
                  #{r.id} · {new Date(r.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {t('passed', lang)}/{t('failed', lang)}: {r.passed}/{r.failed}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleClusterAnalysis}
            disabled={selectedRunId === null || failedCountInSelectedRun < 2 || analyzingCluster}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-violet-600 bg-violet-50 border-violet-200 hover:bg-violet-100 hover:text-violet-700"
            title={
              failedCountInSelectedRun < 2
                ? t('minTestsForCluster', lang)
                : t('clusterAnalysis', lang)
            }
          >
            <i className={`fas ${analyzingCluster ? 'fa-spinner animate-spin' : 'fa-project-diagram'}`}></i>
            <span>{analyzingCluster ? t('analyzingCluster', lang) : t('clusterAnalysis', lang)}</span>
          </button>

          <div className="flex-1"></div>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border transition-all cursor-pointer ${
              isRefreshing
                ? 'text-blue-600 bg-blue-50 border-blue-200 cursor-wait'
                : 'text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100 hover:text-blue-700'
            }`}
          >
            <i className={`fas ${isRefreshing ? 'fa-sync-alt animate-spin' : 'fa-sync-alt'}`}></i>
            <span>{t('refresh', lang)}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
          <button
            onClick={() => handleCardClick('none')}
            className={`bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
              filterMode === 'none' ? 'border-amber-300 ring-2 ring-amber-200' : 'border-amber-100'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <i className="fas fa-bug text-sm text-white"></i>
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-1">{t('noFlakyTests', lang).replace(/未检测到|No/, '').trim() || t('total', lang)}</div>
            <div className="text-2xl font-bold text-amber-600">{summary.total}</div>
          </button>

          <button
            onClick={() => handleCardClick('persistent')}
            className={`bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-4 border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
              filterMode === 'persistent' ? 'border-red-300 ring-2 ring-red-200' : 'border-red-100'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                <i className="fas fa-fire text-sm text-white"></i>
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-1">{t('persistentFailures', lang)}</div>
            <div className="text-2xl font-bold text-red-600">{summary.persistent}</div>
          </button>

          <button
            onClick={() => handleCardClick('emerging')}
            className={`bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-4 border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
              filterMode === 'emerging' ? 'border-blue-300 ring-2 ring-blue-200' : 'border-blue-100'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                <i className="fas fa-bolt text-sm text-white"></i>
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-1">{t('emergingFailures', lang)}</div>
            <div className="text-2xl font-bold text-blue-600">{summary.emerging}</div>
          </button>

          <button
            onClick={() => handleCardClick('immediate')}
            className={`bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
              filterMode === 'immediate' ? 'border-orange-300 ring-2 ring-orange-200' : 'border-orange-100'
            }`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <i className="fas fa-exclamation text-sm text-white"></i>
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-1">{t('firstTimeFailures', lang)}</div>
            <div className="text-2xl font-bold text-orange-600">{summary.firstTimeFailures ?? 0}</div>
          </button>

          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-100 transition-all duration-200">
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                <i className="fas fa-chart-pie text-sm text-white"></i>
              </div>
            </div>
            <div className="text-xs text-gray-600 mb-1">{t('categoryDistribution', lang)}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {Object.entries(summary.byCategory).map(([cls, count]) => (
                <span key={cls} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                  {cls}: {count}
                </span>
              ))}
            </div>
          </div>
        </div>

        {filterMode !== 'none' && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                <i className={`fas ${
                  filterMode === 'persistent' ? 'fa-fire text-red-500' :
                  filterMode === 'emerging' ? 'fa-bolt text-blue-500' :
                  'fa-exclamation text-orange-500'
                } mr-1.5`}></i>
                {filterMode === 'persistent' ? t('persistentFailures', lang) :
                 filterMode === 'emerging' ? t('emergingFailures', lang) :
                 t('firstTimeFailures', lang)}
              </h3>
              <span className="text-xs text-gray-400">{filteredItems.length} {t('items', lang)}</span>
            </div>
            {filteredItems.length === 0 ? (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
                <i className="fas fa-check-circle text-2xl text-green-300 mb-2"></i>
                <p className="text-gray-400 text-xs">{t('noFailuresInRun', lang)}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map(item => (
                  <div key={item.id} className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg overflow-hidden hover:shadow-md transition-all">
                    <button
                      onClick={() => toggleRow(item.id)}
                      className="w-full text-left p-3 flex justify-between items-center cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm text-gray-800 truncate" title={item.title}>{item.title}</p>
                          {item.category && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 ${
                              item.category === 'timeout' ? 'bg-yellow-100 text-yellow-700' :
                              item.category === 'selector' ? 'bg-purple-100 text-purple-700' :
                              item.category === 'network' ? 'bg-blue-100 text-blue-700' :
                              item.category === 'assertion' ? 'bg-red-100 text-red-700' :
                              item.category === 'frame' ? 'bg-orange-100 text-orange-700' :
                              item.category === 'auth' ? 'bg-cyan-100 text-cyan-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {t(`category.${item.category}`, lang)}
                            </span>
                          )}
                          {filterMode === 'immediate' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium flex-shrink-0 bg-orange-100 text-orange-700">
                              {t('firstTime', lang)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          {item.failureCount != null && (
                            <span><i className="fas fa-arrow-down mr-0.5"></i>{t('consecutiveFailures', lang)}: {item.failureCount}</span>
                          )}
                          {item.lastFailureTime != null && (
                            <span><i className="fas fa-clock mr-0.5"></i>{new Date(item.lastFailureTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                          )}
                          {item.error && filterMode === 'immediate' && (
                            <span className="truncate"><i className="fas fa-times-circle mr-0.5"></i>{item.error}</span>
                          )}
                        </div>
                      </div>
                      <i className={`fas ${expandedRows.has(item.id) ? 'fa-chevron-up' : 'fa-chevron-down'} text-gray-400 text-xs ml-2`}></i>
                    </button>
                    {expandedRows.has(item.id) && item.suggestions && item.suggestions.length > 0 && (
                      <div className="px-3 pb-3 border-t border-gray-100 pt-2">
                        <div className="bg-blue-50 rounded-lg p-2.5">
                          <p className="text-xs font-medium text-blue-700 mb-1">
                            <i className="fas fa-lightbulb mr-1"></i>{t('suggestions', lang)}
                          </p>
                          <ul className="text-[10px] text-blue-500 space-y-0.5">
                            {item.suggestions!.map((suggestion, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <i className="fas fa-chevron-right mt-0.5 text-[8px]"></i>
                                <span>{suggestion}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selectedRunId !== null && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                <i className="fas fa-clipboard-list mr-1.5 text-indigo-500"></i>
                {t('runFailureAnalysis', lang)}
              </h3>
              {selectedReport && (
                <span className="text-xs text-gray-400">
                  #{selectedReport.id} · {t('passFailCount', lang)}: {selectedReport.passed}/{selectedReport.failed}
                </span>
              )}
            </div>
            {runAnalysis.length === 0 ? (
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
                <i className="fas fa-check-circle text-2xl text-green-300 mb-2"></i>
                <p className="text-gray-400 text-xs">{t('noFailuresInRun', lang)}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedRunAnalysis).map(([category, items]) => {
                  const catConfig = getCategoryConfig(category);
                  const totalCount = runAnalysis.length;
                  const catCount = items.length;
                  const percentage = totalCount > 0 ? (catCount / totalCount) * 100 : 0;
                  return (
                    <div key={category} className={`rounded-xl border ${catConfig.border} overflow-hidden`}>
                      <div className={`${catConfig.bg} px-4 py-2.5 flex items-center justify-between`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${
                            category === 'timeout' ? 'from-yellow-500 to-amber-600' :
                            category === 'selector' ? 'from-purple-500 to-violet-600' :
                            category === 'network' ? 'from-blue-500 to-cyan-600' :
                            category === 'assertion' ? 'from-red-500 to-rose-600' :
                            'from-gray-500 to-gray-600'
                          } flex items-center justify-center`}>
                            <i className={`${catConfig.icon} text-xs text-white`}></i>
                          </div>
                          <span className={`text-sm font-semibold ${catConfig.color}`}>
                            {t(`category.${category}`, lang)}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${catConfig.text}`}>
                            {catCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 bg-white/60 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                category === 'timeout' ? 'bg-yellow-500' :
                                category === 'selector' ? 'bg-purple-500' :
                                category === 'network' ? 'bg-blue-500' :
                                category === 'assertion' ? 'bg-red-500' :
                                'bg-gray-500'
                              }`}
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] text-gray-500">{percentage.toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {items.map(item => (
                          <div key={item.id} className="px-4 py-2.5 hover:bg-gray-50 transition-all">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate" title={item.title}>{item.title}</p>
                                {item.error && (
                                  <p className="text-xs text-red-500 mt-0.5 truncate" title={item.error}>
                                    <i className="fas fa-times-circle mr-0.5"></i>{t('errorReason', lang)}: {item.error}
                                  </p>
                                )}
                                <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                                  {item.failureCount != null && (
                                    <span><i className="fas fa-redo mr-0.5"></i>{t('occurrences', lang)}: {item.failureCount}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {item.suggestions && item.suggestions.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {item.suggestions.map((s, idx) => (
                                  <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 border border-green-100">
                                    <i className="fas fa-lightbulb mr-0.5"></i>{s}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {clusters.length > 0 && (
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                <i className="fas fa-project-diagram mr-1.5 text-violet-500"></i>
                {t('clusterAnalysis', lang)}
              </h3>
              <span className="text-xs text-gray-400">{clusters.length} {t('clusterGroup', lang)}</span>
            </div>
            <div className="space-y-3">
              {clusters.map((cluster, index) => (
                <ClusterCard
                  key={cluster.clusterId}
                  lang={lang}
                  clusterIndex={index + 1}
                  category={cluster.category}
                  testIds={cluster.testIds}
                  similarity={cluster.similarity}
                  representativeError={cluster.representativeError}
                  diagnosis={cluster.diagnosis}
                />
              ))}
            </div>
          </div>
        )}

        {selectedRunId !== null && clusters.length === 0 && !analyzingCluster && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center mb-5">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-3">
              <i className="fas fa-project-diagram text-xl text-gray-400"></i>
            </div>
            <p className="text-gray-500 text-sm mb-1">{t('clusterAnalysis', lang)}</p>
            <p className="text-gray-400 text-xs">{failedCountInSelectedRun < 2 ? t('minTestsForCluster', lang) : t('clusterAnalysis', lang)}</p>
          </div>
        )}

        {analyzingCluster && (
          <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl p-6 text-center mb-5">
            <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-500 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-violet-600 text-sm">{t('analyzingCluster', lang)}</p>
          </div>
        )}

        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              <i className="fas fa-puzzle-piece mr-1.5 text-emerald-500"></i>
              {t('customPatternsTitle', lang)}
            </h3>
            <span className="text-xs text-gray-400">{customPatterns.length} {t('items', lang)}</span>
            <div className="flex-1"></div>
            <button
              onClick={() => setShowAddPattern(!showAddPattern)}
              className="text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700"
            >
              <i className={`fas ${showAddPattern ? 'fa-times' : 'fa-plus'} mr-1`}></i>
              {showAddPattern ? t('cancel', lang) : t('addPattern', lang)}
            </button>
          </div>
          <p className="text-xs text-gray-400 mb-3">{t('customPatternsDesc', lang)}</p>

          {showAddPattern && (
            <div className="bg-emerald-50 rounded-xl p-4 mb-3 border border-emerald-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('patternId', lang)} *</label>
                  <input
                    value={newPattern.id}
                    onChange={e => setNewPattern(p => ({ ...p, id: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="e.g. custom-db-connection"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('patternName', lang)} *</label>
                  <input
                    value={newPattern.name}
                    onChange={e => setNewPattern(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder={lang === 'zh' ? '例如：数据库连接失败' : 'e.g. Database Connection Failed'}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('patternCategory', lang)}</label>
                  <select
                    value={newPattern.category}
                    onChange={e => setNewPattern(p => ({ ...p, category: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {['timeout', 'selector', 'assertion', 'network', 'frame', 'auth', 'unknown'].map(cat => (
                      <option key={cat} value={cat}>{t(`category.${cat}`, lang)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('patternDescription', lang)}</label>
                  <input
                    value={newPattern.description}
                    onChange={e => setNewPattern(p => ({ ...p, description: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder={lang === 'zh' ? '模式描述' : 'Pattern description'}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('patternRegex', lang)} * ({lang === 'zh' ? '每行一个正则表达式' : 'One regex per line'})</label>
                  <textarea
                    value={newPattern.regex}
                    onChange={e => setNewPattern(p => ({ ...p, regex: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    rows={2}
                    placeholder={lang === 'zh' ? 'ECONNREFUSED\nconnection.*refused' : 'ECONNREFUSED\nconnection.*refused'}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('rootCause', lang)} (中文)</label>
                  <input
                    value={newPattern.rootCauseZh}
                    onChange={e => setNewPattern(p => ({ ...p, rootCauseZh: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('rootCause', lang)} (English)</label>
                  <input
                    value={newPattern.rootCauseEn}
                    onChange={e => setNewPattern(p => ({ ...p, rootCauseEn: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('suggestions', lang)} (中文, {lang === 'zh' ? '每行一条' : 'one per line'})</label>
                  <textarea
                    value={newPattern.suggestionsZh}
                    onChange={e => setNewPattern(p => ({ ...p, suggestionsZh: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{t('suggestions', lang)} (English, one per line)</label>
                  <textarea
                    value={newPattern.suggestionsEn}
                    onChange={e => setNewPattern(p => ({ ...p, suggestionsEn: e.target.value }))}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    rows={2}
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleAddPattern}
                  disabled={!newPattern.id || !newPattern.name || !newPattern.regex}
                  className="px-4 py-2 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="fas fa-check mr-1"></i>{t('savePattern', lang)}
                </button>
              </div>
            </div>
          )}

          {customPatterns.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
              <i className="fas fa-puzzle-piece text-2xl text-gray-300 mb-2"></i>
              <p className="text-gray-400 text-xs">{lang === 'zh' ? '暂无自定义错误模式' : 'No custom error patterns'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customPatterns.map(pattern => (
                <div key={pattern.id} className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg p-3 flex items-center justify-between hover:shadow-md transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-800">{pattern.name}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700">{pattern.category}</span>
                      <span className="text-[10px] text-gray-400 font-mono">{pattern.id}</span>
                    </div>
                    {pattern.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{pattern.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {pattern.regex.map((r: string, i: number) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-mono">{r}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePattern(pattern.id)}
                    className="ml-3 text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                    title={t('deletePattern', lang)}
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { FailureAnalysisPanel };
