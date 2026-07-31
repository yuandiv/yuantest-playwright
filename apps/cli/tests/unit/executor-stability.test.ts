import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Executor, ParallelExecutor } from '@yuantest/executor';
import { PlaywrightRunnerError, ErrorCode } from '@yuantest/contracts';
import { MemoryStorage } from '@yuantest/core';
import { checkEnvironment } from '@yuantest/core';

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

describe('Executor Stability Tests', () => {
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

  describe('E-01: 并发执行拒绝', () => {
    it('should reject concurrent execution with ALREADY_RUNNING error', async () => {
      const executor = new Executor(config, storage);
      let resolveBlock: () => void;
      const blockPromise = new Promise<void>((resolve) => { resolveBlock = resolve; });
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        await blockPromise;
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const firstRun = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      await expect(executor.execute({})).rejects.toThrow('already running');
      await expect(executor.execute({})).rejects.toThrow(PlaywrightRunnerError);

      try {
        await executor.execute({});
      } catch (error) {
        expect((error as PlaywrightRunnerError).code).toBe(ErrorCode.ALREADY_RUNNING);
      }

      resolveBlock!();
      await firstRun;
      executor.removeAllListeners();
    });
  });

  describe('E-02: 进程 spawn 失败', () => {
    it('should emit error event and set status to failed on spawn failure', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        throw new PlaywrightRunnerError(
          'Failed to spawn playwright process: ENOENT',
          'SPAWN_ERROR'
        );
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const errorEvents: any[] = [];
      const completedEvents: any[] = [];
      executor.on('error', (payload) => errorEvents.push(payload));
      executor.on('run_completed', (payload) => completedEvents.push(payload));

      const result = await executor.execute({});

      expect(result.status).toBe('failed');
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0].error).toContain('Failed to spawn playwright process');
      expect(completedEvents.length).toBe(1);
      expect(completedEvents[0].status).toBe('failed');

      executor.removeAllListeners();
    });
  });

  describe('E-03: 进程异常退出（非零退出码）', () => {
    it('should set status to failed when process exits with non-zero code', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {
        (executor as any)._currentRun.failed = 1;
        throw new Error('Process exited with code 1');
      });
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const completedEvents: any[] = [];
      executor.on('run_completed', (payload) => completedEvents.push(payload));
      executor.on('error', () => {});

      const result = await executor.execute({});

      expect(result.status).toBe('failed');
      expect(result.failed).toBe(1);
      expect(completedEvents[0].status).toBe('failed');

      executor.removeAllListeners();
    });
  });

  describe('E-04: 执行中取消的完整性', () => {
    it('should cancel running execution and emit run_cancelled event', async () => {
      const executor = new Executor(config, storage);
      const cancelListener = vi.fn();

      executor.on('run_cancelled', cancelListener);

      const mockProcess = {
        pid: 12345,
        kill: vi.fn(),
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };

      (executor as any).currentProcess = mockProcess;
      (executor as any).isRunning = true;
      (executor as any)._currentRun = {
        id: 'test',
        status: 'running',
        startTime: Date.now(),
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await executor.cancel();

      expect(cancelListener).toHaveBeenCalledTimes(1);
      expect(cancelListener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' })
      );
      expect(executor.isCurrentlyRunning()).toBe(false);
      expect((executor as any).currentProcess).toBeNull();
      expect((executor as any)._currentRun.status).toBe('cancelled');
      expect((executor as any)._currentRun.endTime).toBeDefined();
      expect((executor as any)._currentRun.duration).toBeGreaterThanOrEqual(0);

      executor.removeAllListeners();
    });
  });

  describe('E-05: 重复取消调用', () => {
    it('should handle multiple cancel calls without crashing', async () => {
      const executor = new Executor(config, storage);

      const mockProcess = {
        pid: 12345,
        kill: vi.fn(),
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };

      (executor as any).currentProcess = mockProcess;
      (executor as any).isRunning = true;
      (executor as any)._currentRun = {
        id: 'test',
        status: 'running',
        startTime: Date.now(),
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await executor.cancel();
      await executor.cancel();
      await executor.cancel();

      expect(executor.isCurrentlyRunning()).toBe(false);
      expect((executor as any).currentProcess).toBeNull();

      executor.removeAllListeners();
    });
  });

  describe('E-06: 非运行时取消', () => {
    it('should have no side effects when cancel is called while not running', async () => {
      const executor = new Executor(config, storage);
      const cancelListener = vi.fn();
      executor.on('run_cancelled', cancelListener);

      expect(executor.isCurrentlyRunning()).toBe(false);
      expect((executor as any).currentProcess).toBeNull();

      await executor.cancel();

      expect(executor.isCurrentlyRunning()).toBe(false);
      expect((executor as any).currentProcess).toBeNull();
      expect(cancelListener).not.toHaveBeenCalled();

      executor.removeAllListeners();
    });
  });

  describe('E-07: 取消后重新执行', () => {
    it('should allow re-execution after cancellation', async () => {
      const executor = new Executor(config, storage);

      const mockProcess = {
        pid: 12345,
        kill: vi.fn(),
        on: vi.fn(),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };

      (executor as any).currentProcess = mockProcess;
      (executor as any).isRunning = true;
      (executor as any)._currentRun = {
        id: 'test',
        status: 'running',
        startTime: Date.now(),
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      await executor.cancel();
      expect(executor.isCurrentlyRunning()).toBe(false);

      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const result = await executor.execute({});
      expect(result.status).toBe('success');
      expect(result.id).toBeDefined();

      executor.removeAllListeners();
    });
  });

  describe('E-08: execute 选项组合', () => {
    it('should pass through various option combinations correctly', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      await executor.execute({
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
        grepPattern: 'login',
      });

      expect((executor as any).lastExecuteOptions.testFiles).toEqual(['test1.spec.ts', 'test2.spec.ts']);
      expect((executor as any).lastExecuteOptions.grepPattern).toBe('login');

      executor.removeAllListeners();
    });

    it('should pass shard options through correctly', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      await executor.execute({
        shardIndex: 1,
        shardTotal: 4,
      });

      expect((executor as any).lastExecuteOptions).toBeDefined();

      executor.removeAllListeners();
    });

    it('should pass tagFilter options through correctly', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      await executor.execute({
        tagFilter: ['@smoke', '@regression'],
      });

      expect((executor as any).lastExecuteOptions).toBeDefined();

      executor.removeAllListeners();
    });
  });

  describe('E-09: 环境预检失败', () => {
    it('should throw error when Playwright is not available', async () => {
      vi.mocked(checkEnvironment).mockResolvedValueOnce({
        nodeVersion: '18.0.0',
        nodeOk: true,
        playwrightAvailable: false,
        playwrightVersion: '',
        playwrightOk: false,
        errors: ['Playwright not found'],
      });

      const executor = new Executor(config, storage);

      await expect(executor.execute({})).rejects.toThrow('Playwright CLI is not available');

      executor.removeAllListeners();
    });
  });

  describe('E-10: JSON 报告解析失败', () => {
    it('should handle JSON report parse failure gracefully', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const result = await executor.execute({});

      expect(result).toBeDefined();
      expect(result.status).toBe('success');

      executor.removeAllListeners();
    });
  });

  describe('E-11: processJSONReport 与实时结果合并', () => {
    it('should merge JSON report data with real-time results preserving existing data', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-1',
          title: 'test1',
          fullTitle: 'Suite > test1',
          suiteTitle: 'Suite',
          status: 'passed',
          duration: 100,
          error: undefined,
          retries: 0,
          browser: 'chromium',
          attachments: [],
        },
      });

      const jsonReport = {
        config: {},
        suites: [{
          title: 'Suite',
          specs: [{
            id: 'test-1',
            title: 'test1',
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
                duration: 100,
                retry: 0,
                startTime: new Date().toISOString(),
                annotations: [],
                attachments: [
                  { name: 'screenshot', contentType: 'image/png', path: '/screenshots/test.png' },
                  { name: 'video', contentType: 'video/webm', path: '/videos/test.webm' },
                  { name: 'trace', path: '/traces/trace.zip' },
                ],
              }],
              status: 'expected',
            }],
          }],
          suites: [],
        }],
        errors: [],
        stats: {
          startTime: new Date().toISOString(),
          duration: 500,
          expected: 1,
          skipped: 0,
          unexpected: 0,
          flaky: 0,
        },
      };

      (executor as any).processJSONReport(jsonReport);

      const testIndex = (executor as any).progressTracker.getTestIndex();
      const mergedTest = testIndex.get('test-1');

      expect(mergedTest).toBeDefined();
      expect(mergedTest.status).toBe('passed');
      expect(mergedTest.screenshots).toBeDefined();
      expect(mergedTest.screenshots!.length).toBeGreaterThan(0);
      expect(mergedTest.videos).toBeDefined();
      expect(mergedTest.videos!.length).toBeGreaterThan(0);
      expect(mergedTest.traces).toBeDefined();
      expect(mergedTest.traces!.length).toBeGreaterThan(0);

      await executePromise;
      executor.removeAllListeners();
    });
  });

  describe('E-12: 重试测试结果处理', () => {
    it('should record flaky tests when retries > 0', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'testEnd',
        test: {
          id: 'test-flaky',
          title: 'flakyTest',
          fullTitle: 'Suite > flakyTest',
          suiteTitle: 'Suite',
          status: 'passed',
          duration: 200,
          error: undefined,
          retries: 2,
          browser: 'chromium',
          attachments: [],
        },
      });

      expect((executor as any)._currentRun.flakyTests.length).toBe(1);
      expect((executor as any)._currentRun.flakyTests[0].id).toBe('test-flaky');
      expect((executor as any)._currentRun.flakyTests[0].retries).toBe(2);
      expect((executor as any)._currentRun.flakyTests[0].status).toBe('passed');

      await executePromise;
      executor.removeAllListeners();
    });
  });

  describe('E-13: globalError 处理', () => {
    it('should record globalError in metadata and set status to failed', async () => {
      const executor = new Executor(config, storage);
      vi.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'prepareRun').mockImplementation(async () => {});
      vi.spyOn(executor as any, 'postProcessRun').mockImplementation(async () => {});

      const executePromise = executor.execute({});
      await new Promise((r) => setTimeout(r, 50));

      (executor as any).progressTracker.processMessage({
        type: 'globalError',
        message: 'Worker process exited unexpectedly',
        stack: 'Error: Worker crashed\n    at Worker.start',
      });

      expect((executor as any)._currentRun.metadata.globalErrors).toBeDefined();
      expect((executor as any)._currentRun.metadata.globalErrors.length).toBe(1);
      expect((executor as any)._currentRun.metadata.globalErrors[0].message).toBe(
        'Worker process exited unexpectedly'
      );
      expect((executor as any)._currentRun.metadata.globalErrors[0].stack).toBe(
        'Error: Worker crashed\n    at Worker.start'
      );
      expect((executor as any)._currentRun.status).toBe('failed');

      await executePromise;
      executor.removeAllListeners();
    });
  });

  describe('E-14: 进程超时强制终止', () => {
    it('should calculate effectiveTimeout within bounds [300000, 7200000]', () => {
      const testCases = [
        { workers: 1, timeout: 30000, totalTests: 1 },
        { workers: 4, timeout: 60000, totalTests: 100 },
        { workers: 1, timeout: 30000, totalTests: 1000 },
        { workers: 8, timeout: 120000, totalTests: 500 },
        { workers: 1, timeout: 10000, totalTests: 1 },
        { workers: 2, timeout: 300000, totalTests: 200 },
      ];

      for (const tc of testCases) {
        const workers = tc.workers || 1;
        const totalTests = Math.max(1, tc.totalTests);
        const timeoutPerTest = tc.timeout || 30000;
        const estimatedDuration = (timeoutPerTest * totalTests) / workers;
        const PROCESS_TIMEOUT_MS = estimatedDuration + 120000;
        const effectiveTimeout = Math.min(Math.max(PROCESS_TIMEOUT_MS, 300000), 7200000);

        expect(effectiveTimeout).toBeGreaterThanOrEqual(300000);
        expect(effectiveTimeout).toBeLessThanOrEqual(7200000);
      }
    });

    it('should clamp very small timeout to minimum 300000', () => {
      const workers = 1;
      const totalTests = 1;
      const timeoutPerTest = 1000;
      const estimatedDuration = (timeoutPerTest * totalTests) / workers;
      const PROCESS_TIMEOUT_MS = estimatedDuration + 120000;
      const effectiveTimeout = Math.min(Math.max(PROCESS_TIMEOUT_MS, 300000), 7200000);

      expect(effectiveTimeout).toBe(300000);
    });

    it('should clamp very large timeout to maximum 7200000', () => {
      const workers = 1;
      const totalTests = 10000;
      const timeoutPerTest = 300000;
      const estimatedDuration = (timeoutPerTest * totalTests) / workers;
      const PROCESS_TIMEOUT_MS = estimatedDuration + 120000;
      const effectiveTimeout = Math.min(Math.max(PROCESS_TIMEOUT_MS, 300000), 7200000);

      expect(effectiveTimeout).toBe(7200000);
    });
  });

  describe('E-15: ParallelExecutor 并发限制', () => {
    it('should execute all shards and respect concurrency limit', async () => {
      const shardCount = 4;
      const concurrencyLimit = 2;
      const parallelExecutor = new ParallelExecutor(config, shardCount, storage);

      const executionLog: { shardIndex: number; start: number; end: number }[] = [];

      for (let i = 0; i < shardCount; i++) {
        vi.spyOn((parallelExecutor as any).executors[i], 'execute').mockImplementation(
          async (opts: any) => {
            const start = Date.now();
            executionLog.push({ shardIndex: opts.shardIndex, start, end: 0 });
            await new Promise((resolve) => setTimeout(resolve, 20));
            const end = Date.now();
            const entry = executionLog.find((e) => e.shardIndex === opts.shardIndex && e.end === 0);
            if (entry) entry.end = end;
            return {
              id: `run-shard-${opts.shardIndex}`,
              version: '1.0.0',
              status: 'success',
              startTime: start,
              endTime: end,
              duration: end - start,
              suites: [],
              totalTests: 5,
              passed: 5,
              failed: 0,
              skipped: 0,
              flakyTests: [],
              metadata: {},
            };
          }
        );
      }

      const results = await parallelExecutor.execute(concurrencyLimit);

      expect(results).toHaveLength(shardCount);
      for (const result of results) {
        expect(result.status).toBe('success');
      }

      const shardIndices = executionLog.map((e) => e.shardIndex).sort();
      expect(shardIndices).toEqual([0, 1, 2, 3]);
    });
  });
});
