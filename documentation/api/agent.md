# AgentService API Reference

AI-powered test creation and healing agent system.

- **Source Location**: [src/agents/index.ts](file:///d:/Coding/yuantest-playwright/src/agents/index.ts)

## Constructor

```typescript
new AgentService(dataDir: string, config?: Partial<AgentConfig>, llmConfig?: LLMConfig)
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `dataDir` | `string` | Yes | Data directory for storing heal history and plans |
| `config` | `Partial<AgentConfig>` | No | Agent configuration (merged with defaults) |
| `llmConfig` | `LLMConfig` | No | LLM configuration for AI operations |

### Default Configuration

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

## Instance Methods

### plan()

Generate a structured test plan from a feature description.

```typescript
async plan(
  description: string,
  options?: { seedTest?: string; prdPath?: string; outputDir?: string }
): Promise<AgentResult<TestPlan>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `description` | `string` | Feature description for test planning |
| `options.seedTest` | `string` | Reference seed test file path |
| `options.prdPath` | `string` | Product requirement document path |
| `options.outputDir` | `string` | Output directory for plans (default: `specsDir`) |

**Returns**: `AgentResult<TestPlan>` — Generated test plan with scenarios, steps, and expected results.

**Behavior**:
- Requires LLM to be enabled, otherwise returns `{ success: false, error: 'LLM is not enabled' }`
- Automatically saves the plan as a Markdown file in the specs directory
- Includes project context (baseURL, tech stack, viewport, timeout, etc.) in the prompt
- Supports seed test and PRD references for more precise plan generation

### generate()

Generate Playwright TypeScript test code from a test plan file.

```typescript
async generate(
  planPath: string,
  options?: { outputDir?: string; seedTest?: string }
): Promise<AgentResult<string[]>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `planPath` | `string` | Path to the test plan Markdown file |
| `options.outputDir` | `string` | Output directory for generated test files |
| `options.seedTest` | `string` | Reference seed test file path |

**Returns**: `AgentResult<string[]>` — Array of generated test file paths.

**Behavior**:
- Reads the plan file and converts it to Playwright TypeScript code
- Extracts code blocks from LLM response and saves as `.spec.ts` files
- Uses modern locators (getByRole, getByText, getByLabel) and best practices
- Each test scenario is independently runnable

### heal()

Analyze a failing test and generate fix patches.

```typescript
async heal(
  testFilePath: string,
  options?: { runId?: string; testId?: string; error?: string; stackTrace?: string }
): Promise<AgentResult<AgentHealResult>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `testFilePath` | `string` | Path to the failing test file |
| `options.runId` | `string` | Run ID for context |
| `options.testId` | `string` | Test ID for context |
| `options.error` | `string` | Error message from the test failure |
| `options.stackTrace` | `string` | Stack trace from the test failure |

**Returns**: `AgentResult<AgentHealResult>` — Healing result with patches and status.

**Behavior**:
- Multi-round healing (up to `maxHealRounds`, default 3)
- If `autoHeal` is enabled, patches are automatically applied after generation
- Saves heal history to `{dataDir}/agent-heal-history.json`
- Security check: patches can only be applied within the project root

### applyPatch()

Apply a single patch to a test file.

```typescript
async applyPatch(patch: HealerPatch): Promise<boolean>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `patch` | `HealerPatch` | Patch to apply |

**Returns**: `boolean` — Whether the patch was successfully applied.

**Security**: Only allows patches targeting files within the project root directory.

### applyPatches()

Apply multiple patches to test files.

```typescript
async applyPatches(patches: HealerPatch[]): Promise<boolean[]>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `patches` | `HealerPatch[]` | Array of patches to apply |

**Returns**: `boolean[]` — Array of results for each patch.

### initAgents()

Initialize agent definitions for a loop target.

```typescript
async initAgents(loopTarget: AgentLoopTarget): Promise<AgentResult<AgentInitResult>>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `loopTarget` | `AgentLoopTarget` | Target environment: `'vscode'` \| `'claude'` \| `'opencode'` |

**Returns**: `AgentResult<AgentInitResult>` — Initialization result with created files and instructions path.

### listPlans()

List all generated test plans.

```typescript
async listPlans(): Promise<TestPlan[]>
```

**Returns**: Array of test plans sorted by creation time (newest first).

### getHealHistory()

Get the history of all heal operations.

```typescript
async getHealHistory(): Promise<AgentHealResult[]>
```

**Returns**: Array of heal results (max 100 entries).

### getConfig()

Get the current agent configuration.

```typescript
getConfig(): AgentConfig
```

### updateConfig()

Update agent configuration.

```typescript
updateConfig(updates: Partial<AgentConfig>): void
```

### setLLMConfig()

Update LLM configuration (recreates all agents with new config).

```typescript
setLLMConfig(config: LLMConfig): void
```

### setProjectRoot()

Update project root directory (reloads project context and recreates agents).

```typescript
setProjectRoot(root: string): void
```

### getProjectRoot()

Get the current project root directory.

```typescript
getProjectRoot(): string
```

### getProjectContext()

Get the current project context information.

```typescript
getProjectContext(): ProjectContext | null
```

## Sub-Agents

### PlannerAgent

- **Source**: [src/agents/planner.ts](file:///d:/Coding/yuantest-playwright/src/agents/planner.ts)
- Generates structured test plans from feature descriptions
- Uses project context to generate precise locators
- Supports seed test and PRD references
- Returns JSON-structured TestPlan with scenarios, steps, and expected results

### GeneratorAgent

- **Source**: [src/agents/generator.ts](file:///d:/Coding/yuantest-playwright/src/agents/generator.ts)
- Converts Markdown test plans into Playwright TypeScript code
- Uses modern locators (page.getByRole, page.getByText, etc.)
- Includes appropriate assertions and follows testing best practices
- Each test scenario is independently runnable

### HealerAgent

- **Source**: [src/agents/healer.ts](file:///d:/Coding/yuantest-playwright/src/agents/healer.ts)
- Analyzes failing tests and generates fix patches
- Supports multi-round healing with progressive refinement
- Generates unified diff output for each patch
- Provides confidence scoring for each patch

## Type Definitions

```typescript
// Agent type
type AgentType = 'planner' | 'generator' | 'healer';

// Agent loop target
type AgentLoopTarget = 'vscode' | 'claude' | 'opencode';

// Project context
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

// Agent configuration
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

// Test plan
interface TestPlan {
  id: string;
  title: string;
  description: string;
  scenarios: TestPlanScenario[];
  createdAt: number;
  seedTest?: string;
  filePath?: string;
}

// Test plan scenario
interface TestPlanScenario {
  name: string;
  steps: TestPlanStep[];
  expectedResults: string[];
}

// Test plan step
interface TestPlanStep {
  action: string;
  target: string;
  value?: string;
}

// Healer patch
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

// Agent result
interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  agentType: AgentType;
  model?: string;
}

