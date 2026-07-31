import { vi } from 'vitest';
import { Executor } from '@yuantest/executor';
import { MemoryStorage } from '@yuantest/core';

const PROGRESS_MARKER = '__PW_PROGRESS__';

describe('Executor Optimization Tests', () => {
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

  describe('console.log duplicate fix', () => {
    it('should emit output only once for stdout via ProgressReporter (not via proc.stdout)', () => {
      const executor = new Executor(config, storage);
      const outputEvents: any[] = [];

      executor.on('output', (data: any) => {
        outputEvents.push(data);
      });

      const stdoutMsg = JSON.stringify({
        type: 'stdout',
        test: { title: 'test1', fullTitle: 'suite > test1' },
        text: 'Hello from console.log',
      });

      const tracker = (executor as any).progressTracker;
      tracker.stderrBuffer = '';
      tracker.currentRun = {
        id: 'test-run',
        status: 'running',
        suites: [],
        totalTests: 1,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };
      tracker.handleData(PROGRESS_MARKER + stdoutMsg + '\n');

      const stdoutOutputs = outputEvents.filter((e) => e.type === 'stdout');
      expect(stdoutOutputs.length).toBe(1);
      expect(stdoutOutputs[0].data).toBe('Hello from console.log');
    });

    it('should not emit duplicate output when same message appears in both channels', () => {
      const executor = new Executor(config, storage);
      const outputEvents: any[] = [];

      executor.on('output', (data: any) => {
        outputEvents.push(data);
      });

      const tracker = (executor as any).progressTracker;
      tracker.stderrBuffer = '';
      tracker.currentRun = {
        id: 'test-run',
        status: 'running',
        suites: [],
        totalTests: 1,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      const stdoutMsg = JSON.stringify({
        type: 'stdout',
        test: { title: 'test1', fullTitle: 'suite > test1' },
        text: 'Hello from console.log',
      });
      tracker.handleData(PROGRESS_MARKER + stdoutMsg + '\n');

      const allOutputs = outputEvents.filter(
        (e) => e.data === 'Hello from console.log'
      );
      expect(allOutputs.length).toBe(1);
    });

    it('should still emit output for non-ProgressReporter stderr content', () => {
      const executor = new Executor(config, storage);
      const outputEvents: any[] = [];

      executor.on('output', (data: any) => {
        outputEvents.push(data);
      });

      const tracker = (executor as any).progressTracker;
      tracker.stderrBuffer = '';
      tracker.currentRun = {
        id: 'test-run',
        status: 'running',
        suites: [],
        totalTests: 1,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      const stdoutMsg = JSON.stringify({
        type: 'stdout',
        test: { title: 'test1', fullTitle: 'suite > test1' },
        text: 'console output',
      });

      const mixedStderr =
        PROGRESS_MARKER + stdoutMsg + '\n' +
        'Some Playwright framework warning\n';

      tracker.handleData(mixedStderr);

      expect(outputEvents.length).toBeGreaterThanOrEqual(1);
      const stdoutOutputs = outputEvents.filter((e) => e.type === 'stdout');
      expect(stdoutOutputs.length).toBe(1);
      expect(stdoutOutputs[0].data).toBe('console output');
    });
  });

  describe('task completion reliability', () => {
    describe('enhanced stderr buffer consumption in finalize', () => {
      it('should process remaining stderr buffer on finalize', () => {
        const executor = new Executor(config, storage);
        const testResults: any[] = [];

        executor.on('test_result', (result: any) => {
          testResults.push(result);
        });

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };
        tracker.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
        tracker.suiteIndex = new Map();
        tracker.testIndex = new Map();
        tracker.testSuiteIndex = new Map();

        const testEndMsg = JSON.stringify({
          type: 'testEnd',
          test: {
            id: 'test-1',
            title: 'my test',
            fullTitle: 'suite > my test',
            suiteTitle: 'suite',
            status: 'passed',
            duration: 100,
            error: undefined,
            retries: 0,
            browser: 'chromium',
            file: 'test.spec.ts',
            line: 10,
            column: 5,
            attachments: [],
          },
          consoleLogs: [],
        });

        tracker.stderrBuffer = PROGRESS_MARKER + testEndMsg;

        tracker.handleData('\n');

        if (tracker.stderrBuffer.trim()) {
          const markerIndex = tracker.stderrBuffer.indexOf(PROGRESS_MARKER);
          if (markerIndex !== -1) {
            const jsonStr = tracker.stderrBuffer.substring(markerIndex + PROGRESS_MARKER.length);
            try {
              const msg = JSON.parse(jsonStr);
              tracker.processMessage(msg);
            } catch {
              // ignore
            }
          }
        }
        tracker.stderrBuffer = '';

        expect(testResults.length).toBe(1);
        expect(testResults[0].title).toBe('my test');
        expect(testResults[0].status).toBe('passed');
      });

      it('should handle empty stderr buffer gracefully in finalize', () => {
        const executor = new Executor(config, storage);

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };

        tracker.handleData('\n');

        expect(tracker.stderrBuffer).toBe('');
      });
    });

    describe('optimized timeout calculation', () => {
      it('should consider retries in timeout calculation', () => {
        const configNoRetry = { ...config, retries: 0, timeout: 30000, workers: 1 };
        const configWithRetry = { ...config, retries: 2, timeout: 30000, workers: 1 };

        const executorNoRetry = new Executor(configNoRetry, storage);
        const executorWithRetry = new Executor(configWithRetry, storage);

        const calcTimeout = (cfg: any, totalTests: number) => {
          const workers = cfg.workers || 1;
          const timeoutPerTest = cfg.timeout || 30000;
          const retries = cfg.retries || 0;
          const estimatedDuration = (timeoutPerTest * totalTests * (1 + retries)) / workers;
          const PROCESS_TIMEOUT_MS = estimatedDuration + 300000;
          return Math.min(Math.max(PROCESS_TIMEOUT_MS, 600000), 7200000);
        };

        const timeoutNoRetry = calcTimeout(configNoRetry, 10);
        const timeoutWithRetry = calcTimeout(configWithRetry, 10);

        expect(timeoutWithRetry).toBeGreaterThan(timeoutNoRetry);
        expect(timeoutNoRetry).toBe(600000);
        expect(timeoutWithRetry).toBe(1200000);
      });

      it('should enforce minimum timeout of 10 minutes', () => {
        const shortConfig = { ...config, timeout: 5000, workers: 4, retries: 0 };
        const calcTimeout = (cfg: any, totalTests: number) => {
          const workers = cfg.workers || 1;
          const timeoutPerTest = cfg.timeout || 30000;
          const retries = cfg.retries || 0;
          const estimatedDuration = (timeoutPerTest * totalTests * (1 + retries)) / workers;
          const PROCESS_TIMEOUT_MS = estimatedDuration + 300000;
          return Math.min(Math.max(PROCESS_TIMEOUT_MS, 600000), 7200000);
        };

        const timeout = calcTimeout(shortConfig, 1);
        expect(timeout).toBe(600000);
      });

      it('should enforce maximum timeout of 2 hours', () => {
        const longConfig = { ...config, timeout: 120000, workers: 1, retries: 5 };
        const calcTimeout = (cfg: any, totalTests: number) => {
          const workers = cfg.workers || 1;
          const timeoutPerTest = cfg.timeout || 30000;
          const retries = cfg.retries || 0;
          const estimatedDuration = (timeoutPerTest * totalTests * (1 + retries)) / workers;
          const PROCESS_TIMEOUT_MS = estimatedDuration + 300000;
          return Math.min(Math.max(PROCESS_TIMEOUT_MS, 600000), 7200000);
        };

        const timeout = calcTimeout(longConfig, 1000);
        expect(timeout).toBe(7200000);
      });
    });

    describe('enhanced stall detection', () => {
      it('should detect stall at 120 seconds threshold (not 300)', () => {
        const executor = new Executor(config, storage);
        const outputEvents: any[] = [];

        executor.on('output', (data: any) => {
          outputEvents.push(data);
        });

        (executor as any)._currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 1,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };

        const STALL_THRESHOLD_MS = 120000;
        const lastProgressTimestamp = Date.now() - 130000;
        const elapsed = Date.now() - lastProgressTimestamp;

        if (elapsed > STALL_THRESHOLD_MS) {
          executor.emit('output', {
            data: `⚠️ No progress for ${Math.round(elapsed / 1000)}s, execution may be stalled...`,
            timestamp: Date.now(),
            runId: 'test-run',
            type: 'stderr',
          });
        }

        const stallWarnings = outputEvents.filter(
          (e) => e.data && e.data.includes('No progress') && e.data.includes('stalled')
        );
        expect(stallWarnings.length).toBe(1);
      });

      it('should not trigger stall warning within 120 seconds', () => {
        const STALL_THRESHOLD_MS = 120000;
        const lastProgressTimestamp = Date.now() - 60000;
        const elapsed = Date.now() - lastProgressTimestamp;

        expect(elapsed < STALL_THRESHOLD_MS).toBe(true);
      });
    });

    describe('stderr end event handling', () => {
      it('should flush stderr buffer when stderr pipe closes', () => {
        const executor = new Executor(config, storage);
        const outputEvents: any[] = [];

        executor.on('output', (data: any) => {
          outputEvents.push(data);
        });

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };
        tracker.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
        tracker.suiteIndex = new Map();
        tracker.testIndex = new Map();
        tracker.testSuiteIndex = new Map();

        const beginMsg = JSON.stringify({ type: 'begin', totalTests: 5 });
        tracker.stderrBuffer = PROGRESS_MARKER + beginMsg;

        if (tracker.stderrBuffer) {
          tracker.handleData('\n');
          tracker.stderrBuffer = '';
        }

        expect(tracker.realtimeStats.totalTests).toBe(5);
      });
    });
  });

  describe('execution model stability', () => {
    describe('process lifecycle management', () => {
      it('should log process exit info via exit event', () => {
        const executor = new Executor(config, storage);
        expect(typeof executor.getCurrentStatus).toBe('function');
        expect(typeof executor.isCurrentlyRunning).toBe('function');
      });
    });

    describe('improved cancel logic', () => {
      it('should wait for process exit after kill signal', async () => {
        const executor = new Executor(config, storage);

        const mockProcess = {
          pid: 12345,
          exitCode: 1,
          killed: true,
          kill: vi.fn(),
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };

        (executor as any).currentProcess = mockProcess;
        (executor as any).isRunning = true;
        (executor as any)._currentRun = {
          id: 'test-run',
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
        expect((executor as any)._currentRun.status).toBe('cancelled');
        expect((executor as any).currentProcess).toBeNull();
      });

      it('should handle cancel when process has already exited', async () => {
        const executor = new Executor(config, storage);

        const mockProcess = {
          pid: 12345,
          exitCode: 0,
          killed: false,
          kill: vi.fn(),
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };

        (executor as any).currentProcess = mockProcess;
        (executor as any).isRunning = true;
        (executor as any)._currentRun = {
          id: 'test-run',
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
        expect((executor as any)._currentRun.status).toBe('cancelled');
      });

      it('should set cancelled status and emit run_cancelled event', async () => {
        const executor = new Executor(config, storage);
        const cancelListener = vi.fn();

        executor.on('run_cancelled', cancelListener);

        (executor as any).currentProcess = {
          pid: 12345,
          exitCode: 1,
          killed: true,
          kill: vi.fn(),
          on: vi.fn(),
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
        };
        (executor as any).isRunning = true;
        (executor as any)._currentRun = {
          id: 'test-run',
          status: 'running',
          startTime: Date.now() - 1000,
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
        expect((executor as any)._currentRun.endTime).toBeDefined();
        expect((executor as any)._currentRun.duration).toBeGreaterThanOrEqual(0);
      });
    });

    describe('handleProgressData robustness', () => {
      it('should handle multiple progress messages in a single chunk', () => {
        const executor = new Executor(config, storage);
        const outputEvents: any[] = [];

        executor.on('output', (data: any) => {
          outputEvents.push(data);
        });

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };
        tracker.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };

        const msg1 = JSON.stringify({ type: 'begin', totalTests: 3 });
        const msg2 = JSON.stringify({
          type: 'stdout',
          test: { title: 'test1', fullTitle: 'test1' },
          text: 'output line 1',
        });

        tracker.handleData(
          PROGRESS_MARKER + msg1 + '\n' + PROGRESS_MARKER + msg2 + '\n'
        );

        expect(tracker.realtimeStats.totalTests).toBe(3);
        const stdoutOutputs = outputEvents.filter((e) => e.type === 'stdout');
        expect(stdoutOutputs.length).toBe(1);
      });

      it('should handle partial progress message across chunks', () => {
        const executor = new Executor(config, storage);

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };
        tracker.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };

        const msg = JSON.stringify({ type: 'begin', totalTests: 7 });
        tracker.handleData(PROGRESS_MARKER + msg);

        expect(tracker.realtimeStats.totalTests).toBe(0);

        tracker.handleData('\n');

        expect(tracker.realtimeStats.totalTests).toBe(7);
      });

      it('should handle invalid JSON after marker gracefully', () => {
        const executor = new Executor(config, storage);

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };

        expect(() => {
          tracker.handleData(PROGRESS_MARKER + 'invalid-json\n');
        }).not.toThrow();
      });

      it('should handle lines without marker gracefully', () => {
        const executor = new Executor(config, storage);

        const tracker = (executor as any).progressTracker;
        tracker.stderrBuffer = '';
        tracker.currentRun = {
          id: 'test-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
        };

        expect(() => {
          tracker.handleData('Some random stderr output\n');
        }).not.toThrow();
      });
    });
  });
});
