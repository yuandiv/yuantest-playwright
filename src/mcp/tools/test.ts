import { TestRunner } from '../../agents/test-runner';
import type { MCPTool } from '../types';

// 模块级单例：TestRunner 实例
let testRunnerInstance: TestRunner | null = null;

function getTestRunner(): TestRunner {
  if (!testRunnerInstance) {
    testRunnerInstance = new TestRunner();
  }
  return testRunnerInstance;
}

export const runTest: MCPTool = {
  name: 'run_test',
  description: 'Run a Playwright test file and return the results',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to the Playwright test file to run' },
      projectRoot: { type: 'string', description: 'Project root directory (defaults to cwd)' },
    },
    required: ['filePath'],
  },
  handler: async (args) => {
    try {
      const filePath = args.filePath as string;
      const projectRoot = (args.projectRoot as string) || process.cwd();
      const results = await getTestRunner().runTest(filePath, projectRoot);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No test results returned. The test file may not contain any tests or failed to parse.',
            },
          ],
        };
      }

      const summary = results
        .map((r) => {
          let line = `[${r.status.toUpperCase()}] ${r.title} (${r.file}${r.line ? `:${r.line}` : ''})`;
          if (r.error) {
            line += `\n  Error: ${r.error}`;
          }
          return line;
        })
        .join('\n');

      const passed = results.filter((r) => r.status === 'passed').length;
      const failed = results.filter((r) => r.status === 'failed').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;

      const header = `Test Results: ${passed} passed, ${failed} failed, ${skipped} skipped\n`;

      return {
        content: [{ type: 'text' as const, text: header + summary }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error running test: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

export const testTools: MCPTool[] = [runTest];
