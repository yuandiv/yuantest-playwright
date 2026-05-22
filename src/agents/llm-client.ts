import { LLMConfig } from '../types';
import { LLMService, LLMChatOptions, LLMChatResult } from './llm-service';

// Re-export types for backward compatibility
export type { LLMChatOptions, LLMChatResult };

/**
 * LLM 客户端（轻量封装，内部委托给 LLMService）
 * 保持 API 兼容性，现有代码无需修改
 *
 * @deprecated 请直接使用 LLMService，LLMClient 将在后续版本中移除。
 * BaseAgent 已直接使用 LLMService，新代码应避免依赖此类。
 */
export class LLMClient {
  private service: LLMService;

  constructor(config: LLMConfig) {
    this.service = new LLMService(config);
  }

  updateConfig(config: LLMConfig): void {
    this.service.updateConfig(config);
  }

  getConfig(): LLMConfig {
    return this.service.getConfig();
  }

  async chat(options: LLMChatOptions): Promise<LLMChatResult> {
    return this.service.chat(options);
  }
}
