import * as path from 'path';
import { AgentConfig, AgentPrompts, LLMConfig, ProjectContext } from '@yuantest/contracts';
import { ProjectContextLoader } from './project-context';

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  loopTarget: 'vscode',
  specsDir: 'specs',
  autoHeal: false,
  maxHealRounds: 3,
  projectRoot: process.cwd(),
};

/** 配置变更监听器类型 */
export type ConfigChangeListener = (
  config: AgentConfig,
  llmConfig: LLMConfig | null,
  extraParams: Record<string, unknown>
) => void;

/**
 * 统一的 Agent 配置管理器。
 * 封装配置的初始化、更新、验证和分发逻辑，
 * 通过观察者模式在配置变更时通知所有订阅者。
 */
export class AgentConfigManager {
  private config: AgentConfig;
  private llmConfig: LLMConfig | null = null;
  private prompts: Partial<AgentPrompts> | null = null;
  private extraConfigSources: Record<string, unknown> = {};
  private projectContext: ProjectContext | null = null;
  private listeners: ConfigChangeListener[] = [];

  constructor(config?: Partial<AgentConfig>) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  // ─── 配置读取 ──────────────────────────────────────────────

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  getLLMConfig(): LLMConfig | null {
    return this.llmConfig;
  }

  getPrompts(): Partial<AgentPrompts> | null {
    return this.prompts;
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  // ─── 配置更新 ──────────────────────────────────────────────

  setLLMConfig(config: LLMConfig): void {
    this.llmConfig = config;
    this.notifyConfigChange();
  }

  setPrompts(prompts: Partial<AgentPrompts> | null): void {
    this.prompts = prompts;
    this.extraConfigSources.customPrompts = prompts;
    this.notifyConfigChange();
  }

  setProjectRoot(root: string): void {
    const resolvedRoot = path.resolve(root);
    this.config.projectRoot = resolvedRoot;
    this.loadProjectContext();
    this.notifyConfigChange();
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.notifyConfigChange();
  }

  // ─── 项目上下文 ────────────────────────────────────────────

  loadProjectContext(): void {
    const projectRoot = this.config.projectRoot || process.cwd();
    const loader = new ProjectContextLoader();
    this.projectContext = loader.load(projectRoot);
    this.config.projectContext = this.projectContext;
  }

  // ─── 观察者模式 ────────────────────────────────────────────

  onConfigChange(listener: ConfigChangeListener): void {
    this.listeners.push(listener);
  }

  private notifyConfigChange(): void {
    const extraParams = this.buildExtraParams();
    for (const listener of this.listeners) {
      listener(this.getConfig(), this.llmConfig, extraParams);
    }
  }

  private buildExtraParams(): Record<string, unknown> {
    return { ...this.extraConfigSources };
  }
}
