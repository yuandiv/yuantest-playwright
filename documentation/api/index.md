# API Reference

YuanTest Playwright provides a complete programming API that can be used directly in Node.js code.

## Installation

```bash
npm install yuantest-playwright
```

## Basic Import

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
  AgentService,
} from 'yuantest-playwright';
```

## Core Modules

| Module | Description | Documentation |
|--------|-------------|---------------|
| **Orchestrator** | Test orchestrator, supports distributed/weighted/intelligent strategies | [Orchestrator API](orchestrator.md) |
| **Executor** | Test executor, calls Playwright CLI to run tests | [Executor API](executor.md) |
| **Reporter** | Report generator, supports JSON/HTML reports and failure analysis | [Reporter API](reporter.md) |
| **FlakyTestManager** | Flaky test manager, classification/root cause/correlation/trend/prediction/causal graph/quarantine | [FlakyTestManager API](flaky.md) |
| **DashboardServer** | Dashboard server, REST API + WebSocket real-time push | [DashboardServer API](dashboard.md) |
| **UnifiedAIService** | Unified AI service (chat + MCP + agent pipeline) | [UnifiedAIService API](ai-service.md) |
| **AgentService** | AI agent system (merged into UnifiedAIService) | [AgentService API (deprecated)](agent.md) |
| **ChatService** | AI chat service (merged into UnifiedAIService) | [ChatService API (deprecated)](chat.md) |
| **RealtimeReporter** | Real-time event broadcasting via WebSocket | [RealtimeReporter API](realtime.md) |
| **TraceManager** | Playwright trace file management | [TraceManager API](trace.md) |
| **AnnotationManager** | Test annotation scanning and management | [AnnotationManager API](annotations.md) |
| **TagManager** | Test tag scanning and filtering | [TagManager API](tags.md) |
| **ArtifactManager** | Test artifact management | [ArtifactManager API](artifacts.md) |
| **VisualTestingManager** | Visual regression testing | [VisualTestingManager API](visual.md) |
| **TestDiscovery** | Automatic test file discovery | [TestDiscovery API](discovery.md) |
| **ServiceContainer** | Dependency injection container | [ServiceContainer API](container.md) |
| **Storage** | Storage abstraction layer | [Storage API](storage.md) |
| **Cache** | In-memory caching | [Cache API](cache.md) |
| **Logger** | Structured logging | [Logger API](logger.md) |

## Module Overview

| Module | Class | Description |
|--------|-------|-------------|
| UnifiedAIService | `UnifiedAIService`, `ConversationStore`, `MCPClientManager`, `PlannerAgent`, `GeneratorAgent`, `HealerAgent` | Unified AI service combining chat + MCP + agent pipeline |
| AgentService | `AgentService`, `PlannerAgent`, `GeneratorAgent`, `HealerAgent` | (deprecated — see UnifiedAIService) |
| ChatService | `ChatService`, `ConversationStore`, `MCPClientManager`, `MCPConfigService` | (deprecated — see UnifiedAIService) |
| RealtimeReporter | `RealtimeReporter`, `RealtimeReporterClient` | Real-time event broadcasting via WebSocket |
| TraceManager | `TraceManager` | Playwright trace file management |
| AnnotationManager | `AnnotationManager` | Test annotation scanning and management |
| TagManager | `TagManager` | Test tag scanning and filtering |
| ArtifactManager | `ArtifactManager` | Test artifact management |
| VisualTestingManager | `VisualTestingManager` | Visual regression testing |
| TestDiscovery | `TestDiscovery` | Automatic test file discovery |
| ServiceContainer | `ServiceContainer`, `MutableRef`, `TOKENS` | Dependency injection container |
| Storage | `StorageProvider`, `MemoryStorage`, `FilesystemStorage` | Storage abstraction layer |
| Cache | `LRUCache`, `TTLCache` | In-memory caching |
| Logger | `Logger`, `ChildLogger` | Structured logging |

## Quick Example

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
  AgentService,
} from 'yuantest-playwright';

async function main() {
  // 1. Orchestrate tests
  const orchestrator = new Orchestrator({
    projectName: 'my-app',
    testDir: './e2e',
    outputDir: './test-reports',
    shards: 4,
    browsers: ['chromium', 'firefox'],
  });
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();

  // 2. Execute tests
  const executor = new Executor(orchestrator.getConfig());

  executor.on('run_started', (data) => {
    console.log(`Run started: ${data.runId}`);
  });

  executor.on('test_result', (result) => {
    console.log(`[${result.status}] ${result.title} (${result.duration}ms)`);
  });

  executor.on('run_completed', async (result) => {
    // 3. Generate report
    const reporter = new Reporter('./test-reports');
    const reportPath = await reporter.generateReport(result);
    console.log(`Report: ${reportPath}`);
  });

  const result = await executor.execute();

  // 4. Flaky test management
  const flakyManager = new FlakyTestManager('./test-data');
  await flakyManager.recordRunResults(result);

  // View classifications
  const flakyTests = flakyManager.getFlakyTests();
  const brokenTests = flakyManager.getTestsByClassification('broken');

  // Root cause analysis
  for (const test of flakyTests) {
    const rootCause = await flakyManager.analyzeRootCause(test.testId);
    console.log(`${test.title}: ${rootCause?.primaryCause}`);
  }

  // Health score
  const health = flakyManager.getOverallHealthScore();
  console.log(`Health: ${health.grade} (${health.overall})`);

  // 5. AI Agent system
  const agentService = new AgentService('./test-data', { projectRoot: './' }, llmConfig);

  // Generate test plan
  const planResult = await agentService.plan('User login flow');
  if (planResult.success && planResult.data) {
    console.log(`Plan: ${planResult.data.title} (${planResult.data.scenarios.length} scenarios)`);
  }

  // Generate test code from plan
  if (planResult.data?.filePath) {
    const genResult = await agentService.generate(planResult.data.filePath);
    if (genResult.success && genResult.data) {
      console.log(`Generated files: ${genResult.data.join(', ')}`);
    }
  }

  // Heal failing test
  const healResult = await agentService.heal('tests/login.spec.ts', {
    error: 'Timeout waiting for selector',
  });
  if (healResult.success && healResult.data) {
    console.log(`Healed: ${healResult.data.healed}, Patches: ${healResult.data.patches.length}`);
  }

  // 6. Start Dashboard
  const server = new DashboardServer({
    port: 5274,
    outputDir: './test-reports',
    dataDir: './test-data',
  });
  await server.start();
}

main();
```

## Core Types

Main type definitions (see individual module docs for complete definitions):

```typescript
// Test result
interface TestResult {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'timedout';
  duration: number;
  error?: string;
  browser: BrowserType;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
}

// Run result
interface RunResult {
  id: string;
  status: 'success' | 'failed' | 'cancelled' | 'running';
  suites: SuiteResult[];
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
}

// Flaky test
interface FlakyTest {
  testId: string;
  title: string;
  failureRate: number;
  weightedFailureRate: number;
  classification: FlakyClassification;
  isQuarantined: boolean;
}

// Flaky classification
type FlakyClassification =
  | 'flaky' | 'broken' | 'regression'
  | 'monitor' | 'stable' | 'insufficient_data';

// Isolation level
type IsolationLevel = 'none' | 'monitor' | 'soft_quarantine' | 'hard_quarantine';

// Health score
interface FlakyHealthScore {
  overall: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

// Agent result
interface AgentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  duration: number;
  agentType: 'planner' | 'generator' | 'healer';
  model?: string;
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
```
