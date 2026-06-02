# ChatService API 参考文档

ChatService 提供 AI 对话、MCP（Model Context Protocol）工具集成和会话管理功能，支持流式消息响应和工具调用。

所有 API 路径均使用 `/api/v1/` 前缀。

---

## ChatService 类

### 构造函数

```typescript
new ChatService(dataDir: string, projectRoot: string, toolRegistry: ToolRegistry, llmConfig?: LLMConfig, sharedLLMService?: LLMService, mcpConfigService?: MCPConfigService)
```

#### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `dataDir` | `string` | 是 | 持久化数据存储目录 |
| `projectRoot` | `string` | 是 | 项目根目录路径 |
| `toolRegistry` | `ToolRegistry` | 是 | 工具注册表实例 |
| `llmConfig` | `LLMConfig` | 否 | LLM 配置 |
| `sharedLLMService` | `LLMService` | 否 | 共享 LLM 服务实例 |
| `mcpConfigService` | `MCPConfigService` | 否 | MCP 配置服务实例 |

#### 示例

```typescript
import { ChatService } from 'yuantest-playwright';

const chatService = new ChatService(
  './chat-data',
  '/project/root',
  toolRegistry,
  llmConfig,
  sharedLLMService,
  mcpConfigService
);
```

---

### 实例方法

#### `updateLLMConfig(config: LLMConfig): void`

更新 LLM 配置，运行时动态切换模型或 API 参数。

```typescript
chatService.updateLLMConfig({
  enabled: true,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4',
  apiKey: 'sk-your-api-key'
});
```

#### `setProjectRoot(root: string): Promise<void>`

设置项目根目录，会同步更新 MCP 客户端的项目路径。

```typescript
await chatService.setProjectRoot('/new/project/root');
```

#### `initMCP(): Promise<void>`

初始化 MCP 连接，根据已启用的 MCP 配置建立服务连接。

```typescript
await chatService.initMCP();
```

#### `reconnectMCP(): Promise<void>`

重新连接所有 MCP 服务，用于连接断开或配置变更后的恢复。

```typescript
await chatService.reconnectMCP();
```

#### `createConversation(title?: string): Conversation`

创建新的对话，可指定标题。返回完整的对话对象。

```typescript
const conversation = chatService.createConversation('测试对话');
```

#### `getConversation(id: string): Conversation | null`

根据 ID 获取对话，不存在时返回 `null`。

```typescript
const conversation = chatService.getConversation('conv-001');
```

#### `listConversations(): ConversationSummary[]`

列出所有对话的摘要信息。

```typescript
const summaries = chatService.listConversations();
```

#### `deleteConversation(id: string): boolean`

删除指定对话，成功返回 `true`，对话不存在返回 `false`。

```typescript
const success = chatService.deleteConversation('conv-001');
```

#### `getMCPStatus(): MCPConnectionStatus`

获取 MCP 连接状态，包含各服务器的连接情况和工具数量。

```typescript
const status = chatService.getMCPStatus();
```

#### `getAllTools(): { name: string; description: string; source: 'builtin' | 'mcp' }[]`

获取所有可用工具列表，包含内置工具和 MCP 工具。

```typescript
const tools = chatService.getAllTools();
```

#### `sendMessage(conversationId: string, userMessage: string, onEvent: (event: SSEEvent) => void): Promise<void>`

向指定对话发送消息，通过 SSE 事件回调接收流式响应。支持工具调用和工具结果的流式返回。

```typescript
await chatService.sendMessage(
  'conv-001',
  '请帮我分析这个测试失败的原因',
  (event) => {
    switch (event.type) {
      case 'token':
        process.stdout.write(event.data as string);
        break;
      case 'tool_call':
        console.log('调用工具:', event.data);
        break;
      case 'tool_result':
        console.log('工具结果:', event.data);
        break;
      case 'done':
        console.log('\n对话完成');
        break;
      case 'error':
        console.error('错误:', event.data);
        break;
    }
  }
);
```

---

## ConversationStore 类

对话持久化存储管理器，负责对话的创建、查询、更新和删除。

### 实例方法

#### `create(title?: string): Conversation`

创建新对话并持久化存储。

```typescript
const conversation = conversationStore.create('新对话');
```

#### `get(id: string): Conversation | null`

根据 ID 获取完整对话对象，不存在时返回 `null`。

```typescript
const conversation = conversationStore.get('conv-001');
```

#### `list(): ConversationSummary[]`

列出所有对话的摘要信息列表。

```typescript
const summaries = conversationStore.list();
```

#### `save(conversation: Conversation): void`

