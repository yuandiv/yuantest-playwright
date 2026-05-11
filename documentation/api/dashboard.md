# DashboardServer API

DashboardServer 提供 Web Dashboard 和 REST API 服务。

## 构造函数

```typescript
const server = new DashboardServer(
  port: number,
  outputDir: string,
  dataDir: string
);
```

## 方法

### start()

启动服务器。

```typescript
await server.start(): Promise<void>
```

### stop()

停止服务器。

```typescript
await server.stop(): Promise<void>
```

### getPort()

获取服务器端口。

```typescript
const port = server.getPort(): number
```

### getUrl()

获取服务器 URL。

```typescript
const url = server.getUrl(): string
```

## REST API

### 健康检查

```
GET /api/health
```

响应：
```json
{
  "status": "ok",
  "uptime": 3600
}
```

### 整体统计

```
GET /api/stats
```

响应：
```json
{
  "totalRuns": 100,
  "totalTests": 5000,
  "passRate": 0.95,
  "flakyCount": 10
}
```

### 运行列表

```
GET /api/runs
```

查询参数：
- `limit`: 返回数量
- `offset`: 偏移量
- `status`: 状态过滤

### 运行详情

```
GET /api/runs/:id
```

### Flaky 测试列表

```
GET /api/flaky
```

查询参数：
- `threshold`: 失败率阈值

### 已隔离测试

```
GET /api/flaky/quarantined
```

### 隔离测试

```
POST /api/flaky/:id/quarantine
```

### 释放测试

```
POST /api/flaky/:id/release
```

### Flaky 统计

```
GET /api/flaky/stats
```

### 失败分析

```
GET /api/analysis/:runId
```

### 实时进度

```
GET /api/progress
```

## WebSocket 事件

DashboardServer 通过 WebSocket 推送实时事件：

| 事件 | 数据 | 说明 |
|------|------|------|
| `run_started` | `{ runId }` | 运行开始 |
| `test_result` | `TestResult` | 测试结果 |
| `run_progress` | `ProgressInfo` | 运行进度 |
| `run_completed` | `RunResult` | 运行完成 |

## 示例

### 基本使用

```typescript
import { DashboardServer } from 'yuantest-playwright';

const server = new DashboardServer(5274, './reports', './test-data');

await server.start();
console.log(`Dashboard running at ${server.getUrl()}`);

// 程序退出时停止
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});
```

### 自定义端口

```typescript
const server = new DashboardServer(8080, './reports', './test-data');
await server.start();
console.log(`Dashboard running at http://localhost:8080`);
```

### WebSocket 客户端

```typescript
const ws = new WebSocket('ws://localhost:5274/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'run_started':
      console.log(`Run started: ${data.runId}`);
      break;
    case 'test_result':
      console.log(`[${data.status}] ${data.title}`);
      break;
    case 'run_completed':
      console.log('Run completed!');
      break;
  }
};
```

## 类型定义

```typescript
interface DashboardConfig {
  port: number;
  outputDir: string;
  dataDir: string;
  open?: boolean;
  cors?: boolean;
}

interface HealthResponse {
  status: 'ok' | 'error';
  uptime: number;
  version: string;
}

interface StatsResponse {
  totalRuns: number;
  totalTests: number;
  passRate: number;
  flakyCount: number;
  quarantinedCount: number;
  averageDuration: number;
}
```
