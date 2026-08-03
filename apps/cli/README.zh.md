# yuantest-playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://badge.fury.io/js/yuantest-playwright)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![CI](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml)

[English](README.md) | 中文

yuantest-playwright 是一个综合性的 Playwright 测试编排、执行和报告平台，提供实时 Web Dashboard 可视化。它提供智能测试管理能力，帮助团队高效地大规模管理、分析和调试 E2E 测试。

**零学习成本 · 零迁移成本 · 纯 Playwright 生态**

## ✨ 核心特性

### 🎯 智能测试编排
- **自动发现测试文件** - 智能扫描测试目录，支持多种文件格式
- **智能分片策略** - 基于历史执行时间优化分片分配，实现负载均衡
- **并行执行优化** - 自动计算最优并行度，最大化测试效率

### 🚀 灵活的测试执行
- **多浏览器支持** - 一键在 Chromium、Firefox、WebKit 上运行测试
- **失败重试机制** - 自动重试失败测试，提高测试稳定性
- **快照更新** - 支持自动更新视觉测试快照
- **无内部API依赖** - 通过 Playwright CLI 执行，升级兼容性强

### 📊 实时报告与可视化
- **WebSocket 实时推送** - 实时查看测试进度和结果
- **Web Dashboard** - 现代化可视化界面，直观展示测试数据
- **HTML 报告** - 自动生成详细的测试报告
- **历史趋势分析** - 追踪测试通过率和执行时间趋势

### 🔍 高级 Flaky 测试管理

- **智能分类算法** — 自动将测试分类为 Flaky/Broken/Regression/Monitor/Stable
- **时间衰减加权失败率** — 基于 Wilson 置信区间的统计准确 Flaky 检测
- **根因分析** — 7 种自动检测类型，识别失败模式
- **渐进式隔离策略** — 4 级隔离体系，防止 CI/CD 受阻
- **健康评分系统** — A-F 等级评估测试套件健康状况

### 🤖 AI 智能失败诊断

- **上下文增强引擎** — 自动收集源代码、截图、日志和 Trace 用于诊断
- **内置 Playwright 知识库** — 18 种常见 Playwright 错误模式
- **多轮 LLM 推理** — 置信度校准分析，迭代优化诊断结果
- **流式诊断** — 实时 SSE 诊断，提供可操作的修复建议
- **批量聚类** — 识别多个失败用例的共同根因

### 🛠️ 综合测试管理

- **自动失败分类** — 超时、断言失败、元素未找到、网络错误等
- **Trace、截图和视频产物管理** — 统一管理所有测试产物
- **视觉回归测试** — 像素对比视觉差异，可配置阈值
- **测试注解和标签系统** — `@slow`、`@flaky`、`@skip` 注解和自定义标签
- **CI/CD 集成就绪** — CLI + REST API 无缝接入流水线

## 🎯 独特优势

- **零学习成本** — 所有 CLI 参数与 Playwright CLI 完全一致，无需学习新命令。
- **零迁移成本** — 纯 Playwright 命令，无专有 API，随时可切换回原生 Playwright，无需修改测试代码。
- **纯 Playwright 生态** — 完全开源（GPL-3.0），基于 Playwright 原生能力构建，无兼容性问题。

## 💡 核心能力

### Playwright 原生集成

- 通过 Playwright CLI 执行测试，无内部 API 依赖
- 与 Playwright 版本升级完全兼容
- 支持所有 Playwright 原生功能：Trace、截图、视频、快照等
- 自动收集和管理 Playwright 产物

### AI 智能失败分析

- 自动分类失败原因：超时、断言失败、元素未找到、网络错误等
- 提供针对性的修复建议
- 支持失败原因趋势分析
- 帮助快速定位问题根因

### 聚合报告与趋势分析

- 多次测试运行结果聚合展示
- 历史趋势图表：通过率、执行时间、失败原因分布
- Flaky 测试趋势追踪
- 支持数据导出和自定义分析

## 🌟 核心优势

