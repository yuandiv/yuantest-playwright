# Orchestrator API

Orchestrator 负责测试编排，包括测试发现、分片分配、负载均衡和历史执行时间分析。它继承自 `ManagedManager`（基于 `EventEmitter`），支持异步初始化和自动持久化。

---

## Orchestrator 类

```typescript
import { Orchestrator } from 'yuantest-playwright';
```

### 构造函数

```typescript
new Orchestrator(config: TestConfig, storage?: StorageProvider)
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `config` | `TestConfig` | 是 | - | 测试配置对象 |
| `storage` | `StorageProvider` | 否 | `getStorage()` | 存储提供者，用于读写持久化数据 |

构造函数内部会用 `DEFAULTS` 常量填充 `config` 中缺失的可选字段：

| 字段 | 默认值 |
|------|--------|
| `retries` | `0` |
| `timeout` | `30000` |
| `workers` | `1` |
| `shards` | `1` |
| `browsers` | `['chromium']` |

同时会将保存延迟设置为 `CACHE_CONFIG.SAVE_DELAY_MS`（1000ms）。

---

### 方法

#### `initialize(): Promise<void>`

初始化编排器。调用父类 `BaseManager.initialize()` 完成基础初始化（加载历史执行时间数据），并校验必要配置项。

- 如果 `config.version` 未设置，抛出 `PlaywrightRunnerError('Version is required', ErrorCode.INVALID_CONFIG)`
- 如果 `config.testDir` 未设置，抛出 `PlaywrightRunnerError('Test directory is required', ErrorCode.INVALID_CONFIG)`

```typescript
await orchestrator.initialize();
```

#### `orchestrate(): Promise<OrchestrationConfig>`

执行基础测试编排（distributed 策略）。流程如下：

1. 调用 `discoverTests()` 发现测试文件
2. 调用 `distributeTests()` 将测试均匀分配到各分片（轮询方式）
3. 返回 `OrchestrationConfig`，其中 `strategy` 为 `'distributed'`

```typescript
const config = await orchestrator.orchestrate();
```

#### `optimizeSharding(): Promise<OrchestrationConfig>`

执行智能分片编排（intelligent 策略）。流程如下：

1. 调用 `discoverTests()` 发现测试文件
2. 对每个测试文件调用 `estimateTestDurationDetailed()` 获取增强版时间估算
3. 使用 `ShardOptimizer` 进行方差感知负载均衡优化
4. 返回 `OrchestrationConfig`，其中 `strategy` 为 `'intelligent'`

```typescript
const config = await orchestrator.optimizeSharding();
```

#### `getAssignmentsForShard(shardId: number): TestAssignment[]`

获取指定分片的测试分配列表。

| 参数 | 类型 | 说明 |
|------|------|------|
| `shardId` | `number` | 分片 ID |

```typescript
const shardTests = orchestrator.getAssignmentsForShard(0);
```

#### `updateDurationHistory(testFile: string, duration: number): void`

更新单个测试文件的历史执行时间。使用 Welford 在线算法计算方差，EMA 进行时间衰减，同时维护百分位数和极值。更新后自动调度持久化保存。

| 参数 | 类型 | 说明 |
|------|------|------|
| `testFile` | `string` | 测试文件路径 |
| `duration` | `number` | 本次执行耗时（毫秒） |

```typescript
orchestrator.updateDurationHistory('login.spec.ts', 1520);
```

#### `recordRunResults(results: Array<{ testId: string; duration: number }>): void`

批量记录测试运行结果，对每个结果调用 `updateDurationHistory()`。

| 参数 | 类型 | 说明 |
|------|------|------|
| `results` | `Array<{ testId: string; duration: number }>` | 测试结果列表 |

```typescript
orchestrator.recordRunResults([
  { testId: 'login.spec.ts', duration: 1520 },
  { testId: 'cart.spec.ts', duration: 3200 },
]);
```

#### `recordShardFeedback(feedback: ShardPredictionFeedback): void`

记录分片预测反馈并自动校准。对比每个分片的预测总耗时与实际总耗时，使用学习率调整校准因子。仅保留最近 20 条反馈，校准因子范围为 `[0.5, 2.0]`。

| 参数 | 类型 | 说明 |
|------|------|------|
| `feedback` | `ShardPredictionFeedback` | 分片预测反馈 |

```typescript
orchestrator.recordShardFeedback({
  shardId: 0,
  predictedDuration: 10000,
  actualDuration: 12000,
  timestamp: Date.now(),
});
```

#### `getCalibrationFactor(): number`

获取当前校准因子。

```typescript
const factor = orchestrator.getCalibrationFactor();
```

#### `getPredictionFeedback(): ShardPredictionFeedback[]`

获取所有预测反馈记录的副本。

```typescript
const feedbacks = orchestrator.getPredictionFeedback();
```

#### `validateConfig(): Promise<boolean>`

校验配置是否完整。要求 `version`、`testDir`、`outputDir` 均已设置。

```typescript
const valid = await orchestrator.validateConfig();
```

#### `getConfig(): TestConfig`

获取当前配置的浅拷贝。

```typescript
const config = orchestrator.getConfig();
```

#### `createPlaywrightConfig(): Promise<any>`

基于当前配置生成 Playwright 配置对象。

```typescript
const pwConfig = await orchestrator.createPlaywrightConfig();
```

生成的配置结构：

```typescript
{
  testDir: string;
  timeout: number;
  retries: number;
  workers: number;
  use: {
    baseURL: string | undefined;
    trace: 'on-first-retry';
    screenshot: 'only-on-failure';
    video: 'retain-on-failure';
  };
  projects: Array<{ name: string; use: { browserName: string } }>;
  reporter: string[] | [['list']];
}
```

#### `flush(): Promise<void>`

立即将待保存的历史数据持久化到磁盘。清除所有延迟保存定时器，直接执行保存。

```typescript
await orchestrator.flush();
```

---

## 类型定义

### OrchestrationConfig

编排配置，描述分片分配结果。

```typescript
interface OrchestrationConfig {
  /** 总分片数 */
  totalShards: number;
  /** 当前分片索引（默认为 0） */
  shardIndex: number;
  /** 测试分配列表 */
  testAssignment: TestAssignment[];
  /** 编排策略 */
  strategy: 'distributed' | 'weighted' | 'intelligent';
  /** 不稳定测试 ID 列表（可选） */
  flakyTests?: string[];
  /** 隔离测试 ID 列表（可选） */
  quarantinedTests?: string[];
}
```

### TestAssignment

测试分配信息，描述单个测试与分片的映射关系。

```typescript
interface TestAssignment {
  /** 测试文件标识（相对路径） */
  testId: string;
  /** 分配到的分片 ID */
  shardId: number;
  /** 优先级（默认为 1） */
  priority: number;
  /** 预估执行时间（毫秒） */
  estimatedDuration?: number;
  /** 预估置信度（0~1，越高越可靠） */
  durationConfidence?: number;
  /** 执行时间方差（毫秒²） */
  durationVariance?: number;
  /** 估算来源 */
  estimationSource?: 'history' | 'ema' | 'similar' | 'default';
}
```

**estimationSource 说明：**

| 来源 | 说明 |
|------|------|
| `'history'` | 基于历史简单平均（运行次数 < 3 时） |
| `'ema'` | 基于指数移动平均（运行次数 ≥ 3 时，置信度最高） |
| `'similar'` | 基于同类测试推断（同目录下有历史数据的测试） |
| `'default'` | 使用默认超时时间作为估算（无任何历史数据） |

### TestConfig

测试配置，Orchestrator 构造函数的必需参数。

```typescript
interface TestConfig {
  /** 版本标识（必填） */
  version: string;
  /** 测试目录（必填） */
  testDir: string;
  /** 输出目录（必填） */
  outputDir: string;
  /** 基础 URL */
  baseURL?: string;
  /** 重试次数，默认 0 */
  retries?: number;
  /** 超时时间(ms)，默认 30000 */
  timeout?: number;
  /** Worker 数量，默认 1 */
  workers?: number;
  /** 分片数量，默认 1 */
  shards?: number;
  /** 报告器列表 */
  reporters?: string[];
  /** 浏览器列表，默认 ['chromium'] */
  browsers?: BrowserType[];
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 不稳定测试阈值 */
  flakyThreshold?: number;
  /** 是否隔离不稳定测试 */
  isolateFlaky?: boolean;
  /** 测试文件匹配模式 */
  testMatch?: string[];
  /** 测试文件忽略模式 */
  testIgnore?: string[];
  /** 忽略的目录 */
  ignoreDirs?: string[];
  // ... 其他可选配置
}

