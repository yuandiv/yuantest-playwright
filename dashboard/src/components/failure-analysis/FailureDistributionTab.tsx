import React, { useState, useEffect, useCallback } from 'react';
import { Lang, t } from '../../i18n';
import { RunReport } from '../../types';
import * as api from '../../services/api';
import { CustomErrorPatternsDialog } from './CustomErrorPatternsDialog';

interface FailureDistributionTabProps {
  lang: Lang;
  summary: {
    total: number;
    byCategory: Record<string, number>;
  };
  reports: RunReport[];
}

interface FailureItem {
  id: string;
  title: string;
  error?: string;
  category?: string;
  failureCount?: number;
  lastFailureTime?: number;
}

const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; text: string }> = {
  timeout: { icon: 'fas fa-clock', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'bg-yellow-100 text-yellow-700' },
  selector: { icon: 'fas fa-crosshairs', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'bg-purple-100 text-purple-700' },
  network: { icon: 'fas fa-wifi', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'bg-blue-100 text-blue-700' },
  assertion: { icon: 'fas fa-exclamation-triangle', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', text: 'bg-red-100 text-red-700' },
  frame: { icon: 'fas fa-window-restore', color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', text: 'bg-orange-100 text-orange-700' },
  auth: { icon: 'fas fa-lock', color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'bg-cyan-100 text-cyan-700' },
  unknown: { icon: 'fas fa-question-circle', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', text: 'bg-gray-100 text-gray-700' },
};

export const FailureDistributionTab: React.FC<FailureDistributionTabProps> = ({ lang, summary, reports }) => {
  const [showPatternsDialog, setShowPatternsDialog] = useState(false);
  const [failedItems, setFailedItems] = useState<FailureItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

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

  const computeFailedItemsFromReports = useCallback((reportList: RunReport[]): FailureItem[] => {
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
      items.push({
        id: key,
        title: info.title,
        error: info.error,
        category: categorizeErrorLocal(info.error),
        failureCount: info.count,
        lastFailureTime: info.lastFailureTime,
      });
    }

    return items;
  }, []);

  useEffect(() => {
    const items = computeFailedItemsFromReports(reports);
    setFailedItems(items);
  }, [reports, computeFailedItemsFromReports]);

  const filteredItems = selectedCategory
    ? failedItems.filter(item => item.category === selectedCategory)
    : failedItems;

  const getCategoryConfig = (category: string) => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPatternsDialog(true)}
            className="text-xs px-3 py-1.5 rounded-lg border transition-all cursor-pointer text-emerald-600 bg-emerald-50 border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"
          >
            <i className="fas fa-puzzle-piece"></i>
            {t('customErrorPatterns', lang)}
            <span className="relative group">
              <i className="fas fa-question-circle text-gray-400 hover:text-emerald-600 cursor-help transition-colors"></i>
              <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-gray-200 text-xs rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-white">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-puzzle-piece"></i>
                    <span className="font-semibold">{lang === 'zh' ? '自定义错误模式说明' : 'Custom Error Patterns Guide'}</span>
                  </div>
                </div>
                <div className="p-4 space-y-2 text-left">
                  {lang === 'zh' ? (
                    <>
                      <p><span className="font-semibold text-gray-800">作用：</span><span className="text-gray-600">识别特定类型的测试失败，提升分析准确性</span></p>
                      <p><span className="font-semibold text-gray-800">原理：</span><span className="text-gray-600">正则表达式匹配错误信息，自动归类到指定类别</span></p>
                      <p><span className="font-semibold text-gray-800">配置项：</span><span className="text-gray-600">模式ID、名称、类别、正则、根本原因、修复建议</span></p>
                      <p><span className="font-semibold text-gray-800">效果：</span><span className="text-gray-600">匹配的错误自动归类，并显示诊断建议</span></p>
                    </>
                  ) : (
                    <>
                      <p><span className="font-semibold text-gray-800">Purpose:</span> <span className="text-gray-600">Identify specific test failures to improve analysis accuracy</span></p>
                      <p><span className="font-semibold text-gray-800">Principle:</span> <span className="text-gray-600">Regex matching to auto-categorize errors into specified types</span></p>
                      <p><span className="font-semibold text-gray-800">Configuration:</span> <span className="text-gray-600">Pattern ID, name, category, regex, root cause, suggestions</span></p>
                      <p><span className="font-semibold text-gray-800">Result:</span> <span className="text-gray-600">Matched errors auto-categorized with diagnostic suggestions</span></p>
                    </>
                  )}
                </div>
              </div>
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-3 border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
            selectedCategory === null ? 'border-amber-300 ring-2 ring-amber-200' : 'border-amber-100'
          }`}
        >
          <div className="flex items-start justify-between mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <i className="fas fa-bug text-sm text-white"></i>
            </div>
          </div>
          <div className="text-xs text-gray-600 mb-1">{t('total', lang)}</div>
          <div className="text-xl font-bold text-amber-600">{summary.total}</div>
        </button>

        {Object.entries(summary.byCategory).map(([category, count]) => {
          const config = getCategoryConfig(category);
          return (
            <button
              key={category}
              onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
              className={`${config.bg} rounded-xl p-3 border text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${
                selectedCategory === category ? `${config.border} ring-2 ring-${category === 'timeout' ? 'yellow' : category === 'selector' ? 'purple' : category === 'network' ? 'blue' : category === 'assertion' ? 'red' : 'gray'}-200` : config.border
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${
                  category === 'timeout' ? 'from-yellow-500 to-amber-600' :
                  category === 'selector' ? 'from-purple-500 to-violet-600' :
                  category === 'network' ? 'from-blue-500 to-cyan-600' :
                  category === 'assertion' ? 'from-red-500 to-rose-600' :
                  category === 'frame' ? 'from-orange-500 to-amber-600' :
                  category === 'auth' ? 'from-cyan-500 to-teal-600' :
                  'from-gray-500 to-gray-600'
                } flex items-center justify-center`}>
                  <i className={`${config.icon} text-sm text-white`}></i>
                </div>
              </div>
              <div className="text-xs text-gray-600 mb-1">{t(`category.${category}`, lang)}</div>
              <div className={`text-xl font-bold ${config.color}`}>{count}</div>
            </button>
          );
        })}
      </div>

      {filteredItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
            <h4 className="text-xs font-semibold text-gray-700">
              {selectedCategory
                ? `${t(`category.${selectedCategory}`, lang)} (${filteredItems.length})`
                : `${t('allFailures', lang)} (${filteredItems.length})`}
            </h4>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {filteredItems.map((item) => {
              const config = getCategoryConfig(item.category || 'unknown');
              return (
                <div key={item.id} className="px-4 py-2.5 hover:bg-gray-50 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate" title={item.title}>{item.title}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${config.text}`}>
                          {t(`category.${item.category}`, lang)}
                        </span>
                      </div>
                      {item.error && (
                        <p className="text-xs text-red-500 mt-0.5 truncate" title={item.error}>
                          <i className="fas fa-times-circle mr-0.5"></i>{item.error}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-400">
                        {item.failureCount != null && (
                          <span><i className="fas fa-redo mr-0.5"></i>{t('occurrences', lang)}: {item.failureCount}</span>
                        )}
                        {item.lastFailureTime != null && (
                          <span><i className="fas fa-clock mr-0.5"></i>{new Date(item.lastFailureTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CustomErrorPatternsDialog
        isOpen={showPatternsDialog}
        onClose={() => setShowPatternsDialog(false)}
        lang={lang}
      />
    </div>
  );
};

export default FailureDistributionTab;
