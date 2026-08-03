import type { UnifiedAIService } from '@yuantest/ai';
import type { Router } from 'express';
import type { Executor } from '@yuantest/executor';
import type { Reporter } from '@yuantest/reporter';
import type { RealtimeReporter } from '@yuantest/reporter';
import type { FlakyTestManager } from '@yuantest/flaky';
import type { DiagnosisAgent } from '@yuantest/ai';
import type { TestDiscovery } from '@yuantest/executor';
import type { LRUCache } from '@yuantest/core';
import type { StorageProvider } from '@yuantest/core';
import type { PlaywrightConfigMerger } from '@yuantest/core';
import type { TraceManager } from '@yuantest/executor';
import type { ArtifactManager } from '@yuantest/reporter';
import type { AnnotationManager } from '@yuantest/reporter';
import type { TagManager } from '@yuantest/reporter';
import type { VisualTestingManager } from '@yuantest/reporter';
import type { TestResult } from '@yuantest/contracts';

export interface RouterDeps {
  // Core services
  executor: { current: Executor | null };
  reporter: { current: Reporter };
  realtimeReporter: RealtimeReporter;
  flakyManager: { current: FlakyTestManager };
  diagnosisService: DiagnosisAgent;
  aiService: UnifiedAIService;
  testDiscovery: TestDiscovery;

  // Utility services
  cache: LRUCache<unknown>;
  storage: StorageProvider;
  configMerger: PlaywrightConfigMerger;

  // Artifact managers
  traceManager: { current: TraceManager };
  artifactManager: { current: ArtifactManager };
  annotationManager: AnnotationManager;
  tagManager: TagManager;
  visualManager: { current: VisualTestingManager };

  // Configuration
  outputDir: { current: string };
  dataDir: { current: string };
  testDir: { current: string };

  // Shared helpers
  processAttachmentPath: (path: string) => string;
  processRunAttachmentPaths: (run: import('@yuantest/contracts').RunResult) => void;
  isPathSafe: (path: string) => boolean;
  discoverFilesInDir: (dir: string, extensions: string[]) => string[];
  invalidateAllCache: () => void;
  saveCustomErrorPatterns: () => Promise<void>;
  findTestInfoByRunId: (
    runId: string,
    testTitle?: string,
    file?: string,
    line?: number
  ) => Promise<TestResult | null>;
  resolveTestDirFromPlaywrightConfig: () => Promise<string>;
  updatePathsForTestDir: (testDir: string) => Promise<void>;

  // Test result buffer
  testResultBuffer: Array<{ result: TestResult; suiteName: string }>;
  testResultBufferTimer: { current: NodeJS.Timeout | null };
  flushTestResultBuffer: () => void;
  readonly TEST_RESULT_BATCH_SIZE: number;
  readonly TEST_RESULT_BATCH_INTERVAL: number;
}

export type RouteFactory = (deps: RouterDeps) => Router;
