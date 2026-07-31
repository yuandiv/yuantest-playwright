/**
 * 内置工具：run_test — 运行 Playwright 测试文件
 * 参数名与原始内联版本一致（projectRoot），确保 LLM 调用兼容。
 */
import { defineTool } from '../types';
import { TestRunner } from '../../agents/test-runner';

export function createRunTestTool(projectRoot: string) {
  return defineTool(
    'run_test',
    'Run a Playwright test file and return structured results',
    {
      filePath: { type: 'string', description: 'Path to the test file' },
      projectRoot: { type: 'string', description: 'Project root directory (optional)' },
    },
    ['filePath'],
    async (args) => {
      const filePath = args.filePath as string;
      const root = (args.projectRoot as string) || projectRoot;

      try {
        const runner = new TestRunner();
        const results = await runner.runTest(filePath, root);

        if (results.length === 0) {
          return `No test results returned for: ${filePath}`;
        }

        const passed = results.filter((r) => r.status === 'passed').length;
        const failed = results.filter((r) => r.status === 'failed').length;
        const skipped = results.filter((r) => r.status === 'skipped').length;

        let summary = `Test results for ${filePath}:\n`;
        summary += `  Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}, Total: ${results.length}\n`;

        const failures = results.filter((r) => r.status === 'failed');
        if (failures.length > 0) {
          summary += '\nFailed tests:\n';
          for (const f of failures) {
            summary += `  - ${f.title}: ${f.error || 'Unknown error'}\n`;
            if (f.stack) {
              summary += `    Stack: ${f.stack.slice(0, 500)}\n`;
            }
          }
        }

        return summary;
      } catch (error) {
        return `Failed to run test: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
