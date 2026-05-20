# DashboardServer API 参考文档

DashboardServer 提供 Web Dashboard 和 REST API 服务，用于管理测试运行、分析 Flaky 测试、AI 诊断等。

所有 API 路径均使用 `/api/v1/` 前缀。

---

## 构造函数

```typescript
new DashboardServer(config?: DashboardConfig)
```

### DashboardConfig 类型

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `port` | `number` | `5274` | 服务器监听端口 |
| `outputDir` | `string` | `'./test-reports'` | 测试报告输出目录 |
| `dataDir` | `string` | `'./test-data'` | 持久化数据存储目录 |
| `host` | `string` | `'localhost'` | 服务器监听地址 |
| `openBrowser` | `boolean` | `false` | 启动时是否自动打开浏览器 |

### 示例

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

## 实例方法

### `start(): Promise<void>`

启动 Dashboard 服务器。启动时会自动恢复用户偏好设置（testDir、autoQuarantine、flakyCriteria、quarantineCriteria）并加载自定义错误模式。

```typescript
await server.start();
```

### `stop(): Promise<void>`

停止 Dashboard 服务器，关闭 WebSocket 连接和 HTTP 服务。

```typescript
await server.stop();
```

### `getRealtimeReporter(): RealtimeReporter`

获取实时报告器实例，用于访问 WebSocket 广播方法。

```typescript
const reporter = server.getRealtimeReporter();
```

### `getFlakyManager(): FlakyTestManager`

获取 Flaky 测试管理器实例。

```typescript
const flakyManager = server.getFlakyManager();
```

### `getReporter(): Reporter`

获取报告生成器实例。

```typescript
const reporter = server.getReporter();
```

### `getExecutor(): Executor | null`

获取当前测试执行器实例，无运行中的执行器时返回 `null`。

```typescript
const executor = server.getExecutor();
```

---

## REST API 端点

### 健康检查

#### `GET /api/v1/health`

获取服务器健康状态。

**响应示例：**

```json
{
  "status": "ok",
  "uptime": 3600.123,
  "clients": 3,
  "isRunning": false,
  "timestamp": 1715673600000
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `status` | `string` | 服务状态，固定为 `'ok'` |
| `uptime` | `number` | 服务运行时长（秒） |
| `clients` | `number` | 当前 WebSocket 连接数 |
| `isRunning` | `boolean` | 是否有测试正在运行 |
| `timestamp` | `number` | 当前时间戳（毫秒） |

---

### 统计

#### `GET /api/v1/stats`

获取仪表盘整体统计数据。

**响应示例：**

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

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `totalRuns` | `number` | 总运行次数 |
| `totalTests` | `number` | 总测试数 |
| `passRate` | `number` | 通过率（百分比） |
| `avgDuration` | `number` | 平均运行时长（毫秒） |
| `flakyTests` | `number` | Flaky 测试数量 |
| `quarantinedTests` | `number` | 已隔离测试数量 |
| `recentRuns` | `RunResult[]` | 最近 10 次运行结果 |

---

### 运行管理

#### `GET /api/v1/runs`

获取运行列表，支持分页。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | `number` | `1` | 页码（最小 1） |
| `pageSize` | `number` | `20` | 每页数量（1-100） |

**响应示例：**

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

获取指定运行的详细信息。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 运行 ID |

**响应示例：**

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

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 运行不存在 |

#### `POST /api/v1/runs`

启动新的测试运行。

**请求体：**

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
  "describePattern": "登录模块",
  "grepPattern": "smoke",
  "tagFilter": ["@smoke"],
  "projectFilter": "chromium",
  "updateSnapshots": false
}
```

**请求字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `string` | 版本号，默认 `'1.0.0'` |
| `testDir` | `string` | 测试目录路径 |
| `baseURL` | `string` | 测试基础 URL |
| `retries` | `number` | 重试次数，默认 `0` |
| `timeout` | `number` | 超时时间（毫秒），默认 `30000` |
| `workers` | `number` | 并行工作进程数，默认 `1` |
| `shards` | `number` | 分片数，默认 `1` |
| `browsers` | `string[]` | 浏览器列表，默认 `['chromium']` |
| `testFiles` | `string[]` | 指定测试文件列表 |
| `testLocations` | `string[]` | 指定测试位置列表（格式：`file:line`） |
| `testIds` | `string[]` | 指定测试 ID 列表 |
| `describePattern` | `string` | describe 块匹配模式 |
| `grepPattern` | `string` | 测试名称 grep 匹配模式 |
| `tagFilter` | `string[]` | 标签过滤 |
| `projectFilter` | `string` | 项目过滤 |
| `updateSnapshots` | `boolean` | 是否更新快照 |

