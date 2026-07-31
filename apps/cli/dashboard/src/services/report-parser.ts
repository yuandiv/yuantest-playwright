import type { RunDetail, TestAttachment } from '../types';

/**
 * 报告解析器接口 — 策略模式抽象
 *
 * 每种报告格式实现该接口，由 ReportDataService 统一调度。
 */
export interface ReportParser {
  /** 判断该解析器是否能处理给定的原始报告数据 */
  canParse(rawReport: any): boolean;
  /** 从原始报告中提取所有测试条目 */
  parse(rawReport: any, runId: number): RunDetail[];
}

// ─── 内部工具函数 ────────────────────────────────────────────────────────────

/**
 * 递归提取 Playwright 原生格式（suite.specs）中的所有 spec
 */
function extractSpecs(suites: any[]): any[] {
  const specs: any[] = [];
  for (const suite of suites) {
    if (suite.specs && Array.isArray(suite.specs)) {
      specs.push(...suite.specs);
    }
    if (suite.suites && Array.isArray(suite.suites)) {
      specs.push(...extractSpecs(suite.suites));
    }
  }
  return specs;
}

/**
 * 递归提取 RunResult 格式（suite.tests）中的所有 test
 */
function extractTests(suites: any[]): any[] {
  const tests: any[] = [];
  for (const suite of suites) {
    if (suite.tests && Array.isArray(suite.tests)) {
      tests.push(...suite.tests);
    }
    if (suite.suites && Array.isArray(suite.suites)) {
      tests.push(...extractTests(suite.suites));
    }
  }
  return tests;
}

/**
 * 从单个测试条目中提取附件信息
 */
function extractAttachments(test: any, testResult: any): TestAttachment[] {
  if (testResult?.attachments && Array.isArray(testResult.attachments)) {
    return testResult.attachments.map((att: any) => ({
      name: att.name,
      path: att.path,
      contentType: att.contentType,
      body: att.body,
    }));
  }

  const attachments: TestAttachment[] = [];
  if (test.screenshots && Array.isArray(test.screenshots)) {
    attachments.push(
      ...test.screenshots.map((p: string) => ({
        name: 'screenshot',
        path: p,
        contentType: 'image/png',
      }))
    );
  }
  if (test.videos && Array.isArray(test.videos)) {
    attachments.push(
      ...test.videos.map((p: string) => ({
        name: 'video',
        path: p,
        contentType: 'video/webm',
      }))
    );
  }
  if (test.traces && Array.isArray(test.traces)) {
    attachments.push(
      ...test.traces.map((p: string) => ({
        name: 'trace',
        path: p,
        contentType: 'application/zip',
      }))
    );
  }
  return attachments;
}

/**
 * 从单个测试条目中提取错误信息
 */
function extractErrorMessage(test: any, testResult: any): string | null {
  if (testResult?.error) {
    if (typeof testResult.error === 'string') {
      return testResult.error;
    }
    if (testResult.error.message) {
      const msg = testResult.error.message;
      return testResult.error.stack
        ? `${msg}\n\nStack trace:\n${testResult.error.stack}`
        : msg;
    }
    if (testResult.error.value) {
      return testResult.error.value;
    }
  }
  if (test.error?.message) {
    return test.error.message;
  }
  if (test.error) {
    return typeof test.error === 'string'
      ? test.error
      : test.error.message || String(test.error);
  }
  return null;
}

/**
 * 将原始测试条目转换为标准化的 RunDetail
 */
function convertTestToDetail(test: any, runId: number): RunDetail {
  const testResult = test.tests?.[0]?.results?.[0] || test.results?.[0];
  const isPassed =
    test.ok === true ||
    test.status === 'passed' ||
    testResult?.status === 'passed';

  return {
    id: test.id || `${test.title}_${runId}`,
    name: test.title,
    status: isPassed ? 'passed' : 'failed',
    duration: ((test.duration || testResult?.duration || 0) / 1000).toFixed(2),
    error: extractErrorMessage(test, testResult),
    attachments: extractAttachments(test, testResult),
    file: test.file,
    line: test.line,
    retries: test.retries || testResult?.retry || 0,
    manualReruns: test.manualReruns || 0,
    runHistory: test.runHistory || undefined,
  };
}

// ─── 具体解析器实现 ──────────────────────────────────────────────────────────

/**
 * Playwright 原生格式解析器
 *
 * 识别特征：suite 中包含 `specs` 字段
 */
export class PlaywrightReportParser implements ReportParser {
  canParse(rawReport: any): boolean {
    return rawReport?.suites?.some((s: any) => s.specs) ?? false;
  }

  parse(rawReport: any, runId: number): RunDetail[] {
    if (!rawReport?.suites) return [];
    return extractSpecs(rawReport.suites).map((spec) =>
      convertTestToDetail(spec, runId)
    );
  }
}

/**
 * RunResult 格式解析器
 *
 * 识别特征：suite 中包含 `tests` 字段（且无 `specs`）
 */
export class RunResultReportParser implements ReportParser {
  canParse(rawReport: any): boolean {
    return rawReport?.suites?.some((s: any) => s.tests && !s.specs) ?? false;
  }

  parse(rawReport: any, runId: number): RunDetail[] {
    if (!rawReport?.suites) return [];
    return extractTests(rawReport.suites).map((test) =>
      convertTestToDetail(test, runId)
    );
  }
}

/**
 * 默认解析器 — 兜底处理
 *
 * 当无法识别报告格式时，尝试从 run.suites 中提取数据，
 * 若仍无数据则返回空数组。
 */
export class DefaultReportParser implements ReportParser {
  canParse(_rawReport: any): boolean {
    return true;
  }

  parse(rawReport: any, runId: number): RunDetail[] {
    const suites = rawReport?.suites;
    if (!suites) return [];
    return extractTests(suites).map((test) =>
      convertTestToDetail(test, runId)
    );
  }
}
