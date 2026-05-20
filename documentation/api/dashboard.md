# DashboardServer API Reference

DashboardServer provides Web Dashboard and REST API services for managing test runs, analyzing flaky tests, AI diagnostics, and more.

All API paths use the `/api/v1/` prefix.

---

## Constructor

```typescript
new DashboardServer(config?: DashboardConfig)
```

### DashboardConfig Type

| Field | Type | Default | Description |
|------|------|--------|------|
| `port` | `number` | `5274` | Server listening port |
| `outputDir` | `string` | `'./test-reports'` | Test report output directory |
| `dataDir` | `string` | `'./test-data'` | Persistent data storage directory |
| `host` | `string` | `'localhost'` | Server listening address |
| `openBrowser` | `boolean` | `false` | Whether to automatically open browser on startup |

### Example

```typescript
import { DashboardServer } from 'yuantest-playwright';

const server = new DashboardServer({
  port: 5274,
  outputDir: './test-reports',
  dataDir: './test-data',
  host: 'localhost',
  openBrowser: false,
});

await server.start();
```

---

## Instance Methods

### `start(): Promise<void>`

Start the Dashboard server. On startup, it automatically restores user preferences (testDir, autoQuarantine, flakyCriteria, quarantineCriteria) and loads custom error patterns.

```typescript
await server.start();
```

### `stop(): Promise<void>`

Stop the Dashboard server, closing WebSocket connections and HTTP services.

```typescript
await server.stop();
```

### `getRealtimeReporter(): RealtimeReporter`

Get the realtime reporter instance for accessing WebSocket broadcast methods.

```typescript
const reporter = server.getRealtimeReporter();
```

### `getFlakyManager(): FlakyTestManager`

Get the Flaky test manager instance.

```typescript
const flakyManager = server.getFlakyManager();
```

### `getReporter(): Reporter`

Get the report generator instance.

```typescript
const reporter = server.getReporter();
```

### `getExecutor(): Executor | null`

Get the current test executor instance, returns `null` when no executor is running.

```typescript
const executor = server.getExecutor();
```

---

## REST API Endpoints

### Health Check

#### `GET /api/v1/health`

Get server health status.

**Response Example:**

```json
{
  "status": "ok",
  "uptime": 3600.123,
  "clients": 3,
  "isRunning": false,
  "timestamp": 1715673600000
}
```

**Response Fields:**

| Field | Type | Description |
|------|------|------|
| `status` | `string` | Service status, always `'ok'` |
| `uptime` | `number` | Service uptime (seconds) |
| `clients` | `number` | Current WebSocket connection count |
| `isRunning` | `boolean` | Whether a test is currently running |
| `timestamp` | `number` | Current timestamp (milliseconds) |

---

### Statistics

#### `GET /api/v1/stats`

Get dashboard overall statistics.

**Response Example:**

```json
{
  "totalRuns": 100,
  "totalTests": 5000,
  "passRate": 95.2,
  "avgDuration": 12345,
  "flakyTests": 10,
  "quarantinedTests": 3,
  "recentRuns": []
}
```

**Response Fields:**

| Field | Type | Description |
|------|------|------|
| `totalRuns` | `number` | Total run count |
| `totalTests` | `number` | Total test count |
| `passRate` | `number` | Pass rate (percentage) |
| `avgDuration` | `number` | Average run duration (milliseconds) |
| `flakyTests` | `number` | Flaky test count |
| `quarantinedTests` | `number` | Quarantined test count |
| `recentRuns` | `RunResult[]` | Last 10 run results |

---

### Run Management

#### `GET /api/v1/runs`

Get run list with pagination support.

**Query Parameters:**

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `page` | `number` | `1` | Page number (minimum 1) |
| `pageSize` | `number` | `20` | Items per page (1-100) |

**Response Example:**