type BrowserType = 'chromium' | 'firefox' | 'webkit';
```

### ShardPredictionFeedback

分片预测反馈，用于校准时间估算。

```typescript
interface ShardPredictionFeedback {
  /** 分片 ID */
  shardId: number;
  /** 预测耗时（毫秒） */
  predictedDuration: number;
  /** 实际耗时（毫秒） */
  actualDuration: number;
  /** 反馈时间戳 */
  timestamp: number;
}
```

---

## 编排策略说明

### distributed（均匀分配）

- **使用方法**：调用 `orchestrate()`
- **算法**：轮询分配（Round-Robin），将测试文件按顺序依次分配到各分片
- **特点**：简单快速，不依赖历史数据；每个测试仍会计算时间估算，但不影响分配决策
- **适用场景**：首次运行、无历史数据、测试用例执行时间差异不大

### weighted（加权分配）

- **当前状态**：类型定义中已预留，暂未在代码中实现独立策略
- **设计意图**：按历史执行时间加权分配，使各分片总耗时趋于均衡

### intelligent（智能分片）

- **使用方法**：调用 `optimizeSharding()`
- **算法**：基于 `ShardOptimizer` 的方差感知负载均衡，核心特性包括：
  1. **风险感知负载计算**：分片负载 = Σ(estimatedDuration) + riskPenalty × Σ(√variance)，显式建模不确定性
  2. **多目标优化**：主目标为最小化最大分片负载（makespan），次目标为最小化分片间方差风险差异
  3. **置信度加权**：低置信度测试的预估时间不确定性更高，分配时给予更大的风险惩罚
  4. **两阶段分配**：
     - 第一阶段：高风险测试优先分配，选择方差累计最小的分片（风险分散）
     - 第二阶段：稳定测试按 LPT（最长处理时间优先）分配到有效负载最低的分片
  5. **两两交换重平衡**：分配完成后，尝试通过交换测试来减少分片间负载差异
- **适用场景**：有历史执行数据、测试用例执行时间差异大、需要精确负载均衡

---

## ShardOptimizer 类

方差感知智能分片优化器，被 `Orchestrator.optimizeSharding()` 内部使用。

```typescript
import { ShardOptimizer } from 'yuantest-playwright';
```

### 构造函数

```typescript
new ShardOptimizer(durationHistory?: Map<string, TestDurationHistory>, calibrationFactor?: number)
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `durationHistory` | `Map<string, TestDurationHistory>` | 否 | `new Map()` | 历史执行时间数据 |
| `calibrationFactor` | `number` | 否 | `1.0` | 校准因子 |

