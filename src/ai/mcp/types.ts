/**
 * MCP 专用类型定义
 */

import type { ToolSchema } from '../tools/types';

// ─── MCP 工具 & 连接状态 ────────────────────────────────────────────────

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPServerStatus {
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

export interface MCPConnectionStatus {
  servers: MCPServerStatus[];
  totalTools: number;
  connectedCount: number;
  totalCount: number;
}

// ─── MCP 工具定义（用于 ToolRegistry 与外部对接） ──────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// ─── MCP 获取 ToolSchema 的函数类型 ─────────────────────────────────────

export type GetMCPToolSchemasFn = () => ToolSchema[];
