import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { readSourceCode, encodeScreenshot } from '../diagnosis/context-enricher';
import { TestRunner } from './test-runner';
import { PatchApplier } from './patch-applier';
import { AppExplorer } from './explorer';
import type { HealerPatch, ExploreOptions } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolDefinition {
  schema: ToolSchema;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ─── Security constants ───────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials/i,
  /\.npmrc$/i,
  /ssh\/config/i,
  /\.gitconfig/i,
  /htpasswd/i,
];

const BLOCKED_DIRS = ['node_modules', '.git', '__pycache__', '.venv', 'venv'];

function isPathAllowed(filePath: string, projectRoot: string): boolean {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(projectRoot)) {
    return false;
  }
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(resolved)) {
      return false;
    }
  }
  return true;
}

// ─── ToolRegistry ─────────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private log = logger.child('ToolRegistry');

  constructor() {}

  registerTool(
    name: string,
    schema: ToolSchema,
    handler: (args: Record<string, unknown>) => Promise<string>
  ): void {
    this.tools.set(name, { schema, handler });
    this.log.info(`Registered tool: ${name}`);
  }

  unregisterTool(name: string): void {
    if (this.tools.delete(name)) {
      this.log.info(`Unregistered tool: ${name}`);
    }
  }

  getToolSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((def) => def.schema);
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    this.log.info(`Executing tool: ${name}`);
    return tool.handler(args);
  }

  getMCPToolDefinitions(): MCPToolDefinition[] {
    return Array.from(this.tools.values()).map((def) => ({
      name: def.schema.function.name,
      description: def.schema.function.description,
      inputSchema: def.schema.function.parameters,
    }));
  }

  // ─── Factory ──────────────────────────────────────────────────────────────

  static createDefaultRegistry(dataDir: string, projectRoot: string): ToolRegistry {
    const registry = new ToolRegistry();

    // 1. read_source_file
    registry.registerTool(
      'read_source_file',
      {
        type: 'function',
        function: {
          name: 'read_source_file',
          description: 'Read source code from a file path, optionally specifying line range',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to read' },
              startLine: { type: 'number', description: 'Start line number (optional)' },
              endLine: { type: 'number', description: 'End line number (optional)' },
            },
            required: ['path'],
          },
        },
      },
      async (args) => {
        const filePath = args.path as string;
        if (!isPathAllowed(filePath, projectRoot)) {
          return `Access denied: path outside project directory or sensitive file: ${filePath}`;
        }
        const startLine = args.startLine as number | undefined;
        const result = await readSourceCode(filePath, startLine);
        return result ?? `File not found or unable to read: ${filePath}`;
      }
    );

    // 2. search_codebase
    registry.registerTool(
      'search_codebase',
      {
        type: 'function',
        function: {
          name: 'search_codebase',
          description: 'Search for a pattern in the codebase files',
          parameters: {
            type: 'object',
            properties: {
              pattern: { type: 'string', description: 'Search pattern (regex or string)' },
              filePattern: {
                type: 'string',
                description: 'File glob pattern to filter (optional)',
              },
            },
            required: ['pattern'],
          },
        },
      },
      async (args) => {
        const pattern = args.pattern as string;
        const filePattern = args.filePattern as string | undefined;
        const cwd = projectRoot;
        const results: string[] = [];

        const searchDir = (dir: string, depth: number = 0) => {
          if (depth > 8 || results.length >= 20) {
            return;
          }
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              if (results.length >= 20) {
                break;
              }
              if (entry.name.startsWith('.') || BLOCKED_DIRS.includes(entry.name)) {
                continue;
              }
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                searchDir(fullPath, depth + 1);
              } else if (entry.isFile()) {
                if (filePattern && !entry.name.match(filePattern.replace(/\*/g, '.*'))) {
                  continue;
                }
                if (!isPathAllowed(fullPath, projectRoot)) {
                  continue;
                }
                try {
                  const content = fs.readFileSync(fullPath, 'utf-8');
                  const lines = content.split('\n');
                  for (let i = 0; i < lines.length; i++) {
                    if (results.length >= 20) {
                      break;
                    }
                    if (lines[i].includes(pattern)) {
                      results.push(`${fullPath}:${i + 1}: ${lines[i].trim()}`);
                    }
                  }
                } catch {
                  // Skip unreadable files
                }
              }
            }
          } catch {
            // Skip inaccessible directories
          }
        };

        searchDir(cwd);
        return results.length > 0 ? results.join('\n') : `No matches found for pattern: ${pattern}`;
      }
    );

    // 3. query_test_history
    registry.registerTool(
      'query_test_history',
      {
        type: 'function',
        function: {
          name: 'query_test_history',
          description: 'Query historical test run records for a specific test',
          parameters: {
            type: 'object',
            properties: {
              testId: { type: 'string', description: 'Test ID to query' },
              limit: {
                type: 'number',
                description: 'Maximum number of records to return (default 5)',
              },
            },
            required: ['testId'],
          },
        },
      },
      async (args) => {
        const testId = args.testId as string;
        const limit = (args.limit as number) || 5;
        const historyPath = path.join(dataDir, 'history.json');

        try {
          if (!fs.existsSync(historyPath)) {
            return `No history file found at: ${historyPath}`;
          }
          const content = fs.readFileSync(historyPath, 'utf-8');
          const historyData = JSON.parse(content) as Array<{
            testId?: string;
            title?: string;
            status: string;
            error?: string;
            timestamp: number;
          }>;

          const records = historyData
            .filter((record) => record.testId === testId || record.title === testId)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);

          if (records.length === 0) {
            return `No history records found for test: ${testId}`;
          }

          return records
            .map(
              (record, index) =>
                `[${index + 1}] ${new Date(record.timestamp).toISOString()} - Status: ${record.status}${record.error ? `, Error: ${record.error}` : ''}`
            )
            .join('\n');
        } catch (error) {
          return `Failed to read history: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    );

    // 4. read_screenshot
    registry.registerTool(
      'read_screenshot',
      {
        type: 'function',
        function: {
          name: 'read_screenshot',
          description: 'Read the failure screenshot for a test (returns base64 encoded image)',
          parameters: {
            type: 'object',
            properties: {
              testId: { type: 'string', description: 'Test ID to get screenshot for' },
            },
            required: ['testId'],
          },
        },
      },
      async (args) => {
        const testId = args.testId as string;
        const screenshotsDir = path.join(dataDir, 'screenshots');

        try {
          if (!fs.existsSync(screenshotsDir)) {
            return `Screenshots directory not found: ${screenshotsDir}`;
          }

          const entries = fs.readdirSync(screenshotsDir);
          const matchedFiles = entries.filter(
            (name) => name.includes(testId) && (name.endsWith('.png') || name.endsWith('.jpg'))
          );

          if (matchedFiles.length === 0) {
            return `No screenshot found for test: ${testId}`;
          }

          const screenshotPath = path.join(screenshotsDir, matchedFiles[0]);
          const base64 = await encodeScreenshot([screenshotPath]);
          return base64
            ? `[Screenshot available as base64, length: ${base64.length}]`
            : `Failed to encode screenshot: ${screenshotPath}`;
        } catch (error) {
          return `Failed to read screenshot: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    );

    // 5. run_test
    registry.registerTool(
      'run_test',
      {
        type: 'function',
        function: {
          name: 'run_test',
          description: 'Run a Playwright test file and return structured results',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to the test file' },
              projectRoot: { type: 'string', description: 'Project root directory (optional)' },
            },
            required: ['filePath'],
          },
        },
      },
      async (args) => {
        const filePath = args.filePath as string;
        const root = (args.projectRoot as string) || projectRoot;

        try {
          const runner = new TestRunner();
          const results = await runner.runTest(filePath, root);

          if (results.length === 0) {
            return `No test results returned for: ${filePath}`;
          }

          // 统计通过/失败/跳过数量
          const passed = results.filter((r) => r.status === 'passed').length;
          const failed = results.filter((r) => r.status === 'failed').length;
          const skipped = results.filter((r) => r.status === 'skipped').length;

          let summary = `Test results for ${filePath}:\n`;
          summary += `  Passed: ${passed}, Failed: ${failed}, Skipped: ${skipped}, Total: ${results.length}\n`;

          // 列出失败测试的错误详情
          const failures = results.filter((r) => r.status === 'failed');
          if (failures.length > 0) {
            summary += '\nFailed tests:\n';
            for (const f of failures) {
              summary += `  - ${f.title}: ${f.error || 'Unknown error'}\n`;
              if (f.stack) {
                // 截断堆栈信息，避免输出过长
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

    // 6. apply_patch
    registry.registerTool(
      'apply_patch',
      {
        type: 'function',
        function: {
          name: 'apply_patch',
          description: 'Apply a code patch to fix a test file',
          parameters: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'Path to the file to patch' },
              originalCode: { type: 'string', description: 'The original code to replace' },
              patchedCode: { type: 'string', description: 'The replacement code' },
              reason: { type: 'string', description: 'Reason for the patch (optional)' },
            },
            required: ['filePath', 'originalCode', 'patchedCode'],
          },
        },
      },
      async (args) => {
        const filePath = args.filePath as string;
        const originalCode = args.originalCode as string;
        const patchedCode = args.patchedCode as string;
        const reason = (args.reason as string) || '';

        try {
          // 构建 HealerPatch 对象
          const patch: HealerPatch = {
            testId: '',
            testTitle: '',
            filePath,
            originalCode,
            patchedCode,
            unifiedDiff: '',
            confidence: 1.0,
            reason,
          };

          const applier = new PatchApplier();
          const success = applier.applyPatch(patch, projectRoot);

          if (success) {
            return `Patch applied successfully to: ${filePath}${reason ? ` (Reason: ${reason})` : ''}`;
          } else {
            return `Failed to apply patch to: ${filePath}. The original code may not match or the file may be outside the project root.`;
          }
        } catch (error) {
          return `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    );

    // 7. explore_app
    registry.registerTool(
      'explore_app',
      {
        type: 'function',
        function: {
          name: 'explore_app',
          description: "Explore a web application's page structure using a browser",
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL of the application to explore' },
              maxDepth: { type: 'number', description: 'Maximum crawl depth (default 2)' },
              credentials: {
                type: 'object',
                description: '{ username, password } for login (optional)',
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
            required: ['url'],
          },
        },
      },
      async (args) => {
        const url = args.url as string;
        const maxDepth = args.maxDepth as number | undefined;
        const credentials = args.credentials as { username: string; password: string } | undefined;

        try {
          const explorer = new AppExplorer();
          const options: ExploreOptions = {};
          if (maxDepth !== undefined) {
            options.maxDepth = maxDepth;
          }
          if (credentials) {
            options.credentials = credentials;
          }

          const result = await explorer.explore(url, options);

          // 格式化探索结果摘要
          let output = `App exploration result for ${url}:\n`;
          output += `  Pages discovered: ${result.pages.length}\n`;
          output += `  Routes found: ${result.routes.length}\n\n`;

          // 各页面摘要
          for (const page of result.pages) {
            output += `Page: ${page.title || 'Untitled'} (${page.url})\n`;
            output += `  Interactive elements: ${page.interactiveElements.length}\n`;
            output += `  Forms: ${page.forms.length}\n`;
            output += `  Links: ${page.links.length}\n`;

            // 列出交互元素（最多10个）
            if (page.interactiveElements.length > 0) {
              const elements = page.interactiveElements.slice(0, 10);
              output += '  Elements:\n';
              for (const el of elements) {
                output += `    - [${el.role}] ${el.name}\n`;
              }
              if (page.interactiveElements.length > 10) {
                output += `    ... and ${page.interactiveElements.length - 10} more\n`;
              }
            }

            // 列出表单
            if (page.forms.length > 0) {
              output += '  Forms:\n';
              for (const form of page.forms) {
                output += `    - ${form.name} (${form.fields.length} fields)\n`;
              }
            }

            output += '\n';
          }

          // 路由列表
          if (result.routes.length > 0) {
            output += 'Routes:\n';
            for (const route of result.routes) {
              output += `  - ${route}\n`;
            }
          }

          // 限制输出长度，避免超出约4000字符
          if (output.length > 4000) {
            output = output.slice(0, 3950) + '\n... (output truncated)';
          }

          return output;
        } catch (error) {
          return `Failed to explore app: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    );

    return registry;
  }
}
