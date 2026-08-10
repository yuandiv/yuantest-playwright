/**
 * Agent 工具上下文 — 封装 UnifiedAIService 中 Agent 工具所需的所有依赖
 */
import type { LLMService } from '../../agents/llm-service';
import type { ToolRegistry } from '../../agents/tool-registry';
import type { DiagnosisAgent } from '../../agents/diagnosis';
import type { ITestExecutor } from '@yuantest/contracts';

export interface AgentToolContext {
  dataDir: string;
  projectRoot: string;
  llmService: LLMService | null;
  toolRegistry: ToolRegistry;
  /** 共享的诊断 Agent 实例（避免每次调用新建 DiagnosisAgent/Service） */
  diagnosisAgent: DiagnosisAgent | null;
  /** 执行器能力（经注入，agent_execute 工具不直接 new Executor；未配置时为 null） */
  executor: ITestExecutor | null;
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
