import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestDiscovery } from '@yuantest/executor';
import { MemoryStorage } from '@yuantest/core';

vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    PlaywrightConfigMerger: vi.fn().mockImplementation(function(this: any) {
      this.validateProjectPath = vi.fn().mockResolvedValue({ valid: true, configPath: '/mock/config.ts', error: null });
      this.setLang = vi.fn();
    }),
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

function generateMockListOutput(fileCount: number, testsPerFile: number) {
  const suites = [];

  for (let f = 0; f < fileCount; f++) {
    const specs = [];
    for (let t = 0; t < testsPerFile; t++) {
      specs.push({
        title: `Test ${t}`,
        ok: true,
        tags: t % 3 === 0 ? [`@tag${t}`] : [],
        tests: [
          {
            timeout: 30000,
            annotations: [],
            expectedStatus: 'passed',
            projectId: 'chromium',
            projectName: 'chromium',
            results: [],
            status: 'expected',
          },
        ],
        id: `spec-${f}-${t}`,
        file: `/mock/tests/file${f}.spec.ts`,
        line: t + 10,
        column: 1,
      });
    }

    suites.push({
      title: `file${f}.spec.ts`,
      file: `/mock/tests/file${f}.spec.ts`,
      line: 0,
      column: 0,
      specs,
    });
  }

  return JSON.stringify({
    config: { rootDir: '/mock/tests' },
    suites,
    errors: [],
  });
}

function generateLargeJSONOutput(testCount: number) {
  const testsPerFile = 10;
  const fileCount = Math.ceil(testCount / testsPerFile);
  return generateMockListOutput(fileCount, testsPerFile);
}

function createMockAPITestResult(index: number) {
  return {
    id: `api-test-${index}`,
    title: `API Test ${index}`,
    fullTitle: `Suite > API Test ${index}`,
    file: `/mock/tests/file${Math.floor(index / 10)}.spec.ts`,
    line: (index % 10) + 1,
    column: 1,
    tags: index % 3 === 0 ? [`@tag${index}`] : [],
    annotations: [],
    projectId: 'chromium',
    projectName: 'chromium',
  };
}

function createMockTestCase(index: number) {
  return {
    id: `tc-${index}`,
    name: `Test Case ${index}`,
    fullTitle: `Suite > Test Case ${index}`,
    file: `/mock/tests/file${Math.floor(index / 10)}.spec.ts`,
    line: (index % 10) + 1,
    column: 1,
    lastDuration: Math.random() * 500,
    lastError: null,
  };
}