```json
{
  "data": [
    {
      "id": "run-20240514-001",
      "version": "1.0.0",
      "status": "completed",
      "totalTests": 50,
      "passed": 45,
      "failed": 3,
      "skipped": 2,
      "duration": 12345,
      "startTime": 1715673600000,
      "suites": []
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

#### `GET /api/v1/runs/:id`

Get detailed information for a specific run.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Run ID |

**Response Example:**

```json
{
  "id": "run-20240514-001",
  "version": "1.0.0",
  "status": "completed",
  "totalTests": 50,
  "passed": 45,
  "failed": 3,
  "skipped": 2,
  "duration": 12345,
  "startTime": 1715673600000,
  "suites": [
    {
      "name": "Test Suite",
      "tests": []
    }
  ],
  "flakyTests": []
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Run not found |

#### `POST /api/v1/runs`

Start a new test run.

**Request Body:**

```json
{
  "version": "1.0.0",
  "testDir": "./tests",
  "baseURL": "http://localhost:3000",
  "retries": 0,
  "timeout": 30000,
  "workers": 1,
  "shards": 1,
  "browsers": ["chromium"],
  "testFiles": ["tests/example.spec.ts"],
  "testLocations": ["tests/example.spec.ts:10"],
  "testIds": ["test-id-1"],
  "describePattern": "Login Module",
  "grepPattern": "smoke",
  "tagFilter": ["@smoke"],
  "projectFilter": "chromium",
  "updateSnapshots": false
}
```

**Request Field Descriptions:**

| Field | Type | Description |
|------|------|------|
| `version` | `string` | Version number, defaults to `'1.0.0'` |
| `testDir` | `string` | Test directory path |
| `baseURL` | `string` | Test base URL |
| `retries` | `number` | Retry count, defaults to `0` |
| `timeout` | `number` | Timeout (milliseconds), defaults to `30000` |
| `workers` | `number` | Parallel worker count, defaults to `1` |
| `shards` | `number` | Shard count, defaults to `1` |
| `browsers` | `string[]` | Browser list, defaults to `['chromium']` |
| `testFiles` | `string[]` | Specified test file list |
| `testLocations` | `string[]` | Specified test location list (format: `file:line`) |
| `testIds` | `string[]` | Specified test ID list |
| `describePattern` | `string` | describe block match pattern |
| `grepPattern` | `string` | Test name grep match pattern |
| `tagFilter` | `string[]` | Tag filter |
| `projectFilter` | `string` | Project filter |
| `updateSnapshots` | `boolean` | Whether to update snapshots |

**Response Example:**

```json
{
  "status": "started",
  "message": "Test execution initiated"
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `409` | An execution is already running |
| `400` | Invalid testDir path |

#### `DELETE /api/v1/runs/:id`

Cancel/delete a specific run.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Run ID |

**Response Example:**

```json
{
  "success": true,
  "message": "Report run-20240514-001 deleted"
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Run not found or cannot be deleted |

#### `POST /api/v1/runs/:runId/tests/:testId/rerun`

Rerun a single test.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Run ID |
| `testId` | `string` | Test ID |

**Request Body:**

```json
{
  "testLocation": "tests/example.spec.ts:10"
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `testLocation` | `string` | Yes | Test location (format: `file:line`) |

**Response Example:**

```json
{
  "status": "started",
  "message": "Test rerun initiated"
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `400` | Missing testLocation |
| `404` | Run or test not found |
| `409` | An execution is already running |

#### `POST /api/v1/runs/:runId/batch-rerun`

Batch rerun multiple tests.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `runId` | `string` | Run ID |

**Request Body:**

```json
{
  "tests": [
    {
      "testId": "test-id-1",
      "testLocation": "tests/example.spec.ts:10"
    },
    {
      "testId": "test-id-2",
      "testLocation": "tests/example.spec.ts:25"
    }
  ]
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `tests` | `Array<{testId: string, testLocation: string}>` | Yes | Test list, each item must contain testId and testLocation |

**Response Example:**

```json
{
  "status": "started",
  "message": "Batch rerun initiated",
  "count": 2
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `400` | tests array is empty or missing required fields |
| `404` | Run not found |
| `409` | An execution is already running |

---

### Tests

#### `GET /api/v1/tests/:testId/history`

Get history run records for a specific test.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

**Query Parameters:**

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `page` | `number` | `1` | Page number |
| `pageSize` | `number` | `10` | Items per page (1-100) |

**Response Example:**

```json
{
  "testId": "test-id-1",
  "summary": {
    "stability": 85.71,
    "totalRuns": 14,
    "passed": 12,
    "failed": 2,
    "lastPassed": {
      "runId": "run-001",
      "version": "1.0.0",
      "status": "passed",
      "duration": 1234,
      "timestamp": 1715673600000,
      "retries": 0,
      "htmlReportUrl": "/html-reports/run-001/index.html",
      "testId": "test-id-1"
    },
    "lastFailed": null,
    "lastFlaky": null
  },
  "history": [],
  "pagination": {
    "page": 1,
    "pageSize": 10,
    "total": 14,
    "totalPages": 2
  }
}
```

---

### Flaky Management

#### `GET /api/v1/flaky`

Get flaky test list.

**Query Parameters:**

| Parameter | Type | Default | Description |
|------|------|--------|------|
| `threshold` | `number` | `0.3` | Failure rate threshold (0-1) |

**Response Example:**

```json
[
  {
    "testId": "test-id-1",
    "title": "Login Function Test",
    "failureRate": 0.4,
    "isQuarantined": false
  }
]
```

#### `GET /api/v1/flaky/stats`

Get flaky test statistics.

**Response Example:**

```json
{
  "quarantined": 3,
  "total": 10,
  "classificationBreakdown": {
    "infrastructure": 2,
    "timing": 3,
    "test_design": 1,
    "environment": 2,
    "unknown": 2
  }
}
```

#### `GET /api/v1/flaky/trends`

Get trend analysis for all flaky tests.

**Response Example:**

```json
{
  "test-id-1": {
    "trend": "improving",
    "dataPoints": []
  },
  "test-id-2": {
    "trend": "degrading",
    "dataPoints": []
  }
}
```

#### `GET /api/v1/flaky/health`

Get overall flaky test health score.

**Response Example:**

```json
{
  "score": 75,
  "level": "good",
  "details": {}
}
```

#### `GET /api/v1/flaky/prediction/:testId`

Get failure prediction for a specific test.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

**Response Example:**

```json
{
  "testId": "test-id-1",
  "failureProbability": 0.65,
  "factors": []
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Test not found or no prediction data |

#### `GET /api/v1/flaky/duration-anomalies`

Get list of tests with duration anomalies.

**Response Example:**

```json
[
  {
    "testId": "test-id-1",
    "title": "Slow Test",
    "medianDuration": 5000,
    "anomalousDuration": 30000,
    "deviation": 6.0
  }
]
```

---

### Quarantine

#### `POST /api/v1/quarantine/:testId`

Quarantine a specific test.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

**Response Example:**

```json
{
  "success": true,
  "testId": "test-id-1"
}
```

#### `DELETE /api/v1/quarantine/:testId`

Release a quarantined test.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

**Request Body (Optional):**

```json
{
  "resetHistory": true
}
```

**Request Field Descriptions:**

| Field | Type | Default | Description |
|------|------|--------|------|
| `resetHistory` | `boolean` | `false` | Whether to also reset history records |

**Response Example:**

```json
{
  "success": true,
  "testId": "test-id-1"
}
```

---

### Causal Graph

#### `GET /api/v1/causal-graph`

Get causal graph data.

**Response Example:**

```json
{
  "nodes": [],
  "edges": [],
  "rootCauses": [],
  "impactMap": {},
  "builtAt": 1715673600000
}
```

**Response Fields:**

| Field | Type | Description |
|------|------|------|
| `nodes` | `GraphNode[]` | Causal graph node list |
| `edges` | `GraphEdge[]` | Causal graph edge list |
| `rootCauses` | `RootCause[]` | Root cause list |
| `impactMap` | `Record<string, unknown>` | Impact map |
| `builtAt` | `number` | Causal graph build timestamp |

#### `GET /api/v1/impact-analysis/:testId`

Get impact analysis for a specific test.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |

**Response Example:**

```json
{
  "testId": "test-id-1",
  "directImpact": 3,
  "indirectImpact": 7,
  "affectedTests": []
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Test not found or no causal graph data |

---

### AI Diagnosis

#### `POST /api/v1/diagnosis`

Perform AI diagnosis on a single test failure.

**Request Body:**

```json
{
  "testTitle": "Login Function Test",
  "error": "TimeoutError: Navigation timed out",
  "stackTrace": "at Context.<anonymous> (tests/login.spec.ts:10:5)",
  "file": "tests/login.spec.ts",
  "line": 10,
  "lang": "zh",
  "screenshots": ["/screenshots/login-failure.png"],
  "logs": ["Navigating to /login...", "Timeout after 30000ms"],
  "browser": "chromium",
  "runId": "run-001",
  "testId": "test-id-1"
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `testTitle` | `string` | No | Test title |
| `error` | `string` | No | Error message |
| `stackTrace` | `string` | No | Stack trace |
| `file` | `string` | No | Test file path |
| `line` | `number` | No | Test line number |
| `lang` | `string` | No | Diagnosis language (`'zh'` or `'en'`), defaults to `'zh'` |
| `screenshots` | `string[]` | No | Screenshot path list |
| `logs` | `string[]` | No | Log list |
| `browser` | `string` | No | Browser name |
| `runId` | `string` | No | Run ID (for additional history context) |
| `testId` | `string` | No | Test ID (for root cause analysis) |

**Response Example:**

```json
{
  "enabled": true,
  "diagnosis": {
    "rootCause": "Page load timeout, possibly due to network latency or slow server response",
    "suggestions": [
      "Increase navigation timeout",
      "Check network connection status",
      "Verify server is running properly"
    ],
    "category": "timeout",
    "confidence": 0.85
  }
}
```

**Response when LLM is not enabled:**

```json
{
  "enabled": false,
  "diagnosis": null
}
```

#### `POST /api/v1/diagnosis/stream`

Streaming AI diagnosis using Server-Sent Events (SSE) to return diagnosis results.

**Request Body:** Same as `POST /api/v1/diagnosis`.

**Response:**

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

**SSE Data Format:**

```
data: {"content":"Analyzing error message..."}

data: {"content":"Possible root cause is..."}

data: {"type":"error","error":"Connection timeout"}
```

#### `GET /api/v1/diagnosis/persisted`

Get persisted diagnosis results.

**Query Parameters:**

| Parameter | Type | Required | Description |
|------|------|------|------|
| `runId` | `string` | Yes | Run ID |
| `testId` | `string` | Yes | Test ID |

**Response Example:**

```json
{
  "found": true,
  "diagnosis": {
    "rootCause": "Page load timeout",
    "suggestions": ["Increase timeout"],
    "category": "timeout",
    "confidence": 0.85
  }
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `400` | Missing runId or testId |

#### `POST /api/v1/diagnosis/cluster`

Batch cluster diagnosis, performing AI diagnosis on representative tests from each cluster based on error similarity.

**Request Body:**

```json
{
  "testResults": [
    {
      "id": "test-id-1",
      "title": "Login Test",
      "error": "TimeoutError: Navigation timed out",
      "stackTrace": "...",
      "file": "tests/login.spec.ts",
      "line": 10,
      "screenshots": [],
      "logs": [],
      "browser": "chromium"
    },
    {
      "id": "test-id-2",
      "title": "Register Test",
      "error": "TimeoutError: Waiting for selector timed out",
      "stackTrace": "...",
      "file": "tests/register.spec.ts",
      "line": 20
    }
  ],
  "lang": "zh"
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `testResults` | `Array` | Yes | Test result array |
| `lang` | `string` | No | Diagnosis language, defaults to `'zh'` |

**Response Example:**

```json
{
  "enabled": true,
  "clusters": [
    {
      "clusterId": "cluster-1",
      "category": "timeout",
      "testIds": ["test-id-1", "test-id-2"],
      "similarity": 0.92,
      "errorMessage": "TimeoutError",
      "diagnosis": {
        "rootCause": "Page load timeout",
        "suggestions": ["Increase timeout"],
        "category": "timeout",
        "confidence": 0.85,
        "relatedFailures": ["test-id-2"]
      }
    }
  ]
}
```

**Response when LLM is not enabled:**

```json
{
  "enabled": false,
  "clusters": [
    {
      "clusterId": "cluster-1",
      "category": "timeout",
      "testIds": ["test-id-1", "test-id-2"],
      "similarity": 0.92,
      "errorMessage": "TimeoutError",
      "diagnosis": null
    }
  ]
}
```

---

### Error Patterns

#### `GET /api/v1/error-patterns`

Get all error patterns list (including built-in and custom).

**Response Example:**

```json
[
  {
    "id": "timeout-navigation",
    "category": "timeout",
    "name": "Navigation Timeout",
    "description": "Page navigation timeout",
    "regex": ["Navigation\\s+timed\\s+out", "page\\.goto.*timeout"],
    "isCustom": false,
    "rootCauseTemplate": { "zh": "页面加载超时", "en": "Page navigation timeout" },
    "suggestionsTemplate": {
      "zh": ["增加超时时间", "检查网络连接"],
      "en": ["Increase timeout", "Check network"]
    },
    "docLinks": []
  }
]
```

#### `POST /api/v1/error-patterns`

Add a custom error pattern.

**Request Body:**

```json
{
  "id": "custom-db-connection",
  "category": "network",
  "name": "Database Connection Failed",
  "description": "Database connection timeout or refused",
  "regex": ["ECONNREFUSED.*3306", "database\\s+connection\\s+failed"],
  "rootCauseTemplate": { "zh": "数据库服务不可达", "en": "Database service unreachable" },
  "suggestionsTemplate": {
    "zh": ["检查数据库服务状态", "验证连接配置"],
    "en": ["Check database service", "Verify connection config"]
  },
  "docLinks": [
    { "title": "Database Connection Docs", "url": "https://example.com/docs" }
  ]
}
```

**Required Fields:** `id`, `category`, `name`, `regex`, `rootCauseTemplate`, `suggestionsTemplate`

**Response Example:**

```json
{
  "success": true,
  "id": "custom-db-connection"
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `400` | Missing required fields |

#### `DELETE /api/v1/error-patterns/:id`

Delete a custom error pattern.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Error pattern ID |

**Response Example:**

```json
{
  "success": true
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Error pattern not found |

---

### Agent Management

#### Agent API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/agents/config` | Get agent configuration |
| `PUT` | `/api/v1/agents/config` | Update agent configuration |
| `GET` | `/api/v1/agents/project-context` | Get project context information |
| `POST` | `/api/v1/agents/init` | Initialize agent definitions |
| `POST` | `/api/v1/agents/plan` | Generate test plan |
| `POST` | `/api/v1/agents/generate` | Generate test code |
| `POST` | `/api/v1/agents/heal` | Heal failing test |
| `POST` | `/api/v1/agents/apply-patch` | Apply a specific patch |
| `GET` | `/api/v1/agents/plans` | List test plans |
| `GET` | `/api/v1/agents/heal-history` | View heal history |

**POST /api/v1/agents/init**

Request body:
```json
{
  "loopTarget": "vscode"  // "vscode" | "claude" | "opencode"
}
```

**POST /api/v1/agents/plan**

Request body:
```json
{
  "description": "User login flow",
  "seedTest": "tests/example.spec.ts",  // optional
  "prdPath": "docs/prd.md",            // optional
  "outputDir": "specs/"                  // optional
}
```

**POST /api/v1/agents/generate**

Request body:
```json
{
  "planPath": "specs/user-login-flow.md",
  "outputDir": "tests/",                 // optional
  "seedTest": "tests/example.spec.ts"    // optional
}
```

**POST /api/v1/agents/heal**

Request body:
```json
{
  "testFilePath": "tests/login.spec.ts",
  "error": "Timeout waiting for selector",  // optional
  "stackTrace": "...",                       // optional
  "apply": false                             // optional, auto-apply patches
}
```

**POST /api/v1/agents/apply-patch**

Request body:
```json
{
  "filePath": "tests/login.spec.ts",
  "originalCode": "old code",
  "patchedCode": "new code",
  "confidence": 0.8,
  "reason": "Selector changed"
}
```

---

### LLM Configuration

#### `GET /api/v1/llm/config`

Get LLM configuration (sensitive information is masked).

**Response Example:**

```json
{
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-****xxxx"
}
```

#### `PUT /api/v1/llm/config`

Update LLM configuration.

**Request Body:**

```json
{
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-your-api-key"
}
```

**Response Example:**

```json
{
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-****xxxx"
}
```

> The apiKey in the response is masked.

#### `GET /api/v1/llm/status`

Get LLM service status.

**Response Example:**

```json
{
  "available": true,
  "model": "gpt-4",
  "latency": 250
}
```

#### `POST /api/v1/llm/test-connection`

Test LLM connection.

**Request Body (Optional):**

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-your-api-key"
}
```

**Response Example:**

```json
{
  "success": true,
  "latency": 250,
  "model": "gpt-4"
}
```

---

### Health Metrics

#### `GET /api/v1/health/metrics`

Get health metrics data for dashboard chart display.

**Response Example:**

```json
[
  {
    "date": "2024-05-14 10:30",
    "timestamp": 1715673600000,
    "runStatus": {
      "passed": 45,
      "failed": 3,
      "total": 50,
      "passRate": 90.0
    },
    "runDuration": 12345,
    "testSuiteSize": {
      "total": 50,
      "passed": 45,
      "failed": 3
    },
    "testFlakiness": {
      "flakyCount": 2,
      "flakyRate": 0.04,
      "totalRuns": 10
    },
    "tags": ["smoke"],
    "branch": "main"
  }
]
```

**Response Field Descriptions:**

| Field | Type | Description |
|------|------|------|
| `date` | `string` | Formatted date (`YYYY-MM-DD HH:mm`) |
| `timestamp` | `number` | Timestamp |
| `runStatus` | `object` | Run status statistics (passed/failed/total/passRate) |
| `runDuration` | `number` | Run duration (milliseconds) |
| `testSuiteSize` | `object` | Test suite size |
| `testFlakiness` | `object` | Flaky metrics (flakyCount/flakyRate/totalRuns) |
| `tags` | `string[]` | Tag list |
| `branch` | `string` | Branch name |

---

### Preferences

#### `GET /api/v1/preferences`

Get user preference configuration.

**Response Example:**

```json
{
  "testDir": "./tests",
  "autoQuarantine": true,
  "flakyCriteria": {
    "minRuns": 5,
    "failureRateThreshold": 0.3
  },
  "quarantineCriteria": {
    "minFailures": 3,
    "failureRateThreshold": 0.5
  }
}
```

#### `POST /api/v1/preferences`

Save user preference configuration.

**Request Body:**

```json
{
  "testDir": "./tests",
  "autoQuarantine": true,
  "flakyCriteria": {
    "minRuns": 5,
    "failureRateThreshold": 0.3
  },
  "quarantineCriteria": {
    "minFailures": 3,
    "failureRateThreshold": 0.5
  }
}
```

**Response Example:**

```json
{
  "testDir": "./tests",
  "autoQuarantine": true,
  "flakyCriteria": {
    "minRuns": 5,
    "failureRateThreshold": 0.3
  },
  "quarantineCriteria": {
    "minFailures": 3,
    "failureRateThreshold": 0.5
  }
}
```

> Saving flakyCriteria or quarantineCriteria will also update the FlakyTestManager's runtime configuration.

---

## WebSocket Events

DashboardServer pushes real-time events via WebSocket (path `/ws`). All messages are in JSON format, containing `type`, `payload`, `timestamp`, and `runId` fields.

### Message Format

```typescript
interface RealTimeMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  runId: string;
}
```

### Event List

#### `connected`

Triggered when client connects successfully.

```json
{
  "type": "connected",
  "payload": { "message": "Connected to YuanTest Realtime Reporter" },
  "timestamp": 1715673600000,
  "runId": ""
}
```

#### `run_started`

Triggered when a test run starts.

```json
{
  "type": "run_started",
  "payload": {
    "runId": "run-001",
    "version": "1.0.0",
    "startTime": 1715673600000
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `run_progress`

Triggered when run progress updates.

```json
{
  "type": "run_progress",
  "payload": {
    "runId": "run-001",
    "status": "running",
    "progress": 60.5,
    "totalTests": 50,
    "currentTest": "Login Function Test",
    "passed": 28,
    "failed": 2,
    "skipped": 0,
    "flakyTests": [],
    "startTime": 1715673600000,
    "estimatedTimeRemaining": 5000
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `run_completed`

Triggered when run completes.

```json
{
  "type": "run_completed",
  "payload": {
    "id": "run-001",
    "status": "completed",
    "totalTests": 50,
    "passed": 45,
    "failed": 3,
    "skipped": 2,
    "duration": 12345,
    "suites": []
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `test_result`

Single test result (batch mode is deprecated, use `test_result_batch` instead).

```json
{
  "type": "test_result",
  "payload": {
    "id": "test-id-1",
    "title": "Login Function Test",
    "status": "passed",
    "duration": 1234,
    "currentProgress": { "runId": "run-001", "status": "running", "progress": 50 }
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `test_result_batch`

Batch test result push. Test results are aggregated in batches (up to 10 items or 100ms interval) before being pushed.

```json
{
  "type": "test_result_batch",
  "payload": {
    "results": [
      {
        "id": "test-id-1",
        "title": "Login Function Test",
        "status": "passed",
        "duration": 1234
      },
      {
        "id": "test-id-2",
        "title": "Register Function Test",
        "status": "failed",
        "duration": 5678,
        "error": "AssertionError: expected true, got false"
      }
    ],
    "currentProgress": {
      "runId": "run-001",
      "status": "running",
      "progress": 50,
      "passed": 25,
      "failed": 2,
      "skipped": 0,
      "totalTests": 50
    }
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `suite_completed`

Triggered when a test suite completes.

```json
{
  "type": "suite_completed",
  "payload": {
    "suiteName": "Login Module",
    "timestamp": 1715673600000
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `flaky_detected`

Triggered when a flaky test is detected.

```json
{
  "type": "flaky_detected",
  "payload": {
    "testId": "test-id-1",
    "title": "Login Function Test",
    "failureRate": 0.5,
    "weightedFailureRate": 0.65,
    "classification": "timing",
    "rootCause": {
      "type": "race_condition",
      "description": "Test has race condition"
    },
    "timestamp": 1715673600000
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

**payload Field Descriptions:**

| Field | Type | Description |
|------|------|------|
| `testId` | `string` | Test ID |
| `title` | `string` | Test title |
| `failureRate` | `number` | Failure rate |
| `weightedFailureRate` | `number` | Weighted failure rate |
| `classification` | `FlakyClassification` | Flaky classification |
| `rootCause` | `RootCauseType` | Root cause analysis (optional) |
| `timestamp` | `number` | Detection timestamp |

#### `quarantine_updated`

Triggered when quarantine status changes.

```json
{
  "type": "quarantine_updated",
  "payload": {
    "testId": "test-id-1",
    "action": "validated_released",
    "validationResult": "passed"
  },
  "timestamp": 1715673600000,
  "runId": ""
}
```

#### `log`

Run log message.

```json
{
  "type": "log",
  "payload": {
    "message": "Running test: Login Function Test",
    "timestamp": 1715673600000,
    "logType": "info"
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

**logType Values:** `'stdout'`, `'stderr'`, `'info'`

#### `report_created`

Triggered when a test report is created.

```json
{
  "type": "report_created",
  "payload": {
    "id": "run-001",
    "version": "1.0.0",
    "status": "running",
    "totalTests": 0,
    "suites": []
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `report_updated`

Triggered when a test report is updated.

```json
{
  "type": "report_updated",
  "payload": {
    "runId": "run-001",
    "totalTests": 50,
    "passed": 45,
    "failed": 3,
    "skipped": 2,
    "status": "completed",
    "testResult": {
      "id": "test-id-1",
      "title": "Login Function Test",
      "status": "passed"
    }
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `error`

Triggered when a run error occurs.

```json
{
  "type": "error",
  "payload": {
    "error": "Execution failed: process exited with code 1"
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

---

## WebSocket Client Examples

### Native WebSocket

```typescript
const ws = new WebSocket('ws://localhost:5274/ws');

ws.onopen = () => {
  console.log('Connected to Dashboard realtime service');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'connected':
      console.log('Connection successful:', data.payload.message);
      break;
    case 'run_started':
      console.log(`Run started: ${data.payload.runId}`);
      break;
    case 'test_result_batch':
      console.log(`Batch results: ${data.payload.results.length} tests`);
      break;
    case 'run_completed':
      console.log('Run completed!');
      break;
    case 'flaky_detected':
      console.log(`Flaky detected: ${data.payload.title} (${data.payload.classification})`);
      break;
    case 'error':
      console.error('Error:', data.payload.error);
      break;
  }
};
```

### Using RealtimeReporterClient

```typescript
import { RealtimeReporterClient } from 'yuantest-playwright';

const client = new RealtimeReporterClient('ws://localhost:5274/ws');

client.on('connected', (payload) => {
  console.log('Connection successful:', payload.message);
});

client.on('run_started', (payload) => {
  console.log(`Run started: ${payload.runId}`);
});

client.on('run_completed', (payload) => {
  console.log(`Run completed: ${payload.id}`);
});

client.on('flaky_detected', (payload) => {
  console.log(`Flaky: ${payload.title}, classification: ${payload.classification}`);
});

await client.connect();

// Disconnect
client.disconnect();
```

---

## Type Definitions

```typescript
interface DashboardConfig {
  port: number;
  outputDir: string;
  dataDir: string;
  host: string;
  openBrowser: boolean;
}

interface DashboardStats {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  avgDuration: number;
  flakyTests: number;
  quarantinedTests: number;
  recentRuns: RunResult[];
}

interface RunProgress {
  runId: string;
  status: 'running' | 'completed' | 'cancelled';
  progress: number;
  totalTests: number;
  currentSuite?: string;
  currentTest?: string;
  passed: number;
  failed: number;
  skipped: number;
  flakyTests: string[];
  startTime: number;
  estimatedTimeRemaining?: number;
}

type RealTimeMessage =
  | { type: 'connected'; payload: { message: string }; timestamp: number; runId: string }
  | { type: 'run_started'; payload: { runId: string; version: string; startTime: number }; timestamp: number; runId: string }
  | { type: 'run_progress'; payload: RunProgress; timestamp: number; runId: string }
  | { type: 'run_completed'; payload: RunResult; timestamp: number; runId: string }
  | { type: 'test_result'; payload: TestResult & { currentProgress: RunProgress }; timestamp: number; runId: string }
  | { type: 'test_result_batch'; payload: { results: TestResult[]; currentProgress?: RunProgress }; timestamp: number; runId: string }
  | { type: 'suite_completed'; payload: { suiteName: string; timestamp: number }; timestamp: number; runId: string }
  | { type: 'error'; payload: { error: string }; timestamp: number; runId: string }
  | { type: 'flaky_detected'; payload: { testId: string; title: string; failureRate: number; weightedFailureRate: number; classification: FlakyClassification; rootCause?: RootCauseType; timestamp: number }; timestamp: number; runId: string }
  | { type: 'quarantine_updated'; payload: Record<string, unknown>; timestamp: number; runId: string }
  | { type: 'log'; payload: { message: string; timestamp: number; logType?: string }; timestamp: number; runId: string }
  | { type: 'report_created'; payload: RunResult; timestamp: number; runId: string }
  | { type: 'report_updated'; payload: { runId: string; totalTests?: number; passed?: number; failed?: number; skipped?: number; status?: string; testResult?: TestResult }; timestamp: number; runId: string };
```
