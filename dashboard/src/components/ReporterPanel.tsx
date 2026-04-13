import { useState, useEffect } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { RunReport, RunDetail } from '../types';
import * as api from '../services/api';
import { ConfirmDialog } from './ConfirmDialog';
import { TestDetailModal } from './TestDetailModal';

function formatVersionLabel(version: string): string {
  if (!version || typeof version !== 'string') return 'v0.0.0';
  const cleanVersion = version.replace(/^v/i, '');
  return `v${cleanVersion}`;
}

interface ReporterPanelProps {
  lang: Lang;
  reports: RunReport[];
  activeReportId: number | null;
  onActiveReportChange: (id: number | null) => void;
  onRefresh: () => Promise<void>;
  onDeleteReport?: (id: number) => void;
  onDeleteAllReports?: () => void;
}

export function ReporterPanel({ lang, reports, activeReportId, onActiveReportChange, onRefresh, onDeleteReport, onDeleteAllReports }: ReporterPanelProps) {
  const allVersions = [...new Set(reports.map(r => r.version).filter(Boolean))];
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'all'; reportId?: number } | null>(null);
  const [selectedTest, setSelectedTest] = useState<RunDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [rerunMessage, setRerunMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const filteredReports = selectedVersion ? reports.filter(r => r.version === selectedVersion) : reports;
  const sortedReports = [...filteredReports].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const activeReport = filteredReports.find(r => r.id === activeReportId);

  const handleDeleteClick = (e: React.MouseEvent, reportId: number) => {
    e.stopPropagation();
    setDeleteTarget({ type: 'single', reportId });
  };

  const handleDeleteAllClick = () => {
    setDeleteTarget({ type: 'all' });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'single' && deleteTarget.reportId !== undefined) {
      const success = await api.deleteRun(String(deleteTarget.reportId));
      if (success) {
        if (onDeleteReport) onDeleteReport(deleteTarget.reportId);
        if (activeReportId === deleteTarget.reportId) onActiveReportChange(null);
      }
    } else if (deleteTarget.type === 'all') {
      const result = await api.deleteAllRuns();
      if (result.success && onDeleteAllReports) {
        onDeleteAllReports();
        onActiveReportChange(null);
      }
    }
    
    setDeleteTarget(null);
  };

  const handleCancelDelete = () => {
    setDeleteTarget(null);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastRefreshTime(new Date());
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 1500);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatLastRefreshTime = () => {
    if (!lastRefreshTime) return null;
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastRefreshTime.getTime()) / 1000);
    if (diff < 60) return t('justNow', lang) || '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)} ${t('minutesAgo', lang) || '分钟前'}`;
    return lastRefreshTime.toLocaleTimeString();
  };

  useEffect(() => {
    setLastRefreshTime(new Date());
  }, [reports.length]);

  return (
    <div className="bg-white rounded-[1.25rem] shadow-sm p-5">
      {rerunMessage && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          rerunMessage.type === 'success' 
            ? 'bg-green-50 border border-green-200 text-green-700' 
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          <i className={`fas ${rerunMessage.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          <span className="text-sm">{rerunMessage.text}</span>
        </div>
      )}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">
            <i className="fas fa-chart-line text-blue-500 mr-2"></i>{t('reporterDebug', lang)}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{t('reporterDesc', lang)}</p>
        </div>
        <div className="flex items-center gap-3">
          {allVersions.length > 0 && (
            <select
              value={selectedVersion}
              onChange={(e) => {
                setSelectedVersion(e.target.value);
                onActiveReportChange(null);
              }}
              className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors border-0 cursor-pointer outline-none"
            >
              <option value="">{t('allVersions', lang) || 'All Versions'}</option>
              {allVersions.map(v => (
                <option key={v} value={v}>{formatVersionLabel(v)}</option>
              ))}
            </select>
          )}
          <button
            className={`text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
              isRefreshing 
                ? 'bg-blue-100 text-blue-600 cursor-wait' 
                : showSuccess 
                  ? 'bg-green-100 text-green-600' 
                  : 'bg-gray-100 hover:bg-gray-200'
            }`}
            onClick={handleRefresh}
            disabled={isRefreshing}
            title={lastRefreshTime ? `${t('lastRefresh', lang) || '上次刷新'}: ${formatLastRefreshTime()}` : ''}
          >
            <i className={`fas ${isRefreshing ? 'fa-sync-alt animate-spin' : showSuccess ? 'fa-check' : 'fa-sync-alt'}`}></i>
            <span>
              {isRefreshing 
                ? (t('refreshing', lang) || '刷新中...') 
                : showSuccess 
                  ? (t('refreshSuccess', lang) || '已刷新') 
                  : t('refresh', lang)}
            </span>
          </button>
          {filteredReports.length > 0 && (
            <button
              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg transition-colors"
              onClick={handleDeleteAllClick}
            >
              <i className="fas fa-trash-alt mr-1"></i>{t('deleteAll', lang) || '全部删除'}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 border rounded-xl p-3 max-h-[520px] overflow-y-auto bg-gray-50">
          <div className="text-xs font-semibold text-gray-500 mb-2 sticky top-0 bg-gray-50 py-1 flex items-center gap-1.5">
            <i className="fas fa-history text-indigo-400"></i> {t('execHistory', lang)}
            <span className="bg-indigo-100 text-indigo-600 px-1.5 rounded-full text-[10px] font-bold">{filteredReports.length}</span>
          </div>
          <div className="space-y-2">
            {sortedReports.length === 0 ? (
              <p className="text-gray-400 text-xs p-3 text-center">{t('noReports', lang)}</p>
            ) : sortedReports.map(report => {
              const isActive = activeReportId === report.id;
              const passRate = report.totalTests > 0 ? ((report.passed / report.totalTests) * 100).toFixed(0) : '0';
              const rateColor = Number(passRate) >= 80 ? 'text-green-600 bg-green-50' : Number(passRate) >= 50 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';
              return (
                <div
                  key={report.id}
                  className={`border rounded-lg p-2.5 cursor-pointer transition bg-white ${isActive ? 'border-indigo-400 bg-indigo-50' : 'hover:bg-gray-50'}`}
                  onClick={() => onActiveReportChange(report.id)}
                >
                  <div className="flex justify-between items-center text-xs mb-1">
                    <span className="font-mono text-gray-600">{new Date(report.timestamp).toLocaleString()}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${rateColor}`}>{passRate}%</span>
                      <button
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        onClick={(e) => handleDeleteClick(e, report.id)}
                        title={t('delete', lang) || '删除'}
                      >
                        <i className="fas fa-trash-alt text-xs"></i>
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-gray-700">{formatVersionLabel(report.version)}</span>
                    <span className="text-xs text-gray-500">✅ {report.passed} / ❌ {report.failed} · ⏱️ {report.duration}s</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-8 border rounded-xl p-3 max-h-[520px] overflow-y-auto bg-white">
          <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <i className="fas fa-file-alt text-blue-400"></i> {t('reportDetail', lang)}
            </div>
            {activeReport?.htmlReportUrl && (
              <a
                href={activeReport.htmlReportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg text-xs font-medium transition-all shadow-sm hover:shadow-md"
                title={t('viewHtmlReport', lang) || 'View HTML Report'}
              >
                <i className="fas fa-external-link-alt"></i>
                <span>{t('htmlReport', lang) || 'HTML Report'}</span>
              </a>
            )}
          </div>
          {!activeReport ? (
            <p className="text-xs text-gray-500 p-4 text-center">{t('clickReportHint', lang)}</p>
          ) : (
            <ReportDetail 
              lang={lang} 
              report={activeReport} 
              onTestClick={setSelectedTest}
              onRerunMessage={setRerunMessage}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        lang={lang}
        isOpen={deleteTarget !== null}
        title={deleteTarget?.type === 'all' ? (t('deleteAll', lang) || '全部删除') : (t('delete', lang) || '删除报告')}
        message={deleteTarget?.type === 'all' 
          ? (t('confirmDeleteAll', lang) || '确定要删除所有报告吗？此操作不可恢复！')
          : (t('confirmDelete', lang) || '确定要删除此报告吗？')
        }
        confirmText={t('delete', lang) || '删除'}
        confirmVariant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {selectedTest && activeReport && (
        <TestDetailModal
          lang={lang}
          test={selectedTest}
          runId={activeReport.id}
          htmlReportUrl={activeReport.htmlReportUrl}
          onClose={() => setSelectedTest(null)}
        />
      )}
    </div>
  );
}

function ReportDetail({ lang, report, onTestClick, onRerunMessage }: { 
  lang: Lang; 
  report: RunReport; 
  onTestClick: (test: RunDetail) => void;
  onRerunMessage: (message: { type: 'success' | 'error'; text: string } | null) => void;
}) {
  const passRate = report.totalTests > 0 ? ((report.passed / report.totalTests) * 100).toFixed(1) : '0';
  const failedDetails = report.details.filter(d => d.status === 'failed');

  const handleRerun = async (e: React.MouseEvent, test: RunDetail) => {
    e.stopPropagation();
    
    if (!test.file || !test.line) {
      onRerunMessage({ type: 'error', text: 'Test file or line information is missing' });
      setTimeout(() => onRerunMessage(null), 3000);
      return;
    }

    const testLocation = `${test.file}:${test.line}`;
    
    try {
      const success = await api.rerunTest(testLocation);
      if (success) {
        onRerunMessage({ type: 'success', text: `Rerun initiated for: ${test.name}` });
      } else {
        onRerunMessage({ type: 'error', text: 'Failed to initiate rerun' });
      }
      setTimeout(() => onRerunMessage(null), 3000);
    } catch (error) {
      onRerunMessage({ type: 'error', text: 'Error during rerun' });
      setTimeout(() => onRerunMessage(null), 3000);
    }
  };

  return (
    <div>
      <div className="mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="font-bold text-sm text-gray-800">{t('report', lang)} #{report.id}</span>
          <span className="text-xs text-gray-500">{new Date(report.timestamp).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
          <span className="bg-gray-100 px-2 py-0.5 rounded font-mono">{formatVersionLabel(report.version)}</span>
          <span>⏱️ {t('totalDuration', lang)} {report.duration}s</span>
          <span className={`font-medium ${Number(passRate) >= 80 ? 'text-green-600' : Number(passRate) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{passRate}% {t('passRate', lang)}</span>
        </div>
        <div className="flex gap-1.5 mb-3">
          <div className="flex-1 bg-green-50 rounded-lg p-2 text-center"><div className="text-lg font-bold text-green-600">{report.passed}</div><div className="text-[10px] text-green-500">{t('passed', lang)}</div></div>
          <div className="flex-1 bg-red-50 rounded-lg p-2 text-center"><div className="text-lg font-bold text-red-600">{report.failed}</div><div className="text-[10px] text-red-500">{t('failed', lang)}</div></div>
          <div className="flex-1 bg-indigo-50 rounded-lg p-2 text-center"><div className="text-lg font-bold text-indigo-600">{report.totalTests}</div><div className="text-[10px] text-indigo-500">{t('totalCases', lang)}</div></div>
          {report.skippedQuarantinedTests && report.skippedQuarantinedTests.length > 0 && (
            <div className="flex-1 bg-amber-50 rounded-lg p-2 text-center">
              <div className="text-lg font-bold text-amber-600">{report.skippedQuarantinedTests.length}</div>
              <div className="text-[10px] text-amber-500">{t('skippedQuarantined', lang) || '隔离跳过'}</div>
            </div>
          )}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-3"></div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              <th className="text-left py-1.5 px-2 rounded-tl-lg">#</th>
              <th className="text-left py-1.5 px-2">{t('caseName', lang)}</th>
              <th className="text-center py-1.5 px-2">{t('result', lang)}</th>
              <th className="text-center py-1.5 px-2">{t('duration', lang)}</th>
              <th className="text-center py-1.5 px-2">{t('runCount', lang)}</th>
              <th className="text-left py-1.5 px-2">{t('errorDebug', lang)}</th>
              <th className="text-center py-1.5 px-2 rounded-tr-lg">{t('retry', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {report.details.map((d, i) => {
              const isFailed = d.status === 'failed';
              const hasRetries = d.retries && d.retries > 0;
              return (
                <tr 
                  key={i} 
                  className={`border-b border-gray-100 ${isFailed ? 'bg-red-50/50' : ''} hover:bg-blue-50 cursor-pointer transition-colors`}
                  onClick={() => onTestClick(d)}
                  title={t('clickToViewDetails', lang) || 'Click to view details'}
                >
                  <td className="py-1.5 px-2 text-gray-400">{i + 1}</td>
                  <td className={`py-1.5 px-2 font-medium ${isFailed ? 'text-red-700' : 'text-gray-700'}`}>
                    <div className="flex items-center gap-2">
                      {d.name}
                      {(d.attachments && d.attachments.length > 0) && (
                        <span className="text-xs text-blue-500">
                          <i className="fas fa-paperclip"></i> {d.attachments.length}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 text-center">{isFailed ? '❌' : '✅'}</td>
                  <td className="py-1.5 px-2 text-center text-gray-600">{d.duration || '-'}</td>
                  <td className="py-1.5 px-2 text-center">
                    {hasRetries ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">
                        <i className="fas fa-redo text-[8px]"></i>
                        {d.retries}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 max-w-[200px]">
                    {d.error ? <span className="text-red-500 truncate block" title={d.error}>{d.error}</span> : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    <button 
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${isFailed ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-400'}`} 
                      disabled={!isFailed}
                      onClick={(e) => handleRerun(e, d)}
                      title={isFailed ? t('retry', lang) : ''}
                    >
                      <i className="fas fa-redo"></i>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {failedDetails.length > 0 && (
        <>
          <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent my-3"></div>
          <div>
            <div className="text-xs font-semibold text-red-600 mb-2">
              <i className="fas fa-exclamation-circle mr-1"></i>{t('errorStack', lang)} ({failedDetails.length})
            </div>
            <div className="space-y-1.5">
              {failedDetails.map((d, i) => (
                <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-2 text-xs">
                  <div className="font-medium text-red-700 mb-0.5">{d.name}</div>
                  <code className="text-red-500 text-[11px] leading-relaxed block">{d.error || ''}</code>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
