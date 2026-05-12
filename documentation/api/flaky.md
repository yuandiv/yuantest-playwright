# FlakyTestManager API 参考

FlakyTestManager 负责不稳定测试的检测、隔离、根因分析、趋势追踪和失败预测。它继承自 `ManagedManager`，提供完整的生命周期管理（初始化、延迟保存、刷新）。

---

## 构造函数

```typescript
new FlakyTestManager(storagePath?: string, config?: Partial<QuarantineConfig>, storage?: StorageProvider)
```

### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storagePath` | `string` | `'./test-data'` | 数据存储目录路径，历史文件将保存在此目录下的 `flaky-history.json` |
| `config` | `Partial<QuarantineConfig>` | `{}` | 隔离配置，支持部分覆盖，未指定的字段使用默认值 |
| `storage` | `StorageProvider` | `getStorage()` | 存储提供者，用于文件读写操作，默认使用内置存储实现 |

### 默认配置值

构造函数内部会合并以下默认值（来自 `FLAKY_CONFIG` 常量）：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `true` | 是否启用 Flaky 管理 |
| `threshold` | `0.3` | Flaky 检测阈值（加权失败率） |
| `autoQuarantine` | `true` | 是否自动隔离检测到的 Flaky 测试 |
| `minimumRuns` | `5` | 触发隔离所需的最少运行次数 |
| `autoReleaseAfterPasses` | `3` | 自动释放所需的连续通过次数 |
| `quarantineExpiryDays` | `30` | 隔离过期天数 |
| `decayRate` | `0.1` | 加权衰减率 |
| `confidenceLevel` | `0.95` | 统计显著性置信水平 |
| `brokenThreshold` | `5` | 判定为 broken 的连续失败阈值 |
| `regressionWindow` | `5` | 回归分析窗口大小 |
| `enableRootCauseAnalysis` | `true` | 是否启用根因分析 |
| `enableCorrelationAnalysis` | `true` | 是否启用关联分析 |
| `enableTrendTracking` | `true` | 是否启用趋势追踪 |
| `enablePrediction` | `true` | 是否启用失败预测 |
| `enableCausalGraph` | `true` | 是否启用因果图 |
| `quarantineStrategy` | `'graduated'` | 隔离策略类型 |
| `maxQuarantineRatio` | `0.2` | 最大隔离比例 |
| `predictionSensitivity` | `0.5` | 预测灵敏度 |

### 示例

```typescript
import { FlakyTestManager } from 'yuantest-playwright';

// 使用默认配置
const manager = new FlakyTestManager();

// 自定义配置
const manager = new FlakyTestManager('./test-data', {
  threshold: 0.4,
  autoQuarantine: false,
  quarantineStrategy: 'hard',
});
```

---

## 核心方法

### recordTestResult()

记录单条测试结果，更新测试历史、分类、加权失败率，并触发 Flaky 检测和自动隔离逻辑。

```typescript
async recordTestResult(result: TestResult): Promise<void>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `result` | `TestResult` | 测试结果对象 |

#### 行为说明

- 如果测试已存在，追加历史记录（最多保留 50 条），重新计算失败率、加权失败率、连续失败/通过次数和分类
- 如果测试不存在，创建新的 `FlakyTest` 记录
- 当测试结果为 `failed` 或 `timedout` 时，触发 Flaky 检测
- 如果启用了预测且历史记录足够（≥8 条），检测持续时间异常
- 如果测试已被隔离且本次通过，递增连续通过计数并检查是否满足自动释放条件
- 每次调用后会检查并降级过期的隔离测试
- 清空因果图缓存并调度延迟保存

---

### recordRunResults()

记录一次完整运行的所有测试结果，将运行结果缓存到最近运行列表中。

```typescript
async recordRunResults(runResult: RunResult): Promise<void>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `runResult` | `RunResult` | 运行结果对象，包含 suites 及其下的 tests |

#### 行为说明

- 将运行结果追加到 `recentRuns` 缓存（最多保留 20 条）
- 遍历所有 suite 中的 test，逐条调用 `recordTestResult()`

---

### getFlakyTests()

获取符合阈值的 Flaky 测试列表，排除 `broken`、`insufficient_data` 和 `stable` 分类的测试。

```typescript
getFlakyTests(threshold?: number): FlakyTest[]
```

#### 参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `threshold` | `number` | `0.1`（`MONITOR_THRESHOLD`） | 加权失败率阈值 |

#### 返回值

`FlakyTest[]` — 按加权失败率降序排列的 Flaky 测试列表

---

### getAllFlakyTests()

获取所有有过失败记录的测试（失败率 > 0）。

```typescript
getAllFlakyTests(): FlakyTest[]
```

#### 返回值

`FlakyTest[]` — 按加权失败率降序排列的测试列表

---

### getTestById()

根据测试 ID 获取 Flaky 测试记录。

```typescript
getTestById(testId: string): FlakyTest | undefined
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`FlakyTest | undefined` — 测试记录，不存在时返回 `undefined`

---

### isQuarantined()

检查指定测试是否处于隔离状态。

```typescript
isQuarantined(testId: string): boolean
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`boolean` — 是否被隔离

