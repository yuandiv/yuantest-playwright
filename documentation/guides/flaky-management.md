# Flaky 测试管理深度指南

本指南深入介绍 Flaky 测试管理系统的设计原理、核心算法和配置方式。所有内容均与项目源码实现保持一致。

---

## 目录

- [1. 系统架构概览](#1-系统架构概览)
- [2. 分类算法](#2-分类算法)
  - [2.1 六种分类](#21-六种分类)
  - [2.2 时间衰减加权失败率](#22-时间衰减加权失败率)
  - [2.3 Wilson 置信区间](#23-wilson-置信区间)
  - [2.4 统计显著性检验](#24-统计显著性检验)
  - [2.5 分类判定流程](#25-分类判定流程)
- [3. 根因分析](#3-根因分析)
  - [3.1 七种根因类型](#31-七种根因类型)
  - [3.2 各检测器详解](#32-各检测器详解)
  - [3.3 建议操作](#33-建议操作)
- [4. 关联分析](#4-关联分析)
  - [4.1 关联类型](#41-关联类型)
  - [4.2 Jaccard 共现系数](#42-jaccard-共现系数)
  - [4.3 并查集合并](#43-并查集合并)
  - [4.4 关联类型判定](#44-关联类型判定)
- [5. 趋势追踪](#5-趋势追踪)
  - [5.1 时间序列聚合](#51-时间序列聚合)
  - [5.2 趋势方向检测](#52-趋势方向检测)
  - [5.3 变点检测](#53-变点检测)
  - [5.4 季节模式检测](#54-季节模式检测)
  - [5.5 代码变更关联](#55-代码变更关联)
  - [5.6 趋势预测](#56-趋势预测)
- [6. 隔离策略](#6-隔离策略)
  - [6.1 隔离级别](#61-隔离级别)
  - [6.2 策略类型](#62-策略类型)
  - [6.3 分级隔离判定](#63-分级隔离判定)
  - [6.4 根因感知重试策略](#64-根因感知重试策略)
  - [6.5 预算控制](#65-预算控制)
  - [6.6 自动释放与过期降级](#66-自动释放与过期降级)
- [7. 健康评分](#7-健康评分)
  - [7.1 四维评分模型](#71-四维评分模型)
  - [7.2 等级映射](#72-等级映射)
- [8. 因果图](#8-因果图)
  - [8.1 节点类型](#81-节点类型)
  - [8.2 边类型](#82-边类型)
  - [8.3 图构建流程](#83-图构建流程)
  - [8.4 根因识别](#84-根因识别)
  - [8.5 影响分析](#85-影响分析)
- [9. 参数自定义](#9-参数自定义)
  - [9.1 FlakyCriteriaConfig（12 个参数）](#91-flakycriteriaconfig12-个参数)
  - [9.2 QuarantineCriteriaConfig（9 个参数）](#92-quarantinecriteriaconfig9-个参数)
  - [9.3 自定义方式](#93-自定义方式)

---

## 1. 系统架构概览

Flaky 测试管理系统由以下核心模块组成，对应源码 `src/flaky/` 目录：

| 模块 | 源文件 | 职责 |
|------|--------|------|
| 分类器 | `classifier.ts` | 根据运行历史将测试分为 6 种分类 |
| 根因分析 | `root-cause.ts` | 识别 7 种根因类型 |
| 关联分析 | `correlation.ts` | 发现测试间的共现关联 |
| 趋势追踪 | `trend.ts` | 时间序列分析、变点检测、预测 |
| 隔离策略 | `quarantine-strategy.ts` | 分级隔离、重试策略、预算管理 |
| 因果图 | `causal-graph.ts` | 构建因果依赖图、影响分析 |
| 管理器 | `index.ts` | `FlakyTestManager` 统一调度所有模块 |
| 配置合并 | `config-merge.ts` | 用户配置与默认值的安全合并 |

---

## 2. 分类算法

> 源码：`src/flaky/classifier.ts`

### 2.1 六种分类

系统将测试分为以下 6 种分类（`FlakyClassification`）：

| 分类 | 含义 | 判定条件 |
|------|------|----------|
| `flaky` | 交替通过/失败 | 加权失败率 ≥ `flakyThreshold`（0.3）且 < `highThreshold`（0.5） |
| `broken` | 持续失败 | 连续失败 ≥ `brokenConsecutiveThreshold`（5）次 |
| `regression` | 回归 | 近期窗口失败率 ≥ `regressionRecentFailRate`（0.6）且早期失败率 ≤ `regressionOlderFailRate`（0.2） |
| `monitor` | 需关注 | 加权失败率 ≥ `monitorThreshold`（0.1）且 < `flakyThreshold`（0.3） |
| `stable` | 稳定 | 加权失败率 < `stableThreshold`（0.05） |
| `insufficient_data` | 数据不足 | 运行次数 < `minimumRuns`（5） |

### 2.2 时间衰减加权失败率

函数 `calculateWeightedFailureRate(history, decayRate=0.1)` 使用指数衰减为历史记录赋权，使最近的结果对分类影响更大：

```
weight = exp(-decayRate × ageInDays)
weightedFailureRate = Σ(weightedFailures) / Σ(weightedTotal)
```

**衰减效果示例**（`decayRate = 0.1`）：

| 时间距离 | 权重 | 说明 |
|----------|------|------|
| 1 天前 | ~0.90 | 几乎全权重 |
| 7 天前 | ~0.50 | 权重减半 |
| 14 天前 | ~0.25 | 四分之一权重 |
| 30 天前 | ~0.05 | 几乎无影响 |

其中 `failed` 和 `timedout` 状态均计为失败。

### 2.3 Wilson 置信区间

函数 `wilsonConfidenceInterval(failures, total, confidence=0.95)` 基于二项分布计算失败率的置信区间，避免小样本时过度自信地判定 Flaky。

**支持的置信水平与对应 Z 值**：

| 置信水平 | Z 值 |
|----------|------|
| 0.90 | 1.645 |
| 0.95 | 1.96 |
| 0.99 | 2.576 |

**核心公式**：

```
denominator = 1 + z²/n
centre = p + z²/(2n)
margin = z × √((p(1-p) + z²/(4n)) / n)

lower = max(0, (centre - margin) / denominator)
upper = min(1, (centre + margin) / denominator)
```

其中 `p = failures / total`。小样本时区间自动扩大，体现不确定性。

### 2.4 统计显著性检验

函数 `isStatisticallySignificant(test, threshold, minRuns, confidence=0.95)` 判断失败率是否具有统计显著性：

**判定条件**（需同时满足）：
1. 运行次数 ≥ `minRuns`
2. Wilson 置信区间**下界** ≥ `threshold`

> 注意：源码中使用的是 `ci.lower >= threshold`，即置信区间下界超过阈值才认为显著，这确保了只有失败率确实足够高时才判定为显著。

### 2.5 分类判定流程

`classifyTest(test, config)` 按以下优先级依次判定：

```
1. 运行次数 < minimumRuns → insufficient_data
2. 连续失败 ≥ brokenConsecutiveThreshold 且最近 N 次全部失败 → broken
3. 满足回归模式（近期失败率高、早期失败率低）→ regression
4. 加权失败率 < stableThreshold → stable
5. 加权失败率 ≥ flakyThreshold → flaky
6. 加权失败率 ≥ monitorThreshold → monitor
7. 原始失败率 ≥ flakyThreshold 但加权失败率 < flakyThreshold → stable（正在改善）
8. 默认 → monitor
```

> **关键细节**：步骤 7 是一个"正在改善"的判定——如果原始失败率高但时间衰减加权失败率已降低，说明测试正在恢复，归类为 `stable`。

---

## 3. 根因分析

> 源码：`src/flaky/root-cause.ts`

### 3.1 七种根因类型

`RootCauseType` 包含以下 7 种类型 + 1 种兜底：

| 根因类型 | 标识 | 核心判断依据 |
|----------|------|-------------|
| 时序问题 | `timing` | 错误含 timeout/waiting 关键词，持续时间变异系数 > 0.5 |
| 数据竞争 | `data_race` | 不同分片间通过率差异 ≥ 0.3 |
| 环境依赖 | `environment` | 失败时间呈聚集模式，或特定 CI 节点失败率 ≥ 50% |
| 外部服务 | `external_service` | 错误含 network/fetch/ECONNREFUSED/5xx 关键词 |
| 测试顺序 | `test_order` | 特定前置测试出现在 ≥ 50% 的失败中 |
| 资源泄漏 | `resource_leak` | 持续时间趋势斜率 > 0.1，或内存相关错误 |
| 断言不稳定 | `assertion_flaky` | 错误含 assertion/expect 关键词，且时序错误不多于断言错误 |
| 未知 | `unknown` | 所有检测器均未匹配时的兜底类型 |

### 3.2 各检测器详解

#### 3.2.1 时序问题检测 `detectTimingIssue`

**关键词列表**：`timeout`、`timed out`、`waiting for selector`、`waiting for element`、`exceeded`、`navigation`、`waiting for`、`slow`

**判定逻辑**：
- 统计历史中包含上述关键词的错误次数 `keywordHits`
- 计算持续时间的变异系数 `CV = 标准差 / 均值`
- 如果 `keywordHits === 0` 且 `CV ≤ 0.5`，返回 null（未检测到）
- 否则返回证据

**置信度计算**：
```
confidence = min(1, (keywordHits / historyLength) × 0.7 + (CV > 0.5 ? 0.3 : 0))
```

**持续时间变异系数阈值**：`DURATION_CV_THRESHOLD = 0.5`

#### 3.2.2 数据竞争检测 `detectDataRace`

**判定逻辑**：
- 需要上下文中的 `shardMap` 信息
- 统计同一测试在不同分片的通过/失败次数
- 计算各分片通过率，如果最大通过率与最小通过率差异 ≥ 0.3，判定为数据竞争
- 至少需要 2 个分片才有意义

**置信度计算**：
```
confidence = min(1, divergence + 0.2)
```

#### 3.2.3 环境依赖检测 `detectEnvironmentDependency`

**两条检测路径**：

1. **时间聚集**：失败时间戳间隔显著小于期望间隔（短间隔占比 ≥ 50%），判定为时间聚集
2. **节点聚集**：特定 CI 节点上的失败率 ≥ 50%（且该节点至少运行 2 次）

**置信度计算**：
```
confidence = (timeClustered ? 0.4 : 0) + (nodeClustered ? 0.5 : 0)
```

#### 3.2.4 外部服务检测 `detectExternalService`

**关键词列表**：`network`、`fetch`、`econnrefused`、`econnreset`、`enetunreach`、`err_connection`、`cors`、`5xx`、`500`、`502`、`503`、`504`、`service unavailable`、`gateway timeout`、`bad gateway`、`internal server error`

**置信度计算**：
```
confidence = min(1, (keywordHits / historyLength) × 0.8 + 0.2)
```

#### 3.2.5 测试顺序检测 `detectTestOrderDependency`

**判定逻辑**：
- 需要至少 2 次运行记录
- 找出目标测试失败时，其前一个测试的 ID
- 如果某个前置测试出现在 ≥ 50% 的失败中，且绝对次数 ≥ 2，判定为顺序依赖

**置信度计算**：
```
confidence = min(1, (maxPrecedingCount / failCount) × 0.7 + 0.2)
```

#### 3.2.6 资源泄漏检测 `detectResourceLeak`

**关键词列表**：`memory`、`heap`、`out of memory`、`cannot allocate`、`too many open files`、`emfile`、`connection pool`、`max connections`、`resource`

**判定逻辑**：
- 统计内存/资源相关错误关键词命中次数
- 计算持续时间的线性趋势斜率（归一化）
- 如果 `keywordHits === 0` 且 `trendSlope ≤ 0.1`，返回 null
- 持续时间趋势阈值：`DURATION_TREND_THRESHOLD = 0.1`

**置信度计算**：
```
confidence = min(1, (keywordHits > 0 ? 0.5 : 0) + (trendSlope > 0.1 ? 0.4 : 0))
```

#### 3.2.7 断言不稳定检测 `detectAssertionFlaky`

**关键词列表**：`assertion`、`assert`、`expect`、`to be`、`to equal`、`to match`、`received`、`expected`

**判定逻辑**：
- 统计断言相关关键词命中次数
- 如果时序错误次数 > 断言错误次数，返回 null（更可能是时序问题而非断言问题）
- 这确保了断言不稳定不会与时序问题混淆

**置信度计算**：
```
confidence = min(1, (keywordHits / historyLength) × 0.6 + 0.3)
```

### 3.3 建议操作

`RootCauseAnalyzer.analyze()` 返回的 `suggestedActions` 根据根因类型自动生成：

| 根因类型 | 建议操作 |
|----------|----------|
| `timing` | 增加超时时间、添加显式等待、检查页面加载性能、考虑 retry |
| `data_race` | 检查共享状态、确保数据独立性、避免全局状态、使用 beforeEach 重置 |
| `environment` | 检查 CI 环境差异、确保一致性、检查资源竞争、错峰运行 |
| `external_service` | 添加健康检查、使用 mock、增加重试、检查 SLA |
| `test_order` | 确保独立性、检查状态泄漏、使用 beforeEach/afterEach、合并或拆分 |
| `resource_leak` | 检查未关闭连接、确保清理、监控内存、检查浏览器实例 |
| `assertion_flaky` | 检查浮点数比较、避免精确时间匹配、使用宽松匹配器、检查动态内容 |
| `unknown` | 收集更多数据、检查非确定性逻辑、添加日志 |

---

## 4. 关联分析

> 源码：`src/flaky/correlation.ts`

### 4.1 关联类型

`CorrelationType` 包含 5 种关联类型：

| 类型 | 含义 |
|------|------|
| `same_run` | 同一次运行中同时失败 |
| `same_shard` | 同一分片中同时失败 |
| `same_time_window` | 同一时间窗口内失败 |
| `same_error_pattern` | 共享相同错误模式 |
| `same_file` | 位于同一测试文件 |

### 4.2 Jaccard 共现系数

使用 Jaccard 系数衡量两个测试在同一运行中同时失败的频率：

```
Jaccard(A, B) = |A ∩ B| / |A ∪ B|
```

其中 A 和 B 分别是两个测试失败的运行 ID 集合。

**阈值**：`CORRELATION_CO_OCCURRENCE_THRESHOLD = 0.6`，即 Jaccard 系数 ≥ 0.6 才认为有关联。

**最低运行次数**：`CORRELATION_MIN_RUNS = 3`，运行次数不足的测试不参与分析。

### 4.3 并查集合并

使用并查集（Union-Find）数据结构高效合并高共现的测试对，形成关联组：

- **路径压缩**：`find()` 操作带路径压缩，接近 O(1) 查找
- **按秩合并**：`union()` 操作按秩合并，保持树平衡

**流程**：
1. 对所有符合条件的测试对计算 Jaccard 系数
2. 系数 ≥ 0.6 的测试对执行 `union()` 合并
3. 遍历所有测试，按 `find()` 根节点分组
4. 只保留成员 ≥ 2 的组
5. 计算组内平均共现系数和主导关联类型

### 4.4 关联类型判定

`determineCorrelationType()` 按以下优先级判定两个测试间的关联类型：

```
1. 相同错误模式 → same_error_pattern
2. 同一文件 → same_file
3. 共现系数 ≥ 0.8 → same_run
4. 默认 → same_time_window
```

**相同错误模式判定**：两个测试的错误关键词交集 ≥ 2 个，且交集占较大集合比例 ≥ 0.5。

**相同文件判定**：从错误堆栈中提取 `.spec.ts/.test.ts` 等文件路径，比较是否一致。

---

## 5. 趋势追踪

> 源码：`src/flaky/trend.ts`

### 5.1 时间序列聚合

`aggregateTimeSeries(history, windowDays=7)` 将历史记录聚合为按天的时间序列数据点：

**每个数据点包含**：
- `passRate`：当天通过率
- `failRate`：当天失败率
- `avgDuration`：当天平均持续时间
- `flakyCount`：当天失败次数
- `totalRuns`：当天总运行次数

**移动平均平滑**：当 `windowDays > 1` 时，应用居中移动平均平滑，窗口大小为 `windowDays`，减少噪声突出趋势。

### 5.2 趋势方向检测

`detectTrendDirection(dataPoints)` 返回 `TrendDirection`，包含 4 种方向：

| 方向 | 含义 | 判定条件 |
|------|------|----------|
| `improving` | 改善中 | 线性回归斜率 < -0.02 |
| `stable` | 稳定 | 斜率在 [-0.02, 0.02] 之间 |
| `degrading` | 恶化中 | 斜率 > 0.02 |
| `volatile` | 波动大 | R² < 0.3（线性拟合度差） |

**线性回归**：使用最小二乘法拟合 `y = slope × x + intercept`，返回斜率、截距和 R² 决定系数。

> 注意：数据点 < 3 时直接返回 `stable`。

### 5.3 变点检测

`detectChangePoints(dataPoints, threshold=0.3)` 使用 CUSUM 算法检测失败率的突变点：

**算法流程**：
1. 计算失败率序列的均值和标准差
2. 对每个数据点计算累积和 `cusumPos`（正向偏移）和 `cusumNeg`（负向偏移）
3. 当累积和超过 `threshold × 5` 时，检查前后窗口的失败率变化
4. 如果变化幅度 ≥ `threshold`，记录为变点
5. 重置累积和继续检测

**变点包含**：`timestamp`、`beforeRate`、`afterRate`、`magnitude`、`confidence`

**默认阈值**：`TREND_CHANGE_POINT_THRESHOLD = 0.3`

### 5.4 季节模式检测

`detectSeasonalPattern(history, minCycles=3)` 分析失败率是否呈周期性波动：

**检测维度**：
- **按小时**：统计 24 小时各时段的失败率，如果振幅 > 总体失败率 × 0.5，识别高峰时段
- **按星期**：统计 7 天各天的失败率，同样判断振幅

**周期判定**：
- 有高峰星期 → `weekly`
- 有高峰小时 → `daily`
- 否则 → `hourly`

**最少周期数**：`TREND_SEASONAL_MIN_CYCLES = 3`，至少需要 3 个完整周期数据。

**高峰判定**：某时段失败率 > 均值 × 1.5。

### 5.5 代码变更关联

`correlateCodeChanges(changePoints, codeChanges)` 将变点与代码提交关联：

**关联条件**：
- 代码提交时间与变点时间差 ≤ 3 天
- 关联得分 = 时间接近度 × 变化幅度因子 ≥ 0.3

**时间接近度**：`1 - timeDiff / (3 × MS_PER_DAY)`

**变化幅度因子**：`min(1, magnitude × 2)`

### 5.6 趋势预测

`generateForecast(dataPoints, direction, seasonalPattern)` 基于线性回归和季节模式预测未来 7 天趋势：

**预测方法**：
1. 使用线性回归外推基础失败率
2. 如果存在季节模式，在高峰时段/高峰日叠加季节调整量 `amplitude × 0.3`
3. 预测值限制在 [0, 1] 范围内

**预测方向**：斜率 < -0.01 → `improving`，斜率 > 0.01 → `degrading`，否则 → `stable`

**预测置信度**：`min(1, R² × 0.8 + seasonalConfidence × 0.2)`

---

## 6. 隔离策略

> 源码：`src/flaky/quarantine-strategy.ts`

### 6.1 隔离级别

`IsolationLevel` 包含 4 个级别，严重程度递增：

| 级别 | 含义 | 说明 |
|------|------|------|
| `none` | 无隔离 | 正常执行 |
| `monitor` | 监控 | 继续执行但增加观察 |
| `soft_quarantine` | 软隔离 | 允许重试，不计入主流程 |
| `hard_quarantine` | 硬隔离 | 完全跳过，不执行 |

### 6.2 策略类型

`QuarantineStrategyType` 包含 5 种策略：

| 策略 | 对应隔离级别 | 说明 |
|------|-------------|------|
| `skip` | none | 不采取任何措施 |
| `retry_only` | monitor | 仅重试，不隔离 |
| `soft` | soft_quarantine | 软隔离 |
| `hard` | hard_quarantine | 硬隔离 |
| `graduated` | — | 分级策略，根据严重程度自动选择上述策略 |

### 6.3 分级隔离判定

`determineIsolationLevel()` 在 `graduated` 策略下的判定逻辑：

```
1. classification === 'broken' → hard_quarantine
2. classification === 'stable' 或 'insufficient_data' → none
3. classification === 'monitor' → monitor
4. weightedFailureRate ≥ hardThreshold(0.4) → hard_quarantine
5. weightedFailureRate ≥ softThreshold(0.15) → soft_quarantine
6. weightedFailureRate > 0 → monitor
7. 默认 → none
```

**策略与隔离级别的映射**：

| IsolationLevel | QuarantineStrategyType |
|----------------|----------------------|
| `none` | `skip` |
| `monitor` | `retry_only` |
| `soft_quarantine` | `soft` |
| `hard_quarantine` | `hard` |

### 6.4 根因感知重试策略

`getRetryPolicyForRootCause()` 根据根因类型定制重试策略：

| 根因类型 | 最大重试 | 重试延迟 | 退避倍数 | 仅通过时重试 |
|----------|---------|----------|---------|------------|
| `timing` | retryMax(3) | retryDelayMs × 2 | backoff(2) | 否 |
| `external_service` | retryMax(3) | retryDelayMs × 3 | backoff(2) | 否 |
| `data_race` | 2 | retryDelayMs | 1 | 是 |
| `environment` | retryMax(3) | retryDelayMs × 2 | backoff(2) | 否 |
| `resource_leak` | 1 | retryDelayMs × 5 | 1 | 是 |
| `test_order` | 0 | 0 | 1 | 是 |
| `assertion_flaky` | 1 | retryDelayMs | 1 | 是 |
| `unknown` | retryMax(3) | retryDelayMs | backoff(2) | 否 |

**设计理念**：
- 时序问题和外部服务问题适合重试（延迟加倍、退避递增）
- 测试顺序问题不适合重试（maxRetries = 0）
- 资源泄漏和断言不稳定重试收益有限（maxRetries = 1，仅通过时重试）

### 6.5 预算控制

`checkQuarantineBudget()` 限制被隔离测试占总测试数的比例：

- **最大隔离比例**：`maxQuarantineRatio = 0.2`（最多 20% 的测试可被隔离）
- **最小可隔离数**：`minQuarantineCount = 3`（即使 20% 不足 3 个，也允许隔离 3 个）
- **最大可隔离数**：`max(3, ceil(totalTests × 0.2))`

**预算不足时的处理**：
- `QuarantineStrategyManager.generateStrategiesWithBudget()` 会按优先级排序测试
- 优先隔离 `hard_quarantine` > `soft_quarantine` > `monitor` > `none`
- 同级别按加权失败率降序排列
- 预算不足时，新测试降级为 `monitor`（retry_only），原因追加"隔离预算不足，降级为监控"

### 6.6 自动释放与过期降级

#### 自动释放

`checkAutoRelease()` 在隔离测试连续通过一定次数后自动释放：

- **软隔离/监控**：连续通过 `autoReleaseAfterPasses`（3）次后释放
- **硬隔离**：连续通过 `autoReleaseHardQuarantinePasses`（5）次后释放

释放时可选重置历史（`resetHistory: true`），清除所有统计数据重新开始。

#### 过期降级

`downgradeExpiredQuarantine()` 在隔离超过 `quarantineExpiryDays`（30 天）后自动降级：

- `hard_quarantine` → `monitor`（retry_only）
- `soft_quarantine` → `monitor`（retry_only）

> 注意：降级不会完全释放测试，而是降为监控模式继续观察。此功能由 `quarantineExpiryDowngrade`（默认 `true`）控制。

---

## 7. 健康评分

> 源码：`src/flaky/trend.ts` 中的 `calculateHealthScore()`

### 7.1 四维评分模型

`FlakyHealthScore` 综合四个维度计算整体健康评分：

| 维度 | 权重 | 计算方式 |
|------|------|----------|
| `stability`（稳定性） | 0.35 | `1 - weightedFailureRate` |
| `trend`（趋势） | 0.25 | improving=1, stable=0.7, degrading=0.3, volatile=0.2 |
| `recoverability`（可恢复性） | 0.20 | `min(1, (passes / totalRuns) × 1.5)` |
| `predictability`（可预测性） | 0.20 | 趋势拟合的 R² 值 |

**综合评分公式**：

```
overall = stability × 0.35 + trend × 0.25 + recoverability × 0.2 + predictability × 0.2
```

### 7.2 等级映射

| 等级 | 分数范围 | 标签 |
|------|----------|------|
| A | ≥ 0.9 | 非常健康 |
| B | ≥ 0.75 | 基本健康 |
| C | ≥ 0.6 | 需要关注 |
| D | ≥ 0.4 | 不健康 |
| F | < 0.4 | 严重不健康 |

> 注意：源码中等级 B 的阈值是 0.75，C 是 0.6，D 是 0.4，与用户需求中提到的 0.7/0.5/0.3 略有不同。实际以源码为准。

**项目级健康评分**：`FlakyTestManager.getOverallHealthScore()` 对所有测试的各维度取平均值，再按相同权重和等级映射计算项目级评分。无测试数据时返回满分 A（"无测试数据"）。

---

## 8. 因果图

> 源码：`src/flaky/causal-graph.ts`

### 8.1 节点类型

`CausalNode` 包含 4 种节点类型：

| 类型 | 含义 | 来源 |
|------|------|------|
| `test` | 测试节点 | 每个 Flaky 测试对应一个节点 |
| `infrastructure` | 基础设施节点 | 从关联组推断（timing/environment/resource_leak/unknown） |
| `external_service` | 外部服务节点 | 从关联组推断（external_service 根因） |
| `shared_state` | 共享状态节点 | 从关联组推断（data_race/test_order/assertion_flaky） |

### 8.2 边类型

`CausalEdge` 包含 5 种边类型：

| 类型 | 含义 |
|------|------|
| `depends_on` | 依赖关系 |
| `shares_resource` | 共享资源 |
| `same_environment` | 同一环境 |
| `sequential` | 顺序依赖 |
| `correlated_failure` | 关联失败 |

**实际构建中产生的边类型**：
- 关联组中 `same_error_pattern` 类型 → `correlated_failure` 边
- 关联组中其他类型 → `same_environment` 边
- 运行结果中的共失败分析 → `correlated_failure` 边

### 8.3 图构建流程

`CausalGraphBuilder.build(tests, correlationGroups, recentRuns)` 的构建流程：

1. **构建测试节点**：每个 Flaky 测试生成一个 `test` 类型节点
2. **推断基础设施节点**：从关联组推断共享根因，创建 `infrastructure`/`external_service`/`shared_state` 节点
3. **推断依赖边**：分析运行结果中的共失败模式，生成 `correlated_failure` 边
4. **识别根因节点**：通过入度/出度分析识别根因
5. **构建影响映射**：BFS 遍历计算每个节点的影响范围

**配置参数**：
- `minCorrelation = 0.4`：共失败关联度低于此值的边不生成
- `maxDepth = 5`：影响映射遍历的最大深度

### 8.4 根因识别

`identifyRootCauses()` 使用入度/出度分析识别根因节点：

**判定条件**（满足其一）：
- 节点类型不是 `test`（基础设施/外部服务/共享状态节点）
- 出度 > 入度 × 2 且出度 > 0.5

**排序**：按出度降序排列，出度越大的节点越可能是根因。

### 8.5 影响分析

`analyzeImpact(testId, graph)` 计算指定测试的影响范围：

| 指标 | 计算方式 |
|------|----------|
| 直接影响 | 从该节点出发的边指向的节点 |
| 间接影响 | 影响映射中排除直接影响后的节点 |
| 总影响分 | 直接影响数 × 2 + 间接影响数 |

**风险等级**：

| 总影响分 | 风险等级 | 建议 |
|----------|----------|------|
| ≥ 10 | `critical` | 最高优先级处理 |
| ≥ 5 | `high` | 建议尽快修复 |
| ≥ 2 | `medium` | 方便时修复 |
| < 2 | `low` | 正常优先级 |

---

## 9. 参数自定义

### 9.1 FlakyCriteriaConfig（12 个参数）

> 源码：`src/constants/index.ts` 中的 `DEFAULT_FLAKY_CRITERIA`

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `minimumRuns` | 5 | 最低运行次数，少于此数分类为 insufficient_data |
| `flakyThreshold` | 0.3 | Flaky 分类阈值，加权失败率 ≥ 此值分类为 flaky |
| `monitorThreshold` | 0.1 | 监控阈值，加权失败率 ≥ 此值需关注 |
| `stableThreshold` | 0.05 | 稳定阈值，加权失败率 < 此值分类为 stable |
| `highThreshold` | 0.5 | 高失败率阈值，加权失败率 ≥ 此值触发检测 |
| `brokenConsecutiveThreshold` | 5 | 连续失败次数阈值，达到此值分类为 broken |
| `regressionWindow` | 5 | 回归检测窗口大小（最近 N 次运行） |
| `regressionRecentFailRate` | 0.6 | 回归判定：近期窗口失败率阈值 |
| `regressionOlderFailRate` | 0.2 | 回归判定：早期失败率阈值 |
| `decayRate` | 0.1 | 时间衰减率，控制历史权重递减速度 |
| `confidenceLevel` | 0.95 | Wilson 置信区间的置信水平 |
| `autoReleaseAfterPasses` | 3 | 软隔离自动释放所需连续通过次数 |

### 9.2 QuarantineCriteriaConfig（9 个参数）

> 源码：`src/constants/index.ts` 中的 `DEFAULT_QUARANTINE_CRITERIA`

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `softThreshold` | 0.15 | 软隔离阈值，加权失败率 ≥ 此值进入软隔离 |
| `hardThreshold` | 0.4 | 硬隔离阈值，加权失败率 ≥ 此值进入硬隔离 |
| `maxQuarantineRatio` | 0.2 | 最大隔离比例，被隔离测试不超过总测试的 20% |
| `autoReleaseHardQuarantinePasses` | 5 | 硬隔离自动释放所需连续通过次数 |
| `quarantineExpiryDays` | 30 | 隔离过期天数，超过后自动降级 |
| `quarantineExpiryDowngrade` | true | 是否启用过期降级（降为 monitor 而非释放） |
| `retryMax` | 3 | 默认最大重试次数 |
| `retryDelayMs` | 1000 | 默认重试延迟（毫秒） |
| `retryBackoff` | 2 | 重试退避倍数 |

### 9.3 自定义方式

系统提供三种方式自定义参数：

#### 方式一：user-preferences.json 配置文件

在 `user-preferences.json` 中添加 `flakyCriteria` 和 `quarantineCriteria` 配置节：

```json
{
  "flakyCriteria": {
    "minimumRuns": 10,
    "flakyThreshold": 0.25,
    "decayRate": 0.15
  },
  "quarantineCriteria": {
    "softThreshold": 0.2,
    "maxQuarantineRatio": 0.15
  }
}
```

> 配置合并由 `config-merge.ts` 中的 `mergeFlakyCriteria()` 和 `mergeQuarantineCriteria()` 处理，仅覆盖类型合法的字段，非法类型值使用默认值。

#### 方式二：Dashboard UI 参数配置面板

通过 Dashboard 的 `CriteriaConfigDialog` 组件可视化调整参数，修改后实时生效。

#### 方式三：FlakyTestManager.setConfig() 方法

通过代码动态设置：

```typescript
flakyTestManager.setConfig({
  flakyCriteria: {
    minimumRuns: 10,
    flakyThreshold: 0.25,
  },
  quarantineCriteria: {
    softThreshold: 0.2,
  },
});
```

`setConfig()` 方法会：
1. 合并 `QuarantineConfig` 基础配置
2. 调用 `mergeFlakyCriteria()` 合并 Flaky 判定参数
3. 调用 `mergeQuarantineCriteria()` 合并隔离参数
4. 使用新的隔离参数重建 `QuarantineStrategyManager` 实例

可通过 `getEffectiveConfig()` 获取当前生效的完整配置（含默认值填充）。
