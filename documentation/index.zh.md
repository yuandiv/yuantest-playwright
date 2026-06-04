# YuanTest Playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://badge.fury.io/js/yuantest-playwright)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

强大的 Playwright 测试编排器、执行器和报告器，提供 CLI 工具和 Web Dashboard 可视化，帮助团队更高效地管理和分析 E2E 测试。

## ✨ 核心特性

### 🎯 智能测试编排
- **自动发现测试文件** - 智能扫描测试目录，支持多种文件格式
- **智能分片策略** - 支持 distributed/weighted/intelligent 三种编排策略，基于历史执行时间优化分片分配
- **并行执行优化** - 自动计算最优并行度，最大化测试效率

### 🚀 灵活的测试执行
- **多浏览器支持** - 单条命令在 Chromium、Firefox 和 WebKit 上运行测试
- **失败重试机制** - 自动重试失败测试，提高测试稳定性
- **Trace/截图/视频** - 完整的测试产物收集和管理
- **视觉测试** - 内置视觉对比测试，支持基线管理和差异审批
- **注解和标签** - 支持 @skip/@only/@fail 等注解和自定义标签过滤
- **无内部 API 依赖** - 通过 Playwright CLI 执行，确保升级兼容性

### 📊 实时报告与可视化
- **WebSocket 实时推送** - 实时查看测试进度和结果
- **Web Dashboard** - 现代化可视化界面，直观展示测试数据
- **HTML 报告** - 自动生成详细测试报告
- **历史趋势分析** - 追踪测试通过率和执行时间趋势

### 🔍 Flaky 测试管理
- **智能分类算法** - 6 种分类（Flaky/Broken/Regression/Monitor/Stable/Insufficient Data），区分真正的间歇性失败和持续失败
- **时间衰减加权失败率** - 最近的运行结果权重更高，体现趋势变化
- **Wilson 置信区间** - 统计显著性检验，避免小样本误判
- **根因分析** - 7 种根因类型自动检测（timing/data_race/environment/external_service/test_order/resource_leak/assertion_flaky）
- **关联分析** - Jaccard 共现系数识别同次运行中的关联失败
- **趋势追踪** - 通过率趋势方向、变点检测、季节模式识别
- **失败预测** - 基于多信号预测测试失败概率
- **因果图** - 构建测试间依赖关系图，识别根因节点
- **渐进式隔离** - 4 级隔离（none/monitor/soft_quarantine/hard_quarantine），隔离预算控制
- **健康评分** - 4 维评分（稳定性/趋势/可恢复性/可预测性），A-F 等级
- **参数自定义** - 通过 user-preferences.json 或 Dashboard UI 自定义所有判定参数

### 🤖 AI 智能诊断
- **上下文富集引擎** - 自动收集源代码、截图、控制台日志、堆栈跟踪、环境信息、历史数据
- **Playwright 知识库** - 内置 6 大类 18 个错误模式，自动匹配注入 few-shot 示例
- **Agent 多轮推理** - LLM 可主动读取源码、查询历史、查看截图，最多 5 轮推理
- **置信度校准** - 基于模式匹配、上下文完整度、历史一致性校准置信度
- **流式诊断** - SSE 实时推送推理过程
- **批量聚类** - 自动识别同根因的批量失败，给出聚类诊断
- **可操作修复建议** - 包含代码 Diff 和 Playwright 文档链接的结构化修复方案

### 🛠️ 失败分析与调试
- **自动失败分类** - 智能识别超时、断言失败、元素未找到、网络错误、Frame 错误、认证错误等 7 类
- **修复建议** - 针对性的失败修复建议
- **Trace 管理** - 自动收集和管理 Playwright trace 文件
- **产物管理** - 统一管理测试截图、视频等产物
- **测试重跑** - 支持重跑单个测试或批量重跑

## 🌟 核心优势

### 零学习曲线
- 所有参数与 Playwright CLI 完全相同，无需学习新命令
- Web UI 开箱即用，直观的可视化界面
- 通过 Playwright CLI 执行，完全与官方行为一致

### 零迁移成本
- 纯 Playwright 命令，无专有 API
- 随时可切换回原生 Playwright，无需修改任何测试代码
- 不绑定任何专有数据格式

### 纯 Playwright 生态
- 完全开源，GPL-3.0 许可证，无门槛
- 基于 Playwright 原生能力，版本升级无兼容问题
- 完全兼容 Playwright 社区

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
npm install
npm run build
npm link
```

## 🚀 快速开始

```bash
# 运行测试
yuantest run --test-dir ./

# 启动 Web Dashboard
yuantest ui

# 查看 Flaky 测试
yuantest flaky

# AI 诊断失败测试
yuantest analyze --id <run-id> --ai

# 使用 AI Agent 生成测试计划
yuantest agents plan "用户登录流程"

# 从测试计划生成测试代码
yuantest agents generate specs/user-login-flow.md

# 修复失败测试
yuantest agents heal tests/login.spec.ts

# 查看测试健康度
yuantest health

# 查看失败预测
yuantest prediction --high-risk
```

## 📚 文档导航

- [快速开始](getting-started.md) - 5 分钟上手指南
- [架构概览](architecture.md) - 系统架构和模块关系
- [使用指南](usage/index.md) - 详细使用文档
  - [Web UI](usage/web-ui.md) - Dashboard 可视化界面
  - [命令行](usage/cli.md) - CLI 命令使用
  - [CI/CD 集成](usage/cicd.md) - 持续集成
- [深度指南](guides/flaky-management.md)
  - [Flaky 测试管理](guides/flaky-management.md) - 分类算法、根因分析、隔离策略
  - [AI 智能诊断](guides/ai-diagnosis.md) - 上下文富集、Agent 推理、置信度校准
- [CLI 命令](cli.md) - 命令行参考
- [API 参考](api/index.md) - 编程接口文档
- [配置](configuration.md) - 配置文件说明

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

## 📝 许可证

GPL-3.0 © [YuanDiv](https://github.com/yuandiv)
