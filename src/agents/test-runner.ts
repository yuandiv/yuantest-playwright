import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger';

const execFileAsync = promisify(execFile);

export interface TestRunResult {
  status: 'passed' | 'failed' | 'skipped';
  title: string;
  error?: string;
  stack?: string;
  file: string;
  line?: number;
}

export interface TestRunSummary {
  passed: boolean;
  error?: string;
  stackTrace?: string;
  testResults: TestRunResult[];
}

export class TestRunner {
  private log = logger.child('TestRunner');

  /**
   * Run a Playwright test file with JSON reporter and return structured results.
   * Consolidates HealerAgent.runPlaywrightTest() logic.
   */
  async runTest(
    filePath: string,
    projectRoot: string,
    options?: { grep?: string }
  ): Promise<TestRunResult[]> {
    const args = ['playwright', 'test', filePath, '--reporter=json'];
    if (options?.grep) {
      args.push('--grep', options.grep);
    }

    try {
      const { stdout } = await execFileAsync('npx', args, {
        cwd: projectRoot,
        shell: true,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5 * 60 * 1000,
      });

      return this.parseJsonReporterOutput(stdout, filePath);
    } catch (error) {
      // execFile throws on non-zero exit code, but stdout still has JSON results
      const execError = error as { stdout?: string };
      if (execError.stdout) {
        const results = this.parseJsonReporterOutput(execError.stdout, filePath);
        if (results.length > 0) {
          return results;
        }
      }

      this.log.warn(
        `Failed to run Playwright test: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }

  /**
   * Run a single test file and return a summary.
   * Consolidates AgentService.runSingleTest() logic.
   */
  async runSingleTest(filePath: string, projectRoot: string): Promise<TestRunSummary> {
    const testResults = await this.runTest(filePath, projectRoot);

    const failures = testResults.filter((r) => r.status === 'failed');

    if (failures.length === 0) {
      return { passed: true, testResults };
    }

    const errorMessage = failures
      .map((f) => `${f.title}: ${f.error || 'Unknown error'}`)
      .join('\n');
    const stackTrace = failures
      .map((f) => f.stack || '')
      .filter(Boolean)
      .join('\n')
      .slice(0, 2000);

    return {
      passed: false,
      error: errorMessage,
      stackTrace,
      testResults,
    };
  }

  private parseJsonReporterOutput(stdout: string, filePath: string): TestRunResult[] {
    const results: TestRunResult[] = [];

    const lines = stdout.split('\n').filter((line) => line.startsWith('{'));
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        if (event.type === 'test' && event.status) {
          results.push({
            status: event.status,
            title: event.title,
            error: event.errors?.[0]?.message,
            stack: event.errors?.[0]?.stack,
            file: event.file || filePath,
            line: event.line,
          });
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return results;
  }
}