| 优势 | 收益 |
|------|------|
| **一体化解决方案** | 完整的测试生命周期管理，无需组合多个工具 |
| **无内部 API 依赖** | 通过 Playwright CLI 执行，确保升级兼容性 |
| **实时监控** | WebSocket 推送，实时查看测试进度 |
| **智能 Flaky 管理** | 自动检测、隔离和统计分析 |
| **AI 失败分析** | 智能分类，提供针对性修复建议 |
| **国际化** | 内置中英文支持 |

### 1. 一体化解决方案

yuantest-playwright 提供完整的测试生命周期管理，无需组合多个工具：

| 功能模块 | 说明 |
|---------|------|
| **Orchestrator** | 智能测试分片、负载均衡、基于历史时间的优化分配 |
| **Executor** | 通过 Playwright CLI 执行，无内部 API 依赖，升级兼容性强 |
| **RealtimeReporter** | WebSocket 实时推送测试进度 |
| **DashboardServer** | 完整的 Web UI + REST API |
| **FlakyTestManager** | 自动检测、隔离、统计不稳定用例 |
| **ArtifactManager** | 统一管理截图、视频、Trace 文件 |

### 2. Flaky 测试智能管理

这是项目的**核心差异化价值**，市场上稀缺的能力：

```typescript
// 自动记录测试历史，计算失败率
existing.failureRate = failures / totalRuns;

// 支持一键隔离
yuantest flaky --quarantine <test-id>
```

- 基于历史数据自动识别 Flaky 测试
- 支持自定义阈值 (`threshold`)
- 自动隔离机制避免影响 CI/CD
- 提供详细的失败趋势分析

### 3. 实时可视化 Dashboard

- **WebSocket 实时推送** - 测试执行过程实时可见，无需等待测试结束
- **React + Tailwind 现代前端** - 响应式设计，支持中英文切换
- **性能优化** - 批量更新、消息限流、状态缓存，流畅处理大规模测试
- **国际化支持** - 中英文一键切换

### 4. 智能测试编排

```typescript
// ShardOptimizer - 基于历史执行时间优化分片
const optimizedAssignments = await optimizer.optimize(tests, shards);
```

- 自动发现测试文件，支持多种文件格式
- 基于历史执行时间的智能分片，实现负载均衡
- 支持多浏览器、多项目并行执行

### 5. 无内部 API 依赖

```typescript
// 通过 Playwright CLI 执行，而非内部 API
spawn('npx', ['playwright', 'test', ...args]);
```

这意味着：
- Playwright 版本升级无兼容性问题
- 与官方 CLI 行为完全一致
- 长期维护成本低

## 🔄 与 allure-playwright 对比

| 维度 | yuantest-playwright | allure-playwright |
|------|---------------------|-------------------|
| **学习成本** | ✅ 零学习成本 - 参数与 Playwright CLI 一致 | ⚠️ 需学习 Allure 配置和注解 |
| **迁移成本** | ✅ 零迁移成本 - 纯 Playwright 命令 | ⚠️ 需配置 Allure Server 和 History |
| **生态依赖** | ✅ 纯 Playwright 生态 - GPL-3.0 协议 | ⚠️ 依赖 Allure 生态 |
| **定位** | 全栈测试管理平台 | 报告生成器 |
| **实时性** | ✅ WebSocket 实时推送 | ❌ 测试结束后生成报告 |
| **Web Dashboard** | ✅ 内置 React Dashboard | ✅ Allure Server (需额外部署) |
| **Flaky 管理** | ✅ 自动检测+隔离+统计 | ❌ 无 |
| **测试编排** | ✅ 智能分片+负载均衡 | ❌ 无 |
| **测试执行** | ✅ 内置 Executor | ❌ 需外部执行 |
| **Playwright 原生集成** | ✅ 通过 Playwright CLI 执行，无内部 API | ✅ 通过 Reporter API 集成 |
| **AI 失败分析** | ✅ 自动分类+修复建议 | ❌ 无 |
| **聚合报告** | ✅ 内置，开箱即用 | ⚠️ 需配置 Allure Server |
| **历史趋势** | ✅ 内置存储，多维度趋势 | ✅ 需配置 History |
| **失败分析** | ✅ 自动分类+修复建议 | ⚠️ 需手动分析 |
| **国际化** | ✅ 中英文 | ⚠️ 需自行配置 |
| **部署复杂度** | ✅ 单 npm 包 | ⚠️ 需 Allure Server |
| **报告美观度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **CI/CD 集成** | ✅ CLI + API | ✅ 广泛支持 |

