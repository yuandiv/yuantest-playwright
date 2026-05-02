import * as fs from 'fs/promises';
import * as path from 'path';
import { ContextUsed } from '../types';

/** 富集后的上下文信息接口 */
export interface EnrichedContext {
  sourceCode?: string;
  screenshotBase64?: string;
  consoleLogs: string[];
  stackTrace?: string;
  environmentInfo: string;
  historyData?: string;
  contextUsed: ContextUsed;
}

/** 源代码读取时的最大上下文行数 */
const SOURCE_CONTEXT_LINES = 20;

/** 源代码读取的最大总行数限制 */
const MAX_SOURCE_LINES = 100;

/**
 * 读取指定源代码文件，并在失败行处标注标记
 * 如果提供了 lineNumber，读取该行 ±20 行的上下文
 * 在返回的代码中，失败行前加 >>> 标记
 * @param filePath - 源代码文件路径
 * @param lineNumber - 失败行号（可选）
 * @returns 源代码字符串，文件不存在或读取失败时返回 undefined
 */
export async function readSourceCode(
  filePath: string,
  lineNumber?: number
): Promise<string | undefined> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const allLines = content.split('\n');

    if (lineNumber !== undefined && lineNumber > 0) {
      const startLine = Math.max(1, lineNumber - SOURCE_CONTEXT_LINES);
      const endLine = lineNumber + SOURCE_CONTEXT_LINES;
      const selectedLines = allLines.slice(startLine - 1, endLine);

      if (selectedLines.length > MAX_SOURCE_LINES) {
        selectedLines.length = MAX_SOURCE_LINES;
      }

      return selectedLines
        .map((line, index) => {
          const currentLine = startLine + index;
          const prefix = currentLine === lineNumber ? '>>> ' : '    ';
          return `${prefix}${currentLine} | ${line}`;
        })
        .join('\n');
    }

    const limitedLines = allLines.slice(0, MAX_SOURCE_LINES);
    return limitedLines.map((line, index) => `    ${index + 1} | ${line}`).join('\n');
  } catch {
    return undefined;
  }
}

/**
 * 将截图文件编码为 base64 字符串
 * 读取 screenshots 数组中的第一个文件并进行 base64 编码
 * @param screenshots - 截图文件路径数组
 * @returns base64 编码字符串，文件不存在或读取失败时返回 undefined
 */
export async function encodeScreenshot(screenshots: string[]): Promise<string | undefined> {
  if (!screenshots || screenshots.length === 0) {
    return undefined;
  }

  try {
    const screenshotBuffer = await fs.readFile(screenshots[0]);
    return screenshotBuffer.toString('base64');
  } catch {
    return undefined;
  }
}

/**
 * 构建环境信息字符串
 * 收集浏览器类型、操作系统、Node.js 版本和工作目录信息
 * @param testInfo - 包含 browser 字段的测试信息对象
 * @returns 格式化的环境信息字符串
 */
export function buildEnvironmentInfo(testInfo: { browser?: string }): string {
  const browser = testInfo.browser || 'unknown';
  const os = `${process.platform} ${process.arch}`;
  const nodeVersion = process.version;
  const cwd = process.cwd();

  return [`Browser: ${browser}`, `OS: ${os}`, `Node.js: ${nodeVersion}`, `CWD: ${cwd}`].join('\n');
}

/**
 * 构建历史运行上下文信息
 * 从 dataDir 目录下读取历史运行结果，查找指定测试的历史记录
 * 统计最近 5 次运行的通过/失败次数、失败率和上次失败原因
 * @param testTitle - 测试标题
 * @param dataDir - 数据目录路径
 * @returns 格式化的历史上下文字符串，无历史数据时返回 undefined
 */
export async function buildHistoryContext(
  testTitle: string,
  dataDir: string
): Promise<string | undefined> {
  try {
    const historyPath = path.join(dataDir, 'history.json');
    const content = await fs.readFile(historyPath, 'utf-8');
    const historyData = JSON.parse(content) as Array<{
      title: string;
      status: string;
      error?: string;
      timestamp: number;
    }>;

    const testRecords = historyData
      .filter((record) => record.title === testTitle)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    if (testRecords.length === 0) {
      return undefined;
    }

    const passCount = testRecords.filter((record) => record.status === 'passed').length;
    const failCount = testRecords.filter(
      (record) => record.status === 'failed' || record.status === 'timedout'
    ).length;
    const failureRate =
      testRecords.length > 0 ? Math.round((failCount / testRecords.length) * 100) : 0;

    const lastFailure = testRecords.find(
      (record) => record.status === 'failed' || record.status === 'timedout'
    );
    const lastFailureReason = lastFailure?.error || '无';

    return [
      '历史运行记录：',
      `- 最近 ${testRecords.length} 次运行：${passCount} 次通过，${failCount} 次失败`,
      `- 失败率：${failureRate}%`,
      `- 上次失败原因：${lastFailureReason}`,
    ].join('\n');
  } catch {
    return undefined;
  }
}

/**
 * 上下文富集主函数
 * 根据测试失败信息，收集源代码、截图、控制台日志、堆栈跟踪、
 * 环境信息和历史数据，生成富集后的上下文对象
 * @param testInfo - 测试信息对象，包含标题、错误、堆栈、文件路径等
 * @param dataDir - 数据目录路径，用于读取历史记录
 * @returns 富集后的上下文对象
 */
export async function enrichContext(
  testInfo: {
    title: string;
    error?: string;
    stackTrace?: string;
    filePath?: string;
    lineNumber?: number;
    screenshots?: string[];
    logs?: string[];
    browser?: string;
  },
  dataDir: string
): Promise<EnrichedContext> {
  const contextUsed: ContextUsed = {
    sourceCode: false,
    screenshot: false,
    consoleLogs: false,
    stackTrace: false,
    historyData: false,
    environmentInfo: true,
  };

  const sourceCode =
    testInfo.filePath !== undefined
      ? await readSourceCode(testInfo.filePath, testInfo.lineNumber)
      : undefined;
  contextUsed.sourceCode = sourceCode !== undefined;

  const screenshotBase64 =
    testInfo.screenshots !== undefined ? await encodeScreenshot(testInfo.screenshots) : undefined;
  contextUsed.screenshot = screenshotBase64 !== undefined;

  const consoleLogs = testInfo.logs ?? [];
  contextUsed.consoleLogs = consoleLogs.length > 0;

  contextUsed.stackTrace = testInfo.stackTrace !== undefined;

  const historyData = await buildHistoryContext(testInfo.title, dataDir);
  contextUsed.historyData = historyData !== undefined;

  return {
    sourceCode,
    screenshotBase64,
    consoleLogs,
    stackTrace: testInfo.stackTrace,
    environmentInfo: buildEnvironmentInfo(testInfo),
    historyData,
    contextUsed,
  };
}
