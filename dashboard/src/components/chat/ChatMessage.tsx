import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessageData } from '../../services/chat-api';

interface ChatMessageProps {
  message: ChatMessageData;
  stepIndex?: number;
}

/** 思考过程折叠组件 */
function ThinkingSection({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-left text-xs text-indigo-600 hover:text-indigo-800"
      >
        <i className="fas fa-brain text-[10px]"></i>
        <span className="font-medium">思考过程</span>
        {!expanded && <span className="text-indigo-400 truncate max-w-[300px]">{preview}</span>}
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} text-[8px] ml-auto text-indigo-400`}></i>
      </button>
      {expanded && (
        <div className="mt-1 text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg p-2.5 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
}

/** 从 content 中解析 <think...</think 标签 */
function parseThinkingTags(content: string): {
  cleanContent: string;
  thinkingContent: string | null;
} {
  const thinkRegex = /<think([\s\S]*?)<\/think>/g;
  const thinkingParts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = thinkRegex.exec(content)) !== null) {
    if (match[1].trim()) {
      thinkingParts.push(match[1].trim());
    }
  }

  if (thinkingParts.length === 0) {
    return { cleanContent: content, thinkingContent: null };
  }

  const cleanContent = content.replace(/<think[\s\S]*?<\/think>/g, '').trim();
  return { cleanContent, thinkingContent: thinkingParts.join('\n') };
}

/** Markdown 消息内容渲染 */
function MessageContent({ content }: { content: string }) {
  const { cleanContent, thinkingContent } = parseThinkingTags(content);

  return (
    <>
      {thinkingContent && <ThinkingSection content={thinkingContent} />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const isInline = !className;
            if (isInline) {
              return <code className="bg-gray-200 text-pink-600 px-1 py-0.5 rounded text-xs" {...props}>{children}</code>;
            }
            const lang = className?.replace('language-', '') || '';
            return (
              <pre className="bg-gray-800 text-gray-100 rounded-lg p-3 my-2 overflow-x-auto text-xs">
                {lang && <div className="text-gray-400 mb-1 text-[10px]">{lang}</div>}
                <code>{children}</code>
              </pre>
            );
          },
          a({ href, children }) {
            return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline hover:text-blue-700">{children}</a>;
          },
          h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
          p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
          li: ({ children, checked }) => {
            if (checked !== undefined && checked !== null) {
              return (
                <li className="flex items-start gap-1.5 text-xs">
                  <span className={`mt-0.5 ${checked ? 'text-green-500' : 'text-gray-400'}`}>
                    <i className={`fas ${checked ? 'fa-check-square' : 'fa-square'} text-[10px]`}></i>
                  </span>
                  <span className={checked ? 'line-through text-gray-400' : ''}>{children}</span>
                </li>
              );
            }
            return <li>{children}</li>;
          },
          blockquote: ({ children }) => <blockquote className="border-l-3 border-gray-300 pl-3 text-gray-600 my-2">{children}</blockquote>,
          hr: () => <hr className="border-gray-200 my-3" />,
          table: ({ children }) => <table className="border-collapse text-xs my-2 w-full">{children}</table>,
          th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-100 font-semibold text-left">{children}</th>,
          td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {cleanContent}
      </ReactMarkdown>
    </>
  );
}

export function ChatMessage({ message, stepIndex }: ChatMessageProps) {
  const [toolExpanded, setToolExpanded] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);

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
          {message.thinkingContent && (
            <ThinkingSection content={message.thinkingContent} />
          )}
          <div className="prose prose-sm max-w-none">
            <MessageContent content={message.content} />
          </div>
        </div>
      </div>
    );
  }

  if (message.role === 'tool_call') {
    const toolName = message.toolCall?.name || 'unknown';
    const toolArgs = message.toolCall?.arguments || '';
    const hasResult = !!message.resultContent;
    const displayName = toolName.startsWith('mcp__playwright__') ? toolName.slice('mcp__playwright__'.length) : toolName;

    const argSummary = getArgSummary(toolArgs);

    return (
      <div className="flex justify-start mb-2">
        <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs border ${hasResult ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
          <button
            onClick={() => setToolExpanded(!toolExpanded)}
            className="flex items-center gap-1.5 w-full text-left"
          >
            {stepIndex !== undefined && (
              <span className={`text-[10px] font-mono ${hasResult ? 'text-blue-400' : 'text-amber-400'}`}>
                #{stepIndex}
              </span>
            )}
            <i className={`fas ${hasResult ? 'fa-check-circle text-blue-500' : 'fa-wrench text-amber-500'}`}></i>
            <span className={`font-medium ${hasResult ? 'text-blue-700' : 'text-amber-700'}`}>
              {displayName}
            </span>
            {!toolExpanded && argSummary && (
              <span className={`truncate max-w-[200px] ${hasResult ? 'text-blue-500' : 'text-amber-500'}`}>
                {argSummary}
              </span>
            )}
            {hasResult && (
              <span className="text-blue-400 text-[10px]">done</span>
            )}
            <i className={`fas fa-chevron-${toolExpanded ? 'up' : 'down'} ${hasResult ? 'text-blue-400' : 'text-amber-400'} ml-auto text-[10px]`}></i>
          </button>
          {toolExpanded && (
            <div className="mt-1.5 space-y-1.5">
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">Parameters</div>
                <pre className={`${hasResult ? 'text-blue-800 bg-blue-100/50' : 'text-amber-800 bg-amber-100/50'} rounded p-2 overflow-x-auto whitespace-pre-wrap break-all`}>
                  {formatToolArgs(toolArgs)}
                </pre>
              </div>
              {hasResult && (
                <div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setResultExpanded(!resultExpanded); }}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 mb-0.5"
                  >
                    <i className={`fas fa-chevron-${resultExpanded ? 'up' : 'right'} text-[8px]`}></i>
                    Result
                  </button>
                  {resultExpanded && (
                    <pre className="text-green-800 bg-green-100/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                      {message.resultContent!.slice(0, 2000)}
                    </pre>
                  )}
                </div>
              )}
            </div>
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

/** 提取工具参数简要摘要 */
function getArgSummary(argsStr: string): string {
  try {
    const parsed = JSON.parse(argsStr);
    const priorityKeys = ['filePath', 'fileName', 'path', 'url', 'selector', 'name', 'command', 'query', 'testName'];
    for (const key of priorityKeys) {
      if (parsed[key] && typeof parsed[key] === 'string') {
        const val = parsed[key] as string;
        return val.length > 40 ? val.slice(0, 40) + '...' : val;
      }
    }
    for (const val of Object.values(parsed)) {
      if (typeof val === 'string' && (val as string).length > 0) {
        const strVal = val as string;
        return strVal.length > 40 ? strVal.slice(0, 40) + '...' : strVal;
      }
    }
    return '';
  } catch {
    return '';
  }
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
