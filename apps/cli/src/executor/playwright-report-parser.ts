import { TestResult, SuiteResult, BrowserType } from '../types';
import { stripAnsi } from '../utils/strings';

interface PlaywrightJSONAttachment {
  name: string;
  contentType?: string;
  path?: string;
  body?: string;
}

interface PlaywrightJSONTestResult {
  workerIndex: number;
  parallelIndex: number;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  duration: number;
  error?: { message?: string; value?: string; stack?: string };
  errors?: string[];
  stdout?: Array<{ text?: string; buffer?: string }>;
  stderr?: string[];
  retry: number;
  startTime: string;
  annotations: Array<{ type: string; description?: string }>;
  attachments: PlaywrightJSONAttachment[];
}

interface PlaywrightJSONTest {
  timeout: number;
  annotations: Array<{ type: string; description?: string }>;
  expectedStatus: string;
  projectId: string;
  projectName: string;
  results: PlaywrightJSONTestResult[];
  status: 'expected' | 'unexpected' | 'flaky' | 'skipped';
}

interface PlaywrightJSONSpec {
  id: string;
  title: string;
  ok: boolean;
  tags: string[];
  tests: PlaywrightJSONTest[];
  file?: string;
  line?: number;
  column?: number;
}

interface PlaywrightJSONSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  specs: PlaywrightJSONSpec[];
  suites?: PlaywrightJSONSuite[];
}

interface PlaywrightJSONStats {
  startTime: string;
  duration: number;
  expected: number;
  skipped: number;
  unexpected: number;
  flaky: number;
}

export interface PlaywrightJSONReport {
  config: Record<string, unknown>;
  suites: PlaywrightJSONSuite[];
  errors: unknown[];
  stats: PlaywrightJSONStats;
}

export interface ParsedReport {
  suites: SuiteResult[];
  flakyTests: TestResult[];
  stats: PlaywrightJSONStats;
}

export class PlaywrightReportParser {
  static parseReport(report: PlaywrightJSONReport): ParsedReport {
    const suites: SuiteResult[] = [];
    const flakyTests: TestResult[] = [];

    const processSuite = (
      suite: PlaywrightJSONSuite,
      parentFile?: string,
      parentLine?: number
    ): SuiteResult => {
      const suiteResult: SuiteResult = {
        name: suite.title,
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
        tests: [],
        timestamp: Date.now(),
      };

      const currentFile = suite.file || parentFile;
      const currentLine = suite.line || parentLine;

      for (const spec of suite.specs) {
        for (const test of spec.tests) {
          const lastResult = test.results[test.results.length - 1];
          if (!lastResult) {
            continue;
          }

          const mapped = PlaywrightReportParser.mapTestResult(
            spec,
            test,
            lastResult,
            currentFile,
            currentLine
          );

          suiteResult.tests.push(mapped);
          suiteResult.totalTests++;
          suiteResult.duration += lastResult.duration || 0;

          if (mapped.status === 'passed') {
            suiteResult.passed++;
          } else if (mapped.status === 'failed' || mapped.status === 'timedout') {
            suiteResult.failed++;
          } else if (mapped.status === 'skipped') {
            suiteResult.skipped++;
          }

          if (lastResult.retry > 0) {
            flakyTests.push(mapped);
          }
        }
      }

      if (suite.suites) {
        for (const childSuite of suite.suites) {
          const childResult = processSuite(childSuite, currentFile, currentLine);
          suiteResult.totalTests += childResult.totalTests;
          suiteResult.passed += childResult.passed;
          suiteResult.failed += childResult.failed;
          suiteResult.skipped += childResult.skipped;
          suiteResult.duration += childResult.duration;
          suiteResult.tests.push(...childResult.tests);
        }
      }

      if (suiteResult.totalTests > 0) {
        suites.push(suiteResult);
      }

      return suiteResult;
    };

    for (const suite of report.suites) {
      processSuite(suite);
    }

    return { suites, flakyTests, stats: report.stats };
  }

  static mapTestResult(
    spec: PlaywrightJSONSpec,
    test: PlaywrightJSONTest,
    result: PlaywrightJSONTestResult,
    parentFile?: string,
    parentLine?: number
  ): TestResult {
    const status: TestResult['status'] =
      result.status === 'passed'
        ? 'passed'
        : result.status === 'skipped'
          ? 'skipped'
          : result.status === 'timedOut'
            ? 'timedout'
            : 'failed';

    const testId = spec.id || `${spec.file || parentFile}:${spec.line || parentLine}:${spec.title}`;

    return {
      id: testId,
      title: spec.title || 'Unknown Test',
      fullTitle: spec.title,
      file: spec.file || parentFile,
      line: spec.line || parentLine,
      column: spec.column,
      status,
      duration: result.duration || 0,
      error:
        result.error?.message || result.error?.value
          ? stripAnsi(result.error?.message || result.error?.value || '')
          : undefined,
      stackTrace: result.error?.stack ? stripAnsi(result.error.stack) : undefined,
      retries: result.retry || 0,
      timestamp: Date.now(),
      browser: (test.projectName || 'chromium') as BrowserType,
      screenshots: (result.attachments || [])
        .filter(
          (a: PlaywrightJSONAttachment) =>
            a.name === 'screenshot' || a.contentType?.startsWith('image/')
        )
        .map((a: PlaywrightJSONAttachment) => a.path || a.body)
        .filter((p): p is string => !!p),
      videos: (result.attachments || [])
        .filter(
          (a: PlaywrightJSONAttachment) => a.name === 'video' || a.contentType?.startsWith('video/')
        )
        .map((a: PlaywrightJSONAttachment) => a.path || a.body)
        .filter((p): p is string => !!p),
      traces: (result.attachments || [])
        .filter((a: PlaywrightJSONAttachment) => a.name === 'trace')
        .map((a: PlaywrightJSONAttachment) => a.path || a.body)
        .filter((p): p is string => !!p),
      logs: result.stderr?.map(stripAnsi).filter((l: string) => l.trim()) || [],
    };
  }
}
