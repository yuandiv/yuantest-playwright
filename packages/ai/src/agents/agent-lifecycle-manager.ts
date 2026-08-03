import { BaseAgent } from './base-agent';
import { GeneratorAgent } from './generator';
import { HealerAgent } from './healer';
import { DiagnosisAgent } from './diagnosis';
import { ToolRegistry } from './tool-registry';
import { LLMService } from './llm-service';
import { AgentConfigManager } from './agent-config-manager';
import { DiagnosisCacheHook } from './diagnosis-cache-hook';
import { DiagnosisPersisterHook } from './diagnosis-persister-hook';

/**
 * Agent 实例生命周期管理器。
 * 负责 HealerAgent 和 GeneratorAgent 的生命周期管理、ToolRegistry 分发和配置同步。
 */
export class AgentLifecycleManager {
  private agents: Map<string, BaseAgent> = new Map();
  private sharedLLMService: LLMService | null = null;
  private sharedToolRegistry: ToolRegistry | null = null;
  private _generator: GeneratorAgent | null = null;

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

  getGenerator(): GeneratorAgent {
    if (!this._generator) {
      throw new Error('GeneratorAgent not initialized');
    }
    return this._generator;
  }

  getHealer(): HealerAgent {
    return this.getAgent<HealerAgent>('healer')!;
  }

  getDiagnosis(): DiagnosisAgent {
    return this.getAgent<DiagnosisAgent>('diagnosis')!;
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

    // Generator: 真正的 Agent，统一使用 GeneratorAgent
    if (llmService) {
      this._generator = new GeneratorAgent(config, llmConfig, llmService);
    }

    // Healer: 真正的 Agent，需要生命周期管理
    this.agents.set('healer', new HealerAgent(config, llmConfig, llmService ?? undefined));

    // Diagnosis: Agent，诊断测试失败原因
    const diagnosisAgent = new DiagnosisAgent(
      config,
      llmConfig,
      llmService ?? undefined,
      this.dataDir
    );
    // 显式注入缓存钩子 + 持久化钩子
    diagnosisAgent
      .use(new DiagnosisCacheHook(diagnosisAgent.getCache()))
      .use(new DiagnosisPersisterHook(diagnosisAgent.getPersister()));
    this.agents.set('diagnosis', diagnosisAgent);

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
