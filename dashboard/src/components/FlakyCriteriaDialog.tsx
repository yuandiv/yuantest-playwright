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

const FLAKY_TOOLTIPS_ZH: Record<string, string> = {
  minimumRuns: '触发分类判定所需的最低运行次数。运行次数不足时，用例不会被分类，显示为"数据不足"',
  flakyThreshold: '加权失败率 ≥ 此值时，用例被判定为"不稳定(Flaky)"。值越大，判定越宽松；值越小，判定越严格',
  monitorThreshold: '加权失败率在此值与 Flaky 阈值之间时，用例被判定为"监控(Monitor)"，处于持续观察状态',
  stableThreshold: '加权失败率 < 此值时，用例被判定为"稳定(Stable)"，可从不稳定列表中移除。需满足：Stable < Monitor < Flaky',
  highThreshold: '加权失败率 ≥ 此值时触发高风险告警，用于识别最不稳定、需优先处理的用例。需满足：High > Flaky',
  brokenConsecutiveThreshold: '连续失败次数 ≥ 此值时，用例被判定为"损坏(Broken)"，将自动进入硬隔离',
  regressionWindow: '回归检测的最近运行窗口大小（次数），用于对比近期与早期的失败率变化，识别"由稳定变不稳定"的回归模式',
  regressionRecentFailRate: '近期窗口内失败率 ≥ 此值时，视为回归信号的一部分（近期明显变差）',
  regressionOlderFailRate: '早期历史失败率 ≤ 此值时，视为回归信号的一部分（之前是稳定的）。需满足：近期阈值 > 早期阈值',
  decayRate: '控制历史运行结果对当前判定的权重影响。值越大，越近期的结果权重越高。0.1 表示约7天前的权重减半；1.0 表示约17小时前的权重减半',
  confidenceLevel: 'Wilson 置信区间的置信水平，用于判断失败率是否具有统计显著性。常用值：0.9（宽松）、0.95（默认）、0.99（严格）。值越高，需要更多证据才判定为不稳定',
  autoReleaseAfterPasses: '软隔离或监控状态的用例，连续通过此次数后自动释放恢复正常运行',
};

const FLAKY_TOOLTIPS_EN: Record<string, string> = {
  minimumRuns: 'Minimum number of runs required for classification. Tests with fewer runs remain "insufficient_data"',
  flakyThreshold: 'Weighted failure rate ≥ this value → classified as "Flaky". Higher = more lenient; Lower = more strict',
  monitorThreshold: 'Weighted failure rate between this and Flaky threshold → classified as "Monitor" (under observation)',
  stableThreshold: 'Weighted failure rate < this value → classified as "Stable", removed from flaky list. Must satisfy: Stable < Monitor < Flaky',
  highThreshold: 'Weighted failure rate ≥ this value triggers high-risk alert for priority handling. Must satisfy: High > Flaky',
  brokenConsecutiveThreshold: 'Consecutive failures ≥ this value → classified as "Broken", auto-enters hard quarantine',
  regressionWindow: 'Number of recent runs for regression detection. Compares recent vs. older failure rates to detect "stable→unstable" patterns',
  regressionRecentFailRate: 'Recent window failure rate ≥ this value → part of regression signal (recently degraded)',
  regressionOlderFailRate: 'Older history failure rate ≤ this value → part of regression signal (was previously stable). Must satisfy: Recent > Older',
  decayRate: 'Controls how much historical results influence current classification. Higher = more weight on recent results. 0.1 = ~7-day half-life; 1.0 = ~17-hour half-life',
  confidenceLevel: 'Wilson confidence interval level for statistical significance. Common values: 0.9 (lenient), 0.95 (default), 0.99 (strict). Higher values require more evidence to classify as flaky',
  autoReleaseAfterPasses: 'Soft-quarantined or monitored tests auto-release after this many consecutive passes',
};

const INT_FIELDS = ['minimumRuns', 'brokenConsecutiveThreshold', 'regressionWindow', 'autoReleaseAfterPasses'];

