import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import {
  AgentConfig,
  AgentInitResult,
  AgentLoopTarget,
  AgentResult,
  TestPlan,
  HealerPatch,
  AgentHealResult,
  AgentPrompts,
  LLMConfig,
  ProjectContext,
  AgentSessionContext,
} from '../types';
import { BaseAgent } from './base-agent';
import { PlannerAgent } from './planner';
import { GeneratorAgent } from './generator';
import { HealerAgent } from './healer';
import { BrowserSessionManager } from './browser-session';
import { PatchApplier } from './patch-applier';
import { ProjectContextLoader } from './project-context';
import { ToolRegistry } from './tool-registry';

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  loopTarget: 'vscode',
  specsDir: 'specs',
  autoHeal: false,
  maxHealRounds: 3,
  projectRoot: process.cwd(),
};

export class AgentService {
  private config: AgentConfig;
  private dataDir: string;
  private projectRoot: string;
  private projectContext: ProjectContext | null = null;
  private llmConfig: LLMConfig | null = null;
  private prompts: Partial<AgentPrompts> | null = null;
  private browserSessionManager: BrowserSessionManager | null = null;
  private log = logger.child('AgentService');
  private planner: PlannerAgent;
  private generator: GeneratorAgent;
  private healer: HealerAgent;
  /** 所有 Agent 实例的数组，用于批量更新配置 */
  private agents: BaseAgent[];

  constructor(dataDir: string, config?: Partial<AgentConfig>, llmConfig?: LLMConfig) {
    this.dataDir = dataDir;
    this.projectRoot = config?.projectRoot || process.cwd();
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
    if (llmConfig) {
      this.llmConfig = llmConfig;
    }
    this.loadProjectContext();
    this.planner = new PlannerAgent(this.config, this.llmConfig);
    this.generator = new GeneratorAgent(this.config, this.llmConfig);
    this.healer = new HealerAgent(this.config, this.llmConfig);
    this.agents = [this.planner, this.generator, this.healer];
    this.initSharedToolRegistry();
  }

  /** 创建共享的 ToolRegistry 并分发给所有 Agent */
  private initSharedToolRegistry(): void {
    const registry = ToolRegistry.createDefaultRegistry(this.dataDir, this.projectRoot);
    for (const agent of this.agents) {
      agent.setToolRegistry(registry);
    }
  }

  /** 所有可用的额外配置源，按 key 名映射 */
  private extraConfigSources: Record<string, unknown> = {};

  /** 批量更新所有 Agent 的配置，避免重复创建实例 */
  private updateAllAgentsConfig(): void {
    for (const agent of this.agents) {
      const requiredKeys = agent.getRequiredExtraConfigKeys();
      const extraParams: Record<string, unknown> = {};
      for (const key of requiredKeys) {
        if (key in this.extraConfigSources) {
          extraParams[key] = this.extraConfigSources[key];
        }
      }
      agent.updateConfig(this.config, this.llmConfig, extraParams);
    }
  }

  setLLMConfig(config: LLMConfig): void {
    this.llmConfig = config;
    this.updateAllAgentsConfig();
  }

  setPrompts(prompts: Partial<AgentPrompts> | null): void {
    this.prompts = prompts;
    this.extraConfigSources.customPrompts = prompts;
    this.updateAllAgentsConfig();
  }

  setBrowserSessionManager(manager: BrowserSessionManager | null): void {
    this.browserSessionManager = manager;
    this.updateAllAgentsConfig();
  }

