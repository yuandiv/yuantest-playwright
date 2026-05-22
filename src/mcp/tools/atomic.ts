import { ToolRegistry } from '../../agents/tool-registry';
import { BrowserSessionManager } from '../../agents/browser-session';
import type { MCPTool } from '../types';

// 模块级单例：ToolRegistry 和 BrowserSessionManager
let registryInstance: ToolRegistry | null = null;
let browserSessionManagerInstance: BrowserSessionManager | null = null;

function getRegistry(): ToolRegistry {
  if (!registryInstance) {
    const dataDir = process.env.YUANTEST_DATA_DIR || './data';
    const projectRoot = process.cwd();
    registryInstance = ToolRegistry.createDefaultRegistry(dataDir, projectRoot);
  }
  return registryInstance;
}

function getBrowserSessionManager(): BrowserSessionManager {
  if (!browserSessionManagerInstance) {
    browserSessionManagerInstance = new BrowserSessionManager();
  }
  return browserSessionManagerInstance;
}

// ─── explore_app ──────────────────────────────────────────────────────────────

export const exploreApp: MCPTool = {
  name: 'explore_app',
  description: "Explore a web application's page structure using a browser",
  inputSchema: {
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
  handler: async (args) => {
    try {
      const registry = getRegistry();
      const result = await registry.executeTool('explore_app', args);
      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error exploring app: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

// ─── apply_patch ──────────────────────────────────────────────────────────────

export const applyPatch: MCPTool = {
  name: 'apply_patch',
  description: 'Apply a code patch to fix a file',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to the file to patch' },
      originalCode: { type: 'string', description: 'The original code to replace' },
      patchedCode: { type: 'string', description: 'The replacement code' },
      reason: { type: 'string', description: 'Reason for the patch (optional)' },
    },
    required: ['filePath', 'originalCode', 'patchedCode'],
  },
  handler: async (args) => {
    try {
      const registry = getRegistry();
      const result = await registry.executeTool('apply_patch', args);
      return {
        content: [{ type: 'text' as const, text: result }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error applying patch: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

// ─── generate_locator ─────────────────────────────────────────────────────────

export const generateLocator: MCPTool = {
  name: 'generate_locator',
  description:
    'Generate Playwright locators for an element by navigating to a URL and analyzing the accessibility snapshot',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL of the page containing the element' },
      description: {
        type: 'string',
        description: 'Description of the element to locate (e.g., "login button", "email input")',
      },
    },
    required: ['url', 'description'],
  },
  handler: async (args) => {
    try {
      const url = args.url as string;
      const description = (args.description as string).toLowerCase();
      const sessionManager = getBrowserSessionManager();

      // 获取浏览器会话并导航到目标页面
      const session = await sessionManager.getSession('locator-gen', { headless: true });
      const page = await sessionManager.getPage('locator-gen');

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (navError) {
        await page.close().catch(() => {});
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to navigate to ${url}: ${navError instanceof Error ? navError.message : String(navError)}`,
            },
          ],
        };
      }

      // 获取可访问性快照
      let snapshot: any;
      try {
        snapshot = await (page as any).accessibility.snapshot();
      } catch {
        await page.close().catch(() => {});
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Accessibility snapshot is not available for this page.',
            },
          ],
        };
      }

      // 在快照中搜索匹配的元素
      const matches: Array<{
        role: string;
        name: string;
        attributes: Record<string, string>;
        locators: string[];
      }> = [];

      // 递归搜索可访问性树
      function searchNode(node: any): void {
        if (!node) {
          return;
        }

        const nodeName = (node.name || '').toLowerCase();
        const nodeRole = (node.role || '').toLowerCase();

        // 根据描述匹配节点
        const descWords = description.split(/\s+/);
        const isMatch =
          descWords.some((w) => nodeName.includes(w)) ||
          (nodeRole && descWords.some((w) => nodeRole.includes(w)));

        if (isMatch && nodeRole) {
          // 生成建议的定位器
          const locators: string[] = [];

          // 按 role + name 定位
          if (nodeRole && nodeName) {
            locators.push(`getByRole('${nodeRole}', { name: '${node.name}' })`);
          } else if (nodeRole) {
            locators.push(`getByRole('${nodeRole}')`);
          }

          // 按 text 定位
          if (nodeName) {
            locators.push(`getByText('${node.name}')`);
          }

          // 按 placeholder 定位
          if (node.attributes?.placeholder) {
            locators.push(`getByPlaceholder('${node.attributes.placeholder}')`);
          }

          // 按 test id 定位
          if (node.attributes?.['data-testid']) {
            locators.push(`getByTestId('${node.attributes['data-testid']}')`);
          }

          // 按 label 定位
          if (node.attributes?.['aria-label']) {
            locators.push(`getByLabel('${node.attributes['aria-label']}')`);
          }

          // 按 alt text 定位
          if (node.attributes?.alt) {
            locators.push(`getByAltText('${node.attributes.alt}')`);
          }

          // 按 title 定位
          if (node.attributes?.title) {
            locators.push(`getByTitle('${node.attributes.title}')`);
          }

          if (locators.length > 0) {
            matches.push({
              role: nodeRole,
              name: node.name || '',
              attributes: node.attributes || {},
              locators,
            });
          }
        }

        // 递归搜索子节点
        if (node.children) {
          for (const child of node.children) {
            searchNode(child);
          }
        }
      }

      searchNode(snapshot);

      await page.close().catch(() => {});

      // 格式化输出
      if (matches.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No matching elements found for description: "${args.description}" on ${url}`,
            },
          ],
        };
      }

      // 限制最多展示 10 个匹配结果
      const limitedMatches = matches.slice(0, 10);
      const outputLines: string[] = [
        `Found ${matches.length} matching element(s) for "${args.description}" on ${url}:`,
        '',
      ];

      for (let i = 0; i < limitedMatches.length; i++) {
        const m = limitedMatches[i];
        outputLines.push(`[${i + 1}] Role: ${m.role}, Name: "${m.name}"`);
        outputLines.push('    Suggested locators:');
        for (const loc of m.locators) {
          outputLines.push(`      - page.${loc}`);
        }
        outputLines.push('');
      }

      if (matches.length > 10) {
        outputLines.push(`... and ${matches.length - 10} more matches`);
      }

      return {
        content: [{ type: 'text' as const, text: outputLines.join('\n') }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error generating locator: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

export const atomicTools: MCPTool[] = [exploreApp, applyPatch, generateLocator];
