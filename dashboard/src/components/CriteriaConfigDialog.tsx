import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import * as api from '../services/api';

interface CriteriaConfigDialogProps {
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

const DEFAULT_QUARANTINE: Record<string, number | boolean> = {
  softThreshold: 0.15,
  hardThreshold: 0.4,
  maxQuarantineRatio: 0.2,
  autoReleaseHardQuarantinePasses: 5,
  quarantineExpiryDays: 30,
  quarantineExpiryDowngrade: true,
  retryMax: 3,
  retryDelayMs: 1000,
  retryBackoff: 2,
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

const QUARANTINE_LABELS_ZH: Record<string, string> = {
  softThreshold: '软隔离阈值',
  hardThreshold: '硬隔离阈值',
  maxQuarantineRatio: '隔离预算上限比例',
  autoReleaseHardQuarantinePasses: '硬隔离自动释放通过次数',
  quarantineExpiryDays: '隔离过期天数',
  quarantineExpiryDowngrade: '过期后自动降级',
  retryMax: '重试最大次数',
  retryDelayMs: '重试延迟(ms)',
  retryBackoff: '退避倍数',
};

const QUARANTINE_LABELS_EN: Record<string, string> = {
  softThreshold: 'Soft Quarantine Threshold',
  hardThreshold: 'Hard Quarantine Threshold',
  maxQuarantineRatio: 'Max Quarantine Ratio',
  autoReleaseHardQuarantinePasses: 'Auto Release Passes (Hard)',
  quarantineExpiryDays: 'Quarantine Expiry Days',
  quarantineExpiryDowngrade: 'Auto Downgrade on Expiry',
  retryMax: 'Max Retries',
  retryDelayMs: 'Retry Delay (ms)',
  retryBackoff: 'Retry Backoff',
};

/** 判定参数配置对话框组件，用于配置 flaky 和 quarantine 判定参数 */
export function CriteriaConfigDialog({ lang, onClose, onSaved }: CriteriaConfigDialogProps) {
  const [flakyCriteria, setFlakyCriteria] = useState<Record<string, number>>({ ...DEFAULT_FLAKY });
  const [quarantineCriteria, setQuarantineCriteria] = useState<Record<string, number | boolean>>({ ...DEFAULT_QUARANTINE });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getPreferences().then(prefs => {
      if (prefs) {
        if (prefs.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
          const fc: Record<string, number> = {};
          for (const [k, v] of Object.entries(prefs.flakyCriteria as Record<string, unknown>)) {
            if (typeof v === 'number') fc[k] = v;
          }
          setFlakyCriteria({ ...DEFAULT_FLAKY, ...fc });
        }
        if (prefs.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
          const qc: Record<string, number | boolean> = {};
          for (const [k, v] of Object.entries(prefs.quarantineCriteria as Record<string, unknown>)) {
            if (typeof v === 'number' || typeof v === 'boolean') qc[k] = v;
          }
          setQuarantineCriteria({ ...DEFAULT_QUARANTINE, ...qc });
        }
      }
    }).catch(() => {});
  }, []);

  /** 保存当前配置到服务端 */
  const handleSave = async () => {
    setSaving(true);
    try {
      await api.savePreferences({ flakyCriteria, quarantineCriteria } as unknown as Record<string, string>);
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save criteria config:', e);
    } finally {
      setSaving(false);
    }
  };

  /** 重置 flaky 参数为默认值 */
  const handleResetFlaky = async () => {
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

  /** 重置 quarantine 参数为默认值 */
  const handleResetQuarantine = async () => {
    setQuarantineCriteria({ ...DEFAULT_QUARANTINE });
    setSaving(true);
    try {
      await api.savePreferences({ quarantineCriteria: {} } as unknown as Record<string, string>);
      onSaved();
    } catch (e) {
      console.error('Failed to reset quarantine criteria:', e);
    } finally {
      setSaving(false);
    }
  };

  const labels = lang === 'zh' ? FLAKY_LABELS_ZH : FLAKY_LABELS_EN;
  const qLabels = lang === 'zh' ? QUARANTINE_LABELS_ZH : QUARANTINE_LABELS_EN;

  /** 渲染单个配置字段，支持数字输入和布尔开关 */
  const renderField = (
    key: string,
    label: string,
    value: number | boolean,
    onChange: (val: number | boolean) => void,
    isBoolean: boolean = false,
    step: number = 0.01,
    min: number = 0,
    max: number = 1
  ) => {
    if (isBoolean) {
      return (
        <div key={key} className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">{label}</label>
          <button
            onClick={() => onChange(!value)}
            className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-indigo-600' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      );
    }
    return (
      <div key={key}>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="number"
          value={value as number}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>
    );
  };

  const isIntField = (key: string) => ['minimumRuns', 'brokenConsecutiveThreshold', 'regressionWindow', 'autoReleaseAfterPasses', 'autoReleaseHardQuarantinePasses', 'quarantineExpiryDays', 'retryMax', 'retryDelayMs', 'retryBackoff'].includes(key);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">
            <i className="fas fa-sliders-h mr-2 text-indigo-600"></i>
            {lang === 'zh' ? '判定参数配置' : 'Criteria Configuration'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-amber-700 flex items-center gap-1.5">
                <i className="fas fa-bug"></i>
                {lang === 'zh' ? '不稳定用例判定参数' : 'Flaky Test Criteria'}
              </h3>
              <button
                onClick={handleResetFlaky}
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
                  false,
                  isIntField(key) ? 1 : 0.01,
                  isIntField(key) ? 1 : 0,
                  isIntField(key) ? 1000 : 1
                )
              )}
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-1.5">
                <i className="fas fa-lock"></i>
                {lang === 'zh' ? '已隔离用例判定参数' : 'Quarantined Test Criteria'}
              </h3>
              <button
                onClick={handleResetQuarantine}
                disabled={saving}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
              >
                <i className="fas fa-undo mr-1"></i>
                {lang === 'zh' ? '重置为默认值' : 'Reset to Default'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(DEFAULT_QUARANTINE).map(([key, defaultVal]) =>
                renderField(
                  key,
                  qLabels[key] || key,
                  quarantineCriteria[key] ?? defaultVal,
                  (val) => setQuarantineCriteria(prev => ({ ...prev, [key]: val })),
                  key === 'quarantineExpiryDowngrade',
                  isIntField(key) ? 1 : 0.01,
                  isIntField(key) ? 0 : 0,
                  isIntField(key) ? 10000 : 1
                )
              )}
            </div>
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
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('saving', lang) || 'Saving...'}</> : <><i className="fas fa-save mr-1.5"></i>{t('confirm', lang) || 'Save'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
