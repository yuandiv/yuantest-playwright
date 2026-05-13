# AI Intelligent Failure Analysis Deep Guide

This document provides a detailed introduction to the architecture design, core processes, and configuration of the AI intelligent failure analysis system. All content is consistent with the source code implementation.

---

## Table of Contents

- [Overall Architecture](#overall-architecture)
- [Diagnosis Process](#diagnosis-process)
- [Context Enrichment Engine](#context-enrichment-engine)
- [Playwright Knowledge Base](#playwright-knowledge-base)
- [Agent Multi-turn Reasoning](#agent-multi-turn-reasoning)
- [Confidence Calibration](#confidence-calibration)
- [Streaming Diagnosis](#streaming-diagnosis)
- [LLM Configuration](#llm-configuration)
- [Diagnosis Result Types](#diagnosis-result-types)
- [Cache and Persistence](#cache-and-persistence)
- [Security Mechanisms](#security-mechanisms)

---

## Overall Architecture

The AI intelligent failure analysis system consists of the following core modules:

| Module | Source File | Responsibility |
|--------|-------------|----------------|
| Context Enrichment Engine | `src/diagnosis/context-enricher.ts` | Collects and assembles multi-dimensional context information |
| Playwright Knowledge Base | `src/diagnosis/knowledge-base.ts` | Error pattern matching and few-shot example generation |
| Diagnosis Service | `src/diagnosis/index.ts` | Orchestrates the complete diagnosis process, including Agent loop and confidence calibration |
| Type Definitions | `src/types/index.ts` | Type definitions for all diagnosis-related interfaces |

---

## Diagnosis Process

The complete diagnosis process executes in the following order:

```
enrichContext → matchPatterns → agentLoop → parseResponse → calibrateConfidence
```

1. **enrichContext** — Collects source code, screenshots, console logs, stack traces, environment information, and historical data
2. **matchPatterns** — Uses local knowledge base pattern matching to identify error categories and generate few-shot examples
3. **agentLoop** — Calls LLM for multi-turn reasoning (supports tool calling), or falls back to single call
4. **parseResponse** — Parses the LLM's JSON response into a structured `AIDiagnosis` object
5. **calibrateConfidence** — Calibrates confidence based on context usage and pattern matching results

---

## Context Enrichment Engine

Source file: [context-enricher.ts](../../src/diagnosis/context-enricher.ts)

The `enrichContext` function collects 6 types of context information and returns an `EnrichedContext` object:

### 1. Source Code Context

- Calls `readSourceCode(filePath, lineNumber)` to read the file where the failed test is located
- When `lineNumber` is provided, reads **±20 lines** of context around the failure line (controlled by `SOURCE_CONTEXT_LINES = 20`)
- Marks the failure line with `>>>` prefix for visibility
- Maximum read limit is **100 lines** (controlled by `MAX_SOURCE_LINES = 100`)
- Returns `undefined` if the file doesn't exist or read fails

### 2. Screenshot Analysis

- Calls `encodeScreenshot(screenshots)` to encode screenshot files as base64
- Reads the **first file** in the `screenshots` array for base64 encoding
- The encoded base64 string is passed to vision-capable LLMs for image analysis

### 3. Console Logs

- Directly uses browser console logs from the `testInfo.logs` array
- Includes `console.error` / `console.warn` output before test failure

### 4. Full Stack Trace

- Directly uses Playwright's original `error.stack`
- Provided by the `testInfo.stackTrace` field

### 5. Environment Information

- Calls `buildEnvironmentInfo(testInfo)` to build, including:
  - **Browser type**: `testInfo.browser` (default `unknown`)
  - **Operating system**: `process.platform` + `process.arch`
  - **Node.js version**: `process.version`
  - **Working directory**: `process.cwd()`

### 6. Historical Data

- Calls `buildHistoryContext(testTitle, dataDir)` to read from `dataDir/history.json`
- Finds historical records for the specified test, sorted by time descending, taking the most recent **5 runs**
- Calculates pass/fail counts, failure rate, and last failure reason

### EnrichedContext Interface

```typescript
interface EnrichedContext {
  sourceCode?: string;
  screenshotBase64?: string;
  consoleLogs: string[];
  stackTrace?: string;
  environmentInfo: string;
  historyData?: string;
  contextUsed: ContextUsed;
  rootCauseContext?: {
    primaryCause: RootCauseAnalysis['primaryCause'];
    confidence: number;
    evidence: Array<{
      indicators: string[];
      confidence: number;
      description: string;
    }>;
    suggestedActions: string[];
  };
}
```

### ContextUsed Type

Records whether each type of context was actually used:

```typescript
interface ContextUsed {
  sourceCode: boolean;
  screenshot: boolean;
  consoleLogs: boolean;
  stackTrace: boolean;
  historyData: boolean;
  environmentInfo: boolean;
}
```

> Note: `environmentInfo` is always `true` because environment information is always available.

---

## Playwright Knowledge Base

Source file: [knowledge-base.ts](../../src/diagnosis/knowledge-base.ts)

### Error Pattern Classification

The knowledge base defines **6 major categories** of error patterns, each containing multiple specific patterns:

#### 1. TimeoutError — Wait Timeout

| Pattern ID | Name | Typical Regex |
|------------|------|---------------|
| `timeout-element-wait` | Element wait timeout | `Timeout.*waiting for.*selector` |
| `timeout-navigation` | Navigation timeout | `Timeout.*navigating` |
| `timeout-api-response` | API response timeout | `Timeout.*waiting for.*response` |
| `timeout-race-condition` | Concurrent race timeout | `race.*condition` / `concurrent.*error` |
| `timeout-memory-overflow` | Memory overflow | `heap.*out.*of.*memory` / `JavaScript heap out of memory` |
| `timeout-concurrent-conflict` | Concurrent conflict | `port.*already.*in.*use` / `EADDRINUSE` |

#### 2. SelectorError — Selector Failure

| Pattern ID | Name | Typical Regex |
|------------|------|---------------|
| `selector-element-not-found` | Element not found | `No element found.*selector` |
| `selector-strict-mode` | Selector ambiguity | `strict mode violation` |
| `selector-iframe` | Selector inside iframe | `frame.*selector` |
| `selector-headless-difference` | Headless environment difference | `headless.*mode.*fail` |

#### 3. AssertionError — Assertion Failure

| Pattern ID | Name | Typical Regex |
|------------|------|---------------|
| `assertion-text-mismatch` | Text mismatch | `Expected.*text.*received` |
| `assertion-visibility` | Visibility assertion failure | `Expected.*visible.*hidden` |
| `assertion-attribute` | Attribute assertion failure | `Expected.*attribute.*value` |
| `assertion-data-validation` | Data validation error | `data.*invalid` / `validation.*fail` |
| `assertion-state-inconsistency` | State inconsistency | `state.*mismatch` / `stale.*data` |

#### 4. NetworkError — Network Error

| Pattern ID | Name | Typical Regex |
|------------|------|---------------|
| `network-request-failed` | Request failed | `Request failed` / `net::ERR_` |
| `network-cors` | CORS cross-origin error | `CORS` / `Cross-Origin` |
| `network-dns` | DNS resolution failure | `ERR_NAME_NOT_RESOLVED` / `DNS` |
| `network-env-config` | Environment configuration error | `ECONNREFUSED` / `getaddrinfo` |
| `network-dependency-missing` | Missing dependency | `Cannot find module` / `MODULE_NOT_FOUND` |

#### 5. FrameError — Frame Related Error

| Pattern ID | Name | Typical Regex |
|------------|------|---------------|
| `frame-detached` | Frame detached | `frame.*detached` |
| `frame-cross-origin` | Cross-frame security restriction | `cross-origin frame` |

#### 6. AuthError — Authentication Related Error

| Pattern ID | Name | Typical Regex |
|------------|------|---------------|
| `auth-token-expired` | Token expired | `401.*Unauthorized` / `token.*expired` |
| `auth-redirect-login` | Redirect to login (not authenticated) | `302.*redirect.*login` |

### ErrorPattern Structure

Each error pattern contains the following fields:

```typescript
interface ErrorPattern {
  id: string;                                          // Unique identifier
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  name: string;                                        // Pattern name
  description: string;                                 // Error characteristic description
  regex: RegExp[];                                     // Typical error message regex
  rootCauseTemplate: { zh: string; en: string };       // Root cause analysis template (Chinese/English)
  suggestionsTemplate: { zh: string[]; en: string[] }; // Fix suggestion template (Chinese/English)
  docLinks: { title: string; url: string }[];          // Related Playwright documentation links
}
```

### Pattern Matching and Few-shot Injection

- **Automatic matching**: Before calling the LLM, `matchPatterns(error)` is used to match error categories in the local knowledge base
- **Few-shot examples**: Matched patterns are converted to prompt fragments via `buildFewShotExamples(patterns, lang)` and injected into the system prompt
- Matched pattern information includes: pattern name, typical root cause, suggested fixes, reference documentation

### Custom Patterns

The knowledge base supports registering custom error patterns:

- `registerPattern(pattern)` — Register a new pattern (same ID will overwrite)
- `unregisterPattern(patternId)` — Unregister a pattern
- `getCustomPatterns()` — Get all custom patterns
- `loadPatternsFromConfig(configPatterns)` — Batch load patterns from configuration

---

## Agent Multi-turn Reasoning

Source file: [index.ts](../../src/diagnosis/index.ts) (`DiagnosisService` class)

### Tool Definitions

The Agent loop provides 4 tools (defined in OpenAI function calling format):

| Tool Name | Parameters | Description |
|-----------|------------|-------------|
| `read_source_file` | `path` (required), `startLine?`, `endLine?` | Read source code file |
| `search_codebase` | `pattern` (required), `filePattern?` | Search code patterns in codebase |
| `query_test_history` | `testId` (required), `limit?` (default 5) | Query test history run records |
| `read_screenshot` | `testId` (required) | Read failure screenshot (returns base64) |

### Reasoning Loop

The execution logic of the `agentLoop` method:

1. Build initial message list (system + user, with screenshots passed in vision format if available)
2. First call to `callLLMWithTools(messages, config, TOOL_SCHEMAS)`
3. **If LLM doesn't return tool_calls**:
   - Has content → return directly, `analysisMode = 'single'`
   - No content and no tool_calls → LLM doesn't support tool_calling, fallback to `callLLM` single call, `analysisMode = 'single'`
4. **If LLM returns tool_calls** → enter tool calling loop:
   - Maximum **5 rounds** (controlled by `MAX_AGENT_ROUNDS = 5`)
   - Each round: execute tool call → record `ReasoningStep` → append tool result to message list → call LLM again
   - When LLM no longer returns tool_calls, return final content, `analysisMode = 'agent'`
   - After reaching maximum rounds, make final call without tools parameter
5. **Exception fallback**: When Agent loop errors, fallback to `callLLM` single call mode, `analysisMode = 'single'`

### ReasoningStep Record

Each round of tool calling records a reasoning step:

```typescript
interface ReasoningStep {
  step: number;      // Round number
  tool?: string;     // Tool name
  input?: string;    // Tool call parameters (JSON string)
  output?: string;   // Tool execution result (truncated to 500 characters)
  thought: string;   // Reasoning description
}
```

### Analysis Mode

`analysisMode` has three possible values:

| Mode | Meaning |
|------|---------|
| `agent` | Successfully executed Agent multi-turn tool calling loop |
| `single` | LLM doesn't support tool_calling or directly gave final answer, using single call |
| `fallback` | LLM response parsing failed, using raw text as summary |

---

## Confidence Calibration

Source file: [index.ts](../../src/diagnosis/index.ts) (`calibrateConfidence` method)

Calibration formula:

```
calibratedConfidence = llmConfidence × 0.6 + patternMatchBonus + contextBonus + historyBonus
```

Bonus rules for each item:

| Bonus Item | Condition | Value |
|------------|-----------|-------|
| Pattern match bonus | `patternMatched = true` (knowledge base matched error pattern) | +0.2 |
| Screenshot bonus | `contextUsed.screenshot = true` | +0.1 |
| Source code bonus | `contextUsed.sourceCode = true` | +0.1 |
| Console logs bonus | `contextUsed.consoleLogs = true` | +0.05 |
| History consistency bonus | `historyConsistent = true` (historical data exists) | +0.1 |

Final result is clamped to **[0, 1]** range via `Math.min(1, Math.max(0, calibrated))`.

### Low Confidence Warning

When `calibratedConfidence < 0.5`, the system automatically appends a warning to the end of the `suggestions` array:

- Chinese: `⚠️ 置信度较低，建议人工确认此诊断结果`
- English: `⚠️ Low confidence, manual review recommended for this diagnosis`

---

## Streaming Diagnosis

Source file: [index.ts](../../src/diagnosis/index.ts) (`diagnoseStream` method)

Streaming diagnosis implements real-time push via SSE (Server-Sent Events).

### SSE Transmission Format

Server sets response headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
```

Each event is sent with `data:` prefix, format:

```
data: {"type":"...","...":"..."}\n\n
```

### Event Types

| Event type | Description | Data Fields |
|------------|-------------|-------------|
| `start` | Diagnosis started | `testTitle` |
| `chunk` | LLM generated content chunk | `content` |
| `complete` | Diagnosis completed | `diagnosis` (complete AIDiagnosis object) |
| `error` | Diagnosis error | `error` (error message string) |

### Event Stream Sequence

```
→ data: {"type":"start","testTitle":"Login Test"}\n\n
→ data: {"type":"chunk","content":"{"}\n\n
→ data: {"type":"chunk","content":"\"summary\":"}\n\n
→ data: {"type":"chunk","content":"\"Element wait timeout\""}\n\n
... (multiple chunk events)
→ data: {"type":"complete","diagnosis":{...}}\n\n
```

### Streaming Mode Limitations

Streaming diagnosis uses a simplified single call mode (`callLLMStream`), **does not use Agent loop**, therefore:

- `analysisMode` is always `'single'`
- No `reasoningSteps` generated
- Tool calling not supported

---

## LLM Configuration

### LLMConfig Type

```typescript
interface LLMConfig {
  enabled: boolean;      // Whether AI diagnosis is enabled
  apiKey: string;        // API key
  baseUrl: string;       // API base URL
  model: string;         // Model name
  remark: string;        // Configuration remark
  maxTokens: number;     // Maximum generation tokens
  temperature: number;   // Generation temperature
}
```

### Default Configuration

```typescript
const DEFAULT_CONFIG: LLMConfig = {
  enabled: false,
  apiKey: '',
  baseUrl: 'http://localhost:11434',
  model: '',
  remark: '',
  maxTokens: 2048,
  temperature: 0.3,
};
```

### Compatible Services

The system is compatible with all **OpenAI API compatible interfaces**, including but not limited to:

- OpenAI (GPT-4, GPT-3.5, etc.)
- Ollama (local model service)
- vLLM (high-performance inference service)
- Other services compatible with `/v1/chat/completions` interface

### API Call Format

- **Endpoint**: `{baseUrl}/v1/chat/completions`
- **Authentication**: When `apiKey` is non-empty, adds `Authorization: Bearer {apiKey}` request header
- **Request timeout**: 60 seconds
- **Response format**: `response_format: { type: "json_object" }` (non-tool calling mode)
- **Streaming request**: `stream: true`

### Configuration Management

- **Storage location**: `{dataDir}/llm-config.json`
- **Loading**: Automatically loaded when `DiagnosisService` is constructed, merged with defaults
- **Saving**: `saveConfig(config)` saves configuration and automatically clears cache
- **Reading**: `getMaskedConfig()` returns a shallow copy of the configuration

### Connection Test

- **Test endpoint**: `{baseUrl}/v1/models`
- **Timeout**: 10 seconds
- **Status determination**:
  - `green`: Configured and connection normal
  - `yellow`: Configuration incomplete
  - `red`: Configured but connection failed

---

## Diagnosis Result Types

### AIDiagnosis Interface

```typescript
interface AIDiagnosis {
  summary: string;               // Brief failure summary
  rootCause: string;             // Identified root cause
  suggestions: string[];         // List of actionable fix suggestions
  confidence: number;            // LLM original confidence (0-1)
  model: string;                 // Model name used
  timestamp: number;             // Diagnosis timestamp
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  codeDiffs?: CodeDiff[];        // Suggested code changes
  docLinks?: DocLink[];          // Related documentation links
  contextUsed: ContextUsed;      // Actually used context information
  reasoningSteps?: ReasoningStep[]; // Agent reasoning steps
  calibratedConfidence: number;  // Calibrated confidence (0-1)
  analysisMode: 'agent' | 'single' | 'fallback'; // Analysis mode
  relatedFailures?: string[];    // Related failure information
}
```

### CodeDiff — Code Difference

```typescript
interface CodeDiff {
  filePath: string;     // File path
  unifiedDiff: string;  // Modification content in unified diff format
  description: string;  // Modification description
}
```

### DocLink — Documentation Link

```typescript
interface DocLink {
  title: string;  // Document title
  url: string;    // Document URL
}
```

### ReasoningStep — Reasoning Step

```typescript
interface ReasoningStep {
  step: number;      // Step number
  tool?: string;     // Tool name used
  input?: string;    // Tool input parameters
  output?: string;   // Tool output result
  thought: string;   // Reasoning thought process
}
```

---

## Cache and Persistence

### Memory Cache

- **Maximum entries**: 100 (`CACHE_MAX_SIZE`)
- **Expiration time**: 30 minutes (`CACHE_TTL_MS = 30 * 60 * 1000`)
- **Eviction policy**: LRU (delete oldest entry when limit reached)
- **Cache key**: `{title}::{error}::{filePath}::{lineNumber}::{lang}`
- **Clear timing**: Automatically cleared when saving new configuration

### Persistence Storage

- **Storage directory**: `{dataDir}/diagnosis/`
- **File format**: `{runId}.json`, content is `Record<string, AIDiagnosis>` (with testId as key)
- **Save timing**: When `runId` and `testId` are provided, automatically persisted after diagnosis completes
- **Load timing**: Check persisted results before diagnosis, return directly if exists

---

## Security Mechanisms

### File Access Control

The `read_source_file` and `search_codebase` tools in Agent tool calls implement the following security restrictions:

**Path Restriction**:

- Only allows access to files under the project working directory (`process.cwd()`)
- Rejects access when path is outside project directory

**Sensitive File Filtering**:

Files matching the following patterns are prohibited from reading:

| Pattern | Description |
|---------|-------------|
| `.env` | Environment variable file |
| `.pem` / `.key` / `.p12` / `.pfx` | Certificate/key files |
| `id_rsa` / `id_ed25519` | SSH private keys |
| `credentials` | Credential files |
| `.npmrc` | npm configuration (may contain tokens) |
| `ssh/config` | SSH configuration |
| `.gitconfig` | Git configuration |
| `htpasswd` | HTTP authentication file |

**Directory Filtering**:

The following directories are skipped when searching the codebase:

- `node_modules`
- `.git`
- `__pycache__`
- `.venv` / `venv`

**Search Limits**:

- Maximum search depth: 8 levels
- Maximum results: 20 items
- Tool output truncation: 500 characters
