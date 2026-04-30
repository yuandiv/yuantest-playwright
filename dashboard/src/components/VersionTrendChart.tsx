import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Lang } from '../i18n';
import { t } from '../i18n';

type ChartType = 'line' | 'bar' | 'area' | 'pie';

interface VersionTrendChartProps {
  lang: Lang;
  data: Array<{
    version: string;
    passRate: string;
    total: number;
    runs: number;
    failed?: number;
    duration?: string;
  }>;
}

const COLORS = ['#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6'];

const chartTypes: { key: ChartType; icon: string; labelKey: string }[] = [
  { key: 'line', icon: 'fas fa-chart-line', labelKey: 'lineChart' },
  { key: 'bar', icon: 'fas fa-chart-bar', labelKey: 'barChart' },
  { key: 'area', icon: 'fas fa-chart-area', labelKey: 'areaChart' },
  { key: 'pie', icon: 'fas fa-chart-pie', labelKey: 'pieChart' },
];

function formatVersionLabel(version: string): string {
  if (!version || typeof version !== 'string') return 'v0.0.0';
  const cleanVersion = version.replace(/^v/i, '');
  return `v${cleanVersion}`;
}

function parseVersion(version: string): number[] {
  if (!version || typeof version !== 'string') return [0, 0, 0];
  
  const cleanVersion = version.replace(/^v/i, '').replace(/[^0-9.]/g, '');
  if (!cleanVersion) return [0, 0, 0];
  
  const parts = cleanVersion.split('.').map(p => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : Math.max(0, num);
  });
  
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function compareVersions(a: string, b: string): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  
  for (let i = 0; i < 3; i++) {
    if (aParts[i] !== bParts[i]) {
      return aParts[i] - bParts[i];
    }
  }
  return 0;
}

function getTrendIndicator(current: number, previous: number | null): { icon: string; color: string; text: string } {
  if (previous === null) return { icon: 'fas fa-minus', color: 'text-gray-400', text: '' };
  
  const diff = current - previous;
  if (Math.abs(diff) < 1) {
    return { icon: 'fas fa-minus', color: 'text-gray-400', text: '→' };
  } else if (diff > 0) {
    return { icon: 'fas fa-arrow-up', color: 'text-green-500', text: `+${diff.toFixed(1)}%` };
  } else {
    return { icon: 'fas fa-arrow-down', color: 'text-red-500', text: `${diff.toFixed(1)}%` };
  }
}