### 核心差异总结

| yuantest-playwright 优势 | allure-playwright 优势 |
|-------------------------|----------------------|
| 一体化解决方案 | 报告视觉效果更精美 |
| 实时监控测试进度 | 生态成熟、社区大 |
| Flaky 测试管理 | 支持多种测试框架 |
| 智能测试编排 | 历史趋势图表丰富 |
| 部署简单 | 插件扩展性强 |

### 最佳实践：两者互补

使用 yuantest-playwright 进行日常测试管理和实时监控，同时集成 allure-playwright 生成精美的最终报告：

```bash
# 日常开发：使用 yuantest 实时监控
yuantest run --test-dir ./

# CI/CD：生成 Allure 报告归档
npx playwright test --reporter=allure-playwright
```

## 📦 安装

### 通过 npm 安装（推荐）

```bash
# 全局安装
npm install -g yuantest-playwright

# 或作为项目依赖
npm install --save-dev yuantest-playwright
```

### 从源码安装

```bash
git clone https://github.com/yuandiv/yuantest-playwright.git
cd yuantest-playwright
pnpm install
pnpm build
pnpm --filter yuantest-playwright link
```

## 🚀 快速开始

30 秒上手：

```bash
# 安装
npm install -g yuantest-playwright

# 运行测试
yuantest run --test-dir ./

# 启动 Web Dashboard
yuantest ui

# 分析 Flaky 测试
yuantest flaky

# AI 智能失败诊断
yuantest analyze --id <run-id> --ai
```

### 1. 运行测试

```bash
# 基本用法
yuantest run --test-dir ./

# 指定项目名称和输出目录
yuantest run --project my-app --test-dir ./e2e --output ./reports

# 使用 4 个分片并行执行
yuantest run --test-dir ./ --shards 4

# 指定多个浏览器
yuantest run --test-dir ./ --browsers chromium,firefox

# 设置超时和重试
yuantest run --test-dir ./ --timeout 60000 --retries 2
```

### 2. 启动 Web Dashboard

```bash
# 默认端口 5274
yuantest ui

# 自定义端口
yuantest ui --port 8080

# 自定义报告和数据目录
yuantest ui --port 5274 --output ./reports --data ./test-data
```

然后在浏览器打开 **http://localhost:5274** 查看可视化界面。

## 📖 CLI 命令详解

### 查看帮助

```bash
yuantest --help
yuantest run --help
yuantest ui --help
```

### 运行测试参数

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--project` | `-p` | 项目名称 | test-project |
| `--test-dir` | `-t` | 测试文件目录 | ./ |
| `--output` | `-o` | 输出目录 | ./test-output |
| `--shards` | `-s` | 分片数量 | 1 |
| `--workers` | `-w` | Worker 数量 | 1 |
| `--browsers` | `-b` | 浏览器列表(逗号分隔) | chromium |
| `--base-url` | | 基础 URL | |
| `--timeout` | | 超时时间(ms) | 30000 |
| `--retries` | | 重试次数 | 0 |
| `--grep` | | 运行匹配的测试 | |
| `--update-snapshots` | | 更新快照 | false |
| `--config` | `-c` | 配置文件路径 | |
| `--trace` | | Trace 模式: off, on, retain-on-failure, on-first-retry | on-first-retry |
| `--screenshot` | | 截图模式: off, on, only-on-failure | only-on-failure |
| `--video` | | 视频模式: off, on, retain-on-failure, on-first-retry | retain-on-failure |
| `--tags` | | 按标签运行测试(逗号分隔) | |
| `--project-filter` | | 运行指定浏览器项目 | |
| `--visual-threshold` | | 视觉差异阈值(0-1) | 0.2 |
| `--annotations` | | 启用注解扫描 | false |
| `--html-report` | | 生成 Playwright HTML 报告 | true |

### 编排预览（不执行）

```bash
# 查看测试分片分配方案
yuantest orchestrate --test-dir ./ --shards 4
```

### 查看报告

```bash
# 查看最近 10 条报告
yuantest report --limit 10

