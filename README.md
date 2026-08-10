# yuantest-playwright

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D21.7.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.28-orange.svg)](https://pnpm.io/)
[![CI](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml/badge.svg)](https://github.com/yuandiv/yuantest-playwright/actions/workflows/ci.yml)

English | [中文文档](README.zh.md)

A comprehensive **Playwright test orchestration, execution, and reporting platform** with a real-time Web Dashboard. This repository is a **pnpm + Turborepo monorepo** that splits the platform into focused packages and apps, providing intelligent test management that helps teams efficiently manage, analyze, and debug E2E tests at scale.

**Zero Learning Curve · Zero Migration Cost · Pure Playwright Ecosystem**

> 📖 The user-facing product documentation lives in [`apps/cli/README.md`](apps/cli/README.md) (English) and [`apps/cli/README.zh.md`](apps/cli/README.zh.md) (中文). The README below is a repository-level overview for developers.

## ✨ Core Features

- **Intelligent Test Orchestration** — auto-discovery of test files, smart sharding based on historical execution time, and parallel execution optimization.
- **Flexible Test Execution** — run tests, shards, tagged tests, or individual specs via CLI or the Web Dashboard.
- **Real-time Reporting & Visualization** — live run progress, dashboards, and aggregated reports served at `http://localhost:5274`.
- **Advanced Flaky Test Management** — automatic flaky detection, quarantine, and release with configurable criteria.
- **AI-Powered Failure Diagnosis** — root-cause analysis for failures with an optional LLM backend.
- **Test Lifecycle Automation** — generation of test plans and Playwright test code from natural-language descriptions via the AI agent.

## 📦 Repository Structure

```text
yuantest-playwright/
├── apps/
│   ├── cli/          # CLI + Web Dashboard server (yuantest-playwright package, published to npm)
│   └── dashboard/    # Dashboard frontend (React + TypeScript)
├── packages/
│   ├── ai/           # LLM capability layer: agents, chat, MCP, tools, AI service
│   ├── contracts/    # Shared TypeScript contracts and types
│   ├── core/         # Core utilities, config, storage, and service container
│   ├── diagnosis/    # Failure diagnosis and error pattern analysis
│   ├── executor/     # Playwright test execution, progress tracking, and reporting
│   ├── flaky/        # Flaky test detection, quarantine, and management
│   └── reporter/     # Test result reporting and artifact management
├── demo/             # Demo Playwright tests used for local development
└── package.json      # Root workspace (pnpm + Turborepo)
```

## 🚀 Quick Start (Development)

Requirements: **Node.js ≥ 21.7**, **pnpm ≥ 10**

```bash
# 1. Install dependencies
pnpm install

# 2. Run all checks (lint + typecheck + test)
pnpm test

# 3. Start the Web Dashboard (default port 5274)
pnpm start
# or: pnpm ui
# then open http://localhost:5274
```

### Common Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Run in dev mode (source-based, no build needed) |
| `pnpm build` | Build all packages and apps (Turborepo, dependency-ordered) |
| `pnpm typecheck` | Type-check all workspaces |
| `pnpm test` | Run tests across all workspaces |
| `pnpm lint` | Run ESLint |
| `pnpm cli` | Run the CLI directly (`node apps/cli/bin/cli.js`) |
| `pnpm ui` | Start the Web Dashboard |

### Run Tests (CLI)

```bash
# Run tests in the demo directory
yuantest run --test-dir ./demo

# Run tests with 4 shards
yuantest run --test-dir ./demo --shards 4

# Analyze flaky tests
yuantest flaky

# AI-powered failure diagnosis
yuantest analyze --id <run-id> --ai
```

See [`apps/cli/README.md`](apps/cli/README.md) for the full CLI command reference and configuration options.

### Run the Dashboard

```bash
yuantest ui                      # default port 5274
yuantest ui --port 8080          # custom port
yuantest ui --output ./reports --data ./test-data
```

## 🧪 Testing

- **Unit / integration tests**: `pnpm test` (vitest in `apps/cli/tests`)
- **E2E tests** (AI chat conversation): `pnpm --filter yuantest-playwright test:e2e`
- **Demo tests**: see [`demo/`](demo) — run with `yuantest run --test-dir ./demo`

## 🗂️ Documentation

- **Product / user docs**: [`apps/cli/README.md`](apps/cli/README.md) · [`apps/cli/README.zh.md`](apps/cli/README.zh.md)
- **Architecture / planning docs**: see `.trae/documents/` for in-depth analysis documents

## 🤝 Contributing

1. Fork the repository and create a feature branch.
2. Make changes and add tests for new functionality (TypeScript strict mode compliance).
3. Run `pnpm lint && pnpm typecheck && pnpm test` before submitting.
4. Follow the existing code patterns in the codebase.

## 📄 License

This project is licensed under the **GPL-3.0** license. See [`LICENSE`](LICENSE) for details.
