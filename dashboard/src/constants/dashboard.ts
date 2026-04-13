import { DashboardConfig } from '../types';

export const CHART_COLORS = {
  passed: '#2563eb',
  failed: '#dc2626',
  flaky: '#d946ef',
  duration: '#2563eb',
  passRate: '#a855f7',
} as const;

export const TAB_CONFIG = [
  { key: 'runStatus', icon: 'fas fa-heartbeat', labelKey: 'runStatus' },
  { key: 'runDuration', icon: 'fas fa-clock', labelKey: 'runDuration' },
  { key: 'testSuiteSize', icon: 'fas fa-layer-group', labelKey: 'testSuiteSize' },
  { key: 'testFlakiness', icon: 'fas fa-wave-square', labelKey: 'testFlakiness' },
] as const;

export const STORAGE_KEY = 'healthDashboardConfig';

export const DEFAULT_CONFIG: DashboardConfig = {
  dateRange: {
    start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  },
  activeTab: 'runStatus',
  chartType: 'bar',
};

export const STABILITY_LEVELS = {
  high: { threshold: 10, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  medium: { threshold: 30, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  low: { threshold: Infinity, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
} as const;

export const PASS_RATE_LEVELS = {
  good: { threshold: 80, color: 'text-green-600', barColor: '#16a34a' },
  warning: { threshold: 50, color: 'text-amber-600', barColor: '#d97706' },
  poor: { threshold: 0, color: 'text-red-600', barColor: '#dc2626' },
} as const;
