import { BaseAgent } from './base-agent';
import { PlannerAgent } from './planner';
import { GeneratorAgent } from './generator';
import { HealerAgent } from './healer';
import { ToolRegistry } from './tool-registry';
import { LLMService } from './llm-service';
import { AgentConfigManager } from './agent-config-manager';

/**
 * Agent 实例生命周期管理器。
 * 负责 Agent 的创建、ToolRegistry 分发和配置同步，
 * 将 Agent 实例管理从 AgentService 中解耦。
 */
export class AgentLifecycleManager {
  private agents: Map<string, BaseAgent> = new Map();
  private sharedLLMService: LLMService | null = null;
  private sharedToolRegistry: ToolRegistry | null = null;

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

  // ─── Agent 访问 ────────────────────────────────────────────

  getPlanner(): PlannerAgent {
    return this.getAgent<PlannerAgent>('planner')!;
  }

  getGenerator(): GeneratorAgent {
    return this.getAgent<GeneratorAgent>('generator')!;
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

  /** 重新初始化 ToolRegistry（如 projectRoot 变更时调用） */
  reinitializeToolRegistry(): void {
    const projectRoot = this.configManager.getConfig().projectRoot || process.cwd();
    this.sharedToolRegistry = ToolRegistry.createDefaultRegistry(this.dataDir, projectRoot);
    this.distributeToolRegistry();
  }

  // ─── 内部方法 ──────────────────────────────────────────────

  private initializeAgents(): void {
    const config = this.configManager.getConfig();
    const llmConfig = this.configManager.getLLMConfig();

    this.agents.set(
      'planner',
      new PlannerAgent(config, llmConfig, undefined, this.sharedLLMService ?? undefined)
    );
    this.agents.set(
      'generator',
      new GeneratorAgent(config, llmConfig, this.sharedLLMService ?? undefined)
    );
    this.agents.set(
      'healer',
      new HealerAgent(config, llmConfig, this.sharedLLMService ?? undefined)
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
    for (const agent of this.agents.values()) {
      agent.setToolRegistry(registry);
    }
  }

  private setupConfigChangeListeners(): void {
    this.configManager.onConfigChange((config, llmConfig, extraParams) => {
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
