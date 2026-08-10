import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatMessage, TypingIndicator } from './chat/ChatMessage';
import { ConversationList } from './chat/ConversationList';
import { AgentConfigDialog } from './AgentConfigDialog';
import { Lang, t, formatTemplate } from '../i18n';
import { useLLMStatus } from '../contexts/LLMStatusContext';
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

function renderLLMStatus(llmStatus: import('../types').LLMStatus | null, lang: Lang) {
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
  const [loadingConvIds, setLoadingConvIds] = useState<Set<string>>(new Set());
  const [streamingMessages, setStreamingMessages] = useState<ChatMessageData[]>([]);
  const [mcpStatus, setMcpStatus] = useState<MCPConnectionStatus | null>(null);
  const llmStatus = useLLMStatus();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const hintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamConvIdRef = useRef<string | null>(null);
  const activeConvIdRef = useRef<string | null>(null);

  // 按会话存储流式消息，以便切换回时恢复
  const streamingDataByConvRef = useRef<Map<string, ChatMessageData[]>>(new Map());

  const isLoading = activeConvId ? loadingConvIds.has(activeConvId) : false;
  // 是否有其他会话正在执行
  const otherSessionLoading = loadingConvIds.size > 0 && (activeConvId ? !loadingConvIds.has(activeConvId) : true);

  // ─── 提示信息 ──────────────────────────────────────────────────
  const showHint = useCallback((msg: string) => {
    if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
    setHintMessage(msg);
    hintTimeoutRef.current = setTimeout(() => setHintMessage(null), 4000);
  }, []);

  const hintDismiss = useCallback(() => {
    setHintMessage(null);
    if (hintTimeoutRef.current) {
      clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
  }, []);

  const loadConversations = useCallback(async () => {
    const list = await listConversations();
    if (list) setConversations(list);
  }, []);

  const loadMCPStatus = useCallback(async () => {
    const status = await getMCPStatus();
    if (status) setMcpStatus(status);
  }, []);

  // LLM 状态由 LLMStatusContext 统一管理（每 60s 轮询），不再单独请求

  useEffect(() => {
    loadConversations();
    loadMCPStatus();

    // 监听 LLM 配置变更事件（AgentConfigDialog 保存后触发），立即刷新状态
    const handleLLMConfigChanged = () => { llmStatus.refresh(); };
    window.addEventListener('llm-config-changed', handleLLMConfigChanged);

    const interval = setInterval(() => {
      loadMCPStatus();
    }, 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('llm-config-changed', handleLLMConfigChanged);
    };
  }, [loadConversations, loadMCPStatus, llmStatus]);

  const handleSelectConversation = useCallback(async (id: string) => {
    // 保存当前会话的流式消息
    if (activeConvId && streamingMessages.length > 0) {
      streamingDataByConvRef.current.set(activeConvId, streamingMessages);
    }
    // 恢复目标会话的流式消息（如有）
    const saved = streamingDataByConvRef.current.get(id);
    if (saved) {
      setStreamingMessages(saved);
    } else {
      setStreamingMessages([]);
    }
    activeConvIdRef.current = id;
    setActiveConvId(id);
    const conv = await getConversation(id);
    if (conv) setActiveConv(conv);
  }, [activeConvId, streamingMessages]);

  const handleCreateConversation = useCallback(async () => {
    const conv = await createConversation();
    if (conv) {
      activeConvIdRef.current = conv.id;
      setActiveConvId(conv.id);
      setActiveConv(conv);
      setStreamingMessages([]);
      loadConversations();
    }
  }, [loadConversations]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await deleteConversation(id);
    setLoadingConvIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    streamingDataByConvRef.current.delete(id);
    if (activeConvId === id) {
      setActiveConvId(null);
      setActiveConv(null);
      setStreamingMessages([]);
    }
    loadConversations();
  }, [activeConvId, loadConversations]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    // 当前会话正在执行中
    if (isLoading) return;

    // 有其他会话正在执行，友好提示
    if (otherSessionLoading) {
      showHint('当前有其他会话正在执行，请等待完成后重试');
      return;
    }

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
    setLoadingConvIds((prev) => new Set(prev).add(convId));
    setStreamingMessages([]);
    // 清除之前保存的该会话流式消息
    streamingDataByConvRef.current.delete(convId);

    // 取消之前的请求（如有）— 同一时间只允许一个请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    streamConvIdRef.current = convId;

    const userMsg: ChatMessageData = {
      id: 'streaming-user',
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setStreamingMessages([userMsg]);

    await sendMessage(convId, text, (event: SSEEventData) => {
      // 切换会话后的残留事件忽略
      if (streamConvIdRef.current !== convId) return;
      if (abortController.signal.aborted) return;
      if (event.type === 'token') {
        // 防御性剥离 <think> 标签（正常情况下后端已在流式解析时剔除，此处兜底防残留）
        const raw = event.data as string;
        let token = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
        const unclosedIdx = token.lastIndexOf('<think>');
        if (unclosedIdx !== -1) {
          token = token.slice(0, unclosedIdx);
        }
        if (!token) return;
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
      } else if (event.type === 'tool_running') {
        // 工具执行中：把最后一条 tool_call 标记为执行中（嵌套调用可能长时间无 token）
        const data = event.data as { name: string };
        setStreamingMessages((prev) => {
          const lastIdx = prev.length - 1;
          const lastMsg = prev[lastIdx];
          if (lastMsg && lastMsg.role === 'tool_call' && lastMsg.toolCall?.name === data.name) {
            return prev.map((m, i) => (i === lastIdx ? { ...m, running: true } : m));
          }
          return prev;
        });
      } else if (event.type === 'tool_result') {
        const data = event.data as { name: string; result?: string };
        setStreamingMessages((prev) => [
          ...prev.map((m, i) =>
            // 清除对应 tool_call 的执行中标记（tool_result 到达即完成）
            i === prev.length - 1 && m.role === 'tool_call' ? { ...m, running: false } : m
          ),
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
            const updated = prev.map((m, i) =>
              i === prev.length - 1
                ? {
                    ...m,
                    content: data.content || m.content,
                    // 保留流式过程中已正确设置的思考内容，不用累积的 thinkingContent 覆盖
                    thinkingContent: m.thinkingContent || data.thinkingContent,
                    truncated: data.truncated,
                  }
                : m
            );
            return updated;
          }
          return [
            ...prev,
            {
              id: `streaming-done-${Date.now()}`,
              role: 'assistant',
              content: data.content,
              thinkingContent: data.thinkingContent,
              truncated: data.truncated,
              timestamp: Date.now(),
            },
          ];
        });
        setLoadingConvIds((prev) => {
          const next = new Set(prev);
          next.delete(convId!);
          return next;
        });
        // 检查此会话是否仍是用户当前查看的会话
        const stillActive = activeConvIdRef.current === convId;
        abortControllerRef.current = null;
        streamConvIdRef.current = null;
        // 保存完成后的消息数据，以便切换回时恢复
        setStreamingMessages((prev) => {
          streamingDataByConvRef.current.set(convId!, prev);
          return prev;
        });
        // 如果当前仍在查看此会话，加载完整数据替换流式数据
        if (stillActive) {
          getConversation(convId!).then((conv) => {
            if (conv) {
              setActiveConv(conv);
              setStreamingMessages([]);
              streamingDataByConvRef.current.delete(convId!);
            }
          });
        }
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
        setLoadingConvIds((prev) => {
          const next = new Set(prev);
          next.delete(convId!);
          return next;
        });
        abortControllerRef.current = null;
        streamConvIdRef.current = null;
      }
    }, abortController.signal);
  }, [inputText, isLoading, otherSessionLoading, showHint, activeConvId, loadConversations]);

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
      llmStatus.refresh();
    }
  }, [loadMCPStatus, reconnectMCP, llmStatus]);

  const handleMCPToggled = useCallback(async () => {
    await loadMCPStatus();
  }, [loadMCPStatus]);

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
                {renderLLMStatus(llmStatus.status, lang)}
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
              {/* 提示信息横幅 */}
              {hintMessage && (
                <div className="mb-2 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg px-3 py-2">
                  <i className="fas fa-info-circle text-amber-500"></i>
                  <span className="flex-1">{hintMessage}</span>
                  <button onClick={hintDismiss} className="text-amber-400 hover:text-amber-600">
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chatInputPlaceholder', lang)}
                  className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none min-h-[40px] max-h-[120px]"
                  rows={1}
                  disabled={isLoading || otherSessionLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || otherSessionLoading || !inputText.trim()}
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
          onMCPToggled={handleMCPToggled}
        />
      )}
    </>
  );
}
