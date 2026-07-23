# AgentService API 参考

> ⚠️ **已废弃**：`AgentService` 已合并到 `UnifiedAIService`。  
> 新代码应使用 `yuantest-playwright` 中的 `UnifiedAIService`。  
> 参见 [UnifiedAIService API 参考](ai-service.zh.md) 了解统一接口。  
> `AgentService` 保留以保持向后兼容，将在未来版本中移除。

AI 驱动的测试创建和修复代理系统。

- **源码位置**：[src/agents/index.ts](file:///d:/Coding/yuantest-playwright/src/agents/index.ts)

## 构造函数

```typescript
new AgentService(dataDir: string, config?: Partial<AgentConfig>, llmConfig?: LLMConfig, sharedLLMService?: LLMService, sharedToolRegistry?: ToolRegistry)
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dataDir` | `string` | 是 | 数据目录，用于存储修复历史和计划 |
| `config` | `Partial<AgentConfig>` | 否 | 代理配置（与默认值合并） |
| `llmConfig` | `LLMConfig` | 否 | LLM 配置，用于 AI 操作 |
| `sharedLLMService` | `LLMService` | 否 | 共享 LLM 服务实例，用于依赖注入 |
| `sharedToolRegistry` | `ToolRegistry` | 否 | 共享工具注册表实例，用于依赖注入 |

### 默认配置

```typescript
const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: true,
  loopTarget: 'vscode',
  specsDir: 'specs',
  autoHeal: false,
  maxHealRounds: 3,
  projectRoot: process.cwd(),
};
```

## 实例方法

### plan()

根据功能描述生成结构化测试计划。

```typescript
async plan(
  description: string,
  options?: { seedTest?: string; prdPath?: string; outputDir?: string }
): Promise<AgentResult<TestPlan>>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 功能描述，用于测试规划 |
| `options.seedTest` | `string` | 参考测试文件路径 |
| `options.prdPath` | `string` | 产品需求文档路径 |
| `options.outputDir` | `string` | 测试计划输出目录（默认：`specsDir`） |

**返回值**：`AgentResult<TestPlan>` — 包含场景、步骤和预期结果的测试计划。

**行为**：
- 需要启用 LLM，否则返回 `{ success: false, error: 'LLM is not enabled' }`
- 自动将计划保存为 Markdown 文件到 specs 目录
- 在提示中包含项目上下文（baseURL、技术栈、视口、超时等）
- 支持参考测试和 PRD 文档以生成更精确的计划

### generate()

从测试计划文件生成 Playwright TypeScript 测试代码。

```typescript
async generate(
  planPath: string,
  options?: { outputDir?: string; seedTest?: string }
): Promise<AgentResult<string[]>>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `planPath` | `string` | 测试计划 Markdown 文件路径 |
| `options.outputDir` | `string` | 生成测试文件的输出目录 |
| `options.seedTest` | `string` | 参考测试文件路径 |

**返回值**：`AgentResult<string[]>` — 生成的测试文件路径数组。

**行为**：
- 读取计划文件并将其转换为 Playwright TypeScript 代码
- 从 LLM 响应中提取代码块并保存为 `.spec.ts` 文件
- 使用现代定位器（getByRole、getByText、getByLabel）和最佳实践
- 每个测试场景独立可运行

### heal()

分析失败测试并生成修复补丁。

```typescript
async heal(
  testFilePath: string,
  options?: { runId?: string; testId?: string; error?: string; stackTrace?: string }
): Promise<AgentResult<AgentHealResult>>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `testFilePath` | `string` | 失败测试文件路径 |
| `options.runId` | `string` | 运行 ID，用于上下文 |
| `options.testId` | `string` | 测试 ID，用于上下文 |
| `options.error` | `string` | 测试失败的错误信息 |
| `options.stackTrace` | `string` | 测试失败的堆栈跟踪 |

**返回值**：`AgentResult<AgentHealResult>` — 包含补丁和状态的修复结果。

**行为**：
- 多轮修复（最多 `maxHealRounds` 轮，默认 3）
- 如果启用了 `autoHeal`，补丁在生成后自动应用
- 修复历史保存到 `{dataDir}/agent-heal-history.json`
- 安全检查：补丁只能应用于项目根目录内的文件

### applyPatch()

应用单个补丁到测试文件。

```typescript
async applyPatch(patch: HealerPatch): Promise<boolean>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `patch` | `HealerPatch` | 要应用的补丁 |

**返回值**：`boolean` — 补丁是否成功应用。

**安全**：仅允许目标文件在项目根目录内的补丁。

### applyPatches()

应用多个补丁到测试文件。

```typescript
async applyPatches(patches: HealerPatch[]): Promise<boolean[]>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `patches` | `HealerPatch[]` | 要应用的补丁数组 |

**返回值**：`boolean[]` — 每个补丁的应用结果。

### initAgents()

为循环目标初始化代理定义。

```typescript
async initAgents(loopTarget: AgentLoopTarget): Promise<AgentResult<AgentInitResult>>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `loopTarget` | `AgentLoopTarget` | 目标环境：`'vscode'` \| `'claude'` \| `'opencode'` |

**返回值**：`AgentResult<AgentInitResult>` — 包含创建的文件和说明路径的初始化结果。

### getConfig()

获取当前代理配置。

```typescript
getConfig(): AgentConfig
```

### updateConfig()

更新代理配置。

```typescript
updateConfig(updates: Partial<AgentConfig>): void
```

### setLLMConfig()

更新 LLM 配置（使用新配置重建所有代理）。

```typescript
setLLMConfig(config: LLMConfig): void
```

### setProjectRoot()

更新项目根目录（重新加载项目上下文并重建代理）。

```typescript
setProjectRoot(root: string): void
```

### getProjectRoot()

获取当前项目根目录。

```typescript
getProjectRoot(): string
```

### getProjectContext()

获取当前项目上下文信息。

```typescript
getProjectContext(): ProjectContext | null
```

### parseMarkdownPlan()

从 Markdown 文本解析测试计划。

```typescript
static parseMarkdownPlan(markdown: string): TestPlan
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `markdown` | `string` | 包含测试计划的 Markdown 文本 |

**返回值**：`TestPlan` — 解析后的测试计划，包含场景、步骤和预期结果。

### createSessionContext()

创建新的 Agent 会话上下文，用于在代理之间共享状态。

```typescript
createSessionContext(): AgentSessionContext
```

**返回值**：`AgentSessionContext` — 新的会话上下文实例。

### runPipeline()

运行完整流水线：计划 → 生成 → (可选)运行。

```typescript
async runPipeline(
  description: string,
  options?: { seedTest?: string; prdPath?: string; outputDir?: string; autoRun?: boolean }
): Promise<AgentResult>
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `description` | `string` | 功能描述，用于测试规划 |
| `options.seedTest` | `string` | 参考测试文件路径 |
| `options.prdPath` | `string` | 产品需求文档路径 |
| `options.outputDir` | `string` | 生成文件的输出目录 |
| `options.autoRun` | `boolean` | 是否自动运行生成的测试 |

**返回值**：`Promise<AgentResult>` — 流水线执行结果。

## 子模块

### BaseAgent

抽象基类，提供 `callLLM()`、`callLLMWithAgentLoop()`、`updateConfig()`、`setToolRegistry()`、`setLLMService()`、`isLLMEnabled()` 方法。

### LLMService

LLM 服务类，提供 `chat()`、`chatWithTools()`、`chatStream()`、`chatWithAgentLoop()`、`updateConfig()`、`getConfig()` 方法。

### PatchApplier

补丁应用，提供 `applyPatchToContent()`、`applyPatch()`、`isWithinProjectRoot()`（静态）方法。

### ProjectContextLoader

项目上下文加载器，提供 `load()` 方法。

### TestRunner

测试运行器，提供 `runTest()`、`runSingleTest()` 方法。

### ToolRegistry

工具注册表，提供 `registerTool()`、`unregisterTool()`、`getToolSchemas()`、`executeTool()`、`createDefaultRegistry()`（静态，注册 7 个默认工具）方法。

## 子代理

### PlannerAgent

- **源码**：[src/agents/planner.ts](file:///d:/Coding/yuantest-playwright/src/agents/planner.ts)
- 根据功能描述生成结构化测试计划
- 使用项目上下文生成精确的定位器
- 支持参考测试和 PRD 文档
- 返回 JSON 结构化的 TestPlan，包含场景、步骤和预期结果

### GeneratorAgent

- **源码**：[src/agents/generator.ts](file:///d:/Coding/yuantest-playwright/src/agents/generator.ts)
- 将 Markdown 测试计划转换为 Playwright TypeScript 代码
- 使用现代定位器（page.getByRole、page.getByText 等）
- 包含适当的断言，遵循测试最佳实践
- 每个测试场景独立可运行

### HealerAgent

- **源码**：[src/agents/healer.ts](file:///d:/Coding/yuantest-playwright/src/agents/healer.ts)
- 分析失败测试并生成修复补丁
- 支持多轮修复，逐步优化
- 为每个补丁生成统一 Diff 输出
- 为每个补丁提供置信度评分

## 类型定义

```typescript
// 代理类型
type AgentType = 'planner' | 'generator' | 'healer';

// 代理循环目标
type AgentLoopTarget = 'vscode' | 'claude' | 'opencode';

// 项目上下文
interface ProjectContext {
  projectRoot: string;
  baseURL?: string;
  testDir?: string;
  timeout?: number;
  useViewport?: { width: number; height: number };
  fixtures?: string;
  technology?: string;
  packageJson?: {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

// 代理配置
interface AgentConfig {
  enabled: boolean;
  loopTarget: AgentLoopTarget;
  specsDir: string;
  seedTest?: string;
  autoHeal: boolean;
  maxHealRounds: number;
  projectRoot?: string;
  projectContext?: ProjectContext;
}

// 测试计划
interface TestPlan {
  id: string;
  title: string;
  description: string;
  scenarios: TestPlanScenario[];
  createdAt: number;
  seedTest?: string;
  filePath?: string;
}

// 测试计划场景
interface TestPlanScenario {
  name: string;
  steps: TestPlanStep[];
  expectedResults: string[];
}

// 测试计划步骤
interface TestPlanStep {
  action: string;
  target: string;
  value?: string;
}

// 修复补丁
interface HealerPatch {
  testId: string;
  testTitle: string;
  filePath: string;
  originalCode: string;
  patchedCode: string;
  unifiedDiff: string;
  confidence: number;
  reason: string;
  appliedAt?: number;
  appliedBy?: 'auto' | 'manual';
  verified?: boolean;
}

// 代理结果
interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  agentType: AgentType;
  model?: string;
}

// 代理初始化结果
interface AgentInitResult {
  loopTarget: AgentLoopTarget;
  filesCreated: string[];
  instructionsPath?: string;
}

// 代理修复结果
interface AgentHealResult {
  testId: string;
  testTitle: string;
  patches: HealerPatch[];
  healed: boolean;
  roundsUsed: number;
}

// 代理会话上下文
interface AgentSessionContext {
  sessionId: string;
  sharedState: Map<string, unknown>;
  createdAt: number;
}

// 代理提示词
interface AgentPrompts {
  systemPrompt?: string;
  userPrompt?: string;
  planningPrompt?: string;
  generationPrompt?: string;
  healingPrompt?: string;
}

// 调用 LLM 选项
interface CallLLMOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

// 代理循环结果
interface AgentLoopResult {
  success: boolean;
  output?: string;
  error?: string;
  toolCalls?: ToolCallInfo[];
  tokenUsage?: TokenUsage;
}

// 代理循环选项
interface AgentLoopOptions {
  maxIterations?: number;
  timeout?: number;
  onToolCall?: (toolCall: ToolCallInfo) => void;
}

// LLM 聊天选项
interface LLMChatOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
}

// Token 使用统计
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// LLM 聊天结果
interface LLMChatResult {
  content: string;
  model: string;
  tokenUsage: TokenUsage;
  toolCalls?: ToolCallInfo[];
}

// 工具调用信息
interface ToolCallInfo {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

// 聊天消息
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCallInfo[];
}

// 工具模式定义
interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// 测试运行结果
interface TestRunResult {
  testId: string;
  testTitle: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedOut';
  duration: number;
  error?: string;
  stackTrace?: string;
  retries: number;
}

// 测试运行摘要
interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: TestRunResult[];
}
```

## 示例

### 基本用法

```typescript
import { AgentService } from 'yuantest-playwright';

const agentService = new AgentService('./test-data', {
  projectRoot: './my-project',
  autoHeal: false,
  maxHealRounds: 3,
});
```

### 配置 LLM

```typescript
import { AgentService } from 'yuantest-playwright';

const llmConfig = {
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'qwen2.5-coder:7b',
  apiKey: '',
  maxTokens: 4096,
  temperature: 0.3,
};

const agentService = new AgentService('./test-data', {}, llmConfig);
```

### 生成并执行测试计划

```typescript
// 1. 生成测试计划
const planResult = await agentService.plan('用户登录流程', {
  seedTest: 'tests/example.spec.ts',
  prdPath: 'docs/prd.md',
  outputDir: 'specs/',
});

if (planResult.success && planResult.data) {
  console.log(`计划: ${planResult.data.title}`);
  console.log(`场景数: ${planResult.data.scenarios.length}`);
  console.log(`保存到: ${planResult.data.filePath}`);
}

// 2. 从计划生成测试代码
if (planResult.data?.filePath) {
  const genResult = await agentService.generate(planResult.data.filePath, {
    outputDir: 'tests/',
  });

  if (genResult.success && genResult.data) {
    console.log(`生成文件: ${genResult.data.join(', ')}`);
  }
}
```

### 修复失败测试

```typescript
// 提供错误上下文修复测试
const healResult = await agentService.heal('tests/login.spec.ts', {
  error: '等待选择器超时: [data-testid="submit-btn"]',
  stackTrace: 'TimeoutError: ...',
});

if (healResult.success && healResult.data) {
  console.log(`已修复: ${healResult.data.healed}`);
  console.log(`补丁数: ${healResult.data.patches.length}`);
  console.log(`使用轮数: ${healResult.data.roundsUsed}`);

  // 查看并手动应用补丁
  for (const patch of healResult.data.patches) {
    console.log(`\n文件: ${patch.filePath}`);
    console.log(`置信度: ${patch.confidence}`);
    console.log(`原因: ${patch.reason}`);
    console.log(`Diff:\n${patch.unifiedDiff}`);

    // 应用单个补丁
    await agentService.applyPatch(patch);
  }
}
```

### 自动修复模式

```typescript
const agentService = new AgentService('./test-data', {
  autoHeal: true,
  maxHealRounds: 5,
}, llmConfig);

// 补丁将自动应用
const healResult = await agentService.heal('tests/login.spec.ts', {
  error: '选择器未找到',
});
```
