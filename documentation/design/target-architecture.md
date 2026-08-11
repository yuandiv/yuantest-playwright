# 目标架构设计（V3）— Monorepo + Turborepo 改造

> 状态：**已实施完成**（P1–P6 已合入，2026-08-03）
> 目标：将 yuantest-playwright 从单包单体重构为 pnpm + Turborepo 的 Monorepo，将**执行器 / 报告器 / AI 能力**分离并解耦。
> 本文档为实施基线，§8 路线图各阶段均已落地；实施过程中的拓扑调整（P5a 提前至 P4）已在下文注明。

---

## 1. 背景与动机

当前项目是单包（`yuantest-playwright`）单仓库，`src/` 下 40+ 模块互相直接 import，存在以下问题：

| 维度 | 现状 | 问题 |
|---|---|---|
| 耦合 | `container/registrations.ts` 同时 import executor / reporter / flaky / ai | 三块能力绑死，无法单独构建、测试、演进 |
| 依赖方向 | 任意模块互相 import | 无边界，AI 包改动影响纯执行场景 |
| 构建 | 单一 `tsc + vite build` | 任何改动全量重建，无法增量缓存 |
| 测试 | 40+ 测试文件集中在 `tests/` | 无法按能力圈隔离运行 |

**核心约束**：对外保持 `yuantest` bin、包名 `yuantest-playwright`、公共 API 完全兼容，现有用户零感知。

---

## 2. 目标架构总览（V3）

```
yuantest-playwright/                 # pnpm + Turborepo 单仓
├── turbo.json                       # build/typecheck/test/lint/dev 任务图
├── pnpm-workspace.yaml              # apps/*, packages/*
├── package.json                     # private root，scripts 代理 turbo
├── tsconfig.base.json               # CJS / strict / ES2022 公共配置
├── apps/                            # 可独立运行的应用层（组合根）
│   ├── cli/            @yuantest/cli        # bin/yuantest + commander 命令；唯一对外发布包
│   └── dashboard/      @yuantest/dashboard  # React+Vite 前端 + DashboardServer
└── packages/                        # 能力包，全部 private，只依赖 contracts + core
    ├── contracts/     @yuantest/contracts  # 类型 / Zod schema / 事件契约 / 包间接口
    ├── core/          @yuantest/core       # logger, config, validation, constants, cache,
    │                                        # middleware, storage, 容器内核(ServiceContainer/TOKENS/MutableRef)
    ├── diagnosis/     @yuantest/diagnosis  # 纯规则失败诊断引擎（零 AI 依赖）
    ├── flaky/         @yuantest/flaky      # 统计 flaky 引擎（零 AI 依赖）
    ├── ai/            @yuantest/ai         # LLM 层（唯一 AI 能力）
    ├── executor/      @yuantest/executor   # 执行器
    └── reporter/      @yuantest/reporter   # 报告器
```

### 包间接口（定义于 contracts）

| 接口 | 说明 | 实现方 / 消费方 |
|---|---|---|
| `IFailureDiagnoser` | 失败诊断能力 | 实现：ai 的 DiagnosisAgent；消费：reporter、apps |
| `IFlakyManager` | flaky 隔离/分析 | 实现：flaky 包；消费：executor（经注入） |
| `ITestExecutor` | 执行测试能力 | 实现：executor 包；消费：ai（execute 工具，经注入） |
| `IResultEnrichers` | 结果管理（artifacts/annotations/tags/visual） | 实现：reporter 包；消费：executor（经注入） |

---

## 3. 包边界与职责

### @yuantest/contracts（契约层，零业务逻辑）

- 领域类型与 Zod schema：`TestResult, RunResult, ProgressMessage, RealTimeMessage, FlakyTest, AgentConfig, FailureAnalysis, VisualTestResult…`（从现 `src/types` + `src/validation` 迁移）
- 事件定义：`RunStartedEvent / TestProgressEvent / RunCompletedEvent / …`
- 包间接口：见上表

### @yuantest/core（基础能力层，纯基础设施）

- `logger`、`constants`、`utils`、`i18n`、`cache`、`base`、`middleware`
- `config`（loader/merger）、`validation` 通用校验
- `storage`（**实测被 logger/config/utils 依赖，属地基，必须在此**）
- 容器内核：`ServiceContainer`、`TOKENS`、`MutableRef`（**不含 registrations / router-deps-builder**，见 §5）

### @yuantest/diagnosis（纯规则诊断引擎）

- `categorizer`、`knowledge-base`、`cluster`、`context-enricher`、`response-parser` 等
- **零 AI 依赖**，reporter 直接依赖它做错误分类，ai 复用其知识库

### @yuantest/flaky（统计 flaky 引擎）

- `classifier`、`predictor`、`trend`、`causal-graph`、`root-cause`、`quarantine`、`correlation`
- **零 AI 依赖**，executor 经 `IFlakyManager` 注入使用（quarantine 过滤）

