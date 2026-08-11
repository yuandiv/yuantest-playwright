# UnifiedAIService API 参考

UnifiedAIService 是统一 AI 服务，将 ChatService（对话管理 + MCP 集成）和 AgentService（测试规划/生成/修复管线）的所有能力合并到单个类中。所有子模块均被该类直接持有，不存在内部委托或包装。

- **源码位置**：[packages/ai/src/ai-service.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/packages/ai/src/ai-service.ts)

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

---

### `parseMarkdownPlan(filePath): TestPlan | null`

从 Markdown 文件解析测试计划。

### `createSessionContext(): AgentSessionContext`

创建 Agent 会话上下文。

---

## Agent 工具（内置工具）

Agent 管线工具由 `initAgentTools()` 在构造函数中使用 `Map<string, AgentToolDef>` 策略模式统一注册。LLM 在对话中可通过 function calling 调用以下工具：

### `agent_execute`

执行 Playwright 测试并返回通过/失败统计。当用户在对话中要求"运行测试"或"跑一下"时触发。

```typescript
// Schema
{
  name: 'agent_execute',
  description: 'Run Playwright tests and return pass/fail results',
  parameters: {
    testDir?: string,    // 测试文件目录（可选，默认项目根目录）
    grep?: string,       // 仅运行匹配此名称模式的测试（可选）
    timeout?: number,    // 测试超时毫秒数（可选，默认 30000）
    retries?: number,    // 失败重试次数（可选，默认 0）
  }
}
```

**行为**：
- 使用 `Executor` 执行测试，实时收集进度消息
- 返回运行 ID、状态、总计/通过/失败/跳过统计、耗时
- 存在失败用例时，建议用户使用 `agent_diagnose` 诊断失败原因

### `agent_diagnose`

AI 诊断测试失败原因。当用户问"为什么失败"时，或 `agent_execute` 返回失败后自动建议使用。

```typescript
// Schema
{
  name: 'agent_diagnose',
  description: 'Analyze a test failure using AI and return structured diagnosis',
  parameters: {
    title: string,       // 测试用例标题或标识符（必填）
    error: string,       // 测试失败的错误信息（必填）
    stackTrace?: string, // 可选的堆栈跟踪
    filePath?: string,   // 可选的测试文件路径
  }
}
```

**行为**：
- 使用 `DiagnosisService` 进行 AI 分析
- 返回根因分析、分类、置信度、修复建议
- 置信度低于 50% 时提示用户人工复核

### `agent_generate`

根据测试计划生成 Playwright TypeScript 测试代码。

```typescript
// Schema
{
  name: 'agent_generate',
  description: 'Generate Playwright TypeScript test code from a test plan',
  parameters: {
    planContent: string,  // 测试计划内容（必填）
  }
}
```

**行为**：
- 触发 LLM 生成包含测试代码的回复
- `sendMessage()` 的后处理逻辑自动从 LLM 响应中提取代码块，保存到 `tests/` 目录
- 自动从 `test.describe()` / `test()` 提取文件名，避免重名冲突

### `agent_heal`

分析失败测试并生成修复补丁。

```typescript
// Schema
{
  name: 'agent_heal',
  description: 'Analyze a failing test and generate fix patches',
  parameters: {
    testFilePath: string,    // 失败测试文件路径（必填）
    error?: string,          // 可选的错误信息
    stackTrace?: string,     // 可选的堆栈跟踪
  }
}
```

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
