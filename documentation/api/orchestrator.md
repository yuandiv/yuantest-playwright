# Orchestrator API

Orchestrator 负责测试编排，包括测试发现、分片分配和负载均衡。

## 构造函数

```typescript
const orchestrator = new Orchestrator(config: OrchestratorConfig);
```

### OrchestratorConfig

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `projectName` | string | 是 | - | 项目名称 |
| `testDir` | string | 是 | - | 测试目录 |
| `outputDir` | string | 是 | - | 输出目录 |
| `shards` | number | 否 | 1 | 分片数量 |
| `browsers` | string[] | 否 | ['chromium'] | 浏览器列表 |
| `timeout` | number | 否 | 30000 | 超时时间(ms) |
| `retries` | number | 否 | 0 | 重试次数 |
| `workers` | number | 否 | 1 | Worker 数量 |

## 方法

### initialize()

初始化编排器。

```typescript
await orchestrator.initialize(): Promise<void>
```

### orchestrate()

执行测试编排，返回编排计划。

```typescript
const plan = await orchestrator.orchestrate(): Promise<OrchestrationPlan>
```

### discoverTests()

发现测试文件。

```typescript
const tests = await orchestrator.discoverTests(): Promise<TestFile[]>
```

### optimizeShards(tests, shards)

优化分片分配。

```typescript
const assignments = orchestrator.optimizeShards(
  tests: TestFile[],
  shards: number
): ShardAssignment[]
```

### getConfig()

获取当前配置。

```typescript
const config = orchestrator.getConfig(): OrchestratorConfig
```

## 事件

Orchestrator 继承自 EventEmitter，支持以下事件：

| 事件 | 参数 | 说明 |
|------|------|------|
| `initialized` | - | 初始化完成 |
| `tests_discovered` | `TestFile[]` | 测试发现完成 |
| `orchestrated` | `OrchestrationPlan` | 编排完成 |

## 示例

### 基本使用

```typescript
import { Orchestrator } from 'yuantest-playwright';

const orchestrator = new Orchestrator({
  projectName: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  shards: 4,
  browsers: ['chromium', 'firefox'],
});

await orchestrator.initialize();
const plan = await orchestrator.orchestrate();

console.log(`Total tests: ${plan.totalTests}`);
console.log(`Shards: ${plan.shards.length}`);
```

### 监听事件

```typescript
orchestrator.on('tests_discovered', (tests) => {
  console.log(`Found ${tests.length} test files`);
});

orchestrator.on('orchestrated', (plan) => {
  console.log('Orchestration complete');
  plan.shards.forEach((shard, i) => {
    console.log(`Shard ${i}: ${shard.tests.length} tests`);
  });
});
```

### 智能分片

```typescript
// 基于历史执行时间优化分片
const tests = await orchestrator.discoverTests();
const assignments = orchestrator.optimizeShards(tests, 4);

assignments.forEach((assignment, i) => {
  console.log(`Shard ${i}: ${assignment.tests.length} tests, ~${assignment.estimatedDuration}ms`);
});
```

## 类型定义

```typescript
interface OrchestrationPlan {
  totalTests: number;
  shards: ShardAssignment[];
  estimatedDuration: number;
}

interface ShardAssignment {
  id: number;
  tests: TestFile[];
  estimatedDuration: number;
}

interface TestFile {
  path: string;
  name: string;
  tests: TestCase[];
  estimatedDuration?: number;
}

interface TestCase {
  name: string;
  file: string;
  line?: number;
  annotations?: string[];
}
```
