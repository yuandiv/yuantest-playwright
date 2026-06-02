import * as path from 'path';
import * as fs from 'fs';
import { ServiceContainer } from './service-container';
import { MutableRef } from './mutable-ref';
import { TOKENS } from './tokens';
import { getStorage, type StorageProvider } from '../storage';
import { TestDiscovery } from '../discovery';
import { PlaywrightConfigMerger } from '../config/merger';
import { LRUCache } from '../cache';
import { ToolRegistry } from '../agents/tool-registry';
import { LLMService } from '../agents/llm-service';
import { AgentService } from '../agents';
import { ChatService } from '../chat/chat-service';
import { MCPConfigService } from '../ui/services/mcp-config-service';
import { DiagnosisService } from '../diagnosis';
import { FlakyTestManager } from '../flaky';
import { Reporter } from '../reporter';
import { RealtimeReporter } from '../realtime';
import { TraceManager } from '../trace';
import { ArtifactManager } from '../artifacts';
import { AnnotationManager } from '../annotations';
import { TagManager } from '../tags';
import { VisualTestingManager } from '../visual';
import type { LLMConfig } from '../types';

export interface ContainerOptions {
  port: number;
  outputDir: string;
  dataDir: string;
}

function loadLLMConfig(dataDir: string): LLMConfig | undefined {
  try {
    const llmConfigPath = path.join(dataDir, 'llm-config.json');
    if (fs.existsSync(llmConfigPath)) {
      const llmContent = fs.readFileSync(llmConfigPath, 'utf-8');
      const parsed = JSON.parse(llmContent);
      if (parsed && parsed.enabled) {
        return parsed;
      }
    }
  } catch {
    // LLM 配置文件不存在或解析失败
  }
  return undefined;
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

  container.register(TOKENS.LLMConfig, (c) => {
    const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
    return loadLLMConfig(dataDir.current);
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

  container.register(
    TOKENS.AgentService,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      const llmConfig = c.resolve<LLMConfig | undefined>(TOKENS.LLMConfig);
      const llmService = c.resolve<LLMService | null>(TOKENS.LLMService);
      const toolRegistry = c.resolve<ToolRegistry>(TOKENS.ToolRegistry);
      return new AgentService(
        dataDir.current,
        undefined,
        llmConfig,
        llmService ?? undefined,
        toolRegistry
      );
    },
    'singleton'
  );

  container.register(
    TOKENS.MCPConfigService,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      return new MCPConfigService({ dataDir: dataDir.current });
    },
    'singleton'
  );

  container.register(
    TOKENS.ChatService,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      const llmConfig = c.resolve<LLMConfig | undefined>(TOKENS.LLMConfig);
      const llmService = c.resolve<LLMService | null>(TOKENS.LLMService);
      const toolRegistry = c.resolve<ToolRegistry>(TOKENS.ToolRegistry);
      const mcpConfigService = c.resolve<MCPConfigService>(TOKENS.MCPConfigService);
      return new ChatService(
        dataDir.current,
        process.cwd(),
        toolRegistry,
        llmConfig,
        llmService ?? undefined,
        mcpConfigService
      );
    },
    'singleton'
  );

  container.register(
    TOKENS.DiagnosisService,
    (c) => {
      const dataDir = c.resolve<MutableRef<string>>(TOKENS.DataDir);
      const llmService = c.resolve<LLMService | null>(TOKENS.LLMService);
      const toolRegistry = c.resolve<ToolRegistry>(TOKENS.ToolRegistry);
      return new DiagnosisService(dataDir.current, llmService ?? undefined, toolRegistry);
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
      const diagnosisService = c.resolve<DiagnosisService>(TOKENS.DiagnosisService);
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
