import type { RunReport, RunDetail } from '../types';
import {
  ReportParser,
  PlaywrightReportParser,
  RunResultReportParser,
  DefaultReportParser,
} from './report-parser';

/**
 * ReportDataService — 报告数据转换服务层
 *
 * 职责：
 * 1. 根据原始报告数据格式，选择合适的解析器提取测试详情
 * 2. 将服务器返回的 run 数据 + 解析出的 details 组装为标准 RunReport
 * 3. 合并新旧报告列表（去重 + 按时间排序 + 限制数量）
 *
 * 不负责：网络请求、React 状态管理（由 useReports hook 处理）
 */
export class ReportDataService {
  private parsers: ReportParser[];

  constructor() {
    // 顺序很重要：具体格式解析器在前，默认兜底解析器在最后
    this.parsers = [
      new PlaywrightReportParser(),
      new RunResultReportParser(),
      new DefaultReportParser(),
    ];
  }

  /**
   * 从原始报告中解析出测试详情列表
   *
   * 优先尝试 Playwright 格式和 RunResult 格式，
   * 若都无法识别则使用默认解析器兜底。
   */
  parseDetails(rawReport: any, runId: number): RunDetail[] {
    const parser =
      this.parsers.find((p) => p.canParse(rawReport)) ??
      this.parsers[this.parsers.length - 1];
    return parser.parse(rawReport, runId);
  }

  /**
   * 将服务器返回的 run 数据转换为标准 RunReport
   *
   * @param run  服务器返回的单条运行记录
   * @param rawReport  对应的原始 Playwright 报告（可能为 null）
   */
  convertToRunReport(run: any, rawReport: any): RunReport {
    // 优先使用 rawReport 解析；若 rawReport 无可用数据则回退到 run.suites
    let details = this.parseDetails(rawReport, run.id);
    if (details.length === 0 && run.suites) {
      details = this.parseDetails(run, run.id);
    }

    return {
      id: run.id,
      timestamp: new Date(run.startTime).toISOString(),
      version: run.version || 'unknown',
      totalTests: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      duration: ((run.duration || 0) / 1000).toFixed(2),
      details,
      htmlReportUrl: rawReport?.htmlReportUrl || null,
      skippedQuarantinedTests: run.metadata?.skippedQuarantinedTests || [],
      status: run.status === 'success' ? 'completed' : run.status,
    };
  }

  /**
   * 合并新旧报告列表
   *
   * - 以旧列表为基础，用新报告覆盖同 id 的记录
   * - 按时间倒序排序
   * - 最多保留 maxItems 条
   */
  mergeReports(
    prev: RunReport[],
    newReports: RunReport[],
    maxItems: number = 50
  ): RunReport[] {
    const reportMap = new Map(prev.map((r) => [r.id, r]));
    for (const r of newReports) {
      reportMap.set(r.id, r);
    }
    return Array.from(reportMap.values())
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, maxItems);
  }

  /**
   * 从报告列表中查找正在运行的报告
   */
  findRunningReport(reports: RunReport[]): RunReport | undefined {
    return reports.find((r) => r.status === 'running');
  }
}