const FIELD_MIN: Record<string, number> = {
  minimumRuns: 1,
  flakyThreshold: 0,
  monitorThreshold: 0,
  stableThreshold: 0,
  highThreshold: 0,
  brokenConsecutiveThreshold: 1,
  regressionWindow: 1,
  regressionRecentFailRate: 0,
  regressionOlderFailRate: 0,
  decayRate: 0,
  confidenceLevel: 0,
  autoReleaseAfterPasses: 1,
};

function validateFlakyCriteria(criteria: Record<string, number>, lang: Lang): string[] {
  const warnings: string[] = [];
  const { flakyThreshold, monitorThreshold, stableThreshold, highThreshold, regressionRecentFailRate, regressionOlderFailRate } = criteria;

  if (stableThreshold >= monitorThreshold) {
    warnings.push(lang === 'zh'
      ? `Stable 阈值(${stableThreshold}) 应小于 Monitor 阈值(${monitorThreshold})`
      : `Stable threshold(${stableThreshold}) should be less than Monitor threshold(${monitorThreshold})`);
  }
  if (monitorThreshold >= flakyThreshold) {
    warnings.push(lang === 'zh'
      ? `Monitor 阈值(${monitorThreshold}) 应小于 Flaky 阈值(${flakyThreshold})`
      : `Monitor threshold(${monitorThreshold}) should be less than Flaky threshold(${flakyThreshold})`);
  }
  if (highThreshold <= flakyThreshold) {
    warnings.push(lang === 'zh'
      ? `高风险阈值(${highThreshold}) 应大于 Flaky 阈值(${flakyThreshold})`
      : `High risk threshold(${highThreshold}) should be greater than Flaky threshold(${flakyThreshold})`);
  }
  if (regressionOlderFailRate >= regressionRecentFailRate) {
    warnings.push(lang === 'zh'
      ? `回归早期失败率(${regressionOlderFailRate}) 应小于近期失败率(${regressionRecentFailRate})`
      : `Regression older fail rate(${regressionOlderFailRate}) should be less than recent fail rate(${regressionRecentFailRate})`);
  }

  return warnings;
}

export function FlakyCriteriaDialog({ lang, onClose, onSaved }: FlakyCriteriaDialogProps) {
  const [flakyCriteria, setFlakyCriteria] = useState<Record<string, number>>({ ...DEFAULT_FLAKY });
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    api.getPreferences().then(prefs => {
      if (prefs?.flakyCriteria && typeof prefs.flakyCriteria === 'object') {
        const fc: Record<string, number> = {};
        for (const [k, v] of Object.entries(prefs.flakyCriteria as Record<string, unknown>)) {
          if (typeof v === 'number') fc[k] = v;
        }
        setFlakyCriteria({ ...DEFAULT_FLAKY, ...fc });
      }
    }).catch((err) => console.error('[FlakyCriteriaDialog] getPreferences failed:', err));
  }, []);

  useEffect(() => {
    setWarnings(validateFlakyCriteria(flakyCriteria, lang));
  }, [flakyCriteria, lang]);

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
  const tooltips = lang === 'zh' ? FLAKY_TOOLTIPS_ZH : FLAKY_TOOLTIPS_EN;

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
      <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
        {label}
        <span className="relative group inline-flex">
          <i className="fas fa-circle-question text-[10px] text-gray-400 cursor-help hover:text-amber-500 transition-colors"></i>
          <span className="absolute left-5 top-1/2 -translate-y-1/2 w-72 bg-gray-800 text-white text-[11px] rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed">
            {tooltips[key] || ''}
          </span>
        </span>
      </label>
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
          {warnings.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <i className="fas fa-triangle-exclamation text-amber-500 text-xs mt-0.5"></i>
                <div className="text-xs text-amber-700 space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(DEFAULT_FLAKY).map(([key, defaultVal]) =>
              renderField(
                key,
                labels[key] || key,
                flakyCriteria[key] ?? defaultVal,
                (val) => setFlakyCriteria(prev => ({ ...prev, [key]: val })),
                isIntField(key) ? 1 : 0.01,
                FIELD_MIN[key] ?? 0,
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
