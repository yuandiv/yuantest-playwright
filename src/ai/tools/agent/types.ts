/**
 * Agent 工具上下文 — 封装 UnifiedAIService 中 Agent 工具所需的所有依赖
 */
import type { LLMService } from '../../agents/llm-service';
import type { ToolRegistry } from '../../agents/tool-registry';
import type { DiagnosisAgent } from '../../agents/diagnosis';

export interface AgentToolContext {
  dataDir: string;
  projectRoot: string;
  llmService: LLMService | null;
  toolRegistry: ToolRegistry;
  /** 共享的诊断 Agent 实例（避免每次调用新建 DiagnosisAgent/Service） */
  diagnosisAgent: DiagnosisAgent | null;
  /** agent_generate 触发后需设为 true，以便后续保存代码 */
  setGenerateTriggered: (v: boolean) => void;
  /** agent_heal 直接委托 */
  heal: (
    testFilePath: string,
    options?: {
      runId?: string;
      testId?: string;
      error?: string;
      stackTrace?: string;
    }
  ) => Promise<any>;
}
