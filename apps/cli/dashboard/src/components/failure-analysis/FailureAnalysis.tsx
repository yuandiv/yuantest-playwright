import React, { useState, useEffect, useCallback } from 'react';
import { Lang, t } from '../../i18n';
import { RunReport } from '../../types';
import * as api from '../../services/api';
import { FailureDistributionTab } from './FailureDistributionTab';
import { PersistentFailuresTab } from './PersistentFailuresTab';
import { EmergingFailuresTab } from './EmergingFailuresTab';
import { FirstTimeFailuresTab } from './FirstTimeFailuresTab';

interface FailureAnalysisProps {
  lang: Lang;
  reports: RunReport[];
  onRefresh: () => Promise<void>;
}

type FailureTabType = 'distribution' | 'persistent' | 'emerging' | 'firstTime';

interface SummaryData {
  total: number;
  persistent: number;
  emerging: number;
  firstTimeFailures: number;
  byCategory: Record<string, number>;
}

export const FailureAnalysis: React.FC<FailureAnalysisProps> = ({ lang, reports, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<FailureTabType>('distribution');
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getFailureAnalysis();
      if (data && !Array.isArray(data)) {
        setSummary(data as unknown as SummaryData);
      } else {
        const fromReports = computeSummaryFromReports(reports);
        setSummary(fromReports);
      }
    } catch (e) {
      const fromReports = computeSummaryFromReports(reports);
      setSummary(fromReports);
    } finally {
      setLoading(false);
    }
  }, [reports]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      await loadSummary();
    } finally {
      setIsRefreshing(false);
    }
  };

  const computeSummaryFromReports = (reportList: RunReport[]): SummaryData | null => {
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
  };

  const categorizeErrorLocal = (error: string): string => {
    const lower = error.toLowerCase();
    if (/timeout|timed?\s*out|exceeded.*time/.test(lower)) return 'timeout';
    if (/selector|element.*not.*found|waiting.*locator|no.*element/.test(lower)) return 'selector';
    if (/network|fetch|econnrefused|dns|net::|request.*fail|err_connection|cors/.test(lower)) return 'network';
    if (/assert|expect.*received|expected.*but/.test(lower)) return 'assertion';
    if (/frame|iframe|context.*destroyed|page.*closed/.test(lower)) return 'frame';
    if (/auth|unauthorized|forbidden|401|403|login|token/.test(lower)) return 'auth';
    return 'unknown';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 text-sm">{t('loading', lang)}</p>
      </div>
    );
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check-circle text-2xl text-green-400"></i>
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
    );
  }

  const tabs = [
    { key: 'distribution' as const, label: t('failureDistribution', lang), count: summary.total },
    { key: 'persistent' as const, label: t('persistentFailures', lang), count: summary.persistent },
    { key: 'emerging' as const, label: t('emergingFailures', lang), count: summary.emerging },
    { key: 'firstTime' as const, label: t('firstTimeFailures', lang), count: summary.firstTimeFailures },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            <i className="fas fa-bug mr-1.5 text-red-500"></i>
            {t('failureAnalysis', lang) || '失败分析'}
          </h3>
          <span className="text-xs text-gray-400">{summary.total} {t('items', lang)}</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer text-blue-600 bg-blue-50 border-blue-200 hover:bg-blue-100 disabled:opacity-50"
        >
          <i className={`fas fa-sync-alt mr-1 ${isRefreshing ? 'animate-spin' : ''}`}></i>
          {t('refresh', lang)}
        </button>
      </div>

      <div className="mb-4">
        <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-gray-800 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div>
        {activeTab === 'distribution' && (
          <FailureDistributionTab
            lang={lang}
            summary={summary}
            reports={reports}
          />
        )}
        {activeTab === 'persistent' && (
          <PersistentFailuresTab
            lang={lang}
            reports={reports}
          />
        )}
        {activeTab === 'emerging' && (
          <EmergingFailuresTab
            lang={lang}
            reports={reports}
          />
        )}
        {activeTab === 'firstTime' && (
          <FirstTimeFailuresTab
            lang={lang}
            reports={reports}
          />
        )}
      </div>
    </div>
  );
};

export default FailureAnalysis;
