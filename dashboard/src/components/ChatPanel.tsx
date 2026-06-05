import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, TypingIndicator } from './chat/ChatMessage';
import { ConversationList } from './chat/ConversationList';
import { AgentConfigDialog } from './AgentConfigDialog';
import { Lang, t, formatTemplate } from '../i18n';
import { LLMStatus } from '../types';
import * as api from '../services/api';
import {
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  sendMessage,
  getMCPStatus,
  reconnectMCP,
  type ConversationSummary,
  type ConversationData,
  type ChatMessageData,
  type MCPConnectionStatus,
  type SSEEventData,
  type ChatDoneData,
} from '../services/chat-api';

interface ChatPanelProps {
  lang: Lang;
  onClose: () => void;
}

function renderLLMStatus(llmStatus: LLMStatus | null, lang: Lang) {
  const isGreen = llmStatus?.status === 'green';
  const isRed = llmStatus?.status === 'red';
  const dotColor = isGreen ? 'bg-green-500' : isRed ? 'bg-red-500' : 'bg-yellow-500';
  const textColor = isGreen ? 'text-green-600' : isRed ? 'text-red-500' : 'text-yellow-600';
  const statusText = isGreen ? (t('llmConnected', lang)) : isRed ? (t('llmConnectionFailed', lang)) : (t('llmNotConfigured', lang));

  return (
    <span className={`flex items-center gap-1 text-xs ${textColor}`} title={statusText}>
      <span className="relative flex h-2 w-2">
        {isGreen && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
      </span>
      LLM
    </span>
  );
}

function renderMCPStatus(mcpStatus: MCPConnectionStatus | null, lang: Lang) {
  if (!mcpStatus || mcpStatus.totalCount === 0) {
    return null;
  }

  const { connectedCount, totalCount, totalTools, servers } = mcpStatus;
  const failedServers = servers.filter((s) => !s.connected);
  const errorTooltip = failedServers
    .map((s) => `${s.name}: ${s.error || t('mcpConnectFailed', lang)}`)
    .join('\n');

  const allConnected = connectedCount === totalCount && totalCount > 0;
  const someConnected = connectedCount > 0;

  const dotColor = allConnected ? 'bg-green-500' : someConnected ? 'bg-yellow-500' : 'bg-gray-400';
  const textColor = allConnected ? 'text-green-600' : someConnected ? 'text-yellow-600' : 'text-gray-400';

  const statusText = allConnected
    ? formatTemplate(t('mcpStatusConnected', lang), { connected: String(connectedCount), total: String(totalCount), tools: String(totalTools) })
    : someConnected
      ? formatTemplate(t('mcpStatusPartial', lang), { connected: String(connectedCount), total: String(totalCount) })
      : formatTemplate(t('mcpStatusAllDown', lang), { total: String(totalCount) });

  return (
    <span className={`flex items-center gap-1 text-xs ${textColor}`} title={errorTooltip || statusText}>
      <span className="relative flex h-2 w-2">
        {allConnected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColor}`}></span>
      </span>
      {statusText}
    </span>
  );
}

export function ChatPanel({ lang, onClose }: ChatPanelProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [activeConv, setActiveConv] = useState<ConversationData | null>(null);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessages, setStreamingMessages] = useState<ChatMessageData[]>([]);
  const [mcpStatus, setMcpStatus] = useState<MCPConnectionStatus | null>(null);
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadConversations = useCallback(async () => {
    const list = await listConversations();
    if (list) setConversations(list);
  }, []);

  const loadMCPStatus = useCallback(async () => {
    const status = await getMCPStatus();
    if (status) setMcpStatus(status);
  }, []);

  const loadLLMStatus = useCallback(async () => {
    const status = await api.getLLMStatus();
    if (status) setLlmStatus(status);
  }, []);

  useEffect(() => {
    loadConversations();
    loadMCPStatus();
    loadLLMStatus();
    const interval = setInterval(() => {
      loadMCPStatus();
      loadLLMStatus();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadConversations, loadMCPStatus, loadLLMStatus]);

  const handleSelectConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setStreamingMessages([]);
    const conv = await getConversation(id);
    if (conv) setActiveConv(conv);
  }, []);

  const handleCreateConversation = useCallback(async () => {
    const conv = await createConversation();
    if (conv) {
      setActiveConvId(conv.id);
      setActiveConv(conv);
      loadConversations();
    }
  }, [loadConversations]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    if (activeConvId === id) {
      setActiveConvId(null);
      setActiveConv(null);
    }
    loadConversations();
  }, [activeConvId, loadConversations]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;

    let convId = activeConvId;
    if (!convId) {
      const conv = await createConversation(text.slice(0, 30));
      if (!conv) return;
      convId = conv.id;
      setActiveConvId(convId);
      setActiveConv(conv);
      loadConversations();
    }

    setInputText('');
    setIsLoading(true);
    setStreamingMessages([]);

    const userMsg: ChatMessageData = {
      id: 'streaming-user',
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setStreamingMessages([userMsg]);

    await sendMessage(convId, text, (event: SSEEventData) => {
      if (event.type === 'token') {
        const token = event.data as string;
        setStreamingMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: m.content + token }
                : m
            );
          }
          return [
            ...prev,
            {
              id: `streaming-assistant-${Date.now()}`,
              role: 'assistant' as const,
              content: token,
              timestamp: Date.now(),
            },
          ];
        });
      } else if (event.type === 'tool_call') {
        const data = event.data as { name: string; arguments: string; result?: string };
        setStreamingMessages((prev) => [
          ...prev,
          {
            id: `streaming-tc-${Date.now()}`,
            role: 'tool_call',
            content: `调用工具: ${data.name}`,
            toolCall: { name: data.name, arguments: typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments) },
            timestamp: Date.now(),
          },
        ]);
      } else if (event.type === 'tool_result') {
        const data = event.data as { name: string; result?: string };
        setStreamingMessages((prev) => [
          ...prev,
          {
            id: `streaming-tr-${Date.now()}`,
            role: 'tool_result',
            content: data.result || '',
            toolResult: { toolCallId: '', name: data.name, success: true },
            timestamp: Date.now(),
          },
        ]);
      } else if (event.type === 'thinking') {
        const data = event.data as { content: string };
        setStreamingMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, thinkingContent: (m.thinkingContent || '') + data.content }
                : m
            );
          }
          return [
            ...prev,
            {
              id: `streaming-thinking-${Date.now()}`,
              role: 'assistant' as const,
              content: '',
              thinkingContent: data.content,
              timestamp: Date.now(),
            },
          ];
        });
      } else if (event.type === 'done') {
        const data = event.data as ChatDoneData;
        setStreamingMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === 'assistant') {
            return prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: data.content || m.content, thinkingContent: data.thinkingContent || m.thinkingContent }
                : m
            );
          }
          return [
            ...prev,
            {
              id: `streaming-done-${Date.now()}`,
              role: 'assistant',
              content: data.content,
              thinkingContent: data.thinkingContent,
              timestamp: Date.now(),
            },
          ];
        });
        setIsLoading(false);
        getConversation(convId!).then((conv) => {
          if (conv) setActiveConv(conv);
        });
        loadConversations();
      } else if (event.type === 'error') {
        setStreamingMessages((prev) => [
          ...prev,
          {
            id: `streaming-error-${Date.now()}`,
            role: 'assistant',
            content: `错误: ${event.data}`,
            timestamp: Date.now(),
          },
        ]);
        setIsLoading(false);
      }
    });
  }, [inputText, isLoading, activeConvId, loadConversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [streamingMessages, activeConv?.messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAgentConfigSaved = useCallback(async (type: 'llm' | 'mcp') => {
    if (type === 'mcp') {
      setIsReconnecting(true);
      await reconnectMCP();
      await loadMCPStatus();
      setIsReconnecting(false);
    }
    if (type === 'llm') {
      window.dispatchEvent(new CustomEvent('llm-config-changed'));
    }
  }, [loadMCPStatus, reconnectMCP]);

  const displayMessages: ChatMessageData[] = (() => {
    const source = streamingMessages.length > 0 ? streamingMessages : activeConv?.messages || [];
    // 合并连续的 tool_call + tool_result 为单条消息
    const merged: ChatMessageData[] = [];
    let i = 0;
    while (i < source.length) {
      const msg = source[i];
      if (msg.role === 'tool_call' && i + 1 < source.length && source[i + 1].role === 'tool_result') {
        const resultMsg = source[i + 1];
        merged.push({
          ...msg,
          id: msg.id,
          role: 'tool_call',
          content: msg.content,
          toolCall: msg.toolCall,
          toolResult: resultMsg.toolResult,
          resultContent: resultMsg.content,
          timestamp: msg.timestamp,
        });
        i += 2;
      } else {
        merged.push(msg);
        i++;
      }
    }
    return merged;
  })();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex"
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'} border-r border-gray-200 flex-shrink-0 transition-all duration-200`}>
            <ConversationList
              conversations={conversations}
              activeId={activeConvId}
              onSelect={handleSelectConversation}
              onCreate={handleCreateConversation}
              onDelete={handleDeleteConversation}
            />
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title={sidebarCollapsed ? t('expandSidebar', lang) : t('collapseSidebar', lang)}
              >
                <i className={`fas fa-${sidebarCollapsed ? 'indent' : 'outdent'}`}></i>
              </button>
              <h2 className="text-sm font-semibold text-gray-700 flex-1 truncate">
                {activeConv?.title || t('smartAssistant', lang)}
              </h2>
              <div className="flex items-center gap-2 text-xs">
                {renderLLMStatus(llmStatus, lang)}
                {isReconnecting ? (
                  <span className="flex items-center gap-1 text-blue-500">
                    <i className="fas fa-spinner fa-spin text-[8px]"></i>
                    {t('mcpReconnecting', lang)}
                  </span>
                ) : (
                  renderMCPStatus(mcpStatus, lang)
                )}
              </div>
              <button
                onClick={() => setShowAgentConfig(true)}
                className="text-gray-400 hover:text-gray-600 p-1"
                title={t('agentConfig', lang) || '智能体设置'}
              >
                <i className="fas fa-cog"></i>
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {displayMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <i className="fas fa-robot text-4xl mb-3"></i>
                  <p className="text-sm mb-1">{t('chatWelcomeTitle', lang)}</p>
                  <p className="text-xs">{t('chatWelcomeDesc', lang)}</p>
                </div>
              ) : (
                <>
                  {displayMessages.map((msg, idx) => {
                    // 计算 tool_call 的步骤序号
                    let stepIndex: number | undefined;
                    if (msg.role === 'tool_call') {
                      stepIndex = displayMessages
                        .slice(0, idx)
                        .filter((m) => m.role === 'tool_call').length + 1;
                    }
                    return <ChatMessage key={msg.id} message={msg} stepIndex={stepIndex} />;
                  })}
                  {isLoading && !streamingMessages.some(m => m.role === 'assistant') && <TypingIndicator />}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-3 border-t border-gray-200">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chatInputPlaceholder', lang)}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[40px] max-h-[120px]"
                  rows={1}
                  disabled={isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !inputText.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  {isLoading ? (
                    <i className="fas fa-spinner fa-spin"></i>
                  ) : (
                    <i className="fas fa-paper-plane"></i>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showAgentConfig && (
        <AgentConfigDialog
          lang={lang}
          onClose={() => setShowAgentConfig(false)}
          onLLMSaved={() => handleAgentConfigSaved('llm')}
          onMCPSaved={() => handleAgentConfigSaved('mcp')}
        />
      )}
    </>
  );
}