  setProjectRoot(root: string): void {
    this.projectRoot = path.resolve(root);
    this.config.projectRoot = this.projectRoot;
    this.loadProjectContext();
    this.initSharedToolRegistry();
    this.updateAllAgentsConfig();
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  /** 使用 ProjectContextLoader 加载项目上下文，避免与 project-context.ts 重复 */
  private loadProjectContext(): void {
    const loader = new ProjectContextLoader();
    this.projectContext = loader.load(this.projectRoot);
    this.config.projectContext = this.projectContext;
  }

  private resolveProjectPath(relativeOrAbsolute: string): string {
    return path.isAbsolute(relativeOrAbsolute)
      ? relativeOrAbsolute
      : path.resolve(this.projectRoot, relativeOrAbsolute);
  }

  /** Check if a resolved path is within the project root (safe for patch writes) */
  private isWithinProjectRoot(resolvedPath: string): boolean {
    return PatchApplier.isWithinProjectRoot(resolvedPath, this.projectRoot);
  }

  getConfig(): AgentConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...updates };
    this.updateAllAgentsConfig();
  }

  async initAgents(loopTarget: AgentLoopTarget): Promise<AgentResult<AgentInitResult>> {
    const startTime = Date.now();
    try {
      const result = await this.runInitAgents(loopTarget);
      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        agentType: 'planner',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'planner',
      };
    }
  }

  private runInitAgents(loopTarget: AgentLoopTarget): Promise<AgentInitResult> {
    return new Promise((resolve, reject) => {
      const args = ['playwright', 'init-agents', `--loop=${loopTarget}`];
      this.log.info(`Running: npx ${args.join(' ')}`);

      execFile('npx', args, { cwd: this.projectRoot, shell: true }, (error, _stdout, _stderr) => {
        if (error) {
          this.log.error(`init-agents failed: ${error.message}`);
          reject(new Error(`init-agents failed: ${error.message}`));
          return;
        }

        const filesCreated: string[] = [];
        const githubDir = path.join(this.projectRoot, '.github');
        if (fs.existsSync(githubDir)) {
          const entries = fs.readdirSync(githubDir);
          for (const entry of entries) {
            if (entry.includes('agent') || entry.includes('playwright')) {
              filesCreated.push(path.join('.github', entry));
            }
          }
        }

        let instructionsPath: string | undefined;
        const possiblePaths = [
          path.join(this.projectRoot, '.github', 'copilot-instructions.md'),
          path.join(this.projectRoot, '.github', 'instructions.md'),
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            instructionsPath = p;
            break;
          }
        }

        this.log.info(`init-agents completed: ${filesCreated.length} files created`);
        resolve({ loopTarget, filesCreated, instructionsPath });
      });
    });
  }

  async plan(
    description: string,
    options?: { seedTest?: string; prdPath?: string; outputDir?: string }
  ): Promise<AgentResult<TestPlan>> {
    if (!this.llmConfig?.enabled) {
      return {
        success: false,
        error: 'LLM is not enabled. Configure LLM settings first.',
        duration: 0,
        agentType: 'planner',
      };
    }

    const startTime = Date.now();
    try {
      const resolvedOptions = {
        seedTest: options?.seedTest ? this.resolveProjectPath(options.seedTest) : undefined,
        prdPath: options?.prdPath ? this.resolveProjectPath(options.prdPath) : undefined,
      };
      const plan = await this.planner.generatePlan(description, resolvedOptions);
      const outputDir = options?.outputDir || this.config.specsDir;
      const specsDir = this.resolveProjectPath(outputDir);
      if (!fs.existsSync(specsDir)) {
        fs.mkdirSync(specsDir, { recursive: true });
      }

      const planFileName = description
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
      const planFilePath = path.join(specsDir, `${planFileName}.md`);
      plan.filePath = planFilePath;

      // 委托给 PlannerAgent 的静态方法进行序列化
      const markdown = PlannerAgent.planToMarkdown(plan);
      fs.writeFileSync(planFilePath, markdown, 'utf-8');
      this.log.info(`Test plan saved to: ${planFilePath}`);

      return {
        success: true,
        data: plan,
        duration: Date.now() - startTime,
        agentType: 'planner',
        model: this.llmConfig.model,
        tokenUsage: this.planner.lastTokenUsage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'planner',
        model: this.llmConfig?.model,
      };
    }
  }

  async generate(
    planPath: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<AgentResult<string[]>> {
    if (!this.llmConfig?.enabled) {
      return {
        success: false,
        error: 'LLM is not enabled. Configure LLM settings first.',
        duration: 0,
        agentType: 'generator',
      };
    }

    const startTime = Date.now();
    try {
      const resolvedPlanPath = this.resolveProjectPath(planPath);
      if (!fs.existsSync(resolvedPlanPath)) {
        throw new Error(`Plan file not found: ${planPath}`);
      }

      const planContent = fs.readFileSync(resolvedPlanPath, 'utf-8');
      const resolvedSeedTest = options?.seedTest
        ? this.resolveProjectPath(options.seedTest)
        : this.config.seedTest
          ? this.resolveProjectPath(this.config.seedTest)
          : undefined;
      const resolvedOutputDir = options?.outputDir
        ? this.resolveProjectPath(options.outputDir)
        : undefined;
      const generatedFiles = await this.generator.generateTests(planContent, {
        outputDir: resolvedOutputDir,
        seedTest: resolvedSeedTest,
      });

      return {
        success: true,
        data: generatedFiles,
        duration: Date.now() - startTime,
        agentType: 'generator',
        model: this.llmConfig.model,
        tokenUsage: this.generator.lastTokenUsage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'generator',
        model: this.llmConfig?.model,
      };
    }
  }

  async heal(
    testFilePath: string,
    options?: {
      runId?: string;
      testId?: string;
      error?: string;
      stackTrace?: string;
    }
  ): Promise<AgentResult<AgentHealResult>> {
    if (!this.llmConfig?.enabled) {
      return {
        success: false,
        error: 'LLM is not enabled. Configure LLM settings first.',
        duration: 0,
        agentType: 'healer',
      };
    }

    const startTime = Date.now();
    try {
      const resolvedTestFilePath = this.resolveProjectPath(testFilePath);
      if (!fs.existsSync(resolvedTestFilePath)) {
        throw new Error(`Test file not found: ${testFilePath}`);
      }

      const result = await this.healer.healTest(resolvedTestFilePath, {
        maxRounds: this.config.maxHealRounds,
        error: options?.error,
        stackTrace: options?.stackTrace,
      });

      if (result.healed && result.patches.length > 0 && this.config.autoHeal) {
        await this.applyPatches(result.patches);
      }

      await this.saveHealHistory(result);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        agentType: 'healer',
        model: this.llmConfig.model,
        tokenUsage: this.healer.lastTokenUsage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'healer',
        model: this.llmConfig?.model,
      };
    }
  }

  async applyPatch(patch: HealerPatch): Promise<boolean> {
    try {
      const applier = new PatchApplier();
      const result = applier.applyPatch(patch, this.projectRoot);

      if (result) {
        patch.appliedAt = Date.now();
        patch.appliedBy = 'manual';
      }

      return result;
    } catch (error) {
      this.log.error(
        `Failed to apply patch: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  async applyPatches(patches: HealerPatch[]): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const patch of patches) {
      const result = await this.applyPatch(patch);
      results.push(result);
      if (result) {
        patch.appliedAt = Date.now();
        patch.appliedBy = 'auto';
      }
    }
    return results;
  }

  async getHealHistory(): Promise<AgentHealResult[]> {
    const historyPath = path.join(this.dataDir, 'agent-heal-history.json');
    try {
      if (!fs.existsSync(historyPath)) {
        return [];
      }
      const content = fs.readFileSync(historyPath, 'utf-8');
      return JSON.parse(content) as AgentHealResult[];
    } catch {
      return [];
    }
  }

  private async saveHealHistory(result: AgentHealResult): Promise<void> {
    const historyPath = path.join(this.dataDir, 'agent-heal-history.json');
    try {
      let history: AgentHealResult[] = [];
      if (fs.existsSync(historyPath)) {
        const content = fs.readFileSync(historyPath, 'utf-8');
        history = JSON.parse(content);
      }
      history.push(result);
      if (history.length > 100) {
        history = history.slice(-100);
      }
      await fs.promises.mkdir(path.dirname(historyPath), { recursive: true });
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (error) {
      this.log.warn(
        `Failed to save heal history: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** 委托给 PlannerAgent 的静态方法解析 Markdown 计划 */
  parseMarkdownPlan(filePath: string): TestPlan | null {
    return PlannerAgent.parseMarkdownPlan(filePath);
  }

  async listPlans(): Promise<TestPlan[]> {
    const specsDir = this.resolveProjectPath(this.config.specsDir);
    if (!fs.existsSync(specsDir)) {
      return [];
    }

    const plans: TestPlan[] = [];
    const entries = fs.readdirSync(specsDir);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const plan = PlannerAgent.parseMarkdownPlan(path.join(specsDir, entry));
        if (plan) {
          plans.push(plan);
        }
      }
    }

    return plans.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ─── 会话上下文管理 ──────────────────────────────────────────

  /** 创建新的会话上下文 */
  createSessionContext(): AgentSessionContext {
    return {
      sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: Date.now(),
    };
  }

  /**
   * 执行完整的 Plan → Generate → Heal 管线，
   * 通过 AgentSessionContext 在 Agent 间传递状态。
   */
  async runPipeline(
    description: string,
    options?: {
      seedTest?: string;
      prdPath?: string;
      outputDir?: string;
      autoHeal?: boolean;
    }
  ): Promise<AgentResult<AgentSessionContext>> {
    const session = this.createSessionContext();
    const startTime = Date.now();

    try {
      // Phase 1: Plan
      const planResult = await this.plan(description, {
        seedTest: options?.seedTest,
        prdPath: options?.prdPath,
        outputDir: options?.outputDir,
      });

      if (!planResult.success || !planResult.data) {
        return {
          success: false,
          error: planResult.error || 'Plan phase failed',
          duration: Date.now() - startTime,
          agentType: 'pipeline',
          data: session,
        };
      }

      session.plan = planResult.data;
      if (planResult.tokenUsage) {
        session.planTokenUsage = {
          promptTokens: planResult.tokenUsage.promptTokens,
          completionTokens: planResult.tokenUsage.completionTokens,
          totalTokens: planResult.tokenUsage.totalTokens,
        };
      }

      // Phase 2: Generate
      if (!planResult.data.filePath) {
        return {
          success: false,
          error: 'Plan has no file path, cannot generate tests',
          duration: Date.now() - startTime,
          agentType: 'pipeline',
          data: session,
        };
      }

      const generateResult = await this.generate(planResult.data.filePath, {
        outputDir: options?.outputDir,
        seedTest: options?.seedTest,
      });

      if (!generateResult.success || !generateResult.data) {
        return {
          success: false,
          error: generateResult.error || 'Generate phase failed',
          duration: Date.now() - startTime,
          agentType: 'pipeline',
          data: session,
        };
      }

      session.generatedFiles = generateResult.data;
      if (generateResult.tokenUsage) {
        session.generateTokenUsage = {
          promptTokens: generateResult.tokenUsage.promptTokens,
          completionTokens: generateResult.tokenUsage.completionTokens,
          totalTokens: generateResult.tokenUsage.totalTokens,
        };
      }

      // Phase 3: Heal (optional, only if autoHeal is enabled)
      if (options?.autoHeal ?? this.config.autoHeal) {
        session.healHistory = [];
        for (const testFile of generateResult.data) {
          const healResult = await this.heal(testFile);
          if (healResult.success && healResult.data) {
            session.healHistory.push(healResult.data);
            session.totalHealRounds = (session.totalHealRounds || 0) + healResult.data.roundsUsed;
            if (healResult.tokenUsage) {
              session.healTokenUsage = {
                promptTokens:
                  (session.healTokenUsage?.promptTokens || 0) + healResult.tokenUsage.promptTokens,
                completionTokens:
                  (session.healTokenUsage?.completionTokens || 0) +
                  healResult.tokenUsage.completionTokens,
                totalTokens:
                  (session.healTokenUsage?.totalTokens || 0) + healResult.tokenUsage.totalTokens,
              };
            }
          }
        }
      }

      return {
        success: true,
        data: session,
        duration: Date.now() - startTime,
        agentType: 'pipeline',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'pipeline',
        data: session,
      };
    }
  }
}
