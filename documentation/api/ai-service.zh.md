# UnifiedAIService API 参考

UnifiedAIService 是统一 AI 服务，将 ChatService（对话管理 + MCP 集成）和 AgentService（测试规划/生成/修复管线）的所有能力合并到单个类中。所有子模块均被该类直接持有，不存在内部委托或包装。

- **源码位置**：[src/ai/ai-service.ts](file:///d:/Coding/yuantest-playwright/src/ai/ai-service.ts)

---

## 构造函数

```typescript
new UnifiedAIService(
  dataDir: string,
  projectRoot: string,
  toolRegistry: ToolRegistry,
  llmConfig?: LLMConfig,
  sharedLLMService?: LLMService,
  mcpConfigService?: MCPConfigService,
  sharedMCPClientManager?: MCPClientManager,
  agentConfig?: Partial<AgentConfig>,
  sharedToolRegistry?: ToolRegistry
)
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dataDir` | `string` | 是 | 数据存储目录，用于保存对话、修复历史和测试计划 |
| `projectRoot` | `string` | 是 | 项目根目录路径 |
| `toolRegistry` | `ToolRegistry` | 是 | 工具注册表，管理可用工具 |
| `llmConfig` | `LLMConfig` | 否 | LLM 配置 |
| `sharedLLMService` | `LLMService` | 否 | 共享 LLM 服务实例（DI） |
| `mcpConfigService` | `MCPConfigService` | 否 | MCP 配置服务实例 |
| `sharedMCPClientManager` | `MCPClientManager` | 否 | 共享 MCP 客户端管理器实例 |
| `agentConfig` | `Partial<AgentConfig>` | 否 | Agent 配置（与默认值合并） |
| `sharedToolRegistry` | `ToolRegistry` | 否 | 共享工具注册表实例 |

---

## 统一方法

这些方法合并了 ChatService 和 AgentService 的重复能力：

### `updateLLMConfig(config: LLMConfig): void`

统一更新所有子系统的 LLM 配置。替代分别调用 `ChatService.updateLLMConfig()` 和 `AgentService.setLLMConfig()`。

```typescript
aiService.updateLLMConfig({
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder:7b',
});
```

### `setProjectRoot(root: string): void`

统一更新所有子系统的项目根目录。

```typescript
aiService.setProjectRoot('/path/to/project');
```

---

## 对话管理

### `createConversation(title?: string): Conversation`

创建新对话。

### `getConversation(id: string): Conversation | null`

获取指定 ID 的对话。

### `listConversations(): ConversationSummary[]`

列出所有对话摘要。

### `deleteConversation(id: string): boolean`

删除指定 ID 的对话。

### `sendMessage(conversationId, userMessage, onEvent): Promise<void>`

发送消息并接收流式 SSE 响应。

---

## MCP 管理

### `initMCP(): Promise<void>`

初始化 MCP 连接。

### `reconnectMCP(): Promise<void>`

重新连接所有 MCP 服务器。

### `toggleMCPConnection(id, enabled): Promise<void>`

启用或禁用 MCP 连接。

### `getMCPStatus(): MCPConnectionStatus`

获取当前 MCP 连接状态。

### `getAllTools(): ToolInfo[]`

获取所有可用工具（内置 + MCP）。

---

## Agent 管线

### `initAgents(loopTarget): Promise<AgentResult<AgentInitResult>>`

为指定环境初始化 Agent 定义（`'vscode'` | `'claude'` | `'opencode'`）。

### `plan(description, options?): Promise<AgentResult<TestPlan>>`

从功能描述生成结构化测试计划。

```typescript
const result = await aiService.plan('用户登录流程', {
  seedTest: 'tests/example.spec.ts',
});
```

### `generate(planPath, options?): Promise<AgentResult<string[]>>`

从测试计划生成 Playwright TypeScript 代码。

### `heal(testFilePath, options?): Promise<AgentResult<AgentHealResult>>`

分析失败测试并生成修复补丁，支持多轮修复。

### `applyPatch(patch): Promise<boolean>`

应用单个补丁。

### `applyPatches(patches): Promise<boolean[]>`

批量应用补丁。

### `runPipeline(description, options?): Promise<AgentResult<AgentSessionContext>>`

运行完整管线：plan → generate → heal。

---

## Agent 配置

### `getConfig(): AgentConfig`

获取当前 Agent 配置。

### `updateConfig(updates): void`

更新 Agent 配置。

### `getProjectRoot(): string`

获取当前项目根目录。

### `getProjectContext(): ProjectContext | null`

获取项目上下文信息。

### `setPrompts(prompts): void`

设置自定义提示词。

### `setBrowserSessionManager(manager): void`

设置浏览器会话管理器。

---

### `parseMarkdownPlan(filePath): TestPlan | null`

从 Markdown 文件解析测试计划。

### `createSessionContext(): AgentSessionContext`

创建 Agent 会话上下文。

---

## 向后兼容

旧类名导入仍然有效，但构造函数有所不同：

```typescript
// ChatService → 解析为 UnifiedAIService（完整构造函数）
import { ChatService } from 'yuantest-playwright';
const service = new ChatService(dataDir, projectRoot, toolRegistry, llmConfig);

// AgentService → 独立旧类（旧构造函数，仅用于测试和 CLI）
import { AgentService } from 'yuantest-playwright';
const service = new AgentService(dataDir, config, llmConfig);
```

> **注意**：`ChatService` 和 `AgentService` 保留以保持向后兼容。
> `ChatService` 是解析为 `UnifiedAIService` 的别名。
> `AgentService` 是独立的旧类，用于 CLI 工具和测试。
> **新代码应直接使用 `UnifiedAIService`**。
