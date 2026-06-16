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
  AgentHealResult,
  AgentPrompts,
  LLMConfig,
  ProjectContext,
  AgentSessionContext,
} from '../types';
import { AgentOutputParser } from './output-parser';
import { BrowserSessionManager } from './browser-session';
import { LLMService } from './llm-service';
import { ToolRegistry } from './tool-registry';
import { AgentConfigManager } from './agent-config-manager';
import { AgentLifecycleManager } from './agent-lifecycle-manager';
import { AgentSessionManager } from './agent-session-manager';
import { AgentHistoryManager } from './agent-history-manager';
import { PatchApplier } from './patch-applier';
import { AgentFileOperations } from './agent-file-operations';

/**
 * AgentService — 向后兼容类。
 * 新代码请使用 UnifiedAIService。
 */
export class AgentService {
  private dataDir: string;
  private configManager: AgentConfigManager;
  private lifecycleManager: AgentLifecycleManager;
  private sessionManager: AgentSessionManager;
  private historyManager: AgentHistoryManager;
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

    this.configManager.loadProjectContext();
  }

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

  async plan(
    description: string,
    options?: { seedTest?: string; prdPath?: string; outputDir?: string }
  ): Promise<AgentResult<TestPlan>> {
    const llmConfig = this.configManager.getLLMConfig();
    if (!llmConfig?.enabled) {
      return { success: false, error: 'LLM is not enabled', duration: 0, agentType: 'planner' };
    }
    const startTime = Date.now();
    try {
      const llmService = new LLMService(llmConfig);
      const lang = (this.configManager.getConfig().language || 'zh') as 'zh' | 'en';
      const projectContext = this.configManager.getProjectContext();

      const systemPrompt = lang === 'zh'
        ? '你是一位专业的测试规划专家。你的任务是根据用户描述的功能场景，生成全面、深入的结构化测试计划。\n\n## 场景类型要求\n你必须覆盖以下场景类型：\n1. 正向流程\n2. 反向/异常流程\n3. 边界值测试\n4. 数据验证\n\n请使用中文回复。'
        : 'You are a professional test planning expert. Generate comprehensive structured test plans.\n\n## Scenario Types\n1. Happy Path\n2. Negative/Error Flow\n3. Boundary Value Testing\n4. Data Validation';

      let userPrompt = lang === 'zh'
        ? `请为以下功能生成测试计划：\n\n${description}\n`
        : `Generate a test plan for the following feature:\n\n${description}\n`;

      if (options?.seedTest) {
        try {
          const seedContent = require('fs').readFileSync(options.seedTest, 'utf-8');
          userPrompt += `\n参考 Seed Test:\n\`\`\`typescript\n${seedContent}\n\`\`\`\n`;
        } catch { /* ignore */ }
      }

      const result = await llmService.chat({
        systemPrompt,
        userPrompt,
        responseFormat: { type: 'json_object' },
      });

      const plan = AgentOutputParser.parseTestPlan(result.content, description);
      return { success: true, data: plan, duration: Date.now() - startTime, agentType: 'planner' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), duration: Date.now() - startTime, agentType: 'planner' };
    }
  }

  async generate(
    planPath: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<AgentResult<string[]>> {
    const llmConfig = this.configManager.getLLMConfig();
    if (!llmConfig?.enabled) {
      return { success: false, error: 'LLM is not enabled', duration: 0, agentType: 'generator' };
    }
    const startTime = Date.now();
    try {
      const planContent = fs.readFileSync(planPath, 'utf-8');
      const files = await this.lifecycleManager.getGenerator().generateTests(planContent, options);
      return { success: true, data: files, duration: Date.now() - startTime, agentType: 'generator' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), duration: Date.now() - startTime, agentType: 'generator' };
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
    const llmConfig = this.configManager.getLLMConfig();
    if (!llmConfig?.enabled) {
      return { success: false, error: 'LLM is not enabled', duration: 0, agentType: 'healer' };
    }
    const startTime = Date.now();
    try {
      const config = this.configManager.getConfig();
      const result = await this.lifecycleManager.getHealer().healTest(testFilePath, {
        maxRounds: config.maxHealRounds,
        error: options?.error,
        stackTrace: options?.stackTrace,
      });
      return { success: true, data: result, duration: Date.now() - startTime, agentType: 'healer' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), duration: Date.now() - startTime, agentType: 'healer' };
    }
  }

  async getHealHistory(): Promise<AgentHealResult[]> {
    return this.historyManager.getHealHistory();
  }

  parseMarkdownPlan(filePath: string): TestPlan | null {
    return AgentOutputParser.parseMarkdownPlan(filePath);
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
        const plan = AgentOutputParser.parseMarkdownPlan(path.join(specsDir, entry));
        if (plan) {
          plans.push(plan);
        }
      }
    }

    return plans.sort((a, b) => b.createdAt - a.createdAt);
  }

  createSessionContext(): AgentSessionContext {
    return this.sessionManager.createSession();
  }
}
