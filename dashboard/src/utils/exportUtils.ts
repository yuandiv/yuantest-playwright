import { HealthMetric, HealthTrendData } from '../types';
import { Lang, t } from '../i18n';

export function exportToCSV(data: HealthTrendData[], lang: Lang, filename: string = 'health-report'): void {
  const headers = [
    t('date', lang) || 'Date',
    t('passed', lang) || 'Passed',
    t('failed', lang) || 'Failed',
    t('passRate', lang) || 'Pass Rate (%)',
    t('duration', lang) || 'Duration (ms)',
    t('testSuiteSize', lang) || 'Suite Size',
    t('flakyCount', lang) || 'Flaky Count',
    t('flakyRate', lang) || 'Flaky Rate (%)',
  ];
  
  const rows = data.map(d => [
    d.date,
    d.passed.toString(),
    d.failed.toString(),
    d.passRate.toFixed(2),
    d.duration.toString(),
    d.suiteSize.toString(),
    d.flakyCount.toString(),
    d.flakyRate.toFixed(2),
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(',')),
  ].join('\n');
  
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportToJSON(data: HealthMetric[], lang: Lang, filename: string = 'health-report'): void {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  downloadBlob(blob, `${filename}.json`);
}

export function exportToHTML(data: HealthTrendData[], stats: {
  latestPassRate: number;
  avgPassRate: number;
  avgDuration: number;
  totalTests: number;
  totalFlaky: number;
}, lang: Lang, filename: string = 'health-report'): void {
  const title = t('healthDashboard', lang) || 'Health Dashboard';
  const dateStr = new Date().toLocaleString();
  
  const htmlContent = `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f3f4f6;
      padding: 20px;
      color: #1f2937;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { 
      font-size: 24px; 
      font-weight: 700; 
      margin-bottom: 8px;
      color: #111827;
    }
    .subtitle { color: #6b7280; margin-bottom: 24px; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .stat-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .stat-value { font-size: 28px; font-weight: 700; }
    .stat-value.green { color: #059669; }
    .stat-value.blue { color: #2563eb; }
    .stat-value.purple { color: #7c3aed; }
    .stat-value.amber { color: #d97706; }
    .stat-value.pink { color: #db2777; }
    table {
      width: 100%;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 16px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
      font-size: 12px;
      color: #374151;
      text-transform: uppercase;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: #f9fafb; }
    .pass-rate { 
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .pass-rate.high { background: #d1fae5; color: #065f46; }
    .pass-rate.medium { background: #fef3c7; color: #92400e; }
    .pass-rate.low { background: #fee2e2; color: #991b1b; }
    .footer {
      margin-top: 32px;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }
    @media print {
      body { background: white; padding: 0; }
      .stat-card { box-shadow: none; border: 1px solid #e5e7eb; }
      table { box-shadow: none; border: 1px solid #e5e7eb; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p class="subtitle">${t('generatedAt', lang) || 'Generated at'}: ${dateStr}</p>
    
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">${t('latestPassRate', lang) || 'Latest Pass Rate'}</div>
        <div class="stat-value green">${stats.latestPassRate.toFixed(1)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('avgPassRate', lang) || 'Avg Pass Rate'}</div>
        <div class="stat-value blue">${stats.avgPassRate.toFixed(1)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('avgDuration', lang) || 'Avg Duration'}</div>
        <div class="stat-value purple">${(stats.avgDuration / 1000).toFixed(1)}s</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('totalTests', lang) || 'Total Tests'}</div>
        <div class="stat-value amber">${stats.totalTests}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t('totalFlaky', lang) || 'Total Flaky'}</div>
        <div class="stat-value pink">${stats.totalFlaky}</div>
      </div>
    </div>
    
    <table>
      <thead>
        <tr>
          <th>${t('date', lang) || 'Date'}</th>
          <th>${t('passed', lang) || 'Passed'}</th>
          <th>${t('failed', lang) || 'Failed'}</th>
          <th>${t('passRate', lang) || 'Pass Rate'}</th>
          <th>${t('duration', lang) || 'Duration'}</th>
          <th>${t('flakyCount', lang) || 'Flaky'}</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(d => `
          <tr>
            <td>${d.date}</td>
            <td>${d.passed}</td>
            <td>${d.failed}</td>
            <td>
              <span class="pass-rate ${d.passRate >= 80 ? 'high' : d.passRate >= 50 ? 'medium' : 'low'}">
                ${d.passRate.toFixed(1)}%
              </span>
            </td>
            <td>${(d.duration / 1000).toFixed(1)}s</td>
            <td>${d.flakyCount}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="footer">
      ${t('generatedBy', lang) || 'Generated by'} Yuantest Playwright Dashboard
    </div>
  </div>
</body>
</html>`;
  
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  downloadBlob(blob, `${filename}.html`);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printReport(): void {
  window.print();
}
