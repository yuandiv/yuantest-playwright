# ChatService API Reference

ChatService provides conversational AI capabilities, conversation management, and MCP (Model Context Protocol) tool integration for interactive chat-based workflows.

All API paths use the `/api/v1/` prefix.

---

## ChatService Constructor

```typescript
new ChatService(dataDir: string, projectRoot: string, toolRegistry: ToolRegistry, llmConfig?: LLMConfig, sharedLLMService?: LLMService, mcpConfigService?: MCPConfigService)
```

### Parameters

| Parameter | Type | Required | Description |
|------|------|------|------|
| `dataDir` | `string` | Yes | Persistent data storage directory |
| `projectRoot` | `string` | Yes | Project root directory path |
| `toolRegistry` | `ToolRegistry` | Yes | Tool registry for managing available tools |
| `llmConfig` | `LLMConfig` | No | LLM configuration for the chat service |
| `sharedLLMService` | `LLMService` | No | Shared LLM service instance |
| `mcpConfigService` | `MCPConfigService` | No | MCP configuration service instance |

### Example

```typescript
import { ChatService } from 'yuantest-playwright';

const chatService = new ChatService(
  './chat-data',
  '/path/to/project',
  toolRegistry,
  llmConfig,
  sharedLLMService,
  mcpConfigService
);
```

---

## ChatService Methods

### `updateLLMConfig(config: LLMConfig): void`

Update the LLM configuration used by the chat service.

```typescript
chatService.updateLLMConfig({
  enabled: true,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4',
  apiKey: 'sk-your-api-key'
});
```

### `setProjectRoot(root: string): Promise<void>`

Set a new project root directory. This will also update the MCP client manager's project root.

```typescript
await chatService.setProjectRoot('/new/project/path');
```

### `initMCP(): Promise<void>`

Initialize MCP connections from the current configuration. Connects to all enabled MCP servers.

```typescript
await chatService.initMCP();
```

### `reconnectMCP(): Promise<void>`

Reconnect all MCP servers. Disconnects existing connections and re-establishes them.

```typescript
await chatService.reconnectMCP();
```

### `createConversation(title?: string): Conversation`

Create a new conversation. Returns the created conversation object.

```typescript
const conversation = chatService.createConversation('My Chat');
```

### `getConversation(id: string): Conversation | null`

Get a conversation by ID. Returns `null` if the conversation is not found.

```typescript
const conversation = chatService.getConversation('conv-123');
```

### `listConversations(): ConversationSummary[]`

List all conversations as summary objects.

```typescript
const summaries = chatService.listConversations();
```

### `deleteConversation(id: string): boolean`

Delete a conversation by ID. Returns `true` if the conversation was deleted, `false` if not found.

```typescript
const deleted = chatService.deleteConversation('conv-123');
```

### `getMCPStatus(): MCPConnectionStatus`

Get the current MCP connection status.

```typescript
const status = chatService.getMCPStatus();
```

### `getAllTools(): { name: string; description: string; source: 'builtin' | 'mcp' }[]`

Get all available tools from both builtin and MCP sources.

```typescript
const tools = chatService.getAllTools();
```

### `sendMessage(conversationId: string, userMessage: string, onEvent: (event: SSEEvent) => void): Promise<void>`

Send a message to a conversation and receive streaming responses via SSE events. The `onEvent` callback is invoked for each event during the response stream.

```typescript
await chatService.sendMessage('conv-123', 'Hello, how are you?', (event) => {
  switch (event.type) {
    case 'token':
      process.stdout.write(event.data as string);
      break;
    case 'tool_call':
      console.log('Tool called:', event.data);
      break;
    case 'tool_result':
      console.log('Tool result:', event.data);
      break;
    case 'done':
      console.log('Response complete');
      break;
    case 'error':
      console.error('Error:', event.data);
      break;
  }
});
```

---

## ConversationStore Methods

### `create(title?: string): Conversation`

Create a new conversation with an optional title.

```typescript
const conversation = store.create('New Conversation');
```

### `get(id: string): Conversation | null`