保存对话对象，更新持久化存储。

```typescript
conversationStore.save(conversation);
```

#### `delete(id: string): boolean`

删除指定对话，成功返回 `true`，不存在返回 `false`。

```typescript
const success = conversationStore.delete('conv-001');
```

#### `addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage`

向指定对话添加消息，自动生成 ID 和时间戳，返回完整的消息对象。

```typescript
const message = conversationStore.addMessage('conv-001', {
  role: 'user',
  content: '你好'
});
```

#### `updateTitle(conversationId: string, title: string): boolean`

更新对话标题，成功返回 `true`，对话不存在返回 `false`。

```typescript
const success = conversationStore.updateTitle('conv-001', '更新后的标题');
```

---

## MCPClientManager 类

MCP 客户端管理器，负责 MCP 服务器的连接、断开、工具调用和状态管理。

### 实例方法

#### `findPlaywrightConfig(projectRoot?: string): string | null`

查找项目中的 Playwright 配置文件路径，未找到返回 `null`。

```typescript
const configPath = mcpClientManager.findPlaywrightConfig('/project/root');
```

#### `setProjectRoot(newRoot: string): Promise<void>`

设置新的项目根目录，会断开当前 MCP 连接并重新连接。

```typescript
await mcpClientManager.setProjectRoot('/new/project/root');
```

#### `connectFromConfig(config: MCPConfig): Promise<boolean>`

根据单个 MCP 配置连接服务器，成功返回 `true`。

```typescript
const connected = await mcpClientManager.connectFromConfig({
  id: 'mcp-1',
  name: 'Playwright MCP',
  enabled: true,
  command: 'npx',
  args: ['@playwright/mcp@latest'],
  createdAt: Date.now(),
  updatedAt: Date.now()
});
```

#### `connectFromConfigs(configs: MCPConfig[]): Promise<void>`

根据多个 MCP 配置批量连接服务器。

```typescript
await mcpClientManager.connectFromConfigs([config1, config2]);
```

#### `disconnectServer(id: string): Promise<void>`

断开指定 MCP 服务器连接。

```typescript
await mcpClientManager.disconnectServer('mcp-1');
```

#### `disconnect(): Promise<void>`

断开所有 MCP 服务器连接。

```typescript
await mcpClientManager.disconnect();
```

#### `connect(): Promise<boolean>`

连接所有已启用的 MCP 服务器，至少一个连接成功返回 `true`。

```typescript
const connected = await mcpClientManager.connect();
```

#### `listTools(): MCPToolInfo[]`

列出所有已连接 MCP 服务器提供的工具信息。

```typescript
const tools = mcpClientManager.listTools();
```

#### `getToolSchemas(): ToolSchema[]`

获取所有 MCP 工具的 JSON Schema 定义，用于 LLM 函数调用。

```typescript
const schemas = mcpClientManager.getToolSchemas();
```

#### `callTool(toolName: string, args: Record<string, unknown>): Promise<string>`

调用指定 MCP 工具，返回工具执行结果字符串。

```typescript
const result = await mcpClientManager.callTool('browser_navigate', {
  url: 'https://example.com'
});
```

#### `isAvailable(): boolean`

检查 MCP 服务是否可用（至少有一个服务器已连接）。

```typescript
const available = mcpClientManager.isAvailable();
```

#### `getStatus(): MCPConnectionStatus`

获取 MCP 连接状态详情。

```typescript
const status = mcpClientManager.getStatus();
```

#### `getProjectRoot(): string`

获取当前项目根目录路径。

```typescript
const root = mcpClientManager.getProjectRoot();
```

---

## MCPConfigService 类

MCP 配置管理服务，负责 MCP 服务器配置的增删改查和预设管理。

### 静态方法

#### `static getBuiltinPresets(): MCPPreset[]`

获取内置 MCP 预设列表。

```typescript
const presets = MCPConfigService.getBuiltinPresets();
```

### 实例方法

#### `getConfigs(): MCPConfig[]`

获取所有 MCP 配置列表。

```typescript
const configs = mcpConfigService.getConfigs();
```

#### `getConfig(id: string): MCPConfig | null`

根据 ID 获取 MCP 配置，不存在时返回 `null`。

```typescript
const config = mcpConfigService.getConfig('mcp-1');
```

#### `updateConfig(id: string, updates: Partial<MCPConfig>): MCPConfig | null`

更新指定 MCP 配置，返回更新后的配置对象，不存在时返回 `null`。

```typescript
const updated = mcpConfigService.updateConfig('mcp-1', {
  enabled: true,
  args: ['@playwright/mcp@latest', '--headless']
});
```

