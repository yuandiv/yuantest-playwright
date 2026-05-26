import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock i18n
vi.mock('../../i18n', () => ({
  t: (key: string, _lang?: string) => key,
}));

import { exportToCSV, exportToJSON, exportToHTML, printReport } from '../../utils/exportUtils';
import type { HealthMetric, HealthTrendData } from '../../types';

// Mock DOM APIs
beforeEach(() => {
  // Mock URL.createObjectURL and revokeObjectURL
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  globalThis.URL.revokeObjectURL = vi.fn();

  // Mock document.createElement and body methods
  const mockLink = { href: '', download: '', click: vi.fn() };
  vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
});

const mockTrendData: HealthTrendData[] = [
  { date: '2024-01-15', passed: 45, failed: 5, passRate: 90, duration: 150000, suiteSize: 50, flakyRate: 5, flakyCount: 2 },
  { date: '2024-01-14', passed: 48, failed: 2, passRate: 96, duration: 120000, suiteSize: 50, flakyRate: 3, flakyCount: 1 },
];

const mockMetrics: HealthMetric[] = [
  {
    date: '2024-01-15',
    timestamp: Date.now(),
    runStatus: { passed: 45, failed: 5, total: 50, passRate: 90 },
    runDuration: 150000,
    testSuiteSize: { total: 50, passed: 45, failed: 5 },
    testFlakiness: { flakyCount: 2, flakyRate: 5, totalRuns: 15 },
  },
];

describe('exportToCSV', () => {
  it('creates a CSV blob with BOM', () => {
    exportToCSV(mockTrendData, 'en', 'test-report');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    const blobCall = (globalThis.URL.createObjectURL as any).mock.calls[0][0] as Blob;
    expect(blobCall.type).toBe('text/csv;charset=utf-8;');
  });
});

describe('exportToJSON', () => {
  it('creates a JSON blob', () => {
    exportToJSON(mockMetrics, 'en', 'test-report');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    const blobCall = (globalThis.URL.createObjectURL as any).mock.calls[0][0] as Blob;
    expect(blobCall.type).toBe('application/json;charset=utf-8;');
  });
});

describe('exportToHTML', () => {
  it('creates an HTML blob with stats', () => {
    const stats = { latestPassRate: 90, avgPassRate: 93, avgDuration: 135000, totalTests: 50, totalFlaky: 3 };
    exportToHTML(mockTrendData, stats, 'en', 'test-report');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    const blobCall = (globalThis.URL.createObjectURL as any).mock.calls[0][0] as Blob;
    expect(blobCall.type).toBe('text/html;charset=utf-8;');
  });
});

describe('printReport', () => {
  it('calls window.print', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    printReport();
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });
});