Get a conversation by ID. Returns `null` if not found.

```typescript
const conversation = store.get('conv-123');
```

### `list(): ConversationSummary[]`

List all conversations as summary objects.

```typescript
const summaries = store.list();
```

### `save(conversation: Conversation): void`

Save a conversation, persisting any changes.

```typescript
store.save(conversation);
```

### `delete(id: string): boolean`

Delete a conversation by ID. Returns `true` if deleted, `false` if not found.

```typescript
const deleted = store.delete('conv-123');
```

### `addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage`

Add a message to a conversation. Automatically generates an ID and timestamp. Returns the created message.

```typescript
const message = store.addMessage('conv-123', {
  role: 'user',
  content: 'Hello!'
});
```

### `updateTitle(conversationId: string, title: string): boolean`

Update the title of a conversation. Returns `true` if updated, `false` if not found.

```typescript
const updated = store.updateTitle('conv-123', 'Updated Title');
```

---

## MCPClientManager Methods

### `findPlaywrightConfig(projectRoot?: string): string | null`

Find the Playwright configuration file in the project. Returns the config file path or `null` if not found.

```typescript
const configPath = manager.findPlaywrightConfig('/path/to/project');
```

### `setProjectRoot(newRoot: string): Promise<void>`

Set a new project root directory and reconnect MCP servers.

```typescript
await manager.setProjectRoot('/new/project/path');
```

### `connectFromConfig(config: MCPConfig): Promise<boolean>`

Connect to an MCP server from a single configuration. Returns `true` if connected successfully.

```typescript
const connected = await manager.connectFromConfig({
  id: 'server-1',
  name: 'My MCP Server',
  enabled: true,
  command: 'node',
  args: ['server.js'],
  createdAt: Date.now(),
  updatedAt: Date.now()
});
```

### `connectFromConfigs(configs: MCPConfig[]): Promise<void>`

Connect to multiple MCP servers from an array of configurations.

```typescript
await manager.connectFromConfigs([config1, config2]);
```

### `disconnectServer(id: string): Promise<void>`

Disconnect a specific MCP server by ID.

```typescript
await manager.disconnectServer('server-1');
```

### `disconnect(): Promise<void>`

Disconnect all MCP servers.

```typescript
await manager.disconnect();
```

### `connect(): Promise<boolean>`

Connect to all enabled MCP servers. Returns `true` if at least one server connected successfully.

```typescript
const connected = await manager.connect();
```

### `listTools(): MCPToolInfo[]`

List all available MCP tools across connected servers.

```typescript
const tools = manager.listTools();
```

### `getToolSchemas(): ToolSchema[]`

Get JSON schemas for all available MCP tools.

```typescript
const schemas = manager.getToolSchemas();
```

### `callTool(toolName: string, args: Record<string, unknown>): Promise<string>`

Call an MCP tool by name with the given arguments. Returns the tool result as a string.

```typescript
const result = await manager.callTool('browser_navigate', { url: 'https://example.com' });
```

### `isAvailable(): boolean`

Check if any MCP server is currently connected.

```typescript
const available = manager.isAvailable();
```

### `getStatus(): MCPConnectionStatus`

Get the current connection status of all MCP servers.

```typescript
const status = manager.getStatus();
```

### `getProjectRoot(): string`

Get the current project root directory.

```typescript
const root = manager.getProjectRoot();
```

---

## MCPConfigService Methods

### `static getBuiltinPresets(): MCPPreset[]`

Get the list of built-in MCP presets. This is a static method.

```typescript
const presets = MCPConfigService.getBuiltinPresets();
```

### `getConfigs(): MCPConfig[]`

Get all MCP configurations.

```typescript
const configs = configService.getConfigs();
```

### `getConfig(id: string): MCPConfig | null`

Get a specific MCP configuration by ID. Returns `null` if not found.

```typescript
const config = configService.getConfig('server-1');
```

### `updateConfig(id: string, updates: Partial<MCPConfig>): MCPConfig | null`

Update an MCP configuration with partial changes. Returns the updated config or `null` if not found.

