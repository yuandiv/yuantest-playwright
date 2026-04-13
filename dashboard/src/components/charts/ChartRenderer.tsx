import React from 'react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area,
  Cell,
} from 'recharts';
import { Lang, t } from '../../i18n';
import { HealthTrendData } from '../../types';
import { CHART_COLORS } from '../../constants/dashboard';
import { formatDate } from '../../utils/dashboardHelpers';
import {
  RunStatusTooltip,
  RunDurationTooltip,
  TestSuiteSizeTooltip,
  TestFlakinessTooltip,
} from '../tooltips/ChartTooltips';

interface BaseChartProps {
  data: HealthTrendData[];
  lang: Lang;
  avgPassRate: number;
  avgDuration: number;
  avgFlakyRate: number;
}

const commonChartProps = {
  margin: { top: 20, right: 20, left: 0, bottom: 10 },
};

const commonAxisProps = {
  tick: { fontSize: 12, fill: '#6b7280', fontWeight: 500 },
  axisLine: { stroke: '#e5e7eb', strokeWidth: 1 },
  tickLine: false,
};

const gridProps = {
  strokeDasharray: '4 4',
  stroke: '#f3f4f6',
  vertical: false,
};

const tooltipProps = {
  cursor: { fill: 'rgba(99, 102, 241, 0.08)' as const },
  contentStyle: { display: 'none' },
};

const legendProps = {
  wrapperStyle: { fontSize: '12px', color: '#6b7280', paddingTop: '16px' },
  iconType: 'circle' as const,
  iconSize: 8,
};

/**
 * 运行状态图表组件
 * 显示通过/失败数量柱状图和通过率折线图
 */
