import { spawn } from 'child_process';
import * as path from 'path';
import { logger } from '@yuantest/core';
import { StorageProvider, getStorage } from '@yuantest/core';
import { TTLCache } from '@yuantest/core';
import { CACHE_CONFIG } from '@yuantest/core';
import { PlaywrightConfigMerger, ConfigValidationResult } from '@yuantest/core';
import { Lang } from '@yuantest/core';
import { stripAnsi } from '@yuantest/core';
import { safePathForCLI, buildSpawnEnv } from '@yuantest/core';

export interface DiscoveredTest {
  id: string;
  title: string;
  fullTitle: string;
  file: string;
  line: number;
  column: number;
  tags: string[];
  annotations: Array<{ type: string; description?: string }>;
  projectId: string;
  projectName: string;
}

export interface DiscoveredDescribe {
  title: string;
  file: string;
  line: number;
  column: number;
  tests: DiscoveredTest[];
  describes: DiscoveredDescribe[];
}

export interface DiscoveredFile {
  file: string;
  title: string;
  describes: DiscoveredDescribe[];
  tests: DiscoveredTest[];
}

export interface DiscoveredSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  tests: DiscoveredTest[];
  suites: DiscoveredSuite[];
}

export interface TestDiscoveryResult {
  files: DiscoveredFile[];
  tests: DiscoveredTest[];
  configValidation?: ConfigValidationResult;
  error?: string;
  rawOutput?: string;
}

