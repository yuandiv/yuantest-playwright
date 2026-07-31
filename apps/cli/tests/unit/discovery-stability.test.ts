import { vi } from 'vitest';
import { TestDiscovery } from '../../src/discovery';
import { MemoryStorage } from '@yuantest/core';
import { CACHE_CONFIG } from '@yuantest/core';

vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    PlaywrightConfigMerger: vi.fn().mockImplementation(function (this: any) {
      this.validateProjectPath = vi.fn().mockResolvedValue({
        valid: true,
        configPath: '/mock/config.ts',
        configExists: true,
        testDir: '/mock/tests',
        testDirAbsolute: '/mock/tests',
        error: null,
        warnings: [],
      });
      this.setLang = vi.fn();
    }),
  };
});

function generateMockListOutput(testCount: number, fileCount: number = 1) {
  const suites = [];
  for (let f = 0; f < fileCount; f++) {
    const specs = [];
    for (let t = 0; t < testCount; t++) {
      specs.push({
        title: `test-${f}-${t}`,
        ok: true,
        tags: [],
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
        file: `tests/file${f}.spec.ts`,
        line: t + 1,
        column: 1,
      });
    }
    suites.push({
      title: `file${f}.spec.ts`,
      file: `tests/file${f}.spec.ts`,
      line: 0,
      column: 0,
      specs,
      suites: [],
    });
  }
  return JSON.stringify({
    config: { rootDir: '/project' },
    suites,
    errors: [],
  });
}

