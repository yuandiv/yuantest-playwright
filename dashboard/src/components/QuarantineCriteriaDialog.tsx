import { useState, useEffect } from 'react';
import { Lang, t } from '../i18n';
import * as api from '../services/api';

interface QuarantineCriteriaDialogProps {
  lang: Lang;
  onClose: () => void;
  onSaved: () => void;
}

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

const QUARANTINE_TOOLTIPS_ZH: Record<string, string> = {
  softThreshold: '加权失败率 ≥ 此值时进入软隔离。软隔离用例仍会执行但结果不计入主流程，适合不稳定但偶发失败的用例',
  hardThreshold: '加权失败率 ≥ 此值时进入硬隔离。硬隔离用例将被完全跳过不执行，适合持续失败的用例。需满足：硬隔离阈值 > 软隔离阈值',
  maxQuarantineRatio: '允许被隔离的用例占总用例数的最大比例（0~1），防止过度隔离影响测试覆盖率。达到上限后新用例将降级为监控模式',
  autoReleaseHardQuarantinePasses: '硬隔离用例连续通过此次数后自动释放恢复正常。值越大，释放条件越严格，误释放风险越低',
  quarantineExpiryDays: '隔离自动过期的天数。过期后根据"过期后自动降级"配置决定处理方式',
  quarantineExpiryDowngrade: '开启后，隔离过期的用例会自动降级为监控模式（而非直接释放），需要再观察确认稳定后才释放，避免不稳定用例过早回归',
  retryMax: '隔离用例单次运行的最大重试次数。设为 0 表示不重试。重试通过可帮助区分偶发失败和持续失败',
  retryDelayMs: '首次重试前的等待时间（毫秒）。适当的延迟可缓解时序问题和外部服务波动',
  retryBackoff: '每次重试的延迟倍数。如设为 2，则延迟序列为：1s → 2s → 4s（指数退避）。设为 1 表示固定延迟',
};

const QUARANTINE_TOOLTIPS_EN: Record<string, string> = {
  softThreshold: 'Weighted failure rate ≥ this value → soft quarantine. Soft-quarantined tests still run but results are excluded from main flow',
  hardThreshold: 'Weighted failure rate ≥ this value → hard quarantine. Hard-quarantined tests are completely skipped. Must satisfy: Hard > Soft',
  maxQuarantineRatio: 'Maximum ratio of quarantined tests to total tests (0~1). Prevents over-quarantine. New tests are downgraded to monitor mode when budget is reached',
  autoReleaseHardQuarantinePasses: 'Hard-quarantined tests auto-release after this many consecutive passes. Higher = stricter release, lower risk of premature release',
  quarantineExpiryDays: 'Days before quarantine auto-expires. After expiry, handling depends on "Auto Downgrade on Expiry" setting',
  quarantineExpiryDowngrade: 'When enabled, expired quarantined tests are downgraded to monitor mode (not directly released), requiring further observation before full release',
  retryMax: 'Maximum retry attempts per run for quarantined tests. Set to 0 for no retries. Retry passes help distinguish intermittent from persistent failures',
  retryDelayMs: 'Wait time in milliseconds before first retry. Proper delay helps with timing issues and external service fluctuations',
  retryBackoff: 'Delay multiplier for each retry. E.g., 2 means: 1s → 2s → 4s (exponential backoff). Set to 1 for constant delay',
};

const INT_FIELDS = ['autoReleaseHardQuarantinePasses', 'quarantineExpiryDays', 'retryMax', 'retryDelayMs', 'retryBackoff'];

const FIELD_MIN: Record<string, number> = {
  softThreshold: 0,
  hardThreshold: 0,
  maxQuarantineRatio: 0,
  autoReleaseHardQuarantinePasses: 1,
  quarantineExpiryDays: 1,
  quarantineExpiryDowngrade: 0,
  retryMax: 0,
  retryDelayMs: 0,
  retryBackoff: 0,
};

