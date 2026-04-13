import React from 'react';
import { Lang, t } from '../../i18n';
import { CHART_COLORS } from '../../constants/dashboard';
import { getTrendLabel, getPassRateColor, formatDate } from '../../utils/dashboardHelpers';

interface MiniBarProps {
  value: number;
  max: number;
  color: string;
}

/**
 * 迷你进度条组件
 * @param value - 当前值
 * @param max - 最大值
 * @param color - 进度条颜色
 */
export const MiniBar: React.FC<MiniBarProps> = ({ value, max, color }) => (
  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-1">
    <div
      className="h-full rounded-full transition-all"
      style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: color }}
    />
  </div>
);

interface TooltipWrapperProps {
  active?: boolean;
  payload?: any[];
  children: React.ReactNode;
  formatDateFn: (date: string) => string;
  dateStr?: string;
}

/**
 * Tooltip 容器组件，提供统一的样式和布局
 */
const TooltipWrapper: React.FC<TooltipWrapperProps> = ({ active, payload, children, formatDateFn, dateStr }) => {
  if (!active || !payload || !payload.length || !payload[0]?.payload) return null;
  const data = payload[0].payload;
  
  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-xl shadow-xl p-4 min-w-[220px]">
      <div className="font-semibold text-gray-800 text-sm mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
        <i className="fas fa-calendar-alt text-gray-400 text-xs" />
        {formatDateFn(dateStr || data.date)}
      </div>
      <div className="space-y-2.5 text-sm">{children}</div>
    </div>
  );
};

interface RunStatusTooltipProps {
  active?: boolean;
  payload?: any[];
  lang: Lang;
  formatDate: (date: string) => string;
  avgPassRate: number;
}

/**
 * 运行状态图表的自定义 Tooltip
 * 显示通过数、失败数、总数和通过率（含进度条与趋势对比）
 */
export const RunStatusTooltip: React.FC<RunStatusTooltipProps> = ({
  active,
  payload,
  lang,
  formatDate: formatDateFn,
  avgPassRate,
}) => {
  if (!active || !payload || !payload.length || !payload[0]?.payload) return null;
  const data = payload[0].payload;
  const total = data.passed + data.failed;
  const trend = getTrendLabel(data.passRate, avgPassRate, lang);
  const { color, barColor } = getPassRateColor(data.passRate);

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-xl shadow-xl p-4 min-w-[220px]">
      <div className="font-semibold text-gray-800 text-sm mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
        <i className="fas fa-calendar-alt text-gray-400 text-xs" />
        {formatDateFn(data.date)}
      </div>
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.passed }} />
            {t('passed', lang)}
          </span>
          <span className="font-semibold text-blue-600">{data.passed}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.failed }} />
            {t('failed', lang)}
          </span>
          <span className="font-semibold text-red-600">{data.failed}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-gray-500">{t('total', lang)}</span>
          <span className="font-medium text-gray-700">{total}</span>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.passRate }} />
              {t('passRate', lang)}
            </span>
            <span className={`font-bold ${color}`}>{data.passRate.toFixed(1)}%</span>
          </div>
          <MiniBar value={data.passRate} max={100} color={barColor} />
        </div>
        <div className={`text-xs pt-1 ${trend.color}`}>
          {trend.icon} {trend.text}
        </div>
      </div>
    </div>
  );
};

interface RunDurationTooltipProps {
  active?: boolean;
  payload?: any[];
  lang: Lang;
  formatDate: (date: string) => string;
  avgDuration: number;
}

/**
 * 运行时长图表的自定义 Tooltip
 * 显示运行时长（人性化格式）及与平均值的趋势对比
 */
export const RunDurationTooltip: React.FC<RunDurationTooltipProps> = ({
  active,
  payload,
  lang,
  formatDate: formatDateFn,
  avgDuration,
}) => {
  if (!active || !payload || !payload.length || !payload[0]?.payload) return null;
  const data = payload[0].payload;
  const trend = getTrendLabel(data.duration, avgDuration, lang, true);

  const formatDurationLocal = (ms: number): string => {
    const totalSeconds = ms / 1000;
    if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-xl shadow-xl p-4 min-w-[220px]">
      <div className="font-semibold text-gray-800 text-sm mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
        <i className="fas fa-calendar-alt text-gray-400 text-xs" />
        {formatDateFn(data.date)}
      </div>
      <div className="space-y-2.5 text-sm">
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.duration }} />
              {t('duration', lang) || 'Duration'}
            </span>
            <span className="font-bold text-blue-600">{formatDurationLocal(data.duration)}</span>
          </div>
          <MiniBar value={data.duration} max={avgDuration * 2} color={CHART_COLORS.duration} />
        </div>
        <div className="flex justify-between items-center text-gray-500 pt-1 border-t border-gray-100">
          <span>{t('avgValue', lang)}</span>
          <span className="font-medium">{formatDurationLocal(avgDuration)}</span>
        </div>
        <div className={`text-xs ${trend.color}`}>
          {trend.icon} {trend.text}
          {data.duration < avgDuration ? ` · ${t('faster', lang)}` : data.duration > avgDuration ? ` · ${t('slower', lang)}` : ''}
        </div>
      </div>
    </div>
  );
};

