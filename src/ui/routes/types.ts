import type { UnifiedAIService } from '../../ai/ai-service';
import type { Router } from 'express';
import type { Executor } from '../../executor';
import type { Reporter } from '../../reporter';
import type { RealtimeReporter } from '../../realtime';
import type { FlakyTestManager } from '../../flaky';
import type { DiagnosisAgent } from '../../ai/agents/diagnosis';
import type { TestDiscovery } from '../../discovery';
import type { LRUCache } from '../../cache';
import type { StorageProvider } from '../../storage';
import type { PlaywrightConfigMerger } from '../../config/merger';
import type { TraceManager } from '../../trace';
import type { ArtifactManager } from '../../artifacts';
import type { AnnotationManager } from '../../annotations';
import type { TagManager } from '../../tags';
import type { VisualTestingManager } from '../../visual';
import type { TestResult } from '../../types';

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
  processRunAttachmentPaths: (run: import('../../types').RunResult) => void;
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
