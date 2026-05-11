import { useState, useEffect } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { TestCase } from '../types';
import { getTestHistory, TestHistoryData, TestHistoryEntry as ApiHistoryEntry } from '../services/api';

interface TestHistoryDialogProps {
  lang: Lang;
  test: TestCase | null;
  onClose: () => void;
}

export function TestHistoryDialog({ lang, test, onClose }: TestHistoryDialogProps) {
  const [historyData, setHistoryData] = useState<TestHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!test) {
      setHistoryData(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    getTestHistory(test.id, 50)
      .then((data) => {
        setHistoryData(data);
      })
      .catch(() => {
        setError(t('noTestCases', lang));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [test]);

  if (!test) return null;

  const summary = historyData?.summary;
  const history = historyData?.history || [];

  const formatTimeAgo = (timestamp: number) => {
    const then = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - then.getTime();
    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHrs < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return t('minutesAgo', lang).replace('{n}', String(diffMins));
    } else if (diffHrs < 24) {
      return t('hoursAgo', lang).replace('{n}', String(diffHrs));
    } else {
      const diffDays = Math.floor(diffHrs / 24);
      return t('daysAgo', lang).replace('{n}', String(diffDays));
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <i className="fas fa-check-circle text-green-500"></i>;
      case 'failed':
        return <i className="fas fa-times-circle text-red-500"></i>;
      case 'timedout':
        return <i className="fas fa-exclamation-triangle text-amber-500"></i>;
      case 'skipped':
        return <i className="fas fa-forward text-gray-400"></i>;
      default:
        return <i className="fas fa-clock text-gray-400"></i>;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'passed': return t('passed', lang);
      case 'failed': return t('failed', lang);
      case 'timedout': return t('monitorLabel', lang);
      case 'skipped': return t('pending', lang);
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'timedout': return 'text-amber-600';
      default: return 'text-gray-600';
    }
  };

  const renderLastBadge = (
    entry: ApiHistoryEntry | null | undefined,
    label: string,
    bgClass: string,
    borderClass: string,
    textClass: string
  ) => {
    if (!entry) {
      return (
        <div className={`flex-1 bg-gray-50 rounded-lg p-3 border border-gray-200`}>
          <div className={`text-xs ${textClass} font-medium mb-1`}>{label}</div>
          <div className="text-xs text-gray-400">-</div>
        </div>
      );
    }
    return (
      <div className={`flex-1 ${bgClass} rounded-lg p-3 ${borderClass}`}>
        <div className={`text-xs ${textClass} font-medium mb-1`}>{label}</div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">v{entry.version}</span>
          <span className="text-xs text-gray-500">{formatTimeAgo(entry.timestamp)}</span>
        </div>
      </div>
    );
  };

  const handleViewTest = (entry: ApiHistoryEntry) => {
    if (entry.htmlReportUrl) {
      const url = `${entry.htmlReportUrl}#?testId=${entry.testId}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{t('executionHistory', lang)}</h2>
              <p className="text-sm text-gray-500 mt-1">{test.name}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors p-1"
            >
              <i className="fas fa-times text-xl"></i>
            </button>
          </div>
          
          {summary && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-gray-800">{summary.stability}%</div>
                  <div className="text-xs text-gray-500">{t('stability', lang)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-gray-800">{summary.totalRuns}</div>
                  <div className="text-xs text-gray-500">{t('totalRunsCol', lang)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-green-600">{summary.passed}</div>
                  <div className="text-xs text-gray-500">{t('passedCount', lang)}</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
                  <div className="text-xs text-gray-500">{t('failedCount', lang)}</div>
                </div>
              </div>
              
              <div className="flex gap-4 mt-4">
                {renderLastBadge(
                  summary.lastPassed,
                  t('lastPassedCurrent', lang),
                  'bg-green-50', 'border border-green-200', 'text-green-600'
                )}
                {renderLastBadge(
                  summary.lastFailed,
                  t('lastFailed', lang),
                  'bg-red-50', 'border border-red-200', 'text-red-600'
                )}
                {renderLastBadge(
                  summary.lastFlaky,
                  t('lastFlaky', lang),
                  'bg-amber-50', 'border border-amber-200', 'text-amber-600'
                )}
              </div>
            </>
          )}
          
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-start gap-2">
            <i className="fas fa-info-circle text-gray-400 mt-0.5"></i>
            <div className="text-xs text-gray-600">
              {t('historyFilterNote', lang)}
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-500">
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {t('loading', lang)}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-500">
              <i className="fas fa-exclamation-circle text-gray-400 text-2xl mb-2"></i>
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-500">
              <i className="fas fa-history text-gray-300 text-2xl mb-2"></i>
              {t('noReports', lang)}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100/80 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t('executedAt', lang)}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t('version', lang)}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t('status', lang)}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t('durationCol', lang)}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t('runLocation', lang)}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t('actions', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map((entry, index) => (
                    <tr key={index} className="hover:bg-white/80 transition-colors">
                      <td className="px-4 py-3 text-gray-700" title={formatTimestamp(entry.timestamp)}>
                        {formatTimeAgo(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        v{entry.version}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {getStatusIcon(entry.status)}
                          <span className={getStatusColor(entry.status)}>
                            {getStatusLabel(entry.status)}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {(entry.duration / 1000).toFixed(1)}s
                      </td>
                      <td className="px-4 py-3 text-gray-600" title={entry.runId}>
                        <span className="truncate max-w-[120px] inline-block align-middle">#{entry.runId.slice(0, 8)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {entry.htmlReportUrl ? (
                          <button
                            onClick={() => handleViewTest(entry)}
                            className="text-sm text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1"
                          >
                            {t('viewTest', lang)}
                            <i className="fas fa-external-link-alt text-[10px]"></i>
                          </button>
                        ) : (
                          <span className="text-sm text-gray-400">{t('viewTest', lang)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