describe('Discovery Performance Benchmarks', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe('LP-01: 大规模发现性能（1000 文件）', () => {
    it('should discover 1000 files with 10 tests each efficiently', async () => {
      const discovery = new TestDiscovery(storage);

      vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
        stdout: generateMockListOutput(1000, 10),
        stderr: '',
        exitCode: 0,
      });

      const result = await benchmarkAsync(
        'LP-01: 大规模发现性能 (1000 files, 10 tests each)',
        async () => {
          discovery.invalidateCache();
          await discovery.discoverTestsStructured('/mock/tests');
        },
        10
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(500);
    });
  });

  describe('LP-02: parseJSONOutput 性能（2000 测试）', () => {
    it('should parse JSON output with 2000 tests efficiently', async () => {
      const discovery = new TestDiscovery(storage);
      const jsonOutput = generateLargeJSONOutput(2000);

      const parseJSONOutput = (discovery as any).parseJSONOutput.bind(discovery);

      const result = await benchmark(
        'LP-02: parseJSONOutput 性能 (2000 tests)',
        () => {
          parseJSONOutput(jsonOutput, '/mock/tests');
        },
        50
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(100);
    });
  });

  describe('LP-03: 分页发现性能', () => {
    it('should benchmark paginated discovery with different page sizes', async () => {
      const discovery = new TestDiscovery(storage);

      vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
        stdout: generateMockListOutput(200, 10),
        stderr: '',
        exitCode: 0,
      });

      await discovery.discoverTestsStructured('/mock/tests');

      const pageSizes = [50, 100, 200];

      for (const pageSize of pageSizes) {
        const result = await benchmarkAsync(
          `LP-03: 分页发现性能 (pageSize=${pageSize})`,
          async () => {
            await discovery.discoverTestsPaginated('/mock/tests', { page: 1, pageSize });
          },
          50
        );

        console.log(formatResult(result));
        expect(result.avgTime).toBeLessThan(200);
      }
    });
  });

  describe('LP-04: 缓存命中 vs 未命中性能对比', () => {
    it('should show significant speedup on cache hit vs cache miss', async () => {
      const discovery = new TestDiscovery(storage);

      vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
        stdout: generateMockListOutput(500, 10),
        stderr: '',
        exitCode: 0,
      });

      discovery.invalidateCache();

      const missResult = await benchmarkAsync(
        'LP-04a: 缓存未命中 (cold)',
        async () => {
          discovery.invalidateCache();
          await discovery.discoverTestsStructured('/mock/tests');
        },
        10
      );

      console.log(formatResult(missResult));

      await discovery.discoverTestsStructured('/mock/tests');

      const hitResult = await benchmarkAsync(
        'LP-04b: 缓存命中 (warm)',
        async () => {
          await discovery.discoverTestsStructured('/mock/tests');
        },
        50
      );

      console.log(formatResult(hitResult));

      expect(hitResult.avgTime).toBeLessThan(missResult.avgTime);
      expect(hitResult.avgTime).toBeLessThan(missResult.avgTime * 0.5);
    });
  });

  describe('LP-05: 前端 loadTests 大数据量', () => {
    it('should benchmark data transformation of 500+ API test results to TestCase[]', async () => {
      const apiResults = Array.from({ length: 550 }, (_, i) => createMockAPITestResult(i));

      const convertTest = (t: typeof apiResults[0]) => ({
        id: t.id,
        name: t.title,
        fullTitle: t.fullTitle,
        file: t.file,
        line: t.line,
        column: t.column,
        lastDuration: null,
        lastError: null,
      });

      const result = await benchmark(
        'LP-05: 前端 loadTests 数据转换 (550 tests)',
        () => {
          apiResults.map(convertTest);
        },
        100
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(50);
    });
  });

  describe('LP-06: 前端状态恢复性能', () => {
    it('should benchmark restoreTestCasesFromLocalStorage with 500+ cases', async () => {
      const cases = Array.from({ length: 550 }, (_, i) => createMockTestCase(i));

      const savedStatus = cases.map((tc) => ({
        ...tc,
        status: Math.random() > 0.5 ? 'passed' : 'failed',
      }));

      const mockLocalStorage = {
        store: new Map<string, string>(),
        getItem(key: string) {
          return this.store.get(key) || null;
        },
        setItem(key: string, value: string) {
          this.store.set(key, value);
        },
      };

      mockLocalStorage.setItem('testCasesStatus', JSON.stringify(savedStatus));

      const restoreTestCasesFromLocalStorage = (casesToRestore: typeof cases): typeof cases => {
        const saved = mockLocalStorage.getItem('testCasesStatus');
        if (!saved) return casesToRestore;

        const savedStatusArr = JSON.parse(saved);
        if (!Array.isArray(savedStatusArr)) return casesToRestore;

        const statusMap = new Map<string, typeof savedStatusArr[0]>();
        for (const tc of savedStatusArr) {
          if (tc.id && tc.status) {
            statusMap.set(tc.id, tc);
          }
        }

        return casesToRestore.map((tc) => {
          const savedTc = statusMap.get(tc.id);
          if (savedTc && savedTc.status) {
            return {
              ...tc,
              status: savedTc.status,
              lastDuration: savedTc.lastDuration ?? tc.lastDuration,
              lastError: savedTc.lastError ?? tc.lastError,
            };
          }
          return tc;
        });
      };

      const result = await benchmark(
        'LP-06: 前端状态恢复性能 (550 cases)',
        () => {
          restoreTestCasesFromLocalStorage(cases);
        },
        100
      );

      console.log(formatResult(result));
      expect(result.avgTime).toBeLessThan(50);
    });
  });
});
