import React from 'react';
import { Lang, t } from '../i18n';
import { HealthMetric } from '../types';
import { TAB_CONFIG, DEFAULT_CONFIG } from '../constants/dashboard';
import { useDashboardConfig } from '../hooks/useDashboardConfig';
import { useChartData } from '../hooks/useChartData';
import { StatsCards } from './StatsCards';
import { ChartRenderer } from './charts/ChartRenderer';
import { exportToCSV, exportToJSON, exportToHTML } from '../utils/exportUtils';

interface HealthDashboardProps {
  lang: Lang;
  data: HealthMetric[];
  onRefresh: () => void;
}

/**
 * 健康仪表盘主组件
 * 显示测试运行的健康指标数据，包括统计卡片和图表
 */
export const HealthDashboard: React.FC<HealthDashboardProps> = ({ lang, data, onRefresh }) => {
  const { config, setDateRange, setActiveTab } = useDashboardConfig();
  const { chartData, stats, hasData } = useChartData(data);

  const handleExportCSV = () => {
    if (stats && chartData.length > 0) {
      exportToCSV(chartData, lang, `health-report-${new Date().toISOString().split('T')[0]}`);
    }
  };

  const handleExportHTML = () => {
    if (stats && chartData.length > 0) {
      exportToHTML(chartData, stats, lang, `health-report-${new Date().toISOString().split('T')[0]}`);
    }
  };

  const handleExportJSON = () => {
    if (stats && data.length > 0) {
      exportToJSON(data, lang, `health-report-${new Date().toISOString().split('T')[0]}`);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
      <div className="p-5">
        <DashboardToolbar
          lang={lang}
          config={config}
          stats={stats}
          hasData={hasData && !!stats}
          onRefresh={onRefresh}
          onDateChange={setDateRange}
          onExportCSV={handleExportCSV}
          onExportHTML={handleExportHTML}
          onExportJSON={handleExportJSON}
        />

        {stats && hasData ? (
          <StatsCards
            lang={lang}
            latestPassRate={stats.latestPassRate}
            avgPassRate={stats.avgPassRate}
            avgDuration={stats.avgDuration}
            totalTests={stats.totalTests}
            totalFlaky={stats.totalFlaky}
            trends={stats.trends}
            sparkline={stats.sparkline}
          />
        ) : (
          <EmptyState lang={lang} />
        )}

        <TabSelector
          lang={lang}
          activeTab={config.activeTab}
          onTabChange={setActiveTab}
        />

        <ChartContainer hasData={hasData} lang={lang}>
          {stats && (
            <ChartRenderer
              data={chartData}
              lang={lang}
              activeTab={config.activeTab}
              avgPassRate={stats.avgPassRate}
              avgDuration={stats.avgDuration}
              avgFlakyRate={stats.avgFlakyRate}
            />
          )}
        </ChartContainer>
      </div>
    </div>
  );
};

interface DashboardToolbarProps {
  lang: Lang;
  config: { dateRange: { start: string; end: string } };
  stats: any;
  hasData: boolean;
  onRefresh: () => void;
  onDateChange: (start: string, end: string) => void;
  onExportCSV: () => void;
  onExportHTML: () => void;
  onExportJSON: () => void;
}

/**
 * 仪表盘工具栏组件
 * 包含日期选择器、重置按钮和导出按钮
 */
const DashboardToolbar: React.FC<DashboardToolbarProps> = ({
  lang,
  config,
  stats,
  hasData,
  onRefresh,
  onDateChange,
  onExportCSV,
  onExportHTML,
  onExportJSON,
}) => (
  <div className="flex flex-wrap gap-3 mb-5 items-center">
    <div className="flex items-center gap-2">
      <label className="text-sm font-semibold text-gray-700">
        <i className="fas fa-calendar-alt mr-1.5 text-gray-400"></i>
        {t('dateRange', lang) || 'Dates range'}
      </label>
      <input
        type="date"
        value={config.dateRange.start}
        onChange={(e) => onDateChange(e.target.value, config.dateRange.end)}
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
      />
      <span className="text-gray-300">→</span>
      <input
        type="date"
        value={config.dateRange.end}
        onChange={(e) => onDateChange(config.dateRange.start, e.target.value)}
        className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
      />
    </div>

    <div className="flex-1"></div>

    <button
      onClick={onRefresh}
      className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-100 hover:text-blue-700 transition-all cursor-pointer"
      title={t('refresh', lang) || 'Refresh'}
    >
      <i className="fas fa-sync-alt"></i>
      <span>{t('refresh', lang) || 'Refresh'}</span>
    </button>

    <ExportButtons
      lang={lang}
      hasData={hasData}
      onExportCSV={onExportCSV}
      onExportHTML={onExportHTML}
      onExportJSON={onExportJSON}
    />

    {stats && (
      <div className="flex items-center gap-2 ml-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-200">
        <i className="fas fa-database text-indigo-500 text-sm"></i>
        <div className="text-xs">
          <span className="text-indigo-600 font-medium">{t('dataPoints', lang) || 'Data Points'}: </span>
          <span className="text-indigo-700 font-semibold">{stats.dataPoints}</span>
        </div>
      </div>
    )}
  </div>
);

interface ExportButtonsProps {
  lang: Lang;
  hasData: boolean;
  onExportCSV: () => void;
  onExportHTML: () => void;
  onExportJSON: () => void;
}

/**
 * 导出按钮组组件
 */
const ExportButtons: React.FC<ExportButtonsProps> = ({
  lang,
  hasData,
  onExportCSV,
  onExportHTML,
  onExportJSON,
}) => (
  <div className="flex items-center gap-2">
    <button
      onClick={onExportCSV}
      disabled={!hasData}
      className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 hover:bg-emerald-100 hover:text-emerald-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      title={t('exportExcel', lang) || 'Export to Excel/CSV'}
    >
      <i className="fas fa-file-excel"></i>
      <span>CSV</span>
    </button>
    <button
      onClick={onExportHTML}
      disabled={!hasData}
      className="flex items-center gap-2 text-xs text-sky-600 bg-sky-50 px-3 py-2 rounded-lg border border-sky-200 hover:bg-sky-100 hover:text-sky-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      title={t('exportPdf', lang) || 'Export to HTML (Print to PDF)'}
    >
      <i className="fas fa-file-pdf"></i>
      <span>HTML</span>
    </button>
    <button
      onClick={onExportJSON}
      disabled={!hasData}
      className="flex items-center gap-2 text-xs text-violet-600 bg-violet-50 px-3 py-2 rounded-lg border border-violet-200 hover:bg-violet-100 hover:text-violet-700 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      title={t('exportJson', lang) || 'Export to JSON'}
    >
      <i className="fas fa-file-code"></i>
      <span>JSON</span>
    </button>
  </div>
);

interface TabSelectorProps {
  lang: Lang;
  activeTab: string;
  onTabChange: (tab: 'runStatus' | 'runDuration' | 'testSuiteSize' | 'testFlakiness') => void;
}

/**
 * Tab 选择器组件
 */
const TabSelector: React.FC<TabSelectorProps> = ({ lang, activeTab, onTabChange }) => (
  <div className="mb-4">
    <div className="inline-flex bg-gray-100 rounded-xl p-1 gap-1">
      {TAB_CONFIG.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === tab.key
              ? 'bg-white text-gray-800 shadow-sm'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          <i className={`${tab.icon} mr-2`}></i>
          {t(tab.labelKey, lang) || tab.labelKey}
        </button>
      ))}
    </div>
  </div>
);

interface EmptyStateProps {
  lang: Lang;
}

/**
 * 空状态组件
 */
const EmptyState: React.FC<EmptyStateProps> = ({ lang }) => (
  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-8 mb-5 text-center">
    <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
      <i className="fas fa-chart-line text-2xl text-gray-400"></i>
    </div>
    <p className="text-gray-500 text-sm mb-2">
      {t('noHealthData', lang) || 'No health data available. Run tests to generate metrics.'}
    </p>
    <p className="text-gray-400 text-xs">
      {t('runTestsHint', lang) || 'Run some tests to see health metrics here'}
    </p>
  </div>
);

interface ChartContainerProps {
  hasData: boolean;
  lang: Lang;
  children: React.ReactNode;
}

/**
 * 图表容器组件
 */
const ChartContainer: React.FC<ChartContainerProps> = ({ hasData, lang, children }) => (
  <div className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-4 border border-gray-100">
    {!hasData ? (
      <div className="text-center text-gray-400 py-12">
        <i className="fas fa-chart-line text-4xl mb-3"></i>
        <p>{t('noHealthData', lang) || 'No health data available'}</p>
      </div>
    ) : (
      children
    )}
  </div>
);

export default HealthDashboard;
