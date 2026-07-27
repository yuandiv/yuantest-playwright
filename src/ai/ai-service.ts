import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../logger';
import { LLMService, type ToolSchema } from './agents/llm-service';
import { ToolRegistry } from './agents/tool-registry';
import { MCPClientManager } from './mcp/client-manager';
import { MCPConfigService } from './mcp/config-service';
import {
  ConversationStore,
  type Conversation,
  type ConversationSummary,
} from './chat/conversation-store';
import type { LLMConfig, AIDiagnosis } from '../types';
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
import { AgentOutputParser } from './agents/output-parser';
import { AgentConfigManager } from './agents/agent-config-manager';
import { AgentLifecycleManager } from './agents/agent-lifecycle-manager';
import { AgentSessionManager } from './agents/agent-session-manager';
import { AgentFileOperations } from './agents/agent-file-operations';
import { createAgentGenerateTool } from './tools/agent/generate';
import { createAgentHealTool } from './tools/agent/heal';
import { createAgentExecuteTool } from './tools/agent/execute';
import { createAgentDiagnoseTool } from './tools/agent/diagnose';
import { createRequestUserInputTool } from './tools/builtin/request-user-input';
import type { AgentToolContext } from './tools/agent/types';
import { AGENT_EVENT } from './agents/agent-events';

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
  private fileOperations: AgentFileOperations;

  // ── 共享 ──────────────────────────────────────────────────────────────────
  private toolRegistry: ToolRegistry;
  private llmService: LLMService | null = null;
  private dataDir: string;
  private projectRoot: string;
  private log = logger.child('UnifiedAIService');
  private _agentGenerateTriggered = false;
  /**
   * Phase D — 事件流与可观测性：公共 Agent 事件总线。
   * sendMessage 调用 chatWithAgentLoopStream 时注入此总线，
   * UI / 路由层可通过 on() 订阅 agent.* 统一事件命名，
   * 不再耦合 onEvent 回调的散乱事件类型。
   */
  private agentEventBus = new EventEmitter();

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
    } else if (llmConfig) {
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
    this.configManager.loadProjectContext();

    // 将 Agent 管线工具注册到共享 ToolRegistry（取代旧的独立 agentTools Map）
    this.registerAgentTools();
  }

  private registerAgentTools(): void {
    // 从 lifecycleManager 获取共享的 DiagnosisAgent（避免缓存失效）
    const diagnosisAgent = this.lifecycleManager?.getDiagnosis() ?? null;

    const ctx: AgentToolContext = {
      dataDir: this.dataDir,
      projectRoot: this.projectRoot,
      llmService: this.llmService,
      toolRegistry: this.toolRegistry,
      diagnosisAgent,
      setGenerateTriggered: (v) => {
        this._agentGenerateTriggered = v;
      },
      heal: (filePath, opts) => this.heal(filePath, opts),
    };

    this.toolRegistry.registerTools([
      { name: 'agent_generate', ...createAgentGenerateTool(ctx) },
      { name: 'agent_heal', ...createAgentHealTool(ctx) },
      { name: 'agent_execute', ...createAgentExecuteTool(ctx) },
      { name: 'agent_diagnose', ...createAgentDiagnoseTool(ctx) },
      {
        name: 'request_user_input',
        ...createRequestUserInputTool(diagnosisAgent ?? undefined),
      },
    ]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 统一配置
  // ═══════════════════════════════════════════════════════════════════════════

  updateLLMConfig(config: LLMConfig): void {
    if (config.enabled) {
      if (this.llmService) {
        this.llmService.updateConfig(config);
      } else {
        this.llmService = new LLMService(config);
      }
    } else {
      this.llmService = null;
    }
    this.configManager.setLLMConfig(config);

    // 重新注册 agent 工具，确保工具 ctx 中的 llmService 与 this.llmService 同步
    // 否则启动时 llmService 为 null 的场景下，工具闭包会一直持有过期的 null 引用
    this.registerAgentTools();
  }

  /**
   * 统一 LLM 连接状态查询
   *
   * 返回：{ configured, connected, status: 'green' | 'yellow' | 'red' }
   * - green:  已配置且连接成功
   * - yellow: 已配置但连接失败
   * - red:    未配置或未启用
   */
  async getLLMConnectionStatus(): Promise<{
    configured: boolean;
    connected: boolean;
    status: 'green' | 'yellow' | 'red';
  }> {
    const config = this.configManager.getLLMConfig();
    if (!config || !config.enabled || !config.baseUrl || !config.model) {
      return { configured: false, connected: false, status: 'red' };
    }
    if (!this.llmService) {
      return { configured: true, connected: false, status: 'red' };
    }
    try {
      const result = await this.llmService.validateConnection();
      return {
        configured: true,
        connected: result.success,
        status: result.success ? 'green' : 'yellow',
      };
    } catch {
      return { configured: true, connected: false, status: 'yellow' };
    }
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
    const schemas = this.toolRegistry.getToolSchemas();
    const builtin = schemas.map((s) => ({
      name: s.function.name,
      description: s.function.description,
      source: 'builtin' as const,
    }));
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
          // 生成本地 tool_call_id 用于关联 tool_call 和 tool_result
          const localToolCallId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

          this.store.addMessage(conversationId, {
            role: 'tool_call',
            content: `调用工具: ${toolName}`,
            toolCall: { name: toolName, arguments: JSON.stringify(args) },
          });

          this.store.addMessage(conversationId, {
            role: 'tool_result',
            content: toolResult,
            toolResult: { toolCallId: localToolCallId, name: toolName, success: true },
          });

          return toolResult;
        },
        undefined, // responseFormat
        undefined, // maxToolCalls（用默认值）
        // Phase D — 注入公共事件总线，供 UI/路由层订阅 agent.* 事件
        this.agentEventBus,
        conversationId
      );

      let roundContent = '';
      let roundThinking = '';

      for await (const event of stream) {
        if (event.type === 'token') {
          roundContent += event.data;
          onEvent({ type: 'token', data: event.data });
        } else if (event.type === 'thinking') {
          roundThinking += event.data;
          onEvent({ type: 'thinking', data: { content: event.data } });
        } else if (event.type === 'tool_call') {
          // 在工具调用前，存储本轮的中间 assistant 消息（思考过程+内容）
          // 使存储结构与流式展示结构一致
          // 注意：roundContent 中可能含有 <think> 标签（某些 LLM 将思考过程混在 content 中发送），
          // 此处需要清理，避免前端渲染时与 thinkingContent 双重显示
          if (roundContent || roundThinking) {
            const cleanContent = roundContent
              ? roundContent.replace(/<think[\s\S]*?<\/think>/g, '').trim()
              : '';
            this.store.addMessage(conversationId, {
              role: 'assistant',
              content: cleanContent || '',
              thinkingContent: roundThinking || undefined,
            });
          }
          roundContent = '';
          roundThinking = '';

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
          const finalContent =
            event.data.content || roundContent.replace(/<think[\s\S]*?<\/think>/g, '').trim();

          this.store.addMessage(conversationId, {
            role: 'assistant',
            content: finalContent,
            thinkingContent: roundThinking || undefined,
          });

          if (conversation.messages.length <= 1) {
            const title = userMessage.slice(0, 30) + (userMessage.length > 30 ? '...' : '');
            this.store.updateTitle(conversationId, title);
          }

          // 如果本轮触发了 agent_generate，从 LLM 最终回复中提取代码保存到文件
          if (this._agentGenerateTriggered && finalContent) {
            try {
              const savedFiles = this.saveGeneratedCodeFromResponse(finalContent);
              if (savedFiles.length > 0) {
                onEvent({
                  type: 'token',
                  data: `\n\n✅ 测试代码已保存到以下文件：\n${savedFiles.map((f) => `  - ${f}`).join('\n')}`,
                });
              }
            } catch (err) {
              this.log.warn(
                `Failed to save generated code: ${err instanceof Error ? err.message : String(err)}`
              );
            }
            this._agentGenerateTriggered = false;
          }

          onEvent({
            type: 'done',
            data: {
              content: finalContent,
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
    messages: import('./chat/conversation-store').ChatMessage[]
  ): import('./agents/llm-service').LLMChatMessage[] {
    const history: import('./agents/llm-service').LLMChatMessage[] = [];
    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];
      if (msg.role === 'user') {
        history.push({ role: 'user', content: msg.content });
        i++;
      } else if (msg.role === 'assistant') {
        // 检查下一条是否是 tool_call（中间 assistant + tool_call 模式）
        // 合并为一条 assistant 消息，避免连续 assistant 消息
        const nextMsg = i + 1 < messages.length ? messages[i + 1] : null;
        if (nextMsg && nextMsg.role === 'tool_call' && nextMsg.toolCall) {
          const combinedContent = msg.content
            ? `${msg.content}\n\n[调用工具: ${nextMsg.toolCall.name}] 参数: ${nextMsg.toolCall.arguments}`
            : `[调用工具: ${nextMsg.toolCall.name}] 参数: ${nextMsg.toolCall.arguments}`;
          history.push({ role: 'assistant', content: combinedContent });
          i += 2;
        } else {
          history.push({ role: 'assistant', content: msg.content });
          i++;
        }
      } else if (msg.role === 'tool_call' && msg.toolCall) {
        // 独立的 tool_call（无前置 assistant 消息，兼容旧数据）
        history.push({
          role: 'assistant',
          content: `[调用工具: ${msg.toolCall.name}] 参数: ${msg.toolCall.arguments}`,
        });
        i++;
      } else if (msg.role === 'tool_result' && msg.toolResult) {
        const truncatedResult =
          msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...(截断)' : msg.content;
        const toolCallId = msg.toolResult.toolCallId || `tc_legacy_${Date.now()}`;
        history.push({
          role: 'tool',
          content: truncatedResult,
          tool_call_id: toolCallId,
        });
        i++;
      } else {
        i++;
      }
    }
    return history;
  }

  private buildSystemPrompt(): string {
    const parts: string[] = [
      '你是一个 Playwright 测试助手。你的任务是帮助用户分析页面、生成测试计划和测试代码。',
      '',
      '## 工作方式',
      '1. 当用户要求分析页面时，使用可用的浏览器工具导航到目标页面',
      '2. 使用 snapshot 工具获取页面结构和可见内容',
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
      '## Agent 工具使用提示',
      '可用工具列在下方。浏览器类工具（如 browser_navigate / browser_snapshot / browser_click）用于页面探索；',
      'agent_ 前缀的工具用于测试生命周期管理。在选择器选择时注意：',
      'snapshot 中显示的 e1, e12 等编号是内部引用 ID，不能用作 selector，必须使用 text= / css= / xpath= 语法。',
      '',
    ];

    const schemas = this.toolRegistry.getToolSchemas();
    if (schemas.length > 0) {
      parts.push('可用工具:');
      for (const s of schemas) {
        parts.push(`- ${s.function.name}: ${s.function.description}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * 统一工具执行器 — MCP 工具走 mcpManager，其余统一走 ToolRegistry。
   * Agent 工具已注册到 ToolRegistry 中，无需独立 Map 查找。
   */
  private async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    if (toolName.startsWith('mcp__')) {
      return this.mcpManager.callTool(toolName, args);
    }
    return this.toolRegistry.executeTool(toolName, args);
  }

  private getAllToolSchemas(): ToolSchema[] {
    const builtinSchemas = this.toolRegistry.getToolSchemas();
    const mcpSchemas = this.mcpManager.getToolSchemas();
    return [...builtinSchemas, ...mcpSchemas];
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
      return {
        success: true,
        data: files,
        duration: Date.now() - startTime,
        agentType: 'generator',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'generator',
      };
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
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        agentType: 'healer',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Agent 配置
  // ═══════════════════════════════════════════════════════════════════════════

  setPrompts(prompts: Partial<AgentPrompts> | null): void {
    this.configManager.setPrompts(prompts);
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

  parseMarkdownPlan(filePath: string): TestPlan | null {
    return AgentOutputParser.parseMarkdownPlan(filePath);
  }

  createSessionContext(): AgentSessionContext {
    return this.sessionManager.createSession();
  }

  // ── Phase D — 事件流与可观测性 ─────────────────────────────────────────────

  /**
   * 订阅 Agent 事件总线（agent.* 统一事件命名）。
   *
   * UI / 路由 / 遥测层可通过此方法订阅，与 onEvent 回调解耦：
   * - `agent.start`     → Agent 主入口开始
   * - `agent.token`     → 流式 token 增量
   * - `agent.thinking`  → 思考内容增量
   * - `agent.tool_call` → 工具调用开始
   * - `agent.tool_result` → 工具调用返回
   * - `agent.message`   → 单次 LLM 调用完成
   * - `agent.persist`   → 结果落盘
   * - `agent.error`     → 执行错误
   * - `agent.done`      → Agent Loop 完成
   *
   * @param eventName 事件名（见 AGENT_EVENT 常量）
   * @param listener 事件载荷监听器
   * @returns unsubscribe 函数
   */
  on(eventName: string, listener: (payload: unknown) => void): () => void {
    this.agentEventBus.on(eventName, listener);
    return () => {
      this.agentEventBus.off(eventName, listener);
    };
  }

  /** 一次性订阅：触发一次后自动注销 */
  once(eventName: string, listener: (payload: unknown) => void): () => void {
    this.agentEventBus.once(eventName, listener);
    return () => {
      this.agentEventBus.off(eventName, listener);
    };
  }

  /** 暴露事件总线实例，供高级订阅者直接操作 */
  getAgentEventBus(): EventEmitter {
    return this.agentEventBus;
  }

  // ─── 代码提取与保存（agent_generate 后处理） ─────────────────────────────

  private saveGeneratedCodeFromResponse(responseText: string): string[] {
    const projectRoot = this.configManager.getConfig().projectRoot || process.cwd();
    const testDir = path.resolve(projectRoot, 'tests');
    return AgentOutputParser.saveGeneratedCode(responseText, testDir);
  }
}
