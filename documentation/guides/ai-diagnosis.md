# AI Intelligent Failure Analysis Deep Guide

This document provides a detailed introduction to the architecture design, core processes, and configuration of the AI intelligent failure analysis system. All content is consistent with the source code implementation.

---

## Table of Contents

- [Overall Architecture](#overall-architecture)
- [Diagnosis Process](#diagnosis-process)
- [Context Enrichment Engine](#context-enrichment-engine)
- [Playwright Knowledge Base](#playwright-knowledge-base)
- [Diagnosis Mode and LLM Invocation](#diagnosis-mode-and-llm-invocation)
- [Confidence Calibration](#confidence-calibration)
- [LLM Configuration](#llm-configuration)
- [Diagnosis Result Types](#diagnosis-result-types)
- [Cache and Persistence](#cache-and-persistence)
- [Security Mechanisms](#security-mechanisms)

---

## Overall Architecture

The AI intelligent failure analysis system consists of the following core modules:

| Module | Source File | Responsibility |
|--------|-------------|----------------|
| Context Enrichment Engine | `src/diagnosis/context-enricher.ts` | Collects and assembles multi-dimensional context information (source code, screenshots, logs, stack trace, environment, history) |
| Playwright Knowledge Base | `src/diagnosis/knowledge-base.ts` | Error pattern matching and few-shot example generation, supports custom pattern registration |
| Error Pattern Definitions | `src/diagnosis/patterns/*.ts` | 7 categories, 30+ built-in error patterns split by category |
| Error Categorizer | `packages/diagnosis/src/categorizer.ts` | Regex-based error message classification into 7 predefined categories |
| Response Parser | `src/diagnosis/response-parser.ts` | Parses LLM JSON responses into structured `AIDiagnosis` objects with fallback logic |
| Diagnosis Cache | `src/diagnosis/diagnosis-cache.ts` | TTLCache-based in-memory cache, max 100 entries, TTL 30 min, LRU eviction |
| Diagnosis Persister | `src/diagnosis/diagnosis-persister.ts` | Persists diagnosis results by `runId` to `{dataDir}/diagnosis/` directory |
| Diagnosis Agent | `packages/ai/src/agents/diagnosis.ts` | Orchestrates the complete diagnosis flow, extends `BaseAgent`, supports sync and streaming modes |
| Cluster Analysis | `packages/diagnosis/src/cluster.ts` | Failure test clustering using Jaccard similarity + Union-Find algorithm |
| Type Definitions | `packages/contracts/src/index.ts` | Type definitions for all diagnosis-related interfaces |

---

## Diagnosis Process

The complete diagnosis process executes in the following order:

```
prepareDiagnosis → callLLM or chatStream → finalizeDiagnosis
```

### 1. prepareDiagnosis (Preparation Phase)

1. **matchPatterns** — Match error categories using the local knowledge base
2. **enrichContext** — Collect source code, screenshots, console logs, stack traces, environment info, and history data, generating an `EnrichedContext` object
3. **buildEnrichedPrompt** — Build the system prompt (with few-shot examples) and user prompt (with context information), instructing the LLM to return JSON format

### 2. callLLM / chatStream (LLM Call)

- **Non-streaming** (`diagnose` method): Calls `BaseAgent.callLLM()` with `responseFormat: { type: 'json_object' }` to enforce JSON output
- **Streaming** (`diagnoseStream` method): Calls `llmService.chatStream()` as an AsyncGenerator, yielding tokens one by one, finally returning the complete `AIDiagnosis`

### 3. finalizeDiagnosis (Finalization Phase)

1. **parseResponse** — Parse the LLM's text response into a structured `AIDiagnosis` object (with JSON extraction and fallback logic)
2. **calibrateConfidence** — Calibrate confidence based on pattern matching results and context usage
3. Write to cache (`DiagnosisCache`) and persistence (`DiagnosisPersister`)

---

## Context Enrichment Engine

Source file: [context-enricher.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/src/diagnosis/context-enricher.ts)

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

Source file: [knowledge-base.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/src/diagnosis/knowledge-base.ts)

### Error Pattern Classification

The knowledge base defines **7 categories** of error patterns, each containing multiple specific patterns, with 30+ built-in patterns total:

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

## Diagnosis Mode and LLM Invocation

Source file: [diagnosis.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/packages/ai/src/agents/diagnosis.ts) (`DiagnosisAgent` class)

### Diagnosis Mode

`DiagnosisAgent` uses a **single LLM call** mode, with `responseFormat: { type: 'json_object' }` to enforce JSON-formatted structured diagnosis results. No multi-turn tool calling loop is involved.

### Analysis Mode

`analysisMode` has three possible values, determined by `parseResponse` based on the parsing result:

| Mode | Meaning |
|------|---------|
| `single` | LLM successfully returned a parseable JSON response |
| `fallback` | LLM response parsing failed, using raw text truncated as summary |

### Non-streaming Diagnosis (diagnose method)

1. Check cache (`DiagnosisCache`), return directly if hit
2. Call `prepareDiagnosis` to prepare context, patterns, and prompt
3. Call `BaseAgent.callLLM()` (delegates to `LLMService.chat()`), with `responseFormat: { type: 'json_object' }`
4. Call `finalizeDiagnosis` to parse the response and calibrate confidence
5. Write to cache and return

### Streaming Diagnosis (diagnoseStream method)

Streaming diagnosis uses SSE (Server-Sent Events) for real-time push.

1. Call `prepareDiagnosis` to prepare diagnosis context
2. Call `llmService.chatStream()` yielding tokens one by one
3. Return the complete `AIDiagnosis` object at the end

#### SSE Transmission Format

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

#### Event Types

| Event type | Description | Data Fields |
|------------|-------------|-------------|
| `start` | Diagnosis started | `testTitle` |
| `chunk` | LLM generated content chunk | `content` |
| `complete` | Diagnosis completed | `diagnosis` (complete AIDiagnosis object) |
| `error` | Diagnosis error | `error` (error message string) |

#### Event Stream Sequence

```
→ data: {"type":"start","testTitle":"Login Test"}\n\n
→ data: {"type":"chunk","content":"{"}\n\n
→ data: {"type":"chunk","content":"\"summary\":"}\n\n
→ data: {"type":"chunk","content":"\"Element wait timeout\""}\n\n
... (multiple chunk events)
→ data: {"type":"complete","diagnosis":{...}}\n\n
```

#### Streaming Mode Characteristics

- `analysisMode` is always `'single'`
- No `reasoningSteps` generated
- Tool calling not supported

### Agent Multi-turn Reasoning in Chat System

In the chat system (`LLMService.chatWithAgentLoop` / `chatWithAgentLoopStream`), a full Agent multi-turn tool calling loop is available, providing the following tools:

| Tool Name | Parameters | Description |
|-----------|------------|-------------|
| `read_file` | `path` (required), `startLine?`, `endLine?` | Read file content |
| `search_files` | `pattern` (required), `filePattern?` | Search files by pattern |
| `run_test` | `testFilePath` (required), `options?` | Run a specific test |
| `apply_patch` | `filePath` (required), `patch` (required) | Apply a patch to a file |
| `get_heal_history` | `testFilePath` (required) | Get heal history for a test |
| `list_plans` | `options?` | List test plans |

Agent loop logic:
- Maximum **5 rounds** (controlled by `MAX_AGENT_ROUNDS = 5`)
- Each round: execute tool call → record `ReasoningStep` → append tool result to message list → call LLM again
- When LLM no longer returns tool_calls, return final content
- After reaching max rounds, force terminate with `truncated = true`

> Note: The `DiagnosisAgent`'s diagnosis flow itself does not invoke the Agent loop; Agent multi-turn reasoning is primarily used by the `agent_diagnose` tool in the chat system.

---

## Confidence Calibration

Source file: [diagnosis.ts](https://github.com/yuandiv/yuantest-playwright/blob/main/packages/ai/src/agents/diagnosis.ts) (`calibrateConfidence` method)

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

> **Note**: In the current implementation, `historyConsistent` is hardcoded to `false` in `finalizeDiagnosis`, so the history consistency bonus is not yet applied.

### Low Confidence Warning

When `calibratedConfidence < 0.5`, the system automatically appends a warning to the end of the `suggestions` array:

- Chinese: `⚠️ 置信度较低，建议人工确认此诊断结果`
- English: `⚠️ Low confidence, manual review recommended for this diagnosis`

### Low Confidence in agent_diagnose Tool

The `agent_diagnose` tool also checks confidence when returning diagnosis results:
- When confidence is below 50%, appends a manual review prompt at the end of the result
- Includes code modification suggestion (`codeDiffs`) count in the result

---

## LLM Configuration

### LLMConfig Type

```typescript
interface LLMConfig {
  enabled: boolean;          // Whether AI diagnosis is enabled
  apiKey: string;            // API key
  baseUrl: string;           // API base URL
  model: string;             // Model name
  remark: string;            // Configuration remark
  maxTokens: number;         // Maximum generation tokens
  temperature: number;       // Generation temperature
  chatTemplateKwargs?: boolean; // Whether to use chat template parameters
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
  maxTokens: 4096,
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
- **Loading**: `loadLLMConfig()` reads configuration from file
- **Saving**: `saveLLMConfig(config)` persists configuration to file

### Connection Test

- **Test endpoint**: `{baseUrl}/models`
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
  reasoningSteps?: ReasoningStep[]; // Reasoning steps (used by chat system Agent loop)
  calibratedConfidence: number;  // Calibrated confidence (0-1)
  analysisMode: 'single' | 'fallback'; // Analysis mode (currently only single and fallback)
  relatedFailures?: string[];    // Related failure information
  healerPatch?: HealerPatch;     // Auto-generated healing patch
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
