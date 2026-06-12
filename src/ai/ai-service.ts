import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { LLMService, type ToolSchema } from '../agents/llm-service';
import { ToolRegistry } from '../agents/tool-registry';
import { MCPClientManager } from '../chat/mcp-client-manager';
import { MCPConfigService } from '../ui/services/mcp-config-service';
import {
  ConversationStore,
  type Conversation,
  type ConversationSummary,
} from '../chat/conversation-store';
import type { LLMConfig } from '../types';
import {
  AgentConfig,
  AgentInitResult,
  AgentLoopTarget,
  AgentResult,
  TestPlan,
  HealerPatch,
  AgentHealResult,
  AgentPrompts,
  AgentSessionContext,
  ProjectContext,
} from '../types';
import { PlannerAgent } from '../agents/planner';
import { BrowserSessionManager } from '../agents/browser-session';
import { AgentConfigManager } from '../agents/agent-config-manager';
import { AgentLifecycleManager } from '../agents/agent-lifecycle-manager';
import { AgentSessionManager } from '../agents/agent-session-manager';
import { AgentHistoryManager } from '../agents/agent-history-manager';
import { AgentPipelineOrchestrator } from '../agents/agent-pipeline-orchestrator';
import { AgentFileOperations } from '../agents/agent-file-operations';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SSEEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  data: unknown;
}

// ─── UnifiedAIService ──────────────────────────────────────────────────────────

/**
 * UnifiedAIService — 统一 AI 服务。
 *
 * 完全合并 ChatService（对话管理 + MCP 连接）和 AgentService（测试管线编排），
 * 所有子管理器归该类直接持有，不存在内部委托。
 *
 * 聊天系统（sendMessage）的 executeTool 可直接调用 this.plan() / this.heal() 等
 * Agent 管线方法，无需经过 ToolRegistry 桥接。
 */
export class UnifiedAIService {
  // ── Chat 子模块 ───────────────────────────────────────────────────────────
  private store: ConversationStore;
  private mcpManager: MCPClientManager;
  private mcpConfigService: MCPConfigService | null;

  // ── Agent 子模块 ──────────────────────────────────────────────────────────
  private configManager: AgentConfigManager;
  private lifecycleManager: AgentLifecycleManager;
  private sessionManager: AgentSessionManager;
  private historyManager: AgentHistoryManager;
  private pipelineOrchestrator: AgentPipelineOrchestrator;
  private fileOperations: AgentFileOperations;

  // ── 共享 ──────────────────────────────────────────────────────────────────
  private toolRegistry: ToolRegistry;
  private llmService: LLMService | null = null;
  private dataDir: string;
  private projectRoot: string;
  private log = logger.child('UnifiedAIService');

