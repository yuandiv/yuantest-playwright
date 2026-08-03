import React, { useState, useEffect, useCallback } from 'react';
import { Lang, t } from '../../i18n';
import { RunReport } from '../../types';
import * as api from '../../services/api';

interface EmergingFailuresTabProps {
  lang: Lang;
  reports: RunReport[];
}

interface FailureItem {
  id: string;
  title: string;
  error?: string;
  category?: string;
  failureCount?: number;
  lastFailureTime?: number;
  firstFailureTime?: number;
}

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; text: string }> = {
  timeout: { icon: 'fas fa-clock', color: 'text-yellow-600', text: 'bg-yellow-100 text-yellow-700' },
  selector: { icon: 'fas fa-crosshairs', color: 'text-purple-600', text: 'bg-purple-100 text-purple-700' },
  network: { icon: 'fas fa-wifi', color: 'text-blue-600', text: 'bg-blue-100 text-blue-700' },
  assertion: { icon: 'fas fa-exclamation-triangle', color: 'text-red-600', text: 'bg-red-100 text-red-700' },
  frame: { icon: 'fas fa-window-restore', color: 'text-orange-600', text: 'bg-orange-100 text-orange-700' },
  auth: { icon: 'fas fa-lock', color: 'text-cyan-600', text: 'bg-cyan-100 text-cyan-700' },
  unknown: { icon: 'fas fa-question-circle', color: 'text-gray-600', text: 'bg-gray-100 text-gray-700' },
};

export const EmergingFailuresTab: React.FC<EmergingFailuresTabProps> = ({ lang, reports }) => {
  const [failedItems, setFailedItems] = useState<FailureItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

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

  const loadEmergingFailures = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getFailureAnalysis('emerging');
      if (data && Array.isArray(data) && data.length > 0) {
        const items: FailureItem[] = (data as any[]).map((d: any) => ({
          id: d.testId || d.id,
          title: d.title,
          error: d.error,
          category: d.category,
          failureCount: d.failureCount || d.occurrences,
          lastFailureTime: d.lastFailureTime,
          firstFailureTime: d.firstFailureTime,
        }));
        setFailedItems(items);
      } else {
        const fromReports = computeEmergingFailuresFromReports(reports);
        setFailedItems(fromReports);
      }
    } catch (e) {
      const fromReports = computeEmergingFailuresFromReports(reports);
      setFailedItems(fromReports);
    } finally {
      setLoading(false);
    }
  }, [reports]);

  const computeEmergingFailuresFromReports = (reportList: RunReport[]): FailureItem[] => {
    if (!reportList || reportList.length === 0) return [];

    const failedTestMap = new Map<string, { count: number; error: string; title: string; lastFailureTime: number; firstFailureTime: number }>();
    for (const report of reportList) {
      const details = report.details || [];
      for (const detail of details) {
        if (detail.status === 'failed') {
          const key = detail.name || detail.id;
          const existing = failedTestMap.get(key);
          const timestamp = new Date(report.timestamp).getTime();
          if (existing) {
            existing.count++;
            existing.lastFailureTime = timestamp;
          } else {
            failedTestMap.set(key, {
              count: 1,
              error: detail.error || '',
              title: detail.name,
              lastFailureTime: timestamp,
              firstFailureTime: timestamp,
            });
          }
        }
      }
    }

    const items: FailureItem[] = [];
    for (const [key, info] of failedTestMap) {
      if (info.count >= 2) {
        items.push({
          id: key,
          title: info.title,
          error: info.error,
          category: categorizeErrorLocal(info.error),
          failureCount: info.count,
          lastFailureTime: info.lastFailureTime,
          firstFailureTime: info.firstFailureTime,
        });
      }
    }

    return items;
  };

  useEffect(() => {
    loadEmergingFailures();
  }, [loadEmergingFailures]);

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (failedItems.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center">
        <i className="fas fa-check-circle text-2xl text-green-300 mb-2"></i>
        <p className="text-gray-400 text-xs">{t('noEmergingFailures', lang) || '没有新兴失败的用例'}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
        <h4 className="text-xs font-semibold text-blue-700">
          <i className="fas fa-bolt mr-1"></i>
          {t('emergingFailures', lang) || '新兴失败'} ({failedItems.length})
        </h4>
        <p className="text-[10px] text-blue-600 mt-0.5">
          {lang === 'zh' ? '连续失败2次及以上的用例' : 'Failed 2 or more times consecutively'}
        </p>
      </div>
      <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
        {failedItems.map((item) => {
          const config = getCategoryConfig(item.category || 'unknown');
          const isExpanded = expandedRows.has(item.id);
          return (
            <div key={item.id} className="hover:bg-gray-50 transition-all">
              <button
                onClick={() => toggleRow(item.id)}
                className="w-full text-left px-4 py-2.5 flex justify-between items-center cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-800 truncate" title={item.title}>{item.title}</p>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${config.text}`}>
                      {t(`category.${item.category}`, lang) || item.category}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-700">
                      {item.failureCount}x
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                    {item.lastFailureTime != null && (
                      <span><i className="fas fa-clock mr-0.5"></i>{new Date(item.lastFailureTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                    )}
                  </div>
                </div>
                <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-gray-400 text-xs ml-2`}></i>
              </button>
              {isExpanded && (
                <div className="px-4 pb-2.5 border-t border-gray-100 pt-2">
                  {item.error && (
                    <div className="bg-blue-50 rounded-lg p-2 mb-2">
                      <p className="text-[10px] font-medium text-blue-600 mb-0.5">{t('errorMessage', lang) || '错误信息'}</p>
                      <p className="text-xs text-blue-700 font-mono whitespace-pre-wrap">{item.error}</p>
                    </div>
                  )}
                  {item.firstFailureTime && item.lastFailureTime && (
                    <div className="text-[10px] text-gray-500">
                      <span className="mr-3">
                        <i className="fas fa-calendar-plus mr-0.5"></i>
                        {t('firstFailure', lang) || '首次失败'}: {new Date(item.firstFailureTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                      </span>
                      <span>
                        <i className="fas fa-calendar-check mr-0.5"></i>
                        {t('lastFailure', lang) || '最近失败'}: {new Date(item.lastFailureTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EmergingFailuresTab;
