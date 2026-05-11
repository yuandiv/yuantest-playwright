# YuanTest Playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://badge.fury.io/js/yuantest-playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A powerful Playwright test orchestrator, executor, and reporter with CLI tools and Web Dashboard visualization, helping teams manage and analyze E2E tests more efficiently.

## ✨ 核心特性

### 🎯 智能测试编排
- **自动发现测试文件** - 智能扫描测试目录，支持多种文件格式
- **智能分片策略** - 基于历史执行时间优化分片分配，实现负载均衡
- **并行执行优化** - 自动计算最优并行度，最大化测试效率

### 🚀 灵活的测试执行
- **多浏览器支持** - 单条命令在 Chromium、Firefox 和 WebKit 上运行测试
- **失败重试机制** - 自动重试失败测试，提高测试稳定性
- **快照更新** - 支持自动更新视觉测试快照
- **无内部 API 依赖** - 通过 Playwright CLI 执行，确保升级兼容性

### 📊 实时报告与可视化
- **WebSocket 实时推送** - 实时查看测试进度和结果
- **Web Dashboard** - 现代化可视化界面，直观展示测试数据
- **HTML 报告** - 自动生成详细测试报告
- **历史趋势分析** - 追踪测试通过率和执行时间趋势

### 🔍 Flaky 测试管理
- **自动检测** - 基于历史数据识别不稳定测试
- **智能隔离** - 一键隔离 Flaky 测试，避免影响 CI/CD
- **统计分析** - 详细的 Flaky 测试统计和趋势
- **自定义阈值** - 灵活配置 Flaky 检测标准

### 🛠️ 失败分析与调试
- **自动失败分类** - 智能识别超时、断言失败、元素未找到等
- **修复建议** - 针对性的失败修复建议
- **Trace 管理** - 自动收集和管理 Playwright trace 文件
- **产物管理** - 统一管理测试截图、视频等产物

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
- 完全开源，MIT 许可证，无门槛
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
```

## 📚 文档导航

- [快速开始](getting-started.md) - 5 分钟上手指南
- [使用指南](usage/index.md) - 详细使用文档
- [CLI 命令](cli.md) - 命令行参考
- [API 参考](api/index.md) - 编程接口文档
- [配置](configuration.md) - 配置文件说明

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

## 📝 许可证

MIT © [YuanDiv](https://github.com/yuandiv)