### 方法

#### `optimize(assignments: TestAssignment[], totalShards: number): Promise<Map<number, TestAssignment[]>>`

执行方差感知的分片优化，返回分片 ID → 测试分配列表的映射。

| 参数 | 类型 | 说明 |
|------|------|------|
| `assignments` | `TestAssignment[]` | 测试分配列表（需包含 estimatedDuration、durationConfidence、durationVariance） |
| `totalShards` | `number` | 总分片数 |

#### `getShardLoads(): number[]`

获取最近一次优化后的各分片负载（毫秒）。

---

## 时间估算算法

Orchestrator 使用增强版时间估算（`estimateTestDurationDetailed`），决策逻辑如下：

1. **无历史数据**（`runCount === 0`）：
   - 尝试从同类测试推断（同目录下有 ≥2 个历史充足的测试）
   - 推断成功：使用中位数，置信度 `0.3`，来源 `'similar'`
   - 推断失败：使用 `DEFAULTS.TEST_TIMEOUT`，置信度 `0.1`，来源 `'default'`

2. **历史数据不足**（`runCount < 3`）：
   - 混合历史平均与同类推断（按运行次数加权）
   - 置信度基于变异系数和运行次数计算，上限 `0.5`
   - 来源 `'history'`

3. **历史数据充足**（`runCount ≥ 3`）：
   - 使用 EMA（指数移动平均，α = 0.3）
   - 置信度基于变异系数和运行次数计算，上限 `1.0`
   - 来源 `'ema'`

