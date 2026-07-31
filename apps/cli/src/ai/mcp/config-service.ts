import * as crypto from 'crypto';
import { logger } from '@yuantest/core';
import { loadMCPConfigs, saveMCPConfigs } from '@yuantest/core';
import type { MCPConfig } from '@yuantest/contracts';

/** MCP 内置预设（默认配置） */
export interface MCPPreset {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
  description: string;
  source: string;
  timeout_ms?: number;
}

export const BUILTIN_MCP_PRESETS: MCPPreset[] = [
  {
    name: 'playwright-mcp',
    enabled: true,
    command: 'npx',
    args: ['@playwright/mcp', '--isolated'],
    description: 'Playwright 浏览器自动化工具（本地加载，断网可用；加 --headless 即无头模式）',
    source: 'builtin',
    timeout_ms: 30000,
  },
  {
    name: 'filesystem',
    enabled: false,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    description: '文件系统读写工具（首次运行需联网下载）',
    source: 'builtin',
    timeout_ms: 30000,
  },
  {
    name: 'excel-mcp-server',
    enabled: false,
    command: 'npx',
    args: ['-y', '@negokaz/excel-mcp-server'],
    description: 'Excel 文件读写工具（支持 xlsx/xlsm/xltx/xltm 格式，首次运行需联网下载）',
    source: 'builtin',
    timeout_ms: 30000,
  },
  {
    name: 'mcp-doc-forge',
    enabled: false,
    command: 'npx',
    args: ['-y', '@cablate/mcp-doc-forge'],
    description: '文档处理工具（DOCX/PDF/HTML 读取转换，首次运行需联网下载）',
    source: 'builtin',
    timeout_ms: 30000,
  },
];

export class MCPConfigService {
  private configs: Map<string, MCPConfig> = new Map();
  private log = logger.child('MCPConfigService');

  constructor() {
    this.loadConfigs();
    this.initBuiltinPresets();
  }

  private initBuiltinPresets(): void {
    let changed = false;

    const presets = BUILTIN_MCP_PRESETS;
    const existingByName = new Map<string, MCPConfig>();
    for (const config of this.configs.values()) {
      existingByName.set(config.name, config);
    }

    let added = 0;
    let updated = 0;
    for (const preset of presets) {
      const existing = existingByName.get(preset.name);
      if (!existing) {
        const now = Date.now();
        const config: MCPConfig = {
          id: crypto.randomUUID(),
          name: preset.name,
          enabled: preset.enabled,
          command: preset.command,
          args: preset.args,
          env: preset.env,
          description: preset.description,
          source: preset.source,
          timeout_ms: preset.timeout_ms,
          createdAt: now,
          updatedAt: now,
        };
        this.configs.set(config.id, config);
        added++;
      } else if (existing.source === 'builtin') {
        const needsUpdate =
          existing.command !== preset.command ||
          JSON.stringify(existing.args) !== JSON.stringify(preset.args) ||
          existing.description !== preset.description ||
          existing.timeout_ms !== preset.timeout_ms;
        if (needsUpdate) {
          existing.command = preset.command;
          existing.args = preset.args;
          existing.description = preset.description;
          existing.timeout_ms = preset.timeout_ms;
          existing.updatedAt = Date.now();
          updated++;
        }
      }
    }

    if (added > 0 || updated > 0) {
      changed = true;
      this.log.info(`Initialized ${added} builtin MCP presets, updated ${updated}`);
    }

    if (changed) {
      this.saveConfigs();
    }
  }

  private loadConfigs(): void {
    try {
      const configs = loadMCPConfigs();
      if (configs) {
        for (const config of configs) {
          this.configs.set(config.id, config);
        }
        this.log.info(`Loaded ${this.configs.size} MCP configs`);
      }
    } catch (err) {
      this.log.warn(
        `Failed to load MCP configs: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private saveConfigs(): void {
    try {
      const data = Array.from(this.configs.values());
      saveMCPConfigs(data);
    } catch (err) {
      this.log.warn(
        `Failed to save MCP configs: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  getConfigs(): MCPConfig[] {
    return Array.from(this.configs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getConfig(id: string): MCPConfig | null {
    return this.configs.get(id) || null;
  }

  updateConfig(id: string, updates: Partial<MCPConfig>): MCPConfig | null {
    const config = this.configs.get(id);
    if (!config) {
      return null;
    }

    const updated = {
      ...config,
      ...updates,
      updatedAt: Date.now(),
    };

    this.configs.set(id, updated);
    this.saveConfigs();
    return updated;
  }

  deleteConfig(id: string): boolean {
    const deleted = this.configs.delete(id);
    if (deleted) {
      this.saveConfigs();
    }
    return deleted;
  }

  saveConfigsFromJson(mcpServers: Record<string, unknown>): MCPConfig[] {
    const newConfigs: MCPConfig[] = [];
    const now = Date.now();

    for (const [name, serverConfig] of Object.entries(mcpServers)) {
      if (!serverConfig || typeof serverConfig !== 'object') {
        continue;
      }

      const config = serverConfig as Record<string, unknown>;
      const id = crypto.randomUUID();

      const newConfig: MCPConfig = {
        id,
        name,
        enabled: true,
        command: (config.command as string) || '',
        args: Array.isArray(config.args) ? config.args.map(String) : [],
        env: (config.env as Record<string, string>) || {},
        description: (config.description as string) || '',
        source: 'manual',
        createdAt: now,
        updatedAt: now,
      };

      this.configs.set(id, newConfig);
      newConfigs.push(newConfig);
    }

    this.saveConfigs();
    this.log.info(`Imported ${newConfigs.length} MCP configs from JSON`);
    return newConfigs;
  }

  getEnabledConfigs(): MCPConfig[] {
    return this.getConfigs().filter((config) => config.enabled);
  }
}