describe('TestDiscovery Stability', () => {
  let discovery: TestDiscovery;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    discovery = new TestDiscovery(storage);
  });

  afterEach(() => {
    storage.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('L-01: 大量用例发现（500+ 文件）', async () => {
    const mockOutput = generateMockListOutput(50, 10);
    vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
      stdout: mockOutput,
      stderr: '',
      exitCode: 0,
      truncated: false,
    });

    const result = await discovery.discoverTestsStructured('/project/tests');

    expect(result.tests.length).toBe(500);
    expect(result.files.length).toBe(10);
    expect(result.error).toBeUndefined();
  });

  it('L-02: 发现结果截断处理', async () => {
    const mockOutput = generateMockListOutput(5, 1);
    vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
      stdout: mockOutput,
      stderr: '',
      exitCode: 0,
      truncated: true,
    });

    const result = await discovery.discoverTestsStructured('/project/tests');

    expect(result.tests.length).toBe(5);
    expect(result.files.length).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it('L-03: 发现超时处理', async () => {
    vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
      stdout: '',
      stderr: 'Discovery timed out after 120s',
      exitCode: -1,
      truncated: false,
    });

    const result = await discovery.discoverTestsStructured('/project/tests');

    expect(result.error).toBe('Discovery timed out after 120s');
    expect(result.tests.length).toBe(0);
  });

  it('L-04: 畸形 JSON 输出解析', () => {
    const nonJsonResult = (discovery as any).parseJSONOutput(
      'not json at all',
      '/project/tests'
    );
    expect(nonJsonResult.files).toEqual([]);
    expect(nonJsonResult.tests).toEqual([]);

    const incompleteJsonResult = (discovery as any).parseJSONOutput(
      '{"config": {"rootDir": "/project"}, "suites": [',
      '/project/tests'
    );
    expect(incompleteJsonResult.files).toEqual([]);
    expect(incompleteJsonResult.tests).toEqual([]);

    const mixedOutput =
      'Some log output\n{"config": {"rootDir": "/project"}, "suites": [], "errors": []}';
    const mixedResult = (discovery as any).parseJSONOutput(
      mixedOutput,
      '/project/tests'
    );
    expect(mixedResult.files).toEqual([]);
    expect(mixedResult.tests).toEqual([]);
  });

  it('L-05: 并发发现请求', async () => {
    const mockOutput = generateMockListOutput(10, 2);
    vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
      stdout: mockOutput,
      stderr: '',
      exitCode: 0,
      truncated: false,
    });

    const results = await Promise.all([
      discovery.discoverTestsStructured('/project/tests'),
      discovery.discoverTestsStructured('/project/tests'),
      discovery.discoverTestsStructured('/project/tests'),
    ]);

    expect(results[0].tests.length).toBe(results[1].tests.length);
    expect(results[1].tests.length).toBe(results[2].tests.length);
    expect(results[0].tests.length).toBe(20);
  });

  it('L-06: 缓存 TTL 过期与刷新', async () => {
    vi.useFakeTimers();

    const mockOutput = generateMockListOutput(5, 1);
    const spy = vi
      .spyOn(discovery as any, 'runPlaywrightListJSON')
      .mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
        truncated: false,
      });

    await discovery.discoverTestsStructured('/project/tests');
    expect(spy).toHaveBeenCalledTimes(1);

    await discovery.discoverTestsStructured('/project/tests', undefined, true);
    expect(spy).toHaveBeenCalledTimes(1);

    await discovery.discoverTestsStructured('/project/tests', undefined, false);
    expect(spy).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(CACHE_CONFIG.TEST_DISCOVERY_TTL + 1);

    await discovery.discoverTestsStructured('/project/tests', undefined, true);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('L-07: 特殊字符路径处理', () => {
    const specialOutput = JSON.stringify({
      config: { rootDir: '/项目目录' },
      suites: [
        {
          title: '中文测试.spec.ts',
          file: '测试/中文测试.spec.ts',
          line: 0,
          column: 0,
          specs: [
            {
              title: '测试用例 - 特殊字符 @#$%',
              ok: true,
              tags: [],
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
              id: 'spec-special-1',
              file: '测试/中文测试.spec.ts',
              line: 1,
              column: 1,
            },
          ],
          suites: [],
        },
        {
          title: 'path with spaces.spec.ts',
          file: 'tests/path with spaces.spec.ts',
          line: 0,
          column: 0,
          specs: [
            {
              title: 'path with spaces test',
              ok: true,
              tags: [],
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
              id: 'spec-special-2',
              file: 'tests/path with spaces.spec.ts',
              line: 2,
              column: 1,
            },
          ],
          suites: [],
        },
      ],
      errors: [],
    });

    const result = (discovery as any).parseJSONOutput(
      specialOutput,
      '/项目目录'
    );

    expect(result.tests.length).toBe(2);
    expect(result.files.length).toBe(2);
    expect(result.tests[0].title).toBe('测试用例 - 特殊字符 @#$%');
    expect(result.tests[1].file).toContain('path with spaces');
  });

  it('L-08: 分页发现边界', async () => {
    const mockOutput = generateMockListOutput(10, 1);
    vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
      stdout: mockOutput,
      stderr: '',
      exitCode: 0,
      truncated: false,
    });

    const pageZero = await discovery.discoverTestsPaginated('/project/tests', {
      page: 0,
      pageSize: 5,
    });
    expect(pageZero.page).toBe(1);
    expect(pageZero.tests.length).toBe(5);

    const pageExceed = await discovery.discoverTestsPaginated(
      '/project/tests',
      { page: 999, pageSize: 5 }
    );
    expect(pageExceed.page).toBe(2);
    expect(pageExceed.totalPages).toBe(2);

    const pageSizeZero = await discovery.discoverTestsPaginated(
      '/project/tests',
      { page: 1, pageSize: 0 }
    );
    expect(pageSizeZero.tests.length).toBe(0);
    expect(pageSizeZero.total).toBe(10);
  });

  it('L-09: 空测试目录', async () => {
    const emptyOutput = JSON.stringify({
      config: { rootDir: '/project' },
      suites: [],
      errors: [],
    });
    vi.spyOn(discovery as any, 'runPlaywrightListJSON').mockResolvedValue({
      stdout: emptyOutput,
      stderr: '',
      exitCode: 0,
      truncated: false,
    });

    const result = await discovery.discoverTestsStructured('/project/tests');

    expect(result.tests).toEqual([]);
    expect(result.files).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('L-10: 配置文件缺失/无效', async () => {
    vi.spyOn(
      (discovery as any).configMerger,
      'validateProjectPath'
    ).mockResolvedValue({
      valid: false,
      configPath: null,
      configExists: false,
      testDir: null,
      testDirAbsolute: null,
      error: 'No config found',
      warnings: [],
    });

    const result = await discovery.discoverTestsStructured('/invalid/project');

    expect(result.configValidation).toBeDefined();
    expect(result.configValidation!.valid).toBe(false);
    expect(result.configValidation!.error).toBe('No config found');
    expect(result.tests).toEqual([]);
    expect(result.files).toEqual([]);
  });
});