export const RunStatusChart: React.FC<BaseChartProps> = ({ data, lang, avgPassRate }) => {
  const formatDateFn = (dateStr: string) => formatDate(dateStr, lang);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data} {...commonChartProps}>
        <defs>
          <linearGradient id="passedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.passed} stopOpacity={0.9} />
            <stop offset="100%" stopColor={CHART_COLORS.passed} stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.failed} stopOpacity={0.9} />
            <stop offset="100%" stopColor={CHART_COLORS.failed} stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="passRateGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={CHART_COLORS.passRate} stopOpacity={1} />
            <stop offset="100%" stopColor="#a855f7" stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="date"
          {...commonAxisProps}
          tickFormatter={formatDateFn}
          tickMargin={8}
        />
        <YAxis yAxisId="left" {...commonAxisProps} tickMargin={8} />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          {...commonAxisProps}
          tickFormatter={(value) => `${value}%`}
          tickMargin={8}
        />
        <Tooltip
          {...tooltipProps}
          content={<RunStatusTooltip lang={lang} formatDate={formatDateFn} avgPassRate={avgPassRate} />}
        />
        <Legend {...legendProps} />
        <Bar
          yAxisId="left"
          dataKey="passed"
          name={t('passed', lang)}
          fill="url(#passedGradient)"
          radius={[6, 6, 0, 0]}
          maxBarSize={40}
        />
        <Bar
          yAxisId="left"
          dataKey="failed"
          name={t('failed', lang)}
          fill="url(#failedGradient)"
          radius={[6, 6, 0, 0]}
          maxBarSize={40}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="passRate"
          name={t('passRate', lang)}
          stroke="url(#passRateGradient)"
          strokeWidth={3}
          dot={{ fill: CHART_COLORS.passRate, r: 5, strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 7, strokeWidth: 3, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

/**
 * 运行时长图表组件
 * 显示每次运行的时长柱状图
 */
export const RunDurationChart: React.FC<BaseChartProps> = ({ data, lang, avgDuration }) => {
  const formatDateFn = (dateStr: string) => formatDate(dateStr, lang);
  const maxDuration = Math.max(...data.map(d => d.duration));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} {...commonChartProps}>
        <defs>
          <linearGradient id="durationGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.duration} stopOpacity={0.9} />
            <stop offset="100%" stopColor={CHART_COLORS.duration} stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="date"
          {...commonAxisProps}
          tickFormatter={formatDateFn}
          tickMargin={8}
        />
        <YAxis
          {...commonAxisProps}
          tickFormatter={(value) => `${(value / 1000).toFixed(0)}s`}
          tickMargin={8}
        />
        <Tooltip
          {...tooltipProps}
          content={<RunDurationTooltip lang={lang} formatDate={formatDateFn} avgDuration={avgDuration} />}
        />
        <Legend {...legendProps} />
        <Bar
          dataKey="duration"
          name={t('duration', lang) || 'Duration'}
          fill="url(#durationGradient)"
          radius={[6, 6, 0, 0]}
          maxBarSize={50}
        >
          {data.map((entry, index) => {
            const ratio = entry.duration / maxDuration;
            const color = ratio > 0.8 ? '#ef4444' : ratio > 0.5 ? '#f59e0b' : CHART_COLORS.duration;
            return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.85} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * 测试套件大小图表组件
 * 显示通过/失败数量的堆叠柱状图
 */
export const TestSuiteSizeChart: React.FC<BaseChartProps> = ({ data, lang, avgPassRate }) => {
  const formatDateFn = (dateStr: string) => formatDate(dateStr, lang);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} {...commonChartProps}>
        <defs>
          <linearGradient id="suitePassedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.passed} stopOpacity={0.9} />
            <stop offset="100%" stopColor={CHART_COLORS.passed} stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="suiteFailedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.failed} stopOpacity={0.9} />
            <stop offset="100%" stopColor={CHART_COLORS.failed} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="date"
          {...commonAxisProps}
          tickFormatter={formatDateFn}
          tickMargin={8}
        />
        <YAxis {...commonAxisProps} tickMargin={8} />
        <Tooltip
          {...tooltipProps}
          content={<TestSuiteSizeTooltip lang={lang} formatDate={formatDateFn} avgPassRate={avgPassRate} />}
        />
        <Legend {...legendProps} />
        <Bar
          dataKey="passed"
          name={t('passed', lang)}
          stackId="a"
          fill="url(#suitePassedGradient)"
          radius={[0, 0, 0, 0]}
          maxBarSize={50}
        />
        <Bar
          dataKey="failed"
          name={t('failed', lang)}
          stackId="a"
          fill="url(#suiteFailedGradient)"
          radius={[6, 6, 0, 0]}
          maxBarSize={50}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * 测试稳定性图表组件
 * 显示不稳定用例数量柱状图和不稳定率折线图
 */
export const TestFlakinessChart: React.FC<BaseChartProps> = ({ data, lang, avgFlakyRate }) => {
  const formatDateFn = (dateStr: string) => formatDate(dateStr, lang);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <ComposedChart data={data} {...commonChartProps}>
        <defs>
          <linearGradient id="flakyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_COLORS.flaky} stopOpacity={0.9} />
            <stop offset="100%" stopColor={CHART_COLORS.flaky} stopOpacity={0.5} />
          </linearGradient>
          <linearGradient id="flakyRateGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ec4899" stopOpacity={1} />
            <stop offset="100%" stopColor={CHART_COLORS.passRate} stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridProps} />
        <XAxis
          dataKey="date"
          {...commonAxisProps}
          tickFormatter={formatDateFn}
          tickMargin={8}
        />
        <YAxis yAxisId="left" {...commonAxisProps} tickMargin={8} />
        <YAxis
          yAxisId="right"
          orientation="right"
          domain={[0, 100]}
          {...commonAxisProps}
          tickFormatter={(value) => `${value}%`}
          tickMargin={8}
        />
        <Tooltip
          {...tooltipProps}
          content={<TestFlakinessTooltip lang={lang} formatDate={formatDateFn} avgFlakyRate={avgFlakyRate} />}
        />
        <Legend {...legendProps} />
        <Bar
          yAxisId="left"
          dataKey="flakyCount"
          name={t('flakyTests', lang) || 'Flaky Tests'}
          fill="url(#flakyGradient)"
          radius={[6, 6, 0, 0]}
          maxBarSize={40}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="flakyRate"
          name={t('flakyRate', lang) || 'Flaky Rate'}
          stroke="url(#flakyRateGradient)"
          strokeWidth={3}
          dot={{ fill: '#ec4899', r: 5, strokeWidth: 2, stroke: '#fff' }}
          activeDot={{ r: 7, strokeWidth: 3, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

interface ChartRendererProps extends BaseChartProps {
  activeTab: 'runStatus' | 'runDuration' | 'testSuiteSize' | 'testFlakiness';
}

/**
 * 图表渲染器组件
 * 根据当前选中的 Tab 渲染对应的图表
 */
export const ChartRenderer: React.FC<ChartRendererProps> = ({
  activeTab,
  ...props
}) => {
  switch (activeTab) {
    case 'runStatus':
      return <RunStatusChart {...props} />;
    case 'runDuration':
      return <RunDurationChart {...props} />;
    case 'testSuiteSize':
      return <TestSuiteSizeChart {...props} />;
    case 'testFlakiness':
      return <TestFlakinessChart {...props} />;
    default:
      return null;
  }
};
