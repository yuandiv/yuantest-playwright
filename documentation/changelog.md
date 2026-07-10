# Changelog

This file records all important changes to the project.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-07-09

### Added

#### New Agent Tools: agent_execute and agent_diagnose

- **agent_execute** — New Agent tool that allows AI to directly run Playwright tests and return pass/fail statistics during conversations. Supports `testDir`, `grep` (test name filter), `timeout`, and `retries` parameters. Automatically suggests calling `agent_diagnose` when failures exist.
- **agent_diagnose** — New Agent tool that allows AI to analyze test failure causes during conversations. Accepts `title` (test name) and `error` (error message), returns root cause analysis, fix suggestions, and confidence level. Prompts manual review when confidence is below 50%.
- Agent pipeline tool architecture refactored from if-else chain to `Map<string, AgentToolDef>` strategy pattern — adding a new tool only requires one `set()` call.
- **agent_generate** enhancement: Code blocks in LLM responses are automatically extracted and saved to the `tests/` directory, with filenames automatically derived from `test.describe()` / `test()` titles and conflict resolution.

#### LLMService Enhancements

- **Retry mechanism**: `fetchWithRetry()` replaces bare `fetch()` — automatically retries 5xx server errors and network exceptions (up to 5 retries) with exponential backoff (1s → 2s → 4s…). 4xx client errors and timeouts are not retried.
- **`truncated` flag**: `chatWithTools()` / `chatWithToolsStream()` / `chatWithAgentLoop()` / `chatWithAgentLoopStream()` all add `truncated?: boolean` field indicating the LLM response was cut off due to `max_tokens` limit.
- **`responseFormat` support**: `chat()` / `chatWithTools()` / `chatStream()` / `chatWithToolsStream()` / `chatWithAgentLoop()` / `chatWithAgentLoopStream()` all add optional `responseFormat` parameter supporting `{ type: 'json_object' }` format enforcement.
- When `chat_template_kwargs` (thinking) is enabled alongside `responseFormat`, thinking is automatically disabled to avoid conflicts.

#### DiagnosisService Enhancements

- **Agent loop streaming diagnosis**: `diagnoseStream()` upgraded from `chatStream()` to `chatWithAgentLoopStream()`, supporting tool calls (read source code, query logs, etc.) + real-time typewriter effect. Can receive `tool_call` / `tool_result` events during diagnosis.
- **Forced JSON output**: `diagnose()` and `diagnoseStream()` enforce `responseFormat: { type: 'json_object' }` when calling LLM, improving JSON parsing success rate.
- **Analysis mode tracking**: Diagnosis results now include `analysisMode` field tracking the actual analysis mode used ('agent' | 'single' | 'fallback').
- Removed persisted diagnosis shortcut path in `diagnoseStream()` — ensures every diagnosis is real-time analysis.
- Default `maxTokens` increased from 2048 to 4096.

#### Conversation Management Enhancements

- **Assistant + Tool Call merging**: `convertMessages()` merges consecutive assistant messages with tool_call messages into single assistant messages, preventing LLM protocol errors.
- **Per-round thinking content**: `sendMessage()` stores intermediate assistant messages (with thinking process) before tool calls for more complete storage; cleans `<think>` tags to avoid double display in frontend.
- **agent_generate post-processing**: `sendMessage()` automatically extracts code blocks from LLM responses and saves to files, notifying frontend of saved file paths via SSE events.

#### Dashboard Enhancements

- **Cluster no-results hint**: `FailureAnalysisPanel` and `ReporterPanel` add `clusterAnalysisDone` state. When AI cluster analysis completes with no results, shows a friendly message ("Test error keywords have no overlap, cannot form clusters") instead of continuing to show the "start cluster analysis" prompt.
- **Test status optimization**: `App.tsx` now restores running test status to `pending` (instead of `idle`) on run completion, preserving retry semantics; fixes test end event resetting running state.
- **Thinking content display fix**: `ChatPanel` done event preserves thinking content correctly set during streaming, no longer overwritten by accumulated thinkingContent.
- **Default maxTokens**: `AgentConfigDialog` changed from 2048 to 4096.

#### MCP Configuration Changes

- Built-in MCP Preset timeout uniformly increased from 5-10s to **30s** for large file/complex response scenarios.
- `playwright-mcp` startup method changed from `node node_modules/...` to `npx @playwright/mcp`, simplifying path dependencies.

### Changed

#### UnifiedAIService — ChatService and AgentService Merged

- **UnifiedAIService** — New unified facade class that combines `ChatService` (conversation + MCP) and `AgentService` (test planning/generation/healing) into a single `UnifiedAIService`.
  - Single `updateLLMConfig()` replaces separate calls to `ChatService.updateLLMConfig()` and `AgentService.setLLMConfig()`
  - Single `setProjectRoot()` replaces separate calls to both services
  - `ChatService` and `AgentService` retained as backward-compatible aliases
  - DI container: single registration for `UnifiedAIService`, old tokens point to same instance
  - RouterDeps: `agentService` + `chatService` fields → single `aiService` field
- **Source**: `src/ai/ai-service.ts` (693 lines, all sub-modules directly owned)

### Removed

- **`AgentHistoryManager`** module completely removed — related methods `getHealHistory()` / `listPlans()` deleted from `AgentService` and `UnifiedAIService`.
- **`agents-list` CLI command** removed (both `agents list` subcommand and standalone `agents-list` command no longer available).
- **`agent_get_heal_history` / `agent_list_plans`** Agent tools removed from the tool registry.
- **Persisted diagnosis shortcut** removed — the shortcut logic in `diagnoseStream()` that loaded persisted diagnosis from runId/testId and returned immediately has been removed.

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
