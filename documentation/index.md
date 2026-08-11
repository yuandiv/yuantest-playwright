# YuanTest Playwright

[![npm version](https://badge.fury.io/js/yuantest-playwright.svg)](https://www.npmjs.com/package/yuantest-playwright)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](https://opensource.org/licenses/GPL-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D21.7.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A powerful Playwright test orchestrator, executor, and reporter with CLI tools and Web Dashboard visualization, helping teams manage and analyze E2E tests more efficiently.

## ✨ Core Features

### 🎯 Intelligent Test Orchestration
- **Automatic test discovery** - Smart scanning of test directories with support for multiple file formats
- **Intelligent sharding strategies** - Supports distributed/weighted/intelligent orchestration strategies, optimizing shard allocation based on historical execution time
- **Parallel execution optimization** - Automatically calculates optimal parallelism to maximize test efficiency

### 🚀 Flexible Test Execution
- **Multi-browser support** - Run tests on Chromium, Firefox, and WebKit with a single command
- **Failure retry mechanism** - Automatic retry of failed tests to improve test stability
- **Trace/Screenshot/Video** - Complete test artifact collection and management
- **Visual testing** - Built-in visual comparison testing with baseline management and diff approval
- **Annotations and tags** - Support for @skip/@only/@fail annotations and custom tag filtering
- **No internal API dependency** - Executes via Playwright CLI, ensuring upgrade compatibility

### 📊 Real-time Reporting & Visualization
- **WebSocket real-time push** - Real-time view of test progress and results
- **Web Dashboard** - Modern visualization interface for intuitive test data display
- **HTML reports** - Automatic generation of detailed test reports
- **Historical trend analysis** - Track test pass rate and execution time trends

### 🔍 Flaky Test Management
- **Intelligent classification algorithm** - 6 categories (Flaky/Broken/Regression/Monitor/Stable/Insufficient Data)
- **Time-decay weighted failure rate** - Recent run results have higher weight
- **Wilson confidence interval** - Statistical significance testing
- **Root cause analysis** - Automatic detection of 7 root cause types
- **Correlation analysis** - Jaccard co-occurrence coefficient to identify associated failures
- **Trend tracking** - Pass rate trend direction, change point detection, seasonal pattern recognition
- **Failure prediction** - Multi-signal based prediction of test failure probability
- **Causal graph** - Build test dependency graph, identify root cause nodes
- **Progressive quarantine** - 4-level isolation with quarantine budget control
- **Health score** - 4-dimensional scoring (stability/trend/recoverability/predictability), A-F grades

### 🤖 AI Intelligent Diagnosis
- **Context enrichment engine** - Automatic collection of source code, screenshots, console logs, stack traces, environment info, history data
- **Playwright knowledge base** - Built-in 7 categories, 30+ error patterns, auto-matching with few-shot injection
- **Single LLM call** - Uses `responseFormat: json_object` for structured JSON output
- **Confidence calibration** - Multi-dimensional confidence scoring (0.6 × LLM confidence + bonuses) based on pattern matching and context completeness
- **Streaming diagnosis** - SSE real-time push, supports `start`/`chunk`/`complete`/`error` events
- **Batch clustering** - Jaccard similarity + Union-Find algorithm to identify same-root-cause batch failures
- **Actionable fix suggestions** - Structured fix plans with code diffs and Playwright documentation links
- **Cache & persistence** - In-memory cache (LRU, 100 entries, 30min TTL) + disk persistence `{dataDir}/diagnosis/`

## 🌟 Core Advantages

### Zero Learning Curve
- All parameters are identical to Playwright CLI, no need to learn new commands
- Web UI works out of the box, intuitive visualization interface

### Zero Migration Cost
- Pure Playwright commands, no proprietary APIs
- Can switch back to native Playwright at any time

### Pure Playwright Ecosystem
- Fully open source, GPL-3.0 license
- Based on Playwright native capabilities, no compatibility issues

## 📦 Installation

```bash
# Global installation
npm install -g yuantest-playwright

# Or as project dependency
npm install --save-dev yuantest-playwright
```

## 🏗️ Repository Structure (Monorepo)

The repository is a **pnpm + Turborepo monorepo**:

```text
apps/
  cli/          # CLI + Web Dashboard server (published as yuantest-playwright)
  dashboard/    # Dashboard frontend (React + TypeScript)
packages/
  ai/           # LLM capability layer: agents, chat, MCP, tools, AI service
  contracts/    # Shared TypeScript contracts and types
  core/         # Core utilities, config, storage, service container
  diagnosis/    # Failure diagnosis and error pattern analysis
  executor/     # Playwright execution, progress tracking, reporting
  flaky/        # Flaky test detection and management
  reporter/     # Report generation and artifact management
```

For end users, the published `yuantest-playwright` package is a self-contained build of the CLI and server — no monorepo setup required.

## 🚀 Quick Start

```bash
# Run tests
yuantest run --test-dir ./

# Start Web Dashboard
yuantest ui

# View Flaky tests
yuantest flaky

# AI diagnose failed tests
yuantest analyze --id <run-id> --ai

# Generate test plan using AI Agent
yuantest agents plan "User login flow"

# Generate test code from plan
yuantest agents generate specs/user-login-flow.md

# Heal a failing test
yuantest agents heal tests/login.spec.ts
```

## 📚 Documentation

- [Getting Started](getting-started.md) - 5-minute quick guide
- [Architecture](architecture.md) - System architecture overview
- [Usage Guide](usage/index.md) - Detailed usage documentation
- [API Reference](api/index.md) - Programming interface documentation
- [Configuration](configuration.md) - Configuration file documentation

## 🤝 Contributing

Contributions, bug reports, and suggestions are welcome!

## 📝 License

GPL-3.0 © [YuanDiv](https://github.com/yuandiv)
