import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { logger } from '../../logger';

export interface MCPConfig {
  id: string;
  name: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
}

export interface MCPConfigServiceOptions {
  dataDir: string;
}

export interface MCPPreset {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
  description: string;
  source: string;
}

export class MCPConfigService {
  private configs: Map<string, MCPConfig> = new Map();
  private filePath: string;
  private log = logger.child('MCPConfigService');

  constructor(options: MCPConfigServiceOptions) {
    this.filePath = path.join(options.dataDir, 'mcp-configs.json');
    this.loadConfigs();
    this.initBuiltinPresets();
  }

  static getBuiltinPresets(): MCPPreset[] {
    return [
      {
        name: 'playwright-mcp',
        enabled: true,
        command: 'npx',
        args: ['@playwright/mcp@latest', '--headed'],
        description: 'Playwright 浏览器自动化工具（有头模式，去掉 --headed 即无头模式）',
        source: 'builtin',
      },
      {
        name: 'filesystem',
        enabled: false,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        description: '文件系统读写工具',
        source: 'builtin',
      },
    ];
  }

  private static DEPRECATED_PRESET_NAMES = ['playwright', 'playwright-headed'];

  private initBuiltinPresets(): void {
    let changed = false;

    for (const depName of MCPConfigService.DEPRECATED_PRESET_NAMES) {
      for (const [id, config] of this.configs) {
        if (config.name === depName && config.source === 'builtin') {
          this.configs.delete(id);
          changed = true;
          this.log.info(`Removed deprecated preset: ${depName}`);
        }
      }
    }

    const presets = MCPConfigService.getBuiltinPresets();
    const existingNames = new Set(Array.from(this.configs.values()).map((c) => c.name));

    let added = 0;
    for (const preset of presets) {
      if (!existingNames.has(preset.name)) {
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
          createdAt: now,
          updatedAt: now,
        };
        this.configs.set(config.id, config);
        added++;
      }
    }

    if (added > 0) {
      changed = true;
      this.log.info(`Initialized ${added} builtin MCP presets`);
    }

    if (changed) {
      this.saveConfigs();
    }
  }

  private loadConfigs(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const configs = JSON.parse(data);
        if (Array.isArray(configs)) {
          configs.forEach((config: MCPConfig) => {
            this.configs.set(config.id, config);
          });
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
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
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
