# UnifiedAIService API Reference

UnifiedAIService is the unified AI service that combines the capabilities of ChatService (conversation management + MCP integration) and AgentService (test planning/generation/healing pipeline) into a single class. All sub-modules are directly owned — no internal delegation or wrapping.

- **Source Location**: [src/ai/ai-service.ts](file:///d:/Coding/yuantest-playwright/src/ai/ai-service.ts)

---

## Constructor

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

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataDir` | `string` | Yes | Data directory for storing conversations, heal history, and plans |
| `projectRoot` | `string` | Yes | Project root directory path |
| `toolRegistry` | `ToolRegistry` | Yes | Tool registry for managing available tools |
| `llmConfig` | `LLMConfig` | No | LLM configuration for AI operations |
| `sharedLLMService` | `LLMService` | No | Shared LLM service instance for dependency injection |
| `mcpConfigService` | `MCPConfigService` | No | MCP configuration service instance |
| `sharedMCPClientManager` | `MCPClientManager` | No | Shared MCP client manager instance |
| `agentConfig` | `Partial<AgentConfig>` | No | Agent configuration (merged with defaults) |
| `sharedToolRegistry` | `ToolRegistry` | No | Shared tool registry instance |

---

## Unified Methods

These methods combine functionality from both ChatService and AgentService:

### `updateLLMConfig(config: LLMConfig): void`

Update LLM configuration across all subsystems (chat + agent). Replaces separate calls to both `ChatService.updateLLMConfig()` and `AgentService.setLLMConfig()`.

```typescript
aiService.updateLLMConfig({
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder:7b',
});
```

### `setProjectRoot(root: string): void`

Update project root directory across all subsystems. Replaces separate calls to both `ChatService.setProjectRoot()` and `AgentService.setProjectRoot()`.

```typescript
aiService.setProjectRoot('/path/to/project');
```

---

## Conversation Management

### `createConversation(title?: string): Conversation`

Create a new conversation.

### `getConversation(id: string): Conversation | null`

Get a conversation by ID.

### `listConversations(): ConversationSummary[]`

List all conversations as summary objects.

### `deleteConversation(id: string): boolean`

Delete a conversation by ID.

### `sendMessage(conversationId: string, userMessage: string, onEvent: (event: SSEEvent) => void): Promise<void>`

Send a message to a conversation and receive streaming responses via SSE events.

---

## MCP Management

### `initMCP(): Promise<void>`

Initialize MCP connections from the current configuration.

### `reconnectMCP(): Promise<void>`

Reconnect all MCP servers.

### `toggleMCPConnection(id: string, enabled: boolean): Promise<void>`

Enable or disable a specific MCP connection.

### `getMCPStatus(): MCPConnectionStatus`

Get the current MCP connection status.

### `getAllTools(): { name: string; description: string; source: 'builtin' | 'mcp' }[]`

Get all available tools from both builtin and MCP sources.

---

## Agent Pipeline

### `initAgents(loopTarget: AgentLoopTarget): Promise<AgentResult<AgentInitResult>>`

Initialize agent definitions for a loop target (`'vscode'` | `'claude'` | `'opencode'`).

### `plan(description: string, options?): Promise<AgentResult<TestPlan>>`

Generate a structured test plan from a feature description.

```typescript
const result = await aiService.plan('User login flow', {
  seedTest: 'tests/example.spec.ts',
  prdPath: 'docs/prd.md',
});
```

### `generate(planPath: string, options?): Promise<AgentResult<string[]>>`

Generate Playwright TypeScript test code from a test plan file.

### `heal(testFilePath: string, options?): Promise<AgentResult<AgentHealResult>>`

Analyze a failing test and generate fix patches. Supports multi-round healing.

### `applyPatch(patch: HealerPatch): Promise<boolean>`

Apply a single patch to a test file.

### `applyPatches(patches: HealerPatch[]): Promise<boolean[]>`

Apply multiple patches to test files.

### `runPipeline(description: string, options?): Promise<AgentResult<AgentSessionContext>>`

Run the full pipeline: plan → generate → (optional) heal.

---

## Agent Configuration

### `getConfig(): AgentConfig`

Get the current agent configuration.

### `updateConfig(updates: Partial<AgentConfig>): void`

Update agent configuration.

### `getProjectRoot(): string`

Get the current project root directory.

### `getProjectContext(): ProjectContext | null`

Get the current project context information.

### `setPrompts(prompts: Partial<AgentPrompts> | null): void`

Set custom prompts for agent operations.

---

### `parseMarkdownPlan(filePath: string): TestPlan | null`

Parse a test plan from a Markdown file.

### `createSessionContext(): AgentSessionContext`

Create a new agent session context for sharing state between agents.

---

## Agent Tools (Built-in Tools)

Agent pipeline tools are registered via `initAgentTools()` in the constructor using a `Map<string, AgentToolDef>` strategy pattern. LLM can invoke these tools via function calling during chat:

### `agent_execute`

Run Playwright tests and return pass/fail statistics. Used when the user asks to "run tests" during a conversation.

```typescript
// Schema
{
  name: 'agent_execute',
  description: 'Run Playwright tests and return pass/fail results',
  parameters: {
    testDir?: string,    // Test file directory (optional, defaults to project root)
    grep?: string,       // Run only tests matching this name pattern (optional)
    timeout?: number,    // Test timeout in milliseconds (optional, default 30000)
    retries?: number,    // Number of retries on failure (optional, default 0)
  }
}
```

**Behavior**:
- Uses `Executor` to run tests, collecting real-time progress
- Returns run ID, status, total/passed/failed/skipped counts, duration
- If failures exist, suggests using `agent_diagnose` to analyze root causes

### `agent_diagnose`

AI-powered diagnosis of test failures. Used when the user asks "why did it fail", or automatically suggested after `agent_execute` returns failures.

```typescript
// Schema
{
  name: 'agent_diagnose',
  description: 'Analyze a test failure using AI and return structured diagnosis',
  parameters: {
    title: string,       // Test case title or identifier (required)
    error: string,       // Error message from the test failure (required)
    stackTrace?: string, // Optional stack trace
    filePath?: string,   // Optional test file path
  }
}
```

**Behavior**:
- Uses `DiagnosisService` for AI analysis
- Returns root cause, category, confidence, fix suggestions
- Low confidence (<50%) prompts human review suggestion

### `agent_generate`

Generate Playwright TypeScript test code from a test plan.

```typescript
// Schema
{
  name: 'agent_generate',
  description: 'Generate Playwright TypeScript test code from a test plan',
  parameters: {
    planContent: string,  // Test plan content (required)
  }
}
```

**Behavior**:
- Triggers LLM to generate test code in its response
- `sendMessage()` post-processing automatically extracts code blocks and saves to `tests/` directory
- Automatically derives filenames from `test.describe()` / `test()` titles, avoids name conflicts

### `agent_heal`

Analyze a failing test and generate fix patches.

```typescript
// Schema
{
  name: 'agent_heal',
  description: 'Analyze a failing test and generate fix patches',
  parameters: {
    testFilePath: string,    // Failing test file path (required)
    error?: string,          // Optional error message
    stackTrace?: string,     // Optional stack trace
  }
}
```

---

## Backward Compatibility

The old class names still work for imports, but note their constructors differ:

```typescript
// ChatService → resolves to UnifiedAIService (full constructor)
import { ChatService } from 'yuantest-playwright';
const service = new ChatService(dataDir, projectRoot, toolRegistry, llmConfig);

// AgentService → standalone class (old constructor, test/CLI only)
import { AgentService } from 'yuantest-playwright';
const service = new AgentService(dataDir, config, llmConfig);
```

> **Note**: `ChatService` and `AgentService` are kept for backward compatibility.
> `ChatService` is an alias that resolves to `UnifiedAIService`.
> `AgentService` is a separate standalone class used by CLI tools and tests.
> **New code should use `UnifiedAIService` directly**.