export interface PaginatedTestDiscoveryResult {
  tests: DiscoveredTest[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface PlaywrightListSpec {
  title: string;
  ok: boolean;
  tags: string[];
  tests: Array<{
    timeout: number;
    annotations: Array<{ type: string; description?: string }>;
    expectedStatus: string;
    projectId: string;
    projectName: string;
    results: unknown[];
    status: string;
  }>;
  id: string;
  file?: string;
  line?: number;
  column?: number;
}

interface PlaywrightListSuite {
  title: string;
  file?: string;
  line?: number;
  column?: number;
  specs: PlaywrightListSpec[];
  suites?: PlaywrightListSuite[];
}

interface PlaywrightListOutput {
  config: {
    rootDir: string;
  };
  suites: PlaywrightListSuite[];
  errors: unknown[];
}

export class TestDiscovery {
  private log = logger.child('TestDiscovery');
  private storage: StorageProvider;
  private cache: TTLCache<{
    tests: DiscoveredTest[];
    files: DiscoveredFile[];
    configValidation?: ConfigValidationResult;
    error?: string;
    rawOutput?: string;
  }>;
  private configMerger: PlaywrightConfigMerger;

  constructor(storage?: StorageProvider, lang?: Lang) {
    this.storage = storage || getStorage();
    this.cache = new TTLCache(CACHE_CONFIG.TEST_DISCOVERY_TTL);
    this.configMerger = new PlaywrightConfigMerger(this.storage, lang);
  }

  setLang(lang: Lang): void {
    this.configMerger.setLang(lang);
  }

  async validateProjectPath(projectDir: string): Promise<ConfigValidationResult> {
    return this.configMerger.validateProjectPath(projectDir);
  }

  async discoverTests(
    testDir: string,
    configPath?: string,
    useCache = true
  ): Promise<DiscoveredTest[]> {
    const result = await this.discoverTestsStructured(testDir, configPath, useCache);
    return result.tests;
  }

  async discoverTestsPaginated(
    testDir: string,
    options?: { page?: number; pageSize?: number; configPath?: string }
  ): Promise<PaginatedTestDiscoveryResult> {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 100;

    const result = await this.discoverTestsStructured(testDir, options?.configPath);

    const total = result.tests.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = Math.min(start + pageSize, total);
    const tests = result.tests.slice(start, end);

    return {
      tests,
      total,
      page: safePage,
      pageSize,
      totalPages,
    };
  }

  async getTestCount(testDir: string): Promise<number> {
    const cacheKey = `discovery:${testDir}:default`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached.tests.length;
    }

    const configValidation = await this.configMerger.validateProjectPath(testDir);
    if (!configValidation.valid) {
      return 0;
    }

    try {
      const listResult = await this.runPlaywrightListJSON(
        testDir,
        configValidation.configPath || undefined
      );

      if (listResult.exitCode !== 0 && listResult.exitCode !== null) {
        return 0;
      }

      const jsonOutput = listResult.stdout || '{}';
      return this.countSpecsInJSON(jsonOutput);
    } catch {
      return 0;
    }
  }

  async discoverTestsStructured(
    testDir: string,
    configPath?: string,
    useCache = true
  ): Promise<TestDiscoveryResult> {
    const cacheKey = `discovery:${testDir}:${configPath || 'default'}`;

    if (useCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.log.debug(`Using cached discovery result for ${testDir}`);
        return {
          files: cached.files,
          tests: cached.tests,
          configValidation: cached.configValidation,
          error: cached.error,
          rawOutput: cached.rawOutput,
        };
      }
    }

    const files: DiscoveredFile[] = [];
    const allTests: DiscoveredTest[] = [];

    const configValidation = await this.configMerger.validateProjectPath(testDir);

    if (!configValidation.valid) {
      this.log.warn(`Invalid project path: ${configValidation.error}`);
      return { files, tests: allTests, configValidation };
    }

    try {
      const listResult = await this.runPlaywrightListJSON(
        testDir,
        configPath || configValidation.configPath || undefined
      );

      if (listResult.exitCode !== 0 && listResult.exitCode !== null) {
        this.log.error(
          `Playwright list failed with exit code ${listResult.exitCode}: ${listResult.stderr}`
        );
        const error =
          listResult.stderr || `Playwright list failed with exit code ${listResult.exitCode}`;
        const result: TestDiscoveryResult = {
          files,
          tests: allTests,
          configValidation,
          error,
          rawOutput: listResult.stdout || undefined,
        };
        this.cache.set(cacheKey, {
          tests: allTests,
          files,
          configValidation,
          error,
          rawOutput: listResult.stdout || undefined,
        });
        return result;
      }

      const jsonOutput = listResult.stdout || '{}';
      const parsed = this.parseJSONOutput(jsonOutput, testDir);

      files.push(...parsed.files);
      allTests.push(...parsed.tests);

      if (listResult.truncated) {
        this.log.warn(
          `Output was truncated at ${CACHE_CONFIG.DISCOVERY_MAX_STDOUT_SIZE} bytes, results may be partial`
        );
      }

      this.log.info(`Discovered ${allTests.length} tests in ${files.length} files`);

      this.cache.set(cacheKey, { tests: allTests, files, configValidation });
    } catch (error) {
      this.log.error(
        `Failed to discover tests: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        files,
        tests: allTests,
        configValidation,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return { files, tests: allTests, configValidation };
  }

  invalidateCache(testDir?: string): void {
    if (testDir) {
      this.cache.invalidate(`discovery:${testDir}`);
    } else {
      this.cache.clear();
    }
    this.log.debug('Discovery cache invalidated');
  }

  private collectTestsFromDescribe(describe: DiscoveredDescribe): DiscoveredTest[] {
    const tests: DiscoveredTest[] = [...describe.tests];
    for (const child of describe.describes) {
      tests.push(...this.collectTestsFromDescribe(child));
    }
    return tests;
  }

  private async findPlaywrightConfig(testDir: string): Promise<string | null> {
    const configNames = [
      'playwright.config.ts',
      'playwright.config.js',
      'playwright.config.mts',
      'playwright.config.mjs',
    ];

    let dir = path.resolve(testDir);
    const root = path.parse(dir).root;

    while (dir !== root) {
      for (const name of configNames) {
        const candidate = path.join(dir, name);
        if (await this.storage.exists(candidate)) {
          return candidate;
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    return null;
  }

  private async runPlaywrightListJSON(
    testDir: string,
    configPath?: string
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    truncated?: boolean;
  }> {
    const args = ['playwright', 'test', '--list', '--reporter=json'];

    let resolvedConfigPath = configPath;
    if (!resolvedConfigPath || !(await this.storage.exists(resolvedConfigPath))) {
      resolvedConfigPath = (await this.findPlaywrightConfig(testDir)) || undefined;
    }

    if (resolvedConfigPath) {
      const safeConfigPath = safePathForCLI(resolvedConfigPath);
      args.push(`--config=${safeConfigPath}`);
    }

    const cwd = resolvedConfigPath ? path.dirname(resolvedConfigPath) : testDir;

    this.log.info(`Running: npx ${args.join(' ')} in ${cwd}`);

    const maxStdoutSize = CACHE_CONFIG.DISCOVERY_MAX_STDOUT_SIZE;
    const warnThreshold = maxStdoutSize * 0.8;
    const DISCOVERY_TIMEOUT_MS = 120000;

    return new Promise((resolve) => {
      const proc = spawn('npx', args, {
        cwd,
        shell: true,
        env: buildSpawnEnv(),
      });

      let stdout = '';
      let stderr = '';
      let stdoutSize = 0;
      let truncated = false;
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const finalize = (result: {
        stdout: string;
        stderr: string;
        exitCode: number | null;
        truncated?: boolean;
      }) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };

      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        this.log.warn(
          `Playwright list timeout after ${DISCOVERY_TIMEOUT_MS}ms, killing process...`
        );
        if (proc.pid) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/F', '/T', '/PID', proc.pid.toString()], {
                stdio: 'ignore',
              });
            } else {
              process.kill(-proc.pid, 'SIGKILL');
            }
          } catch {
            proc.kill('SIGKILL');
          }
        }
        finalize({
          stdout: stripAnsi(stdout),
          stderr: `Discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s`,
          exitCode: -1,
          truncated,
        });
      }, DISCOVERY_TIMEOUT_MS);

      proc.stdout?.on('data', (data: Buffer) => {
        if (truncated) {
          return;
        }
        const chunk = data.toString('utf-8');
        const newSize = stdoutSize + Buffer.byteLength(chunk, 'utf-8');

        if (newSize > maxStdoutSize) {
          const remaining = maxStdoutSize - stdoutSize;
          if (remaining > 0) {
            stdout += chunk.substring(0, remaining);
            stdoutSize = maxStdoutSize;
          }
          truncated = true;
          this.log.warn(`stdout exceeded ${maxStdoutSize} bytes limit, truncating output`);
          return;
        }

        if (newSize > warnThreshold && stdoutSize <= warnThreshold) {
          this.log.warn(
            `stdout approaching size limit: ${newSize} bytes (limit: ${maxStdoutSize})`
          );
        }

        stdout += chunk;
        stdoutSize = newSize;
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf-8');
      });

      proc.on('error', (error) => {
        finalize({
          stdout,
          stderr: `Failed to run playwright list: ${error.message}`,
          exitCode: -1,
          truncated,
        });
      });

      proc.on('close', (code) => {
        finalize({
          stdout: stripAnsi(stdout),
          stderr: stripAnsi(stderr),
          exitCode: code,
          truncated,
        });
      });
    });
  }

  private countSpecsInJSON(output: string): number {
    try {
      let jsonStr = output.trim();
      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }
      const data: PlaywrightListOutput = JSON.parse(jsonStr);

      let count = 0;
      const countSpecs = (suite: PlaywrightListSuite) => {
        count += suite.specs?.length || 0;
        if (suite.suites) {
          for (const child of suite.suites) {
            countSpecs(child);
          }
        }
      };

      for (const suite of data.suites || []) {
        countSpecs(suite);
      }
      return count;
    } catch {
      return 0;
    }
  }

  private parseJSONOutput(output: string, testDir: string): TestDiscoveryResult {
    const files: DiscoveredFile[] = [];
    const allTests: DiscoveredTest[] = [];

    let data: PlaywrightListOutput;
    try {
      let jsonStr = output.trim();

      const jsonStart = jsonStr.indexOf('{');
      const jsonEnd = jsonStr.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        jsonStr = jsonStr.substring(jsonStart, jsonEnd + 1);
      }

      data = JSON.parse(jsonStr);
    } catch (parseError) {
      this.log.warn(
        `Failed to parse JSON output from playwright list: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
      return { files, tests: allTests };
    }

    const rootDir = data.config?.rootDir || testDir;
    const fileMap = new Map<string, DiscoveredFile>();

    let estimatedSpecCount = 0;
    const estimateSpecs = (suites: PlaywrightListSuite[]) => {
      for (const suite of suites) {
        estimatedSpecCount += suite.specs?.length || 0;
        if (suite.suites) {
          estimateSpecs(suite.suites);
        }
      }
    };
    estimateSpecs(data.suites || []);

    const isLargeOutput = estimatedSpecCount > CACHE_CONFIG.DISCOVERY_LARGE_TEST_THRESHOLD;
    const isVerboseLog = estimatedSpecCount <= CACHE_CONFIG.DISCOVERY_VERBOSE_LOG_THRESHOLD;

    this.log.info(
      `parseJSONOutput: rootDir=${rootDir}, suites count=${data.suites?.length || 0}, estimated specs=${estimatedSpecCount}, largeMode=${isLargeOutput}`
    );

    const processSuiteFlat = (
      suite: PlaywrightListSuite,
      parentPath: string[] = [],
      parentFile: string = ''
    ) => {
      let filePath = parentFile;
      if (suite.file) {
        filePath = path.resolve(rootDir, suite.file);
      }

      if (filePath && !fileMap.has(filePath)) {
        const discoveredFile: DiscoveredFile = {
          file: filePath,
          title: path.basename(filePath),
          describes: [],
          tests: [],
        };
        fileMap.set(filePath, discoveredFile);
        files.push(discoveredFile);
      }

      const currentFile = filePath ? (fileMap.get(filePath) ?? null) : null;

      if (suite.specs && suite.specs.length > 0) {
        for (const spec of suite.specs) {
          const test = this.createDiscoveredTest(spec, filePath || rootDir, parentPath);
          allTests.push(test);
          if (currentFile) {
            currentFile.tests.push(test);
          }
        }
      }

      if (suite.suites) {
        for (const childSuite of suite.suites) {
          const childPath =
            suite.title &&
            !suite.title.endsWith('.ts') &&
            !suite.title.endsWith('.tsx') &&
            !suite.title.endsWith('.js') &&
            !suite.title.endsWith('.jsx') &&
            suite.line !== 0
              ? [...parentPath, suite.title]
              : parentPath;
          processSuiteFlat(childSuite, childPath, filePath);
        }
      }
    };

    const processSuite = (
      suite: PlaywrightListSuite,
      parentPath: string[] = [],
      parentFile: string = ''
    ) => {
      let filePath = parentFile;
      if (suite.file) {
        filePath = path.resolve(rootDir, suite.file);
      }

      if (isVerboseLog) {
        this.log.info(
          `processSuite: title=${suite.title}, file=${suite.file}, filePath=${filePath}, specs=${suite.specs?.length || 0}, suites=${suite.suites?.length || 0}`
        );
      }

      if (filePath && !fileMap.has(filePath)) {
        const discoveredFile: DiscoveredFile = {
          file: filePath,
          title: path.basename(filePath),
          describes: [],
          tests: [],
        };
        fileMap.set(filePath, discoveredFile);
        files.push(discoveredFile);
        if (isVerboseLog) {
          this.log.info(`Added file to map: ${filePath}`);
        }
      }

      const currentFile = filePath ? (fileMap.get(filePath) ?? null) : null;

      if (suite.specs && suite.specs.length > 0) {
        const isFileSuite =
          suite.title.endsWith('.ts') ||
          suite.title.endsWith('.tsx') ||
          suite.title.endsWith('.js') ||
          suite.title.endsWith('.jsx') ||
          suite.line === 0;

        if (isFileSuite && currentFile) {
          for (const spec of suite.specs) {
            const test = this.createDiscoveredTest(spec, filePath, parentPath);
            currentFile.tests.push(test);
            allTests.push(test);
          }
        } else if (currentFile) {
          const describe: DiscoveredDescribe = {
            title: suite.title,
            file: filePath,
            line: suite.line || 0,
            column: suite.column || 0,
            tests: [],
            describes: [],
          };

          for (const spec of suite.specs) {
            const test = this.createDiscoveredTest(spec, filePath, [...parentPath, suite.title]);
            describe.tests.push(test);
            allTests.push(test);
          }

          if (parentPath.length === 0) {
            currentFile.describes.push(describe);
          } else {
            this.addDescribeToParent(currentFile.describes, parentPath, describe);
          }
        } else {
          for (const spec of suite.specs) {
            const test = this.createDiscoveredTest(spec, filePath || rootDir, parentPath);
            allTests.push(test);
          }
        }
      }

      if (suite.suites) {
        for (const childSuite of suite.suites) {
          const childPath =
            suite.title &&
            !suite.title.endsWith('.ts') &&
            !suite.title.endsWith('.tsx') &&
            !suite.title.endsWith('.js') &&
            !suite.title.endsWith('.jsx') &&
            suite.line !== 0
              ? [...parentPath, suite.title]
              : parentPath;
          processSuite(childSuite, childPath, filePath);
        }
      }
    };

    const processor = isLargeOutput ? processSuiteFlat : processSuite;

    for (const suite of data.suites || []) {
      processor(suite);
    }

    if (isLargeOutput) {
      this.log.info(
        `Large output mode: skipped describe tree construction for ${allTests.length} tests`
      );
    }

    return { files, tests: allTests };
  }

  private addDescribeToParent(
    describes: DiscoveredDescribe[],
    parentPath: string[],
    newDescribe: DiscoveredDescribe
  ): void {
    if (parentPath.length === 0) {
      describes.push(newDescribe);
      return;
    }

    const parent = describes.find((d) => d.title === parentPath[0]);
    if (parent) {
      this.addDescribeToParent(parent.describes, parentPath.slice(1), newDescribe);
    }
  }

  private createDiscoveredTest(
    spec: PlaywrightListSpec,
    filePath: string,
    suitePath: string[]
  ): DiscoveredTest {
    const fullTitle =
      suitePath.length > 0 ? `${suitePath.join(' > ')} > ${spec.title}` : spec.title;

    const firstTest = spec.tests[0];

    return {
      id: spec.id,
      title: spec.title,
      fullTitle,
      file: filePath,
      line: spec.line || 0,
      column: spec.column || 0,
      tags: spec.tags || [],
      annotations: firstTest?.annotations || [],
      projectId: firstTest?.projectId || 'chromium',
      projectName: firstTest?.projectName || 'chromium',
    };
  }

  async getTestStats(testDir: string): Promise<{
    totalTests: number;
    totalFiles: number;
    byTag: Record<string, number>;
    byFile: Record<string, number>;
  }> {
    const result = await this.discoverTestsStructured(testDir);
    const tests = result.tests;

    const byTag: Record<string, number> = {};
    const byFile: Record<string, number> = {};

    for (const test of tests) {
      byFile[test.file] = (byFile[test.file] || 0) + 1;

      for (const tag of test.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }

    return {
      totalTests: tests.length,
      totalFiles: result.files.length,
      byTag,
      byFile,
    };
  }

  static buildGrepPatternForDescribe(describeTitle: string): string {
    const escaped = describeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `^${escaped}`;
  }

  static buildGrepPatternForTests(tests: DiscoveredTest[]): string {
    const patterns = tests.map((test) => {
      return test.fullTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return patterns.join('|');
  }
}
