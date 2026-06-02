# 更新日志

本文件记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

## 1.1.2 (2026-05-28)

### Bug 修复

- 修复 WebSocket 连接稳定性问题
- 修复测试发现缓存失效问题

## 1.1.1 (2026-05-24)

### 新功能

- 新增 Chat API，支持 MCP（模型上下文协议）集成
- 新增测试发现 REST API 端点
- 新增 `diagnoseWithHeal()` 方法，用于自动修复失败测试

### Bug 修复

- 修复 DashboardServer 构造函数参数处理
- 修复 trace、annotations、tags、artifacts、visual 命令的 CLI 子命令语法

## [1.1.0] - 2026-05-20

### 新增

#### Agent 代理系统

- **AgentService** - AI 驱动的测试创建和修复代理系统
  - `planner.ts` - 测试规划代理：根据功能描述生成结构化测试计划
  - `generator.ts` - 测试生成代理：将测试计划转换为 Playwright TypeScript 代码
  - `healer.ts` - 测试修复代理：分析失败测试并生成修复补丁
  - `index.ts` - AgentService：统一管理，支持项目上下文加载
- **CLI 命令** - 新增 Agent CLI 命令
  - `agents init` - 初始化代理定义（支持 VSCode/Claude/OpenCode）
  - `agents plan` - 使用 Planner 代理生成测试计划
  - `agents generate` - 从测试计划生成 Playwright 测试代码
  - `agents heal` - 使用 Healer 代理修复失败测试
  - `agents list` - 列出生成的测试计划
- **REST API** - 新增 Agent API 端点
  - `GET /api/v1/agents/config` - 获取代理配置
  - `PUT /api/v1/agents/config` - 更新代理配置
  - `GET /api/v1/agents/project-context` - 获取项目上下文信息
  - `POST /api/v1/agents/init` - 初始化代理定义
  - `POST /api/v1/agents/plan` - 生成测试计划
  - `POST /api/v1/agents/generate` - 生成测试代码
  - `POST /api/v1/agents/heal` - 修复失败测试
  - `POST /api/v1/agents/apply-patch` - 应用指定补丁
  - `GET /api/v1/agents/plans` - 列出测试计划
  - `GET /api/v1/agents/heal-history` - 查看修复历史
- **项目上下文** - 自动项目上下文加载
  - 解析 playwright.config 获取 baseURL、timeout、testDir、viewport
  - 从 package.json 检测技术栈（React、Vue、Angular、Svelte、Next.js 等）
  - 自动发现测试 Fixtures
- **修复历史** - 持久化修复历史，自动清理（最多 100 条）

---

## [1.0.12] - 2026-05-18

### 修复

- 修复冗余配置异常

---

## [1.0.10] - 2026-05-13

### 修复

- 修复 lint 和 test 异常，解决 Web UI 和 CLI 不统一的问题

---

## [1.0.9] - 2026-05-09

### 变更

#### 失败分析优化

- **FailureAnalysis** - 优化失败分析与诊断增强
  - 改进失败原因分类逻辑
  - 增强诊断结果准确性
  - 修复 FailureAnalysis 展示问题

#### 不稳定用例分析优化

- **Flaky 分析** - 优化稳定性用例分析
  - 改进不稳定用例检测算法
  - 修复 Flaky Test 展示问题
  - 增强历史数据追踪

#### 用例隔离增强

- **隔离策略** - 增强用例隔离逻辑
  - 支持自定义"不稳定用例"已隔离用例出入标准
  - 优化隔离判定参数配置
  - 改进隔离/释放操作流程

#### AI 分析优化

- **AI 诊断** - 优化 AI 诊断结果持久化存储
  - 改进诊断结果存储机制
  - 增强诊断结果持久化
  - 优化 AI 分析结果展示

#### 报告改进

- **HTML 报告** - 优化报告展示
  - 支持执行器中用例排序
  - 优化 HTML 报告展示
  - 修复报告详情中截图和视频打开错误

### 移除

- 删除无用文件

---

## [1.0.8] - 2026-05-06

### 新增

#### AI 智能诊断

- **Diagnosis 模块** - 完整的 AI 智能诊断功能模块
  - `cluster.ts` - 失败测试聚类分析
  - `context-enricher.ts` - 测试上下文信息增强
  - `knowledge-base.ts` - 知识库管理
  - 智能失败原因分析和修复建议
  - 支持多维度失败模式识别

#### Flaky 测试智能分析

- **Flaky 分析增强** - Flaky 测试智能分析系统优化
  - `causal-graph.ts` - 因果关系图分析
  - `predictor.ts` - Flaky 测试预测器
  - `quarantine-strategy.ts` - 隔离策略管理
  - `trend.ts` - 趋势分析
  - `classifier.ts` - Flaky 测试分类器
  - `correlation.ts` - 相关性分析
  - `root-cause.ts` - 根本原因分析

---

## [1.0.7] - 2026-04-29

### 新增

#### Flaky 测试管理增强

- **Flaky 模块** - 增强 Flaky 测试管理功能
  - 改进不稳定用例检测算法
  - 优化隔离策略
  - 增强历史数据追踪

---

## [1.0.6] - 2026-04-24

### 新增

#### 实时报告

- **Realtime 模块** - 新增实时报告功能
  - 实时测试进度推送
  - WebSocket 连接管理
  - 事件广播机制

---

## [1.0.0] - 2026-04-11

### 新增

#### 核心功能

- **Orchestrator** - 智能测试编排，支持自动测试发现和智能分片
- **Executor** - 通过 Playwright CLI 的测试执行引擎
- **Reporter** - 全面的测试报告系统
- **FlakyTestManager** - 自动检测和隔离不稳定用例
- **Web Dashboard** - 测试管理的可视化界面
- **CLI 工具** - 完整的命令行界面

---

查看完整更新日志请访问 [GitHub Releases](https://github.com/yuandiv/yuantest-playwright/releases)。
