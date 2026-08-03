import React from 'react';
import { Lang, t } from '../i18n';
import { AIDiagnosis } from '../types';

interface ClusterCardProps {
  lang: Lang;
  clusterIndex: number;
  category: string;
  testIds: string[];
  similarity: number;
  representativeError?: string;
  diagnosis: AIDiagnosis | null;
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

function safeNumber(value: any, defaultValue: number = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return value;
}

export const ClusterCard: React.FC<ClusterCardProps> = ({
  lang,
  clusterIndex,
  category,
  testIds,
  similarity,
  representativeError,
  diagnosis,
}) => {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;

  return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-violet-700">#{clusterIndex}</span>
        <div className={`w-5 h-5 rounded bg-gradient-to-br ${
          category === 'timeout' ? 'from-yellow-500 to-amber-600' :
          category === 'selector' ? 'from-purple-500 to-violet-600' :
          category === 'network' ? 'from-blue-500 to-cyan-600' :
          category === 'assertion' ? 'from-red-500 to-rose-600' :
          'from-gray-500 to-gray-600'
        } flex items-center justify-center`}>
          <i className={`${config.icon} text-[10px] text-white`}></i>
        </div>
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${config.text}`}>
          {t(`category.${category}`, lang) || category}
        </span>
        <span className="text-xs text-gray-500">
          <i className="fas fa-link mr-0.5"></i>{t('similarity', lang)}: {(safeNumber(similarity, 0) * 100).toFixed(0)}%
        </span>
        <span className="text-xs text-gray-400">
          <i className="fas fa-vial mr-0.5"></i>{testIds.length} {t('testsInCluster', lang)}
        </span>
      </div>

      {representativeError && (
        <div className="mb-2 bg-white/60 rounded-lg px-2 py-1.5">
          <p className="text-[10px] font-medium text-gray-500 mb-0.5">{t('representativeError', lang) || '代表性错误'}</p>
          <p className="text-xs text-red-600 truncate" title={representativeError}>{representativeError}</p>
        </div>
      )}

      {diagnosis ? (
        <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
          <p className="text-xs font-semibold text-indigo-700 mb-1.5">
            <i className="fas fa-robot mr-1"></i>{t('representativeDiagnosis', lang)}
          </p>
          <div className="space-y-1.5">
            <div>
              <p className="text-[10px] font-medium text-indigo-600">{t('summary', lang)}</p>
              <p className="text-xs text-indigo-500">{diagnosis.summary}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-indigo-600">{t('rootCause', lang)}</p>
              <p className="text-xs text-indigo-500">{diagnosis.rootCause}</p>
            </div>
            {diagnosis.suggestions && diagnosis.suggestions.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-indigo-600 mb-0.5">{t('suggestions', lang)}</p>
                <ul className="text-xs text-indigo-500 space-y-0.5">
                  {diagnosis.suggestions.map((s, idx) => (
                    <li key={idx} className="flex items-start gap-1">
                      <i className="fas fa-chevron-right mt-0.5 text-[8px]"></i>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-indigo-400">
              <span><i className="fas fa-percentage mr-0.5"></i>{t('confidence', lang)}: {(safeNumber(diagnosis.confidence, 0) * 100).toFixed(0)}%</span>
              {diagnosis.model && (
                <span><i className="fas fa-microchip mr-0.5"></i>{t('model', lang)}: {diagnosis.model}</span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-xs text-gray-400">{t('clusterDiagnosisUnavailable', lang)}</p>
        </div>
      )}
    </div>
  );
};

export default ClusterCard;
