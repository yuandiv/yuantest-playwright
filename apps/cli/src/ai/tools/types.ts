/**
 * 共享工具类型定义和辅助函数
 */

// ─── 工具 Schema ──────────────────────────────────────────────────────

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// ─── 工具定义 ─────────────────────────────────────────────────────────

export interface ToolDefinition {
  schema: ToolSchema;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

// ─── 工具源标识 ───────────────────────────────────────────────────────

export type ToolSource = 'builtin' | 'agent' | 'mcp';

export interface ToolInfo {
  name: string;
  description: string;
  source: ToolSource;
}

// ─── Helper: 便捷构建工具 Schema ─────────────────────────────────────

type ToolParam = {
  type: string;
  description: string;
};

/**
 * 消除样板代码的辅助函数 —— 无需重复编写
 * { type: 'function', function: { name, description, parameters: { type: 'object', ... } } }
 */
export function makeSchema(
  name: string,
  description: string,
  params: Record<string, ToolParam>,
  required: string[]
): ToolSchema {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: params,
        required,
      },
    },
  };
}

/**
 * 快速定义一个完整的工具（schema + handler）
 */
export function defineTool(
  name: string,
  description: string,
  params: Record<string, ToolParam>,
  required: string[],
  handler: (args: Record<string, unknown>) => Promise<string>
): ToolDefinition {
  return {
    schema: makeSchema(name, description, params, required),
    handler,
  };
}
