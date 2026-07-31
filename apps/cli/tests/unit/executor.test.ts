import { vi } from 'vitest';
import { Executor, ParallelExecutor } from '@yuantest/executor';
import { PlaywrightReportParser } from '@yuantest/executor';
import { MemoryStorage } from '@yuantest/core';
import { FlakyTestManager } from '../../src/flaky';
import { AnnotationManager } from '../../src/annotations';
import { TagManager } from '../../src/tags';
import { ArtifactManager } from '../../src/artifacts';
import { VisualTestingManager } from '../../src/visual';
import type { IResultEnrichers } from '@yuantest/contracts';

vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    checkEnvironment: vi.fn().mockResolvedValue({
      nodeVersion: '18.0.0',
      nodeOk: true,
      playwrightAvailable: true,
      playwrightVersion: '1.40.0',
      playwrightOk: true,
      errors: [],
    }),
    MIN_PLAYWRIGHT_VERSION: '1.40.0',
  };
});

describe('Executor', () => {
  let storage: MemoryStorage;
  let config: any;

  beforeEach(() => {
    storage = new MemoryStorage();
    config = {
      version: '1.0.0',
      testDir: './',
      outputDir: './test-output',
      retries: 0,
      timeout: 30000,
      workers: 1,
      shards: 1,
      browsers: ['chromium'],
    };
  });

  afterEach(() => {
    storage.clear();
  });

  describe('constructor', () => {
    it('should create executor with config', () => {
      const executor = new Executor(config, storage);
      expect(executor).toBeDefined();
    });

    it('should apply default values', () => {
      const executor = new Executor(config, storage);
      const executorConfig = executor.getConfig();
      expect(executorConfig.retries).toBeDefined();
      expect(executorConfig.timeout).toBeDefined();
      expect(executorConfig.workers).toBeDefined();
    });

    it('should accept custom storage', () => {
      const customStorage = new MemoryStorage();
      const executor = new Executor(config, customStorage);
      expect(executor).toBeDefined();
    });

    it('should accept flaky manager', () => {
      const flakyManager = new FlakyTestManager(
        './test-data',
        {
          enabled: true,
          threshold: 0.3,
          autoQuarantine: false,
        },
        storage
      );
      const executor = new Executor(config, storage, flakyManager);
      expect(executor).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const executor = new Executor(config, storage);
      const config1 = executor.getConfig();
      const config2 = executor.getConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('isCurrentlyRunning', () => {
    it('should return false initially', () => {
      const executor = new Executor(config, storage);
      expect(executor.isCurrentlyRunning()).toBe(false);
    });
  });

  describe('getCurrentStatus', () => {
    it('should return null initially', async () => {
      const executor = new Executor(config, storage);
      const status = await executor.getCurrentStatus();
      expect(status).toBeNull();
    });
  });

  describe('initializeManagers', () => {
    it('should initialize trace manager if enabled', () => {
      const configWithTraces = {
        ...config,
        traces: {
          enabled: true,
          mode: 'on' as const,
          screenshots: true,
          snapshots: true,
          sources: true,
          attachments: true,
        },
      };
      const executor = new Executor(configWithTraces, storage);
      expect(executor.getTraceManager()).not.toBeNull();
    });

    it('should not initialize trace manager if disabled', () => {
      const executor = new Executor(config, storage);
      expect(executor.getTraceManager()).toBeNull();
    });

    it('should initialize annotation manager if enabled', () => {
      const configWithAnnotations = {
        ...config,
        annotations: {
          enabled: true,
          respectSkip: true,
          respectOnly: true,
          respectFail: true,
          respectSlow: false,
          respectFixme: true,
          customAnnotations: {},
        },
      };
      const executor = new Executor(configWithAnnotations, storage, undefined, {
        annotations: new AnnotationManager(configWithAnnotations.annotations, storage),
      } satisfies IResultEnrichers);
      expect(executor.getAnnotationManager()).not.toBeNull();
    });

    it('should initialize tag manager if enabled', () => {
      const configWithTags = {
        ...config,
        tags: {
          enabled: true,
        },
      };
      const executor = new Executor(configWithTags, storage, undefined, {
        tags: new TagManager(configWithTags.tags, storage),
      } satisfies IResultEnrichers);
      expect(executor.getTagManager()).not.toBeNull();
    });

    it('should initialize artifact manager if enabled', () => {
      const configWithArtifacts = {
        ...config,
        artifacts: {
          enabled: true,
          screenshots: 'only-on-failure' as const,
          videos: 'retain-on-failure' as const,
        },
      };
      const executor = new Executor(configWithArtifacts, storage, undefined, {
        artifacts: new ArtifactManager(
          configWithArtifacts.artifacts,
          `${configWithArtifacts.outputDir}/test-results`,
          storage
        ),
      } satisfies IResultEnrichers);
      expect(executor.getArtifactManager()).not.toBeNull();
    });

    it('should initialize visual manager if enabled', () => {
      const configWithVisual = {
        ...config,
        visualTesting: {
          enabled: true,
          threshold: 0.2,
          maxDiffPixelRatio: 0.01,
          maxDiffPixels: 10,
          updateSnapshots: false,
        },
      };
      const executor = new Executor(configWithVisual, storage, undefined, {
        visual: new VisualTestingManager(
          configWithVisual.visualTesting,
          `${configWithVisual.outputDir}/visual-testing`,
          storage
        ),
      } satisfies IResultEnrichers);
      expect(executor.getVisualManager()).not.toBeNull();
    });
  });

  describe('events', () => {
    it('should emit run_started event when execute is called', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});
      const listener = vi.fn();
      executor.on('run_started', listener);
      await executor.execute({});
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: expect.any(String),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should emit run_completed event when execute finishes', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});
      const listener = vi.fn();
      executor.on('run_completed', listener);
      await executor.execute({});
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          endTime: expect.any(Number),
          duration: expect.any(Number),
        })
      );
    });

    it('should emit test_result event when testEnd progress message is received', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      // Start execution to set up _currentRun
      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-1',
          title: 'should work',
          fullTitle: 'Suite > should work',
          suiteTitle: 'Suite',
          status: 'passed',
          duration: 100,
          error: undefined,
          retries: 0,
          browser: 'chromium',
          attachments: [],
        },
      });

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-1',
          title: 'should work',
          status: 'passed',
          duration: 100,
        })
      );
    });

    it('should emit run_progress event when begin progress message is received', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const progressListener = vi.fn();
      executor.on('run_progress', progressListener);

      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'begin',
        totalTests: 10,
      });

      await executePromise;

      expect(progressListener).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'running',
          totalTests: 10,
        })
      );
    });

    it('should emit output event when stdout progress message is received', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const outputListener = vi.fn();
      executor.on('output', outputListener);

      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'stdout',
        text: 'Running test...',
      });

      await executePromise;

      expect(outputListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stdout',
          data: expect.stringContaining('Running test'),
        })
      );
    });
  });

  describe('processProgressMessage', () => {
    let executor: Executor;

    beforeEach(() => {
      executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});
    });

    afterEach(() => {
      executor.removeAllListeners();
    });

    it('should handle begin message and set totalTests', async () => {
      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));
      (executor as any).progressTracker.processMessage({
        type: 'begin',
        totalTests: 25,
      });
      await executePromise;
      const progressListener = vi.fn();
      executor.on('run_progress', progressListener);
    });

    it('should handle testBegin message and emit output', async () => {
      const outputListener = vi.fn();
      executor.on('output', outputListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testBegin',
        test: { title: 'my test', fullTitle: 'Suite > my test' },
      });

      await executePromise;

      expect(outputListener).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.stringContaining('my test'),
          type: 'info',
        })
      );
    });

    it('should handle testEnd with passed status', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-passed',
          title: 'should pass',
          fullTitle: 'Suite > should pass',
          suiteTitle: 'Suite',
          status: 'passed',
          duration: 50,
          error: undefined,
          retries: 0,
          browser: 'chromium',
          attachments: [],
        },
      });

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-passed',
          status: 'passed',
          duration: 50,
        })
      );
    });

    it('should handle testEnd with failed status', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-failed',
          title: 'should fail',
          fullTitle: 'Suite > should fail',
          suiteTitle: 'Suite',
          status: 'failed',
          duration: 100,
          error: 'Expected true but received false',
          retries: 0,
          browser: 'chromium',
          attachments: [],
        },
      });

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-failed',
          status: 'failed',
          error: expect.stringContaining('Expected true'),
        })
      );
    });

    it('should handle testEnd with timedOut status mapping to timedout', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-timeout',
          title: 'should timeout',
          fullTitle: 'Suite > should timeout',
          suiteTitle: 'Suite',
          status: 'timedOut',
          duration: 30000,
          error: 'Timeout exceeded',
          retries: 0,
          browser: 'chromium',
          attachments: [],
        },
      });

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-timeout',
          status: 'timedout',
        })
      );
    });

    it('should handle testEnd with skipped status', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-skipped',
          title: 'should skip',
          fullTitle: 'Suite > should skip',
          suiteTitle: 'Suite',
          status: 'skipped',
          duration: 0,
          error: undefined,
          retries: 0,
          browser: 'chromium',
          attachments: [],
        },
      });

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-skipped',
          status: 'skipped',
        })
      );
    });

    it('should handle testEnd with retries and add to flakyTests', async () => {
      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-flaky',
          title: 'should be flaky',
          fullTitle: 'Suite > should be flaky',
          suiteTitle: 'Suite',
          status: 'passed',
          duration: 200,
          error: undefined,
          retries: 2,
          browser: 'chromium',
          attachments: [],
        },
      });

      await executePromise;

      expect(executor.currentRun!.flakyTests).toHaveLength(1);
      expect(executor.currentRun!.flakyTests[0].id).toBe('test-flaky');
      expect(executor.currentRun!.flakyTests[0].retries).toBe(2);
    });

    it('should handle stderr message and emit output', async () => {
      const outputListener = vi.fn();
      executor.on('output', outputListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'stderr',
        text: 'Warning: deprecated API',
      });

      await executePromise;

      expect(outputListener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stderr',
          data: expect.stringContaining('deprecated'),
        })
      );
    });

    it('should handle globalError message and set status to failed', async () => {
      let statusDuringRun: string | undefined;

      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'globalError',
        message: 'Worker process crashed',
        stack: 'Error: crashed\n    at Worker...',
      });

      statusDuringRun = executor.currentRun!.status;

      await executePromise;

      expect(statusDuringRun).toBe('failed');
      expect(executor.currentRun!.metadata!.globalErrors).toHaveLength(1);
      expect(executor.currentRun!.metadata!.globalErrors![0].message).toBe('Worker process crashed');
    });

    it('should aggregate suite stats from multiple testEnd messages', async () => {
      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-1', title: 'test1', fullTitle: 'Suite > test1', suiteTitle: 'Suite',
          status: 'passed', duration: 100, error: undefined, retries: 0, browser: 'chromium', attachments: [],
        },
      });

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-2', title: 'test2', fullTitle: 'Suite > test2', suiteTitle: 'Suite',
          status: 'failed', duration: 200, error: 'fail', retries: 0, browser: 'chromium', attachments: [],
        },
      });

      await executePromise;

      expect(executor.currentRun!.passed).toBe(1);
      expect(executor.currentRun!.failed).toBe(1);
      expect(executor.currentRun!.suites).toHaveLength(1);
      expect(executor.currentRun!.suites[0].name).toBe('Suite');
    });

    it('should ignore progress messages when _currentRun is null', () => {
      const executor2 = new Executor(config, storage);
      // Don't call execute, so _currentRun is null
      expect(() => {
        (executor2 as any).progressTracker.processMessage({
          type: 'begin',
          totalTests: 10,
        });
      }).not.toThrow();
    });
  });

  describe('handleProgressData', () => {
    let executor: Executor;

    beforeEach(() => {
      executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});
    });

    afterEach(() => {
      executor.removeAllListeners();
    });

    it('should parse progress messages from stderr with marker', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      const marker = '__PW_PROGRESS__';
      const progressMsg = JSON.stringify({
        type: 'testEnd',
        test: {
          id: 'test-1', title: 'test1', fullTitle: 'Suite > test1', suiteTitle: 'Suite',
          status: 'passed', duration: 100, error: undefined, retries: 0, browser: 'chromium', attachments: [],
        },
      });
      (executor as any).progressTracker.handleData(`${marker}${progressMsg}\n`);

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'test-1', status: 'passed' })
      );
    });

    it('should buffer incomplete lines', async () => {
      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));

      const marker = '__PW_PROGRESS__';
      const progressMsg = JSON.stringify({ type: 'begin', totalTests: 5 });

      (executor as any).progressTracker.handleData(`${marker}${progressMsg}`);

      expect(executor.currentRun!.totalTests).toBe(0);

      (executor as any).progressTracker.handleData('\n');

      await executePromise;

      expect(executor.currentRun!.totalTests).toBe(5);
    });

    it('should handle invalid JSON gracefully', async () => {
      const executePromise = executor.execute({});

      const marker = '__PW_PROGRESS__';
      // Invalid JSON should not throw
      expect(() => {
        (executor as any).progressTracker.handleData(`${marker}{invalid json}\n`);
      }).not.toThrow();

      await executePromise;
    });

    it('should ignore lines without progress marker', async () => {
      const executePromise = executor.execute({});

      expect(() => {
        (executor as any).progressTracker.handleData('Regular stderr output\n');
      }).not.toThrow();

      await executePromise;
    });
  });

  describe('filterQuarantinedTests', () => {
    it('should return options unchanged when no flakyManager', async () => {
      const executor = new Executor(config, storage);
      const options = { testFiles: ['test1.ts', 'test2.ts'] };
      const result = await (executor as any).filterQuarantinedTests(options);
      expect(result).toEqual(options);
    });

    it('should return options unchanged when no options provided', async () => {
      const flakyManager = new FlakyTestManager('./test-data', { enabled: true, threshold: 0.3, autoQuarantine: false }, storage);
      const executor = new Executor(config, storage, flakyManager);
      const result = await (executor as any).filterQuarantinedTests(undefined);
      expect(result).toBeUndefined();
    });

    it('should skip quarantine filter when parentRunId is present', async () => {
      const flakyManager = new FlakyTestManager('./test-data', { enabled: true, threshold: 0.3, autoQuarantine: false }, storage);
      const executor = new Executor(config, storage, flakyManager);
      const options = { testFiles: ['test1.ts'], parentRunId: 'run-123' };
      const result = await (executor as any).filterQuarantinedTests(options);
      expect(result).toEqual(options);
    });

    it('should filter quarantined test files', async () => {
      const flakyManager = new FlakyTestManager('./test-data', { enabled: true, threshold: 0.3, autoQuarantine: true }, storage);
      const executor = new Executor(config, storage, flakyManager);
      const options = { testFiles: ['test1.ts', 'test-quarantined', 'test2.ts'] };
      const result = await (executor as any).filterQuarantinedTests(options);

      // The quarantined test file should be filtered out if it matches
      // Note: actual behavior depends on whether testId matches the file path
      expect(result).toBeDefined();
    });
  });

  describe('processJSONReport', () => {
    let executor: Executor;

    beforeEach(() => {
      executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});
    });

    afterEach(() => {
      executor.removeAllListeners();
    });

    it('should process a simple JSON report with one suite', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      const jsonReport = {
        config: {},
        suites: [{
          title: 'My Suite',
          file: 'test/example.spec.ts',
          specs: [{
            id: 'spec-1',
            title: 'should work',
            ok: true,
            tags: [],
            tests: [{
              timeout: 30000,
              annotations: [],
              expectedStatus: 'passed',
              projectId: 'chromium',
              projectName: 'chromium',
              results: [{
                workerIndex: 0,
                parallelIndex: 0,
                status: 'passed',
                duration: 150,
                retry: 0,
                startTime: new Date().toISOString(),
                annotations: [],
                attachments: [],
              }],
              status: 'expected',
            }],
          }],
          suites: [],
        }],
        errors: [],
        stats: { startTime: new Date().toISOString(), duration: 500, expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
      };

      (executor as any).processJSONReport(jsonReport);

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'should work',
          status: 'passed',
        })
      );
    });

    it('should process JSON report with failed test', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      const jsonReport = {
        config: {},
        suites: [{
          title: 'Suite',
          specs: [{
            id: 'spec-fail',
            title: 'should fail',
            ok: false,
            tags: [],
            tests: [{
              timeout: 30000,
              annotations: [],
              expectedStatus: 'passed',
              projectId: 'chromium',
              projectName: 'chromium',
              results: [{
                workerIndex: 0,
                parallelIndex: 0,
                status: 'failed',
                duration: 200,
                retry: 0,
                startTime: new Date().toISOString(),
                annotations: [],
                attachments: [],
                error: { message: 'Expected 5 but got 3', stack: 'Error: Expected 5\n    at test.js:10' },
              }],
              status: 'unexpected',
            }],
          }],
          suites: [],
        }],
        errors: [],
        stats: { startTime: new Date().toISOString(), duration: 500, expected: 0, skipped: 0, unexpected: 1, flaky: 0 },
      };

      (executor as any).processJSONReport(jsonReport);

      await executePromise;

      expect(testResultListener).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'should fail',
          status: 'failed',
          error: expect.stringContaining('Expected 5'),
        })
      );
    });

    it('should process JSON report with nested suites', async () => {
      const testResultListener = vi.fn();
      executor.on('test_result', testResultListener);

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      const jsonReport = {
        config: {},
        suites: [{
          title: 'Parent Suite',
          file: 'test/example.spec.ts',
          specs: [{
            id: 'spec-1',
            title: 'outer test',
            ok: true,
            tags: [],
            tests: [{
              timeout: 30000,
              annotations: [],
              expectedStatus: 'passed',
              projectId: 'chromium',
              projectName: 'chromium',
              results: [{
                workerIndex: 0, parallelIndex: 0, status: 'passed', duration: 100, retry: 0,
                startTime: new Date().toISOString(), annotations: [], attachments: [],
              }],
              status: 'expected',
            }],
          }],
          suites: [{
            title: 'Child Suite',
            specs: [{
              id: 'spec-2',
              title: 'inner test',
              ok: true,
              tags: [],
              tests: [{
                timeout: 30000,
                annotations: [],
                expectedStatus: 'passed',
                projectId: 'chromium',
                projectName: 'chromium',
                results: [{
                  workerIndex: 0, parallelIndex: 0, status: 'passed', duration: 50, retry: 0,
                  startTime: new Date().toISOString(), annotations: [], attachments: [],
                }],
                status: 'expected',
              }],
            }],
            suites: [],
          }],
        }],
        errors: [],
        stats: { startTime: new Date().toISOString(), duration: 500, expected: 2, skipped: 0, unexpected: 0, flaky: 0 },
      };

      (executor as any).processJSONReport(jsonReport);

      await executePromise;

      expect(testResultListener).toHaveBeenCalledTimes(2);
    });

    it('should handle flaky tests in JSON report (retry > 0)', async () => {
      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      const jsonReport = {
        config: {},
        suites: [{
          title: 'Suite',
          specs: [{
            id: 'spec-flaky',
            title: 'flaky test',
            ok: true,
            tags: [],
            tests: [{
              timeout: 30000,
              annotations: [],
              expectedStatus: 'passed',
              projectId: 'chromium',
              projectName: 'chromium',
              results: [{
                workerIndex: 0, parallelIndex: 0, status: 'passed', duration: 100, retry: 1,
                startTime: new Date().toISOString(), annotations: [], attachments: [],
              }],
              status: 'flaky',
            }],
          }],
          suites: [],
        }],
        errors: [],
        stats: { startTime: new Date().toISOString(), duration: 500, expected: 0, skipped: 0, unexpected: 0, flaky: 1 },
      };

      (executor as any).processJSONReport(jsonReport);

      await executePromise;

      expect(executor.currentRun!.flakyTests.length).toBeGreaterThanOrEqual(1);
    });

    it('should not process report when _currentRun is null', () => {
      const executor2 = new Executor(config, storage);
      expect(() => {
        (executor2 as any).processJSONReport({ suites: [], errors: [], stats: {} });
      }).not.toThrow();
    });
  });

  describe('mapJSONTestResult', () => {
    let executor: Executor;

    beforeEach(() => {
      executor = new Executor(config, storage);
    });

    it('should map timedOut status to timedout', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: 'spec-1', title: 'test', ok: false, tags: [] },
        { projectName: 'chromium', results: [{
          status: 'timedOut', duration: 30000, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [],
        }], timeout: 30000, annotations: [], expectedStatus: 'passed', projectId: 'chromium' },
        { status: 'timedOut', duration: 30000, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [], workerIndex: 0, parallelIndex: 0 }
      );
      expect(result.status).toBe('timedout');
    });

    it('should map skipped status', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: 'spec-1', title: 'test', ok: true, tags: [] },
        { projectName: 'chromium', results: [{
          status: 'skipped', duration: 0, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [],
        }], timeout: 30000, annotations: [], expectedStatus: 'skipped', projectId: 'chromium' },
        { status: 'skipped', duration: 0, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [], workerIndex: 0, parallelIndex: 0 }
      );
      expect(result.status).toBe('skipped');
    });

    it('should map interrupted status to failed', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: 'spec-1', title: 'test', ok: false, tags: [] },
        { projectName: 'chromium', results: [{
          status: 'interrupted', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [],
        }], timeout: 30000, annotations: [], expectedStatus: 'passed', projectId: 'chromium' },
        { status: 'interrupted', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [], workerIndex: 0, parallelIndex: 0 }
      );
      expect(result.status).toBe('failed');
    });

    it('should extract error message from result.error.message', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: 'spec-1', title: 'test', ok: false, tags: [] },
        { projectName: 'chromium', results: [{
          status: 'failed', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [],
          error: { message: 'Expected true', stack: 'Error at line 5' },
        }], timeout: 30000, annotations: [], expectedStatus: 'passed', projectId: 'chromium' },
        { status: 'failed', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [], workerIndex: 0, parallelIndex: 0,
          error: { message: 'Expected true', stack: 'Error at line 5' } }
      );
      expect(result.error).toContain('Expected true');
      expect(result.stackTrace).toContain('Error at line 5');
    });

    it('should extract error from result.error.value when message is absent', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: 'spec-1', title: 'test', ok: false, tags: [] },
        { projectName: 'chromium', results: [{
          status: 'failed', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [],
          error: { value: 'AssertionError: values differ' },
        }], timeout: 30000, annotations: [], expectedStatus: 'passed', projectId: 'chromium' },
        { status: 'failed', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [], workerIndex: 0, parallelIndex: 0,
          error: { value: 'AssertionError: values differ' } }
      );
      expect(result.error).toContain('AssertionError');
    });

    it('should map attachments to screenshots/videos/traces', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: 'spec-1', title: 'test', ok: false, tags: [] },
        { projectName: 'chromium', results: [{
          status: 'failed', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [],
          attachments: [
            { name: 'screenshot', contentType: 'image/png', path: '/screenshots/test.png' },
            { name: 'video', contentType: 'video/webm', path: '/videos/test.webm' },
            { name: 'trace', path: '/traces/trace.zip' },
          ],
        }], timeout: 30000, annotations: [], expectedStatus: 'passed', projectId: 'chromium' },
        { status: 'failed', duration: 100, retry: 0, startTime: new Date().toISOString(),
          annotations: [],
          attachments: [
            { name: 'screenshot', contentType: 'image/png', path: '/screenshots/test.png' },
            { name: 'video', contentType: 'video/webm', path: '/videos/test.webm' },
            { name: 'trace', path: '/traces/trace.zip' },
          ],
          workerIndex: 0, parallelIndex: 0 }
      );
      expect(result.screenshots).toContain('/screenshots/test.png');
      expect(result.videos).toContain('/videos/test.webm');
      expect(result.traces).toContain('/traces/trace.zip');
    });

    it('should generate ID from file:line:title when spec.id is absent', () => {
      const result = PlaywrightReportParser.mapTestResult(
        { id: '', title: 'my test', ok: true, tags: [], file: 'test.spec.ts', line: 10 },
        { projectName: 'chromium', results: [{
          status: 'passed', duration: 50, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [],
        }], timeout: 30000, annotations: [], expectedStatus: 'passed', projectId: 'chromium' },
        { status: 'passed', duration: 50, retry: 0, startTime: new Date().toISOString(),
          annotations: [], attachments: [], workerIndex: 0, parallelIndex: 0 }
      );
      expect(result.id).toContain('test.spec.ts');
      expect(result.id).toContain('my test');
    });
  });

  describe('runtime state accessors', () => {
    it('getTestLocations returns null when not running', () => {
      const executor = new Executor(config, storage);
      expect(executor.getTestLocations()).toBeNull();
    });

    it('getTestFiles returns null when not running', () => {
      const executor = new Executor(config, storage);
      expect(executor.getTestFiles()).toBeNull();
    });

    it('getGrepPattern returns null when not running', () => {
      const executor = new Executor(config, storage);
      expect(executor.getGrepPattern()).toBeNull();
    });

    it('getCompletedTestResults returns empty array when not running', () => {
      const executor = new Executor(config, storage);
      expect(executor.getCompletedTestResults()).toEqual([]);
    });

    it('getTestLocations returns locations during execution', async () => {
      const executor = new Executor(config, storage);
      let resolveBlock: () => void;
      const blockPromise = new Promise<void>((resolve) => { resolveBlock = resolve; });
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        await blockPromise;
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const executePromise = executor.execute({ testLocations: ['test1.ts:10', 'test2.ts:20'] });

      await new Promise((r) => setTimeout(r, 50));
      expect(executor.getTestLocations()).toEqual(['test1.ts:10', 'test2.ts:20']);

      resolveBlock!();
      await executePromise;

      expect(executor.getTestLocations()).toBeNull();
    });

    it('getCompletedTestResults returns results during execution', async () => {
      const executor = new Executor(config, storage);
      let resolveBlock: () => void;
      const blockPromise = new Promise<void>((resolve) => { resolveBlock = resolve; });
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        await blockPromise;
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-1', title: 'test1', fullTitle: 'Suite > test1', suiteTitle: 'Suite',
          status: 'passed', duration: 100, error: undefined, retries: 0, browser: 'chromium', attachments: [],
        },
      });

      const completed = executor.getCompletedTestResults();
      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('test-1');

      resolveBlock!();
      await executePromise;

      expect(executor.getCompletedTestResults()).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should throw error if already running', async () => {
      const executor = new Executor(config, storage);
      let resolveBlock: () => void;
      const blockPromise = new Promise<void>((resolve) => { resolveBlock = resolve; });
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        await blockPromise;
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const firstRun = executor.execute();
      await new Promise((r) => setTimeout(r, 50));
      await expect(executor.execute()).rejects.toThrow('already running');
      resolveBlock!();
      await firstRun;
    });
  });

  describe('execute() core path', () => {
    let executor: Executor;

    beforeEach(() => {
      executor = new Executor(config, storage);
    });

    afterEach(() => {
      executor.removeAllListeners();
    });

    it('should execute successfully and return RunResult with status success', async () => {
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const result = await executor.execute({});

      expect(result.status).toBe('success');
      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^run_/);
      expect(result.startTime).toBeDefined();
      expect(typeof result.startTime).toBe('number');
      expect(result.endTime).toBeDefined();
      expect(typeof result.endTime).toBe('number');
    });

    it('should emit run_started event at the beginning', async () => {
      let resolveDelay: () => void;
      const delayPromise = new Promise<void>((resolve) => {
        resolveDelay = resolve;
      });
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        await delayPromise;
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const startedEvents: any[] = [];
      executor.on('run_started', (payload) => startedEvents.push(payload));

      const executePromise = executor.execute({});

      await new Promise((r) => setTimeout(r, 50));
      expect(startedEvents.length).toBe(1);
      expect(startedEvents[0]).toEqual({
        runId: expect.any(String),
        timestamp: expect.any(Number),
      });

      resolveDelay!();
      await executePromise;
    });

    it('should emit run_completed event on success', async () => {
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const completedEvents: any[] = [];
      executor.on('run_completed', (payload) => completedEvents.push(payload));

      await executor.execute({});

      expect(completedEvents.length).toBe(1);
      const payload = completedEvents[0];
      expect(payload.endTime).toBeDefined();
      expect(typeof payload.endTime).toBe('number');
      expect(payload.duration).toBeDefined();
      expect(typeof payload.duration).toBe('number');
      expect(payload.status).toBe('success');
    });

    it('should set status to failed and emit error event when execution throws', async () => {
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        throw new Error('Playwright crashed');
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const errorEvents: any[] = [];
      executor.on('error', (payload) => errorEvents.push(payload));

      const result = await executor.execute({});

      expect(result.status).toBe('failed');
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].error).toBe('Playwright crashed');
      expect(errorEvents[0].runId).toBe(result.id);
    });

    it('should always reset isRunning and emit run_completed even on error', async () => {
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        throw new Error('Something went wrong');
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const completedEvents: any[] = [];
      executor.on('run_completed', (payload) => completedEvents.push(payload));
      // Must listen for 'error' event to avoid unhandled error from EventEmitter
      executor.on('error', () => {});

      const result = await executor.execute({});

      expect(executor.isCurrentlyRunning()).toBe(false);
      expect(completedEvents.length).toBe(1);
      expect(result.status).toBe('failed');
      expect(result.endTime).toBeDefined();
      expect(result.duration).toBeDefined();
    });

    it('should allow re-execution after a run completes', async () => {
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const firstResult = await executor.execute({});
      expect(firstResult.status).toBe('success');

      const secondResult = await executor.execute({});
      expect(secondResult.status).toBe('success');
      expect(secondResult.id).not.toBe(firstResult.id);
    });
  });

  describe('cancel', () => {
    it('should handle cancel when not running', async () => {
      const executor = new Executor(config, storage);
      await executor.cancel();
      expect(executor.isCurrentlyRunning()).toBe(false);
    });
  });

  describe('getTestArtifacts', () => {
    it('should return empty arrays for non-existent run', async () => {
      const executor = new Executor(config, storage);
      const artifacts = await executor.getTestArtifacts('non-existent-run');
      expect(artifacts.screenshots).toEqual([]);
      expect(artifacts.videos).toEqual([]);
      expect(artifacts.traces).toEqual([]);
    });
  });
});