function validateQuarantineCriteria(criteria: Record<string, number | boolean>, lang: Lang): string[] {
  const warnings: string[] = [];
  const { softThreshold, hardThreshold, maxQuarantineRatio } = criteria;

  if (Number(softThreshold) >= Number(hardThreshold)) {
    warnings.push(lang === 'zh'
      ? `软隔离阈值(${softThreshold}) 应小于硬隔离阈值(${hardThreshold})`
      : `Soft threshold(${softThreshold}) should be less than Hard threshold(${hardThreshold})`);
  }
  if (Number(maxQuarantineRatio) > 0.5) {
    warnings.push(lang === 'zh'
      ? `隔离预算上限(${maxQuarantineRatio}) 过高，可能导致大量用例被隔离而影响覆盖率`
      : `Max quarantine ratio(${maxQuarantineRatio}) is too high, may cause excessive quarantine and reduce coverage`);
  }

  return warnings;
}

export function QuarantineCriteriaDialog({ lang, onClose, onSaved }: QuarantineCriteriaDialogProps) {
  const [quarantineCriteria, setQuarantineCriteria] = useState<Record<string, number | boolean>>({ ...DEFAULT_QUARANTINE });
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    api.getPreferences().then(prefs => {
      if (prefs?.quarantineCriteria && typeof prefs.quarantineCriteria === 'object') {
        const qc: Record<string, number | boolean> = {};
        for (const [k, v] of Object.entries(prefs.quarantineCriteria as Record<string, unknown>)) {
          if (typeof v === 'number' || typeof v === 'boolean') qc[k] = v;
        }
        setQuarantineCriteria({ ...DEFAULT_QUARANTINE, ...qc });
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setWarnings(validateQuarantineCriteria(quarantineCriteria, lang));
  }, [quarantineCriteria, lang]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const prefs = await api.getPreferences().catch(() => ({}));
      await api.savePreferences({
        ...prefs,
        quarantineCriteria,
      } as unknown as Record<string, string>);
      onSaved();
      onClose();
    } catch (e) {
      console.error('Failed to save quarantine criteria config:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
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

  const qLabels = lang === 'zh' ? QUARANTINE_LABELS_ZH : QUARANTINE_LABELS_EN;
  const qTooltips = lang === 'zh' ? QUARANTINE_TOOLTIPS_ZH : QUARANTINE_TOOLTIPS_EN;

  const isIntField = (key: string) => INT_FIELDS.includes(key);

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
          <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
            {label}
            <span className="relative group inline-flex">
              <i className="fas fa-circle-question text-[10px] text-gray-400 cursor-help hover:text-red-500 transition-colors"></i>
              <span className="absolute left-5 top-1/2 -translate-y-1/2 w-72 bg-gray-800 text-white text-[11px] rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed">
                {qTooltips[key] || ''}
              </span>
            </span>
          </label>
          <button
            onClick={() => onChange(!value)}
            className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-red-500' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      );
    }
    return (
      <div key={key}>
        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
          {label}
          <span className="relative group inline-flex">
            <i className="fas fa-circle-question text-[10px] text-gray-400 cursor-help hover:text-red-500 transition-colors"></i>
            <span className="absolute left-5 top-1/2 -translate-y-1/2 w-72 bg-gray-800 text-white text-[11px] rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none leading-relaxed">
              {qTooltips[key] || ''}
            </span>
          </span>
        </label>
        <input
          type="number"
          value={value as number}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800">
            <i className="fas fa-lock mr-2 text-red-500"></i>
            {lang === 'zh' ? '已隔离用例判定参数' : 'Quarantined Test Criteria'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <i className="fas fa-times text-xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-400">{lang === 'zh' ? '调整隔离策略与释放判定阈值' : 'Adjust quarantine strategy and release threshold values'}</span>
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
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <i className="fas fa-triangle-exclamation text-red-500 text-xs mt-0.5"></i>
                <div className="text-xs text-red-700 space-y-1">
                  {warnings.map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(DEFAULT_QUARANTINE).map(([key, defaultVal]) =>
              renderField(
                key,
                qLabels[key] || key,
                quarantineCriteria[key] ?? defaultVal,
                (val) => setQuarantineCriteria(prev => ({ ...prev, [key]: val })),
                key === 'quarantineExpiryDowngrade',
                isIntField(key) ? 1 : 0.01,
                FIELD_MIN[key] ?? 0,
                isIntField(key) ? 10000 : 1
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
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>{t('saving', lang) || 'Saving...'}</> : <><i className="fas fa-save mr-1.5"></i>{t('confirm', lang) || 'Save'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
