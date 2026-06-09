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
import { PlannerAgent } from './planner';
import { BrowserSessionManager } from './browser-session';
import { LLMService } from './llm-service';
import { ToolRegistry } from './tool-registry';
import { AgentConfigManager } from './agent-config-manager';
import { AgentLifecycleManager } from './agent-lifecycle-manager';
import { AgentSessionManager } from './agent-session-manager';
import { AgentHistoryManager } from './agent-history-manager';
import { AgentPipelineOrchestrator } from './agent-pipeline-orchestrator';
import { AgentFileOperations } from './agent-file-operations';

/**
 * AgentService — 外观模式协调器。
 * 将配置管理、生命周期管理、会话管理、历史记录、流程编排和文件操作
 * 委托给各专职管理器，自身仅保留接口兼容层和 initAgents 初始化逻辑。
 */
export class AgentService {
  private dataDir: string;
  private configManager: AgentConfigManager;
  private lifecycleManager: AgentLifecycleManager;
  private sessionManager: AgentSessionManager;
  private historyManager: AgentHistoryManager;
  private pipelineOrchestrator: AgentPipelineOrchestrator;
  private fileOperations: AgentFileOperations;
  private log = logger.child('AgentService');

  constructor(
    dataDir: string,
    config?: Partial<AgentConfig>,
    llmConfig?: LLMConfig,
    sharedLLMService?: LLMService,
    sharedToolRegistry?: ToolRegistry
  ) {
    this.dataDir = dataDir;

    // 初始化各管理器
    this.configManager = new AgentConfigManager(config);
    if (llmConfig) {
      this.configManager.setLLMConfig(llmConfig);
    }

    const projectRoot = this.configManager.getConfig().projectRoot || process.cwd();
    this.fileOperations = new AgentFileOperations(projectRoot);
    this.lifecycleManager = new AgentLifecycleManager(
      dataDir,
      this.configManager,
      sharedLLMService,
      sharedToolRegistry
    );
    this.sessionManager = new AgentSessionManager();
    this.historyManager = new AgentHistoryManager(dataDir);
    this.pipelineOrchestrator = new AgentPipelineOrchestrator(
      this.configManager,
      this.lifecycleManager,
      this.sessionManager,
      this.historyManager,
      this.fileOperations
    );

    this.configManager.loadProjectContext();
  }

  // ─── 配置相关（委托给 AgentConfigManager）──────────────────

  setLLMConfig(config: LLMConfig): void {
    this.configManager.setLLMConfig(config);
  }

  setPrompts(prompts: Partial<AgentPrompts> | null): void {
    this.configManager.setPrompts(prompts);
  }

  setBrowserSessionManager(manager: BrowserSessionManager | null): void {
    this.configManager.setBrowserSessionManager(manager);
  }

  setProjectRoot(root: string): void {
    const resolvedRoot = path.resolve(root);
    this.configManager.setProjectRoot(resolvedRoot);
    this.fileOperations.setProjectRoot(resolvedRoot);
    this.lifecycleManager.reinitializeToolRegistry();
  }

  getProjectRoot(): string {
    return this.fileOperations.getProjectRoot();
  }

  getProjectContext(): ProjectContext | null {
    return this.configManager.getProjectContext();
  }

  getConfig(): AgentConfig {
    return this.configManager.getConfig();
  }

  updateConfig(updates: Partial<AgentConfig>): void {
    this.configManager.updateConfig(updates);
  }

  // ─── 初始化 Agent 环境 ──────────────────────────────────────

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
      const projectRoot = this.fileOperations.getProjectRoot();
      const args = ['playwright', 'init-agents', `--loop=${loopTarget}`];
      this.log.info(`Running: npx ${args.join(' ')}`);

      execFile('npx', args, { cwd: projectRoot, shell: true }, (error, _stdout, _stderr) => {
        if (error) {
          this.log.error(`init-agents failed: ${error.message}`);
          reject(new Error(`init-agents failed: ${error.message}`));
          return;
        }

        const filesCreated: string[] = [];
        const githubDir = path.join(projectRoot, '.github');
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
          path.join(projectRoot, '.github', 'copilot-instructions.md'),
          path.join(projectRoot, '.github', 'instructions.md'),
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

  // ─── 业务操作（委托给 AgentPipelineOrchestrator）────────────

  async plan(
    description: string,
    options?: { seedTest?: string; prdPath?: string; outputDir?: string }
  ): Promise<AgentResult<TestPlan>> {
    return this.pipelineOrchestrator.executePlan(description, options);
  }

  async generate(
    planPath: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<AgentResult<string[]>> {
    return this.pipelineOrchestrator.executeGenerate(planPath, options);
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
    return this.pipelineOrchestrator.executeHeal(testFilePath, options);
  }

  async applyPatch(patch: HealerPatch): Promise<boolean> {
    return this.pipelineOrchestrator.applyPatch(patch);
  }

  async applyPatches(patches: HealerPatch[]): Promise<boolean[]> {
    return this.pipelineOrchestrator.applyPatches(patches);
  }

  // ─── 历史记录（委托给 AgentHistoryManager）──────────────────

  async getHealHistory(): Promise<AgentHealResult[]> {
    return this.historyManager.getHealHistory();
  }

  // ─── 计划查询 ──────────────────────────────────────────────

  parseMarkdownPlan(filePath: string): TestPlan | null {
    return PlannerAgent.parseMarkdownPlan(filePath);
  }

  async listPlans(): Promise<TestPlan[]> {
    const config = this.configManager.getConfig();
    const specsDir = this.fileOperations.resolveProjectPath(config.specsDir);
    if (!this.fileOperations.exists(specsDir)) {
      return [];
    }

    const plans: TestPlan[] = [];
    const entries = this.fileOperations.listFiles(specsDir);
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

  // ─── 会话上下文（委托给 AgentSessionManager）────────────────

  createSessionContext(): AgentSessionContext {
    return this.sessionManager.createSession();
  }

  // ─── 完整管线（委托给 AgentPipelineOrchestrator）────────────

  async runPipeline(
    description: string,
    options?: {
      seedTest?: string;
      prdPath?: string;
      outputDir?: string;
      autoHeal?: boolean;
    }
  ): Promise<AgentResult<AgentSessionContext>> {
    return this.pipelineOrchestrator.executePipeline(description, options);
  }
}
