import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../logger';
import { FILE_PATTERNS } from '../../constants';
import type { ToolSchema } from '../tools/types';
import type { MCPConfig } from '../../types';

import type { MCPToolInfo, MCPServerStatus, MCPConnectionStatus } from './types';

interface MCPConnection {
  id: string;
  name: string;
  client: Client | null;
  transport: StdioClientTransport | null;
  tools: MCPToolInfo[];
  connected: boolean;
  error?: string;
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export class MCPClientManager {
  private connections: Map<string, MCPConnection> = new Map();
  private projectRoot: string;
  private log = logger.child('MCPClientManager');

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  findPlaywrightConfig(projectRoot?: string): string | null {
    const root = projectRoot ?? this.projectRoot;
    for (const name of FILE_PATTERNS.CONFIG_NAMES) {
      const configPath = path.join(root, name);
      if (fs.existsSync(configPath)) {
        return configPath;
      }
    }
    return null;
  }

  async setProjectRoot(newRoot: string): Promise<void> {
    this.projectRoot = newRoot;
  }

  async connectFromConfig(config: MCPConfig): Promise<boolean> {
    if (!config.command) {
      this.log.warn(`MCP config "${config.name}" has no command, skipping`);
      return false;
    }

    const existing = this.connections.get(config.id);
    if (existing?.connected) {
      this.log.info(`MCP server "${config.name}" already connected, skipping`);
      return true;
    }

    const connection: MCPConnection = {
      id: config.id,
      name: config.name,
      client: null,
      transport: null,
      tools: [],
      connected: false,
    };

    try {
      this.log.info(
        `Connecting to MCP server "${config.name}": ${config.command} ${(config.args || []).join(' ')}`
      );

      connection.client = new Client(
        { name: 'yuantest-chat', version: '1.0.0' },
        { capabilities: {} }
      );

      connection.transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        cwd: this.projectRoot,
        stderr: 'pipe',
        env: { ...process.env, ...config.env } as Record<string, string>,
      });

      const stderrStream = connection.transport.stderr;
      if (stderrStream) {
        stderrStream.on('data', (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg) {
            this.log.debug(`[${config.name} MCP stderr] ${msg}`);
          }
        });
      }

      await connection.client.connect(connection.transport, {
        timeout: config.timeout_ms ?? 30000,
      });
      connection.connected = true;

      await this.refreshToolsForConnection(connection);