# 查看指定报告
yuentest report --id run_20240101_120000_abc123
```

### Flaky 测试管理

```bash
# 查看 Flaky 统计
yuantest flaky

# 列出所有 Flaky 测试
yuantest flaky --list

# 列出已隔离的测试
yuantest flaky --quarantined

# 隔离指定测试
yuantest flaky --quarantine <test-id>

# 释放指定测试
yuantest flaky --release <test-id>

# 自定义阈值
yuantest flaky --list --threshold 0.5
```

### 失败分析

```bash
# 分析指定 Run 的失败原因
yuantest analyze --id run_20240101_120000_abc123

# 启用 AI 诊断
yuantest analyze --id run_20240101_120000_abc123 --ai

# 聚类分析失败
yuantest analyze --id run_20240101_120000_abc123 --cluster

# 按分类过滤
yuantest analyze --id run_20240101_120000_abc123 --filter timeout
```

### Trace 管理

```bash
# 列出所有 Trace
yuantest trace --list

# 在查看器中打开 Trace 文件
yuantest trace --view <trace-file>

# 查看 Trace 统计
yuantest trace --stats

# 清理 7 天前的 Trace
yuantest trace --clean
```

### 注解扫描

```bash
# 扫描测试注解
yuantest annotations --test-dir ./
```

### 标签管理

```bash
# 扫描测试标签
yuantest tags --test-dir ./
```

### 产物管理

```bash
# 列出所有产物
yuantest artifacts --list

# 查看产物统计
yuantest artifacts --stats

# 清理 7 天前的产物
yuantest artifacts --clean
```

### 视觉测试

```bash
# 查看视觉测试统计
yuantest visual --stats

# 更新所有基线截图
yuantest visual --update
```

### 查看 HTML 报告

```bash
# 在浏览器中打开 Playwright HTML 报告
yuantest show-report

# 指定报告路径
yuantest show-report --path ./reports/html-report
```

### 测试历史

```bash
# 查看测试运行历史
yuantest test-history <testId>

# JSON 格式输出
yuantest test-history <testId> --json
```

### 错误模式管理

```bash
# 列出所有错误模式
yuantest error-patterns --list

# 仅列出自定义错误模式
yuantest error-patterns --custom

# 添加自定义错误模式
yuantest error-patterns --add '<json>'
```

### LLM 诊断配置

```bash
# 查看当前 LLM 配置
yuantest llm-config --show

# 测试 LLM 连接
yuantest llm-config --test

# 查看 LLM 状态
yuantest llm-config --status

# 更新 LLM 配置
yuantest llm-config --set '<json>'
```

### 测试健康指标

```bash
# 查看测试健康指标
yuantest health

# JSON 格式输出
yuantest health --json
```

### 失败预测

```bash
# 列出高风险测试
yuantest prediction --high-risk

# 查看指定测试的预测
yuantest prediction --test <testId>

# 查看执行时间异常
yuantest prediction --duration-anomalies
```

### 关联分析

```bash
# 查看测试关联分析
yuantest correlations

# 查看因果图摘要
yuantest correlations --causal-graph
```

### 重跑测试

```bash
# 重跑指定运行中的某个测试
yuantest rerun <runId> <testId>
```

## 🖥️ Web Dashboard

启动后访问 `http://localhost:<port>`，包含以下功能模块：

### 主要页面

- **概览** - 测试运行总数、通过率、Flaky 统计、执行趋势图表
- **Test Runs** - 历史测试运行记录，支持筛选和搜索
- **Flaky Tests** - 不稳定用例列表，支持一键隔离/释放
- **Failure Analysis** - 失败原因分类和修复建议
- **实时进度** - 测试运行时显示实时进度条和日志

### REST API

