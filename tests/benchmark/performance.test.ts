/**
 * 性能基准测试套件
 * 测试大规模测试文件发现、报告生成和 WebSocket 消息吞吐量
 */

import { Orchestrator } from '../../src/orchestrator';
import { Reporter } from '../../src/reporter';
import { RealtimeReporter, RealtimeReporterClient } from '../../src/realtime';
import { MemoryStorage } from '../../src/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalTime: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  opsPerSecond: number;
}

function benchmark(
  name: string,
  fn: () => void | Promise<void>,
  iterations: number = 100
): BenchmarkResult {
  const times: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    times.push(Number(end - start) / 1_000_000);
  }

  const totalTime = times.reduce((a, b) => a + b, 0);
  const avgTime = totalTime / iterations;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const opsPerSecond = 1000 / avgTime;

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    opsPerSecond,
  };
}

async function benchmarkAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100
): Promise<BenchmarkResult> {
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

  return {
    name,
    iterations,
    totalTime,
    avgTime,
    minTime,
    maxTime,
    opsPerSecond,
  };
}

function formatResult(result: BenchmarkResult): string {
  return `
${result.name}:
  迭代次数: ${result.iterations}
  总耗时: ${result.totalTime.toFixed(2)}ms
  平均耗时: ${result.avgTime.toFixed(2)}ms
  最小耗时: ${result.minTime.toFixed(2)}ms
  最大耗时: ${result.maxTime.toFixed(2)}ms
  每秒操作数: ${result.opsPerSecond.toFixed(2)} ops/s
`;
}