      this.connections.set(config.id, connection);
      this.log.info(
        `Connected to MCP server "${config.name}", ${connection.tools.length} tools available`
      );
      return true;
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : String(error);
      this.log.warn(`Failed to connect to MCP server "${config.name}": ${rawMsg}`);
      const errorMsg = this.friendlyErrorMessage(rawMsg, config.name);
      if (connection.transport) {
        try {
          await connection.transport.close();
        } catch {
          // ignore close errors
        }
      }
      connection.connected = false;
      connection.error = errorMsg;
      connection.client = null;
      connection.transport = null;
      this.connections.set(config.id, connection);
      return false;
    }
  }

  async connectFromConfigs(configs: MCPConfig[]): Promise<void> {
    const enabledConfigs = configs.filter((c) => c.enabled && c.command);

    const currentIds = new Set(enabledConfigs.map((c) => c.id));
    for (const [id] of this.connections) {
      if (!currentIds.has(id)) {
        await this.disconnectServer(id);
      }
    }

    for (const config of enabledConfigs) {
      const existing = this.connections.get(config.id);
      if (existing?.connected) {
        continue;
      }
      await this.connectFromConfig(config);
    }
  }

  async disconnectServer(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) {
      return;
    }

    if (connection.transport) {
      try {
        await connection.transport.close();
      } catch {
        // ignore close errors
      }
    }

    this.connections.delete(id);
    this.log.info(`Disconnected MCP server: ${connection.name}`);
  }

  async disconnect(): Promise<void> {
    for (const [id] of this.connections) {
      await this.disconnectServer(id);
    }
  }

  async connect(): Promise<boolean> {
    return false;
  }

  private async refreshToolsForConnection(connection: MCPConnection): Promise<void> {
    if (!connection.client || !connection.connected) {
      connection.tools = [];
      return;
    }

    try {
      const result = await connection.client.listTools();
      connection.tools = (result.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    } catch (error) {
      this.log.warn(
        `Failed to list MCP tools for "${connection.name}": ${error instanceof Error ? error.message : String(error)}`
      );
      connection.tools = [];
    }
  }

  listTools(): MCPToolInfo[] {
    const allTools: MCPToolInfo[] = [];
    for (const connection of this.connections.values()) {
      if (connection.connected) {
        allTools.push(...connection.tools);
      }
    }
    return allTools;
  }

  getToolSchemas(): ToolSchema[] {
    const schemas: ToolSchema[] = [];
    for (const connection of this.connections.values()) {
      if (!connection.connected) {
        continue;
      }
      const prefix = `mcp__${sanitizeName(connection.name)}__`;
      for (const tool of connection.tools) {
        schemas.push({
          type: 'function' as const,
          function: {
            name: `${prefix}${tool.name}`,
            description: tool.description || `MCP tool: ${tool.name}`,
            parameters: tool.inputSchema,
          },
        });
      }
    }
    return schemas;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const mcpPrefixMatch = toolName.match(/^mcp__(.+?)__(.+)$/);
    if (!mcpPrefixMatch) {
      throw new Error(`Invalid MCP tool name format: ${toolName}`);
    }

    const serverName = mcpPrefixMatch[1];
    const actualToolName = mcpPrefixMatch[2];

    for (const connection of this.connections.values()) {
      if (!connection.connected || !connection.client) {
        continue;
      }

      const sanitized = sanitizeName(connection.name);
      if (sanitized !== serverName) {
        continue;
      }

      this.log.info(`Calling MCP tool on "${connection.name}": ${actualToolName}`);

      try {
        const result = await connection.client.callTool({ name: actualToolName, arguments: args });

        if (result.content && Array.isArray(result.content)) {
          const textParts = result.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { type: string; text?: string }) => c.text || '');
          if (textParts.length > 0) {
            return textParts.join('\n');
          }
          return JSON.stringify(result.content, null, 2);
        }

        return JSON.stringify(result, null, 2);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.log.warn(
          `MCP tool call failed on "${connection.name}" (${actualToolName}): ${errorMsg}`
        );
        return `MCP tool error (${connection.name}/${actualToolName}): ${errorMsg}`;
      }
    }

    throw new Error(`MCP server "${serverName}" not found or not connected`);
  }

  isAvailable(): boolean {
    for (const connection of this.connections.values()) {
      if (connection.connected && connection.tools.length > 0) {
        return true;
      }
    }
    return false;
  }

  private friendlyErrorMessage(rawMsg: string, serverName: string): string {
    const msg = rawMsg.toLowerCase();
    if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('econnreset')) {
      return `无法连接到 "${serverName}"，请检查网络连接`;
    }
    if (msg.includes('npm err') && (msg.includes('network') || msg.includes('fetch'))) {
      return `"${serverName}" 下载失败，当前可能处于离线环境，请检查网络或预先安装所需依赖`;
    }
    if (msg.includes('enoent') || msg.includes('command not found') || msg.includes('not found')) {
      return `"${serverName}" 启动命令未找到，请确认已安装相关依赖`;
    }
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return `"${serverName}" 连接超时，请检查网络或增加超时时间`;
    }
    if (msg.includes('permission denied') || msg.includes('eacces')) {
      return `"${serverName}" 权限不足，请检查执行权限`;
    }
    return rawMsg;
  }

  getStatus(): MCPConnectionStatus {
    const servers: MCPServerStatus[] = [];
    let totalTools = 0;
    let connectedCount = 0;

    for (const connection of this.connections.values()) {
      servers.push({
        id: connection.id,
        name: connection.name,
        connected: connection.connected,
        toolCount: connection.tools.length,
        error: connection.error,
      });
      if (connection.connected) {
        totalTools += connection.tools.length;
        connectedCount++;
      }
    }

    return {
      servers,
      totalTools,
      connectedCount,
      totalCount: this.connections.size,
    };
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }
}
