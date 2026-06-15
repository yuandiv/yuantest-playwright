import * as path from 'path';
import { logger } from '../logger';
import { AgentResult, AgentSessionContext, AgentHealResult, HealerPatch, TestPlan } from '../types';
import { PlannerAgent } from './planner';
import { HealerAgent } from './healer';
import { PatchApplier } from './patch-applier';
import { AgentConfigManager } from './agent-config-manager';
import { AgentLifecycleManager } from './agent-lifecycle-manager';
import { AgentSessionManager } from './agent-session-manager';
import { AgentHistoryManager } from './agent-history-manager';
import { AgentFileOperations } from './agent-file-operations';

/**
 * 业务流程编排器。
 * 负责 Plan → Generate → Heal 管线的编排和执行，
 * 以及单个 Agent 操作（plan / generate / heal）的流程封装。
 */
export class AgentPipelineOrchestrator {
  private log = logger.child('AgentPipelineOrchestrator');

  constructor(
    private configManager: AgentConfigManager,
    private lifecycleManager: AgentLifecycleManager,
    private sessionManager: AgentSessionManager,
    private historyManager: AgentHistoryManager,
    private fileOperations: AgentFileOperations
  ) {}

  // ─── 单阶段操作 ────────────────────────────────────────────

  async executePlan(
    description: string,
    options?: { seedTest?: string; prdPath?: string; outputDir?: string }
  ): Promise<AgentResult<TestPlan>> {
    const llmConfig = this.configManager.getLLMConfig();
    if (!llmConfig?.enabled) {
      return {
        success: false,
        error: 'LLM is not enabled. Configure LLM settings first.',
        duration: 0,
        agentType: 'planner',
      };
    }

    const startTime = Date.now();
    try {
      const planner = this.lifecycleManager.getPlanner();
      const resolvedOptions = {
        seedTest: options?.seedTest
          ? this.fileOperations.resolveProjectPath(options.seedTest)
          : undefined,
        prdPath: options?.prdPath
          ? this.fileOperations.resolveProjectPath(options.prdPath)
          : undefined,
      };
      const plan = await planner.generatePlan(description, resolvedOptions);

      const config = this.configManager.getConfig();
      const outputDir = options?.outputDir || config.specsDir;
      const specsDir = this.fileOperations.resolveProjectPath(outputDir);
      this.fileOperations.ensureDirectory(specsDir);

      const planFileName = description
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
      const planFilePath = path.join(specsDir, `${planFileName}.md`);
      plan.filePath = planFilePath;

      const markdown = PlannerAgent.planToMarkdown(plan);
      this.fileOperations.writeFile(planFilePath, markdown);
      this.log.info(`Test plan saved to: ${planFilePath}`);

      return {
        success: true,
        data: plan,
        duration: Date.now() - startTime,
        agentType: 'planner',
        model: llmConfig.model,
        tokenUsage: planner.lastTokenUsage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'planner',
        model: llmConfig?.model,
      };
    }
  }

  async executeGenerate(
    planPath: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<AgentResult<string[]>> {
    const llmConfig = this.configManager.getLLMConfig();
    if (!llmConfig?.enabled) {
      return {
        success: false,
        error: 'LLM is not enabled. Configure LLM settings first.',
        duration: 0,
        agentType: 'generator',
      };
    }

    const startTime = Date.now();
    try {
      const resolvedPlanPath = this.fileOperations.resolveProjectPath(planPath);
      if (!this.fileOperations.exists(resolvedPlanPath)) {
        throw new Error(`Plan file not found: ${planPath}`);
      }

      const planContent = this.fileOperations.readFile(resolvedPlanPath);
      const config = this.configManager.getConfig();
      const resolvedSeedTest = options?.seedTest
        ? this.fileOperations.resolveProjectPath(options.seedTest)
        : config.seedTest
          ? this.fileOperations.resolveProjectPath(config.seedTest)
          : undefined;
      const resolvedOutputDir = options?.outputDir
        ? this.fileOperations.resolveProjectPath(options.outputDir)
        : undefined;

      const generator = this.lifecycleManager.getGenerator();
      const generatedFiles = await generator.generateTests(planContent, {
        outputDir: resolvedOutputDir,
        seedTest: resolvedSeedTest,
      });

      return {
        success: true,
        data: generatedFiles,
        duration: Date.now() - startTime,
        agentType: 'generator',
        model: llmConfig.model,
        tokenUsage: generator.lastTokenUsage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'generator',
        model: llmConfig?.model,
      };
    }
  }

  async executeHeal(
    testFilePath: string,
    options?: {
      error?: string;
      stackTrace?: string;
    }
  ): Promise<AgentResult<AgentHealResult>> {
    const llmConfig = this.configManager.getLLMConfig();
    if (!llmConfig?.enabled) {
      return {
        success: false,
        error: 'LLM is not enabled. Configure LLM settings first.',
        duration: 0,
        agentType: 'healer',
      };
    }

    const startTime = Date.now();
    try {
      const resolvedTestFilePath = this.fileOperations.resolveProjectPath(testFilePath);
      if (!this.fileOperations.exists(resolvedTestFilePath)) {
        throw new Error(`Test file not found: ${testFilePath}`);
      }

      const config = this.configManager.getConfig();
      const healer = this.lifecycleManager.getHealer();
      const result = await healer.healTest(resolvedTestFilePath, {
        maxRounds: config.maxHealRounds,
        error: options?.error,
        stackTrace: options?.stackTrace,
      });

      if (result.healed && result.patches.length > 0 && config.autoHeal) {
        await this.applyPatches(result.patches);
      }

      await this.historyManager.saveHealResult(result);

      return {
        success: true,
        data: result,
        duration: Date.now() - startTime,
        agentType: 'healer',
        model: llmConfig.model,
        tokenUsage: healer.lastTokenUsage,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'healer',
        model: llmConfig?.model,
      };
    }
  }

  // ─── 补丁应用 ──────────────────────────────────────────────

  async applyPatch(patch: HealerPatch): Promise<boolean> {
    try {
      const applier = new PatchApplier();
      const projectRoot = this.configManager.getConfig().projectRoot || process.cwd();
      const result = applier.applyPatch(patch, projectRoot);

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

  // ─── 完整管线 ──────────────────────────────────────────────

  async executePipeline(
    description: string,
    options?: {
      seedTest?: string;
      prdPath?: string;
      outputDir?: string;
      autoHeal?: boolean;
    }
  ): Promise<AgentResult<AgentSessionContext>> {
    const session = this.sessionManager.createSession();
    const startTime = Date.now();

    try {
      // Phase 1: Plan
      const planResult = await this.executePlan(description, {
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

      const generateResult = await this.executeGenerate(planResult.data.filePath, {
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
      const config = this.configManager.getConfig();
      if (options?.autoHeal ?? config.autoHeal) {
        session.healHistory = [];
        for (const testFile of generateResult.data) {
          const healResult = await this.executeHeal(testFile);
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
