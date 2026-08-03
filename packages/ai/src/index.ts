/**
 * @yuantest/ai — LLM 能力层（唯一 AI 包）
 *
 * 职责：agents（planner/generator/healer/diagnosis）、chat、mcp、tools、ai-service。
 * 依赖：contracts、core、diagnosis（知识库/缓存/持久化）；
 * 执行能力经 ITestExecutor 注入（execute 工具不直接 new Executor）。
 */
export { AgentService } from './agents';
export { PlannerAgent, PLANNER_SYSTEM_PROMPT_ZH, PLANNER_SYSTEM_PROMPT_EN, PLANNER_FEW_SHOT_ZH, PLANNER_FEW_SHOT_EN } from './agents/planner';
export { GeneratorAgent } from './agents/generator';
export { HealerAgent } from './agents/healer';
export { DiagnosisAgent } from './agents/diagnosis';
export { BaseAgent } from './agents/base-agent';
export { ChatService } from './chat/chat-service';
export { ConversationStore } from './chat/conversation-store';
export type { ChatMessage, Conversation, ConversationSummary } from './chat/conversation-store';
export { UnifiedAIService } from './ai-service';
export type { SSEEvent } from './ai-service';
export { MCPClientManager, MCPConfigService, MCPPreset, BUILTIN_MCP_PRESETS } from './mcp';
export type { MCPToolInfo, MCPServerStatus, MCPConnectionStatus } from './mcp';
export { ToolRegistry } from './agents/tool-registry';
export { LLMService } from './agents/llm-service';
export type { LLMChatOptions, TokenUsage, LLMChatResult, ToolCallInfo, LLMChatMessage } from './agents/llm-service';
export { AgentOutputParser } from './agents/output-parser';
export { TokenBudget } from './agents/token-budget';
export type { TokenBudgetOptions } from './agents/token-budget';
export { AGENT_EVENT } from './agents/agent-events';
export type { AgentStart, AgentToken, AgentThinking, AgentToolCall, AgentToolResult, AgentMessage } from './agents/agent-events';
export type { AgentContext, AgentMessageEvent, AgentPersistEvent, AgentErrorEvent, AgentHooks } from './agents/agent-hooks';
export { DiagnosisCacheHook } from './agents/diagnosis-cache-hook';
export { DiagnosisPersisterHook } from './agents/diagnosis-persister-hook';
export type { ToolSchema, ToolDefinition, ToolInfo } from './tools';
