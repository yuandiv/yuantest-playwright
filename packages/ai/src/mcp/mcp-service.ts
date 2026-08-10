/**
 * MCPService — MCP 管理服务
 *
 * 职责：封装 MCP 服务器的连接管理、配置管理、状态查询与工具调用，
 * 从 UnifiedAIService 中拆出，降低 god-class 体积与 blast radius。
 *
 * 说明：UnifiedAIService 保留为门面（保留公共方法签名与 @yuantest/ai 导出兼容），
 * MCP 相关逻辑委托给本服务。
 */
import { logger } from '@yuantest/core';
import { MCPClientManager } from './client-manager';
import { MCPConfigService } from './config-service';
import type { MCPConnectionStatus, MCPToolInfo } from './types';
import type { ToolSchema } from '../tools/types';
import type { MCPConfig } from '@yuantest/contracts';

export class MCPService {
  private mcpManager: MCPClientManager;
  private mcpConfigService: MCPConfigService | null;
  private log = logger.child('MCPService');

  constructor(
    projectRoot: string,
    mcpConfigService?: MCPConfigService,
    sharedMCPClientManager?: MCPClientManager
  ) {
    this.mcpManager = sharedMCPClientManager || new MCPClientManager(projectRoot);
    this.mcpConfigService = mcpConfigService || null;
  }

  /** 获取底层 MCPClientManager（供执行工具等场景直接调用） */
  getManager(): MCPClientManager {
    return this.mcpManager;
  }

  /** 获取 MCP 配置服务（可为 null） */
  getConfigService(): MCPConfigService | null {
    return this.mcpConfigService;
  }

  /** 初始化：连接所有启用的 MCP 服务器（无配置时回退到 playwright 配置探测） */
  async initMCP(): Promise<void> {
    if (this.mcpConfigService) {
      const enabledConfigs = this.mcpConfigService.getEnabledConfigs();
      if (enabledConfigs.length > 0) {
        await this.mcpManager.connectFromConfigs(enabledConfigs);
        return;
      }
    }
    const configPath = this.mcpManager.findPlaywrightConfig();
    if (configPath) {
      this.log.info(
        'No MCP configs found, but playwright.config detected - using auto-detect fallback'
      );
    }
  }

  /** 重连所有 MCP 服务器 */
  async reconnectMCP(): Promise<void> {
    await this.mcpManager.disconnect();
    await this.initMCP();
  }

  /** 切换单个 MCP 服务器的连接状态 */
  async toggleMCPConnection(id: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const config = this.mcpConfigService?.getConfig(id);
      if (config) {
        await this.mcpManager.connectFromConfig(config);
      }
    } else {
      await this.mcpManager.disconnectServer(id);
    }
  }

  /** 查询 MCP 连接状态 */
  getMCPStatus(): MCPConnectionStatus {
    return this.mcpManager.getStatus();
  }

  /** 列出所有已连接 MCP 服务器的工具 */
  listTools(): MCPToolInfo[] {
    return this.mcpManager.listTools();
  }

  /** 获取 MCP 工具的 ToolSchema（带 mcp__ 前缀） */
  getToolSchemas(): ToolSchema[] {
    return this.mcpManager.getToolSchemas();
  }

  /** 调用 MCP 工具 */
  callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    return this.mcpManager.callTool(toolName, args);
  }

  /** MCP 是否可用（任一服务器已连接且有工具） */
  isAvailable(): boolean {
    return this.mcpManager.isAvailable();
  }
}

/** MCP 配置服务类型导出（供外部创建实例） */
export type { MCPConfig };
