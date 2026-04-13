import { HealthMetric } from '../types';

/** 生成指定天数的模拟健康指标数据，用于开发/测试 */
export function generateSampleHealthMetrics(days: number = 14): HealthMetric[] {
  const metrics: HealthMetric[] = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const totalTests = Math.floor(Math.random() * 50) + 30;
    const failed = Math.floor(Math.random() * 10);
    const passed = totalTests - failed;
    const passRate = totalTests > 0 ? (passed / totalTests) * 100 : 0;
    
    const runDuration = (Math.random() * 300000) + 100000;
    
    const flakyCount = Math.floor(Math.random() * 8);
    const totalRuns = Math.floor(Math.random() * 20) + 10;
    const flakyRate = totalRuns > 0 ? flakyCount / totalRuns : 0;
    
    metrics.push({
      date: date.toISOString().split('T')[0],
      timestamp: date.getTime(),
      runStatus: {
        passed,
        failed,
        total: totalTests,
        passRate,
      },
      runDuration,
      testSuiteSize: {
        total: totalTests,
        passed,
        failed,
      },
      testFlakiness: {
        flakyCount,
        flakyRate,
        totalRuns,
      },
    });
  }
  
  return metrics;
}