```typescript
const updated = configService.updateConfig('server-1', { enabled: true });
```

### `deleteConfig(id: string): boolean`

Delete an MCP configuration by ID. Returns `true` if deleted, `false` if not found.

```typescript
const deleted = configService.deleteConfig('server-1');
```

### `saveConfigsFromJson(mcpServers: Record<string, unknown>): MCPConfig[]`

Batch import MCP configurations from a JSON object (e.g., from `mcpServers` in a config file). Returns the imported configurations.

```typescript
const imported = configService.saveConfigsFromJson({
  'my-server': {
    command: 'node',
    args: ['server.js'],
    env: { KEY: 'value' }
  }
});
```

### `getEnabledConfigs(): MCPConfig[]`

Get all enabled MCP configurations.

```typescript
const enabledConfigs = configService.getEnabledConfigs();
```

---

## REST API Endpoints

### Conversations

#### `GET /api/v1/chat/conversations`

List all conversations.

**Response Example:**

```json
[
  {
    "id": "conv-001",
    "title": "My Chat",
    "messageCount": 5,
    "createdAt": 1715673600000,
    "updatedAt": 1715673700000
  },
  {
    "id": "conv-002",
    "title": "Another Chat",
    "messageCount": 12,
    "createdAt": 1715673800000,
    "updatedAt": 1715673900000
  }
]
```

#### `POST /api/v1/chat/conversations`

Create a new conversation.

**Request Body:**