---

### quarantineTest()

将指定测试加入隔离，受隔离预算限制。

```typescript
async quarantineTest(testId: string): Promise<boolean>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`Promise<boolean>` — 是否成功隔离。测试不存在或超出预算时返回 `false`

#### 行为说明

- 测试不存在时返回 `false`
- 检查隔离预算，超出最大比例且测试未被隔离时返回 `false`
- 设置隔离状态、隔离时间和连续通过计数归零
- 如果隔离策略为 `graduated`，根据策略生成隔离级别（`none`/`monitor` 会被提升为 `soft_quarantine`）；否则设为 `hard_quarantine`
- 触发 `quarantine_updated` 事件并立即保存历史

---

### releaseTest()

释放指定测试的隔离状态。

```typescript
async releaseTest(testId: string, options?: { resetHistory?: boolean }): Promise<boolean>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |
| `options` | `{ resetHistory?: boolean }` | 可选配置 |
| `options.resetHistory` | `boolean` | 是否重置历史记录，默认 `false`。设为 `true` 时清空历史、失败率、分类、根因、趋势、健康评分等所有分析数据 |

#### 返回值

`Promise<boolean>` — 是否成功释放。测试未被隔离时返回 `false`

#### 行为说明

- 重置隔离状态、隔离级别、连续通过计数
- 如果 `resetHistory` 为 `true`，清空所有统计数据
- 触发 `quarantine_updated` 事件并立即保存历史

---

### getQuarantinedTests()

获取所有处于隔离状态的测试列表。

```typescript
getQuarantinedTests(): FlakyTest[]
```

#### 返回值

`FlakyTest[]` — 隔离测试列表

---

### getQuarantinedTestTitles()

获取所有隔离测试的标题列表，过滤掉空标题。

```typescript
getQuarantinedTestTitles(): string[]
```

#### 返回值

`string[]` — 隔离测试标题列表

---

### buildGrepInvertPattern()

构建用于 Playwright `--grep-invert` 的正则模式，排除 `hard_quarantine` 和 `soft_quarantine` 级别的隔离测试。

```typescript
buildGrepInvertPattern(): string | null
```

#### 返回值

`string | null` — 正则模式字符串，无隔离测试时返回 `null`。标题中的正则特殊字符会被转义

---

### clearHistory()

清除测试历史记录。

```typescript
async clearHistory(testId?: string): Promise<void>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 可选，指定测试 ID。不传则清除所有测试历史 |

#### 行为说明

- 指定 `testId` 时，仅删除该测试记录和隔离状态
- 不指定时，清空所有测试记录和隔离集合
- 清空因果图缓存并立即保存历史

---

## 分析方法

### analyzeRootCause()

对指定测试进行根因分析，综合运行历史和上下文信息判断 Flaky 的根本原因。

```typescript
async analyzeRootCause(testId: string, context?: AnalysisContext): Promise<RootCauseAnalysis | null>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |
| `context` | `AnalysisContext` | 可选，分析上下文。不传时使用内部缓存的 `recentRuns` |

#### 返回值

`Promise<RootCauseAnalysis | null>` — 根因分析结果。未启用根因分析、测试不存在或无历史时返回 `null`

#### AnalysisContext 类型

```typescript
interface AnalysisContext {
  recentRuns: RunResult[];       // 最近 N 次运行结果
  shardMap?: Map<string, number>; // 分片信息映射：testId -> shardId
  ciNodeInfo?: Map<string, string>; // CI 节点信息：runId -> nodeLabel
}
```

---

### analyzeCorrelations()

分析同次运行中多个 Flaky 测试的关联性，如果多个测试频繁在同一次运行中一起失败，可能是环境问题。

```typescript
analyzeCorrelations(config?: Partial<CorrelationConfig>): CorrelationGroup[]
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `Partial<CorrelationConfig>` | 可选，关联分析配置 |

#### 返回值

`CorrelationGroup[]` — 关联组列表。未启用关联分析时返回空数组

#### CorrelationConfig 类型

```typescript
interface CorrelationConfig {
  coOccurrenceThreshold: number; // 共现阈值（Jaccard 系数），默认 0.6
  minRuns: number;               // 最少运行次数，默认 3
}
```

---

### analyzeTrend()

对指定测试进行趋势分析，包括时间序列聚合、趋势方向、变点检测、季节模式和预测。

```typescript
async analyzeTrend(testId: string, codeChanges?: CodeChangeCorrelation[]): Promise<TrendAnalysis | null>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |
| `codeChanges` | `CodeChangeCorrelation[]` | 可选，代码变更记录，用于关联分析 |

#### 返回值

`Promise<TrendAnalysis | null>` — 趋势分析结果。未启用趋势追踪、测试不存在或历史数据不足（<5 条）时返回 `null`

#### 行为说明

- 分析完成后更新测试的 `trendAnalysis` 和 `healthScore`
- 调度延迟保存

---

### analyzeAllTrends()

对所有 Flaky 测试进行批量趋势分析。

