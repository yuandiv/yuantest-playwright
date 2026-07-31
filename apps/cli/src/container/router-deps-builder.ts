import type { ServiceContainer } from '@yuantest/core';
import { MutableRef, TOKENS } from '@yuantest/core';
import type { RouterDeps } from '../ui/routes/types';
import type { Executor } from '../executor';
import type { Reporter } from '../reporter';
import type { FlakyTestManager } from '../flaky';
import type { TraceManager } from '../trace';
import type { ArtifactManager } from '../artifacts';
import type { VisualTestingManager } from '../visual';
import type { TestResult } from '@yuantest/contracts';

export interface RouterDepsCallbacks {
  executor: { current: Executor | null };
  processAttachmentPath: (p: string) => string;
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
  testResultBuffer: Array<{ result: TestResult; suiteName: string }>;
  testResultBufferTimer: { current: NodeJS.Timeout | null };
  flushTestResultBuffer: () => void;
  TEST_RESULT_BATCH_SIZE: number;
  TEST_RESULT_BATCH_INTERVAL: number;
}

export function buildRouterDeps(
  container: ServiceContainer,
  callbacks: RouterDepsCallbacks
): RouterDeps {
  const outputDir = container.resolve<MutableRef<string>>(TOKENS.OutputDir);
  const dataDir = container.resolve<MutableRef<string>>(TOKENS.DataDir);
  const testDir = container.resolve<MutableRef<string>>(TOKENS.TestDir);

  const reporter = container.resolve<Reporter>(TOKENS.Reporter);
  const flakyManager = container.resolve<FlakyTestManager>(TOKENS.FlakyTestManager);
  const traceManager = container.resolve<TraceManager>(TOKENS.TraceManager);
  const artifactManager = container.resolve<ArtifactManager>(TOKENS.ArtifactManager);
  const visualManager = container.resolve<VisualTestingManager>(TOKENS.VisualTestingManager);

  return {
    executor: callbacks.executor,
    reporter: MutableRef.of(reporter),
    realtimeReporter: container.resolve(TOKENS.RealtimeReporter),
    flakyManager: MutableRef.of(flakyManager),
    diagnosisService: container.resolve(TOKENS.DiagnosisService),
    aiService: container.resolve(TOKENS.UnifiedAIService),
    testDiscovery: container.resolve(TOKENS.TestDiscovery),
    cache: container.resolve(TOKENS.LRUCache),
    storage: container.resolve(TOKENS.StorageProvider),
    configMerger: container.resolve(TOKENS.PlaywrightConfigMerger),
    traceManager: MutableRef.of(traceManager),
    artifactManager: MutableRef.of(artifactManager),
    annotationManager: container.resolve(TOKENS.AnnotationManager),
    tagManager: container.resolve(TOKENS.TagManager),
    visualManager: MutableRef.of(visualManager),
    outputDir,
    dataDir,
    testDir,
    processAttachmentPath: callbacks.processAttachmentPath,
    processRunAttachmentPaths: callbacks.processRunAttachmentPaths,
    isPathSafe: callbacks.isPathSafe,
    discoverFilesInDir: callbacks.discoverFilesInDir,
    invalidateAllCache: callbacks.invalidateAllCache,
    saveCustomErrorPatterns: callbacks.saveCustomErrorPatterns,
    findTestInfoByRunId: callbacks.findTestInfoByRunId,
    resolveTestDirFromPlaywrightConfig: callbacks.resolveTestDirFromPlaywrightConfig,
    updatePathsForTestDir: callbacks.updatePathsForTestDir,
    testResultBuffer: callbacks.testResultBuffer,
    testResultBufferTimer: callbacks.testResultBufferTimer,
    flushTestResultBuffer: callbacks.flushTestResultBuffer,
    TEST_RESULT_BATCH_SIZE: callbacks.TEST_RESULT_BATCH_SIZE,
    TEST_RESULT_BATCH_INTERVAL: callbacks.TEST_RESULT_BATCH_INTERVAL,
  };
}
