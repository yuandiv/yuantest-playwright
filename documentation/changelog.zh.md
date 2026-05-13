# 更新日志

本文件记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，
本项目遵循 [语义化版本](https://semver.org/spec/v2.0.0.html)。

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