  constructor(
    dataDir: string,
    projectRoot: string,
    toolRegistry: ToolRegistry,
    llmConfig?: LLMConfig,
    sharedLLMService?: LLMService,
    mcpConfigService?: MCPConfigService,
    sharedMCPClientManager?: MCPClientManager,
    agentConfig?: Partial<AgentConfig>,
    sharedToolRegistry?: ToolRegistry
  ) {
    this.dataDir = dataDir;
    this.projectRoot = projectRoot;
    this.toolRegistry = sharedToolRegistry || toolRegistry;

    // 初始化 Chat 子模块
    this.store = new ConversationStore(dataDir);
    this.mcpManager = sharedMCPClientManager || new MCPClientManager(projectRoot);
    this.mcpConfigService = mcpConfigService || null;

    // 初始化共享 LLM 服务
    if (sharedLLMService) {
      this.llmService = sharedLLMService;
    } else if (llmConfig && llmConfig.enabled) {
      this.llmService = new LLMService(llmConfig);
    }

    // 初始化 Agent 子模块
    this.configManager = new AgentConfigManager(agentConfig);
    if (llmConfig) {
      this.configManager.setLLMConfig(llmConfig);
    }
    const agentRoot = this.configManager.getConfig().projectRoot || projectRoot || process.cwd();
    this.fileOperations = new AgentFileOperations(agentRoot);
    this.lifecycleManager = new AgentLifecycleManager(
      dataDir,
      this.configManager,
      this.llmService ?? undefined,
      this.toolRegistry
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 统一配置
  // ═══════════════════════════════════════════════════════════════════════════

  updateLLMConfig(config: LLMConfig): void {
    if (this.llmService) {
      this.llmService.updateConfig(config);
    } else if (config.enabled) {
      this.llmService = new LLMService(config);
    }
    if (!config.enabled) {
      this.llmService = null;
    }
    this.configManager.setLLMConfig(config);
  }

  setProjectRoot(root: string): void {
    const resolvedRoot = path.resolve(root);
    this.projectRoot = resolvedRoot;
    void this.mcpManager.setProjectRoot(resolvedRoot);
    this.configManager.setProjectRoot(resolvedRoot);
    this.fileOperations.setProjectRoot(resolvedRoot);
    this.lifecycleManager.reinitializeToolRegistry();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 对话管理
  // ═══════════════════════════════════════════════════════════════════════════

  createConversation(title?: string): Conversation {
    return this.store.create(title);
  }

  getConversation(id: string): Conversation | null {
    return this.store.get(id);
  }

  listConversations(): ConversationSummary[] {
    return this.store.list();
  }

  deleteConversation(id: string): boolean {
    return this.store.delete(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MCP 管理
  // ═══════════════════════════════════════════════════════════════════════════

  async initMCP(): Promise<void> {
    if (this.mcpConfigService) {
      const enabledConfigs = this.mcpConfigService.getEnabledConfigs();
      if (enabledConfigs.length > 0) {
        await this.mcpManager.connectFromConfigs(enabledConfigs);
        return;
      }
    }
    const configPath = this.mcpManager.findPlaywrightConfig();
    if (configPath) {
      this.log.info('No MCP configs found, but playwright.config detected - using auto-detect fallback');
    }
  }

  async reconnectMCP(): Promise<void> {
    await this.mcpManager.disconnect();
    await this.initMCP();
  }

  async toggleMCPConnection(id: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const config = this.mcpConfigService?.getConfig(id);
      if (config) {
        await this.mcpManager.connectFromConfig(config);
      }
    } else {
      await this.mcpManager.disconnectServer(id);
    }
  }

  getMCPStatus() {
    return this.mcpManager.getStatus();
  }

  getAllTools(): { name: string; description: string; source: 'builtin' | 'mcp' }[] {
    const builtin = this.toolRegistry.getToolNames().map((name) => {
      const schemas = this.toolRegistry.getToolSchemas();
      const schema = schemas.find((s) => s.function.name === name);
      return {
        name,
        description: schema?.function.description || '',
        source: 'builtin' as const,
      };
    });
    const mcp = this.mcpManager.listTools().map((tool) => ({
      name: `mcp__${tool.name}`,
      description: tool.description || '',
      source: 'mcp' as const,
    }));
    return [...builtin, ...mcp];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 智能对话（sendMessage — 核心整合点）
  // ═══════════════════════════════════════════════════════════════════════════

  async sendMessage(
    conversationId: string,
    userMessage: string,
    onEvent: (event: SSEEvent) => void
  ): Promise<void> {
    if (!this.llmService) {
      onEvent({ type: 'error', data: 'LLM 未配置，请先配置 LLM 连接信息' });
      return;
    }

    this.store.addMessage(conversationId, {
      role: 'user',
      content: userMessage,
    });

    const conversation = this.store.get(conversationId);
    if (!conversation) {
      onEvent({ type: 'error', data: '会话不存在' });
      return;
    }

    const systemPrompt = this.buildSystemPrompt();
    const tools = this.getAllToolSchemas();

    try {
      const stream = this.llmService.chatWithAgentLoopStream(
        { system: systemPrompt, user: userMessage },
        this.llmService.getConfig(),
        tools.length > 0 ? tools : undefined,
        undefined,
        async (toolName, args) => {
          const toolResult = await this.executeTool(toolName, args);

          this.store.addMessage(conversationId, {
            role: 'tool_call',
            content: `调用工具: ${toolName}`,
            toolCall: { name: toolName, arguments: JSON.stringify(args) },
          });

          this.store.addMessage(conversationId, {
            role: 'tool_result',
            content: toolResult,
            toolResult: { toolCallId: '', name: toolName, success: true },
          });

          return toolResult;
        }
      );

      let fullContent = '';

      for await (const event of stream) {
        if (event.type === 'token') {
          fullContent += event.data;
          onEvent({ type: 'token', data: event.data });
        } else if (event.type === 'thinking') {
          onEvent({ type: 'thinking', data: { content: event.data } });
        } else if (event.type === 'tool_call') {
          onEvent({
            type: 'tool_call',
            data: { name: event.data.name, arguments: event.data.arguments },
          });
        } else if (event.type === 'tool_result') {
          onEvent({
            type: 'tool_result',
            data: { name: event.data.name, result: event.data.result },
          });
        } else if (event.type === 'done') {
          this.store.addMessage(conversationId, {
            role: 'assistant',
            content: event.data.content || fullContent,
            thinkingContent: event.data.thinkingContent || undefined,
          });

          if (conversation.messages.length <= 1) {
            const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
            this.store.updateTitle(conversationId, title);
          }

          onEvent({
            type: 'done',
            data: {
              content: event.data.content || fullContent,
              thinkingContent: event.data.thinkingContent,
              analysisMode: event.data.analysisMode,
              reasoningSteps: event.data.reasoningSteps,
              totalUsage: event.data.totalUsage,
            },
          });
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.log.warn(`Chat message failed: ${errorMsg}`);
      onEvent({ type: 'error', data: errorMsg });
    }
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [
      '你是 yuantest-playwright 的智能助手，专门帮助用户进行 Playwright 测试相关的工作。',
      '',
      '你可以帮助用户：',
      '- 生成测试计划（描述测试场景，你会自动调用 planner 生成结构化计划）',
      '- 生成测试代码（根据测试计划生成 Playwright 测试文件）',
      '- 修复失败的测试（分析错误原因并生成修复补丁）',
      '- 浏览器自动化操作（通过 Playwright MCP 工具操作浏览器）',
      '- 读取和搜索代码库',
      '- 运行测试并分析结果',
      '- 查看修复历史',
      '- 列出已有的测试计划',
      '',
    ];

    const builtinTools = this.toolRegistry.getToolNames();
    if (builtinTools.length > 0) {
      parts.push('内置工具:');
      for (const name of builtinTools) {
        const schemas = this.toolRegistry.getToolSchemas();
        const schema = schemas.find((s) => s.function.name === name);
        if (schema) {
          parts.push(`- ${name}: ${schema.function.description}`);
        }
      }
      parts.push('');
    }

    const mcpSchemas = this.mcpManager.getToolSchemas();
    if (mcpSchemas.length > 0) {
      const serverGroups = new Map<string, { name: string; tools: string[] }>();
      for (const schema of mcpSchemas) {
        const match = schema.function.name.match(/^mcp__(.+?)__(.+)$/);
        if (match) {
          const serverName = match[1];
          const _toolName = match[2];
          if (!serverGroups.has(serverName)) {
            serverGroups.set(serverName, { name: serverName, tools: [] });
          }
          (serverGroups.get(serverName) as { name: string; tools: string[] }).tools.push(
            `- ${schema.function.name}: ${schema.function.description}`
          );
        }
      }
      for (const [, group] of serverGroups) {
        parts.push(`MCP 工具 (${group.name}):`);
        parts.push(...group.tools);
        parts.push('');
      }
    }

    parts.push('请根据用户的描述，自动选择合适的工具来完成任务。如果需要多个步骤，请逐步执行。');
    parts.push('');
    parts.push('## 任务拆分');
    parts.push('对于复杂问题，请先分析任务，将复杂任务拆分为多个子任务，并使用任务列表格式展示：');
    parts.push('- [ ] 待完成的子任务');
    parts.push('- [x] 已完成的子任务');
    parts.push('在执行过程中，逐步将已完成的子任务标记为 [x]，让用户可以清晰追踪进度。');

    return parts.join('\n');
  }

  /**
   * 统一工具执行器 — 同时处理 MCP 工具、ToolRegistry 工具和 Agent 管线工具。
   * 这是真正的合并点：chat 和 agent 的所有能力都在同一个方法中路由。
   */
  private async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    // 1) MCP 工具
    if (toolName.startsWith('mcp__')) {
      return this.mcpManager.callTool(toolName, args);
    }

    // 2) Agent 管线工具 — 直接调用 this 上的方法，无需经过 ToolRegistry
    if (toolName === 'agent_plan') {
      const result = await this.plan(
        String(args.description),
        {
          seedTest: args.seedTest as string | undefined,
          prdPath: args.prdPath as string | undefined,
          outputDir: args.outputDir as string | undefined,
        }
      );
      return JSON.stringify(result, null, 2);
    }

    if (toolName === 'agent_generate') {
      const result = await this.generate(
        String(args.planPath),
        { outputDir: args.outputDir as string | undefined }
      );
      return JSON.stringify(result, null, 2);
    }

    if (toolName === 'agent_heal') {
      const result = await this.heal(
        String(args.testFilePath),
        {
          error: args.error as string | undefined,
          stackTrace: args.stackTrace as string | undefined,
        }
      );
      return JSON.stringify(result, null, 2);
    }

    if (toolName === 'agent_get_heal_history') {
      const result = await this.getHealHistory();
      return JSON.stringify(result, null, 2);
    }

    if (toolName === 'agent_list_plans') {
      const result = await this.listPlans();
      return JSON.stringify(result, null, 2);
    }

    // 3) ToolRegistry 内置工具
    if (this.toolRegistry.hasTool(toolName)) {
      return this.toolRegistry.executeTool(toolName, args);
    }

    return `Unknown tool: ${toolName}`;
  }

  private getAllToolSchemas(): ToolSchema[] {
    const builtinSchemas = this.toolRegistry.getToolSchemas();
    const mcpSchemas = this.mcpManager.getToolSchemas();

    // 追加 Agent 管线工具的 schema，使 LLM function calling 可见
    const agentSchemas: ToolSchema[] = [
      {
        type: 'function',
        function: {
          name: 'agent_plan',
          description: 'Generate a structured test plan from a feature description',
          parameters: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Feature description for test planning' },
              seedTest: { type: 'string', description: 'Reference seed test file path (optional)' },
              prdPath: { type: 'string', description: 'Product requirement document path (optional)' },
              outputDir: { type: 'string', description: 'Output directory for plans (optional)' },
            },
            required: ['description'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'agent_generate',
          description: 'Generate Playwright TypeScript test code from a test plan file',
          parameters: {
            type: 'object',
            properties: {
              planPath: { type: 'string', description: 'Path to the test plan Markdown file' },
              outputDir: { type: 'string', description: 'Output directory for generated test files (optional)' },
            },
            required: ['planPath'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'agent_heal',
          description: 'Analyze a failing test and generate fix patches',
          parameters: {
            type: 'object',
            properties: {
              testFilePath: { type: 'string', description: 'Path to the failing test file' },
              error: { type: 'string', description: 'Error message from the test failure (optional)' },
              stackTrace: { type: 'string', description: 'Stack trace from the test failure (optional)' },
            },
            required: ['testFilePath'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'agent_get_heal_history',
          description: 'Get the history of all heal operations',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
      {
        type: 'function',
        function: {
          name: 'agent_list_plans',
          description: 'List all generated test plans',
          parameters: { type: 'object', properties: {}, required: [] },
        },
      },
    ];

    return [...builtinSchemas, ...mcpSchemas, ...agentSchemas];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Agent 管线
  // ═══════════════════════════════════════════════════════════════════════════

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
      const root = this.fileOperations.getProjectRoot();
      const args = ['playwright', 'init-agents', `--loop=${loopTarget}`];
      this.log.info(`Running: npx ${args.join(' ')}`);
      execFile('npx', args, { cwd: root, shell: true }, (error, _stdout, _stderr) => {
        if (error) {
          this.log.error(`init-agents failed: ${error.message}`);
          reject(new Error(`init-agents failed: ${error.message}`));
          return;
        }
        const filesCreated: string[] = [];
        const githubDir = path.join(root, '.github');
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
          path.join(root, '.github', 'copilot-instructions.md'),
          path.join(root, '.github', 'instructions.md'),
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
    options?: { runId?: string; testId?: string; error?: string; stackTrace?: string }
  ): Promise<AgentResult<AgentHealResult>> {
    return this.pipelineOrchestrator.executeHeal(testFilePath, options);
  }

  async applyPatch(patch: HealerPatch): Promise<boolean> {
    return this.pipelineOrchestrator.applyPatch(patch);
  }

  async applyPatches(patches: HealerPatch[]): Promise<boolean[]> {
    return this.pipelineOrchestrator.applyPatches(patches);
  }

  async runPipeline(
    description: string,
    options?: { seedTest?: string; prdPath?: string; outputDir?: string; autoHeal?: boolean }
  ): Promise<AgentResult<AgentSessionContext>> {
    return this.pipelineOrchestrator.executePipeline(description, options);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Agent 配置
  // ═══════════════════════════════════════════════════════════════════════════

  setPrompts(prompts: Partial<AgentPrompts> | null): void {
    this.configManager.setPrompts(prompts);
  }

  setBrowserSessionManager(manager: BrowserSessionManager | null): void {
    this.configManager.setBrowserSessionManager(manager);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // 历史 & 计划查询
  // ═══════════════════════════════════════════════════════════════════════════

  async getHealHistory(): Promise<AgentHealResult[]> {
    return this.historyManager.getHealHistory();
  }

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

  createSessionContext(): AgentSessionContext {
    return this.sessionManager.createSession();
  }
}
