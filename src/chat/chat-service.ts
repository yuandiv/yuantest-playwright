import { logger } from '../logger';
import { LLMService, type ToolSchema } from '../agents/llm-service';
import { ToolRegistry } from '../agents/tool-registry';
import { MCPClientManager } from './mcp-client-manager';
import { MCPConfigService } from '../ui/services/mcp-config-service';
import {
  ConversationStore,
  type Conversation,
  type ConversationSummary,
} from './conversation-store';
import type { LLMConfig } from '../types';

export interface SSEEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  data: unknown;
}

export class ChatService {
  private store: ConversationStore;
  private mcpManager: MCPClientManager;
  private mcpConfigService: MCPConfigService | null;
  private toolRegistry: ToolRegistry;
  private llmService: LLMService | null = null;
  private dataDir: string;
  private projectRoot: string;
  private log = logger.child('ChatService');

  constructor(
    dataDir: string,
    projectRoot: string,
    toolRegistry: ToolRegistry,
    llmConfig?: LLMConfig,
    sharedLLMService?: LLMService,
    mcpConfigService?: MCPConfigService
  ) {
    this.dataDir = dataDir;
    this.projectRoot = projectRoot;
    this.store = new ConversationStore(dataDir);
    this.mcpManager = new MCPClientManager(projectRoot);
    this.toolRegistry = toolRegistry;
    this.mcpConfigService = mcpConfigService || null;

    if (sharedLLMService) {
      this.llmService = sharedLLMService;
    } else if (llmConfig && llmConfig.enabled) {
      this.llmService = new LLMService(llmConfig);
    }
  }

  updateLLMConfig(config: LLMConfig): void {
    if (this.llmService) {
      this.llmService.updateConfig(config);
    } else if (config.enabled) {
      this.llmService = new LLMService(config);
    }
    if (!config.enabled) {
      this.llmService = null;
    }
  }

  async setProjectRoot(root: string): Promise<void> {
    this.projectRoot = root;
    await this.mcpManager.setProjectRoot(root);
  }

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

  private getAllToolSchemas(): ToolSchema[] {
    const builtinSchemas = this.toolRegistry.getToolSchemas();
    const mcpSchemas = this.mcpManager.getToolSchemas();
    return [...builtinSchemas, ...mcpSchemas];
  }

  private async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    if (toolName.startsWith('mcp__')) {
      return this.mcpManager.callTool(toolName, args);
    }

    if (this.toolRegistry.hasTool(toolName)) {
      return this.toolRegistry.executeTool(toolName, args);
    }

    return `Unknown tool: ${toolName}`;
  }
}