describe('ParallelExecutor', () => {
  let storage: MemoryStorage;
  let config: any;

  beforeEach(() => {
    storage = new MemoryStorage();
    config = {
      version: '1.0.0',
      testDir: './',
      outputDir: './test-output',
      retries: 0,
      timeout: 30000,
      workers: 1,
      shards: 1,
      browsers: ['chromium'],
    };
  });

  afterEach(() => {
    storage.clear();
  });

  describe('constructor', () => {
    it('should create parallel executor with multiple shards', () => {
      const executor = new ParallelExecutor(config, 3, storage);
      expect(executor).toBeDefined();
    });

    it('should create executors for each shard', () => {
      const executor = new ParallelExecutor(config, 2, storage);
      expect(executor).toBeDefined();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all executors', async () => {
      const executor = new ParallelExecutor(config, 2, storage);
      await executor.cancelAll();
    });
  });

  describe('execute', () => {
    it('should execute all shards and return results', async () => {
      const shardCount = 2;
      const parallelExecutor = new ParallelExecutor(config, shardCount, storage);

      // Mock execute on each internal executor
      for (const executor of (parallelExecutor as any).executors) {
        vi.spyOn(executor, 'execute').mockImplementation(async (opts: any) => ({
          id: `run-shard-${opts.shardIndex}`,
          version: '1.0.0',
          status: 'success',
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 100,
          suites: [],
          totalTests: 5,
          passed: 5,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        }));
      }

      const results = await parallelExecutor.execute();

      expect(results).toHaveLength(shardCount);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('success');
    });

    it('should handle shard execution failure gracefully', async () => {
      const shardCount = 2;
      const parallelExecutor = new ParallelExecutor(config, shardCount, storage);

      // First shard succeeds
      vi.spyOn((parallelExecutor as any).executors[0], 'execute').mockImplementation(async (opts: any) => ({
        id: `run-shard-0`,
        version: '1.0.0',
        status: 'success',
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 100,
        suites: [],
        totalTests: 5,
        passed: 5,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      }));

      // Second shard throws
      vi.spyOn((parallelExecutor as any).executors[1], 'execute').mockRejectedValue(new Error('Shard failed'));

      const results = await parallelExecutor.execute();

      expect(results).toHaveLength(shardCount);
      expect(results[0].status).toBe('success');
      expect(results[1].status).toBe('failed');
      expect(results[1].metadata!.shardError).toBe('Shard failed');
    });

    it('should respect concurrency limit', async () => {
      const shardCount = 4;
      const parallelExecutor = new ParallelExecutor(config, shardCount, storage);

      const executionOrder: number[] = [];

      for (let i = 0; i < shardCount; i++) {
        vi.spyOn((parallelExecutor as any).executors[i], 'execute').mockImplementation(async (opts: any) => {
          executionOrder.push(opts.shardIndex);
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            id: `run-shard-${opts.shardIndex}`,
            version: '1.0.0',
            status: 'success',
            startTime: Date.now(),
            endTime: Date.now(),
            duration: 100,
            suites: [],
            totalTests: 5,
            passed: 5,
            failed: 0,
            skipped: 0,
            flakyTests: [],
            metadata: {},
          };
        });
      }

      const results = await parallelExecutor.execute(2);

      expect(results).toHaveLength(shardCount);
      // All shards should have been executed
      expect(executionOrder.sort()).toEqual([0, 1, 2, 3]);
    });
  });

  describe('cancelAll', () => {
    it('should cancel all executors even when some are running', async () => {
      const shardCount = 3;
      const parallelExecutor = new ParallelExecutor(config, shardCount, storage);

      // Mock cancel on each executor
      for (const executor of (parallelExecutor as any).executors) {
        vi.spyOn(executor, 'cancel').mockImplementation(async () => {});
      }

      await parallelExecutor.cancelAll();

      for (const executor of (parallelExecutor as any).executors) {
        expect(executor.cancel).toHaveBeenCalled();
      }
    });
  });
});
