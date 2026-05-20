# 配置参考文档

YuanTest Playwright 支持通过配置文件、命令行参数、Dashboard UI 和用户偏好文件自定义行为。本文档基于源码中的类型定义与默认常量编写，确保与实际实现一致。

---

## 目录

1. [TestConfig - 基础测试配置](#1-testconfig-basic-test-configuration)
2. [FlakyCriteriaConfig - 不稳定用例判定参数](#2-flakycriteriaconfig-flaky-test-criteria-parameters)
3. [QuarantineCriteriaConfig - 隔离判定参数](#3-quarantinecriteriaconfig-quarantine-criteria-parameters)
4. [TraceConfig - Trace 配置](#4-traceconfig-trace-configuration)
5. [ArtifactConfig - 产物配置](#5-artifactconfig-artifact-configuration)
6. [VisualTestingConfig - 视觉测试配置](#6-visualtestingconfig-visual-testing-configuration)
7. [AnnotationConfig - 注解配置](#7-annotationconfig-annotation-configuration)
8. [TagConfig - 标签配置](#8-tagconfig-tag-configuration)
9. [QuarantineConfig - 隔离配置](#9-quarantineconfig-quarantine-configuration)
10. [LLMConfig - LLM 配置](#10-llmconfig-llm-configuration)
11. [AgentConfig - Agent 配置](#11-agentconfig-agent-configuration)
12. [DashboardConfig - Dashboard 配置](#12-dashboardconfig-dashboard-configuration)
13. [默认值常量表](#13-default-constants-table)
14. [配置方式](#14-configuration-methods)

---

<a id="1-testconfig-basic-test-configuration"></a>
## 1. TestConfig - 基础测试配置

`TestConfig` 是 YuanTest 的核心配置接口，定义了测试运行的基础参数。

```typescript
interface TestConfig {
  version: string;
  testDir: string;
  outputDir: string;
  baseURL?: string;
  retries?: number;
  timeout?: number;
  workers?: number;
  shards?: number;
  reporters?: string[];
  browsers?: BrowserType[];
  headers?: Record<string, string>;
  flakyThreshold?: number;
  isolateFlaky?: boolean;
  traces?: TraceConfig;
  artifacts?: ArtifactConfig;
  visualTesting?: VisualTestingConfig;
  annotations?: AnnotationConfig;
  tags?: TagConfig;
  htmlReport?: boolean;
  htmlReportDir?: string;
  parentRunId?: string;
  retryIndex?: number;
  testMatch?: string[];
  testIgnore?: string[];
  ignoreDirs?: string[];
}
```

### 参数说明

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `version` | `string` | 是 | `'1.0.0'` | 配置版本号，用于标识配置格式 |
| `testDir` | `string` | 是 | `'./'` | 测试文件根目录 |
| `outputDir` | `string` | 否 | `'./test-output'` | 测试输出目录 |
| `baseURL` | `string` | 否 | - | 测试基础 URL，传递给 Playwright `use.baseURL` |
| `retries` | `number` | 否 | `0` | 失败重试次数，整数，最小值 0 |
| `timeout` | `number` | 否 | `30000` | 测试超时时间（毫秒），正整数 |
| `workers` | `number` | 否 | `1` | 并行 Worker 数量，正整数 |
| `shards` | `number` | 否 | `1` | 分片数量，正整数 |
| `reporters` | `string[]` | 否 | - | 自定义报告器列表 |
| `browsers` | `BrowserType[]` | 否 | `['chromium']` | 测试浏览器列表，可选值：`'chromium'`、`'firefox'`、`'webkit'` |
| `headers` | `Record<string, string>` | 否 | - | 自定义 HTTP 请求头，传递给 Playwright `use.extraHTTPHeaders` |
| `flakyThreshold` | `number` | 否 | `0.3` | Flaky 检测阈值（0~1），失败率超过此值判定为 Flaky |
| `isolateFlaky` | `boolean` | 否 | `false` | 是否自动隔离 Flaky 测试 |
| `traces` | `TraceConfig` | 否 | - | Trace 配置，详见 [TraceConfig](#4-traceconfig-trace-configuration) |
| `artifacts` | `ArtifactConfig` | 否 | - | 产物配置，详见 [ArtifactConfig](#5-artifactconfig-artifact-configuration) |
| `visualTesting` | `VisualTestingConfig` | 否 | - | 视觉测试配置，详见 [VisualTestingConfig](#6-visualtestingconfig-visual-testing-configuration) |
| `annotations` | `AnnotationConfig` | 否 | - | 注解配置，详见 [AnnotationConfig](#7-annotationconfig-annotation-configuration) |
| `tags` | `TagConfig` | 否 | - | 标签配置，详见 [TagConfig](#8-tagconfig-tag-configuration) |
| `htmlReport` | `boolean` | 否 | `true` | 是否生成 Playwright HTML 报告 |
| `htmlReportDir` | `string` | 否 | - | HTML 报告输出子目录名，默认为 `html-report` |
| `parentRunId` | `string` | 否 | - | 父级运行 ID，用于关联子运行 |
| `retryIndex` | `number` | 否 | - | 当前重试索引 |
| `testMatch` | `string[]` | 否 | - | 匹配测试文件的全局模式 |
| `testIgnore` | `string[]` | 否 | - | 忽略测试文件的全局模式 |
| `ignoreDirs` | `string[]` | 否 | 见下方 | 忽略的目录列表，默认为 `FILE_PATTERNS.IGNORE_DIRS` |

`ignoreDirs` 默认值：

```
['node_modules', '__snapshots__', '__image_snapshots__', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.svelte-kit']
```

### BrowserType

```typescript
type BrowserType = 'chromium' | 'firefox' | 'webkit';
```

---

## 2. FlakyCriteriaConfig - 不稳定用例判定参数 {#2-flakycriteriaconfig-flaky-test-criteria-parameters}

`FlakyCriteriaConfig` 定义了 Flaky 测试分类器的判定标准，用于将测试分为 `flaky`、`broken`、`regression`、`monitor`、`stable`、`insufficient_data` 六种分类。

```typescript
interface FlakyCriteriaConfig {
  minimumRuns: number;
  flakyThreshold: number;
  monitorThreshold: number;
  stableThreshold: number;
  highThreshold: number;
  brokenConsecutiveThreshold: number;
  regressionWindow: number;
  regressionRecentFailRate: number;
  regressionOlderFailRate: number;
  decayRate: number;
  confidenceLevel: number;
  autoReleaseAfterPasses: number;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `minimumRuns` | `number` | `5` | 最低运行次数，低于此值分类为 `insufficient_data` |
| `flakyThreshold` | `number` | `0.3` | Flaky 判定阈值，加权失败率超过此值判定为 Flaky |
| `monitorThreshold` | `number` | `0.1` | Monitor 判定阈值，失败率在此值与 Flaky 阈值之间标记为 Monitor |
| `stableThreshold` | `number` | `0.05` | Stable 判定阈值，失败率低于此值判定为 Stable |
| `highThreshold` | `number` | `0.5` | 高风险阈值，失败率超过此值判定为高风险 Flaky |
| `brokenConsecutiveThreshold` | `number` | `5` | 连续失败判定 Broken 阈值，连续失败次数达到此值判定为 Broken |
| `regressionWindow` | `number` | `5` | 回归检测窗口大小（最近 N 次运行） |
| `regressionRecentFailRate` | `number` | `0.6` | 回归判定近期失败率阈值 |
| `regressionOlderFailRate` | `number` | `0.2` | 回归判定早期失败率阈值 |
| `decayRate` | `number` | `0.1` | 时间衰减率，用于加权失败率计算，越近的运行权重越高 |
| `confidenceLevel` | `number` | `0.95` | Wilson 置信区间置信水平，用于统计显著性判断 |
| `autoReleaseAfterPasses` | `number` | `3` | 软隔离自动释放所需的连续通过次数 |

### 分类逻辑

- **`insufficient_data`**：总运行次数 < `minimumRuns`
- **`stable`**：加权失败率 < `stableThreshold`
- **`monitor`**：`stableThreshold` ≤ 加权失败率 < `monitorThreshold`
- **`flaky`**：`flakyThreshold` ≤ 加权失败率 < `highThreshold`，且非 Broken/Regression
- **`high`**：加权失败率 ≥ `highThreshold`
- **`broken`**：连续失败次数 ≥ `brokenConsecutiveThreshold`
- **`regression`**：近期失败率 ≥ `regressionRecentFailRate` 且早期失败率 ≤ `regressionOlderFailRate`

---

## 3. QuarantineCriteriaConfig - 隔离判定参数 {#3-quarantinecriteriaconfig-quarantine-criteria-parameters}

`QuarantineCriteriaConfig` 定义了测试隔离（Quarantine）的判定标准和重试策略。

```typescript
interface QuarantineCriteriaConfig {
  softThreshold: number;
  hardThreshold: number;
  maxQuarantineRatio: number;
  autoReleaseHardQuarantinePasses: number;
  quarantineExpiryDays: number;
  quarantineExpiryDowngrade: boolean;
  retryMax: number;
  retryDelayMs: number;
  retryBackoff: number;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `softThreshold` | `number` | `0.15` | 软隔离阈值，失败率超过此值进入软隔离 |
| `hardThreshold` | `number` | `0.4` | 硬隔离阈值，失败率超过此值进入硬隔离 |
| `maxQuarantineRatio` | `number` | `0.2` | 隔离预算上限比例，最多允许此比例的测试被隔离 |
| `autoReleaseHardQuarantinePasses` | `number` | `5` | 硬隔离自动释放所需的连续通过次数 |
| `quarantineExpiryDays` | `number` | `30` | 隔离过期天数，过期后自动处理 |
| `quarantineExpiryDowngrade` | `boolean` | `true` | 隔离过期后是否降级（硬隔离→软隔离→释放） |
| `retryMax` | `number` | `3` | 隔离重试最大次数 |
| `retryDelayMs` | `number` | `1000` | 隔离重试初始延迟（毫秒） |
| `retryBackoff` | `number` | `2` | 隔离重试退避倍数，每次重试延迟乘以此值 |

### 隔离级别

```typescript
type IsolationLevel = 'none' | 'monitor' | 'soft_quarantine' | 'hard_quarantine';
```

- **`none`**：正常运行
- **`monitor`**：监控模式，记录但不隔离
- **`soft_quarantine`**：软隔离，测试仍运行但失败不计入整体失败率
- **`hard_quarantine`**：硬隔离，测试被跳过不运行

### 隔离策略类型 {#quarantine-strategy-types}

```typescript
type QuarantineStrategyType = 'skip' | 'retry_only' | 'soft' | 'hard' | 'graduated';
```

- **`skip`**：直接跳过
- **`retry_only`**：仅重试
- **`soft`**：软隔离
- **`hard`**：硬隔离
- **`graduated`**：渐进式隔离，根据失败程度逐步升级

---

## 4. TraceConfig - Trace 配置 {#4-traceconfig-trace-configuration}

`TraceConfig` 控制 Playwright Trace 的采集行为。

```typescript
interface TraceConfig {
  enabled: boolean;
  mode: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  screenshots: boolean;
  snapshots: boolean;
  sources: boolean;
  attachments: boolean;
  outputDir?: string;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用 Trace 采集 |
| `mode` | `'off' \| 'on' \| 'retain-on-failure' \| 'on-first-retry'` | `'on-first-retry'` | Trace 采集模式 |
| `screenshots` | `boolean` | `true` | 是否在 Trace 中记录截图 |
| `snapshots` | `boolean` | `true` | 是否在 Trace 中记录 DOM 快照 |
| `sources` | `boolean` | `true` | 是否在 Trace 中记录源码信息 |
| `attachments` | `boolean` | `true` | 是否在 Trace 中记录附件 |
| `outputDir` | `string` | - | Trace 文件输出目录 |

### mode 说明

| 模式 | 说明 |
|------|------|
| `off` | 不采集 Trace |
| `on` | 每次运行都采集 Trace |
| `retain-on-failure` | 仅在测试失败时保留 Trace |
| `on-first-retry` | 仅在首次重试时采集 Trace |

---

<a id="5-artifactconfig-artifact-configuration"></a>
## 5. ArtifactConfig - 产物配置

`ArtifactConfig` 控制测试产物（截图、视频、下载文件）的采集行为。

```typescript
interface ArtifactConfig {
  enabled: boolean;
  screenshots: 'off' | 'on' | 'only-on-failure';
  videos: 'off' | 'on' | 'retain-on-failure' | 'on-first-retry';
  downloads?: boolean;
  outputDir?: string;
  maxFileSize?: number;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用产物采集 |
| `screenshots` | `'off' \| 'on' \| 'only-on-failure'` | `'only-on-failure'` | 截图采集模式 |
| `videos` | `'off' \| 'on' \| 'retain-on-failure' \| 'on-first-retry'` | `'retain-on-failure'` | 视频采集模式 |
| `downloads` | `boolean` | - | 是否采集下载文件 |
| `outputDir` | `string` | - | 产物输出目录 |
| `maxFileSize` | `number` | - | 单个产物文件最大大小（字节） |

### screenshots 模式说明

| 模式 | 说明 |
|------|------|
| `off` | 不采集截图 |
| `on` | 每次都采集截图 |
| `only-on-failure` | 仅在测试失败时采集截图 |

### videos 模式说明

| 模式 | 说明 |
|------|------|
| `off` | 不录制视频 |
| `on` | 每次都录制视频 |
| `retain-on-failure` | 仅在测试失败时保留视频 |
| `on-first-retry` | 仅在首次重试时录制视频 |

---

## 6. VisualTestingConfig - 视觉测试配置 {#6-visualtestingconfig-visual-testing-configuration}

`VisualTestingConfig` 控制视觉回归测试（截图对比）的行为。

```typescript
interface VisualTestingConfig {
  enabled: boolean;
  threshold: number;
  maxDiffPixelRatio: number;
  maxDiffPixels: number;
  updateSnapshots: boolean;
  compareWith?: string;
  outputDir?: string;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用视觉测试 |
| `threshold` | `number` | `0.2` | 像素对比阈值（0~1），单个像素颜色差异超过此值视为不同 |
| `maxDiffPixelRatio` | `number` | `0.01` | 最大差异像素比例（0~1），差异像素占总像素比例超过此值判定为不匹配 |
| `maxDiffPixels` | `number` | `10` | 最大差异像素数量（整数，最小值 0），差异像素数超过此值判定为不匹配 |
| `updateSnapshots` | `boolean` | `false` | 是否更新基线快照 |
| `compareWith` | `string` | - | 指定对比的基线版本或路径 |
| `outputDir` | `string` | - | 快照输出目录，默认为 `{outputDir}/snapshots` |

### 视觉测试状态

```typescript
type VisualTestStatus = 'identical' | 'different' | 'new' | 'missing' | 'regression';
```

| 状态 | 说明 |
|------|------|
| `identical` | 与基线完全一致 |
| `different` | 与基线存在差异 |
| `new` | 新增快照，无基线对比 |
| `missing` | 基线快照缺失 |
| `regression` | 视觉回归 |

---

<a id="7-annotationconfig-annotation-configuration"></a>
## 7. AnnotationConfig - 注解配置

`AnnotationConfig` 控制测试注解（如 `@skip`、`@fixme` 等）的识别和处理行为。

```typescript
interface AnnotationConfig {
  enabled: boolean;
  respectSkip: boolean;
  respectOnly: boolean;
  respectFail: boolean;
  respectSlow: boolean;
  respectFixme: boolean;
  customAnnotations: Record<string, { action: 'skip' | 'fail' | 'slow' | 'mark' }>;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用注解扫描 |
| `respectSkip` | `boolean` | `true` | 是否识别 `skip` 注解 |
| `respectOnly` | `boolean` | `true` | 是否识别 `only` 注解 |
| `respectFail` | `boolean` | `true` | 是否识别 `fail` 注解 |
| `respectSlow` | `boolean` | `false` | 是否识别 `slow` 注解 |
| `respectFixme` | `boolean` | `true` | 是否识别 `fixme` 注解 |
| `customAnnotations` | `Record<string, { action: 'skip' \| 'fail' \| 'slow' \| 'mark' }>` | `{}` | 自定义注解映射，键为注解名称，值为对应动作 |

### 内置注解类型

```typescript
type AnnotationType = 'skip' | 'only' | 'fail' | 'slow' | 'fixme' | 'todo' | 'serial' | 'parallel';
```

### 自定义注解示例

```typescript
annotations: {
  enabled: true,
  customAnnotations: {
    'flaky': { action: 'slow' },
    'unstable': { action: 'skip' },
    'known-issue': { action: 'mark' },
  },
}
```

---

## 8. TagConfig - 标签配置 {#8-tagconfig-tag-configuration}

`TagConfig` 控制基于标签的测试过滤行为。

```typescript
interface TagConfig {
  enabled: boolean;
  include?: string[];
  exclude?: string[];
  require?: string[];
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用标签过滤 |
| `include` | `string[]` | - | 包含标签列表，仅运行包含这些标签的测试 |
| `exclude` | `string[]` | - | 排除标签列表，排除包含这些标签的测试 |
| `require` | `string[]` | - | 必须标签列表，测试必须包含所有指定标签才会运行 |

### 标签过滤逻辑

1. 如果设置了 `include`，仅运行包含至少一个 `include` 标签的测试
2. 如果设置了 `exclude`，排除包含任何 `exclude` 标签的测试
3. 如果设置了 `require`，测试必须包含所有 `require` 标签才会运行
4. 三个条件同时生效时取交集

---

<a id="9-quarantineconfig-quarantine-configuration"></a>
## 9. QuarantineConfig - 隔离配置

`QuarantineConfig` 是 Flaky 测试管理器的顶层隔离配置，控制隔离功能的开关和高级特性。

```typescript
interface QuarantineConfig {
  enabled: boolean;
  threshold: number;
  autoQuarantine: boolean;
  minimumRuns?: number;
  autoReleaseAfterPasses?: number;
  quarantineExpiryDays?: number;
  decayRate?: number;
  confidenceLevel?: number;
  brokenThreshold?: number;
  regressionWindow?: number;
  enableRootCauseAnalysis?: boolean;
  enableCorrelationAnalysis?: boolean;
  enableTrendTracking?: boolean;
  enablePrediction?: boolean;
  enableCausalGraph?: boolean;
  quarantineStrategy?: QuarantineStrategyType;
  maxQuarantineRatio?: number;
  predictionSensitivity?: number;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `true` | 是否启用隔离功能 |
| `threshold` | `number` | `0.3` | 隔离触发阈值（0~1），失败率超过此值触发隔离 |
| `autoQuarantine` | `boolean` | `false` | 是否自动隔离 Flaky 测试 |
| `minimumRuns` | `number` | - | 最低运行次数，覆盖 FlakyCriteriaConfig 中的值 |
| `autoReleaseAfterPasses` | `number` | - | 自动释放连续通过次数，覆盖 FlakyCriteriaConfig 中的值 |
| `quarantineExpiryDays` | `number` | - | 隔离过期天数，覆盖 QuarantineCriteriaConfig 中的值 |
| `decayRate` | `number` | - | 时间衰减率，覆盖 FlakyCriteriaConfig 中的值 |
| `confidenceLevel` | `number` | - | Wilson 置信水平，覆盖 FlakyCriteriaConfig 中的值 |
| `brokenThreshold` | `number` | - | Broken 阈值，覆盖 FlakyCriteriaConfig 中的 `brokenConsecutiveThreshold` |
| `regressionWindow` | `number` | - | 回归检测窗口，覆盖 FlakyCriteriaConfig 中的值 |
| `enableRootCauseAnalysis` | `boolean` | - | 是否启用根因分析 |
| `enableCorrelationAnalysis` | `boolean` | - | 是否启用关联分析 |
| `enableTrendTracking` | `boolean` | - | 是否启用趋势追踪 |
| `enablePrediction` | `boolean` | - | 是否启用失败预测 |
| `enableCausalGraph` | `boolean` | - | 是否启用因果图构建 |
| `quarantineStrategy` | `QuarantineStrategyType` | - | 隔离策略类型，详见 [隔离策略类型](#quarantine-strategy-types) |
| `maxQuarantineRatio` | `number` | - | 隔离预算上限比例，覆盖 QuarantineCriteriaConfig 中的值 |
| `predictionSensitivity` | `number` | - | 预测灵敏度（默认 `0.5`） |

---

<a id="10-llmconfig-llm-configuration"></a>
## 10. LLMConfig - LLM 配置

`LLMConfig` 控制 AI 诊断服务的 LLM 连接参数，用于自动分析测试失败原因。

```typescript
interface LLMConfig {
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  remark: string;
  maxTokens: number;
  temperature: number;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `enabled` | `boolean` | `false` | 是否启用 AI 诊断 |
| `apiKey` | `string` | `''` | LLM API 密钥 |
| `baseUrl` | `string` | `'http://localhost:11434'` | LLM API 基础 URL（默认指向本地 Ollama） |
| `model` | `string` | `''` | 使用的模型名称 |
| `remark` | `string` | `''` | 配置备注信息 |
| `maxTokens` | `number` | `2048` | 最大生成 Token 数 |
| `temperature` | `number` | `0.3` | 生成温度参数（0~1），越低越确定 |

### AI 诊断模式

```typescript
type AnalysisMode = 'agent' | 'single' | 'fallback';
```

| 模式 | 说明 |
|------|------|
| `agent` | Agent 模式，多轮工具调用，深度分析 |
| `single` | 单次调用模式，快速诊断 |
| `fallback` | 降级模式，Agent 失败后的回退方案 |

### AI 诊断工具

Agent 模式下支持以下工具调用（最多 5 轮）：

| 工具名 | 说明 |
|--------|------|
| `read_source_file` | 读取源码文件 |
| `search_codebase` | 搜索代码库 |
| `query_test_history` | 查询测试历史 |
| `read_screenshot` | 读取失败截图 |

---

<a id="11-agentconfig-agent-configuration"></a>
## 11. AgentConfig - Agent 配置

AI Agent 代理系统配置，用于测试规划、生成和修复。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enabled` | `boolean` | 否 | `true` | 启用或禁用 Agent 系统 |
| `loopTarget` | `'vscode' \| 'claude' \| 'opencode'` | 否 | `'vscode'` | 代理定义的目标环境 |
| `specsDir` | `string` | 否 | `'specs'` | 测试计划存储目录 |
| `seedTest` | `string` | 否 | - | 参考测试文件路径 |
| `autoHeal` | `boolean` | 否 | `false` | 自动应用生成的补丁 |
| `maxHealRounds` | `number` | 否 | `3` | 最大修复轮数 |
| `projectRoot` | `string` | 否 | `process.cwd()` | 项目根目录 |
| `projectContext` | `ProjectContext` | 否 | - | 自动加载的项目上下文（见下方） |

**ProjectContext**（自动加载，不可用户配置）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `projectRoot` | `string` | 项目根目录 |
| `baseURL` | `string` | 从 playwright.config 解析 |
| `testDir` | `string` | 从 playwright.config 解析 |
| `timeout` | `number` | 从 playwright.config 解析 |
| `useViewport` | `{ width: number; height: number }` | 从 playwright.config 解析 |
| `fixtures` | `string` | 自动发现的测试 Fixtures 路径 |
| `technology` | `string` | 检测到的技术栈（如 "React, Vite"） |
| `packageJson` | `object` | 包名和依赖信息 |

---

<a id="12-dashboardconfig-dashboard-configuration"></a>
## 12. DashboardConfig - Dashboard 配置

Dashboard 配置控制 Web 可视化面板的启动参数。该配置通过 `YuanTestConfigFile.dashboard` 或 CLI 参数指定。

```typescript
interface DashboardConfig {
  port: number;
  outputDir: string;
  dataDir: string;
}
```

### 参数说明

| 参数名 | 类型 | 默认值 | 含义 |
|--------|------|--------|------|
| `port` | `number` | `3000` | Dashboard 服务监听端口 |
| `outputDir` | `string` | `'./test-reports'` | 报告输出目录 |
| `dataDir` | `string` | `'./test-data'` | 数据存储目录 |

> **注意**：CLI `ui` 命令的默认端口为 `5274`（`--port` 选项默认值），但配置文件中 `dashboard.port` 默认为 `3000`。CLI 参数优先级高于配置文件。

### CLI 参数

```bash
yuantest ui -p, --port <number>   # 端口号，默认 5274
yuantest ui -o, --output <path>   # 报告目录
yuantest ui -d, --data <path>     # 数据目录
```

---

<a id="13-default-constants-table"></a>
## 13. 默认值常量表

以下常量定义在 `src/constants/index.ts` 中，是系统各模块的默认配置来源。

### DEFAULTS - 基础默认值

| 常量名 | 值 | 说明 |
|--------|-----|------|
| `TEST_TIMEOUT` | `30000` | 测试超时时间（毫秒） |
| `TEST_RETRIES` | `0` | 默认重试次数 |
| `WORKERS` | `1` | 默认 Worker 数量 |
| `SHARDS` | `1` | 默认分片数量 |
| `BROWSERS` | `['chromium']` | 默认浏览器列表 |
| `PROJECT_NAME` | `'test-project'` | 默认项目名称 |
| `OUTPUT_DIR` | `'./test-output'` | 默认输出目录 |
| `TEST_DIR` | `'./'` | 默认测试目录 |
| `DATA_DIR` | `'./test-data'` | 默认数据目录 |
| `REPORTS_DIR` | `'./test-reports'` | 默认报告目录 |

### FLAKY_CONFIG - Flaky 检测常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| `DEFAULT_THRESHOLD` | `0.3` | Flaky 默认阈值 |
| `MONITOR_THRESHOLD` | `0.1` | Monitor 默认阈值 |
| `HIGH_THRESHOLD` | `0.5` | 高风险默认阈值 |
| `MAX_HISTORY_ENTRIES` | `50` | 历史记录最大条目数 |
| `MINIMUM_RUNS_FOR_QUARANTINE` | `5` | 隔离最低运行次数 |
| `AUTO_RELEASE_AFTER_PASSES` | `3` | 软隔离自动释放连续通过次数 |
| `AUTO_RELEASE_HARD_QUARANTINE_PASSES` | `5` | 硬隔离自动释放连续通过次数 |
| `QUARANTINE_EXPIRY_DAYS` | `30` | 隔离过期天数 |
| `QUARANTINE_EXPIRY_DOWNGRADE` | `true` | 隔离过期后是否降级 |
| `DECAY_RATE` | `0.1` | 时间衰减率 |
| `CONFIDENCE_LEVEL` | `0.95` | Wilson 置信水平 |
| `BROKEN_CONSECUTIVE_THRESHOLD` | `5` | 连续失败判定 Broken 阈值 |
| `REGRESSION_WINDOW` | `5` | 回归检测窗口 |
| `CORRELATION_CO_OCCURRENCE_THRESHOLD` | `0.6` | 关联分析共现阈值 |
| `CORRELATION_MIN_RUNS` | `3` | 关联分析最低运行次数 |
| `TREND_AGGREGATION_WINDOW_DAYS` | `7` | 趋势聚合窗口（天） |
| `TREND_MIN_DATA_POINTS` | `5` | 趋势分析最低数据点数 |
| `TREND_CHANGE_POINT_THRESHOLD` | `0.3` | 变化点检测阈值 |
| `TREND_SEASONAL_MIN_CYCLES` | `3` | 季节性分析最低周期数 |
| `PREDICTION_WINDOW_RUNS` | `10` | 预测窗口运行次数 |
| `PREDICTION_DURATION_ANOMALY_ZSCORE` | `2.0` | 执行时长异常 Z-Score 阈值 |
| `PREDICTION_MIN_HISTORY` | `8` | 预测最低历史记录数 |
| `PREDICTION_SENSITIVITY` | `0.5` | 预测灵敏度 |
| `QUARANTINE_MAX_RATIO` | `0.2` | 隔离预算上限比例 |
| `QUARANTINE_SOFT_THRESHOLD` | `0.15` | 软隔离阈值 |
| `QUARANTINE_HARD_THRESHOLD` | `0.4` | 硬隔离阈值 |
| `QUARANTINE_RETRY_MAX` | `3` | 隔离重试最大次数 |
| `QUARANTINE_RETRY_DELAY_MS` | `1000` | 隔离重试延迟（毫秒） |
| `QUARANTINE_RETRY_BACKOFF` | `2` | 隔离重试退避倍数 |
| `CAUSAL_MIN_CORRELATION` | `0.4` | 因果图最低关联度 |
| `CAUSAL_MAX_DEPTH` | `5` | 因果图最大深度 |

#### HEALTH_SCORE_WEIGHTS - 健康评分权重

| 维度 | 权重 | 说明 |
|------|------|------|
| `stability` | `0.35` | 稳定性权重 |
| `trend` | `0.25` | 趋势权重 |
| `recoverability` | `0.20` | 可恢复性权重 |
| `predictability` | `0.20` | 可预测性权重 |

### CACHE_CONFIG - 缓存配置常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| `MAX_REPORT_CACHE_SIZE` | `50` | 报告缓存最大条目数 |
| `MAX_COMPLETED_RUNS` | `10` | 已完成运行最大保留数 |
| `TEST_DISCOVERY_TTL` | `300000` | 测试发现缓存 TTL（毫秒，5 分钟） |
| `SAVE_DELAY_MS` | `1000` | 保存延迟（毫秒） |
| `FLUSH_INTERVAL_MS` | `500` | 刷新间隔（毫秒） |
| `MAX_QUEUE_SIZE` | `500` | 写入队列最大大小 |

### WEBSOCKET_CONFIG - WebSocket 配置常量

| 常量名 | 值 | 说明 |
|--------|-----|------|
| `RECONNECT_BASE_DELAY` | `1000` | 重连基础延迟（毫秒） |
| `RECONNECT_MAX_DELAY` | `30000` | 重连最大延迟（毫秒） |
| `MAX_RECONNECT_ATTEMPTS` | `10` | 最大重连尝试次数 |

### FILE_PATTERNS - 文件模式常量

#### TEST_EXTENSIONS - 测试文件扩展名

```
['.spec.ts', '.spec.tsx', '.test.ts', '.test.tsx']
```

#### CONFIG_NAMES - Playwright 配置文件名

```
['playwright.config.ts', 'playwright.config.js', 'playwright.config.mts', 'playwright.config.mjs']
```

#### IGNORE_DIRS - 忽略目录

```
['node_modules', '__snapshots__', '__image_snapshots__', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.output', '.svelte-kit']
```

### DEFAULT_FLAKY_CRITERIA - 默认 Flaky 判定参数

| 参数名 | 值 |
|--------|-----|
| `minimumRuns` | `5` |
| `flakyThreshold` | `0.3` |
| `monitorThreshold` | `0.1` |
| `stableThreshold` | `0.05` |
| `highThreshold` | `0.5` |
| `brokenConsecutiveThreshold` | `5` |
| `regressionWindow` | `5` |
| `regressionRecentFailRate` | `0.6` |
| `regressionOlderFailRate` | `0.2` |
| `decayRate` | `0.1` |
| `confidenceLevel` | `0.95` |
| `autoReleaseAfterPasses` | `3` |

### DEFAULT_QUARANTINE_CRITERIA - 默认隔离判定参数

| 参数名 | 值 |
|--------|-----|
| `softThreshold` | `0.15` |
| `hardThreshold` | `0.4` |
| `maxQuarantineRatio` | `0.2` |
| `autoReleaseHardQuarantinePasses` | `5` |
| `quarantineExpiryDays` | `30` |
| `quarantineExpiryDowngrade` | `true` |
| `retryMax` | `3` |
| `retryDelayMs` | `1000` |
| `retryBackoff` | `2` |

---

<a id="14-configuration-methods"></a>
## 14. 配置方式

YuanTest 支持四种配置方式，按优先级从高到低为：

### 14.1 命令行参数

命令行参数具有最高优先级，会覆盖其他所有配置源。

#### `run` 命令

```bash
yuantest run [testFiles...] [options]
```

| 选项 | 简写 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--config` | `-c` | `string` | - | 配置文件路径 |
| `--project` | `-p` | `string` | - | 项目名称 |
| `--test-dir` | `-t` | `string` | - | 测试目录 |
| `--output` | `-o` | `string` | - | 输出目录 |
| `--shards` | `-s` | `number` | `1` | 分片数量 |
| `--workers` | `-w` | `number` | `1` | Worker 数量 |
| `--browsers` | `-b` | `string` | `'chromium'` | 浏览器列表（逗号分隔） |
| `--base-url` | - | `string` | - | 测试基础 URL |
| `--timeout` | - | `number` | `30000` | 超时时间（毫秒） |
| `--retries` | - | `number` | `0` | 重试次数 |
| `--trace` | - | `string` | `'on-first-retry'` | Trace 模式 |
| `--screenshot` | - | `string` | `'only-on-failure'` | 截图模式 |
| `--video` | - | `string` | `'retain-on-failure'` | 视频模式 |
| `--tags` | - | `string` | - | 运行指定标签的测试（逗号分隔） |
| `--grep` | - | `string` | - | Grep 过滤模式 |
| `--project-filter` | - | `string` | - | 运行指定浏览器项目 |
| `--update-snapshots` | - | `boolean` | `false` | 更新视觉测试快照 |
| `--visual-threshold` | - | `number` | `0.2` | 视觉差异阈值 |
| `--annotations` | - | `boolean` | `false` | 启用注解扫描 |
| `--html-report` | - | `boolean` | `true` | 生成 HTML 报告 |

#### `ui` 命令

```bash
yuantest ui [options]
```

| 选项 | 简写 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `--port` | `-p` | `number` | `5274` | Dashboard 端口 |
| `--output` | `-o` | `string` | - | 报告目录 |
| `--data` | `-d` | `string` | - | 数据目录 |

### 14.2 配置文件

YuanTest 会按以下顺序从当前目录向上查找配置文件：

1. `yuantest.config.ts`
2. `yuantest.config.js`
3. `yuantest.config.json`
4. `.yuantrc`
5. `.yuantrc.json`
6. `.yuantrc.js`

#### 配置文件接口

```typescript
interface YuanTestConfigFile {
  version?: string;
  testDir?: string;
  outputDir?: string;
  baseURL?: string;
  retries?: number;
  timeout?: number;
  workers?: number;
  shards?: number;
  browsers?: BrowserType[];
  reporters?: string[];
  headers?: Record<string, string>;
  flakyThreshold?: number;
  isolateFlaky?: boolean;
  traces?: {
    enabled?: boolean;
    mode?: TraceConfig['mode'];
  };
  artifacts?: {
    enabled?: boolean;
    screenshots?: ArtifactConfig['screenshots'];
    videos?: ArtifactConfig['videos'];
  };
  visualTesting?: {
    enabled?: boolean;
    threshold?: number;
    maxDiffPixels?: number;
    updateSnapshots?: boolean;
  };
  annotations?: {
    enabled?: boolean;
    respectSkip?: boolean;
    respectOnly?: boolean;
    respectFail?: boolean;
    respectSlow?: boolean;
    respectFixme?: boolean;
  };
  tags?: {
    enabled?: boolean;
    include?: string[];
    exclude?: string[];
  };
  htmlReport?: boolean;
  dashboard?: {
    port?: number;
    outputDir?: string;
    dataDir?: string;
  };
  customErrorPatterns?: Array<{
    id: string;
    category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
    name: string;
    description: string;
    regex: string[];
    rootCauseTemplate: { zh: string; en: string };
    suggestionsTemplate: { zh: string[]; en: string[] };
    docLinks?: { title: string; url: string }[];
  }>;
}
```

#### 配置文件示例

```typescript
// yuantest.config.ts
import { defineConfig } from 'yuantest-playwright';

export default defineConfig({
  version: '1.0.0',
  testDir: './e2e',
  outputDir: './test-output',
  baseURL: 'http://localhost:3000',
  retries: 2,
  timeout: 60000,
  workers: 4,
  shards: 2,
  browsers: ['chromium', 'firefox'],
  flakyThreshold: 0.3,
  isolateFlaky: true,
  traces: {
    enabled: true,
    mode: 'on-first-retry',
  },
  artifacts: {
    enabled: true,
    screenshots: 'only-on-failure',
    videos: 'retain-on-failure',
  },
  visualTesting: {
    enabled: true,
    threshold: 0.2,
    maxDiffPixels: 10,
    updateSnapshots: false,
  },
  annotations: {
    enabled: true,
    respectSkip: true,
    respectFixme: true,
  },
  tags: {
    enabled: true,
    include: ['smoke', 'regression'],
    exclude: ['slow'],
  },
  htmlReport: true,
  dashboard: {
    port: 3000,
    outputDir: './test-reports',
    dataDir: './test-data',
  },
});
```

### 14.3 user-preferences.json

用户偏好文件存储在 `{dataDir}/user-preferences.json` 中，由 Dashboard UI 自动维护，用于持久化运行时修改的配置。

#### 存储内容

| 字段 | 类型 | 说明 |
|------|------|------|
| `lang` | `'zh' \| 'en'` | 界面语言 |
| `lastVersion` | `string` | 上次使用的版本号 |
| `testDir` | `string` | 上次使用的测试目录 |
| `autoQuarantine` | `boolean` | 是否自动隔离 |
| `flakyCriteria` | `Partial<FlakyCriteriaConfig>` | Flaky 判定参数覆盖 |
| `quarantineCriteria` | `Partial<QuarantineCriteriaConfig>` | 隔离判定参数覆盖 |
| `customErrorPatterns` | `ErrorPattern[]` | 自定义错误模式 |

#### 优先级

用户偏好文件的优先级低于命令行参数和配置文件。Dashboard 启动时会读取此文件恢复上次设置。

### 14.4 Dashboard UI

通过 Dashboard Web 界面可以实时修改以下配置：

- **测试目录**：通过 `/api/v1/testdir` 接口设置
- **偏好设置**：通过 `/api/v1/preferences` 接口修改 Flaky 判定参数和隔离判定参数
- **自动隔离**：通过偏好设置开关自动隔离功能
- **自定义错误模式**：通过诊断管理界面添加/编辑/删除错误模式

Dashboard 修改的配置会自动保存到 `user-preferences.json`，下次启动时自动恢复。

### 14.5 配置合并顺序

最终生效的配置按以下顺序合并（后者覆盖前者）：

1. 代码内默认值（`DEFAULTS`、`FLAKY_CONFIG` 等常量）
2. 配置文件（`yuantest.config.ts` 等）
3. 用户偏好（`user-preferences.json`）
4. 命令行参数

```
默认值 → 配置文件 → 用户偏好 → 命令行参数
  (低) ────────────────────────────────→ (高)
```

### 14.6 配置验证

所有配置在加载时通过 Zod Schema 进行验证。验证规则包括：

- `version`：非空字符串
- `testDir`：非空字符串
- `timeout`：正整数
- `retries`：非负整数
- `workers`：正整数
- `shards`：正整数
- `flakyThreshold`：0~1 之间的数值
- `baseURL`：合法 URL 格式
- `browsers`：`'chromium'` | `'firefox'` | `'webkit'` 枚举值

无效配置会在加载时抛出验证错误。
