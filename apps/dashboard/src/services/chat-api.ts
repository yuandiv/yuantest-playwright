const API_BASE = '/api/v1';

export interface ChatMessageData {
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
  resultContent?: string;
  thinkingContent?: string;
  truncated?: boolean;
  /** 工具是否正在执行中（tool_running 事件置位，tool_result 到达后清除） */
  running?: boolean;
  timestamp: number;
}

export interface ConversationData {
  id: string;
  title: string;
  messages: ChatMessageData[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface MCPServerStatus {
  id: string;
  name: string;
  connected: boolean;
  toolCount: number;
  error?: string;
}

export interface MCPConnectionStatus {
  servers: MCPServerStatus[];
  totalTools: number;
  connectedCount: number;
  totalCount: number;
}

export interface MCPConfig {
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

export interface ToolInfo {
  name: string;
  description: string;
  source: 'builtin' | 'mcp';
}

export interface SSEEventData {
  type:
    | 'token'
    | 'tool_call'
    | 'tool_running'
    | 'tool_result'
    | 'thinking'
    | 'done'
    | 'error'
    // 事件桥接：agent.* 总线事件投影（HITL / 持久化等）
    | 'interrupt'
    | 'continue'
    | 'agent_persist';
  data: unknown;
}

export interface ChatDoneData {
  content: string;
  thinkingContent?: string;
  analysisMode: 'agent' | 'single' | 'fallback';
  reasoningSteps: Array<{
    step: number;
    tool?: string;
    input?: string;
    output?: string;
    thought: string;
  }>;
  totalUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  truncated?: boolean;
}

export async function listConversations(): Promise<ConversationSummary[] | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/conversations`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to list conversations:', e);
    return null;
  }
}

export async function createConversation(title?: string): Promise<ConversationData | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to create conversation:', e);
    return null;
  }
}

export async function getConversation(id: string): Promise<ConversationData | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to get conversation:', e);
    return null;
  }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/chat/conversations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('Failed to delete conversation:', e);
    return false;
  }
}

export async function sendMessage(
  conversationId: string,
  message: string,
  onEvent: (event: SSEEventData) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal,
    });

    if (!res.ok) {
      onEvent({ type: 'error', data: `HTTP ${res.status}: ${res.statusText}` });
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onEvent({ type: 'error', data: 'No response body' });
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        try {
          const event: SSEEventData = JSON.parse(jsonStr);
          onEvent(event);
        } catch {
          // skip invalid JSON
        }
      }
    }
  } catch (e) {
    onEvent({ type: 'error', data: e instanceof Error ? e.message : 'Unknown error' });
  }
}

export async function getMCPStatus(): Promise<MCPConnectionStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/mcp-status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to get MCP status:', e);
    return null;
  }
}

export async function reconnectMCP(): Promise<{ success: boolean; status: MCPConnectionStatus } | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/mcp-reconnect`, { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to reconnect MCP:', e);
    return null;
  }
}

export async function getTools(): Promise<ToolInfo[] | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/tools`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to get tools:', e);
    return null;
  }
}

export async function getMCPConfigs(): Promise<MCPConfig[] | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/mcp-configs`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to get MCP configs:', e);
    return null;
  }
}

export async function updateMCPConfig(id: string, config: Partial<MCPConfig>): Promise<{ config: MCPConfig; status?: MCPConnectionStatus } | null> {
  try {
    const res = await fetch(`${API_BASE}/chat/mcp-configs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error('Failed to update MCP config:', e);
    return null;
  }
}

export async function deleteMCPConfig(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/chat/mcp-configs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('Failed to delete MCP config:', e);
    return false;
  }
}

export async function saveMCPConfigsFromJson(mcpServers: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/chat/mcp-configs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mcpServers }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.success;
  } catch (e) {
    console.error('Failed to save MCP configs from JSON:', e);
    return false;
  }
}