#### `deleteConfig(id: string): boolean`

删除指定 MCP 配置，成功返回 `true`，不存在返回 `false`。

```typescript
const success = mcpConfigService.deleteConfig('mcp-1');
```

#### `saveConfigsFromJson(mcpServers: Record<string, unknown>): MCPConfig[]`

从 JSON 对象批量导入 MCP 配置，常用于解析 `mcpServers` 格式的配置文件。

```typescript
const configs = mcpConfigService.saveConfigsFromJson({
  playwright: {
    command: 'npx',
    args: ['@playwright/mcp@latest']
  },
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir']
  }
});
```

#### `getEnabledConfigs(): MCPConfig[]`

获取所有已启用的 MCP 配置列表。

```typescript
const enabledConfigs = mcpConfigService.getEnabledConfigs();
```

---

## REST API 端点

### 对话管理

#### `GET /api/v1/chat/conversations`

列出所有对话摘要。

**响应示例：**

```json
[
  {
    "id": "conv-001",
    "title": "测试对话",
    "messageCount": 5,
    "createdAt": 1715673600000,
    "updatedAt": 1715673700000
  },
  {
    "id": "conv-002",
    "title": "调试对话",
    "messageCount": 12,
    "createdAt": 1715673800000,
    "updatedAt": 1715673900000
  }
]
```

#### `POST /api/v1/chat/conversations`

创建新对话。

**请求体：**

```json
{
  "title": "新对话"
}
```

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 否 | 对话标题 |

**响应示例：**

```json
{
  "id": "conv-003",
  "title": "新对话",
  "messages": [],
  "createdAt": 1715674000000,
  "updatedAt": 1715674000000
}
```

#### `GET /api/v1/chat/conversations/:id`

获取指定对话的完整信息。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 对话 ID |

**响应示例：**

