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
import type { LLMConfig, TestConfig, AIDiagnosis } from '../types';
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
import { HealerAgent } from '../agents/healer';
import { AgentFileOperations } from '../agents/agent-file-operations';
import { Executor } from '../executor';
import { DiagnosisService } from '../diagnosis';

/** Agent 管线工具定义：schema + handler 成对注册 */
interface AgentToolDef {
  schema: ToolSchema;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

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
  private agentTools!: Map<string, AgentToolDef>;

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
    this.configManager.loadProjectContext();

    // 初始化 Agent 管线工具（schema + handler 统一注册至此 Map）
    this.initAgentTools();
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
          const finalContent = event.data.content || roundContent.replace(/<think[\s\S]*?<\/think>/g, '').trim();

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
    messages: import('../chat/conversation-store').ChatMessage[]
  ): import('../agents/llm-service').ChatMessage[] {
    const history: import('../agents/llm-service').ChatMessage[] = [];
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
        history.push({
          role: 'user',
          content: `[工具 ${msg.toolResult.name} 返回]: ${truncatedResult}`,
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
      '## Agent 操作能力',
      '除了浏览器操作，你还可以使用以下 Agent 工具管理测试生命周期：',
      '- agent_execute: 执行测试并返回通过/失败统计。当用户要求"运行测试"、"跑一下"时使用。',
      '  - 可指定 testDir（测试目录）、grep（用例名过滤）、timeout（超时）',
      '  - 返回结果包含通过数、失败数、测试耗时',
      '  - 如果有失败用例，建议主动调用 agent_diagnose 分析原因',
      '- agent_diagnose: AI 诊断测试失败原因。当用户问"为什么失败"时，或 agent_execute 返回失败后主动使用。',
      '  - 需要 title（测试名称）和 error（错误信息）',
      '  - 返回根因分析、修复建议、置信度',
      '  - 置信度低于 50% 时，应提示用户人工复核',
      '- agent_generate: 根据测试计划生成 Playwright TypeScript 测试代码',
      '- agent_heal: 分析失败的测试并生成修复补丁',
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

    // 2) Agent 管线工具 — 从 Map 中按名称查找
    const agentTool = this.agentTools.get(toolName);
    if (agentTool) {
      return agentTool.handler(args);
    }

    // 3) ToolRegistry 内置工具
    return this.toolRegistry.executeTool(toolName, args);
  }

  private getAllToolSchemas(): ToolSchema[] {
    const builtinSchemas = this.toolRegistry.getToolSchemas();
    const mcpSchemas = this.mcpManager.getToolSchemas();
    const agentSchemas = Array.from(this.agentTools.values()).map((t) => t.schema);

    return [...builtinSchemas, ...mcpSchemas, ...agentSchemas];
  }

  /**
   * 初始化 Agent 管线工具：将 schema 和 handler 成对注册到 agentTools Map 中。
   * 不再使用 if-else 链，新增工具只需在此追加一条 set 调用。
   */
  private initAgentTools(): void {
    this.agentTools = new Map<string, AgentToolDef>();

    this.agentTools.set('agent_generate', {
      schema: {
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
      handler: async (args) => {
        const planContent = String(args.planContent);
        this._agentGenerateTriggered = true;
        return `测试计划已确认。请根据以下测试计划直接生成 Playwright TypeScript 测试代码。\n\n要求：\n- 使用 page.locator 或 page.getByRole 等现代定位器\n- 每个场景使用 test() 或 test.describe() 包裹\n- 包含适当的断言（expect）\n- 遵循 Playwright Test 最佳实践\n- 直接输出可运行的 TypeScript 代码，不要额外解释\n\n测试计划如下：\n\n${planContent}`;
      },
    });

    this.agentTools.set('agent_heal', {
      schema: {
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
      handler: async (args) => {
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
      },
    });

    // ── agent_execute: 执行测试 ──────────────────────────────────────────
    this.agentTools.set('agent_execute', {
      schema: {
        type: 'function',
        function: {
          name: 'agent_execute',
          description: 'Run Playwright tests and return pass/fail results. Use this when the user asks you to run or execute tests.',
          parameters: {
            type: 'object',
            properties: {
              testDir: {
                type: 'string',
                description: 'Test file directory (optional, defaults to the project test dir)',
              },
              grep: {
                type: 'string',
                description: 'Run only tests matching this name pattern (optional)',
              },
              timeout: {
                type: 'number',
                description: 'Test timeout in milliseconds (optional, default 30000)',
              },
              retries: {
                type: 'number',
                description: 'Number of retries on failure (optional, default 0)',
              },
            },
            required: [],
          },
        },
      },
      handler: async (args) => {
        const testDir = String(args.testDir || this.projectRoot || process.cwd());
        const config: TestConfig = {
          version: 'agent-run',
          testDir,
          outputDir: path.join(this.dataDir, 'runs', `agent-${Date.now()}`),
          timeout: Number(args.timeout || 30000),
          retries: Number(args.retries || 0),
          browsers: ['chromium'],
        };

        const executor = new Executor(config);
        const progressMessages: string[] = [];

        executor.on('run_progress', (progress: { passed: number; totalTests: number }) => {
          const msg = `⏳ 进度: ${progress.passed}/${progress.totalTests} 通过`;
          progressMessages.push(msg);
        });

        executor.on('test_result', (result: { status: string; title: string; duration: number }) => {
          const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
          progressMessages.push(`${icon} [${result.status}] ${result.title} (${result.duration}ms)`);
        });

        try {
          const runResult = await executor.execute();

          // 取最后 5 条进度消息，避免信息过长
          const recentProgress = progressMessages.slice(-5);

          const summary = [
            `## 测试执行结果`,
            ``,
            `- **运行 ID**: ${runResult.id}`,
            `- **状态**: ${runResult.status === 'success' ? '✅ 成功' : '❌ 失败'}`,
            `- **总计**: ${runResult.totalTests} 个用例`,
            `- **通过**: ${runResult.passed} 个`,
            `- **失败**: ${runResult.failed} 个`,
            `- **跳过**: ${runResult.skipped} 个`,
            runResult.duration ? `- **耗时**: ${(runResult.duration / 1000).toFixed(1)}s` : '',
            recentProgress.length > 0 ? `\n**执行详情**:\n${recentProgress.join('\n')}` : '',
            ``,
            runResult.failed > 0
              ? '⚠️ 存在失败用例，需要进一步分析。你可以让我用 agent_diagnose 诊断失败原因。'
              : '🎉 全部通过！',
          ]
            .filter(Boolean)
            .join('\n');

          return summary;
        } catch (error) {
          return `❌ 测试执行失败: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });

    // ── agent_diagnose: AI 诊断失败 ──────────────────────────────────────
    this.agentTools.set('agent_diagnose', {
      schema: {
        type: 'function',
        function: {
          name: 'agent_diagnose',
          description: 'Analyze a test failure using AI and return structured diagnosis with root cause and fix suggestions. Use this when the user asks why a test failed.',
          parameters: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'The test case title or identifier',
              },
              error: {
                type: 'string',
                description: 'The error message from the test failure',
              },
              stackTrace: {
                type: 'string',
                description: 'Optional stack trace from the failure',
              },
              filePath: {
                type: 'string',
                description: 'Optional path to the test file',
              },
            },
            required: ['title', 'error'],
          },
        },
      },
      handler: async (args) => {
        if (!this.llmService) {
          return '❌ LLM 未配置，无法进行 AI 诊断。请先在设置中配置 LLM 连接。';
        }

        const diagnosisService = new DiagnosisService(
          this.dataDir,
          this.llmService,
          this.toolRegistry
        );

        try {
          const diagnosis: AIDiagnosis = await diagnosisService.diagnose({
            title: String(args.title),
            error: String(args.error),
            stackTrace: args.stackTrace as string | undefined,
            filePath: args.filePath as string | undefined,
          });

          const confidencePercent = Math.round((diagnosis.calibratedConfidence ?? diagnosis.confidence) * 100);
          const lowConfidenceWarning =
            confidencePercent < 50
              ? '\n\n> ⚠️ **置信度较低**（' + confidencePercent + '%），此分析仅供参考，建议人工复核。'
              : '';

          const suggestionList =
            diagnosis.suggestions.length > 0
              ? '\n' + diagnosis.suggestions.map((s: string) => `- ${s}`).join('\n')
              : '';

          const codeDiffInfo =
            diagnosis.codeDiffs && diagnosis.codeDiffs.length > 0
              ? '\n\n**代码修改建议**: ' + diagnosis.codeDiffs.length + ' 处'
              : '';

          return [
            `## AI 诊断结果`,
            ``,
            `**测试**: ${diagnosis.summary || args.title}`,
            `**根因**: ${diagnosis.rootCause}`,
            `**分类**: ${diagnosis.category}`,
            `**置信度**: ${confidencePercent}%`,
            suggestionList ? `**修复建议**:${suggestionList}` : '',
            codeDiffInfo,
            lowConfidenceWarning,
          ]
            .filter(Boolean)
            .join('\n');
        } catch (error) {
          return `❌ 诊断失败: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
    });
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

  parseMarkdownPlan(filePath: string): TestPlan | null {
    return AgentOutputParser.parseMarkdownPlan(filePath);
  }

  createSessionContext(): AgentSessionContext {
    return this.sessionManager.createSession();
  }

  // ─── 代码提取与保存（agent_generate 后处理） ─────────────────────────────

  private saveGeneratedCodeFromResponse(responseText: string): string[] {
    const projectRoot = this.configManager.getConfig().projectRoot || process.cwd();
    const testDir = path.resolve(projectRoot, 'tests');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    const savedFiles: string[] = [];
    const codeBlocks = AgentOutputParser.extractCodeBlocks(responseText);

    if (codeBlocks.length === 0) {
      // 没有代码块，将整个响应作为单一文件保存
      const fileName = `generated-${Date.now()}.spec.ts`;
      const filePath = path.join(testDir, fileName);
      const cleanedCode = AgentOutputParser.cleanCode(responseText);
      if (cleanedCode) {
        fs.writeFileSync(filePath, cleanedCode, 'utf-8');
        savedFiles.push(filePath);
      }
      return savedFiles;
    }

    const usedFileNames = new Set<string>();
    for (let i = 0; i < codeBlocks.length; i++) {
      const code = codeBlocks[i];
      const testName = this.extractTestNameFromCode(code);
      let fileName = testName
        ? `${testName}.spec.ts`
        : `generated-${Date.now()}-${i + 1}.spec.ts`;

      if (usedFileNames.has(fileName)) {
        const baseName = testName || `generated-${Date.now()}`;
        let suffix = 2;
        while (usedFileNames.has(`${baseName}-${suffix}.spec.ts`)) {
          suffix++;
        }
        fileName = `${baseName}-${suffix}.spec.ts`;
      }
      usedFileNames.add(fileName);

      const filePath = path.join(testDir, fileName);
      fs.writeFileSync(filePath, code, 'utf-8');
      savedFiles.push(filePath);
    }

    return savedFiles;
  }

  private extractTestNameFromCode(code: string): string | null {
    const describeMatch = code.match(/test\.describe\(['"](.+?)['"]/);
    if (describeMatch) {
      const slug = this.generateSlug(describeMatch[1]);
      return slug || null;
    }
    const testMatch = code.match(/test\(['"](.+?)['"]/);
    if (testMatch) {
      const slug = this.generateSlug(testMatch[1]);
      return slug || null;
    }
    return null;
  }

  private generateSlug(text: string): string {
    let slug = text.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-');
    slug = slug.replace(/-+/g, '-');
    slug = slug.replace(/^-+|-+$/g, '');
    return slug.slice(0, 50);
  }
}
