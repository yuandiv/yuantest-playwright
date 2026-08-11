import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { logger } from '@yuantest/core';
import { LLMService, type ToolSchema } from './agents/llm-service';
import { ToolRegistry } from './agents/tool-registry';
import { MCPClientManager } from './mcp/client-manager';
import { MCPConfigService } from './mcp/config-service';
import { MCPService } from './mcp/mcp-service';
import {
  ConversationStore,
  type Conversation,
  type ConversationSummary,
} from './chat/conversation-store';
import type { LLMConfig, AIDiagnosis, ITestExecutor } from '@yuantest/contracts';
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
} from '@yuantest/contracts';
import { AgentOutputParser } from './agents/output-parser';
import { AgentConfigManager } from './agents/agent-config-manager';
import { AgentLifecycleManager } from './agents/agent-lifecycle-manager';
import { AgentSessionManager } from './agents/agent-session-manager';
import { AgentFileOperations } from './agents/agent-file-operations';
import { createAgentGenerateTool } from './tools/agent/generate';
import { createAgentHealTool } from './tools/agent/heal';
import { createAgentExecuteTool } from './tools/agent/execute';
import { createAgentDiagnoseTool } from './tools/agent/diagnose';
import type { AgentToolContext } from './tools/agent/types';
import { AGENT_EVENT } from './agents/agent-events';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SSEEvent {
  type:
    | 'token'
    | 'tool_call'
    | 'tool_running'
    | 'tool_result'
    | 'thinking'
    | 'done'
    | 'error'
    // 事件桥接：agent.* 总线事件投影（HITL / 持久化等）
    | 'interrupt'
    | 'continue'
    | 'agent_persist';
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
  private mcpService: MCPService;

  // ── Agent 子模块 ──────────────────────────────────────────────────────────
  private configManager: AgentConfigManager;
  private lifecycleManager: AgentLifecycleManager;
  private sessionManager: AgentSessionManager;
  private fileOperations: AgentFileOperations;

  // ── 共享 ──────────────────────────────────────────────────────────────────
  private toolRegistry: ToolRegistry;
  private llmService: LLMService | null = null;
  private executor: ITestExecutor | null = null;
  private dataDir: string;
  private projectRoot: string;
  private log = logger.child('UnifiedAIService');
  /**
   * Phase D — 事件流与可观测性：公共 Agent 事件总线。
   * sendMessage 调用 chatWithAgentLoopStream 时注入此总线，
   * UI / 路由层可通过 on() 订阅 agent.* 统一事件命名，
   * 不再耦合 onEvent 回调的散乱事件类型。
   */
  private agentEventBus = new EventEmitter();
  /**
   * 会话级互斥锁：同一 conversation 的 sendMessage 串行执行，
   * 避免并发读-改-写 ConversationStore 造成消息丢失/覆盖。
   * key = conversationId，value = 该会话当前请求链的 gate promise。
   */
  private conversationLocks = new Map<string, Promise<void>>();

  constructor(
    dataDir: string,
    projectRoot: string,
    toolRegistry: ToolRegistry,
    llmConfig?: LLMConfig,
    sharedLLMService?: LLMService,
    mcpConfigService?: MCPConfigService,
    sharedMCPClientManager?: MCPClientManager,
    agentConfig?: Partial<AgentConfig>,
    sharedToolRegistry?: ToolRegistry,
    executor?: ITestExecutor
  ) {
    this.dataDir = dataDir;
    this.projectRoot = projectRoot;
    this.toolRegistry = sharedToolRegistry || toolRegistry;
    this.executor = executor ?? null;

    // 初始化 Chat 子模块
    this.store = new ConversationStore(dataDir);
    // MCP 管理委托给 MCPService（连接/状态/工具/配置）
    this.mcpService = new MCPService(projectRoot, mcpConfigService, sharedMCPClientManager);

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
      executor: this.executor,
      heal: (filePath, opts) => this.heal(filePath, opts),
    };

    // 仅当执行器已注入时才注册 agent_execute；未注入时不注册，
    // 避免 LLM 调用后才收到"执行器未配置"（可用性显式化）
    const agentTools: Array<{ name: string } & import('./tools/types').ToolDefinition> = [
      { name: 'agent_generate', ...createAgentGenerateTool(ctx) },
      { name: 'agent_heal', ...createAgentHealTool(ctx) },
      { name: 'agent_diagnose', ...createAgentDiagnoseTool(ctx) },
    ];
    if (this.executor) {
      agentTools.push({ name: 'agent_execute', ...createAgentExecuteTool(ctx) });
    }
    // 注意：request_user_input（HITL interrupt/continue）不在聊天轨注册——
    // 前端 SSE 通道无 interrupt/continue 事件处理，注册会导致 LLM 调用后永久悬挂。
    // 聊天有输入框，需要澄清时 LLM 直接在正文追问即可；该工具仅用于管线轨（如 healer 补丁审批）。
    this.toolRegistry.registerTools(agentTools);
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
    void this.mcpService.getManager().setProjectRoot(resolvedRoot);
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
    await this.mcpService.initMCP();
  }

  async reconnectMCP(): Promise<void> {
    await this.mcpService.reconnectMCP();
  }

  async toggleMCPConnection(id: string, enabled: boolean): Promise<void> {
    await this.mcpService.toggleMCPConnection(id, enabled);
  }

  getMCPStatus() {
    return this.mcpService.getMCPStatus();
  }

  getAllTools(): { name: string; description: string; source: 'builtin' | 'mcp' }[] {
    const schemas = this.toolRegistry.getToolSchemas();
    const builtin = schemas.map((s) => ({
      name: s.function.name,
      description: s.function.description,
      source: 'builtin' as const,
    }));
    const mcp = this.mcpService.listTools().map((tool) => ({
      name: `mcp__${tool.name}`,
      description: tool.description || '',
      source: 'mcp' as const,
    }));
    return [...builtin, ...mcp];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 智能对话（sendMessage — 核心整合点）
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 会话级互斥执行：同一 key（conversationId）的请求串行执行。
   * 后到的请求 await 前一请求的 gate promise，前序完成后释放。
   */
  private async runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.conversationLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prev.then(() => gate);
    this.conversationLocks.set(key, chain);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      // 若没有后续排队请求（Map 中仍是本请求的 chain），清理避免泄漏
      queueMicrotask(() => {
        if (this.conversationLocks.get(key) === chain) {
          this.conversationLocks.delete(key);
        }
      });
    }
  }

  async sendMessage(
    conversationId: string,
    userMessage: string,
    onEvent: (event: SSEEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    // 会话级互斥：同一会话的并发请求串行执行，避免 store 读-改-写竞争
    await this.runExclusive(conversationId, () =>
      this.doSendMessage(conversationId, userMessage, onEvent, signal)
    );
  }

  private async doSendMessage(
    conversationId: string,
    userMessage: string,
    onEvent: (event: SSEEvent) => void,
    signal?: AbortSignal
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

    // 简单对话（问候/闲聊）不传工具、使用精简 prompt，降低首字延迟
    const needsTools = this.needsTools(userMessage, historyMessages);
    const systemPrompt = this.buildSystemPrompt(needsTools);
    const tools = needsTools ? this.getAllToolSchemas() : undefined;

    try {
      // ── 事件桥接：将 agent.* 总线事件投影为 SSE 事件 ──
      // stream 已通过 onEvent 转发 token/thinking/tool_call/tool_result/done；
      // 此处桥接 stream 未覆盖的 HITL / 持久化事件（interrupt/continue/persist），
      // 使前端可订阅 interrupt/citations 等 Phase D 能力。
      const bridgeListeners: Array<[string, (payload: unknown) => void]> = [
        [AGENT_EVENT.INTERRUPT, (payload) => onEvent({ type: 'interrupt', data: payload })],
        [AGENT_EVENT.CONTINUE, (payload) => onEvent({ type: 'continue', data: payload })],
        [AGENT_EVENT.PERSIST, (payload) => onEvent({ type: 'agent_persist', data: payload })],
      ];
      for (const [eventName, listener] of bridgeListeners) {
        this.agentEventBus.on(eventName, listener);
      }

      try {
        const stream = this.llmService.chatWithAgentLoopStream(
          { system: systemPrompt, user: userMessage, history: llmHistory },
          this.llmService.getConfig(),
          tools && tools.length > 0 ? tools : undefined,
          undefined,
          async (toolName, args) => {
            const toolResult = await this.executeTool(toolName, args);
            // 生成本地 tool_call_id 用于关联 tool_call 和 tool_result
            const localToolCallId = `tc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            this.store.addMessage(conversationId, {
              role: 'tool_call',
              content: `调用工具: ${toolName}`,
              // 保存 tool_call_id，供历史重建（buildLLMHistory）时关联 tool_result，
              // 并在 assistant 消息中声明 tool_calls，避免 tool 消息 tool_call_id 悬空
              toolCall: { name: toolName, arguments: JSON.stringify(args), id: localToolCallId },
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
          conversationId,
          signal
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
        } else if (event.type === 'tool_running') {
          // 工具执行中状态（嵌套调用可能长时间无 token，前端据此显示"执行中"）
          onEvent({ type: 'tool_running', data: { name: event.data.name } });
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
      } finally {
        // 无论成功/失败，退订事件桥接监听器，避免泄漏
        for (const [eventName, listener] of bridgeListeners) {
          this.agentEventBus.off(eventName, listener);
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
        const nextMsg = i + 1 < messages.length ? messages[i + 1] : null;
        if (nextMsg && nextMsg.role === 'tool_call' && nextMsg.toolCall) {
          // 保留 tool_calls 声明（而非合并为纯文本），
          // 使后续 tool 消息的 tool_call_id 有对应声明，避免多轮会话恢复时被 API 拒绝
          const toolResultMsg = i + 2 < messages.length ? messages[i + 2] : null;
          const toolCallId =
            nextMsg.toolCall.id ||
            toolResultMsg?.toolResult?.toolCallId ||
            `tc_legacy_${Date.now()}_${history.length}`;
          history.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: [
              {
                id: toolCallId,
                type: 'function',
                function: {
                  name: nextMsg.toolCall.name,
                  arguments: nextMsg.toolCall.arguments,
                },
              },
            ],
          });
          i += 2;
        } else {
          history.push({ role: 'assistant', content: msg.content });
          i++;
        }
      } else if (msg.role === 'tool_call' && msg.toolCall) {
        // 独立的 tool_call（无前置 assistant 消息，兼容旧数据）：
        // 生成带 tool_calls 声明的 assistant 消息，保证 tool 消息 id 有对应声明
        const toolResultMsg = i + 1 < messages.length ? messages[i + 1] : null;
        const toolCallId =
          msg.toolCall.id ||
          toolResultMsg?.toolResult?.toolCallId ||
          `tc_legacy_${Date.now()}_${history.length}`;
        history.push({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: toolCallId,
              type: 'function',
              function: {
                name: msg.toolCall.name,
                arguments: msg.toolCall.arguments,
              },
            },
          ],
        });
        i++;
      } else if (msg.role === 'tool_result' && msg.toolResult) {
        const truncatedResult =
          msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...(截断)' : msg.content;
        // 与 tool_call 存储的 id（同一 localToolCallId）保持一致；
        // 旧数据缺失时兜底生成
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

  /**
   * 判断当前消息是否需要启用工具：
   * - 会话历史中已有工具调用（说明处于探索/执行流程中）→ 需要工具
   * - 消息含 URL / 测试 / 分析等任务关键词 → 需要工具
   * - 纯问候 / 闲聊 → 不需要工具（走精简 prompt，加快响应）
   */
  private needsTools(
    userMessage: string,
    history: import('./chat/conversation-store').ChatMessage[]
  ): boolean {
    if (history.some((m) => m.role === 'tool_call' || m.role === 'tool_result')) {
      return true;
    }
    if (/https?:\/\/|localhost:\d+|127\.0\.0\.1/i.test(userMessage)) {
      return true;
    }
    return /测试|分析|生成|调试|修复|执行|运行|探索|导航|页面|浏览器|选择器|用例|计划|自愈|诊断|spec|playwright|report/i.test(
      userMessage
    );
  }

  private buildSystemPrompt(includeTools: boolean = true): string {
    if (!includeTools) {
      return [
        '你是一个 Playwright 测试助手。你的任务是帮助用户分析页面、生成测试计划和测试代码。',
        '',
        '当前为简单对话模式：请直接、简洁地回答用户的问题。',
        '如果用户提出测试、分析、调试等任务，引导其提供页面 URL 或功能描述。',
      ].join('\n');
    }

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
      '## 重要：生成测试计划 ≠ 调用 agent_generate',
      '当用户说"生成测试计划"时，指的是生成计划文档（先探索页面，再输出 Markdown 测试计划）。',
      'agent_generate 工具的用途是：把一份【已经存在的】测试计划内容转换为 Playwright 测试代码文件，',
      '不是用于生成计划本身。因此：',
      '- 用户要求"生成测试计划 / 测试计划文档 / 测试方案"时：先浏览器探索页面，再直接以 Markdown 输出计划；',
      '  如果用户要求 Word 文档，再用 mcp__docx-forge-mcp__create_document 导出 .docx。',
      '- 仅当用户要求"把计划转成测试代码 / 生成测试脚本 / 写测试用例代码"时，才调用 agent_generate。',
      '',
      '',
      '## 复杂任务拆解（必须遵守）',
      '当任务包含多个功能点、页面或子目标时，严禁一次性笼统回答。必须：',
      '1. 先输出任务拆解清单，每项一行，格式：',
      '   [T1] <子任务描述> — 验收标准：<可验证的结果>',
      '   [T2] <子任务描述> — 验收标准：<可验证的结果>',
      '2. 然后逐项执行（探索/分析/调用工具）；每完成一项，明确标注 "[T1] 完成 ✓"',
      '3. 全部完成后，对照清单逐项汇总，给出完整、结构化的最终答案',
      '4. 若某项无法完成，明确说明原因与已获取的部分结果，不掩盖不跳过',
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
      '当用户要求将测试计划输出为 Word 文档（.docx）时，请调用 mcp__docx-forge-mcp__create_document 工具',
      '（参数：title 文档标题、content 为 Markdown 格式的测试计划内容、outputPath 输出 .docx 文件路径），',
      '并在回复中告知用户文件保存路径；不要只输出计划文本而跳过导出。',
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
      return this.mcpService.callTool(toolName, args);
    }
    return this.toolRegistry.executeTool(toolName, args);
  }

  private getAllToolSchemas(): ToolSchema[] {
    const builtinSchemas = this.toolRegistry.getToolSchemas();
    const mcpSchemas = this.mcpService.getToolSchemas();
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
}