```typescript
async analyzeAllTrends(codeChanges?: CodeChangeCorrelation[]): Promise<Map<string, TrendAnalysis>>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `codeChanges` | `CodeChangeCorrelation[]` | 可选，代码变更记录 |

#### 返回值

`Promise<Map<string, TrendAnalysis>>` — 测试 ID 到趋势分析结果的映射。仅分析历史数据 ≥5 条的测试

---

### predictTestFailure()

对指定测试进行失败预测，基于持续时间异常、失败模式、环境偏移、资源压力等信号。

```typescript
async predictTestFailure(testId: string): Promise<PredictionResult | null>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`Promise<PredictionResult | null>` — 预测结果。未启用预测、测试不存在或历史不足（<8 条）时返回 `null`

#### 行为说明

- 预测完成后更新测试的 `lastPrediction` 和 `durationAnomaly`
- 调度延迟保存

---

### getHighRiskTests()

批量获取高风险测试预测结果。

```typescript
async getHighRiskTests(): Promise<PredictionResult[]>
```

#### 返回值

`Promise<PredictionResult[]>` — 预测将失败的测试列表。未启用预测时返回空数组

---

### getDurationAnomalies()

获取所有持续时间异常的测试。

```typescript
async getDurationAnomalies(): Promise<DurationAnomaly[]>
```

#### 返回值

`Promise<DurationAnomaly[]>` — 异常列表。未启用预测时返回空数组

---

### buildCausalGraph()

构建因果依赖图，综合测试数据、关联组和运行结果。

```typescript
async buildCausalGraph(): Promise<CausalGraph>
```

#### 返回值

`Promise<CausalGraph>` — 因果图。未启用因果图时返回空图（`{ nodes: [], edges: [], rootCauses: [], impactMap: new Map(), builtAt: Date.now() }`）

#### 行为说明

- 使用缓存机制，数据未变更时返回缓存的因果图
- 构建新图时自动调用 `analyzeCorrelations()` 获取关联数据

---

### analyzeImpact()

分析指定测试的影响范围。

```typescript
async analyzeImpact(testId: string): Promise<ImpactAnalysis | null>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`Promise<ImpactAnalysis | null>` — 影响分析结果。未启用因果图时返回 `null`

---

### getRootCauses()

获取因果图的根因节点列表。

```typescript
async getRootCauses(): Promise<CausalNode[]>
```

#### 返回值

`Promise<CausalNode[]>` — 根因节点列表

---

## 统计方法

### getQuarantineStats()

获取隔离统计信息。

```typescript
getQuarantineStats(): {
  totalTests: number;
  quarantined: number;
  flakyRate: number;
  topFlaky: FlakyTest[];
  expiredQuarantined: number;
  classificationBreakdown: Record<FlakyClassification, number>;
  budgetUtilization: number;
  avgHealthScore: number;
}
```

#### 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `totalTests` | `number` | 追踪的测试总数 |
| `quarantined` | `number` | 隔离中的测试数量 |
| `flakyRate` | `number` | Flaky 测试占比（百分比） |
| `topFlaky` | `FlakyTest[]` | 失败率最高的前 10 个测试 |
| `expiredQuarantined` | `number` | 过期隔离的测试数量 |
| `classificationBreakdown` | `Record<FlakyClassification, number>` | 各分类的测试数量统计 |
| `budgetUtilization` | `number` | 隔离预算使用率 |
| `avgHealthScore` | `number` | 平均健康评分 |

---

### getOverallHealthScore()

获取项目整体健康评分，综合所有测试的健康评分计算项目级评分。

```typescript
async getOverallHealthScore(): Promise<FlakyHealthScore>
```

#### 返回值

`Promise<FlakyHealthScore>` — 健康评分对象

#### 评分计算

- **stability**（权重 0.35）：基于加权失败率的稳定性
- **trend**（权重 0.25）：趋势方向评分
- **recoverability**（权重 0.2）：恢复能力评分
- **predictability**（权重 0.2）：可预测性评分

#### 等级映射

| 分数范围 | 等级 | 标签 |
|----------|------|------|
| ≥ 0.9 | A | 非常健康 |
| ≥ 0.75 | B | 基本健康 |
| ≥ 0.6 | C | 需要关注 |
| ≥ 0.4 | D | 不健康 |
| < 0.4 | F | 严重不健康 |

#### 特殊情况

无测试数据时返回 `{ overall: 1, breakdown: { stability: 1, trend: 0.7, recoverability: 1, predictability: 0.5 }, grade: 'A', label: '无测试数据' }`

---

### getFailureAnalysis()

获取失败分析结果，支持按类型过滤。

```typescript
async getFailureAnalysis(filter?: 'persistent' | 'emerging' | 'immediate'): Promise<FailureAnalysisResult>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `filter` | `'persistent' \| 'emerging' \| 'immediate'` | 可选，过滤类型 |

#### 返回值

`Promise<FailureAnalysisResult>` — 根据过滤条件返回不同类型：

