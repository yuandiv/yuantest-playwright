import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@yuantest/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  /** 工具调用信息（仅 tool_call 类型） */
  toolCall?: {
    name: string;
    arguments: string;
    /** 工具调用 id（用于与 tool_result 的 toolCallId 关联；旧数据可能缺失） */
    id?: string;
  };
  /** 工具调用结果信息（仅 tool_result 类型） */
  toolResult?: {
    toolCallId: string;
    name: string;
    success: boolean;
  };
  /** 模型思考内容（仅 assistant 类型，来自 reasoning_content 或 <arg_key> 标签） */
  thinkingContent?: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─── ConversationStore ────────────────────────────────────────────────────────

export class ConversationStore {
  private dataDir: string;
  private conversationsDir: string;
  private log = logger.child('ConversationStore');
  /** 内存缓存：避免每次 get 全量读盘 */
  private cache = new Map<string, Conversation>();
  /** 待落盘的会话 id 集合（防抖合并写） */
  private dirtyIds = new Set<string>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /** 防抖落盘延迟（ms） */
  private static readonly FLUSH_DELAY_MS = 100;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.conversationsDir = path.join(dataDir, 'chat', 'conversations');
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.conversationsDir)) {
      fs.mkdirSync(this.conversationsDir, { recursive: true });
    }
  }

  private getFilePath(id: string): string {
    return path.join(this.conversationsDir, `${id}.json`);
  }

  /** 创建新会话 */
  create(title?: string): Conversation {
    const now = Date.now();
    const conversation: Conversation = {
      id: generateId(),
      title: title || `会话 ${now.toLocaleString()}`,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.cache.set(conversation.id, conversation);
    this.scheduleFlush(conversation.id);
    return conversation;
  }

  /** 获取会话（优先内存缓存，未命中才读盘） */
  get(id: string): Conversation | null {
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const conversation = JSON.parse(content) as Conversation;
      this.cache.set(id, conversation);
      return conversation;
    } catch (error) {
      this.log.warn(
        `Failed to read conversation ${id}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  /** 获取所有会话摘要列表（按更新时间倒序） */
  list(): ConversationSummary[] {
    this.ensureDir();
    // 先落盘未写入的脏会话，确保 list 能看到最新数据
    this.flush();
    const summaries: ConversationSummary[] = [];

    try {
      const files = fs.readdirSync(this.conversationsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(this.conversationsDir, file), 'utf-8');
          const conv = JSON.parse(content) as Conversation;
          summaries.push({
            id: conv.id,
            title: conv.title,
            messageCount: conv.messages.length,
            createdAt: conv.createdAt,
            updatedAt: conv.updatedAt,
          });
        } catch {
          // 跳过无法解析的文件
        }
      }
    } catch {
      // 目录不存在或无法读取
    }

    return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** 保存会话：更新内存缓存并调度防抖落盘（避免每次全量写盘） */
  save(conversation: Conversation): void {
    conversation.updatedAt = Date.now();
    this.cache.set(conversation.id, conversation);
    this.scheduleFlush(conversation.id);
  }

  /** 调度防抖落盘：合并短时间内的多次写入 */
  private scheduleFlush(id: string): void {
    this.dirtyIds.add(id);
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, ConversationStore.FLUSH_DELAY_MS);
  }

  /** 立即落盘所有脏会话（供 list / 进程退出前调用） */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.dirtyIds.size === 0) {
      return;
    }
    for (const id of this.dirtyIds) {
      const conversation = this.cache.get(id);
      if (!conversation) {
        continue;
      }
      try {
        const filePath = this.getFilePath(id);
        fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
      } catch (error) {
        this.log.warn(
          `Failed to save conversation ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    this.dirtyIds.clear();
  }

  /** 删除会话（同时清理内存缓存与待落盘标记） */
  delete(id: string): boolean {
    this.cache.delete(id);
    this.dirtyIds.delete(id);
    const filePath = this.getFilePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /** 添加消息到会话 */
  addMessage(conversationId: string, message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const conversation = this.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const chatMessage: ChatMessage = {
      ...message,
      id: generateId(),
      timestamp: Date.now(),
    };

    conversation.messages.push(chatMessage);
    this.save(conversation);
    return chatMessage;
  }

  /** 更新会话标题 */
  updateTitle(conversationId: string, title: string): boolean {
    const conversation = this.get(conversationId);
    if (!conversation) {
      return false;
    }
    conversation.title = title;
    this.save(conversation);
    return true;
  }
}
