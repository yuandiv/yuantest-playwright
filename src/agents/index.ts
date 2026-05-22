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
  TestPlanStep,
  HealerPatch,
  AgentHealResult,
  AgentPrompts,
  LLMConfig,
  ProjectContext,
} from '../types';
import { BaseAgent } from './base-agent';
import { PlannerAgent } from './planner';
import { GeneratorAgent } from './generator';
import { HealerAgent } from './healer';
import { BrowserSessionManager } from './browser-session';
import { PatchApplier } from './patch-applier';

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
  }

  /** 批量更新所有 Agent 的配置，避免重复创建实例 */
  private updateAllAgentsConfig(): void {
    for (const agent of this.agents) {
      const extraParams: Record<string, unknown> = {};
      if (agent === this.planner) {
        extraParams.customPrompts = this.prompts;
        extraParams.browserSessionManager = this.browserSessionManager;
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
    this.updateAllAgentsConfig();
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  private loadProjectContext(): void {
    this.projectContext = {
      projectRoot: this.projectRoot,
    };

    const configFiles = [
      path.join(this.projectRoot, 'playwright.config.ts'),
      path.join(this.projectRoot, 'playwright.config.js'),
      path.join(this.projectRoot, 'playwright.config.mts'),
    ];

    let configFilePath: string | undefined;
    for (const f of configFiles) {
      if (fs.existsSync(f)) {
        configFilePath = f;
        break;
      }
    }

    if (configFilePath) {
      try {
        const configContent = fs.readFileSync(configFilePath, 'utf-8');

        const baseURLMatch = configContent.match(/baseURL\s*:\s*['"`]([^'"`]+)['"`]/);
        if (baseURLMatch) {
          this.projectContext.baseURL = baseURLMatch[1];
        }

        const timeoutMatch = configContent.match(/timeout\s*:\s*(\d+)/);
        if (timeoutMatch) {
          this.projectContext.timeout = parseInt(timeoutMatch[1], 10);
        }

        const testDirMatch = configContent.match(/testDir\s*:\s*['"`]([^'"`]+)['"`]/);
        if (testDirMatch) {
          this.projectContext.testDir = testDirMatch[1];
        }

        const viewportMatch = configContent.match(
          /viewport\s*:\s*\{\s*width\s*:\s*(\d+)\s*,\s*height\s*:\s*(\d+)\s*\}/
        );
        if (viewportMatch) {
          this.projectContext.useViewport = {
            width: parseInt(viewportMatch[1], 10),
            height: parseInt(viewportMatch[2], 10),
          };
        }

        this.log.info(
          `Loaded project context: baseURL=${this.projectContext.baseURL || 'N/A'}, timeout=${this.projectContext.timeout || 'N/A'}`
        );
      } catch (error) {
        this.log.warn(
          `Failed to read playwright config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        this.projectContext.packageJson = {
          name: pkg.name,
          dependencies: pkg.dependencies,
          devDependencies: pkg.devDependencies,
        };

        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const techStack: string[] = [];
        if (allDeps.react || allDeps['react-dom']) {
          techStack.push('React');
        }
        if (allDeps.vue || allDeps['vue-router']) {
          techStack.push('Vue');
        }
        if (allDeps.angular || allDeps['@angular/core']) {
          techStack.push('Angular');
        }
        if (allDeps.svelte || allDeps['@sveltejs/kit']) {
          techStack.push('Svelte');
        }
        if (allDeps.next || allDeps['next.js']) {
          techStack.push('Next.js');
        }
        if (allDeps.nuxt || allDeps['nuxt3']) {
          techStack.push('Nuxt');
        }
        if (allDeps.vite) {
          techStack.push('Vite');
        }
        if (allDeps.webpack) {
          techStack.push('Webpack');
        }
        if (techStack.length > 0) {
          this.projectContext.technology = techStack.join(', ');
        }
      } catch {
        // ignore
      }
    }

    const fixturePaths = [
      path.join(this.projectRoot, 'tests', 'fixtures.ts'),
      path.join(this.projectRoot, 'tests', 'fixtures.js'),
      path.join(this.projectRoot, 'test', 'fixtures.ts'),
      path.join(this.projectRoot, 'test', 'fixtures.js'),
    ];
    for (const fp of fixturePaths) {
      if (fs.existsSync(fp)) {
        this.projectContext.fixtures = path.relative(this.projectRoot, fp).replace(/\\/g, '/');
        break;
      }
    }

    this.config.projectContext = this.projectContext;
  }

  private resolveProjectPath(relativeOrAbsolute: string): string {
    return path.isAbsolute(relativeOrAbsolute)
      ? relativeOrAbsolute
      : path.resolve(this.projectRoot, relativeOrAbsolute);
  }

  /** Check if a resolved path is within the project root (safe for patch writes) */
  private isWithinProjectRoot(resolvedPath: string): boolean {
    const normalized = path.normalize(resolvedPath);
    const normalizedRoot = path.normalize(this.projectRoot);
    return normalized.startsWith(normalizedRoot + path.sep) || normalized === normalizedRoot;
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

      const markdown = this.planToMarkdown(plan);
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
      const resolvedFilePath = this.resolveProjectPath(patch.filePath);

      // Security check: patch target must be within project root
      if (!this.isWithinProjectRoot(resolvedFilePath)) {
        this.log.error(`Security: patch target outside project root: ${resolvedFilePath}`);
        return false;
      }

      if (!fs.existsSync(resolvedFilePath)) {
        this.log.error(`File not found for patch: ${resolvedFilePath}`);
        return false;
      }

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

  private generateSlug(text: string): string {
    let slug = text.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
    slug = slug.replace(/-+/g, '-');
    slug = slug.replace(/^-+|-+$/g, '');
    return slug.slice(0, 80);
  }

  private planToMarkdown(plan: TestPlan): string {
    let md = `# ${plan.title}\n\n`;
    md += `${plan.description}\n\n`;

    if (plan.seedTest) {
      md += `**Seed:** \`${plan.seedTest}\`\n\n`;
    }

    for (const scenario of plan.scenarios) {
      md += `## ${scenario.name}\n\n`;
      md += `**Steps:**\n\n`;
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        md += `${i + 1}. ${step.action}`;
        if (step.target) {
          md += ` → \`${step.target}\``;
        }
        if (step.value) {
          md += ` = "${step.value}"`;
        }
        md += '\n';
      }
      md += `\n**Expected Results:**\n\n`;
      for (const result of scenario.expectedResults) {
        md += `- ${result}\n`;
      }
      md += '\n';
    }

    return md;
  }

  parseMarkdownPlan(filePath: string): TestPlan | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');

      const seedMatch = content.match(/\*\*Seed:\*\* `(.+?)`/);
      const seedTest = seedMatch ? seedMatch[1] : undefined;

      const descriptionLines: string[] = [];
      const lines = content.split('\n');
      let inDescription = false;
      for (const line of lines) {
        if (line.startsWith('# ') && !inDescription) {
          inDescription = true;
          continue;
        }
        if (line.startsWith('## ')) {
          break;
        }
        if (inDescription && line.trim() && !line.startsWith('**Seed:**')) {
          descriptionLines.push(line.trim());
        }
      }

      const scenarios: TestPlan['scenarios'] = [];
      const scenarioRegex = /^## (.+)$/gm;
      let scenarioMatch: RegExpExecArray | null;

      while ((scenarioMatch = scenarioRegex.exec(content)) !== null) {
        const scenarioName = scenarioMatch[1];
        const scenarioStart = scenarioMatch.index + scenarioMatch[0].length;
        const nextScenario = content.indexOf('## ', scenarioStart + 1);
        const scenarioContent = content.slice(
          scenarioStart,
          nextScenario === -1 ? undefined : nextScenario
        );

        const steps: TestPlanStep[] = [];
        // Try new format first (→ and =)
        const newFormatRegex = /^\d+\.\s+(.+?)(?:\s+→\s+`(.+?)`)?(?:\s+=\s+"(.+?)")?$/gm;
        let stepMatch: RegExpExecArray | null;
        const newFormatSteps: TestPlanStep[] = [];
        while ((stepMatch = newFormatRegex.exec(scenarioContent)) !== null) {
          newFormatSteps.push({
            action: stepMatch[1],
            target: stepMatch[2] || '',
            value: stepMatch[3],
          });
        }
        if (newFormatSteps.length > 0) {
          steps.push(...newFormatSteps);
        } else {
          // Fall back to old format (on and with)
          const stepRegex = /^\d+\.\s+(.+?)(?:\s+on\s+`(.+?)`)?(?:\s+with\s+"(.+?)")?$/gm;
          while ((stepMatch = stepRegex.exec(scenarioContent)) !== null) {
            steps.push({
              action: stepMatch[1],
              target: stepMatch[2] || '',
              value: stepMatch[3],
            });
          }
        }

        const expectedResults: string[] = [];
        const resultRegex = /^- (.+)$/gm;
        let resultMatch: RegExpExecArray | null;
        while ((resultMatch = resultRegex.exec(scenarioContent)) !== null) {
          expectedResults.push(resultMatch[1]);
        }

        scenarios.push({ name: scenarioName, steps, expectedResults });
      }

      return {
        id: `plan-${Date.now()}`,
        title,
        description: descriptionLines.join(' '),
        scenarios,
        createdAt: Date.now(),
        seedTest,
        filePath,
      };
    } catch (error) {
      this.log.warn(
        `Failed to parse markdown plan: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  async healWithVerification(
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

      // healWithVerification only applies patches when autoHeal is true
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

  async listPlans(): Promise<TestPlan[]> {
    const specsDir = this.resolveProjectPath(this.config.specsDir);
    if (!fs.existsSync(specsDir)) {
      return [];
    }

    const plans: TestPlan[] = [];
    const entries = fs.readdirSync(specsDir);
    for (const entry of entries) {
      if (entry.endsWith('.md')) {
        const plan = this.parseMarkdownPlan(path.join(specsDir, entry));
        if (plan) {
          plans.push(plan);
        }
      }
    }

    return plans.sort((a, b) => b.createdAt - a.createdAt);
  }
}