| 过滤条件 | 返回类型 | 说明 |
|----------|----------|------|
| 不传 | `FailureAnalysisSummary` | 失败分析汇总 |
| `'persistent'` | `FlakyTest[]` | 持续失败的测试（分类为 `broken`） |
| `'emerging'` | `FlakyTest[]` | 新兴失败测试（连续失败 ≥2 次） |
| `'immediate'` | `ImmediateFailure[]` | 最近一次运行中的首次失败 |

---

### getImmediateFailures()

获取最近一次运行中的首次失败测试（无历史记录的失败）。

```typescript
async getImmediateFailures(): Promise<ImmediateFailure[]>
```

#### 返回值

`Promise<ImmediateFailure[]>` — 首次失败列表。无运行记录时返回空数组

---

## 配置方法

### setConfig()

更新管理器配置，支持同时更新 Flaky 判定标准和隔离标准。

```typescript
setConfig(config: Partial<QuarantineConfig> & {
  flakyCriteria?: Partial<FlakyCriteriaConfig>;
  quarantineCriteria?: Partial<QuarantineCriteriaConfig>;
}): void
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `Partial<QuarantineConfig> & { flakyCriteria?, quarantineCriteria? }` | 配置对象，支持部分覆盖 |

#### 行为说明

- `QuarantineConfig` 部分直接合并覆盖
- `flakyCriteria` 通过 `mergeFlakyCriteria()` 合并，保留未指定的默认值
- `quarantineCriteria` 通过 `mergeQuarantineCriteria()` 合并，并重建 `QuarantineStrategyManager`

---

### getConfig()

获取当前隔离配置的副本。

```typescript
getConfig(): QuarantineConfig
```

#### 返回值

`QuarantineConfig` — 当前配置的浅拷贝

---

### getEffectiveConfig()

获取当前生效的完整配置，包含默认值填充后的 Flaky 判定标准和隔离标准。

```typescript
getEffectiveConfig(): {
  config: QuarantineConfig;
  flakyCriteria: FlakyCriteriaConfig;
  quarantineCriteria: QuarantineCriteriaConfig;
}
```

#### 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `config` | `QuarantineConfig` | 隔离配置 |
| `flakyCriteria` | `FlakyCriteriaConfig` | Flaky 判定标准配置 |
| `quarantineCriteria` | `QuarantineCriteriaConfig` | 隔离标准配置 |

---

## 隔离策略方法

### getQuarantineStrategy()

获取指定测试的隔离策略。

```typescript
async getQuarantineStrategy(testId: string): Promise<QuarantineStrategy | null>
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`Promise<QuarantineStrategy | null>` — 隔离策略。测试不存在时返回 `null`

#### 行为说明

- 如果测试已有 `quarantineStrategy`，直接返回
- 否则通过 `generateQuarantineStrategy()` 动态生成

---

### getQuarantineBudget()

获取隔离预算使用情况。

```typescript
getQuarantineBudget(): { allowed: boolean; remaining: number; utilization: number }
```

#### 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `allowed` | `boolean` | 是否允许继续隔离 |
| `remaining` | `number` | 剩余可隔离数量 |
| `utilization` | `number` | 当前隔离使用率 |

---

### getTestsByIsolationLevel()

获取按隔离级别分组的测试。

```typescript
getTestsByIsolationLevel(): Record<IsolationLevel, FlakyTest[]>
```

#### 返回值

`Record<IsolationLevel, FlakyTest[]>` — 各隔离级别的测试列表映射，包含 `none`、`monitor`、`soft_quarantine`、`hard_quarantine` 四个分组

---

### getTestsByClassification()

按分类获取测试列表。

