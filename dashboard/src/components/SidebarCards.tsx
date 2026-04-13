import { useMemo } from 'react';
import { Lang } from '../i18n';
import { t } from '../i18n';
import { FlakyTest, QuarantinedTest, RunReport } from '../types';
import { VersionTrendChart } from './VersionTrendChart';

interface SidebarCardsProps {
  lang: Lang;
  reports: RunReport[];
  flakyTests: FlakyTest[];
  quarantinedTests: QuarantinedTest[];
  onReleaseTest: (testId: string) => void;
  onRefresh: () => void;
  onModal: (content: React.ReactNode) => void;
}

export function SidebarCards({ lang, reports, flakyTests, quarantinedTests, onReleaseTest, onRefresh, onModal }: SidebarCardsProps) {
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

  return (
    <div className="flex gap-4 h-[420px]">
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
              return (
                <div key={test.testId} className="bg-gradient-to-r from-gray-50 to-white border border-gray-100 rounded-lg p-2.5 hover:shadow-md transition-all">
                  <div className="flex justify-between items-start mb-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs text-gray-800 truncate" title={test.title}>{test.title}</p>
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
              <div className="text-center text-[10px] text-gray-400 py-1">
                +{flakyTests.length - 3} {t('items', lang)}
              </div>
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
            ) : quarantinedTests.slice(0, 3).map(test => (
              <div key={test.testId} className="bg-gradient-to-r from-red-50 to-white border border-red-100 rounded-lg p-2.5 hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs text-gray-800 truncate" title={test.title}>{test.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      <i className="fas fa-hashtag mr-0.5"></i>{test.totalRuns}
                      <span className="mx-1">·</span>
                      <i className="fas fa-times-circle mr-0.5 text-red-400"></i>{(test.failureRate * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-2 py-0.5 rounded text-[10px] hover:from-green-600 hover:to-emerald-600 transition-all shadow-sm flex items-center gap-0.5"
                    onClick={() => onReleaseTest(test.testId)}
                  >
                    <i className="fas fa-unlock"></i> {t('releaseAction', lang)}
                  </button>
                </div>
              </div>
            ))}
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