所有估算结果都会乘以校准因子（`calibrationFactor`），该因子通过 `recordShardFeedback()` 自动调整。

### 关键常量

| 常量 | 值 | 说明 |
|------|----|------|
| `EMA_ALPHA` | `0.3` | EMA 平滑系数 |
| `MIN_RUNS_FOR_CONFIDENCE` | `3` | 达到高置信度所需的最小运行次数 |
| `HIGH_VARIANCE_THRESHOLD` | `0.4` | 高风险测试判定阈值 |
| `CALIBRATION_LEARNING_RATE` | `0.2` | 校准因子学习率 |
| `MAX_CALIBRATION_FACTOR` | `2.0` | 校准因子上限 |
| `MIN_CALIBRATION_FACTOR` | `0.5` | 校准因子下限 |

---

## 使用示例

### 基本编排（distributed 策略）

```typescript
import { Orchestrator } from 'yuantest-playwright';

const orchestrator = new Orchestrator({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './test-output',
  shards: 4,
  browsers: ['chromium', 'firefox'],
});

await orchestrator.initialize();
const config = await orchestrator.orchestrate();

console.log(`总分片数: ${config.totalShards}`);
console.log(`编排策略: ${config.strategy}`);
console.log(`测试分配数量: ${config.testAssignment.length}`);
```

### 智能分片（intelligent 策略）

```typescript
import { Orchestrator } from 'yuantest-playwright';

const orchestrator = new Orchestrator({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './test-output',
  shards: 4,
});

await orchestrator.initialize();
const config = await orchestrator.optimizeSharding();

console.log(`编排策略: ${config.strategy}`);
config.testAssignment.forEach((assignment) => {
  console.log(
    `测试: ${assignment.testId}, ` +
    `分片: ${assignment.shardId}, ` +
    `预估耗时: ${assignment.estimatedDuration}ms, ` +
    `置信度: ${assignment.durationConfidence}, ` +
    `来源: ${assignment.estimationSource}`
  );
});
```

### 获取指定分片的测试

```typescript
const shard0Tests = orchestrator.getAssignmentsForShard(0);
console.log(`分片 0 包含 ${shard0Tests.length} 个测试`);
```

### 记录运行结果并反馈校准

```typescript
// 记录测试运行结果
orchestrator.recordRunResults([
  { testId: 'login.spec.ts', duration: 1520 },
  { testId: 'cart.spec.ts', duration: 3200 },
  { testId: 'checkout.spec.ts', duration: 5800 },
]);

// 记录分片预测反馈，触发自动校准
orchestrator.recordShardFeedback({
  shardId: 0,
  predictedDuration: 10000,
  actualDuration: 12000,
  timestamp: Date.now(),
});

// 查看当前校准因子
console.log(`校准因子: ${orchestrator.getCalibrationFactor()}`);
```

### 生成 Playwright 配置

```typescript
const pwConfig = await orchestrator.createPlaywrightConfig();
// pwConfig 可直接用于 Playwright Test Runner
```

### 手动更新单个测试的历史数据

```typescript
orchestrator.updateDurationHistory('login.spec.ts', 1520);
```

### 程序退出前确保数据持久化

```typescript
await orchestrator.flush();
```
