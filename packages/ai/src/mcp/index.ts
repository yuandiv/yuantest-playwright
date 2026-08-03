/**
 * mcp — MCP（Model Context Protocol）模块
 *
 * 负责 MCP 服务器的连接管理、配置管理和工具调用。
 */

export { MCPClientManager } from './client-manager';

export { MCPConfigService, MCPPreset, BUILTIN_MCP_PRESETS } from './config-service';

export {
  MCPToolInfo,
  MCPServerStatus,
  MCPConnectionStatus,
  MCPToolDefinition,
  GetMCPToolSchemasFn,
} from './types';
