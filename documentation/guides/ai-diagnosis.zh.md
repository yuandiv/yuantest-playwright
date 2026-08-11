# AI 智能失败分析深度指南

本文档详细介绍 AI 智能失败分析系统的架构设计、核心流程与配置方式，所有内容均与源代码实现保持一致。

---

## 目录

- [整体架构](#overall-architecture)
- [诊断流程](#diagnosis-process)
- [上下文富集引擎](#context-enrichment-engine)
- [Playwright 知识库](#playwright-knowledge-base)
- [诊断模式与 LLM 调用](#diagnosis-mode-and-llm-invocation)
- [置信度校准](#confidence-calibration)
- [LLM 配置](#llm-configuration)
- [诊断结果类型](#diagnosis-result-types)
- [缓存与持久化](#cache-and-persistence)
- [安全机制](#security-mechanisms)

---

<a id="overall-architecture"></a>
## 整体架构

AI 智能失败分析系统由以下核心模块组成：

| 模块 | 源文件 | 职责 |
|------|--------|------|
| 上下文富集引擎 | `src/diagnosis/context-enricher.ts` | 收集并组装多维度上下文信息（源代码、截图、日志、堆栈、环境、历史） |
| Playwright 知识库 | `src/diagnosis/knowledge-base.ts` | 错误模式匹配与 few-shot 示例生成，支持自定义模式注册 |
| 错误模式定义 | `src/diagnosis/patterns/*.ts` | 按类别拆分的 7 大类 30+ 个内置错误模式 |
| 错误分类器 | `packages/diagnosis/src/categorizer.ts` | 基于正则的错误消息分类，将错误归为 7 种预定义类别 |
| 响应解析器 | `src/diagnosis/response-parser.ts` | 将 LLM 的 JSON 回复解析为结构化 `AIDiagnosis` 对象，含兜底降级逻辑 |
| 诊断缓存 | `src/diagnosis/diagnosis-cache.ts` | 基于 TTLCache 的内存缓存，最大 100 条，TTL 30 分钟，LRU 淘汰 |
| 诊断持久化 | `src/diagnosis/diagnosis-persister.ts` | 按 `runId` 将诊断结果存储到磁盘 `{dataDir}/diagnosis/` 目录 |
| 诊断 Agent | `packages/ai/src/agents/diagnosis.ts` | 编排完整诊断流程，继承 `BaseAgent`，支持同步与流式两种诊断模式 |
| 聚类分析 | `packages/diagnosis/src/cluster.ts` | 基于 Jaccard 相似度 + 并查集算法的失败测试聚类 |
| 类型定义 | `packages/contracts/src/index.ts` | 所有诊断相关接口的类型定义 |

---

<a id="diagnosis-process"></a>
## 诊断流程

完整的诊断流程按以下步骤执行：

```
prepareDiagnosis → callLLM 或 chatStream → finalizeDiagnosis
```

### 1. prepareDiagnosis（准备阶段）

1. **matchPatterns** — 用本地知识库模式匹配识别错误类别
2. **enrichContext** — 收集源代码、截图、控制台日志、堆栈跟踪、环境信息和历史数据，生成 `EnrichedContext` 对象
3. **buildEnrichedPrompt** — 构建 system prompt（含 few-shot 示例）和 user prompt（含上下文信息），要求 LLM 以 JSON 格式返回

### 2. callLLM / chatStream（LLM 调用）

- **非流式诊断**（`diagnose` 方法）：调用 `BaseAgent.callLLM()`，使用 `responseFormat: { type: 'json_object' }` 强制 JSON 格式输出
- **流式诊断**（`diagnoseStream` 方法）：调用 `llmService.chatStream()`，以 AsyncGenerator 逐 token 产出，最终返回完整 `AIDiagnosis`

### 3. finalizeDiagnosis（收尾阶段）

1. **parseResponse** — 解析 LLM 返回的文本为结构化 `AIDiagnosis` 对象（含 JSON 提取与兜底降级逻辑）
2. **calibrateConfidence** — 基于模式匹配结果和上下文使用情况校准置信度
3. 写入缓存（`DiagnosisCache`）和持久化（`DiagnosisPersister`）

---

<a id="context-enrichment-engine"></a>
## 上下文富集引擎

源文件：[context-enricher.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/src/diagnosis/context-enricher.ts)

`enrichContext` 函数收集 6 种上下文信息，返回 `EnrichedContext` 对象：

### 1. 源代码上下文

- 调用 `readSourceCode(filePath, lineNumber)` 读取失败测试所在文件
- 当提供 `lineNumber` 时，读取失败行 **±20 行**的上下文（由 `SOURCE_CONTEXT_LINES = 20` 控制）
- 失败行前加 `>>>` 标记以醒目显示
- 最大读取行数限制为 **100 行**（由 `MAX_SOURCE_LINES = 100` 控制）
- 文件不存在或读取失败时返回 `undefined`

### 2. 截图分析

- 调用 `encodeScreenshot(screenshots)` 将截图文件编码为 base64
- 读取 `screenshots` 数组中的**第一个文件**进行 base64 编码
- 编码后的 base64 字符串传入支持 vision 的 LLM 进行图像分析

### 3. 控制台日志

- 直接使用 `testInfo.logs` 数组中的浏览器 console 日志
- 包含测试失败前的 `console.error` / `console.warn` 输出

### 4. 完整堆栈跟踪

- 直接使用 Playwright 原始 `error.stack`
- 由 `testInfo.stackTrace` 字段提供

### 5. 环境信息

- 调用 `buildEnvironmentInfo(testInfo)` 构建，包含：
  - **浏览器类型**：`testInfo.browser`（默认 `unknown`）
  - **操作系统**：`process.platform` + `process.arch`
  - **Node.js 版本**：`process.version`
  - **工作目录**：`process.cwd()`

### 6. 历史数据

- 调用 `buildHistoryContext(testTitle, dataDir)` 从 `dataDir/history.json` 读取
- 查找指定测试的历史记录，按时间倒序排列取最近 **5 次**运行
- 统计通过/失败次数、失败率和上次失败原因

### EnrichedContext 接口

```typescript
interface EnrichedContext {
  sourceCode?: string;
  screenshotBase64?: string;
  consoleLogs: string[];
  stackTrace?: string;
  environmentInfo: string;
  historyData?: string;
  contextUsed: ContextUsed;
  rootCauseContext?: {
    primaryCause: RootCauseAnalysis['primaryCause'];
    confidence: number;
    evidence: Array<{
      indicators: string[];
      confidence: number;
      description: string;
    }>;
    suggestedActions: string[];
  };
}
```

### ContextUsed 类型

记录每种上下文是否实际被使用：

```typescript
interface ContextUsed {
  sourceCode: boolean;
  screenshot: boolean;
  consoleLogs: boolean;
  stackTrace: boolean;
  historyData: boolean;
  environmentInfo: boolean;
}
```

> 注意：`environmentInfo` 始终为 `true`，因为环境信息总是可用的。

---

<a id="playwright-knowledge-base"></a>
## Playwright 知识库

源文件：[knowledge-base.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/src/diagnosis/knowledge-base.ts)

### 错误模式分类

知识库定义了 **7 大类**错误模式，每类包含多个具体模式，总共 30+ 个内置模式：

#### 1. TimeoutError — 等待超时

| 模式 ID | 名称 | 典型正则 |
|---------|------|----------|
| `timeout-element-wait` | 元素等待超时 | `Timeout.*waiting for.*selector` |
| `timeout-navigation` | 导航超时 | `Timeout.*navigating` |
| `timeout-api-response` | API 响应超时 | `Timeout.*waiting for.*response` |
| `timeout-race-condition` | 并发竞争超时 | `race.*condition` / `concurrent.*error` |
| `timeout-memory-overflow` | 内存溢出 | `heap.*out.*of.*memory` / `JavaScript heap out of memory` |
| `timeout-concurrent-conflict` | 并发冲突 | `port.*already.*in.*use` / `EADDRINUSE` |

#### 2. SelectorError — 选择器失败

| 模式 ID | 名称 | 典型正则 |
|---------|------|----------|
| `selector-element-not-found` | 元素不存在 | `No element found.*selector` |
| `selector-strict-mode` | 选择器歧义 | `strict mode violation` |
| `selector-iframe` | iframe 内选择器 | `frame.*selector` |
| `selector-headless-difference` | Headless 环境差异 | `headless.*mode.*fail` |

#### 3. AssertionError — 断言失败

| 模式 ID | 名称 | 典型正则 |
|---------|------|----------|
| `assertion-text-mismatch` | 文本不匹配 | `Expected.*text.*received` |
| `assertion-visibility` | 可见性断言失败 | `Expected.*visible.*hidden` |
| `assertion-attribute` | 属性断言失败 | `Expected.*attribute.*value` |
| `assertion-data-validation` | 数据验证错误 | `data.*invalid` / `validation.*fail` |
| `assertion-state-inconsistency` | 状态不一致 | `state.*mismatch` / `stale.*data` |

#### 4. NetworkError — 网络错误

| 模式 ID | 名称 | 典型正则 |
|---------|------|----------|
| `network-request-failed` | 请求失败 | `Request failed` / `net::ERR_` |
| `network-cors` | CORS 跨域错误 | `CORS` / `Cross-Origin` |
| `network-dns` | DNS 解析失败 | `ERR_NAME_NOT_RESOLVED` / `DNS` |
| `network-env-config` | 环境配置错误 | `ECONNREFUSED` / `getaddrinfo` |
| `network-dependency-missing` | 依赖缺失 | `Cannot find module` / `MODULE_NOT_FOUND` |

#### 5. FrameError — Frame 相关错误

| 模式 ID | 名称 | 典型正则 |
|---------|------|----------|
| `frame-detached` | Frame 已分离 | `frame.*detached` |
| `frame-cross-origin` | 跨 Frame 安全限制 | `cross-origin frame` |

#### 6. AuthError — 认证相关错误

| 模式 ID | 名称 | 典型正则 |
|---------|------|----------|
| `auth-token-expired` | Token 过期 | `401.*Unauthorized` / `token.*expired` |
| `auth-redirect-login` | 未登录重定向 | `302.*redirect.*login` |

### ErrorPattern 结构

每种错误模式包含以下字段：

```typescript
interface ErrorPattern {
  id: string;                                          // 唯一标识
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  name: string;                                        // 模式名称
  description: string;                                 // 错误特征描述
  regex: RegExp[];                                     // 典型错误消息正则
  rootCauseTemplate: { zh: string; en: string };       // 根因分析模板（中英文）
  suggestionsTemplate: { zh: string[]; en: string[] }; // 修复建议模板（中英文）
  docLinks: { title: string; url: string }[];          // 关联 Playwright 文档链接
}
```

### 模式匹配与 few-shot 注入

- **自动匹配**：调用 LLM 前，先用 `matchPatterns(error)` 在本地知识库中匹配错误类别
- **few-shot 示例**：匹配到的模式通过 `buildFewShotExamples(patterns, lang)` 转换为 prompt 片段，注入到 system prompt 中
- 匹配到的模式信息包含：模式名称、典型根因、建议修复、参考文档

### 自定义模式

知识库支持注册自定义错误模式：

- `registerPattern(pattern)` — 注册新模式（相同 ID 会覆盖）
- `unregisterPattern(patternId)` — 注销模式
- `getCustomPatterns()` — 获取所有自定义模式
- `loadPatternsFromConfig(configPatterns)` — 从配置批量加载模式

---

<a id="diagnosis-mode-and-llm-invocation"></a>
## 诊断模式与 LLM 调用

源文件：[diagnosis.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/packages/ai/src/agents/diagnosis.ts)（`DiagnosisAgent` 类）

### 诊断模式

`DiagnosisAgent` 使用 **单次 LLM 调用**模式，通过 `responseFormat: { type: 'json_object' }` 强制 LLM 以 JSON 格式返回结构化诊断结果。不涉及多轮工具调用循环。

### 分析模式

`analysisMode` 有三种取值，由 `parseResponse` 根据解析结果决定：

| 模式 | 含义 |
|------|------|
| `single` | LLM 成功返回了可解析的 JSON 响应 |
| `fallback` | LLM 响应解析失败，使用原始文本截断作为摘要 |

### 非流式诊断（diagnose 方法）

1. 检查缓存（`DiagnosisCache`），命中则直接返回
2. 调用 `prepareDiagnosis` 准备上下文、模式和 Prompt
3. 调用 `BaseAgent.callLLM()`（实际委托 `LLMService.chat()`），指定 `responseFormat: { type: 'json_object' }`
4. 调用 `finalizeDiagnosis` 解析响应并校准置信度
5. 写入缓存后返回

### 流式诊断（diagnoseStream 方法）

流式诊断通过 SSE（Server-Sent Events）实现实时推送。

1. 调用 `prepareDiagnosis` 准备诊断上下文
2. 调用 `llmService.chatStream()` 逐 token 产出
3. 最终返回完整 `AIDiagnosis` 对象

#### SSE 传输格式

服务端设置响应头：

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

每个事件以 `data:` 前缀发送，格式为：

```
data: {"type":"...","...":"..."}\n\n
```

#### 事件类型

| 事件 type | 说明 | 数据字段 |
|-----------|------|----------|
| `start` | 诊断开始 | `testTitle` |
| `chunk` | LLM 生成内容片段 | `content` |
| `complete` | 诊断完成 | `diagnosis`（完整 AIDiagnosis 对象） |
| `error` | 诊断出错 | `error`（错误信息字符串） |

#### 事件流时序

```
→ data: {"type":"start","testTitle":"登录测试"}\n\n
→ data: {"type":"chunk","content":"{"}\n\n
→ data: {"type":"chunk","content":"\"summary\":"}\n\n
→ data: {"type":"chunk","content":"\"元素等待超时\""}\n\n
...（多个 chunk 事件）
→ data: {"type":"complete","diagnosis":{...}}\n\n
```

#### 流式模式特点

- `analysisMode` 固定为 `'single'`
- 不产生 `reasoningSteps`
- 不支持工具调用

### 聊天系统中的 Agent 多轮推理

在聊天系统（`LLMService.chatWithAgentLoop` / `chatWithAgentLoopStream`）中，支持完整的 Agent 多轮工具调用循环，提供以下工具：

| 工具名称 | 参数 | 说明 |
|----------|------|------|
| `read_file` | `path` (必填), `startLine?`, `endLine?` | 读取文件内容 |
| `search_files` | `pattern` (必填), `filePattern?` | 按模式搜索文件 |
| `run_test` | `testFilePath` (必填), `options?` | 运行指定测试 |
| `apply_patch` | `filePath` (必填), `patch` (必填) | 对文件应用补丁 |
| `get_heal_history` | `testFilePath` (必填) | 获取测试修复历史 |
| `list_plans` | `options?` | 列出测试计划 |

该 Agent 循环逻辑：
- 最多执行 **5 轮**（由 `MAX_AGENT_ROUNDS = 5` 控制）
- 每轮：执行工具调用 → 记录 `ReasoningStep` → 将工具结果追加到消息列表 → 再次调用 LLM
- LLM 不再返回 tool_calls 时，返回最终内容
- 达到最大轮数后强制终止，`truncated = true`

> 注意：`DiagnosisAgent` 的诊断流程本身不调用 Agent 循环；Agent 多轮推理主要供聊天系统中的 `agent_diagnose` 工具使用。

---

<a id="confidence-calibration"></a>
## 置信度校准

源文件：[diagnosis.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/packages/ai/src/agents/diagnosis.ts)（`calibrateConfidence` 方法）

校准公式：

```
calibratedConfidence = llmConfidence × 0.6 + patternMatchBonus + contextBonus + historyBonus
```

各项加分规则：

| 加分项 | 条件 | 分值 |
|--------|------|------|
| 模式匹配加分 | `patternMatched = true`（知识库匹配到错误模式） | +0.2 |
| 截图加分 | `contextUsed.screenshot = true` | +0.1 |
| 源代码加分 | `contextUsed.sourceCode = true` | +0.1 |
| 控制台日志加分 | `contextUsed.consoleLogs = true` | +0.05 |
| 历史一致性加分 | `historyConsistent = true`（存在历史数据） | +0.1 |

最终结果通过 `Math.min(1, Math.max(0, calibrated))` 限制在 **[0, 1]** 范围内。

> **注意**：当前实现中 `historyConsistent` 参数在 `finalizeDiagnosis` 中固定为 `false`，历史一致性加分暂未生效。

### 低置信度警告

当 `calibratedConfidence < 0.5` 时，系统自动在 `suggestions` 数组末尾追加警告信息：

- 中文：`⚠️ 置信度较低，建议人工确认此诊断结果`
- 英文：`⚠️ Low confidence, manual review recommended for this diagnosis`

### 低置信度提示（agent_diagnose 工具）

`agent_diagnose` 工具在返回诊断结果时，也会根据 `calibratedConfidence` 判断置信度：
- 当置信度低于 50% 时，在结果末尾追加人工复核提示
- 诊断结果中包含代码修改建议（`codeDiffs`）数量统计

---

<a id="llm-configuration"></a>
## LLM 配置

### LLMConfig 类型

```typescript
interface LLMConfig {
  enabled: boolean;          // 是否启用 AI 诊断
  apiKey: string;            // API 密钥
  baseUrl: string;           // API 基础 URL
  model: string;             // 模型名称
  remark: string;            // 配置备注
  maxTokens: number;         // 最大生成 token 数
  temperature: number;       // 生成温度
  chatTemplateKwargs?: boolean; // 是否使用聊天模板参数
}
```

### 默认配置

```typescript
const DEFAULT_CONFIG: LLMConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  model: '',
  remark: '',
  maxTokens: 4096,
  temperature: 0.3,
};
```

### 兼容服务

系统兼容所有 **OpenAI API 兼容接口**，包括但不限于：

- OpenAI（GPT-4、GPT-3.5 等）
- Ollama（本地模型服务）
- vLLM（高性能推理服务）
- 其他兼容 `/v1/chat/completions` 接口的服务

### API 调用格式

- **端点**：`{baseUrl}/v1/chat/completions`
- **认证**：当 `apiKey` 非空时，添加 `Authorization: Bearer {apiKey}` 请求头
- **请求超时**：60 秒
- **响应格式**：`response_format: { type: "json_object" }`（非工具调用模式）
- **流式请求**：`stream: true`

### 配置管理

- **存储位置**：`{dataDir}/llm-config.json`
- **加载**：`loadLLMConfig()` 从文件读取配置
- **保存**：`saveLLMConfig(config)` 持久化配置到文件

### 连接测试

- **测试端点**：`{baseUrl}/models`
- **超时**：10 秒
- **状态判定**：
  - `green`：已配置且连接正常
  - `yellow`：未完成配置
  - `red`：已配置但连接失败

---

<a id="diagnosis-result-types"></a>

## 诊断结果类型

### AIDiagnosis 接口

```typescript
interface AIDiagnosis {
  summary: string;               // 简要失败摘要
  rootCause: string;             // 识别的根本原因
  suggestions: string[];         // 可操作的修复建议列表
  confidence: number;            // LLM 原始置信度 (0-1)
  model: string;                 // 使用的模型名称
  timestamp: number;             // 诊断时间戳
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  codeDiffs?: CodeDiff[];        // 建议的代码修改
  docLinks?: DocLink[];          // 相关文档链接
  contextUsed: ContextUsed;      // 实际使用的上下文信息
  reasoningSteps?: ReasoningStep[]; // 推理步骤（聊天系统 Agent 循环使用）
  calibratedConfidence: number;  // 校准后的置信度 (0-1)
  analysisMode: 'single' | 'fallback'; // 分析模式（当前仅有 single 和 fallback）
  relatedFailures?: string[];    // 关联失败信息
  healerPatch?: HealerPatch;     // 自动生成的修复补丁
}
```

### CodeDiff — 代码差异

```typescript
interface CodeDiff {
  filePath: string;     // 文件路径
  unifiedDiff: string;  // unified diff 格式的修改内容
  description: string;  // 修改说明
}
```

### DocLink — 文档链接

```typescript
interface DocLink {
  title: string;  // 文档标题
  url: string;    // 文档 URL
}
```

### ReasoningStep — 推理步骤

```typescript
interface ReasoningStep {
  step: number;      // 步骤序号
  tool?: string;     // 使用的工具名称
  input?: string;    // 工具输入参数
  output?: string;   // 工具输出结果
  thought: string;   // 推理思考过程
}
```

---

<a id="cache-and-persistence"></a>
## 缓存与持久化

### 内存缓存

- **最大条目数**：100（`CACHE_MAX_SIZE`）
- **过期时间**：30 分钟（`CACHE_TTL_MS = 30 * 60 * 1000`）
- **淘汰策略**：LRU（达到上限时删除最早插入的条目）
- **缓存键**：`{title}::{error}::{filePath}::{lineNumber}::{lang}`
- **清除时机**：保存新配置时自动清除

### 持久化存储

- **存储目录**：`{dataDir}/diagnosis/`
- **文件格式**：`{runId}.json`，内容为 `Record<string, AIDiagnosis>`（以 testId 为键）
- **保存时机**：提供 `runId` 和 `testId` 时，诊断完成后自动持久化
- **加载时机**：诊断前先检查持久化结果，存在则直接返回

---

<a id="security-mechanisms"></a>

## 安全机制

### 文件访问控制

Agent 工具调用中的 `read_source_file` 和 `search_codebase` 实施以下安全限制：

**路径限制**：

- 只允许访问项目工作目录（`process.cwd()`）下的文件
- 路径超出项目目录时拒绝访问

**敏感文件过滤**：

以下模式的文件禁止读取：

| 模式 | 说明 |
|------|------|
| `.env` | 环境变量文件 |
| `.pem` / `.key` / `.p12` / `.pfx` | 证书/密钥文件 |
| `id_rsa` / `id_ed25519` | SSH 私钥 |
| `credentials` | 凭证文件 |
| `.npmrc` | npm 配置（可能含 token） |
| `ssh/config` | SSH 配置 |
| `.gitconfig` | Git 配置 |
| `htpasswd` | HTTP 认证文件 |

**目录过滤**：

搜索代码库时跳过以下目录：

- `node_modules`
- `.git`
- `__pycache__`
- `.venv` / `venv`

**搜索限制**：

- 最大搜索深度：8 层
- 最大结果数：20 条
- 工具输出截断：500 字符
