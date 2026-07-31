import { Lang, t } from '../i18n';

/**
 * 格式化毫秒时长为人类可读格式
 * @param ms - 毫秒数
 * @param lang - 语言设置
 * @returns 格式化后的时间字符串，如 "2m 30s" 或 "45.2s"
 */
export const formatDuration = (ms: number, lang: Lang): string => {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
};

/**
 * 根据当前值与平均值计算趋势标签
 * @param current - 当前值
 * @param avg - 平均值
 * @param lang - 语言设置
 * @param invert - 是否反转趋势判断（用于时长等越小越好的指标）
 * @returns 趋势标签对象，包含文本、颜色和图标
 */
export const getTrendLabel = (
  current: number,
  avg: number,
  lang: Lang,
  invert = false
): { text: string; color: string; icon: string } => {
  const diff = ((current - avg) / avg) * 100;
  if (Math.abs(diff) < 2) return { text: t('same', lang), color: 'text-gray-500', icon: '→' };
  const isPositive = invert ? diff < 0 : diff > 0;
  if (isPositive) return { text: `${t('vsAvg', lang)} ↑ ${Math.abs(diff).toFixed(0)}%`, color: 'text-green-600', icon: '↑' };
  return { text: `${t('vsAvg', lang)} ↓ ${Math.abs(diff).toFixed(0)}%`, color: 'text-red-500', icon: '↓' };
};

/**
 * 根据通过率获取对应的颜色配置
 * @param passRate - 通过率百分比
 * @returns 颜色配置对象
 */
export const getPassRateColor = (passRate: number): { color: string; barColor: string } => {
  if (passRate >= 80) return { color: 'text-green-600', barColor: '#16a34a' };
  if (passRate >= 50) return { color: 'text-amber-600', barColor: '#d97706' };
  return { color: 'text-red-600', barColor: '#dc2626' };
};

/**
 * 根据不稳定率获取稳定性等级
 * @param flakyRate - 不稳定率百分比
 * @returns 稳定性等级配置
 */
export const getStabilityLevel = (flakyRate: number): { level: string; color: string; bg: string } => {
  if (flakyRate <= 10) return { level: 'high', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
  if (flakyRate <= 30) return { level: 'medium', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' };
  return { level: 'low', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
};

/**
 * 格式化日期字符串为本地化显示
 * @param dateStr - ISO 格式的日期字符串
 * @param lang - 语言设置
 * @returns 本地化的日期字符串
 */
export const formatDate = (dateStr: string, lang: Lang): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' });
};