```typescript
getTestsByClassification(classification: FlakyClassification): FlakyTest[]
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `classification` | `FlakyClassification` | 分类类型 |

#### 返回值

`FlakyTest[]` — 匹配分类的测试列表，按加权失败率降序排列

---

### getTestsToSkip()

获取需要跳过的测试 ID 列表（隔离级别为 `hard_quarantine` 或 `soft_quarantine` 的测试）。

```typescript
getTestsToSkip(): string[]
```

#### 返回值

`string[]` — 需要跳过的测试 ID 列表

---

### isQuarantineExpired()

检查指定测试的隔离是否已过期。

```typescript
isQuarantineExpired(testId: string): boolean
```

#### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

#### 返回值

`boolean` — 隔离是否已过期。测试不存在或未被隔离时返回 `false`

#### 过期判定

隔离时间超过 `quarantineExpiryDays`（默认 30 天）即视为过期

---

### getExpiredQuarantinedTests()

获取所有隔离已过期的测试列表。

```typescript
getExpiredQuarantinedTests(): FlakyTest[]
```

#### 返回值

`FlakyTest[]` — 过期隔离测试列表

---

## 事件

FlakyTestManager 继承自 `ManagedManager`（EventEmitter），会触发以下事件：

| 事件名 | 触发时机 | Payload |
|--------|----------|---------|
| `flaky_detected` | 检测到 Flaky 测试时 | `{ testId, title, failureRate, weightedFailureRate, classification, rootCause, isolationLevel, timestamp }` |
| `quarantine_updated` | 隔离状态变更时 | `{ testId, action: 'quarantined' \| 'released', flakyTest }` |
| `auto_released` | 自动释放隔离测试时 | `{ testId, title, consecutivePasses }` |
| `quarantine_downgraded` | 隔离级别降级时 | `{ testId, title, fromLevel, toLevel }` |

---

## 完整类型定义

### FlakyTest

```typescript
interface FlakyTest {
  testId: string;                              // 测试唯一标识
  title: string;                               // 测试标题
  failureRate: number;                         // 原始失败率（0-1）
  totalRuns: number;                           // 总运行次数
  lastFailure?: number;                        // 最后一次失败的时间戳
  isQuarantined: boolean;                      // 是否处于隔离状态
  quarantinedAt?: number;                      // 隔离开始时间戳
  consecutivePassesSinceQuarantine?: number;   // 隔离后连续通过次数
  history: FlakyHistoryEntry[];                // 历史记录
  classification: FlakyClassification;         // 测试分类
  weightedFailureRate: number;                 // 加权失败率（近期权重更高）
  consecutiveFailures: number;                 // 当前连续失败次数
  consecutivePasses: number;                   // 当前连续通过次数
  lastClassifiedAt?: number;                   // 最后分类时间戳
  rootCause?: RootCauseAnalysis;               // 根因分析结果
  isolationLevel?: IsolationLevel;             // 隔离级别
  quarantineStrategy?: QuarantineStrategy;     // 隔离策略
  trendAnalysis?: TrendAnalysis;               // 趋势分析结果
  healthScore?: FlakyHealthScore;              // 健康评分
  durationAnomaly?: DurationAnomaly;           // 持续时间异常
  lastPrediction?: PredictionResult;           // 最近一次预测结果
  aiDiagnosis?: AIDiagnosis;                   // AI 诊断结果
}
```

### FlakyHistoryEntry

```typescript
interface FlakyHistoryEntry {
  timestamp: number;                                    // 时间戳
  status: 'passed' | 'failed' | 'skipped' | 'timedout'; // 运行状态
  duration: number;                                     // 运行耗时（毫秒）
  error?: string;                                       // 错误信息
}
```

### FlakyClassification

```typescript
type FlakyClassification =
  | 'flaky'              // 不稳定：通过和失败交替出现
  | 'broken'             // 损坏：持续失败（连续失败 ≥5 次）
  | 'regression'         // 回归：近期失败率显著高于早期
  | 'monitor'            // 监控：失败率较低但值得关注
  | 'stable'             // 稳定：失败率极低
  | 'insufficient_data'; // 数据不足：运行次数不够判定
```

### IsolationLevel

```typescript
type IsolationLevel =
  | 'none'              // 无隔离
  | 'monitor'           // 监控模式
  | 'soft_quarantine'   // 软隔离（重试策略）
  | 'hard_quarantine';  // 硬隔离（跳过测试）
```

### QuarantineStrategyType

```typescript
type QuarantineStrategyType =
  | 'skip'       // 跳过测试
  | 'retry_only' // 仅重试
  | 'soft'       // 软隔离
  | 'hard'       // 硬隔离
  | 'graduated'; // 渐进式隔离
```

### QuarantineConfig

```typescript
interface QuarantineConfig {
  enabled: boolean;                       // 是否启用 Flaky 管理
  threshold: number;                      // Flaky 检测阈值
  autoQuarantine: boolean;                // 是否自动隔离
  minimumRuns?: number;                   // 最少运行次数
  autoReleaseAfterPasses?: number;        // 自动释放所需连续通过次数
  quarantineExpiryDays?: number;          // 隔离过期天数
  decayRate?: number;                     // 加权衰减率
  confidenceLevel?: number;               // 统计显著性置信水平
  brokenThreshold?: number;               // broken 判定阈值
  regressionWindow?: number;              // 回归分析窗口
  enableRootCauseAnalysis?: boolean;      // 启用根因分析
  enableCorrelationAnalysis?: boolean;    // 启用关联分析
  enableTrendTracking?: boolean;          // 启用趋势追踪
  enablePrediction?: boolean;             // 启用失败预测
  enableCausalGraph?: boolean;            // 启用因果图
  quarantineStrategy?: QuarantineStrategyType; // 隔离策略类型
  maxQuarantineRatio?: number;            // 最大隔离比例
  predictionSensitivity?: number;         // 预测灵敏度
}
```

### QuarantineStrategy

```typescript
interface QuarantineStrategy {
  testId: string;                         // 测试 ID
  strategy: QuarantineStrategyType;       // 策略类型
  isolationLevel: IsolationLevel;         // 隔离级别
  retryPolicy: RetryPolicy;               // 重试策略
  reason: string;                         // 隔离原因
  expiresAt?: number;                     // 过期时间戳
}
```

### RetryPolicy

```typescript
interface RetryPolicy {
  maxRetries: number;         // 最大重试次数
  retryDelay: number;         // 重试延迟（毫秒）
  backoffMultiplier: number;  // 退避倍数
  retryOnPassOnly: boolean;   // 是否仅在通过时重试
}
```

### RootCauseAnalysis

```typescript
interface RootCauseAnalysis {
  testId: string;                   // 测试 ID
  primaryCause: RootCauseType;      // 主要根因类型
  confidence: number;               // 置信度（0-1）
  evidence: RootCauseEvidence[];     // 证据列表
  suggestedActions: string[];        // 建议操作
  analyzedAt: number;                // 分析时间戳
}
```

### RootCauseType

```typescript
type RootCauseType =
  | 'timing'            // 时序问题
  | 'data_race'         // 数据竞争
  | 'environment'       // 环境问题
  | 'external_service'  // 外部服务
  | 'test_order'        // 测试顺序
  | 'resource_leak'     // 资源泄漏
  | 'assertion_flaky'   // 断言不稳定
  | 'unknown';          // 未知原因
