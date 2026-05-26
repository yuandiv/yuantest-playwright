import { LLMConfig } from '../types';
import { LLMService, LLMChatOptions, LLMChatResult } from './llm-service';

// Re-export types for backward compatibility
export type { LLMChatOptions, LLMChatResult };

/**
 * LLM 客户端（轻量封装，内部委托给 LLMService）
 *
 * @deprecated 请直接使用 LLMService。此类仅保留用于向后兼容测试，
 * 将在下一个主要版本中移除。所有新代码应直接使用 LLMService。
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
