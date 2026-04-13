import React from 'react';
import { Lang, t } from '../i18n';
import { TrendIndicator } from '../types';

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}

/**
 * 迷你趋势图组件
 * @param data - 数据点数组
 * @param color - 线条颜色
 * @param width - 宽度
 * @param height - 高度
 */
const Sparkline: React.FC<SparklineProps> = ({ data, color, width = 60, height = 24 }) => {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="opacity-60">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

interface TrendBadgeProps {
  trend: TrendIndicator;
}

/**
 * 趋势徽章组件
 * @param trend - 趋势指标数据
 */
const TrendBadge: React.FC<TrendBadgeProps> = ({ trend }) => {
  if (trend.direction === 'stable') {
    return (
      <span className="text-xs text-gray-400 flex items-center gap-0.5">
        <i className="fas fa-minus text-[10px]"></i>
        <span>持平</span>
      </span>
    );
  }

  const icon = trend.direction === 'up' ? 'fa-arrow-up' : 'fa-arrow-down';
  const colorClass = trend.isPositive ? 'text-green-500' : 'text-red-500';
  const bgClass = trend.isPositive ? 'bg-green-50' : 'bg-red-50';

  return (
    <span className={`text-xs ${colorClass} ${bgClass} px-1.5 py-0.5 rounded flex items-center gap-0.5`}>
      <i className={`fas ${icon} text-[10px]`}></i>
      <span>{trend.value.toFixed(1)}</span>
    </span>
  );
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  gradient: string;
  borderColor: string;
  valueColor: string;
  iconBg: string;
  trend?: TrendIndicator;
  sparkline?: { data: number[]; color: string };
}

/**
 * 单个统计卡片组件
 * @param label - 标签文本
 * @param value - 数值
 * @param icon - 图标类名
 * @param gradient - 背景渐变类名
 * @param borderColor - 边框颜色类名
 * @param valueColor - 数值颜色类名
 * @param iconBg - 图标背景色
 * @param trend - 趋势指标
 * @param sparkline - 迷你图数据
 */
const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon,
  gradient,
  borderColor,
  valueColor,
  iconBg,
  trend,
  sparkline,
}) => (
  <div
    className={`bg-gradient-to-br ${gradient} rounded-xl p-4 border ${borderColor} hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`}
  >
    <div className="flex items-start justify-between mb-2">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center`}>
        <i className={`${icon} text-sm text-white`}></i>
      </div>
      {trend && <TrendBadge trend={trend} />}
    </div>
    <div className="text-xs text-gray-600 mb-1">{label}</div>
    <div className="flex items-end justify-between">
      <div className={`text-2xl font-bold ${valueColor}`}>{value}</div>
      {sparkline && sparkline.data.length >= 2 && (
        <Sparkline data={sparkline.data} color={sparkline.color} />
      )}
    </div>
  </div>
);

interface StatsCardsProps {
  lang: Lang;
  latestPassRate: number;
  avgPassRate: number;
  avgDuration: number;
  totalTests: number;
  totalFlaky: number;
  trends?: {
    passRate: TrendIndicator;
    duration: TrendIndicator;
    totalTests: TrendIndicator;
    flakyCount: TrendIndicator;
  };
  sparkline?: {
    passRate: number[];
    duration: number[];
    totalTests: number[];
    flakyCount: number[];
  };
}

/**
 * 统计卡片组组件
 * 显示健康仪表盘的关键统计数据，包含趋势指示器和迷你图
 */
export const StatsCards: React.FC<StatsCardsProps> = ({
  lang,
  latestPassRate,
  avgPassRate,
  avgDuration,
  totalTests,
  totalFlaky,
  trends,
  sparkline,
}) => {
  const cards = [
    {
      label: t('latestPassRate', lang) || 'Latest Pass Rate',
      value: `${latestPassRate.toFixed(1)}%`,
      icon: 'fas fa-check-circle',
      gradient: 'from-green-50 to-emerald-50',
      borderColor: 'border-green-100',
      valueColor: 'text-green-600',
      iconBg: 'bg-gradient-to-br from-green-400 to-emerald-500',
      trend: trends?.passRate,
      sparkline: sparkline ? { data: sparkline.passRate, color: '#22c55e' } : undefined,
    },
    {
      label: t('avgPassRate', lang) || 'Avg Pass Rate',
      value: `${avgPassRate.toFixed(1)}%`,
      icon: 'fas fa-chart-line',
      gradient: 'from-blue-50 to-cyan-50',
      borderColor: 'border-blue-100',
      valueColor: 'text-blue-600',
      iconBg: 'bg-gradient-to-br from-blue-400 to-cyan-500',
      trend: undefined,
      sparkline: undefined,
    },
    {
      label: t('avgDuration', lang) || 'Avg Duration',
      value: `${(avgDuration / 1000).toFixed(1)}s`,
      icon: 'fas fa-clock',
      gradient: 'from-purple-50 to-violet-50',
      borderColor: 'border-purple-100',
      valueColor: 'text-purple-600',
      iconBg: 'bg-gradient-to-br from-purple-400 to-violet-500',
      trend: trends?.duration,
      sparkline: sparkline ? { data: sparkline.duration, color: '#8b5cf6' } : undefined,
    },
    {
      label: t('totalTests', lang) || 'Total Tests',
      value: totalTests.toLocaleString(),
      icon: 'fas fa-layer-group',
      gradient: 'from-amber-50 to-orange-50',
      borderColor: 'border-amber-100',
      valueColor: 'text-amber-600',
      iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
      trend: trends?.totalTests,
      sparkline: sparkline ? { data: sparkline.totalTests, color: '#f59e0b' } : undefined,
    },
    {
      label: t('totalFlaky', lang) || 'Total Flaky',
      value: totalFlaky,
      icon: 'fas fa-bug',
      gradient: 'from-pink-50 to-rose-50',
      borderColor: 'border-pink-100',
      valueColor: 'text-pink-600',
      iconBg: 'bg-gradient-to-br from-pink-400 to-rose-500',
      trend: trends?.flakyCount,
      sparkline: sparkline ? { data: sparkline.flakyCount, color: '#ec4899' } : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-5">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}
    </div>
  );
};
