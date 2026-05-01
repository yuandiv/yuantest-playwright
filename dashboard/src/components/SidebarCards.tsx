import { useMemo, useState } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { FlakyTest, QuarantinedTest, RunReport, FlakyClassification, FilterType } from '../types';
import { VersionTrendChart } from './VersionTrendChart';

interface SidebarCardsProps {
  lang: Lang;
  reports: RunReport[];
  flakyTests: FlakyTest[];
  quarantinedTests: QuarantinedTest[];
  onReleaseTest: (testId: string) => void;
  onValidateReleaseTest: (testId: string) => void;
  onRefresh: () => void;
  onModal: (content: React.ReactNode) => void;
  onClearFlakyHistory: () => Promise<void>;
}

export function SidebarCards({ lang, reports, flakyTests, quarantinedTests, onReleaseTest, onValidateReleaseTest, onRefresh, onModal, onClearFlakyHistory }: SidebarCardsProps) {
  const trend = useMemo(() => {
    const sortedReports = [...reports]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12)
      .reverse();
    
    return sortedReports.map((r, index) => {
      const passRate = r.totalTests > 0 ? (r.passed / r.totalTests) * 100 : 0;
      const dateStr = new Date(r.timestamp).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
      return {
        version: `${r.version}-${dateStr}`,
        passRate: passRate.toFixed(1),
        total: r.totalTests,
        runs: 1,
        failed: r.failed,
        duration: r.duration,
      };
    });
  }, [reports, lang]);

  const getStabilityInfo = (failureRate: number) => {
    if (failureRate <= 0.2) {
      return { label: t('highStability', lang), color: 'bg-green-100 text-green-700 border-green-200', icon: 'fas fa-shield-check' };
    } else if (failureRate <= 0.5) {
      return { label: t('mediumStability', lang), color: 'bg-amber-100 text-amber-700 border-amber-200', icon: 'fas fa-exclamation-circle' };
    } else {
      return { label: t('lowStability', lang), color: 'bg-red-100 text-red-700 border-red-200', icon: 'fas fa-exclamation-triangle' };
    }
  };

  const getClassificationInfo = (classification?: FlakyClassification) => {
    switch (classification) {
      case 'broken':
        return { label: 'Broken', color: 'bg-red-100 text-red-700', icon: 'fas fa-bug' };
      case 'regression':
        return { label: 'Regression', color: 'bg-orange-100 text-orange-700', icon: 'fas fa-arrow-trend-down' };
      case 'flaky':
        return { label: 'Flaky', color: 'bg-amber-100 text-amber-700', icon: 'fas fa-shuffle' };
      case 'stable':
        return { label: 'Stable', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-circle' };
      default:
        return null;
    }
  };

  const handleViewAllFlakyTests = () => {
    onModal(
      <FlakyTestsModal
        lang={lang}
        flakyTests={flakyTests}
        getStabilityInfo={getStabilityInfo}
        onClearHistory={onClearFlakyHistory}
      />
    );
  };

  return (
    <div className="flex gap-4 h-[500px]">
      <div className="flex-1 min-w-0 h-full overflow-hidden">
        <VersionTrendChart lang={lang} data={trend} />
      </div>
      
      <div className="w-80 flex flex-col gap-4 flex-shrink-0">
        <div className="bg-white rounded-[1.25rem] shadow-sm p-4 flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-3 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-700">
              <i className="fas fa-bug mr-1.5 text-amber-500"></i>{t('flakyTestsTitle', lang)}
            </h3>
            {flakyTests.length > 0 && (
              <span className="text-xs text-gray-400">{flakyTests.length} {t('items', lang)}</span>
            )}
          </div>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
            {flakyTests.length === 0 ? (
              <div className="text-center py-6">
                <i className="fas fa-check-circle text-3xl text-green-300 mb-2"></i>
                <p className="text-gray-400 text-xs">{t('noFlakyTests', lang)}</p>
              </div>
            ) : flakyTests.slice(0, 3).map(test => {
              const rate = (test.failureRate * 100).toFixed(0);
              const stability = getStabilityInfo(test.failureRate);
              const classInfo = getClassificationInfo(test.classification);
              return (
                <div key={test.testId} className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg p-2.5 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="font-medium text-xs text-gray-800 truncate" title={test.title}>{test.title}</p>
                        {classInfo && (
                          <span className={`px-1 py-0 rounded text-[8px] font-medium ${classInfo.color} flex-shrink-0`}>
                            <i className={`${classInfo.icon} mr-0.5`}></i>{classInfo.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{t('runCount', lang)}: {test.totalRuns}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 ml-2">
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-medium ${stability.color} border`}>
                        <i className={`${stability.icon} mr-0.5`}></i>{rate}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1">
                    <div 
                      className={`h-1 rounded-full transition-all ${test.failureRate > 0.5 ? 'bg-red-500' : test.failureRate > 0.2 ? 'bg-amber-500' : 'bg-green-500'}`}
                      style={{ width: `${test.failureRate * 100}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
            {flakyTests.length > 3 && (
              <button
                className="w-full text-center text-[10px] text-blue-500 hover:text-blue-600 py-1 transition-colors cursor-pointer"
                onClick={handleViewAllFlakyTests}
              >
                +{flakyTests.length - 3} {t('items', lang)} · {t('viewAllFlakyTests', lang)}
              </button>
            )}
            {flakyTests.length > 0 && flakyTests.length <= 3 && (
              <button
                className="w-full text-center text-[10px] text-blue-500 hover:text-blue-600 py-1 transition-colors cursor-pointer"
                onClick={handleViewAllFlakyTests}
              >
                {t('viewAllFlakyTests', lang)}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-[1.25rem] shadow-sm p-4 flex-1 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-3 flex-shrink-0">
            <h3 className="text-sm font-semibold text-gray-700">
              <i className="fas fa-lock mr-1.5 text-red-500"></i>{t('quarantinedTests', lang)}
            </h3>
            {quarantinedTests.length > 0 && (
              <span className="text-xs text-gray-400">{quarantinedTests.length} {t('items', lang)}</span>
            )}
          </div>
          <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
            {quarantinedTests.length === 0 ? (
              <div className="text-center py-6">
                <i className="fas fa-unlock text-3xl text-green-300 mb-2"></i>
                <p className="text-gray-400 text-xs">{t('noQuarantinedTests', lang)}</p>
              </div>
            ) : quarantinedTests.slice(0, 3).map(test => {
              const isExpired = test.isExpired || (test.quarantinedAt && (Date.now() - test.quarantinedAt > 30 * 24 * 60 * 60 * 1000));
              return (
              <div key={test.testId} className={`bg-gradient-to-r ${isExpired ? 'from-amber-50 to-white border-amber-200' : 'from-red-50 to-white border-red-100'} border rounded-lg p-2.5 hover:shadow-md transition-all`}>
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs text-gray-800 truncate" title={test.title}>{test.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      <i className="fas fa-hashtag mr-0.5"></i>{test.totalRuns}
                      <span className="mx-1">·</span>
                      <i className="fas fa-times-circle mr-0.5 text-red-400"></i>{(test.failureRate * 100).toFixed(0)}%
                      {isExpired && (
                        <>
                          <span className="mx-1">·</span>
                          <i className="fas fa-clock mr-0.5 text-amber-500"></i>
                          <span className="text-amber-600">{t('expired', lang)}</span>
                        </>
                      )}
                      {test.consecutivePassesSinceQuarantine != null && test.consecutivePassesSinceQuarantine > 0 && (
                        <>
                          <span className="mx-1">·</span>
                          <i className="fas fa-check mr-0.5 text-green-500"></i>
                          <span className="text-green-600">{test.consecutivePassesSinceQuarantine}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end gap-1">
                  <button
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-2 py-0.5 rounded text-[10px] hover:from-blue-600 hover:to-indigo-600 transition-all shadow-sm flex items-center gap-0.5"
                    onClick={() => onValidateReleaseTest(test.testId)}
                    title={t('validateReleaseTooltip', lang)}
                  >
                    <i className="fas fa-flask"></i> {t('validateReleaseAction', lang)}
                  </button>
                  <button
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-2 py-0.5 rounded text-[10px] hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm flex items-center gap-0.5"
                    onClick={() => onReleaseTest(test.testId)}
                    title={t('releaseTooltip', lang)}
                  >
                    <i className="fas fa-unlock"></i> {t('releaseAction', lang)}
                  </button>
                </div>
              </div>
            );
            })}
            {quarantinedTests.length > 3 && (
              <div className="text-center text-[10px] text-gray-400 py-1">
                +{quarantinedTests.length - 3} {t('items', lang)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FlakyTestsModal({
  lang,
  flakyTests,
  getStabilityInfo,
  onClearHistory,
}: {
  lang: Lang;
  flakyTests: FlakyTest[];
  getStabilityInfo: (failureRate: number) => { label: string; color: string; icon: string };
  onClearHistory: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const getClassificationInfo = (classification?: FlakyClassification) => {
    switch (classification) {
      case 'broken':
        return { label: 'Broken', color: 'bg-red-100 text-red-700', icon: 'fas fa-bug' };
      case 'regression':
        return { label: 'Regression', color: 'bg-orange-100 text-orange-700', icon: 'fas fa-arrow-trend-down' };
      case 'flaky':
        return { label: 'Flaky', color: 'bg-amber-100 text-amber-700', icon: 'fas fa-shuffle' };
      case 'stable':
        return { label: 'Stable', color: 'bg-green-100 text-green-700', icon: 'fas fa-check-circle' };
      default:
        return null;
    }
  };

  const filteredTests = useMemo(() => {
    if (filter === 'all') return flakyTests;
    if (filter === 'broken') return flakyTests.filter(t => t.classification === 'broken');
    if (filter === 'regression') return flakyTests.filter(t => t.classification === 'regression');
    if (filter === 'flaky') return flakyTests.filter(t => t.classification === 'flaky');
    return flakyTests.filter(test => {
      if (filter === 'high') return test.failureRate <= 0.2;
      if (filter === 'medium') return test.failureRate > 0.2 && test.failureRate <= 0.5;
      return test.failureRate > 0.5;
    });
  }, [flakyTests, filter]);

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await onClearHistory();
      setShowConfirmClear(false);
    } finally {
      setIsClearing(false);
    }
  };

  const filterButtons = [
    { key: 'all' as const, label: t('allLevels', lang) },
    { key: 'flaky' as const, label: 'Flaky' },
    { key: 'broken' as const, label: 'Broken' },
    { key: 'regression' as const, label: 'Regression' },
    { key: 'high' as const, label: t('highStability', lang) },
    { key: 'medium' as const, label: t('mediumStability', lang) },
    { key: 'low' as const, label: t('lowStability', lang) },
  ];

  return (
    <div className="w-[560px] max-h-[70vh] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-base font-semibold text-gray-800">
          <i className="fas fa-bug mr-2 text-amber-500"></i>{t('flakyTestDetails', lang)}
        </h2>
        <span className="text-xs text-gray-400">{flakyTests.length} {t('items', lang)}</span>
      </div>

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-gray-500 mr-1">{t('filterByStability', lang)}:</span>
        {filterButtons.map(btn => (
          <button
            key={btn.key}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
              filter === btn.key
                ? 'bg-blue-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            onClick={() => setFilter(btn.key)}
          >
            {btn.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 overflow-y-auto flex-1 min-h-0 pr-1">
        {filteredTests.length === 0 ? (
          <div className="text-center py-8">
            <i className="fas fa-check-circle text-3xl text-green-300 mb-2"></i>
            <p className="text-gray-400 text-xs">{t('noFlakyTests', lang)}</p>
          </div>
        ) : filteredTests.map(test => {
          const rate = (test.failureRate * 100).toFixed(0);
          const stability = getStabilityInfo(test.failureRate);
          const classInfo = getClassificationInfo(test.classification);
          return (
            <div key={test.testId} className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg p-3 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-sm text-gray-800 truncate" title={test.title}>{test.title}</p>
                    {classInfo && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${classInfo.color} flex-shrink-0`}>
                        <i className={`${classInfo.icon} mr-0.5`}></i>{classInfo.label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    <i className="fas fa-hashtag mr-0.5"></i>{t('runCount', lang)}: {test.totalRuns}
                    {test.lastFailure && (
                      <>
                        <span className="mx-1.5">·</span>
                        <i className="fas fa-clock mr-0.5"></i>{t('lastFailure', lang)}: {new Date(test.lastFailure).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                      </>
                    )}
                  </p>
                  {test.rootCause && (
                    <p className="text-xs text-blue-500 mt-1">
                      <i className="fas fa-search mr-0.5"></i>{test.rootCause.primaryCause}
                      <span className="text-gray-400 ml-1">({(test.rootCause.confidence * 100).toFixed(0)}%)</span>
                    </p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-full text-[10px] font-medium ${stability.color} border ml-2 flex-shrink-0`}>
                  <i className={`${stability.icon} mr-0.5`}></i>{stability.label} · {rate}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${test.failureRate > 0.5 ? 'bg-red-500' : test.failureRate > 0.2 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.max(test.failureRate * 100, 2)}%` }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
        {showConfirmClear ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500">{t('confirmClearFlakyHistory', lang)}</span>
            <button
              className="px-3 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
              onClick={handleClearHistory}
              disabled={isClearing}
            >
              {isClearing ? '...' : t('confirm', lang)}
            </button>
            <button
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg hover:bg-gray-200 transition-colors"
              onClick={() => setShowConfirmClear(false)}
              disabled={isClearing}
            >
              {t('cancel', lang)}
            </button>
          </div>
        ) : (
          <button
            className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1"
            onClick={() => setShowConfirmClear(true)}
          >
            <i className="fas fa-trash-alt"></i> {t('clearFlakyHistory', lang)}
          </button>
        )}
      </div>
    </div>
  );
}