```json
{
  "title": "My New Chat"
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `title` | `string` | No | Conversation title |

**Response Example:**

```json
{
  "id": "conv-003",
  "title": "My New Chat",
  "messages": [],
  "createdAt": 1715674000000,
  "updatedAt": 1715674000000
}
```

#### `GET /api/v1/chat/conversations/:id`

Get a conversation by ID.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Conversation ID |

**Response Example:**

```json
{
  "id": "conv-001",
  "title": "My Chat",
  "messages": [
    {
      "id": "msg-001",
      "role": "user",
      "content": "Hello!",
      "timestamp": 1715673600000
    },
    {
      "id": "msg-002",
      "role": "assistant",
      "content": "Hi! How can I help you?",
      "timestamp": 1715673601000
    }
  ],
  "createdAt": 1715673600000,
  "updatedAt": 1715673700000
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Conversation not found |

#### `DELETE /api/v1/chat/conversations/:id`

Delete a conversation by ID.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Conversation ID |

**Response Example:**

```json
{
  "success": true
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Conversation not found |

#### `POST /api/v1/chat/conversations/:id/messages`

Send a message to a conversation. The response is streamed using Server-Sent Events (SSE).

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Conversation ID |

**Request Body:**

```json
{
  "message": "Hello, how are you?"
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `message` | `string` | Yes | User message content |

**Response:**

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no`

**SSE Event Format:**

```
data: {"type":"token","data":"Hello"}

data: {"type":"token","data":"!"}

data: {"type":"tool_call","data":{"name":"browser_navigate","arguments":"{\"url\":\"https://example.com\"}"}}

data: {"type":"tool_result","data":{"toolCallId":"call-001","name":"browser_navigate","success":true}}

data: {"type":"done","data":null}

data: {"type":"error","data":"Connection timeout"}
```

**SSE Event Types:**

| Type | Description |
|------|------|
| `token` | Streaming text token from the LLM |
| `tool_call` | LLM is calling a tool |
| `tool_result` | Result returned from a tool execution |
| `done` | Response stream completed |
| `error` | An error occurred during streaming |

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Conversation not found |
| `400` | Missing message field |

---

### MCP Status & Tools

#### `GET /api/v1/chat/mcp-status`

Get the current MCP connection status.

**Response Example:**

```json
{
  "servers": [
    {
      "id": "server-1",
      "name": "Playwright MCP",
      "connected": true,
      "toolCount": 5
    },
    {
      "id": "server-2",
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

Reconnect all MCP servers.

**Response Example:**

```json
{
  "success": true
}
```

#### `GET /api/v1/chat/tools`

Get all available tools from both builtin and MCP sources.

**Response Example:**

```json
[
  {
    "name": "browser_navigate",
    "description": "Navigate to a URL in the browser",
    "source": "mcp"
  },
  {
    "name": "read_file",
    "description": "Read file contents from disk",
    "source": "builtin"
  }
]
```

---

### MCP Configuration

#### `GET /api/v1/chat/mcp-configs`

Get all MCP configurations.

**Response Example:**

```json
[
  {
    "id": "cfg-001",
    "name": "Playwright MCP",
    "enabled": true,
    "command": "npx",
    "args": ["@playwright/mcp@latest"],
    "env": {},
    "description": "Browser automation MCP server",
    "source": "preset",
    "createdAt": 1715673600000,
    "updatedAt": 1715673600000
  }
]
```

#### `PUT /api/v1/chat/mcp-configs/:id`

Update an MCP configuration.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Configuration ID |

**Request Body:**

```json
{
  "enabled": true,
  "args": ["@playwright/mcp@latest", "--headless"]
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `name` | `string` | No | Server name |
| `enabled` | `boolean` | No | Whether the server is enabled |
| `command` | `string` | No | Command to start the server |
| `args` | `string[]` | No | Command arguments |
| `env` | `Record<string, string>` | No | Environment variables |
| `description` | `string` | No | Server description |

**Response Example:**

```json
{
  "id": "cfg-001",
  "name": "Playwright MCP",
  "enabled": true,
  "command": "npx",
  "args": ["@playwright/mcp@latest", "--headless"],
  "env": {},
  "description": "Browser automation MCP server",
  "source": "preset",
  "createdAt": 1715673600000,
  "updatedAt": 1715673700000
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Configuration not found |

#### `DELETE /api/v1/chat/mcp-configs/:id`

Delete an MCP configuration.

**Path Parameters:**

| Parameter | Type | Description |
|------|------|------|
| `id` | `string` | Configuration ID |

**Response Example:**

```json
{
  "success": true
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `404` | Configuration not found |

#### `POST /api/v1/chat/mcp-configs/batch`

Batch import MCP configurations from a JSON object.

**Request Body:**

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "env": { "DEBUG": "1" }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `mcpServers` | `Record<string, unknown>` | Yes | MCP server configurations keyed by server name |

**Response Example:**

```json
[
  {
    "id": "cfg-002",
    "name": "playwright",
    "enabled": true,
    "command": "npx",
    "args": ["@playwright/mcp@latest"],
    "env": { "DEBUG": "1" },
    "createdAt": 1715673800000,
    "updatedAt": 1715673800000
  },
  {
    "id": "cfg-003",
    "name": "filesystem",
    "enabled": true,
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "env": {},
    "createdAt": 1715673800000,
    "updatedAt": 1715673800000
  }
]
```

---

### MCP Presets

#### `GET /api/v1/chat/mcp-presets`

Get built-in MCP presets.

**Response Example:**

```json
[
  {
    "name": "Playwright",
    "enabled": false,
    "command": "npx",
    "args": ["@playwright/mcp@latest"],
    "env": {},
    "description": "Browser automation and testing",
    "source": "builtin"
  }
]
```

#### `POST /api/v1/chat/mcp-presets/add`

Add a built-in MCP preset to the active configurations.

**Request Body:**

```json
{
  "name": "Playwright"
}
```

**Request Field Descriptions:**

| Field | Type | Required | Description |
|------|------|------|------|
| `name` | `string` | Yes | Preset name to add |

**Response Example:**

```json
{
  "id": "cfg-004",
  "name": "Playwright",
  "enabled": true,
  "command": "npx",
  "args": ["@playwright/mcp@latest"],
  "env": {},
  "description": "Browser automation and testing",
  "source": "preset",
  "createdAt": 1715673900000,
  "updatedAt": 1715673900000
}
```

**Error Response:**

| Status Code | Description |
|--------|------|
| `400` | Missing preset name or preset not found |

---

## Type Definitions

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
