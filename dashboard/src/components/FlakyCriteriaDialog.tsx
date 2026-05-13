import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import * as api from '../services/api';

interface FlakyCriteriaDialogProps {
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_FLAKY: Record<string, number> = {
  minimumRuns: 5,
  flakyThreshold: 0.3,
  monitorThreshold: 0.1,
  stableThreshold: 0.05,
  highThreshold: 0.5,
  brokenConsecutiveThreshold: 5,
  regressionWindow: 5,
  regressionRecentFailRate: 0.6,
  regressionOlderFailRate: 0.2,
  decayRate: 0.1,
  confidenceLevel: 0.95,
  autoReleaseAfterPasses: 3,
};

const FLAKY_LABELS_ZH: Record<string, string> = {
  minimumRuns: '最低运行次数',
  flakyThreshold: 'Flaky 阈值',
  monitorThreshold: 'Monitor 阈值',
  stableThreshold: 'Stable 阈值',
  highThreshold: '高风险阈值',
  brokenConsecutiveThreshold: 'Broken 连续失败阈值',
  regressionWindow: '回归检测窗口',
  regressionRecentFailRate: '回归近期失败率阈值',
  regressionOlderFailRate: '回归早期失败率阈值',
  decayRate: '时间衰减率',
  confidenceLevel: '置信水平',
  autoReleaseAfterPasses: '软隔离自动释放通过次数',
};

const FLAKY_LABELS_EN: Record<string, string> = {
  minimumRuns: 'Minimum Runs',
  flakyThreshold: 'Flaky Threshold',
  monitorThreshold: 'Monitor Threshold',
  stableThreshold: 'Stable Threshold',
  highThreshold: 'High Risk Threshold',
  brokenConsecutiveThreshold: 'Broken Consecutive Threshold',
  regressionWindow: 'Regression Window',
  regressionRecentFailRate: 'Regression Recent Fail Rate',
  regressionOlderFailRate: 'Regression Older Fail Rate',
  decayRate: 'Decay Rate',
  confidenceLevel: 'Confidence Level',
  autoReleaseAfterPasses: 'Auto Release Passes (Soft)',
};

const INT_FIELDS = ['minimumRuns', 'brokenConsecutiveThreshold', 'regressionWindow', 'autoReleaseAfterPasses'];

export function FlakyCriteriaDialog({ lang, onClose, onSaved }: FlakyCriteriaDialogProps) {
  const [flakyCriteria, setFlakyCriteria] = useState<Record<string, number>>({ ...DEFAULT_FLAKY });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPreferences().then(prefs => {
      if (prefs?.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
        const fc: Record<string, number> = {};
        for (const [k, v] of Object.entries(prefs.flakyCriteria as Record<string, unknown>)) {
          if (typeof v === 'number') fc[k] = v;
        }
        setFlakyCriteria({ ...DEFAULT_FLAKY, ...fc });
      }
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const prefs = await api.getPreferences().catch(() => ({}));
      await api.savePreferences({
        ...prefs,
        flakyCriteria,
      } as unknown as Record<string, string>);
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save flaky criteria config:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setFlakyCriteria({ ...DEFAULT_FLAKY });
    setSaving(true);
    try {
      await api.savePreferences({ flakyCriteria: {} } as unknown as Record<string, string>);
      onSaved();
    } catch (e) {
      console.error('Failed to reset flaky criteria:', e);
    } finally {
      setSaving(false);
    }
  };

  const labels = lang === 'zh' ? FLAKY_LABELS_ZH : FLAKY_LABELS_EN;

  const isIntField = (key: string) => INT_FIELDS.includes(key);

  const renderField = (
    key: string,
    label: string,
    value: number,
    onChange: (val: number) => void,
    step: number = 0.01,
    min: number = 0,
    max: number = 1
  ) => (
    <div key={key}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">
            <i className="fas fa-bug mr-2 text-amber-500"></i>
            {lang === 'zh' ? '不稳定用例判定参数' : 'Flaky Test Criteria'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400">{lang === 'zh' ? '调整不稳定用例的分类与判定阈值' : 'Adjust flaky test classification and threshold values'}</span>
            <button
              onClick={handleReset}
              disabled={saving}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
            >
              <i className="fas fa-undo mr-1"></i>
              {lang === 'zh' ? '重置为默认值' : 'Reset to Default'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(DEFAULT_FLAKY).map(([key, defaultVal]) =>
              renderField(
                key,
                labels[key] || key,
                flakyCriteria[key] ?? defaultVal,
                (val) => setFlakyCriteria(prev => ({ ...prev, [key]: val })),
                isIntField(key) ? 1 : 0.01,
                isIntField(key) ? 1 : 0,
                isIntField(key) ? 1000 : 1
              )
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            {t('cancel', lang) || 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('saving', lang) || 'Saving...'}</> : <><i className="fas fa-save mr-1.5"></i>{t('confirm', lang) || 'Save'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
