import { useState } from 'react';
import type { ChatMessageData } from '../../services/chat-api';

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [toolExpanded, setToolExpanded] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === 'assistant') {
    return (
      <div className="flex justify-start mb-4">
        <div className="max-w-[80%] bg-gray-100 text-gray-800 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <i className="fas fa-robot text-blue-500 text-xs"></i>
            <span className="text-xs text-gray-400">AI</span>
          </div>
          <div className="whitespace-pre-wrap prose prose-sm max-w-none">
            <MessageContent content={message.content} />
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'tool_call') {
    const toolName = message.toolCall?.name || 'unknown';
    const toolArgs = message.toolCall?.arguments || '';
    return (
      <div className="flex justify-start mb-2">
        <div className="max-w-[80%] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs">
          <button
            onClick={() => setToolExpanded(!toolExpanded)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            <i className="fas fa-wrench text-amber-500"></i>
            <span className="font-medium text-amber-700">
              {toolName.startsWith('mcp__playwright__') ? toolName.slice('mcp__playwright__'.length) : toolName}
            </span>
            <i className={`fas fa-chevron-${toolExpanded ? 'up' : 'down'} text-amber-400 ml-auto text-[10px]`}></i>
          </button>
          {toolExpanded && (
            <pre className="mt-1.5 text-amber-800 bg-amber-100/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {formatToolArgs(toolArgs)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'tool_result') {
    return (
      <div className="flex justify-start mb-2">
        <div className="max-w-[80%] bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs">
          <button
            onClick={() => setToolExpanded(!toolExpanded)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            <i className="fas fa-check-circle text-green-500"></i>
            <span className="font-medium text-green-700">
              {message.toolResult?.name || 'Tool'} result
            </span>
            <i className={`fas fa-chevron-${toolExpanded ? 'up' : 'down'} text-green-400 ml-auto text-[10px]`}></i>
          </button>
          {toolExpanded && (
            <pre className="mt-1.5 text-green-800 bg-green-100/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
              {message.content.slice(0, 2000)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  return null;
}

/** 格式化工具参数 */
function formatToolArgs(argsStr: string): string {
  try {
    const parsed = JSON.parse(argsStr);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return argsStr;
  }
}

/** 消息内容渲染（简单 Markdown 支持） */
function MessageContent({ content }: { content: string }) {
  // 简单的代码块渲染
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).split('\n');
          const lang = lines[0]?.trim() || '';
          const code = lang ? lines.slice(1).join('\n') : lines.join('\n');
          return (
            <pre key={i} className="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs">
              {lang && <div className="text-gray-400 mb-1 text-[10px]">{lang}</div>}
              <code>{code}</code>
            </pre>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/** 正在输入的指示器 */
export function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <i className="fas fa-robot text-blue-500 text-xs"></i>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </div>
        </div>
      </div>
    </div>
  );
}
