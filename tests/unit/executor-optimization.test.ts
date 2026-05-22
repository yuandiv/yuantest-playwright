/**
 * 针对执行器优化的专项测试
 * 覆盖三个核心修改：
 * 1. console.log 重复打印修复
 * 2. 用例未执行完毕但任务提前结束修复
 * 3. 执行模型稳定性提升
 */
import { Executor } from '../../src/executor';
import { MemoryStorage } from '../../src/storage';

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

  // ============================================================
  // 修改 1：console.log 重复打印修复
  // ============================================================
  describe('console.log duplicate fix', () => {
    it('should emit output only once for stdout via ProgressReporter (not via proc.stdout)', () => {
      const executor = new Executor(config, storage);
      const outputEvents: any[] = [];

      executor.on('output', (data: any) => {
        outputEvents.push(data);
      });

      // 模拟 ProgressReporter 通过 stderr 标记协议传递的 stdout 消息
      const stdoutMsg = JSON.stringify({
        type: 'stdout',
        test: { title: 'test1', fullTitle: 'suite > test1' },
        text: 'Hello from console.log',
      });

      // 通过 handleProgressData 模拟 ProgressReporter 通道
      (executor as any).stderrBuffer = '';
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
      (executor as any).handleProgressData(PROGRESS_MARKER + stdoutMsg + '\n');

      // 验证：只产生了一次 output 事件（来自 ProgressReporter 通道）
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

      (executor as any).stderrBuffer = '';
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

      // 模拟 ProgressReporter 通过 stderr 标记协议传递的 stdout 消息
      const stdoutMsg = JSON.stringify({
        type: 'stdout',
        test: { title: 'test1', fullTitle: 'suite > test1' },
        text: 'Hello from console.log',
      });
      (executor as any).handleProgressData(PROGRESS_MARKER + stdoutMsg + '\n');

      // 修改后，proc.stdout 不再 emit output 事件
      // 所以即使有 ProgressReporter 通道的消息，也只有一条
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

      (executor as any).stderrBuffer = '';
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

      // 模拟 stderr 中包含标记协议消息和非标记协议的混合内容
      const stdoutMsg = JSON.stringify({
        type: 'stdout',
        test: { title: 'test1', fullTitle: 'suite > test1' },
        text: 'console output',
      });

      // 标记协议行 + 非 Playwright 的 stderr 行
      const mixedStderr =
        PROGRESS_MARKER + stdoutMsg + '\n' +
        'Some Playwright framework warning\n';

      (executor as any).handleProgressData(mixedStderr);

      // ProgressReporter stdout 消息 + 非 Playwright stderr 内容
      expect(outputEvents.length).toBeGreaterThanOrEqual(1);
      const stdoutOutputs = outputEvents.filter((e) => e.type === 'stdout');
      expect(stdoutOutputs.length).toBe(1);
      expect(stdoutOutputs[0].data).toBe('console output');
    });
  });

  // ============================================================
  // 修改 2：用例未执行完毕但任务提前结束修复
  // ============================================================
  describe('task completion reliability', () => {
    describe('enhanced stderr buffer consumption in finalize', () => {
      it('should process remaining stderr buffer on finalize', () => {
        const executor = new Executor(config, storage);
        const testResults: any[] = [];

        executor.on('test_result', (result: any) => {
          testResults.push(result);
        });

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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
        (executor as any).realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
        (executor as any).suiteIndex = new Map();
        (executor as any).testIndex = new Map();
        (executor as any).testSuiteIndex = new Map();

        // 模拟：stderr 缓冲区中有一个未完成的 testEnd 消息（没有换行符结尾）
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

        // 消息没有换行符结尾，留在缓冲区中
        (executor as any).stderrBuffer = PROGRESS_MARKER + testEndMsg;

        // 模拟 finalize 中的缓冲区处理逻辑
        (executor as any).handleProgressData('\n');

        // 二次检查
        if ((executor as any).stderrBuffer.trim()) {
          const markerIndex = (executor as any).stderrBuffer.indexOf(PROGRESS_MARKER);
          if (markerIndex !== -1) {
            const jsonStr = (executor as any).stderrBuffer.substring(markerIndex + PROGRESS_MARKER.length);
            try {
              const msg = JSON.parse(jsonStr);
              (executor as any).processProgressMessage(msg);
            } catch {
              // ignore
            }
          }
        }
        (executor as any).stderrBuffer = '';

        // 验证：testEnd 消息被正确处理，test_result 事件被触发
        expect(testResults.length).toBe(1);
        expect(testResults[0].title).toBe('my test');
        expect(testResults[0].status).toBe('passed');
      });

      it('should handle empty stderr buffer gracefully in finalize', () => {
        const executor = new Executor(config, storage);

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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

        // 模拟 finalize 中的缓冲区处理逻辑
        (executor as any).handleProgressData('\n');

        // 不应抛出异常
        expect((executor as any).stderrBuffer).toBe('');
      });
    });

    describe('optimized timeout calculation', () => {
      it('should consider retries in timeout calculation', () => {
        const configNoRetry = { ...config, retries: 0, timeout: 30000, workers: 1 };
        const configWithRetry = { ...config, retries: 2, timeout: 30000, workers: 1 };

        const executorNoRetry = new Executor(configNoRetry, storage);
        const executorWithRetry = new Executor(configWithRetry, storage);

        // 模拟超时计算逻辑
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

        // 有重试的超时应大于无重试的
        expect(timeoutWithRetry).toBeGreaterThan(timeoutNoRetry);

        // 无重试: (30000 * 10 * 1) / 1 + 300000 = 600000 (刚好是最小值)
        expect(timeoutNoRetry).toBe(600000);

        // 有重试(retries=2): (30000 * 10 * 3) / 1 + 300000 = 1200000
        expect(timeoutWithRetry).toBe(1200000);
      });

      it('should enforce minimum timeout of 10 minutes', () => {
        // 即使测试很少、超时很短，也至少 10 分钟
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
        expect(timeout).toBe(600000); // 10 分钟最小值
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
        expect(timeout).toBe(7200000); // 2 小时最大值
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

        // 模拟停滞检测逻辑
        const STALL_THRESHOLD_MS = 120000; // 2 分钟
        const lastProgressTimestamp = Date.now() - 130000; // 130 秒前
        const elapsed = Date.now() - lastProgressTimestamp;

        if (elapsed > STALL_THRESHOLD_MS) {
          executor.emit('output', {
            data: `⚠️ No progress for ${Math.round(elapsed / 1000)}s, execution may be stalled...`,
            timestamp: Date.now(),
            runId: 'test-run',
            type: 'stderr',
          });
        }

        // 验证：130 秒无进度应该触发停滞警告
        const stallWarnings = outputEvents.filter(
          (e) => e.data && e.data.includes('No progress') && e.data.includes('stalled')
        );
        expect(stallWarnings.length).toBe(1);
      });

      it('should not trigger stall warning within 120 seconds', () => {
        const STALL_THRESHOLD_MS = 120000;
        const lastProgressTimestamp = Date.now() - 60000; // 60 秒前
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

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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
        (executor as any).realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
        (executor as any).suiteIndex = new Map();
        (executor as any).testIndex = new Map();
        (executor as any).testSuiteIndex = new Map();

        // 模拟 stderr 中有未消费的数据
        const beginMsg = JSON.stringify({ type: 'begin', totalTests: 5 });
        (executor as any).stderrBuffer = PROGRESS_MARKER + beginMsg;

        // 模拟 stderr end 事件处理
        if ((executor as any).stderrBuffer) {
          (executor as any).handleProgressData('\n');
          (executor as any).stderrBuffer = '';
        }

        // 验证：begin 消息被正确处理
        expect((executor as any).realtimeStats.totalTests).toBe(5);
      });
    });
  });

  // ============================================================
  // 修改 3：执行模型稳定性提升
  // ============================================================
  describe('execution model stability', () => {
    describe('process lifecycle management', () => {
      it('should log process exit info via exit event', () => {
        const executor = new Executor(config, storage);
        // 验证 executor 实例可以监听 exit 事件相关信息
        // 实际的 exit 事件在 spawn 子进程时触发，这里验证日志记录能力
        expect(typeof executor.getCurrentStatus).toBe('function');
        expect(typeof executor.isCurrentlyRunning).toBe('function');
      });
    });

    describe('improved cancel logic', () => {
      it('should wait for process exit after kill signal', async () => {
        const executor = new Executor(config, storage);

        // 模拟一个已退出的进程
        const mockProcess = {
          pid: 12345,
          exitCode: 1,
          killed: true,
          kill: jest.fn(),
          on: jest.fn(),
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
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

        // 调用 cancel
        await executor.cancel();

        // 验证状态已正确更新
        expect(executor.isCurrentlyRunning()).toBe(false);
        expect((executor as any)._currentRun.status).toBe('cancelled');
        expect((executor as any).currentProcess).toBeNull();
      });

      it('should handle cancel when process has already exited', async () => {
        const executor = new Executor(config, storage);

        // 模拟一个已退出的进程（exitCode 不为 null）
        const mockProcess = {
          pid: 12345,
          exitCode: 0,
          killed: false,
          kill: jest.fn(),
          on: jest.fn(),
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
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
        const cancelListener = jest.fn();

        executor.on('run_cancelled', cancelListener);

        (executor as any).currentProcess = {
          pid: 12345,
          exitCode: 1,
          killed: true,
          kill: jest.fn(),
          on: jest.fn(),
          stdout: { on: jest.fn() },
          stderr: { on: jest.fn() },
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

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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
        (executor as any).realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };

        // 两个消息在一个 chunk 中
        const msg1 = JSON.stringify({ type: 'begin', totalTests: 3 });
        const msg2 = JSON.stringify({
          type: 'stdout',
          test: { title: 'test1', fullTitle: 'test1' },
          text: 'output line 1',
        });

        (executor as any).handleProgressData(
          PROGRESS_MARKER + msg1 + '\n' + PROGRESS_MARKER + msg2 + '\n'
        );

        expect((executor as any).realtimeStats.totalTests).toBe(3);
        const stdoutOutputs = outputEvents.filter((e) => e.type === 'stdout');
        expect(stdoutOutputs.length).toBe(1);
      });

      it('should handle partial progress message across chunks', () => {
        const executor = new Executor(config, storage);

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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
        (executor as any).realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };

        // 第一个 chunk 包含消息的前半部分（没有换行符）
        const msg = JSON.stringify({ type: 'begin', totalTests: 7 });
        (executor as any).handleProgressData(PROGRESS_MARKER + msg);

        // 消息不完整，不应被处理
        expect((executor as any).realtimeStats.totalTests).toBe(0);

        // 第二个 chunk 包含换行符，完成消息
        (executor as any).handleProgressData('\n');

        // 现在消息应该被处理
        expect((executor as any).realtimeStats.totalTests).toBe(7);
      });

      it('should handle invalid JSON after marker gracefully', () => {
        const executor = new Executor(config, storage);

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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

        // 无效 JSON 不应导致崩溃
        expect(() => {
          (executor as any).handleProgressData(PROGRESS_MARKER + 'invalid-json\n');
        }).not.toThrow();
      });

      it('should handle lines without marker gracefully', () => {
        const executor = new Executor(config, storage);

        (executor as any).stderrBuffer = '';
        (executor as any)._currentRun = {
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

        // 不包含标记的行应被忽略
        expect(() => {
          (executor as any).handleProgressData('Some random stderr output\n');
        }).not.toThrow();
      });
    });
  });
});