interface TestSuiteSizeTooltipProps {
  active?: boolean;
  payload?: any[];
  lang: Lang;
  formatDate: (date: string) => string;
  avgPassRate: number;
}

/**
 * 测试用例数图表的自定义 Tooltip
 * 显示通过数、失败数、总数和通过率（含进度条与趋势对比）
 */
export const TestSuiteSizeTooltip: React.FC<TestSuiteSizeTooltipProps> = ({
  active,
  payload,
  lang,
  formatDate: formatDateFn,
  avgPassRate,
}) => {
  if (!active || !payload || !payload.length || !payload[0]?.payload) return null;
  const data = payload[0].payload;
  const total = data.passed + data.failed;
  const passRate = total > 0 ? (data.passed / total) * 100 : 0;
  const trend = getTrendLabel(passRate, avgPassRate, lang);
  const { color } = getPassRateColor(passRate);

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-xl shadow-xl p-4 min-w-[220px]">
      <div className="font-semibold text-gray-800 text-sm mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
        <i className="fas fa-calendar-alt text-gray-400 text-xs" />
        {formatDateFn(data.date)}
      </div>
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.passed }} />
            {t('passed', lang)}
          </span>
          <span className="font-semibold text-blue-600">{data.passed}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.failed }} />
            {t('failed', lang)}
          </span>
          <span className="font-semibold text-red-600">{data.failed}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="text-gray-500">{t('total', lang)}</span>
          <span className="font-medium text-gray-700">{total}</span>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.passRate }} />
              {t('passRateShort', lang)}
            </span>
            <span className={`font-bold ${color}`}>{passRate.toFixed(1)}%</span>
          </div>
          <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
            <div className="rounded-l-full transition-all" style={{ width: `${passRate}%`, backgroundColor: CHART_COLORS.passed }} />
            <div className="rounded-r-full transition-all" style={{ width: `${100 - passRate}%`, backgroundColor: CHART_COLORS.failed }} />
          </div>
        </div>
        <div className={`text-xs pt-1 ${trend.color}`}>
          {trend.icon} {trend.text}
        </div>
      </div>
    </div>
  );
};

interface TestFlakinessTooltipProps {
  active?: boolean;
  payload?: any[];
  lang: Lang;
  formatDate: (date: string) => string;
  avgFlakyRate: number;
}

/**
 * 测试稳定性图表的自定义 Tooltip
 * 显示不稳定用例数、不稳定率、稳定性等级（含进度条与趋势对比）
 */
export const TestFlakinessTooltip: React.FC<TestFlakinessTooltipProps> = ({
  active,
  payload,
  lang,
  formatDate: formatDateFn,
  avgFlakyRate,
}) => {
  if (!active || !payload || !payload.length || !payload[0]?.payload) return null;
  const data = payload[0].payload;
  const trend = getTrendLabel(data.flakyRate, avgFlakyRate, lang, true);
  
  const getStabilityInfo = (rate: number) => {
    if (rate <= 10) return { level: 'high', color: 'text-green-600', bg: 'bg-green-50 border-green-200', barColor: '#16a34a' };
    if (rate <= 30) return { level: 'medium', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', barColor: '#d97706' };
    return { level: 'low', color: 'text-red-600', bg: 'bg-red-50 border-red-200', barColor: '#dc2626' };
  };
  
  const stability = getStabilityInfo(data.flakyRate);

  return (
    <div className="bg-white/95 backdrop-blur-sm border border-gray-200/80 rounded-xl shadow-xl p-4 min-w-[220px]">
      <div className="font-semibold text-gray-800 text-sm mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
        <i className="fas fa-calendar-alt text-gray-400 text-xs" />
        {formatDateFn(data.date)}
      </div>
      <div className="space-y-2.5 text-sm">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-2 text-gray-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.flaky }} />
            {t('flakyTests', lang) || 'Flaky Tests'}
          </span>
          <span className="font-semibold text-purple-600">{data.flakyCount}</span>
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className="flex items-center gap-2 text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: CHART_COLORS.passRate }} />
              {t('flakyRate', lang) || 'Flaky Rate'}
            </span>
            <span className={`font-bold ${stability.color}`}>{data.flakyRate.toFixed(1)}%</span>
          </div>
          <MiniBar value={data.flakyRate} max={100} color={stability.barColor} />
        </div>
        <div className={`text-xs px-2 py-1 rounded-md border ${stability.bg} ${stability.color} font-medium`}>
          {t('stabilityLevel', lang)}: {t(stability.level, lang)}
        </div>
        <div className={`text-xs pt-1 ${trend.color}`}>
          {trend.icon} {trend.text}
        </div>
      </div>
    </div>
  );
};