// Agent init result
interface AgentInitResult {
  loopTarget: AgentLoopTarget;
  filesCreated: string[];
  instructionsPath?: string;
}

// Agent heal result
interface AgentHealResult {
  testId: string;
  testTitle: string;
  patches: HealerPatch[];
  healed: boolean;
  roundsUsed: number;
}
```

## Examples

### Basic Usage

```typescript
import { AgentService } from 'yuantest-playwright';

const agentService = new AgentService('./test-data', {
  projectRoot: './my-project',
  autoHeal: false,
  maxHealRounds: 3,
});
```

### With LLM Configuration

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

### Generate and Execute Test Plan

```typescript
// 1. Generate test plan
const planResult = await agentService.plan('User login flow', {
  seedTest: 'tests/example.spec.ts',
  prdPath: 'docs/prd.md',
  outputDir: 'specs/',
});

if (planResult.success && planResult.data) {
  console.log(`Plan: ${planResult.data.title}`);
  console.log(`Scenarios: ${planResult.data.scenarios.length}`);
  console.log(`Saved to: ${planResult.data.filePath}`);
}

// 2. Generate test code from plan
if (planResult.data?.filePath) {
  const genResult = await agentService.generate(planResult.data.filePath, {
    outputDir: 'tests/',
  });

  if (genResult.success && genResult.data) {
    console.log(`Generated files: ${genResult.data.join(', ')}`);
  }
}
```

### Heal a Failing Test

```typescript
// Heal with error context
const healResult = await agentService.heal('tests/login.spec.ts', {
  error: 'Timeout waiting for selector: [data-testid="submit-btn"]',
  stackTrace: 'TimeoutError: ...',
});

if (healResult.success && healResult.data) {
  console.log(`Healed: ${healResult.data.healed}`);
  console.log(`Patches: ${healResult.data.patches.length}`);
  console.log(`Rounds used: ${healResult.data.roundsUsed}`);

  // Review and apply patches manually
  for (const patch of healResult.data.patches) {
    console.log(`\nFile: ${patch.filePath}`);
    console.log(`Confidence: ${patch.confidence}`);
    console.log(`Reason: ${patch.reason}`);
    console.log(`Diff:\n${patch.unifiedDiff}`);

    // Apply individual patch
    await agentService.applyPatch(patch);
  }
}
```

### Auto-Heal Mode

```typescript
const agentService = new AgentService('./test-data', {
  autoHeal: true,
  maxHealRounds: 5,
}, llmConfig);

// Patches will be automatically applied
const healResult = await agentService.heal('tests/login.spec.ts', {
  error: 'Selector not found',
});
```

### View Heal History

```typescript
const history = await agentService.getHealHistory();
for (const entry of history) {
  console.log(`${entry.testTitle}: healed=${entry.healed}, patches=${entry.patches.length}`);
}
```
