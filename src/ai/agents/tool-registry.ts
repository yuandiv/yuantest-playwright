/**
 * ToolRegistry——统一的工具注册表
 *
 * 职责：
 * - 注册/注销/查找/执行工具
 * - 通过 createDefaultRegistry() 工厂方法初始注册全部内置工具
 * - 供 Agent 管线工具注册到同一注册表（不再使用独立的 agentTools Map）
 */
import * as path from 'path';
import { logger } from '../../logger';
import type { ToolSchema, ToolDefinition } from '../tools/types';
import type { MCPToolDefinition } from '../mcp/types';
import {
  createReadSourceFileTool,
  createSearchCodebaseTool,
  createQueryTestHistoryTool,
  createReadScreenshotTool,
  createRunTestTool,
  createApplyPatchTool,
} from '../tools/index';

// ─── Security constants (exported for builtin tool factory files) ────

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

export const BLOCKED_DIRS = ['node_modules', '.git', '__pycache__', '.venv', 'venv'];

export function isPathAllowed(filePath: string, projectRoot: string): boolean {
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

// ─── ToolRegistry ────────────────────────────────────────────────────

export { type ToolSchema, type ToolDefinition, type MCPToolDefinition };

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private log = logger.child('ToolRegistry');

  constructor() {}

  /** 注册单个工具 */
  registerTool(
    name: string,
    schema: ToolSchema,
    handler: (args: Record<string, unknown>) => Promise<string>
  ): void {
    this.tools.set(name, { schema, handler });
    this.log.info(`Registered tool: ${name}`);
  }

  /** 批量注册工具（简化 Agent 工具注册） */
  registerTools(defs: Array<{ name: string } & ToolDefinition>): void {
    for (const def of defs) {
      this.tools.set(def.name, { schema: def.schema, handler: def.handler });
      this.log.info(`Registered tool: ${def.name}`);
    }
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

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
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

  /**
   * 创建默认注册表，注册 6 个内置工具。
   * 每个工具定义由独立的工厂函数创建（src/tools/builtin/*.ts），而非内联硬编码。
   */
  static createDefaultRegistry(dataDir: string, projectRoot: string): ToolRegistry {
    const registry = new ToolRegistry();

    const builtinTools = [
      { name: 'read_source_file', ...createReadSourceFileTool(projectRoot) },
      { name: 'search_codebase', ...createSearchCodebaseTool(projectRoot) },
      { name: 'query_test_history', ...createQueryTestHistoryTool(dataDir) },
      { name: 'read_screenshot', ...createReadScreenshotTool(dataDir) },
      { name: 'run_test', ...createRunTestTool(projectRoot) },
      { name: 'apply_patch', ...createApplyPatchTool(projectRoot) },
    ];

    for (const tool of builtinTools) {
      registry.registerTool(tool.name, tool.schema, tool.handler);
    }

    return registry;
  }
}
