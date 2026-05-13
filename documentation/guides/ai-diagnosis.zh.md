# AI 智能失败分析深度指南

本文档详细介绍 AI 智能失败分析系统的架构设计、核心流程与配置方式，所有内容均与源代码实现保持一致。

---

## 目录

- [整体架构](#整体架构)
- [诊断流程](#诊断流程)
- [上下文富集引擎](#上下文富集引擎)
- [Playwright 知识库](#playwright-知识库)
- [Agent 多轮推理](#agent-多轮推理)
- [置信度校准](#置信度校准)
- [流式诊断](#流式诊断)
- [LLM 配置](#llm-配置)
- [诊断结果类型](#诊断结果类型)
- [缓存与持久化](#缓存与持久化)
- [安全机制](#安全机制)

---

## 整体架构

AI 智能失败分析系统由以下核心模块组成：

| 模块 | 源文件 | 职责 |
|------|--------|------|
| 上下文富集引擎 | `src/diagnosis/context-enricher.ts` | 收集并组装多维度上下文信息 |
| Playwright 知识库 | `src/diagnosis/knowledge-base.ts` | 错误模式匹配与 few-shot 示例生成 |
| 诊断服务 | `src/diagnosis/index.ts` | 编排完整诊断流程，含 Agent 循环与置信度校准 |
| 类型定义 | `src/types/index.ts` | 所有诊断相关接口的类型定义 |

---

## 诊断流程

完整的诊断流程按以下顺序执行：

```
enrichContext → matchPatterns → agentLoop → parseResponse → calibrateConfidence
```

1. **enrichContext** — 收集源代码、截图、控制台日志、堆栈跟踪、环境信息和历史数据
2. **matchPatterns** — 用本地知识库模式匹配识别错误类别，生成 few-shot 示例
3. **agentLoop** — 调用 LLM 进行多轮推理（支持工具调用），或降级为单次调用
4. **parseResponse** — 解析 LLM 返回的 JSON 响应为结构化 `AIDiagnosis` 对象
5. **calibrateConfidence** — 基于上下文使用情况和模式匹配结果校准置信度

---

## 上下文富集引擎

源文件：[context-enricher.ts](../../src/diagnosis/context-enricher.ts)

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

## Playwright 知识库

源文件：[knowledge-base.ts](../../src/diagnosis/knowledge-base.ts)

### 错误模式分类

知识库定义了 **6 大类**错误模式，每类包含多个具体模式：

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

## Agent 多轮推理

源文件：[index.ts](../../src/diagnosis/index.ts)（`DiagnosisService` 类）

### 工具定义

Agent 循环提供 4 个工具（以 OpenAI function calling 格式定义）：

| 工具名称 | 参数 | 说明 |
|----------|------|------|
| `read_source_file` | `path` (必填), `startLine?`, `endLine?` | 读取源代码文件 |
| `search_codebase` | `pattern` (必填), `filePattern?` | 在代码库中搜索代码模式 |
| `query_test_history` | `testId` (必填), `limit?` (默认 5) | 查询测试历史运行记录 |
| `read_screenshot` | `testId` (必填) | 读取失败截图（返回 base64） |

### 推理循环

`agentLoop` 方法的执行逻辑：

1. 构建初始消息列表（system + user，如有截图则以 vision 格式传入）
2. 首次调用 `callLLMWithTools(messages, config, TOOL_SCHEMAS)`
3. **如果 LLM 不返回 tool_calls**：
   - 有内容 → 直接返回，`analysisMode = 'single'`
   - 无内容且无 tool_calls → LLM 不支持 tool_calling，降级为 `callLLM` 单次调用，`analysisMode = 'single'`
4. **如果 LLM 返回 tool_calls** → 进入工具调用循环：
   - 最多执行 **5 轮**（由 `MAX_AGENT_ROUNDS = 5` 控制）
   - 每轮：执行工具调用 → 记录 `ReasoningStep` → 将工具结果追加到消息列表 → 再次调用 LLM
   - LLM 不再返回 tool_calls 时，返回最终内容，`analysisMode = 'agent'`
   - 达到最大轮数后，不带 tools 参数做最终调用
5. **异常降级**：Agent 循环出错时，退回 `callLLM` 单次调用模式，`analysisMode = 'single'`

### ReasoningStep 记录

每轮工具调用都会记录推理步骤：

```typescript
interface ReasoningStep {
  step: number;      // 轮次序号
  tool?: string;     // 工具名称
  input?: string;    // 工具调用参数（JSON 字符串）
  output?: string;   // 工具执行结果（截断至 500 字符）
  thought: string;   // 推理描述
}
```

### 分析模式

`analysisMode` 有三种取值：

| 模式 | 含义 |
|------|------|
| `agent` | 成功执行了 Agent 多轮工具调用循环 |
| `single` | LLM 不支持 tool_calling 或直接给出最终答案，使用单次调用 |
| `fallback` | LLM 响应解析失败，使用原始文本作为摘要 |

---

## 置信度校准

源文件：[index.ts](../../src/diagnosis/index.ts)（`calibrateConfidence` 方法）

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

### 低置信度警告

当 `calibratedConfidence < 0.5` 时，系统自动在 `suggestions` 数组末尾追加警告信息：

- 中文：`⚠️ 置信度较低，建议人工确认此诊断结果`
- 英文：`⚠️ Low confidence, manual review recommended for this diagnosis`

---

## 流式诊断

源文件：[index.ts](../../src/diagnosis/index.ts)（`diagnoseStream` 方法）

流式诊断通过 SSE（Server-Sent Events）实现实时推送。

### SSE 传输格式

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

### 事件类型

| 事件 type | 说明 | 数据字段 |
|-----------|------|----------|
| `start` | 诊断开始 | `testTitle` |
| `chunk` | LLM 生成内容片段 | `content` |
| `complete` | 诊断完成 | `diagnosis`（完整 AIDiagnosis 对象） |
| `error` | 诊断出错 | `error`（错误信息字符串） |

### 事件流时序

```
→ data: {"type":"start","testTitle":"登录测试"}\n\n
→ data: {"type":"chunk","content":"{"}\n\n
→ data: {"type":"chunk","content":"\"summary\":"}\n\n
→ data: {"type":"chunk","content":"\"元素等待超时\""}\n\n
→ ...（多个 chunk 事件）
→ data: {"type":"complete","diagnosis":{...}}\n\n
```

### 流式模式限制

流式诊断使用简化的单次调用模式（`callLLMStream`），**不使用 Agent 循环**，因此：

- `analysisMode` 固定为 `'single'`
- 不产生 `reasoningSteps`
- 不支持工具调用

---

## LLM 配置

### LLMConfig 类型

```typescript
interface LLMConfig {
  enabled: boolean;      // 是否启用 AI 诊断
  apiKey: string;        // API 密钥
  baseUrl: string;       // API 基础 URL
  model: string;         // 模型名称
  remark: string;        // 配置备注
  maxTokens: number;     // 最大生成 token 数
  temperature: number;   // 生成温度
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
  maxTokens: 2048,
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
- **加载**：`DiagnosisService` 构造时自动加载，合并默认值
- **保存**：`saveConfig(config)` 保存配置并自动清除缓存
- **读取**：`getMaskedConfig()` 返回配置的浅拷贝

### 连接测试

- **测试端点**：`{baseUrl}/v1/models`
- **超时**：10 秒
- **状态判定**：
  - `green`：已配置且连接正常
  - `yellow`：未完成配置
  - `red`：已配置但连接失败

---

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
  reasoningSteps?: ReasoningStep[]; // Agent 推理步骤
  calibratedConfidence: number;  // 校准后的置信度 (0-1)
  analysisMode: 'agent' | 'single' | 'fallback'; // 分析模式
  relatedFailures?: string[];    // 关联失败信息
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