Dashboard 提供 RESTful API（前缀：`/api/v1/`），方便集成到其他系统。完整 API 参考请查看[文档](https://yuantest-playwright.readthedocs.io/)。

#### 核心端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 健康检查 |
| GET | `/api/v1/stats` | 总体统计 |
| GET | `/api/v1/runs` | 运行列表（分页） |
| GET | `/api/v1/runs/:id` | 运行详情 |
| POST | `/api/v1/runs` | 启动测试运行 |
| POST | `/api/v1/runs/stop` | 停止当前运行 |
| DELETE | `/api/v1/runs/:id` | 删除运行 |

#### Flaky 测试管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/flaky` | Flaky 测试列表 |
| GET | `/api/v1/flaky/quarantined` | 已隔离用例 |
| POST | `/api/v1/flaky/:testId/quarantine` | 隔离测试 |
| POST | `/api/v1/flaky/:testId/release` | 释放测试 |
| GET | `/api/v1/flaky/stats` | Flaky 统计 |
| GET | `/api/v1/flaky/health` | 整体健康评分 |
| GET | `/api/v1/flaky/predictions/high-risk` | 高风险预测 |

#### 失败分析与诊断

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/analysis/:runId` | 失败分析 |
| GET | `/api/v1/failures/analysis` | 跨运行失败摘要 |
| POST | `/api/v1/diagnosis` | AI 诊断 |
| POST | `/api/v1/diagnosis/stream` | AI 诊断（SSE 流） |
| POST | `/api/v1/diagnosis/cluster` | 聚类诊断 |

#### 测试发现与执行

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/tests` | 已发现的测试 |
| POST | `/api/v1/runs/:runId/tests/:testId/rerun` | 重跑测试 |
| POST | `/api/v1/runs/:runId/batch-rerun` | 批量重跑测试 |
| GET | `/api/v1/tests/:testId/history` | 测试历史 |

#### 产物与 Trace

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/traces` | Trace 列表 |
| GET | `/api/v1/artifacts` | 产物列表 |
| GET | `/api/v1/attachments/file` | 提供附件文件 |

## 💻 编程 API 使用

### 基础示例

```typescript
import {
  Orchestrator,
  Executor,
  Reporter,
  FlakyTestManager,
  DashboardServer,
} from 'yuantest-playwright';

async function main() {
  // 1. 编排测试
  const orchestrator = new Orchestrator({
    version: 'my-app',
    testDir: './e2e',
    outputDir: './reports',
    shards: 4,
    browsers: ['chromium', 'firefox'],
  });
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();

  // 2. 执行测试
  const executor = new Executor(orchestrator.getConfig());

  // 监听事件
  executor.on('run_started', (data) => {
    console.log(`Run started: ${data.runId}`);
  });

  executor.on('test_result', (result) => {
    console.log(`[${result.status}] ${result.title} (${result.duration}ms)`);
  });

  executor.on('run_progress', (progress) => {
    console.log(`Progress: ${progress.passed}/${progress.totalTests} passed`);
  });

  executor.on('output', (data) => {
    process.stdout.write(data.data);
  });

  executor.on('run_completed', async (result) => {
    // 3. 生成报告
    const reporter = new Reporter('./reports');
    const reportPath = await reporter.generateReport(result);
    console.log(`Report: ${reportPath}`);

    // 4. 分析失败
    const analysis = await reporter.analyzeFailures(result);
    console.log(`Failures: ${analysis.length}`);
  });

  const result = await executor.execute({
    grepPattern: 'smoke',
    projectFilter: 'chromium',
    updateSnapshots: false,
  });
  console.log(`Final: ${result.passed}/${result.totalTests} passed`);

  // 5. 启动 Dashboard
  const server = new DashboardServer(5274, './reports', './test-data');
  await server.start();
}

main();
```

### 高级用法

```typescript
import {
  FlakyTestManager,
  AnnotationManager,
  TagManager,
  TraceManager,
  ArtifactManager,
  VisualTestingManager,
} from 'yuantest-playwright';

// Flaky 测试管理
const flakyManager = new FlakyTestManager('./test-data');

// 获取 Flaky 测试
const flakyTests = flakyManager.getFlakyTests(0.3);
console.log(`Found ${flakyTests.length} flaky tests`);

// 隔离测试
await flakyManager.quarantineTest('test-id-123');

// 注解管理
const annotationManager = new AnnotationManager();
const annotations = await annotationManager.scanDirectory('./');
console.log(`Found ${annotations.length} annotated tests`);

// 标签管理
const tagManager = new TagManager();
const tags = await tagManager.scanDirectory('./');

// Trace 管理
const traceManager = new TraceManager(
  { enabled: true, mode: 'on', screenshots: true, snapshots: true, sources: true, attachments: true },
  './traces'
);

// 产物管理
const artifactManager = new ArtifactManager(
  { enabled: true, screenshots: 'on', videos: 'on' },
  './artifacts'
);

// 视觉测试
const visualManager = new VisualTestingManager(
  { enabled: true, threshold: 0.2, maxDiffPixelRatio: 0.01, maxDiffPixels: 10, updateSnapshots: false },
  './visual-testing'
);
```

### 主要导出模块

| 模块 | 说明 |
|------|------|
| `Orchestrator`, `ShardOptimizer` | 测试编排和智能分片 |
| `Executor`, `ParallelExecutor` | 测试执行 |
| `Reporter`, `JSONReporter` | 报告生成 |
| `RealtimeReporter`, `RealtimeReporterClient` | WebSocket 实时报告 |
| `FlakyTestManager` | Flaky 测试检测、隔离和统计 |
| `DashboardServer` | Web UI + REST API 服务器 |
| `TraceManager` | Playwright Trace 管理 |
| `AnnotationManager` | 测试注解扫描 |
| `TagManager` | 测试标签管理 |
| `ArtifactManager` | 截图、视频、Trace 产物管理 |
| `VisualTestingManager` | 像素对比视觉回归测试 |
| `PlaywrightConfigBuilder` | Playwright 配置生成 |
| `loadConfigFile`, `mergeConfig` | 配置加载和合并 |
| `StorageProvider`, `FilesystemStorage` | 存储抽象 |
| `TestDiscovery` | 测试文件发现 |
| `LRUCache`, `TTLCache` | 缓存工具 |

## 📁 项目结构

```
yuantest-playwright/
├── bin/
│   ├── cli.js              # CLI 入口
│   └── start-ui.js         # Dashboard 启动脚本
├── dashboard/              # Web Dashboard 前端源码
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── hooks/          # 自定义 Hooks
│   │   ├── services/       # API 服务
│   │   └── types/          # TypeScript 类型
│   └── index.html
├── src/
│   ├── index.ts            # 主入口
│   ├── types/              # 类型定义
│   ├── orchestrator/       # 测试编排器
│   ├── executor/           # 测试执行器
│   ├── reporter/           # 报告生成器
│   ├── realtime/           # 实时报告
│   ├── flaky/              # Flaky 管理
│   ├── diagnosis/          # AI 智能诊断
│   ├── config/             # 配置管理
│   ├── trace/              # Trace 管理
│   ├── annotations/        # 注解扫描
│   ├── tags/               # 标签管理
│   ├── artifacts/          # 产物管理
│   ├── visual/             # 视觉测试
│   ├── storage/            # 存储提供者
│   ├── cache/              # 缓存模块
│   ├── base/               # 基础管理类
│   ├── discovery/          # 测试发现
│   ├── middleware/          # Express 中间件
│   ├── validation/         # Zod 校验
│   ├── utils/              # 工具函数
│   ├── i18n/               # 国际化
│   ├── constants/          # 常量
│   ├── logger/             # 日志模块
│   ├── cli/                # CLI 命令
│   └── ui/                 # Dashboard 服务器
├── documentation/          # 文档源码
├── tests/                  # 测试文件
└── package.json
```

## 🎯 使用场景

### CI/CD 集成

```yaml
# GitHub Actions 示例
name: E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run E2E tests
        run: |
          npm install -g yuantest-playwright
          yuantest run --test-dir ./e2e --shards 4 --output ./reports
      
      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: test-reports
          path: reports/
```

### 大型测试套件优化

```bash
# 使用智能分片加速大型测试套件
yuantest run --test-dir ./e2e --shards 8 --workers 4

# 隔离 Flaky 测试避免阻塞 CI
yuantest flaky --quarantine-all
yuantest run --test-dir ./e2e
```

### 多浏览器测试

```bash
# 在所有浏览器上运行测试
yuantest run --test-dir ./e2e --browsers chromium,firefox,webkit

# 仅在特定浏览器上运行
yuantest run --test-dir ./e2e --browsers chromium
```

## ⚙️ 配置文件

支持通过配置文件自定义行为：

```typescript
// yuantest.config.ts
import type { TestConfig } from 'yuantest-playwright';

const config: TestConfig = {
  version: 'my-app',
  testDir: './e2e',
  outputDir: './reports',
  shards: 4,
  browsers: ['chromium', 'firefox'],
  timeout: 60000,
  retries: 2,
  traces: {
    enabled: true,
    mode: 'on-first-retry',
    screenshots: true,
    snapshots: true,
    sources: true,
    attachments: true,
  },
  artifacts: {
    enabled: true,
    screenshots: 'only-on-failure',
    videos: 'retain-on-failure',
  },
  visualTesting: {
    enabled: true,
    threshold: 0.2,
    maxDiffPixelRatio: 0.01,
    maxDiffPixels: 10,
    updateSnapshots: false,
  },
};

export default config;
```

## 📊 性能特性

- **智能分片** - 基于历史执行时间优化分片，提升 30-50% 执行效率
- **并行执行** - 支持多 Worker 并行，充分利用多核 CPU
- **增量测试** - 支持仅运行变更相关的测试
- **缓存优化** - 智能缓存测试发现结果，减少重复计算
- **内存优化** - 流式处理大型测试结果，降低内存占用

## 🔧 环境要求

- Node.js >= 16.0.0
- npm >= 7.0.0
- Playwright >= 1.40.0

## 📚 文档

- 📖 [完整文档](https://yuantest-playwright.readthedocs.io/) - 使用指南、深度指南和 API 参考
- 🔧 [API 文档](https://yuandiv.github.io/yuantest-playwright/) - TypeDoc API 接口文档
- [使用指南](USAGE.md) - Web UI 和外部工具执行测试使用指南
- [更新日志](CHANGELOG.md)
- [贡献指南](CONTRIBUTING.md)
- [行为准则](CODE_OF_CONDUCT.md)

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

## 📝 License

GPL-3.0 © [YuanDiv](https://github.com/yuandiv)

## 🙏 致谢

感谢以下开源项目：

- [Playwright](https://playwright.dev/) - 强大的端到端测试框架
- [React](https://react.dev/) - Dashboard 前端框架
- [Express](https://expressjs.com/) - Dashboard 服务器框架
- [TypeScript](https://www.typescriptlang.org/) - 类型安全的开发体验

## 📮 联系方式

- GitHub: [@yuandiv](https://github.com/yuandiv)
- Issues: [GitHub Issues](https://github.com/yuandiv/yuantest-playwright/issues)

## ❓ 常见误解澄清

### Q: 需要学习新的 CLI 吗？
**不需要。** yuantest-playwright 的所有参数与 Playwright CLI 完全一致，您已有的 Playwright 知识可以直接复用。同时提供 Web UI，无需命令行即可使用。

### Q: 会锁定在这个工具吗？
**不会。** yuantest-playwright 使用纯 Playwright 命令执行测试，无专有 API。您可以随时切换回原生 Playwright，无需修改任何测试代码，真正的零迁移成本。

### Q: 项目维护情况如何？
**完全开源。** GPL-3.0 协议，纯 Playwright 生态，无任何壁垒。基于 Playwright 原生能力构建，版本升级无兼容性问题。

### Q: 与 Playwright 原生功能兼容吗？
**完全兼容。** 通过 Playwright CLI 执行测试，支持所有原生功能：Trace、截图、视频、快照等。自动收集和管理所有 Playwright 产物。

### Q: 如何分析测试失败原因？
**AI 智能分析。** 自动分类失败原因（超时、断言失败、元素未找到等），提供修复建议，支持失败趋势分析，帮助快速定位问题根因。

---

如果这个项目对你有帮助，请给一个 ⭐️ Star！

Made with ❤️ by [YuanDiv](https://github.com/yuandiv)