**响应示例：**

```json
{
  "status": "started",
  "message": "Test execution initiated"
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `409` | 已有执行正在运行 |
| `400` | 无效的 testDir 路径 |

#### `DELETE /api/v1/runs/:id`

取消/删除指定运行。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 运行 ID |

**响应示例：**

```json
{
  "success": true,
  "message": "Report run-20240514-001 deleted"
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 运行不存在或无法删除 |

#### `POST /api/v1/runs/:runId/tests/:testId/rerun`

重跑单个测试。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | `string` | 运行 ID |
| `testId` | `string` | 测试 ID |

**请求体：**

```json
{
  "testLocation": "tests/example.spec.ts:10"
}
```

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `testLocation` | `string` | 是 | 测试位置（格式：`file:line`） |

**响应示例：**

```json
{
  "status": "started",
  "message": "Test rerun initiated"
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `400` | 缺少 testLocation |
| `404` | 运行或测试不存在 |
| `409` | 已有执行正在运行 |

#### `POST /api/v1/runs/:runId/batch-rerun`

批量重跑多个测试。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `runId` | `string` | 运行 ID |

**请求体：**

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

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tests` | `Array<{testId: string, testLocation: string}>` | 是 | 测试列表，每项须包含 testId 和 testLocation |

**响应示例：**

```json
{
  "status": "started",
  "message": "Batch rerun initiated",
  "count": 2
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `400` | tests 数组为空或缺少必填字段 |
| `404` | 运行不存在 |
| `409` | 已有执行正在运行 |

---

### 测试

#### `GET /api/v1/tests/:testId/history`

获取指定测试的历史运行记录。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | `number` | `1` | 页码 |
| `pageSize` | `number` | `10` | 每页数量（1-100） |

**响应示例：**

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

### Flaky 管理

#### `GET /api/v1/flaky`

获取 Flaky 测试列表。

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `threshold` | `number` | `0.3` | 失败率阈值（0-1） |

**响应示例：**

```json
[
  {
    "testId": "test-id-1",
    "title": "登录功能测试",
    "failureRate": 0.4,
    "isQuarantined": false
  }
]
```

#### `GET /api/v1/flaky/stats`

获取 Flaky 测试统计信息。

**响应示例：**

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

获取所有 Flaky 测试的趋势分析。

**响应示例：**

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

获取 Flaky 测试整体健康评分。

**响应示例：**

```json
{
  "score": 75,
  "level": "good",
  "details": {}
}
```

#### `GET /api/v1/flaky/prediction/:testId`

获取指定测试的失败预测结果。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

**响应示例：**

```json
{
  "testId": "test-id-1",
  "failureProbability": 0.65,
  "factors": []
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 测试不存在或无预测数据 |

#### `GET /api/v1/flaky/duration-anomalies`

获取持续时间异常的测试列表。

**响应示例：**

```json
[
  {
    "testId": "test-id-1",
    "title": "慢速测试",
    "medianDuration": 5000,
    "anomalousDuration": 30000,
    "deviation": 6.0
  }
]
```

---

### 隔离

#### `POST /api/v1/quarantine/:testId`

隔离指定测试。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

**响应示例：**

```json
{
  "success": true,
  "testId": "test-id-1"
}
```

#### `DELETE /api/v1/quarantine/:testId`

释放指定隔离测试。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

**请求体（可选）：**

```json
{
  "resetHistory": true
}
```

**请求字段说明：**

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `resetHistory` | `boolean` | `false` | 是否同时重置历史记录 |

**响应示例：**

```json
{
  "success": true,
  "testId": "test-id-1"
}
```

---

### 因果图

#### `GET /api/v1/causal-graph`

获取因果图数据。

**响应示例：**

```json
{
  "nodes": [],
  "edges": [],
  "rootCauses": [],
  "impactMap": {},
  "builtAt": 1715673600000
}
```

**响应字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `nodes` | `GraphNode[]` | 因果图节点列表 |
| `edges` | `GraphEdge[]` | 因果图边列表 |
| `rootCauses` | `RootCause[]` | 根因列表 |
| `impactMap` | `Record<string, unknown>` | 影响映射 |
| `builtAt` | `number` | 因果图构建时间戳 |

#### `GET /api/v1/impact-analysis/:testId`

获取指定测试的影响分析。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |

**响应示例：**

```json
{
  "testId": "test-id-1",
  "directImpact": 3,
  "indirectImpact": 7,
  "affectedTests": []
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 测试不存在或无因果图数据 |

---

### AI 诊断

#### `POST /api/v1/diagnosis`

对单个测试失败进行 AI 诊断。

**请求体：**

```json
{
  "testTitle": "登录功能测试",
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

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `testTitle` | `string` | 否 | 测试标题 |
| `error` | `string` | 否 | 错误信息 |
| `stackTrace` | `string` | 否 | 堆栈跟踪 |
| `file` | `string` | 否 | 测试文件路径 |
| `line` | `number` | 否 | 测试行号 |
| `lang` | `string` | 否 | 诊断语言（`'zh'` 或 `'en'`），默认 `'zh'` |
| `screenshots` | `string[]` | 否 | 截图路径列表 |
| `logs` | `string[]` | 否 | 日志列表 |
| `browser` | `string` | 否 | 浏览器名称 |
| `runId` | `string` | 否 | 运行 ID（用于补充历史上下文） |
| `testId` | `string` | 否 | 测试 ID（用于获取根因分析） |

**响应示例：**

```json
{
  "enabled": true,
  "diagnosis": {
    "rootCause": "页面加载超时，可能是网络延迟或服务端响应慢",
    "suggestions": [
      "增加导航超时时间",
      "检查网络连接状态",
      "验证服务端是否正常运行"
    ],
    "category": "timeout",
    "confidence": 0.85
  }
}
```

**LLM 未启用时的响应：**

```json
{
  "enabled": false,
  "diagnosis": null
}
```

#### `POST /api/v1/diagnosis/stream`

流式 AI 诊断，使用 Server-Sent Events (SSE) 返回诊断结果。

**请求体：** 与 `POST /api/v1/diagnosis` 相同。

**响应：**

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

**SSE 数据格式：**

```
data: {"content":"根据错误信息分析..."}

data: {"content":"可能的根因是..."}

data: {"type":"error","error":"Connection timeout"}
```

#### `GET /api/v1/diagnosis/persisted`

获取已保存的诊断结果。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `runId` | `string` | 是 | 运行 ID |
| `testId` | `string` | 是 | 测试 ID |

**响应示例：**

```json
{
  "found": true,
  "diagnosis": {
    "rootCause": "页面加载超时",
    "suggestions": ["增加超时时间"],
    "category": "timeout",
    "confidence": 0.85
  }
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `400` | 缺少 runId 或 testId |

#### `POST /api/v1/diagnosis/cluster`

批量聚类诊断，基于错误相似度进行聚类后对每个聚类的代表测试执行 AI 诊断。

**请求体：**

```json
{
  "testResults": [
    {
      "id": "test-id-1",
      "title": "登录测试",
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
      "title": "注册测试",
      "error": "TimeoutError: Waiting for selector timed out",
      "stackTrace": "...",
      "file": "tests/register.spec.ts",
      "line": 20
    }
  ],
  "lang": "zh"
}
```

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `testResults` | `Array` | 是 | 测试结果数组 |
| `lang` | `string` | 否 | 诊断语言，默认 `'zh'` |

**响应示例：**

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
        "rootCause": "页面加载超时",
        "suggestions": ["增加超时时间"],
        "category": "timeout",
        "confidence": 0.85,
        "relatedFailures": ["test-id-2"]
      }
    }
  ]
}
```

**LLM 未启用时的响应：**

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

### 错误模式

#### `GET /api/v1/error-patterns`

获取所有错误模式列表（含内置和自定义）。

**响应示例：**

```json
[
  {
    "id": "timeout-navigation",
    "category": "timeout",
    "name": "导航超时",
    "description": "页面导航超时",
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

添加自定义错误模式。

**请求体：**

```json
{
  "id": "custom-db-connection",
  "category": "network",
  "name": "数据库连接失败",
  "description": "数据库连接超时或拒绝",
  "regex": ["ECONNREFUSED.*3306", "database\\s+connection\\s+failed"],
  "rootCauseTemplate": { "zh": "数据库服务不可达", "en": "Database service unreachable" },
  "suggestionsTemplate": {
    "zh": ["检查数据库服务状态", "验证连接配置"],
    "en": ["Check database service", "Verify connection config"]
  },
  "docLinks": [
    { "title": "数据库连接文档", "url": "https://example.com/docs" }
  ]
}
```

**必填字段：** `id`、`category`、`name`、`regex`、`rootCauseTemplate`、`suggestionsTemplate`

**响应示例：**

```json
{
  "success": true,
  "id": "custom-db-connection"
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `400` | 缺少必填字段 |

#### `DELETE /api/v1/error-patterns/:id`

删除自定义错误模式。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 错误模式 ID |

**响应示例：**

```json
{
  "success": true
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 错误模式不存在 |

---

### Agent 代理管理

#### Agent API 端点

| 方法 | 端点 | 说明 |
|------|------|------|
| `GET` | `/api/v1/agents/config` | 获取代理配置 |
| `PUT` | `/api/v1/agents/config` | 更新代理配置 |
| `GET` | `/api/v1/agents/project-context` | 获取项目上下文信息 |
| `POST` | `/api/v1/agents/init` | 初始化代理定义 |
| `POST` | `/api/v1/agents/plan` | 生成测试计划 |
| `POST` | `/api/v1/agents/generate` | 生成测试代码 |
| `POST` | `/api/v1/agents/heal` | 修复失败测试 |
| `POST` | `/api/v1/agents/apply-patch` | 应用指定补丁 |
| `GET` | `/api/v1/agents/plans` | 列出测试计划 |
| `GET` | `/api/v1/agents/heal-history` | 查看修复历史 |

**POST /api/v1/agents/init**

请求体：
```json
{
  "loopTarget": "vscode"  // "vscode" | "claude" | "opencode"
}
```

**POST /api/v1/agents/plan**

请求体：
```json
{
  "description": "用户登录流程",
  "seedTest": "tests/example.spec.ts",  // 可选
  "prdPath": "docs/prd.md",            // 可选
  "outputDir": "specs/"                  // 可选
}
```

**POST /api/v1/agents/generate**

请求体：
```json
{
  "planPath": "specs/user-login-flow.md",
  "outputDir": "tests/",                 // 可选
  "seedTest": "tests/example.spec.ts"    // 可选
}
```

**POST /api/v1/agents/heal**

请求体：
```json
{
  "testFilePath": "tests/login.spec.ts",
  "error": "等待选择器超时",  // 可选
  "stackTrace": "...",        // 可选
  "apply": false              // 可选，自动应用补丁
}
```

**POST /api/v1/agents/apply-patch**

请求体：
```json
{
  "filePath": "tests/login.spec.ts",
  "originalCode": "旧代码",
  "patchedCode": "新代码",
  "confidence": 0.8,
  "reason": "选择器变更"
}
```

---

### LLM 配置

#### `GET /api/v1/llm/config`

获取 LLM 配置（敏感信息已脱敏）。

**响应示例：**

```json
{
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-****xxxx"
}
```

#### `PUT /api/v1/llm/config`

更新 LLM 配置。

**请求体：**

```json
{
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-your-api-key"
}
```

**响应示例：**

```json
{
  "enabled": true,
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-****xxxx"
}
```

> 响应中 apiKey 已脱敏处理。

#### `GET /api/v1/llm/status`

获取 LLM 服务状态。

**响应示例：**

```json
{
  "available": true,
  "model": "gpt-4",
  "latency": 250
}
```

#### `POST /api/v1/llm/test-connection`

测试 LLM 连接。

**请求体（可选）：**

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "model": "gpt-4",
  "apiKey": "sk-your-api-key"
}
```

**响应示例：**

```json
{
  "success": true,
  "latency": 250,
  "model": "gpt-4"
}
```

---

### 健康指标

#### `GET /api/v1/health/metrics`

获取健康指标数据，用于仪表盘图表展示。

**响应示例：**

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

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | `string` | 格式化日期（`YYYY-MM-DD HH:mm`） |
| `timestamp` | `number` | 时间戳 |
| `runStatus` | `object` | 运行状态统计（passed/failed/total/passRate） |
| `runDuration` | `number` | 运行时长（毫秒） |
| `testSuiteSize` | `object` | 测试套件规模 |
| `testFlakiness` | `object` | Flaky 指标（flakyCount/flakyRate/totalRuns） |
| `tags` | `string[]` | 标签列表 |
| `branch` | `string` | 分支名称 |

---

### 偏好配置

#### `GET /api/v1/preferences`

获取用户偏好配置。

**响应示例：**

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

保存用户偏好配置。

**请求体：**

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

**响应示例：**

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

> 保存 flakyCriteria 或 quarantineCriteria 时会同步更新 FlakyTestManager 的运行时配置。

---

## WebSocket 事件

DashboardServer 通过 WebSocket（路径 `/ws`）推送实时事件。所有消息均为 JSON 格式，包含 `type`、`payload`、`timestamp`、`runId` 字段。

### 消息格式

```typescript
interface RealTimeMessage {
  type: string;
  payload: unknown;
  timestamp: number;
  runId: string;
}
```

### 事件列表

#### `connected`

客户端连接成功时触发。

```json
{
  "type": "connected",
  "payload": { "message": "Connected to YuanTest Realtime Reporter" },
  "timestamp": 1715673600000,
  "runId": ""
}
```

#### `run_started`

测试运行开始时触发。

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

运行进度更新时触发。

```json
{
  "type": "run_progress",
  "payload": {
    "runId": "run-001",
    "status": "running",
    "progress": 60.5,
    "totalTests": 50,
    "currentTest": "登录功能测试",
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

运行完成时触发。

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

单个测试结果（已弃用批量模式，实际使用 `test_result_batch`）。

```json
{
  "type": "test_result",
  "payload": {
    "id": "test-id-1",
    "title": "登录功能测试",
    "status": "passed",
    "duration": 1234,
    "currentProgress": { "runId": "run-001", "status": "running", "progress": 50 }
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `test_result_batch`

批量测试结果推送。测试结果会按批次（最多 10 个或 100ms 间隔）聚合后推送。

```json
{
  "type": "test_result_batch",
  "payload": {
    "results": [
      {
        "id": "test-id-1",
        "title": "登录功能测试",
        "status": "passed",
        "duration": 1234
      },
      {
        "id": "test-id-2",
        "title": "注册功能测试",
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

测试套件完成时触发。

```json
{
  "type": "suite_completed",
  "payload": {
    "suiteName": "登录模块",
    "timestamp": 1715673600000
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `flaky_detected`

检测到 Flaky 测试时触发。

```json
{
  "type": "flaky_detected",
  "payload": {
    "testId": "test-id-1",
    "title": "登录功能测试",
    "failureRate": 0.5,
    "weightedFailureRate": 0.65,
    "classification": "timing",
    "rootCause": {
      "type": "race_condition",
      "description": "测试存在竞态条件"
    },
    "timestamp": 1715673600000
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

**payload 字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `testId` | `string` | 测试 ID |
| `title` | `string` | 测试标题 |
| `failureRate` | `number` | 失败率 |
| `weightedFailureRate` | `number` | 加权失败率 |
| `classification` | `FlakyClassification` | Flaky 分类 |
| `rootCause` | `RootCauseType` | 根因分析（可选） |
| `timestamp` | `number` | 检测时间戳 |

#### `quarantine_updated`

隔离状态变更时触发。

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

运行日志消息。

```json
{
  "type": "log",
  "payload": {
    "message": "Running test: 登录功能测试",
    "timestamp": 1715673600000,
    "logType": "info"
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

**logType 可选值：** `'stdout'`、`'stderr'`、`'info'`

#### `report_created`

测试报告创建时触发。

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

测试报告更新时触发。

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
      "title": "登录功能测试",
      "status": "passed"
    }
  },
  "timestamp": 1715673600000,
  "runId": "run-001"
}
```

#### `error`

运行错误时触发。

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

## WebSocket 客户端示例

### 原生 WebSocket

```typescript
const ws = new WebSocket('ws://localhost:5274/ws');

ws.onopen = () => {
  console.log('已连接到 Dashboard 实时服务');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'connected':
      console.log('连接成功:', data.payload.message);
      break;
    case 'run_started':
      console.log(`运行开始: ${data.payload.runId}`);
      break;
    case 'test_result_batch':
      console.log(`批量结果: ${data.payload.results.length} 个测试`);
      break;
    case 'run_completed':
      console.log('运行完成!');
      break;
    case 'flaky_detected':
      console.log(`Flaky 检测: ${data.payload.title} (${data.payload.classification})`);
      break;
    case 'error':
      console.error('错误:', data.payload.error);
      break;
  }
};
```

### 使用 RealtimeReporterClient

```typescript
import { RealtimeReporterClient } from 'yuantest-playwright';

const client = new RealtimeReporterClient('ws://localhost:5274/ws');

client.on('connected', (payload) => {
  console.log('连接成功:', payload.message);
});

client.on('run_started', (payload) => {
  console.log(`运行开始: ${payload.runId}`);
});

client.on('run_completed', (payload) => {
  console.log(`运行完成: ${payload.id}`);
});

client.on('flaky_detected', (payload) => {
  console.log(`Flaky: ${payload.title}, 分类: ${payload.classification}`);
});

await client.connect();

// 断开连接
client.disconnect();
```

---

## 类型定义

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
