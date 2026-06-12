export const TOKENS = {
  StorageProvider: Symbol.for('StorageProvider'),
  LRUCache: Symbol.for('LRUCache'),
  TestDiscovery: Symbol.for('TestDiscovery'),
  PlaywrightConfigMerger: Symbol.for('PlaywrightConfigMerger'),

  LLMConfig: Symbol.for('LLMConfig'),
  LLMService: Symbol.for('LLMService'),
  ToolRegistry: Symbol.for('ToolRegistry'),
  AgentService: Symbol.for('AgentService'),
  ChatService: Symbol.for('ChatService'),
  UnifiedAIService: Symbol.for('UnifiedAIService'),
  MCPConfigService: Symbol.for('MCPConfigService'),
  MCPClientManager: Symbol.for('MCPClientManager'),

  DiagnosisService: Symbol.for('DiagnosisService'),
  FlakyTestManager: Symbol.for('FlakyTestManager'),
  Reporter: Symbol.for('Reporter'),
  RealtimeReporter: Symbol.for('RealtimeReporter'),

  TraceManager: Symbol.for('TraceManager'),
  ArtifactManager: Symbol.for('ArtifactManager'),
  AnnotationManager: Symbol.for('AnnotationManager'),
  TagManager: Symbol.for('TagManager'),
  VisualTestingManager: Symbol.for('VisualTestingManager'),

  Port: Symbol.for('Port'),
  OutputDir: Symbol.for('OutputDir'),
  DataDir: Symbol.for('DataDir'),
  TestDir: Symbol.for('TestDir'),
} as const;

export type ServiceToken = (typeof TOKENS)[keyof typeof TOKENS];
