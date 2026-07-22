/**
 * TokenBudget —— 单次 Agent Loop 的 Token 配额追踪器
 *
 * 职责：
 * - 累积每次 LLM 调用消耗的 prompt/completion/total tokens
 * - 暴露 isExceeded() 判断是否超过预算
 * - 支持 maxToolCalls 工具调用次数限制（防止死循环）
 *
 * 设计动机：参考 anything-llm Aibitat 的 maxToolCalls / maxRounds 配额机制，
 * 避免 Agent 在工具调用循环中无限消耗 Token。
 */
import { TokenUsage } from './llm-service';

export interface TokenBudgetOptions {
  /** 单次 Agent Loop 允许的最大工具调用次数（含首次），默认 10 */
  maxToolCalls?: number;
  /** 单次 Agent Loop 允许的最大累计 total tokens，默认 100_000 */
  maxTotalTokens?: number;
}

export class TokenBudget {
  /** 最大工具调用次数（含首次模型响应触发的工具调用） */
  readonly maxToolCalls: number;
  /** 最大累计 total tokens */
  readonly maxTotalTokens: number;

  private promptTokens = 0;
  private completionTokens = 0;
  private totalTokens = 0;
  /** 已执行的工具调用次数 */
  private toolCallCount = 0;

  constructor(options: TokenBudgetOptions = {}) {
    this.maxToolCalls = options.maxToolCalls ?? 10;
    this.maxTotalTokens = options.maxTotalTokens ?? 100_000;
  }

  /** 累加一次 LLM 调用的 token 用量 */
  accumulate(usage?: TokenUsage): void {
    if (!usage) {
      return;
    }
    this.promptTokens += usage.promptTokens;
    this.completionTokens += usage.completionTokens;
    this.totalTokens += usage.totalTokens;
  }

  /** 记录已执行的工具调用次数（每次工具执行后调用） */
  recordToolCall(): void {
    this.toolCallCount++;
  }

  /** 已执行的工具调用次数 */
  get toolCallsExecuted(): number {
    return this.toolCallCount;
  }

  /** 工具调用次数是否已达上限 */
  isToolCallLimitReached(): boolean {
    return this.toolCallCount >= this.maxToolCalls;
  }

  /** Token 总量是否已达上限 */
  isTokenLimitReached(): boolean {
    return this.totalTokens >= this.maxTotalTokens;
  }

  /** 任一配额超限 */
  isExceeded(): boolean {
    return this.isToolCallLimitReached() || this.isTokenLimitReached();
  }

  /** 获取累计 token 用量（未调用过 LLM 时返回 undefined） */
  getTotalUsage(): TokenUsage | undefined {
    if (this.totalTokens === 0) {
      return undefined;
    }
    return {
      promptTokens: this.promptTokens,
      completionTokens: this.completionTokens,
      totalTokens: this.totalTokens,
    };
  }

  /** 重置预算（用于复用同一实例） */
  reset(): void {
    this.promptTokens = 0;
    this.completionTokens = 0;
    this.totalTokens = 0;
    this.toolCallCount = 0;
  }
}