export function VersionTrendChart({ lang, data }: VersionTrendChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line');

  const sortedData = useMemo(() => {
    return [...data];
  }, [data]);

  const chartData = useMemo(() => {
    return sortedData.map((item, index) => {
      const passRateNum = parseFloat(item.passRate) || 0;
      const prevPassRate = index > 0 ? (parseFloat(sortedData[index - 1].passRate) || 0) : null;
      const trend = getTrendIndicator(passRateNum, prevPassRate);
      
      return {
        ...item,
        passRateNum,
        label: formatVersionLabel(item.version),
        failed: item.failed ?? (item.total - Math.round(item.total * passRateNum / 100)),
        trend,
        trendIcon: trend.icon,
        trendColor: trend.color,
        trendText: trend.text,
      };
    });
  }, [sortedData]);

  const pieData = useMemo(() => {
    return chartData.map(item => ({
      name: formatVersionLabel(item.version),
      value: item.passRateNum,
      total: item.total,
      runs: item.runs,
      failed: item.failed,
    }));
  }, [chartData]);

  const stats = useMemo(() => {
    if (chartData.length === 0) return null;
    
    const avgPassRate = chartData.reduce((sum, item) => sum + (item.passRateNum || 0), 0) / chartData.length;
    const latestVersion = chartData[chartData.length - 1];
    const prevVersion = chartData.length > 1 ? chartData[chartData.length - 2] : null;
    const totalRuns = chartData.reduce((sum, item) => sum + (item.runs || 0), 0);
    const totalTests = chartData.reduce((sum, item) => sum + (item.total || 0), 0);
    
    return {
      avgPassRate: avgPassRate.toFixed(1),
      latestPassRate: (latestVersion.passRateNum || 0).toFixed(1),
      trend: prevVersion ? getTrendIndicator(latestVersion.passRateNum || 0, prevVersion.passRateNum || 0) : null,
      totalRuns,
      totalTests,
      totalVersions: chartData.length,
    };
  }, [chartData]);

  const getBarColor = (rate: number) => {
    if (rate >= 80) return '#22c55e';
    if (rate >= 50) return '#f59e0b';
    return '#ef4444';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length || !payload[0]?.payload) return null;
    
    const data = payload[0].payload;
    const passRate = data.passRateNum ?? 0;
    const failed = data.failed ?? 0;
    const passed = (data.total ?? 0) - failed;
    
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px]">
        <div className="font-semibold text-gray-800 mb-2 pb-2 border-b border-gray-100">
          {t('version', lang)}: {label}
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('passRate', lang)}:</span>
            <span className={`font-semibold ${passRate >= 80 ? 'text-green-600' : passRate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
              {passRate.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('totalCases', lang)}:</span>
            <span className="font-medium text-gray-800">{data.total ?? 0}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('passed', lang)}:</span>
            <span className="font-medium text-green-600">{passed}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('failed', lang)}:</span>
            <span className="font-medium text-red-600">{failed}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">{t('runs', lang) || 'Runs'}:</span>
            <span className="font-medium text-gray-800">{data.runs ?? 0}</span>
          </div>
          {data.trendText && (
            <div className="flex justify-between items-center pt-1.5 border-t border-gray-100">
              <span className="text-gray-600">{t('trend', lang) || 'Trend'}:</span>
              <span className={`font-medium ${data.trendColor?.replace('text-', '') || 'text-gray-600'}`}>
                <i className={`${data.trendIcon || 'fas fa-minus'} mr-1`}></i>
                {data.trendText}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 45 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#6b7280' }} 
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `${value}%`}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="passRateNum"
                name={t('passRate', lang)}
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ fill: '#22c55e', strokeWidth: 2, r: 3 }}
                activeDot={{ r: 5, fill: '#16a34a' }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 45 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `${value}%`}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey="passRateNum"
                name={t('passRate', lang)}
                radius={[4, 4, 0, 0]}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={getBarColor(entry.passRateNum)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 45 }}>
              <defs>
                <linearGradient id="colorPassRate" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                interval="preserveStartEnd"
                angle={-30}
                textAnchor="end"
                height={50}
              />
              <YAxis 
                domain={[0, 100]} 
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tickFormatter={(value) => `${value}%`}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="passRateNum"
                name={t('passRate', lang)}
                stroke="#22c55e"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPassRate)"
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="45%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                label={({ name, value }) => `${name}: ${value.toFixed(0)}%`}
                labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div className="bg-white rounded-[1.25rem] shadow-sm p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-3 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-700">
          <i className="fas fa-chart-simple mr-1.5 text-green-500"></i>{t('versionTrend', lang)}
        </h3>
        <div className="flex gap-1">
          {chartTypes.map(type => (
            <button
              key={type.key}
              onClick={() => setChartType(type.key)}
              className={`p-1.5 rounded-lg transition-all ${
                chartType === type.key 
                  ? 'bg-green-100 text-green-600' 
                  : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
              }`}
              title={t(type.labelKey, lang)}
            >
              <i className={`${type.icon} text-sm`}></i>
            </button>
          ))}
        </div>
      </div>
      
      {stats && (
        <div className="grid grid-cols-4 gap-2 mb-3 flex-shrink-0">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-2 border border-green-100">
            <div className="text-[10px] text-gray-600 mb-0.5">{t('avgPassRate', lang) || 'Avg Pass Rate'}</div>
            <div className="text-lg font-bold text-green-600">{stats.avgPassRate}%</div>
          </div>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-2 border border-blue-100">
            <div className="text-[10px] text-gray-600 mb-0.5">{t('latestVersion', lang) || 'Latest Version'}</div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-bold text-blue-600">{stats.latestPassRate}%</span>
              {stats.trend && (
                <span className={stats.trend.color}>
                  <i className={`${stats.trend.icon} text-xs`}></i>
                </span>
              )}
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg p-2 border border-purple-100">
            <div className="text-[10px] text-gray-600 mb-0.5">{t('totalRuns', lang) || 'Total Runs'}</div>
            <div className="text-lg font-bold text-purple-600">{stats.totalRuns}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-2 border border-amber-100">
            <div className="text-[10px] text-gray-600 mb-0.5">{t('versions', lang) || 'Versions'}</div>
            <div className="text-lg font-bold text-amber-600">{stats.totalVersions}</div>
          </div>
        </div>
      )}
      
      <div className="flex-1 min-h-0 overflow-visible pb-2">
        {data.length === 0 ? (
          <p className="text-gray-400 text-xs p-3 text-center">{t('noVersionData', lang)}</p>
        ) : (
          renderChart()
        )}
      </div>
    </div>
  );
}
