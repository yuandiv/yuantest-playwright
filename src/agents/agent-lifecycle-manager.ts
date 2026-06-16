import { BaseAgent } from './base-agent';
import { GeneratorService } from './generator-service';
import { HealerAgent } from './healer';
import { ToolRegistry } from './tool-registry';
import { LLMService } from './llm-service';
import { AgentConfigManager } from './agent-config-manager';

/**
 * Agent 实例生命周期管理器。
 * 负责 HealerAgent 的生命周期管理、ToolRegistry 分发和配置同步。
 * GeneratorService 是轻量服务，不需要生命周期管理。
 */
export class AgentLifecycleManager {
  private agents: Map<string, BaseAgent> = new Map();
  private sharedLLMService: LLMService | null = null;
  private sharedToolRegistry: ToolRegistry | null = null;
  private _generator: GeneratorService | null = null;

  constructor(
    private dataDir: string,
    private configManager: AgentConfigManager,
    sharedLLMService?: LLMService,
    sharedToolRegistry?: ToolRegistry
  ) {
    this.sharedLLMService = sharedLLMService ?? null;
    this.sharedToolRegistry = sharedToolRegistry ?? null;
    this.initializeAgents();
    this.setupConfigChangeListeners();
  }

  // ─── Service 访问 ─────────────────────────────────────────

  getGenerator(): GeneratorService {
    if (!this._generator) throw new Error('GeneratorService not initialized');
    return this._generator;
  }

  getHealer(): HealerAgent {
    return this.getAgent<HealerAgent>('healer')!;
  }

  getAgent<T extends BaseAgent>(name: string): T | undefined {
    return this.agents.get(name) as T | undefined;
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  // ─── ToolRegistry 管理 ─────────────────────────────────────

  reinitializeToolRegistry(): void {
    const projectRoot = this.configManager.getConfig().projectRoot || process.cwd();
    this.sharedToolRegistry = ToolRegistry.createDefaultRegistry(this.dataDir, projectRoot);
    this.distributeToolRegistry();
  }

  // ─── 内部方法 ──────────────────────────────────────────────

  private initializeAgents(): void {
    const config = this.configManager.getConfig();
    const llmConfig = this.configManager.getLLMConfig();
    const llmService = this.sharedLLMService ?? (llmConfig ? new LLMService(llmConfig) : null);

    // Generator: 轻量服务，直接持有 LLMService
    if (llmService) {
      this._generator = new GeneratorService(llmService, config.projectRoot);
    }

    // Healer: 真正的 Agent，需要生命周期管理
    this.agents.set(
      'healer',
      new HealerAgent(config, llmConfig, llmService ?? undefined)
    );

    this.distributeToolRegistry();
  }

  private distributeToolRegistry(): void {
    const registry =
      this.sharedToolRegistry ??
      ToolRegistry.createDefaultRegistry(
        this.dataDir,
        this.configManager.getConfig().projectRoot || process.cwd()
      );
    // Healer 需要 ToolRegistry（run_test 等工具）
    for (const agent of this.agents.values()) {
      agent.setToolRegistry(registry);
    }
  }

  private setupConfigChangeListeners(): void {
    this.configManager.onConfigChange((config, llmConfig, extraParams) => {
      // 更新 Healer（真正的 Agent）
      for (const agent of this.agents.values()) {
        const requiredKeys = agent.getRequiredExtraConfigKeys();
        const agentExtraParams: Record<string, unknown> = {};
        for (const key of requiredKeys) {
          if (key in extraParams) {
            agentExtraParams[key] = extraParams[key];
          }
        }
        agent.updateConfig(config, llmConfig, agentExtraParams);
      }
    });
  }
}
