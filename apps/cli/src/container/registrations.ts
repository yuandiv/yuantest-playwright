import * as path from 'path';
import { ServiceContainer, MutableRef, TOKENS } from '@yuantest/core';
import { getStorage, type StorageProvider } from '@yuantest/core';
import { TestDiscovery } from '../discovery';
import { PlaywrightConfigMerger } from '@yuantest/core';
import { loadLLMConfig } from '@yuantest/core';
import { LRUCache } from '@yuantest/core';
import { ToolRegistry } from '../ai/agents/tool-registry';
import { LLMService } from '../ai/agents/llm-service';
import { UnifiedAIService } from '../ai/ai-service';
import { MCPConfigService } from '../ai/mcp/config-service';
import { MCPClientManager } from '../ai/mcp/client-manager';
import { DiagnosisAgent } from '../ai/agents/diagnosis';
import { FlakyTestManager } from '../flaky';
import { Reporter } from '../reporter';
import { RealtimeReporter } from '../realtime';
import { TraceManager } from '../trace';
import { ArtifactManager } from '../artifacts';
import { AnnotationManager } from '../annotations';
import { TagManager } from '../tags';
import { VisualTestingManager } from '../visual';
import type { LLMConfig } from '@yuantest/contracts';

export interface ContainerOptions {
  port: number;
  outputDir: string;
  dataDir: string;
}

export function registerCoreServices(container: ServiceContainer, options: ContainerOptions): void {
  container.register(TOKENS.Port, () => options.port);

  container.register(TOKENS.OutputDir, () => MutableRef.of(options.outputDir));
  container.register(TOKENS.DataDir, () => MutableRef.of(options.dataDir));
  container.register(TOKENS.TestDir, () => MutableRef.of('./'));

  container.register(TOKENS.StorageProvider, () => getStorage(), 'singleton');
  container.register(
    TOKENS.LRUCache,
    () =>
      new LRUCache({
        maxSize: process.env.CACHE_MAX_SIZE ? parseInt(process.env.CACHE_MAX_SIZE, 10) : 100,
      }),
    'singleton'
  );
  container.register(TOKENS.TestDiscovery, () => new TestDiscovery(), 'singleton');
  container.register(
    TOKENS.PlaywrightConfigMerger,
    (c) => new PlaywrightConfigMerger(c.resolve<StorageProvider>(TOKENS.StorageProvider)),
    'singleton'
  );

  container.register(TOKENS.LLMConfig, () => {
    return loadLLMConfig() as LLMConfig | undefined;
  });

  container.register(
    TOKENS.ToolRegistry,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      return ToolRegistry.createDefaultRegistry(dataDir.current, process.cwd());
    },
    'singleton'
  );

  container.register(
    TOKENS.LLMService,
    (c) => {
      const config = c.resolve<LLMConfig | undefined>(TOKENS.LLMConfig);
      return config ? new LLMService(config) : null;
    },
    'singleton'
  );

  // ─── MCP 服务 ──────────────────────────────────────────────────────

  container.register(TOKENS.MCPConfigService, () => new MCPConfigService(), 'singleton');

  container.register(
    TOKENS.MCPClientManager,
    (c) => {
      return new MCPClientManager(process.cwd());
    },
    'singleton'
  );

  // ─── UnifiedAIService（合并 ChatService + AgentService） ────────────

  container.register(
    TOKENS.UnifiedAIService,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      const llmConfig = c.resolve<LLMConfig | undefined>(TOKENS.LLMConfig);
      const llmService = c.resolve<LLMService | null>(TOKENS.LLMService);
      const toolRegistry = c.resolve<ToolRegistry>(TOKENS.ToolRegistry);
      const mcpConfigService = c.resolve<MCPConfigService>(TOKENS.MCPConfigService);
      const mcpClientManager = c.resolve<MCPClientManager>(TOKENS.MCPClientManager);
      return new UnifiedAIService(
        dataDir.current,
        process.cwd(),
        toolRegistry,
        llmConfig,
        llmService ?? undefined,
        mcpConfigService,
        mcpClientManager
      );
    },
    'singleton'
  );

  // 旧 token 作为 alias 指向同一 UnifiedAIService 实例（Phase 4 迁移完成前保留兼容）
  container.register(TOKENS.AgentService, (c) =>
    c.resolve<UnifiedAIService>(TOKENS.UnifiedAIService)
  );
  container.register(TOKENS.ChatService, (c) =>
    c.resolve<UnifiedAIService>(TOKENS.UnifiedAIService)
  );

  container.register(
    TOKENS.DiagnosisService,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      const llmService = c.resolve<LLMService | null>(TOKENS.LLMService);
      const toolRegistry = c.resolve<ToolRegistry>(TOKENS.ToolRegistry);
      // 创建 DiagnosisAgent 实例
      const { DiagnosisAgent } = require('../ai/agents/diagnosis');
      const diagnosisAgent = new DiagnosisAgent(
        {
          enabled: true,
          loopTarget: 'vscode',
          specsDir: 'specs',
          autoHeal: false,
          maxHealRounds: 3,
          projectRoot: process.cwd(),
        },
        llmService?.getConfig() ?? null,
        llmService ?? undefined,
        dataDir.current
      );
      return diagnosisAgent;
    },
    'singleton'
  );

  container.register(
    TOKENS.FlakyTestManager,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      const storage = c.resolve<StorageProvider>(TOKENS.StorageProvider);
      return new FlakyTestManager(dataDir.current, {}, storage);
    },
    'singleton'
  );

  container.register(
    TOKENS.Reporter,
    (c) => {
      const outputDir = c.resolve<MutableRef<string>>(TOKENS.OutputDir);
      const storage = c.resolve<StorageProvider>(TOKENS.StorageProvider);
      const diagnosisService = c.resolve<DiagnosisAgent>(TOKENS.DiagnosisService);
      const flakyManager = c.resolve<FlakyTestManager>(TOKENS.FlakyTestManager);
      return new Reporter(outputDir.current, storage, diagnosisService, flakyManager);
    },
    'singleton'
  );

  container.register(TOKENS.RealtimeReporter, () => new RealtimeReporter(), 'singleton');

  container.register(
    TOKENS.TraceManager,
    (c) => {
      const outputDir = c.resolve<MutableRef<string>>(TOKENS.OutputDir);
      return new TraceManager(
        {
          enabled: true,
          mode: 'on',
          screenshots: true,
          snapshots: true,
          sources: true,
          attachments: true,
        },
        path.join(outputDir.current, 'test-results')
      );
    },
    'singleton'
  );

  container.register(
    TOKENS.ArtifactManager,
    (c) => {
      const outputDir = c.resolve<MutableRef<string>>(TOKENS.OutputDir);
      return new ArtifactManager(
        { enabled: true, screenshots: 'on', videos: 'on' },
        path.join(outputDir.current, 'test-results')
      );
    },
    'singleton'
  );

  container.register(TOKENS.AnnotationManager, () => new AnnotationManager(), 'singleton');
  container.register(TOKENS.TagManager, () => new TagManager(), 'singleton');

  container.register(
    TOKENS.VisualTestingManager,
    (c) => {
      const outputDir = c.resolve<MutableRef<string>>(TOKENS.OutputDir);
      return new VisualTestingManager(
        {
          enabled: true,
          threshold: 0.2,
          maxDiffPixelRatio: 0.01,
          maxDiffPixels: 10,
          updateSnapshots: false,
        },
        path.join(outputDir.current, '../visual-testing')
      );
    },
    'singleton'
  );
}