```

### RootCauseEvidence

```typescript
interface RootCauseEvidence {
  type: RootCauseType;       // 根因类型
  indicators: string[];      // 指标列表
  confidence: number;        // 置信度（0-1）
  description: string;       // 描述
}
```

### CorrelationGroup

```typescript
interface CorrelationGroup {
  groupId: string;                  // 关联组 ID
  testIds: string[];                // 关联的测试 ID 列表
  correlationType: CorrelationType; // 关联类型
  confidence: number;               // 置信度（0-1）
  evidence: string;                 // 证据描述
}
```

### CorrelationType

```typescript
type CorrelationType =
  | 'same_run'            // 同次运行
  | 'same_shard'          // 同分片
  | 'same_time_window'    // 同时间窗口
  | 'same_error_pattern'  // 同错误模式
  | 'same_file';          // 同文件
```

### TrendAnalysis

```typescript
interface TrendAnalysis {
  testId: string;                           // 测试 ID
  direction: TrendDirection;                // 趋势方向
  slope: number;                            // 斜率
  r2: number;                               // R² 拟合度
  dataPoints: TrendDataPoint[];             // 数据点
  changePoints: ChangePoint[];              // 变点列表
  seasonalPattern: SeasonalPattern | null;  // 季节模式
  codeChangeCorrelations: CodeChangeCorrelation[]; // 代码变更关联
  forecast: TrendForecast;                  // 预测
  analyzedAt: number;                       // 分析时间戳
}
```

### TrendDirection

```typescript
type TrendDirection =
  | 'improving'  // 改善中
  | 'stable'     // 稳定
  | 'degrading'  // 恶化中
  | 'volatile';  // 波动