describe('Performance Benchmarks', () => {
  let tmpDir: string;
  let storage: MemoryStorage;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'benchmark-'));
    storage = new MemoryStorage();
  });

  afterEach(async () => {
    storage.clear();
    await new Promise(resolve => setTimeout(resolve, 10));
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Test Discovery Performance', () => {
    it('should benchmark small test directory discovery (10 files)', async () => {
      const testDir = path.join(tmpDir, 'tests-small');
      fs.mkdirSync(testDir, { recursive: true });

      for (let i = 0; i < 10; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.spec.ts`),
          `describe('Test ${i}', () => { it('should work', () => {}); });`
        );
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
      }, storage);

      await orchestrator.initialize();

      const result = await benchmarkAsync(
        'Small Directory Discovery (10 files)',
        async () => {
          await orchestrator.orchestrate();
        },
        50
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(100);
    });

    it('should benchmark medium test directory discovery (100 files)', async () => {
      const testDir = path.join(tmpDir, 'tests-medium');
      fs.mkdirSync(testDir, { recursive: true });

      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.spec.ts`),
          `describe('Test ${i}', () => { it('should work', () => {}); });`
        );
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
      }, storage);

      await orchestrator.initialize();

      const result = await benchmarkAsync(
        'Medium Directory Discovery (100 files)',
        async () => {
          await orchestrator.orchestrate();
        },
        20
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(500);
    });

    it('should benchmark large test directory discovery (500 files)', async () => {
      const testDir = path.join(tmpDir, 'tests-large');
      fs.mkdirSync(testDir, { recursive: true });

      for (let i = 0; i < 500; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.spec.ts`),
          `describe('Test ${i}', () => { it('should work', () => {}); });`
        );
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
      }, storage);

      await orchestrator.initialize();

      const result = await benchmarkAsync(
        'Large Directory Discovery (500 files)',
        async () => {
          await orchestrator.orchestrate();
        },
        10
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(2000);
    });

    it('should benchmark nested directory discovery', async () => {
      const testDir = path.join(tmpDir, 'tests-nested');
      fs.mkdirSync(testDir, { recursive: true });

      for (let d = 0; d < 10; d++) {
        const dir = path.join(testDir, `suite-${d}`);
        fs.mkdirSync(dir, { recursive: true });
        for (let f = 0; f < 10; f++) {
          fs.writeFileSync(
            path.join(dir, `test-${f}.spec.ts`),
            `describe('Test ${d}-${f}', () => { it('should work', () => {}); });`
          );
        }
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
      }, storage);

      await orchestrator.initialize();

      const result = await benchmarkAsync(
        'Nested Directory Discovery (100 files in 10 dirs)',
        async () => {
          await orchestrator.orchestrate();
        },
        20
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(500);
    });
  });

  describe('Report Generation Performance', () => {
    it('should benchmark small report generation (10 tests)', async () => {
      const reporter = new Reporter(tmpDir);

      const runResult = {
        id: 'benchmark-small',
        version: '1.0.0',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [{
          name: 'Suite 1',
          totalTests: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
          duration: 1000,
          tests: Array(10).fill(null).map((_, i) => ({
            id: `test-${i}`,
            title: `Test ${i}`,
            status: 'passed' as const,
            duration: 100,
            retries: 0,
            timestamp: Date.now(),
            browser: 'chromium' as const,
            screenshots: [],
            videos: [],
            traces: [],
            logs: [],
          })),
          timestamp: Date.now(),
        }],
        totalTests: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      const result = await benchmarkAsync(
        'Small Report Generation (10 tests)',
        async () => {
          await reporter.generateReport({
            ...runResult,
            id: `benchmark-small-${Date.now()}`,
          });
        },
        50
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(200);
    });

    it('should benchmark medium report generation (100 tests)', async () => {
      const reporter = new Reporter(tmpDir);

      const runResult = {
        id: 'benchmark-medium',
        version: '1.0.0',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 5000,
        suites: [{
          name: 'Suite 1',
          totalTests: 100,
          passed: 95,
          failed: 5,
          skipped: 0,
          duration: 5000,
          tests: Array(100).fill(null).map((_, i) => ({
            id: `test-${i}`,
            title: `Test ${i}`,
            status: i < 95 ? 'passed' as const : 'failed' as const,
            duration: 50,
            retries: 0,
            timestamp: Date.now(),
            browser: 'chromium' as const,
            screenshots: [],
            videos: [],
            traces: [],
            logs: [],
            error: i >= 95 ? 'Error' : undefined,
          })),
          timestamp: Date.now(),
        }],
        totalTests: 100,
        passed: 95,
        failed: 5,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      const result = await benchmarkAsync(
        'Medium Report Generation (100 tests)',
        async () => {
          await reporter.generateReport({
            ...runResult,
            id: `benchmark-medium-${Date.now()}`,
          });
        },
        20
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(200);
    });

    it('should benchmark large report generation (500 tests)', async () => {
      const reporter = new Reporter(tmpDir);

      const suites = [];
      for (let s = 0; s < 10; s++) {
        suites.push({
          name: `Suite ${s}`,
          totalTests: 50,
          passed: 45,
          failed: 5,
          skipped: 0,
          duration: 5000,
          tests: Array(50).fill(null).map((_, i) => ({
            id: `test-${s}-${i}`,
            title: `Test ${s}-${i}`,
            status: i < 45 ? 'passed' as const : 'failed' as const,
            duration: 100,
            retries: 0,
            timestamp: Date.now(),
            browser: 'chromium' as const,
            screenshots: [],
            videos: [],
            traces: [],
            logs: [],
            error: i >= 45 ? 'Error' : undefined,
          })),
          timestamp: Date.now(),
        });
      }

      const runResult = {
        id: 'benchmark-large',
        version: '1.0.0',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 10000,
        suites,
        totalTests: 500,
        passed: 450,
        failed: 50,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      const result = await benchmarkAsync(
        'Large Report Generation (500 tests)',
        async () => {
          await reporter.generateReport({
            ...runResult,
            id: `benchmark-large-${Date.now()}`,
          });
        },
        10
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(500);
    });

    it('should benchmark report with artifacts', async () => {
      const reporter = new Reporter(tmpDir);

      const runResult = {
        id: 'benchmark-artifacts',
        version: '1.0.0',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 1000,
        suites: [{
          name: 'Suite 1',
          totalTests: 10,
          passed: 10,
          failed: 0,
          skipped: 0,
          duration: 1000,
          tests: Array(10).fill(null).map((_, i) => ({
            id: `test-${i}`,
            title: `Test ${i}`,
            status: 'passed' as const,
            duration: 100,
            retries: 0,
            timestamp: Date.now(),
            browser: 'chromium' as const,
            screenshots: [`screenshot-${i}.png`],
            videos: [`video-${i}.webm`],
            traces: [`trace-${i}.zip`],
            logs: [`log-${i}.txt`],
          })),
          timestamp: Date.now(),
        }],
        totalTests: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        flakyTests: [],
        metadata: {
          artifacts: {
            total: 40,
            byType: { screenshot: 10, video: 10, trace: 10, log: 10 },
          },
        },
      };

      const result = await benchmarkAsync(
        'Report with Artifacts (40 artifacts)',
        async () => {
          await reporter.generateReport({
            ...runResult,
            id: `benchmark-artifacts-${Date.now()}`,
          });
        },
        30
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(150);
    });
  });

  describe('WebSocket Throughput', () => {
    it('should benchmark message serialization performance', () => {
      const message = {
        type: 'test_result' as const,
        payload: {
          id: 'test-1',
          title: 'Test 1',
          status: 'passed' as const,
          duration: 100,
          timestamp: Date.now(),
          browser: 'chromium' as const,
        },
        timestamp: Date.now(),
        runId: 'run-1',
      };

      const result = benchmark(
        'Message Serialization',
        () => {
          JSON.stringify(message);
        },
        10000
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(1);
    });

    it('should benchmark large message serialization', () => {
      const tests = Array(100).fill(null).map((_, i) => ({
        id: `test-${i}`,
        title: `Test ${i}`,
        status: 'passed' as const,
        duration: Math.random() * 100,
        timestamp: Date.now(),
        browser: 'chromium' as const,
      }));

      const message = {
        type: 'test_result_batch' as const,
        payload: { results: tests },
        timestamp: Date.now(),
        runId: 'run-1',
      };

      const result = benchmark(
        'Large Message Serialization (100 tests)',
        () => {
          JSON.stringify(message);
        },
        1000
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(5);
    });

    it('should benchmark message deserialization performance', () => {
      const message = JSON.stringify({
        type: 'test_result' as const,
        payload: {
          id: 'test-1',
          title: 'Test 1',
          status: 'passed' as const,
          duration: 100,
          timestamp: Date.now(),
          browser: 'chromium' as const,
        },
        timestamp: Date.now(),
        runId: 'run-1',
      });

      const result = benchmark(
        'Message Deserialization',
        () => {
          JSON.parse(message);
        },
        10000
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(1);
    });

    it('should benchmark RealtimeReporter run_started message creation', () => {
      const reporter = new RealtimeReporter();

      const result = benchmark(
        'RealtimeReporter broadcastRunStarted',
        () => {
          reporter.broadcastRunStarted('run-1', '1.0.0', 100);
        },
        1000
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(1);
    });

    it('should benchmark progress message creation', () => {
      const reporter = new RealtimeReporter();
      reporter.broadcastRunStarted('run-1', '1.0.0', 100);

      const result = benchmark(
        'Progress Message Creation',
        () => {
          reporter.broadcastRunProgress('run-1', {
            status: 'running',
            totalTests: 100,
            passed: 50,
            failed: 5,
            skipped: 0,
            progress: 50,
            flakyTests: [],
          });
        },
        1000
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(1);
    });

    it('should benchmark test result broadcast', () => {
      const reporter = new RealtimeReporter();
      reporter.broadcastRunStarted('run-1', '1.0.0', 100);

      const testResult = {
        id: 'test-1',
        title: 'Test 1',
        status: 'passed' as const,
        duration: 100,
        retries: 0,
        timestamp: Date.now(),
        browser: 'chromium' as const,
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      };

      const result = benchmark(
        'Test Result Broadcast',
        () => {
          reporter.broadcastTestResult('run-1', testResult);
        },
        1000
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(1);
    });
  });

  describe('Memory Performance', () => {
    it('should measure memory usage for large test discovery', async () => {
      const testDir = path.join(tmpDir, 'tests-memory');
      fs.mkdirSync(testDir, { recursive: true });

      for (let i = 0; i < 200; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.spec.ts`),
          `describe('Test ${i}', () => { it('should work', () => {}); });`
        );
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
      }, storage);

      await orchestrator.initialize();

      const memBefore = process.memoryUsage().heapUsed;
      await orchestrator.orchestrate();
      const memAfter = process.memoryUsage().heapUsed;

      const memDiff = (memAfter - memBefore) / 1024 / 1024;
      console.log(`Memory difference: ${memDiff.toFixed(2)} MB`);
      expect(memDiff).toBeLessThan(50);
    });

    it('should measure memory usage for large report generation', async () => {
      const reporter = new Reporter(tmpDir);

      const suites = [];
      for (let s = 0; s < 20; s++) {
        suites.push({
          name: `Suite ${s}`,
          totalTests: 50,
          passed: 45,
          failed: 5,
          skipped: 0,
          duration: 5000,
          tests: Array(50).fill(null).map((_, i) => ({
            id: `test-${s}-${i}`,
            title: `Test ${s}-${i}`,
            status: i < 45 ? 'passed' as const : 'failed' as const,
            duration: 100,
            retries: 0,
            timestamp: Date.now(),
            browser: 'chromium' as const,
            screenshots: [],
            videos: [],
            traces: [],
            logs: [],
            error: i >= 45 ? 'Error' : undefined,
          })),
          timestamp: Date.now(),
        });
      }

      const runResult = {
        id: 'benchmark-memory',
        version: '1.0.0',
        status: 'success' as const,
        startTime: Date.now(),
        endTime: Date.now(),
        duration: 10000,
        suites,
        totalTests: 1000,
        passed: 900,
        failed: 100,
        skipped: 0,
        flakyTests: [],
        metadata: {},
      };

      const memBefore = process.memoryUsage().heapUsed;
      await reporter.generateReport(runResult);
      const memAfter = process.memoryUsage().heapUsed;

      const memDiff = (memAfter - memBefore) / 1024 / 1024;
      console.log(`Memory difference: ${memDiff.toFixed(2)} MB`);
      expect(memDiff).toBeLessThan(100);
    });
  });

  describe('Sharding Performance', () => {
    it('should benchmark shard distribution algorithm', async () => {
      const testDir = path.join(tmpDir, 'tests-shard');
      fs.mkdirSync(testDir, { recursive: true });

      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.spec.ts`),
          `describe('Test ${i}', () => { it('should work', () => {}); });`
        );
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
        shards: 4,
      }, storage);

      await orchestrator.initialize();

      const result = await benchmarkAsync(
        'Shard Distribution (100 files, 4 shards)',
        async () => {
          await orchestrator.orchestrate();
        },
        50
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(200);
    });

    it('should benchmark optimized sharding algorithm', async () => {
      const testDir = path.join(tmpDir, 'tests-opt-shard');
      fs.mkdirSync(testDir, { recursive: true });

      for (let i = 0; i < 100; i++) {
        fs.writeFileSync(
          path.join(testDir, `test-${i}.spec.ts`),
          `describe('Test ${i}', () => { it('should work', () => {}); });`
        );
      }

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir,
        outputDir: path.join(tmpDir, 'output'),
        shards: 4,
      }, storage);

      await orchestrator.initialize();

      const result = await benchmarkAsync(
        'Optimized Sharding (100 files, 4 shards)',
        async () => {
          await orchestrator.optimizeSharding();
        },
        50
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(300);
    });
  });
});
