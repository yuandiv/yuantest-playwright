# Changelog

This file records all important changes to the project.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.1.2 (2026-05-28)

### Bug Fixes

- Fixed WebSocket connection stability issues
- Fixed test discovery cache invalidation

## 1.1.1 (2026-05-24)

### Features

- Added Chat API with MCP (Model Context Protocol) integration
- Added Test Discovery REST API endpoints
- Added `diagnoseWithHeal()` method for auto-healing failing tests

### Bug Fixes

- Fixed DashboardServer constructor parameter handling
- Fixed CLI subcommand syntax for trace, annotations, tags, artifacts, visual commands

## [1.1.0] - 2026-05-20

### Added

#### Agent System

- **AgentService** - AI-powered test creation and healing agent system
  - `planner.ts` - Planner agent: generate structured test plans from feature descriptions
  - `generator.ts` - Generator agent: transform test plans into Playwright TypeScript code
  - `healer.ts` - Healer agent: analyze failing tests and generate fix patches
  - `index.ts` - AgentService: unified management with project context loading
- **CLI Commands** - New agent CLI commands
  - `agents init` - Initialize agent definitions for VSCode/Claude/OpenCode
  - `agents plan` - Generate test plans using Planner agent
  - `agents generate` - Generate Playwright test code from test plans
  - `agents heal` - Heal failing tests using Healer agent
  - `agents list` - List generated test plans
- **REST API** - New agent API endpoints
  - `GET /api/v1/agents/config` - Get agent configuration
  - `PUT /api/v1/agents/config` - Update agent configuration
  - `GET /api/v1/agents/project-context` - Get project context information
  - `POST /api/v1/agents/init` - Initialize agent definitions
  - `POST /api/v1/agents/plan` - Generate test plan
  - `POST /api/v1/agents/generate` - Generate test code
  - `POST /api/v1/agents/heal` - Heal failing test
  - `POST /api/v1/agents/apply-patch` - Apply a specific patch
  - `GET /api/v1/agents/plans` - List test plans
  - `GET /api/v1/agents/heal-history` - View heal history
- **Project Context** - Automatic project context loading
  - Parse playwright.config for baseURL, timeout, testDir, viewport
  - Detect technology stack from package.json (React, Vue, Angular, Svelte, Next.js, etc.)
  - Auto-discover test fixtures
- **Heal History** - Persistent heal history with auto-cleanup (max 100 entries)

---

## [1.0.12] - 2026-05-18

### Fixed

- Fixed redundant configuration exception

---

## [1.0.10] - 2026-05-13

### Fixed

- Fixed lint and test errors, resolved inconsistency between Web UI and CLI

---

## [1.0.9] - 2026-05-09

### Changed

#### Failure Analysis Optimization

- **FailureAnalysis** - Optimized failure analysis and diagnosis enhancement
  - Improved failure cause classification logic
  - Enhanced diagnosis result accuracy
  - Fixed FailureAnalysis display issues

#### Flaky Test Analysis Optimization

- **Flaky Analysis** - Optimized unstable test case analysis
  - Improved flaky test detection algorithm
  - Fixed Flaky Test display issues
  - Enhanced historical data tracking

#### Test Isolation Enhancement

- **Isolation Strategy** - Enhanced test isolation logic
  - Support custom quarantine entry/exit criteria for flaky tests
  - Optimized isolation parameter configuration
  - Improved quarantine/release operation flow

#### AI Diagnosis Optimization

- **AI Diagnosis** - Optimized AI diagnosis result persistent storage
  - Improved diagnosis result storage mechanism
  - Enhanced diagnosis result persistence
  - Optimized AI analysis result display

#### Report Improvements

- **HTML Report** - Optimized report display
  - Support test case sorting in executor
  - Optimized HTML report display
  - Fixed screenshot and video opening errors in report details

### Removed

- Removed unused files

---

## [1.0.8] - 2026-05-06

### Added

#### AI Intelligent Diagnosis

- **Diagnosis Module** - Complete AI intelligent diagnosis functionality module
  - `cluster.ts` - Failed test cluster analysis
  - `context-enricher.ts` - Test context information enrichment
  - `knowledge-base.ts` - Knowledge base management
  - Intelligent failure cause analysis and fix suggestions
  - Support for multi-dimensional failure pattern recognition

#### Flaky Test Intelligent Analysis

- **Flaky Analysis Enhancement** - Flaky test intelligent analysis system optimization
  - `causal-graph.ts` - Causal graph analysis
  - `predictor.ts` - Flaky test predictor
  - `quarantine-strategy.ts` - Quarantine strategy management
  - `trend.ts` - Trend analysis
  - `classifier.ts` - Flaky test classifier
  - `correlation.ts` - Correlation analysis
  - `root-cause.ts` - Root cause analysis

---

## [1.0.7] - 2026-04-29

### Added

#### Flaky Test Management Enhancement

- **Flaky Module** - Enhanced Flaky test management functionality
  - Improved unstable test case detection algorithm
  - Optimized quarantine strategy
  - Enhanced historical data tracking

---

## [1.0.6] - 2026-04-24

### Added

#### Real-time Reporting

- **Realtime Module** - Added real-time reporting functionality
  - Real-time test progress push
  - WebSocket connection management
  - Event broadcasting mechanism

---

## [1.0.0] - 2026-04-11

### Added

#### Core Features

- **Orchestrator** - Intelligent test orchestration, supports automatic test discovery and smart sharding
- **Executor** - Test execution engine via Playwright CLI
- **Reporter** - Comprehensive test reporting system
- **FlakyTestManager** - Automatic detection and quarantine of unstable test cases
- **Web Dashboard** - Visual interface for test management
- **CLI Tool** - Complete command-line interface

---

For the complete changelog, visit [GitHub Releases](https://github.com/yuandiv/yuantest-playwright/releases).