```

### TrendDataPoint

```typescript
interface TrendDataPoint {
  timestamp: number;    // 时间戳
  passRate: number;     // 通过率
  failRate: number;     // 失败率
  avgDuration: number;  // 平均耗时
  flakyCount: number;   // Flaky 数量
  totalRuns: number;    // 总运行次数
}
```

### ChangePoint

```typescript
interface ChangePoint {
  timestamp: number;    // 变点时间戳
  beforeRate: number;   // 变点前失败率
  afterRate: number;    // 变点后失败率
  magnitude: number;    // 变化幅度
  confidence: number;   // 置信度
}
```

### SeasonalPattern

```typescript
interface SeasonalPattern {
  period: 'hourly' | 'daily' | 'weekly'; // 周期类型
  peakHours: number[];                     // 高峰时段
  peakDays: number[];                      // 高峰日期
  amplitude: number;                       // 振幅
  confidence: number;                      // 置信度
}
```

### CodeChangeCorrelation

```typescript
interface CodeChangeCorrelation {
  commitHash: string;       // 提交哈希
  commitMessage: string;    // 提交信息
  timestamp: number;        // 提交时间戳
  author: string;           // 作者
  affectedFiles: string[];  // 影响的文件列表
  correlationScore: number; // 关联评分
  flakyRateBefore: number;  // 变更前失败率
  flakyRateAfter: number;   // 变更后失败率
}
```

### TrendForecast

```typescript
interface TrendForecast {
  next7Days: TrendDataPoint[];    // 未来 7 天预测
  confidence: number;              // 预测置信度
  projectedDirection: TrendDirection; // 预测趋势方向
}
```

### FlakyHealthScore

```typescript
interface FlakyHealthScore {
  overall: number;            // 综合评分（0-1）
  breakdown: {
    stability: number;        // 稳定性评分
    trend: number;            // 趋势评分
    recoverability: number;   // 恢复能力评分
    predictability: number;   // 可预测性评分
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F'; // 等级
  label: string;              // 等级标签
}
```

### PredictionResult

```typescript
interface PredictionResult {
  testId: string;              // 测试 ID
  willFail: boolean;           // 是否预测失败
  probability: number;         // 失败概率
  confidence: number;          // 预测置信度
  signals: PredictionSignal[]; // 预测信号列表
  recommendedAction: string;   // 建议操作
  predictedAt: number;         // 预测时间戳
}
```

### PredictionSignal

```typescript
interface PredictionSignal {
  type: 'duration_anomaly' | 'failure_pattern' | 'environment_shift' | 'code_change' | 'resource_pressure';
  strength: number;                   // 信号强度
  description: string;                // 信号描述
  data: Record<string, unknown>;      // 信号数据
}
```

### DurationAnomaly

```typescript
interface DurationAnomaly {
  testId: string;       // 测试 ID
  baseline: number;     // 基线耗时
  current: number;      // 当前耗时
  deviation: number;    // 偏差
  isAnomaly: boolean;   // 是否异常
  zScore: number;       // Z 分数
  detectedAt: number;   // 检测时间戳
}
```

### CausalGraph

```typescript
interface CausalGraph {
  nodes: CausalNode[];              // 因果节点列表
  edges: CausalEdge[];              // 因果边列表
  rootCauses: CausalNode[];         // 根因节点列表
  impactMap: Map<string, string[]>; // 影响映射：节点 ID -> 受影响的节点 ID 列表
  builtAt: number;                  // 构建时间戳
}
```

### CausalNode

```typescript
interface CausalNode {
  id: string;                                                    // 节点 ID
  type: 'test' | 'infrastructure' | 'external_service' | 'shared_state'; // 节点类型
  label: string;                                                 // 节点标签
  metadata: Record<string, unknown>;                             // 节点元数据
}
```

### CausalEdge

```typescript
interface CausalEdge {
  from: string;           // 起始节点 ID
  to: string;             // 目标节点 ID
  weight: number;         // 权重
  type: 'depends_on' | 'shares_resource' | 'same_environment' | 'sequential' | 'correlated_failure';
  confidence: number;     // 置信度
}
```

### ImpactAnalysis

```typescript
interface ImpactAnalysis {
  testId: string;                           // 测试 ID
  directlyAffected: string[];               // 直接受影响的测试 ID 列表
  indirectlyAffected: string[];             // 间接受影响的测试 ID 列表
  totalImpact: number;                      // 总影响数
  riskLevel: 'low' | 'medium' | 'high' | 'critical'; // 风险等级
  recommendation: string;                   // 建议
}
```

### ImmediateFailure

```typescript
interface ImmediateFailure {
  testId: string;       // 测试 ID
  title: string;        // 测试标题
  error?: string;       // 错误信息
  status: string;       // 运行状态
  timestamp: number;    // 时间戳
  duration?: number;    // 运行耗时
}
```

### FailureAnalysisSummary

```typescript
interface FailureAnalysisSummary {
  total: number;                          // 总测试数
  persistent: number;                     // 持续失败数
  emerging: number;                       // 新兴失败数
  firstTimeFailures: number;              // 首次失败数
  byClassification: Record<string, number>; // 各分类统计
}
```

### FailureAnalysisResult

```typescript
type FailureAnalysisResult =
  | FailureAnalysisSummary   // 不传 filter 时
  | FlakyTest[]              // filter 为 'persistent' 或 'emerging' 时
  | ImmediateFailure[];      // filter 为 'immediate' 时
```

### FlakyCriteriaConfig

```typescript
interface FlakyCriteriaConfig {
  minimumRuns: number;                  // 最少运行次数，默认 5
  flakyThreshold: number;               // Flaky 阈值，默认 0.3
  monitorThreshold: number;             // 监控阈值，默认 0.1
  stableThreshold: number;              // 稳定阈值，默认 0.05
  highThreshold: number;                // 高风险阈值，默认 0.5
  brokenConsecutiveThreshold: number;   // broken 连续失败阈值，默认 5
  regressionWindow: number;             // 回归窗口，默认 5
  regressionRecentFailRate: number;     // 回归近期失败率阈值，默认 0.6
  regressionOlderFailRate: number;      // 回归早期失败率阈值，默认 0.2
  decayRate: number;                    // 衰减率，默认 0.1
  confidenceLevel: number;              // 置信水平，默认 0.95
  autoReleaseAfterPasses: number;       // 自动释放通过次数，默认 3
}
```

### QuarantineCriteriaConfig

```typescript
interface QuarantineCriteriaConfig {
  softThreshold: number;                      // 软隔离阈值，默认 0.15
  hardThreshold: number;                      // 硬隔离阈值，默认 0.4
  maxQuarantineRatio: number;                 // 最大隔离比例，默认 0.2
  autoReleaseHardQuarantinePasses: number;    // 硬隔离自动释放通过次数，默认 5
  quarantineExpiryDays: number;               // 隔离过期天数，默认 30
  quarantineExpiryDowngrade: boolean;         // 过期是否降级，默认 true
  retryMax: number;                           // 最大重试次数，默认 3
  retryDelayMs: number;                       // 重试延迟（毫秒），默认 1000
  retryBackoff: number;                       // 重试退避倍数，默认 2
}
```

### TestResult

```typescript
interface TestResult {
  id: string;                                          // 测试 ID
  title: string;                                       // 测试标题
  fullTitle?: string;                                  // 完整标题
  file?: string;                                       // 文件路径
  line?: number;                                       // 行号
  column?: number;                                     // 列号
  status: 'passed' | 'failed' | 'skipped' | 'timedout'; // 运行状态
  duration: number;                                    // 运行耗时（毫秒）
  error?: string;                                      // 错误信息
  retries: number;                                     // 重试次数
  manualReruns?: number;                               // 手动重跑次数
  runHistory?: TestRunHistory[];                       // 运行历史
  timestamp: number;                                   // 时间戳
  browser: BrowserType;                                // 浏览器类型
  shard?: number;                                      // 分片编号
  screenshots?: string[];                              // 截图路径
  videos?: string[];                                   // 视频路径
  traces?: string[];                                   // Trace 路径
  logs?: string[];                                     // 日志
  stackTrace?: string;                                 // 堆栈跟踪
}
```

### RunResult

```typescript
interface RunResult {
  id: string;                                          // 运行 ID
  version: string;                                     // 版本号
  status: 'success' | 'failed' | 'cancelled' | 'running'; // 运行状态
  startTime: number;                                   // 开始时间戳
  endTime?: number;                                    // 结束时间戳
  duration?: number;                                   // 总耗时
  suites: SuiteResult[];                               // 测试套件列表
  totalTests: number;                                  // 总测试数
  passed: number;                                      // 通过数
  failed: number;                                      // 失败数
  skipped: number;                                     // 跳过数
  flakyTests: TestResult[];                            // Flaky 测试列表
  metadata?: RunMetadata;                              // 运行元数据
}
```

### SuiteResult

```typescript
interface SuiteResult {
  name: string;           // 套件名称
  totalTests: number;     // 总测试数
  passed: number;         // 通过数
  failed: number;         // 失败数
  skipped: number;        // 跳过数
  duration: number;       // 耗时
  tests: TestResult[];    // 测试结果列表
  timestamp: number;      // 时间戳
}
```

---

## 常量默认值

以下常量来自 `FLAKY_CONFIG`，定义了各功能模块的默认参数：

| 常量 | 值 | 说明 |
|------|----|------|
| `DEFAULT_THRESHOLD` | `0.3` | Flaky 检测默认阈值 |
| `MONITOR_THRESHOLD` | `0.1` | 监控阈值 |
| `HIGH_THRESHOLD` | `0.5` | 高风险阈值 |
| `MAX_HISTORY_ENTRIES` | `50` | 最大历史记录条数 |
| `MINIMUM_RUNS_FOR_QUARANTINE` | `5` | 隔离所需最少运行次数 |
| `AUTO_RELEASE_AFTER_PASSES` | `3` | 自动释放连续通过次数 |
| `AUTO_RELEASE_HARD_QUARANTINE_PASSES` | `5` | 硬隔离自动释放通过次数 |
| `QUARANTINE_EXPIRY_DAYS` | `30` | 隔离过期天数 |
| `QUARANTINE_EXPIRY_DOWNGRADE` | `true` | 过期是否降级 |
| `DECAY_RATE` | `0.1` | 加权衰减率 |
| `CONFIDENCE_LEVEL` | `0.95` | 统计置信水平 |
| `BROKEN_CONSECUTIVE_THRESHOLD` | `5` | broken 连续失败阈值 |
| `REGRESSION_WINDOW` | `5` | 回归分析窗口 |
| `CORRELATION_CO_OCCURRENCE_THRESHOLD` | `0.6` | 关联共现阈值 |
| `CORRELATION_MIN_RUNS` | `3` | 关联分析最少运行次数 |
| `TREND_AGGREGATION_WINDOW_DAYS` | `7` | 趋势聚合窗口（天） |
| `TREND_MIN_DATA_POINTS` | `5` | 趋势分析最少数据点 |
| `TREND_CHANGE_POINT_THRESHOLD` | `0.3` | 变点检测阈值 |
| `TREND_SEASONAL_MIN_CYCLES` | `3` | 季节模式最少周期数 |
| `PREDICTION_WINDOW_RUNS` | `10` | 预测窗口运行次数 |
| `PREDICTION_DURATION_ANOMALY_ZSCORE` | `2.0` | 持续时间异常 Z 分数阈值 |
| `PREDICTION_MIN_HISTORY` | `8` | 预测所需最少历史记录 |
| `PREDICTION_SENSITIVITY` | `0.5` | 预测灵敏度 |
| `QUARANTINE_MAX_RATIO` | `0.2` | 最大隔离比例 |
| `QUARANTINE_SOFT_THRESHOLD` | `0.15` | 软隔离阈值 |
| `QUARANTINE_HARD_THRESHOLD` | `0.4` | 硬隔离阈值 |
| `QUARANTINE_RETRY_MAX` | `3` | 隔离重试最大次数 |
| `QUARANTINE_RETRY_DELAY_MS` | `1000` | 隔离重试延迟 |
| `QUARANTINE_RETRY_BACKOFF` | `2` | 隔离重试退避倍数 |
| `CAUSAL_MIN_CORRELATION` | `0.4` | 因果图最小关联度 |
| `CAUSAL_MAX_DEPTH` | `5` | 因果图最大深度 |
| `HEALTH_SCORE_WEIGHTS.stability` | `0.35` | 稳定性权重 |
| `HEALTH_SCORE_WEIGHTS.trend` | `0.25` | 趋势权重 |
| `HEALTH_SCORE_WEIGHTS.recoverability` | `0.2` | 恢复能力权重 |
| `HEALTH_SCORE_WEIGHTS.predictability` | `0.2` | 可预测性权重 |
