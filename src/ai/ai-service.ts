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
  AgentHealResult,
  AgentPrompts,
  AgentSessionContext,
  ProjectContext,
} from '../types';
import { AgentOutputParser } from '../agents/output-parser';
import { BrowserSessionManager } from '../agents/browser-session';
import { AgentConfigManager } from '../agents/agent-config-manager';
import { AgentLifecycleManager } from '../agents/agent-lifecycle-manager';
import { AgentSessionManager } from '../agents/agent-session-manager';
import { AgentHistoryManager } from '../agents/agent-history-manager';
import { HealerAgent } from '../agents/healer';
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
      this.log.info(
        'No MCP configs found, but playwright.config detected - using auto-detect fallback'
      );
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

    // Build conversation history for LLM context (all messages except the current user message)
    const historyMessages = conversation.messages.slice(0, -1);
    const llmHistory = this.buildLLMHistory(historyMessages);

    const systemPrompt = this.buildSystemPrompt();
    const tools = this.getAllToolSchemas();

    try {
      const stream = this.llmService.chatWithAgentLoopStream(
        { system: systemPrompt, user: userMessage, history: llmHistory },
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
              truncated: event.data.truncated,
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

  private buildLLMHistory(
    messages: import('../chat/conversation-store').ChatMessage[]
  ): import('../agents/llm-service').ChatMessage[] {
    const history: import('../agents/llm-service').ChatMessage[] = [];
    for (const msg of messages) {
      if (msg.role === 'user') {
        history.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        history.push({ role: 'assistant', content: msg.content });
      } else if (msg.role === 'tool_call' && msg.toolCall) {
        history.push({
          role: 'assistant',
          content: `[调用工具: ${msg.toolCall.name}] 参数: ${msg.toolCall.arguments}`,
        });
      } else if (msg.role === 'tool_result' && msg.toolResult) {
        const truncatedResult =
          msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...(截断)' : msg.content;
        history.push({
          role: 'user',
          content: `[工具 ${msg.toolResult.name} 返回]: ${truncatedResult}`,
        });
      }
    }
    return history;
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [
      '你是一个 Playwright 测试助手。你的任务是帮助用户分析页面、生成测试计划和测试代码。',
      '',
      '## 工作方式',
      '1. 当用户要求分析页面时，使用 browser_navigate 导航到目标页面',
      '2. 调用 browser_snapshot 获取页面结构和可见内容',
      '3. 分析 snapshot 内容，判断是否需要进一步探索：',
      '   - 如果有折叠区域（tab、手风琴、下拉菜单等），点击展开后再 snapshot',
      '   - 如果有模态框、弹窗、动态面板，触发后 snapshot',
      '   - 如果页面有明显未加载的区域（"加载中"占位符），等待后重试',
      '   - 如果用户指定了功能点但 snapshot 中看不到对应元素，需要进一步点击导航',
      '4. 当满足以下条件时，停止探索，直接输出结构化的测试计划：',
      '   - 已获取页面的主结构（导航、内容区、表单等主要区域）',
      '   - 已展开所有可见的折叠区域，看到完整 UI 结构',
      '   - 能清晰描述页面的核心功能和用户操作路径',
      '',
      '## 测试计划格式要求',
      '输出测试计划时，请遵循以下格式：',
      '- 以 "# 测试计划: <标题>" 开头',
      '- 覆盖以下场景类型（每种至少1个）：正向流程、异常流程、边界值测试、数据验证、状态转换',
      '- 每个场景以 "## 场景: <名称>" 开头',
      '- 每个场景包含多个步骤，步骤格式：序号. 操作描述（可附带输入值）',
      '- 每个场景最后列出预期结果，以 "- 结果描述" 格式',
      '- 测试步骤应描述具体的操作，例如"点击登录按钮"、"输入用户名"等',
      '',
      '## 浏览器操作指引',
      '- browser_navigate → 导航到目标页面',
      '- browser_snapshot → 获取页面结构和可见内容',
      '- browser_click → 点击元素，selector 必须使用 Playwright 支持的语法：',
      '    text=按钮文字  （按文本匹配）',
      '    css=.class-name  （CSS 选择器）',
      '    xpath=//button  （XPath）',
      '    注意：snapshot 中显示的 e1, e12 等编号是内部引用 ID，不能用作 selector！',
      '- 根据 snapshot 内容判断是否需要进一步探索（展开折叠、打开弹窗等）',
      '',
    ];

    const builtinTools = this.toolRegistry.getToolNames();
    if (builtinTools.length > 0) {
      parts.push('可用工具:');
      for (const name of builtinTools) {
        const schemas = this.toolRegistry.getToolSchemas();
        const schema = schemas.find((s) => s.function.name === name);
        if (schema) {
          parts.push(`- ${name}: ${schema.function.description}`);
        }
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * 统一工具执行器 — 同时处理 MCP 工具、ToolRegistry 工具和 Agent 管线工具。
   */
  private async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    // 1) MCP 工具
    if (toolName.startsWith('mcp__')) {
      return this.mcpManager.callTool(toolName, args);
    }

    // 2) Agent 管线工具 — 直接调用 this 上的方法，无需经过 ToolRegistry
    if (toolName === 'agent_generate') {
      const result = await this.generate(String(args.planContent), {
        outputDir: args.outputDir as string | undefined,
      });
      if (result.success && result.data) {
        const files = result.data.map((f) => `- ${f}`).join('\n');
        return `已生成 ${result.data.length} 个测试文件:\n${files}`;
      }
      return `错误: ${result.error || '未知错误'}`;
    }

    if (toolName === 'agent_heal') {
      const result = await this.heal(String(args.testFilePath), {
        error: args.error as string | undefined,
        stackTrace: args.stackTrace as string | undefined,
      });
      if (result.success && result.data) {
        if (result.data.healed) {
          const patches = result.data.patches.map((p) => `- ${p.reason}`).join('\n');
          return `测试已修复，共 ${result.data.patches.length} 处修改:\n${patches}`;
        }
        return `测试未能自动修复（已尝试 ${result.data.roundsUsed} 轮）。`;
      }
      return `错误: ${result.error || '未知错误'}`;
    }

    if (toolName === 'agent_get_heal_history') {
      const result = await this.getHealHistory();
      return `共 ${result.length} 条修复记录。`;
    }

    if (toolName === 'agent_list_plans') {
      const result = await this.listPlans();
      return `共 ${result.length} 个测试计划。`;
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
          name: 'agent_generate',
          description: 'Generate Playwright TypeScript test code from a test plan content',
          parameters: {
            type: 'object',
            properties: {
              planContent: { type: 'string', description: 'The test plan content in markdown format' },
              outputDir: {
                type: 'string',
                description: 'Output directory for generated test files (optional)',
              },
            },
            required: ['planContent'],
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
              error: {
                type: 'string',
                description: 'Error message from the test failure (optional)',
              },
              stackTrace: {
                type: 'string',
                description: 'Stack trace from the test failure (optional)',
              },
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

  async generate(
    planContent: string,
    options?: { outputDir?: string; seedTest?: string }
  ): Promise<AgentResult<string[]>> {
    const llmConfig = this.llmService?.getConfig();
    if (!llmConfig?.enabled) {
      return { success: false, error: 'LLM is not enabled', duration: 0, agentType: 'generator' };
    }
    const startTime = Date.now();
    try {
      const files = await this.lifecycleManager.getGenerator().generateTests(planContent, options);
      return { success: true, data: files, duration: Date.now() - startTime, agentType: 'generator' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), duration: Date.now() - startTime, agentType: 'generator' };
    }
  }

  async heal(
    testFilePath: string,
    options?: { runId?: string; testId?: string; error?: string; stackTrace?: string }
  ): Promise<AgentResult<AgentHealResult>> {
    const llmConfig = this.llmService?.getConfig();
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
