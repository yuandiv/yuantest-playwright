import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProgressTracker } from '@yuantest/executor';
import { Executor } from '@yuantest/executor';
import { RealtimeReporter } from '@yuantest/reporter';
import { MemoryStorage } from '@yuantest/core';
import { PROGRESS_MARKER } from '@yuantest/core';

vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    checkEnvironment: vi.fn().mockResolvedValue({
      playwrightAvailable: true,
      playwrightOk: true,
      playwrightVersion: '1.40.0',
      nodeOk: true,
      nodeVersion: '18.0.0',
      errors: [],
    }),
    MIN_PLAYWRIGHT_VERSION: '1.40.0',
  };
});

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

async function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 100
): Promise<BenchmarkResult> {
  for (let i = 0; i < 2; i++) {
    await fn();
  }
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000);
  }
  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;
  return { name, iterations, totalTime, avgTime, minTime, maxTime, opsPerSecond };
}

async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100
): Promise<BenchmarkResult> {
  for (let i = 0; i < 2; i++) {
    await fn();
  }
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    await fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000);
  }
  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;
  return { name, iterations, totalTime, avgTime, minTime, maxTime, opsPerSecond };
}

function formatResult(result: BenchmarkResult): string {
  return `\n${result.name}:\n  迭代次数: ${result.iterations}\n  总耗时: ${result.totalTime.toFixed(2)}ms\n  平均耗时: ${result.avgTime.toFixed(2)}ms\n  最小耗时: ${result.minTime.toFixed(2)}ms\n  最大耗时: ${result.maxTime.toFixed(2)}ms\n  每秒操作数: ${result.opsPerSecond.toFixed(2)} ops/s\n`;
}

function createTestEndMessage(index: number) {
  return {
    type: 'testEnd' as const,
    test: {
      id: `test-${index}`,
      title: `Test ${index}`,
      fullTitle: `Suite > Test ${index}`,
      suiteTitle: 'Test Suite',
      status: 'passed',
      duration: Math.floor(Math.random() * 200),
      retries: 0,
      browser: 'chromium',
      file: `test.spec.ts`,
      line: index + 1,
      column: 1,
      attachments: [],
    },
    consoleLogs: [],
  };
}

function generateLargeReport(testCount: number) {
  const suites = [];
  const testsPerSuite = 50;
  const suiteCount = Math.ceil(testCount / testsPerSuite);

  for (let s = 0; s < suiteCount; s++) {
    const specCount = s === suiteCount - 1 ? testCount - s * testsPerSuite : testsPerSuite;
    const specs = [];

    for (let t = 0; t < specCount; t++) {
      specs.push({
        id: `spec-${s}-${t}`,
        title: `Test ${s}-${t}`,
        ok: true,
        tags: [],
        tests: [
          {
            timeout: 30000,
            annotations: [],
            expectedStatus: 'passed',
            projectId: 'chromium',
            projectName: 'chromium',
            results: [
              {
                workerIndex: 0,
                parallelIndex: 0,
                status: 'passed' as const,
                duration: Math.floor(Math.random() * 500),
                retry: 0,
                startTime: new Date().toISOString(),
                attachments: [],
              },
            ],
            status: 'expected' as const,
          },
        ],
        file: `suite${s}.spec.ts`,
        line: t + 10,
        column: 1,
      });
    }

    suites.push({
      title: `Suite ${s}`,
      file: `suite${s}.spec.ts`,
      line: 1,
      column: 1,
      specs,
    });
  }

  return {
    config: { rootDir: '/mock', configPath: '/mock/config.ts' },
    suites,
    errors: [],
    stats: {
      startTime: new Date().toISOString(),
      duration: testCount * 50,
      expected: testCount,
      skipped: 0,
      unexpected: 0,
      flaky: 0,
    },
  };
}