```json
{
  "id": "conv-001",
  "title": "测试对话",
  "messages": [
    {
      "id": "msg-001",
      "role": "user",
      "content": "请帮我分析这个测试失败的原因",
      "timestamp": 1715673600000
    },
    {
      "id": "msg-002",
      "role": "assistant",
      "content": "根据错误信息分析，测试失败的原因可能是...",
      "timestamp": 1715673601000
    }
  ],
  "createdAt": 1715673600000,
  "updatedAt": 1715673700000
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 对话不存在 |

#### `DELETE /api/v1/chat/conversations/:id`

删除指定对话。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 对话 ID |

**响应示例：**

```json
{
  "success": true
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 对话不存在 |

---

### 消息发送

#### `POST /api/v1/chat/conversations/:id/messages`

向指定对话发送消息，使用 Server-Sent Events (SSE) 流式返回响应。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 对话 ID |

**请求体：**

```json
{
  "message": "请帮我分析这个测试失败的原因"
}
```

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 用户消息内容 |

**响应：**

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

**SSE 事件格式：**

```
data: {"type":"token","data":"根据"}

data: {"type":"token","data":"错误信息"}

data: {"type":"tool_call","data":{"name":"browser_navigate","arguments":"{\"url\":\"https://example.com\"}"}}

data: {"type":"tool_result","data":{"toolCallId":"call-001","name":"browser_navigate","success":true}}

data: {"type":"done","data":null}

data: {"type":"error","data":"Connection timeout"}
```

**SSE 事件类型说明：**

| 事件类型 | 说明 |
|----------|------|
| `token` | 流式文本令牌 |
| `tool_call` | 工具调用事件 |
| `tool_result` | 工具执行结果 |
| `done` | 对话完成 |
| `error` | 错误事件 |

---

### MCP 状态

#### `GET /api/v1/chat/mcp-status`

获取 MCP 连接状态。

**响应示例：**

```json
{
  "servers": [
    {
      "id": "mcp-1",
      "name": "Playwright MCP",
      "connected": true,
      "toolCount": 5
    },
    {
      "id": "mcp-2",
      "name": "Filesystem MCP",
      "connected": false,
      "toolCount": 0,
      "error": "Connection refused"
    }
  ],
  "totalTools": 5,
  "connectedCount": 1,
  "totalCount": 2
}
```

#### `POST /api/v1/chat/mcp-reconnect`

重新连接所有 MCP 服务。

**响应示例：**

```json
{
  "success": true
}
```

---

### 工具列表

#### `GET /api/v1/chat/tools`

获取所有可用工具列表（包含内置工具和 MCP 工具）。

**响应示例：**

```json
[
  {
    "name": "browser_navigate",
    "description": "导航到指定 URL",
    "source": "mcp"
  },
  {
    "name": "browser_click",
    "description": "点击页面元素",
    "source": "mcp"
  },
  {
    "name": "read_file",
    "description": "读取文件内容",
    "source": "builtin"
  }
]
```

**响应字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 工具名称 |
| `description` | `string` | 工具描述 |
| `source` | `'builtin' \| 'mcp'` | 工具来源，`builtin` 为内置工具，`mcp` 为 MCP 工具 |

---

### MCP 配置管理

#### `GET /api/v1/chat/mcp-configs`

获取所有 MCP 配置列表。

**响应示例：**

```json
[
  {
    "id": "mcp-1",
    "name": "Playwright MCP",
    "enabled": true,
    "command": "npx",
    "args": ["@playwright/mcp@latest"],
    "env": {},
    "description": "Playwright 浏览器自动化工具",
    "source": "preset",
    "createdAt": 1715673600000,
    "updatedAt": 1715673600000
  }
]
```

#### `PUT /api/v1/chat/mcp-configs/:id`

更新指定 MCP 配置。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | MCP 配置 ID |

**请求体：**

```json
{
  "enabled": true,
  "args": ["@playwright/mcp@latest", "--headless"],
  "env": {
    "BROWSER": "chromium"
  }
}
```

**响应示例：**

```json
{
  "id": "mcp-1",
  "name": "Playwright MCP",
  "enabled": true,
  "command": "npx",
  "args": ["@playwright/mcp@latest", "--headless"],
  "env": {
    "BROWSER": "chromium"
  },
  "description": "Playwright 浏览器自动化工具",
  "source": "preset",
  "createdAt": 1715673600000,
  "updatedAt": 1715673700000
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 配置不存在 |

#### `DELETE /api/v1/chat/mcp-configs/:id`

删除指定 MCP 配置。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | MCP 配置 ID |

**响应示例：**

```json
{
  "success": true
}
```

**错误响应：**

| 状态码 | 说明 |
|--------|------|
| `404` | 配置不存在 |

#### `POST /api/v1/chat/mcp-configs/batch`

批量导入 MCP 配置，从 `mcpServers` 格式的 JSON 对象导入。

**请求体：**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `mcpServers` | `Record<string, unknown>` | 是 | MCP 服务器配置映射，键名为服务器名称 |

**响应示例：**

```json
[
  {
    "id": "mcp-3",
    "name": "playwright",
    "enabled": true,
    "command": "npx",
    "args": ["@playwright/mcp@latest"],
    "createdAt": 1715673800000,
    "updatedAt": 1715673800000
  },
  {
    "id": "mcp-4",
    "name": "filesystem",
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
    "env": {
      "NODE_ENV": "production"
    },
    "createdAt": 1715673800000,
    "updatedAt": 1715673800000
  }
]
```

---

### MCP 预设

#### `GET /api/v1/chat/mcp-presets`

获取内置 MCP 预设列表。

**响应示例：**

```json
[
  {
    "name": "Playwright",
    "enabled": true,
    "command": "npx",
    "args": ["@playwright/mcp@latest"],
    "description": "Playwright 浏览器自动化工具",
    "source": "builtin"
  }
]
```

#### `POST /api/v1/chat/mcp-presets/add`

添加 MCP 预设到配置列表。

**请求体：**

```json
{
  "name": "Playwright"
}
```

**请求字段说明：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 预设名称 |

**响应示例：**

```json
{
  "id": "mcp-5",
  "name": "Playwright",
  "enabled": true,
  "command": "npx",
  "args": ["@playwright/mcp@latest"],
  "description": "Playwright 浏览器自动化工具",
  "source": "preset",
  "createdAt": 1715673900000,
  "updatedAt": 1715673900000
}
```

---

## 类型定义

```typescript
interface SSEEvent {
  type: 'token' | 'tool_call' | 'tool_result' | 'done' | 'error';
  data: unknown;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  toolCall?: {
    name: string;
    arguments: string;
  };
  toolResult?: {
    toolCallId: string;
    name: string;
    success: boolean;
  };
  timestamp: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface MCPConfig {
  id: string;
  name: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  source?: string;
  createdAt: number;
  updatedAt: number;
}

interface MCPPreset {
  name: string;
  enabled: boolean;
  command: string;
  args: string[];
  env?: Record<string, string>;
  description: string;
  source: string;
}

interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

interface MCPServerStatus {
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

interface MCPConnectionStatus {
  servers: MCPServerStatus[];
  totalTools: number;
  connectedCount: number;
  totalCount: number;
}
```