### @yuantest/ai（LLM 层，唯一 AI 能力）

- `agents`（planner/generator/healer/diagnosis）、`chat`、`mcp`、`tools`、`acp-bridge`、`adapters`
- 依赖 diagnosis（知识库/缓存/持久化），经 `ITestExecutor` 注入执行能力
- LLM 未配置时降级为规则分析，不阻塞主链路

### @yuantest/executor（执行器）

- `orchestrator`、`executor`、`discovery`、`trace`、`progress`
- 职责：跑测试、发进度事件；**不写存储、不生成报告、不做分析**
- 结果管理器（artifacts/annotations/tags/visual）经 `IResultEnrichers` 接口注入，**不在内部 `new`**（P3 改造点）

### @yuantest/reporter（报告器）

- `reporter`、`realtime`、报告读写、HTML 模板（随本包发版）
- **artifacts/annotations/tags/visual**（结果管理器，实现 `IResultEnrichers`）
- 依赖 diagnosis（纯规则分类）；对 ai/flaky 仅 `import type` + 可选注入（apps 层组装）

### apps/cli 与 apps/dashboard

- cli：`bin/yuantest` + 全部 commander 命令；**组合根**；对外保持包名与 bin 不变
- dashboard：现有 `dashboard/` 前端平移；DashboardServer 的 routes 按能力拆分（`runs→reporter`、`chat/diagnosis→analyzer`、`rerun→executor`）

---

## 4. 依赖图（全部单向、无环，经实测）

```
apps/cli / apps/dashboard（组合根：registrations / router-deps-builder 只在这里）
   │
   ▼
executor ──► flaky（经 IFlakyManager 注入）
reporter ──► diagnosis（纯规则）；reporter ──► ai/flaky 仅 type-only + 注入
ai ──► diagnosis；ai ──► executor 经 ITestExecutor 注入（execute 工具不 new Executor）
diagnosis / flaky ──► core（含容器内核）；core ──► contracts
```

**边界规则：**
1. `executor / reporter / ai` 之间禁止运行时互相 import，一律走 contracts 接口 + apps 层注入
2. `diagnosis / flaky` 零 AI 依赖
3. `ai → diagnosis` 单向（复用知识库/缓存/持久化）
4. 组合根（`registrations.ts` / `router-deps-builder.ts`）**只允许存在于 apps 层**

---

## 5. 实测验证记录（重要）

以下结论均通过 grep 实测得出，是设计的事实依据：

| 验证点 | 实测结果 | 设计结论 |
|---|---|---|
| storage 归属 | `logger`、`config/loader`、`utils/filesystem`（属 core）直接 import storage；全项目 15+ 处使用 | storage 必须在 **core** |
| executor 纯净性 | `packages/executor/src/executor/index.ts` 内部 `new AnnotationManager/TagManager/ArtifactManager/VisualTestingManager`；`flakyManager` 已构造注入 | 结果管理器需接口化注入（P3 改造） |
| reporter ↔ ai | `reporter/index.ts` import `categorizeError/generateSuggestions`（纯函数）；`import type { DiagnosisAgent, FlakyTestManager }` | categorizer 属 diagnosis（非 AI）；ai/flaky 保持 type-only |
| ai 边界 | `ai/**` 只依赖 types/logger/diagnosis；唯一例外 `ai/tools/agent/execute.ts` 运行时 import Executor | 该例外经 `ITestExecutor` 接口注入消除（P5c 改造） |
| analyzer 内部分层 | `ai → diagnosis` 单向，`flaky`、`diagnosis` 均不依赖 ai | analyzer 天然拆三包 |
| container 归属 | `service-container/mutable-ref/tokens` 零外部依赖；`registrations/router-deps-builder` import 全部业务包 | 容器内核归 core；组合根归 apps |
| 其余模块 | realtime→core、base→core、trace→core、discovery→core、logger→core | 边界全部成立 |

**实施后对照（P1–P6 落地验证）**：

| 设计结论 | 实施状态 |
|---|---|
| storage 在 core | ✅ 已落实 |
| executor 结果管理器接口化 | ✅ P3 已落实（`IResultEnrichers` 四接口注入） |
| reporter 仅 type-only 依赖 ai/flaky | ✅ P4 已落实（`IFailureDiagnoser`/`IFlakyManager`） |
| ai 例外经 ITestExecutor 消除 | ✅ P5c 已落实（组合根包装适配器注入） |
| analyzer 拆三包 | ✅ P5 已落实（diagnosis/flaky/ai 独立包） |
| 容器内核归 core、组合根归 apps | ✅ P2 已落实 |
| 包间依赖图无环 | ✅ 实测通过（contracts 零依赖，其余单向） |
| 对外兼容（bin/main/types/files） | ✅ P7 复核通过（`yuantest` bin → `dist/cli/index.js`，公共 API 45 项重导出） |