describe('Executor Performance Benchmarks', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('EP-01: 进度消息处理吞吐量', () => {
    it('should process 1000 testEnd messages efficiently', async () => {
      const tracker = new ProgressTracker(storage);
      tracker.currentRun = {
        id: 'bench-run',
        status: 'running',
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
        version: '1.0.0',
        startTime: Date.now(),
      };

      const messages = Array.from({ length: 1000 }, (_, i) => createTestEndMessage(i));

      const result = await benchmark(
        'EP-01: 进度消息处理吞吐量 (1000 messages)',
        () => {
          tracker.reset();
          for (const msg of messages) {
            tracker.processMessage(msg);
          }
        },
        100
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(50);
    });
  });

  describe('EP-02: JSON 报告解析性能', () => {
    it('should parse JSON report with 500+ tests efficiently', async () => {
      const executor = new Executor(
        {
          version: '1.0.0',
          testDir: '/mock/tests',
          outputDir: '/mock/output',
        },
        storage
      );

      const report = generateLargeReport(550);

      Object.defineProperty(executor, '_currentRun', {
        value: {
          id: 'bench-report-run',
          status: 'running',
          suites: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          flakyTests: [],
          metadata: {},
          version: '1.0.0',
          startTime: Date.now(),
        },
        writable: false,
      });

      const result = await benchmark(
        'EP-02: JSON 报告解析性能 (550 tests)',
        () => {
          executor.processJSONReport(report);
        },
        50
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(200);
    });
  });

  describe('EP-03: 事件发射性能', () => {
    it('should emit high-frequency test_result events efficiently', async () => {
      const executor = new Executor(
        {
          version: '1.0.0',
          testDir: '/mock/tests',
          outputDir: '/mock/output',
        },
        storage
      );

      let eventCount = 0;
      executor.on('test_result', () => {
        eventCount++;
      });

      const testResults = Array.from({ length: 1000 }, (_, i) => ({
        id: `test-${i}`,
        title: `Test ${i}`,
        fullTitle: `Suite > Test ${i}`,
        status: 'passed' as const,
        duration: Math.random() * 200,
        retries: 0,
        timestamp: Date.now(),
        browser: 'chromium' as const,
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      }));

      const result = await benchmark(
        'EP-03: 事件发射性能 (1000 events)',
        () => {
          eventCount = 0;
          for (const r of testResults) {
            executor.emit('test_result', r);
          }
        },
        100
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(50);
    });
  });

  describe('EP-04: 内存稳定性 — 长时间执行', () => {
    it('should maintain stable memory when processing 1000 progress messages', async () => {
      const tracker = new ProgressTracker(storage);
      tracker.currentRun = {
        id: 'bench-memory-run',
        status: 'running',
        suites: [],
        totalTests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
        version: '1.0.0',
        startTime: Date.now(),
      };

      global.gc?.();

      const memBefore = process.memoryUsage().heapUsed;

      for (let round = 0; round < 5; round++) {
        tracker.reset();
        for (let i = 0; i < 1000; i++) {
          tracker.processMessage(createTestEndMessage(round * 1000 + i));
        }
      }

      global.gc?.();

      const memAfter = process.memoryUsage().heapUsed;
      const memDiffMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`\nEP-04: 内存稳定性:`);
      console.log(`  处理前堆内存: ${(memBefore / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  处理后堆内存: ${(memAfter / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  内存增长: ${memDiffMB.toFixed(2)} MB`);

      expect(memDiffMB).toBeLessThan(50);
    });
  });

  describe('EP-05: handleProgressData 吞吐量', () => {
    it('should handle mixed stderr data with marker and non-marker lines efficiently', async () => {
      const tracker = new ProgressTracker(storage);
      tracker.currentRun = {
        id: 'bench-handleData-run',
        status: 'running',
        suites: [],
        totalTests: 10000,
        passed: 0,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
        version: '1.0.0',
        startTime: Date.now(),
      };

      const buildMixedChunk = (batchId: number): string => {
        const lines: string[] = [];
        for (let i = 0; i < 30; i++) {
          lines.push(`random stderr output line ${i} batch ${batchId}`);
        }
        for (let i = 0; i < 70; i++) {
          const msg = createTestEndMessage(batchId * 70 + i);
          lines.push(PROGRESS_MARKER + JSON.stringify(msg));
        }
        return lines.join('\n') + '\n';
      };

      const chunks = Array.from({ length: 100 }, (_, i) => buildMixedChunk(i));

      const result = await benchmark(
        'EP-05: handleProgressData 吞吐量 (100 chunks x 100 lines)',
        () => {
          tracker.reset();
          for (const chunk of chunks) {
            tracker.handleData(chunk);
          }
        },
        100
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(200);
    });
  });

  describe('EP-06: RealtimeReporter 批量广播性能', () => {
    it('should broadcast 50 test results in a batch efficiently', async () => {
      const reporter = new RealtimeReporter();

      const results = Array.from({ length: 50 }, (_, i) => ({
        id: `test-${i}`,
        title: `Test ${i}`,
        fullTitle: `Suite > Test ${i}`,
        status: 'passed' as const,
        duration: Math.random() * 200,
        retries: 0,
        timestamp: Date.now(),
        browser: 'chromium' as const,
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      }));

      const result = await benchmark(
        'EP-06: RealtimeReporter 批量广播性能 (50 results)',
        () => {
          reporter.broadcastTestResultBatch('bench-batch-run', results);
        },
        100
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(10);
    });
  });
});
