export const NODE_TYPE_STYLES: Record<string, { fill: string; stroke: string; icon: string; label: string }> = {
  test: { fill: '#dbeafe', stroke: '#3b82f6', icon: 'fa-vial', label: 'Test' },
  infrastructure: { fill: '#fef3c7', stroke: '#f59e0b', icon: 'fa-server', label: 'Infra' },
  external_service: { fill: '#fce7f3', stroke: '#ec4899', icon: 'fa-cloud', label: 'ExtSvc' },
  shared_state: { fill: '#e0e7ff', stroke: '#6366f1', icon: 'fa-database', label: 'Shared' },
};

export const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

export const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bg: string; border: string; text: string }> = {
  timeout: { icon: 'fas fa-clock', color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'bg-yellow-100 text-yellow-700' },
  selector: { icon: 'fas fa-crosshairs', color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', text: 'bg-purple-100 text-purple-700' },
  network: { icon: 'fas fa-wifi', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', text: 'bg-blue-100 text-blue-700' },
  assertion: { icon: 'fas fa-exclamation-triangle', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', text: 'bg-red-100 text-red-700' },
  unknown: { icon: 'fas fa-question-circle', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200', text: 'bg-gray-100 text-gray-700' },
};

export function getCategoryConfig(category: string) {
  return CATEGORY_CONFIG[category] || CATEGORY_CONFIG.unknown;
}
