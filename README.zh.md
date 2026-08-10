# yuantest-playwright

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D21.7.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.28-orange.svg)](https://pnpm.io/)
[![CI](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml)

[English](README.md) | 中文文档

一套全面的 **Playwright 测试编排、执行与报告平台**，提供实时 Web Dashboard 可视化。本仓库是 **pnpm + Turborepo 单仓（monorepo）**，将平台拆分为聚焦的包与应用，提供智能测试管理能力，帮助团队规模化地高效管理、分析与调试 E2E 测试。

**零学习成本 · 零迁移成本 · 纯 Playwright 生态**

> 📖 面向用户的产品文档位于 [`apps/cli/README.md`](apps/cli/README.md)（英文）与 [`apps/cli/README.zh.md`](apps/cli/README.zh.md)（中文）。本 README 是面向开发者的仓库级总览。

## ✨ 核心特性

- **智能测试编排** — 测试文件自动发现、基于历史执行时长的智能分片、并行执行优化。
- **灵活测试执行** — 通过 CLI 或 Web Dashboard 运行测试、分片、带标签测试或单个用例。
- **实时报告与可视化** — 实时运行进度、看板与聚合报告，通过 `http://localhost:5274` 提供。
- **高级 Flaky 测试管理** — 自动 flaky 检测、隔离与释放，支持可配置的判定标准。
- **AI 故障诊断** — 可选用 LLM 后端对失败用例进行根因分析。
- **测试生命周期自动化** — 通过 AI agent 根据自然语言描述生成测试计划与 Playwright 测试代码。

## 📦 仓库结构

```text
yuantest-playwright/
├── apps/
│   ├── cli/          # CLI + Web Dashboard 服务端（yuantest-playwright 包，发布到 npm）
│   └── dashboard/    # Dashboard 前端（React + TypeScript）
├── packages/
│   ├── ai/           # LLM 能力层：agents、chat、MCP、tools、AI service
│   ├── contracts/    # 共享 TypeScript 契约与类型
│   ├── core/         # 核心工具、配置、存储与服务容器
│   ├── diagnosis/    # 失败诊断与错误模式分析
│   ├── executor/     # Playwright 测试执行、进度跟踪与报告
│   ├── flaky/        # Flaky 测试检测、隔离与管理
│   └── reporter/     # 测试结果报告与产物管理
├── demo/             # 用于本地开发的示例 Playwright 测试
└── package.json      # 根工作区（pnpm + Turborepo）
```

## 🚀 快速开始（开发环境）

环境要求：**Node.js ≥ 21.7**、**pnpm ≥ 10**

```bash
# 1. 安装依赖
pnpm install

# 2. 运行全部检查（lint + typecheck + test）
pnpm test

# 3. 启动 Web Dashboard（默认端口 5274）
pnpm start
# 或：pnpm ui
# 然后打开 http://localhost:5274
```

### 常用脚本

| 脚本 | 说明 |
|------|------|
| `pnpm dev` | 开发模式运行（基于源码，无需构建） |
| `pnpm build` | 构建所有包与应用（Turborepo，按依赖顺序） |
| `pnpm typecheck` | 对所有工作区做类型检查 |
| `pnpm test` | 运行所有工作区的测试 |
| `pnpm lint` | 运行 ESLint |
| `pnpm cli` | 直接运行 CLI（`node apps/cli/bin/cli.js`） |
| `pnpm ui` | 启动 Web Dashboard |

### 运行测试（CLI）

```bash
# 运行 demo 目录下的测试
yuantest run --test-dir ./demo

# 4 个分片并行运行
yuantest run --test-dir ./demo --shards 4

# 分析 flaky 测试
yuantest flaky

# AI 故障诊断
yuantest analyze --id <run-id> --ai
```

完整的 CLI 命令参考与配置项见 [`apps/cli/README.md`](apps/cli/README.md)。

### 启动 Dashboard

```bash
yuantest ui                      # 默认端口 5274
yuantest ui --port 8080          # 自定义端口
yuantest ui --output ./reports --data ./test-data
```

## 🧪 测试

- **单元 / 集成测试**：`pnpm test`（vitest，位于 `apps/cli/tests`）
- **E2E 测试**（AI 对话）：`pnpm --filter yuantest-playwright test:e2e`
- **示例测试**：见 [`demo/`](demo) —— 使用 `yuantest run --test-dir ./demo` 运行

## 🗂️ 文档

- **产品 / 用户文档**：[`apps/cli/README.md`](apps/cli/README.md) · [`apps/cli/README.zh.md`](apps/cli/README.zh.md)
- **架构 / 方案文档**：`.trae/documents/` 目录下有深入分析文档

## 🤝 参与贡献

1. Fork 本仓库并创建功能分支。
2. 做出修改，并为新功能补充测试（遵循 TypeScript 严格模式）。
3. 提交前运行 `pnpm lint && pnpm typecheck && pnpm test`。
4. 遵循代码库中已有的代码风格。

## 📄 许可证

本项目基于 **GPL-3.0** 许可证。详见 [`LICENSE`](LICENSE)。