---

## 6. Turborepo 要点

```jsonc
// turbo.json
{
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["^build"] },
    "lint":      {},
    "dev":       { "cache": false, "persistent": true }
  }
}
```

- 根 scripts 代理：`turbo build / turbo test / turbo lint / turbo typecheck`
- 各包独立 `tsconfig` 继承 `tsconfig.base.json`；**CJS**（兼容现有发布产物）
- 测试用 vitest workspace 统一运行，按包缓存隔离

---

## 7. 已锁定决策

| 决策点 | 选择 |
|---|---|
| 包管理器 | **pnpm** workspaces |
| 发布策略 | **单包发布**：仅 apps/cli 对外发 `yuantest-playwright`，packages 全 private，沿用 standard-version |
| 迁移节奏 | **分阶段合入**，每阶段独立提交、测试全绿、可回退 |
| 模块格式 | **CJS** |
| analyzer 粒度 | **拆三包**：diagnosis（纯规则）/ flaky（纯统计）/ ai（LLM 层） |
| 结果管理器归属 | **reporter + 接口注入**（executor 经 `IResultEnrichers` 使用） |
| ai → executor | **接口注入**（`ITestExecutor`，execute 工具不再 `new Executor`） |

---

## 8. 迁移路线图

> 实施状态：✅ = 已合入（提交哈希见 git log）。

| 阶段 | 内容 | 验收 | 状态 |
|---|---|---|---|
| P0 基线 | 锁定 `npm test` 全绿 | 现状可回退 | ✅ |
| P1 骨架 | pnpm workspaces + turbo.json + 根配置；旧单包平移至 apps/cli | `turbo build` 跑通 | ✅ |
| P2 contracts+core | types/validation/logger/config/utils/storage/constants 等平移为 workspace 包 | 旧代码改 import 后测试全绿 | ✅ |
| P3 executor | orchestrator/executor/discovery/trace + 结果管理器接口注入改造 | 同上 | ✅ |
| P4 reporter | reporter/realtime/报告读写/模板 + artifacts/annotations/tags/visual | 报告产物一致 | ✅ |
| P5a diagnosis | 纯规则诊断引擎独立成包 | 测试全绿 | ✅（**提前至 P4**，见下） |
| P5b flaky | 统计 flaky 引擎独立成包 | 同上 | ✅ |
| P5c ai | LLM 层独立成包 + `ITestExecutor` 接口注入改造 | LLM/降级两模式都过 | ✅ |
| P6 组装 | apps/cli + apps/dashboard 就位，删旧 src 兼容层，更新 CI（`turbo run …`） | 全量 e2e 通过 | ✅ |
| P7 收尾 | 测试归位、文档、发布流程 | 发布产物与 v1.2.4 等价 | 进行中 |

**实施中的拓扑调整**：P4 阶段实测发现 reporter **运行时**依赖 diagnosis/categorizer（错误分类是报告核心功能），而 diagnosis 零业务依赖，故将 **P5a（diagnosis 抽包）提前至 P4** 一并完成——依赖顺序变为 diagnosis 先于 reporter，符合依赖拓扑。

**主要风险与对策**：
- 巨型 barrel `src/index.ts` → 各包 index 重导出 + apps/cli 提供兼容层 ✅
- `container/registrations.ts` 跨包 import → 拆为各包 register 扩展，组合根归 apps ✅
- `tests/` 40+ 文件 → 随包归位，根 vitest workspace 统一调度 ✅
- `.github/workflows/*.yml` → 改为 `turbo run build test lint typecheck` ✅
- **vitest 双重实例**（workspace 包解析到 dist 导致 instanceof 失效）→ `resolve.alias` 指向各包源码 ✅（实测：contracts/core/executor/reporter/diagnosis/flaky/ai 全量加入）

---

## 9. 备注：yuancode 集成（远期，暂不入架构）

[yuancode](https://www.npmjs.com/package/yuancode)（v0.1.0，同作者）是"可嵌入的 AI 编码代理"库：分层为 kernel / capabilities / coding，可嵌入 Node 应用、支持 MCP 与 tree-sitter。与本项目 `@yuantest/ai` 的自研 agent 引擎（BaseAgent/LLMService/ToolRegistry + 领域工具）高度同构，`packages/ai/src/adapters/`、`acp-bridge/` 即为预留接缝。

**未来集成方向（未锁定，待 yuancode 成熟后评估）**：contracts 增加 `IAgentRuntime` 契约，ai 包新增 `adapters/yuancode-runtime.ts` 实现，将 run-test / query-test-history / apply-patch 注册为 yuancode capabilities；apps 层配置 `ai.agentRuntime: 'builtin' | 'yuancode'` 切换，渐进替换自研引擎。当前版本尚早，仅作备注。
