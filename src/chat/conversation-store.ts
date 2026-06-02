import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result';
  content: string;
  /** 工具调用信息（仅 tool_call 类型） */
  toolCall?: {
    name: string;
    arguments: string;
  };
  /** 工具调用结果信息（仅 tool_result 类型） */
  toolResult?: {
    toolCallId: string;
    name: string;
    success: boolean;
  };
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
    this.save(conversation);
    return conversation;
  }

  /** 获取会话 */
  get(id: string): Conversation | null {
    const filePath = this.getFilePath(id);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as Conversation;
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

  /** 保存会话 */
  save(conversation: Conversation): void {
    conversation.updatedAt = Date.now();
    const filePath = this.getFilePath(conversation.id);
    fs.writeFileSync(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  /** 删除会话 */
  delete(id: string): boolean {
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
