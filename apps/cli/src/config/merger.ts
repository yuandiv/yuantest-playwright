/**
 * Playwright 原生配置合并器
 *
 * 职责：发现、加载、验证和合并 Playwright 原生配置文件（playwright.config.ts/js/mts），
 * 将 YuanTest 的运行参数与 Playwright 原生配置合并为最终执行配置。
 * 不负责 YuanTest 自身配置的加载（由 loader.ts 处理）。
 */
import * as path from 'path';
import { spawn } from 'child_process';
import { logger } from '../logger';
import { StorageProvider, getStorage } from '../storage';
import { t, Lang } from '../i18n';

export interface PlaywrightProjectConfig {
  testDir?: string;
  testIgnore?: string[];
  testMatch?: string | string[];
  timeout?: number;
  retries?: number;
  workers?: number;
  reporter?: Array<string | [string, Record<string, unknown>]>;
  use?: Record<string, unknown>;
  projects?: Array<{
    name: string;
    use?: Record<string, unknown>;
  }>;
  outputDir?: string;
  snapshotDir?: string;
  webServer?: {
    command?: string;
    port?: number;
    url?: string;
    reuseExistingServer?: boolean;
  };
}

export interface PlaywrightConfigFile {
  testDir?: string;
  testIgnore?: string[];
  testMatch?: string | string[];
  timeout?: number;
  expect?: {
    timeout?: number;
  };
  fullyParallel?: boolean;
  forbidOnly?: boolean;
  retries?: number;
  workers?: number;
  reporter?: Array<string | [string, Record<string, unknown>]>;
  use?: Record<string, unknown>;
  projects?: Array<{
    name: string;
    use?: Record<string, unknown>;
  }>;
  outputDir?: string;
  snapshotDir?: string;
  webServer?: {
    command?: string;
    port?: number;
    url?: string;
    reuseExistingServer?: boolean;
  };
  tag?: string;
}

export interface MergedPlaywrightConfig {
  configPath: string | null;
  configExists: boolean;
  testDir: string;
  testDirAbsolute: string;
  testIgnore: string[];
  testMatch: string | string[];
  timeout: number;
  expectTimeout: number;
  retries: number;
  workers: number;
  projects: Array<{ name: string; use?: Record<string, unknown> }>;
  reporter: Array<string | [string, Record<string, unknown>]>;
  use: Record<string, unknown>;
  outputDir: string;
  snapshotDir: string;
  baseURL?: string;
  webServer?: PlaywrightConfigFile['webServer'];
  tag?: string;
  warnings: string[];
}

export interface ConfigValidationResult {
  valid: boolean;
  configPath: string | null;
  configExists: boolean;
  testDir: string | null;
  testDirAbsolute: string | null;
  error?: string;
  warnings: string[];
  workers?: number;
}

const PLAYWRIGHT_CONFIG_NAMES = [
  'playwright.config.ts',
  'playwright.config.js',
  'playwright.config.mts',
  'playwright.config.mjs',
];

const FRAMEWORK_DEFAULTS = {
  timeout: 30000,
  expectTimeout: 5000,
  retries: 0,
  workers: 1,
  testIgnore: [],
  testMatch: '**/*.{test,spec}.{js,ts,mjs,mts}',
  projects: [{ name: 'chromium', use: {} }],
  outputDir: './test-reports',
  snapshotDir: './test-reports/snapshots',
};

export class PlaywrightConfigMerger {
  private log = logger.child('PlaywrightConfigMerger');
  private storage: StorageProvider;
  private lang: Lang = 'zh';
  private configCache = new Map<string, { mtime: number; config: PlaywrightConfigFile }>();

  constructor(storage?: StorageProvider, lang?: Lang) {
    this.storage = storage || getStorage();
    this.lang = lang || 'zh';
  }

  setLang(lang: Lang): void {
    this.lang = lang;
  }

  async findPlaywrightConfig(projectDir: string): Promise<string | null> {
    const absoluteDir = path.resolve(projectDir);

    for (const name of PLAYWRIGHT_CONFIG_NAMES) {
      const candidate = path.join(absoluteDir, name);
      if (await this.storage.exists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  async validateProjectPath(projectDir: string): Promise<ConfigValidationResult> {
    const absoluteDir = path.resolve(projectDir);
    const warnings: string[] = [];

    if (!(await this.storage.exists(absoluteDir))) {
      return {
        valid: false,
        configPath: null,
        configExists: false,
        testDir: null,
        testDirAbsolute: null,
        error: t('directoryNotFound', this.lang),
        warnings,
      };
    }

    const configPath = await this.findPlaywrightConfig(absoluteDir);

    if (!configPath) {
      return {
        valid: false,
        configPath: null,
        configExists: false,
        testDir: null,
        testDirAbsolute: null,
        error: t('configNotFound', this.lang),
        warnings,
      };
    }

    try {
      const config = await this.loadPlaywrightConfig(configPath);
      const testDir = config.testDir || './';
      const testDirAbsolute = this.resolveTestDir(testDir, configPath);

      if (!(await this.storage.exists(testDirAbsolute))) {
        warnings.push(`${t('testDirNotFound', this.lang)}: ${testDirAbsolute}`);
      }

      return {
        valid: true,
        configPath,
        configExists: true,
        testDir,
        testDirAbsolute,
        warnings,
        workers: config.workers,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const prefix = t('configParseFailed', this.lang);
      // 避免重复添加 configParseFailed 前缀
      const errorMessage = errorMsg.startsWith(prefix) ? errorMsg : `${prefix}: ${errorMsg}`;
      return {
        valid: false,
        configPath,
        configExists: true,
        testDir: null,
        testDirAbsolute: null,
        error: errorMessage,
        warnings,
      };
    }
  }

  async loadPlaywrightConfig(configPath: string): Promise<PlaywrightConfigFile> {
    const absolutePath = path.resolve(configPath);

    if (!(await this.storage.exists(absolutePath))) {
      throw new Error(`${t('configFileNotFound', this.lang)}: ${absolutePath}`);
    }

    // 检查缓存
    let stat: Awaited<ReturnType<typeof this.storage.stat>> | undefined;
    try {
      stat = (await this.storage.stat(absolutePath)) ?? undefined;
    } catch {
      // stat 失败，跳过缓存
    }
    if (stat) {
      const cached = this.configCache.get(absolutePath);
      if (cached && cached.mtime >= stat.mtimeMs) {
        this.log.debug?.(`Using cached config for ${absolutePath}`);
        return cached.config;
      }
    }

    // 先尝试进程内加载（快），@playwright/test 不会在主进程被顶层导入
    try {
      const config = this.loadConfigWithJiti(absolutePath);
      const result =
        typeof config === 'function'
          ? (config as () => PlaywrightConfigFile)()
          : (config as PlaywrightConfigFile);

      // 写入缓存
      if (stat) {
        this.configCache.set(absolutePath, { mtime: stat.mtimeMs, config: result });
      }

      return result;
    } catch (inProcessError) {
      const inProcessMsg =
        inProcessError instanceof Error ? inProcessError.message : String(inProcessError);
      this.log.debug?.(`In-process load failed, trying subprocess load: ${inProcessMsg}`);

      // 进程内加载失败时，回退到子进程加载（兜底）
      try {
        const config = await this.loadConfigInSubprocess(absolutePath);
        const result =
          typeof config === 'function'
            ? (config as () => PlaywrightConfigFile)()
            : (config as PlaywrightConfigFile);

        // 写入缓存
        if (stat) {
          this.configCache.set(absolutePath, { mtime: stat.mtimeMs, config: result });
        }

        return result;
      } catch (subprocessError) {
        const subprocessMsg =
          subprocessError instanceof Error ? subprocessError.message : String(subprocessError);
        throw new Error(`In-process: ${inProcessMsg} | Subprocess: ${subprocessMsg}`, {
          cause: subprocessError,
        });
      }
    }
  }

  private async loadConfigInSubprocess(absolutePath: string): Promise<unknown> {
    const CONFIG_LOAD_TIMEOUT = 30000;
    const fs = await import('fs');

    // 使用临时文件方式执行，避免 Windows 上 -e 参数的转义问题
    const loaderScript = `
      const configPath = process.argv[2];

      async function loadConfig() {
        try {
          const config = require(configPath);
          const result = config?.default ?? config;
          console.log(JSON.stringify(result));
        } catch (error) {
          console.error('ERROR:', error.message);
          process.exit(1);
        }
      }

      loadConfig();
    `;

    const tmpDir = path.dirname(absolutePath);
    const tmpFile = path.join(tmpDir, `.yuantest-config-loader-${Date.now()}.js`);

    // 检测 tsx 是否可用，仅在可用时添加 --require tsx/cjs
    let tsxAvailable = false;
    try {
      require.resolve('tsx/cjs/api');
      tsxAvailable = true;
    } catch {
      // tsx 不可用，不添加 --require
    }

    const envOptions: Record<string, string> = { ...(process.env as Record<string, string>) };
    if (tsxAvailable) {
      envOptions.NODE_OPTIONS = (envOptions.NODE_OPTIONS || '') + ' --require tsx/cjs';
    }

    return new Promise((resolve, reject) => {
      try {
        fs.writeFileSync(tmpFile, loaderScript, 'utf-8');
      } catch (writeError) {
        reject(
          new Error(
            `Failed to write temp loader script: ${writeError instanceof Error ? writeError.message : String(writeError)}`
          )
        );
        return;
      }

      const cleanupTempFile = () => {
        try {
          if (fs.existsSync(tmpFile)) {
            fs.unlinkSync(tmpFile);
          }
        } catch {
          // Ignore cleanup errors
        }
      };

      const child = spawn('node', [tmpFile, absolutePath], {
        cwd: path.dirname(absolutePath),
        env: envOptions,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const finalize = (error: Error | null, result?: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        cleanupTempFile();

        if (error) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/F', '/T', '/PID', (child.pid as number).toString()], {
                stdio: 'ignore',
              });
            } else {
              child.kill('SIGTERM');
            }
          } catch {
            // Ignore kill errors
          }
          reject(error);
        } else {
          resolve(result);
        }
      };

      timeoutId = setTimeout(() => {
        finalize(new Error(`Config load timeout after ${CONFIG_LOAD_TIMEOUT}ms`));
      }, CONFIG_LOAD_TIMEOUT);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code !== 0) {
          finalize(new Error(`Subprocess exited with code ${code}: ${stderr}`));
          return;
        }

        try {
          const config = JSON.parse(stdout.trim());
          finalize(null, config);
        } catch (parseError) {
          finalize(
            new Error(
              `Failed to parse config: ${parseError instanceof Error ? parseError.message : String(parseError)}`
            )
          );
        }
      });

      child.on('error', (error) => {
        finalize(new Error(`Failed to spawn subprocess: ${error.message}`));
      });
    });
  }

  private loadConfigWithJiti(absolutePath: string): unknown {
    const isTypeScript = absolutePath.endsWith('.ts') || absolutePath.endsWith('.mts');

    if (isTypeScript) {
      try {
        return this.loadConfigWithTsx(absolutePath);
      } catch (tsxError) {
        const tsxMsg = tsxError instanceof Error ? tsxError.message : String(tsxError);
        this.log.debug?.(`tsx load failed for ${absolutePath}, trying jiti: ${tsxMsg}`);
      }
    }

    let createJiti: (id: string, opts?: Record<string, unknown>) => (filePath: string) => unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      createJiti = require('jiti');
    } catch {
      throw new Error(
        `${t('configParseFailed', this.lang)}: jiti module not available. Please install jiti (npm install jiti) to load TypeScript config files.`
      );
    }

    const jitiId = this.resolveJitiId();

    try {
      const jiti = createJiti(jitiId, { interopDefault: true, esmResolve: true });
      delete require.cache[require.resolve(absolutePath)];
      return jiti(absolutePath);
    } catch (jitiError) {
      const jitiMsg = jitiError instanceof Error ? jitiError.message : String(jitiError);
      this.log.warn?.(
        `jiti load failed for ${absolutePath}, trying with require fallback: ${jitiMsg}`
      );

      try {
        delete require.cache[require.resolve(absolutePath)];
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const config = require(absolutePath);
        return config?.default ?? config;
      } catch (requireError) {
        const jitiMsg = jitiError instanceof Error ? jitiError.message : String(jitiError);
        const reqMsg = requireError instanceof Error ? requireError.message : String(requireError);
        throw new Error(
          `${t('configParseFailed', this.lang)}: ${jitiMsg}` +
            (isTypeScript
              ? ` | ${t('configLoadFailed', this.lang)}: TypeScript config requires jiti or tsx. Original error: ${reqMsg}`
              : ` | Fallback require also failed: ${reqMsg}`),
          { cause: requireError }
        );
      }
    }
  }

  private loadConfigWithTsx(absolutePath: string): unknown {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tsx = require('tsx/cjs/api');
      delete require.cache[require.resolve(absolutePath)];

      const callerPath = this.resolveJitiId();
      const config = tsx.require(absolutePath, callerPath);
      return config?.default ?? config;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.log.debug?.(`tsx load failed for ${absolutePath}: ${errMsg}`);
      throw new Error(`tsx load failed: ${errMsg}`, { cause: error });
    }
  }

  private resolveJitiId(): string {
    if (typeof __filename !== 'undefined' && __filename) {
      return __filename;
    }

    try {
      return __filename;
    } catch {
      return process.cwd();
    }
  }

  resolveTestDir(testDir: string, configPath: string): string {
    if (path.isAbsolute(testDir)) {
      return testDir;
    }

    const configDir = path.dirname(configPath);
    return path.resolve(configDir, testDir);
  }

  async mergeConfig(
    projectDir: string,
    frameworkOutputDir: string
  ): Promise<MergedPlaywrightConfig> {
    const absoluteProjectDir = path.resolve(projectDir);
    const warnings: string[] = [];

    const configPath = await this.findPlaywrightConfig(absoluteProjectDir);

    if (!configPath) {
      warnings.push(t('configNotFoundDefault', this.lang));

      return {
        configPath: null,
        configExists: false,
        testDir: './',
        testDirAbsolute: path.join(absoluteProjectDir, 'tests'),
        testIgnore: FRAMEWORK_DEFAULTS.testIgnore,
        testMatch: FRAMEWORK_DEFAULTS.testMatch,
        timeout: FRAMEWORK_DEFAULTS.timeout,
        expectTimeout: FRAMEWORK_DEFAULTS.expectTimeout,
        retries: FRAMEWORK_DEFAULTS.retries,
        workers: FRAMEWORK_DEFAULTS.workers,
        projects: FRAMEWORK_DEFAULTS.projects,
        reporter: this.buildFrameworkReporters(frameworkOutputDir),
        use: {},
        outputDir: frameworkOutputDir,
        snapshotDir: FRAMEWORK_DEFAULTS.snapshotDir,
        warnings,
      };
    }

    let externalConfig: PlaywrightConfigFile;
    try {
      externalConfig = await this.loadPlaywrightConfig(configPath);
    } catch (error) {
      warnings.push(
        `${t('configLoadFailed', this.lang)}: ${error instanceof Error ? error.message : String(error)}`
      );

      return {
        configPath,
        configExists: true,
        testDir: './',
        testDirAbsolute: path.join(absoluteProjectDir, 'tests'),
        testIgnore: FRAMEWORK_DEFAULTS.testIgnore,
        testMatch: FRAMEWORK_DEFAULTS.testMatch,
        timeout: FRAMEWORK_DEFAULTS.timeout,
        expectTimeout: FRAMEWORK_DEFAULTS.expectTimeout,
        retries: FRAMEWORK_DEFAULTS.retries,
        workers: FRAMEWORK_DEFAULTS.workers,
        projects: FRAMEWORK_DEFAULTS.projects,
        reporter: this.buildFrameworkReporters(frameworkOutputDir),
        use: {},
        outputDir: frameworkOutputDir,
        snapshotDir: FRAMEWORK_DEFAULTS.snapshotDir,
        warnings,
      };
    }

    const testDir = externalConfig.testDir || './';
    const testDirAbsolute = this.resolveTestDir(testDir, configPath);

    if (!externalConfig.reporter || externalConfig.reporter.length === 0) {
      warnings.push(t('reporterNotSet', this.lang));
    }

    const mergedReporter = this.mergeReporters(externalConfig.reporter, frameworkOutputDir);

    const use = externalConfig.use || {};
    const baseURL = use.baseURL as string | undefined;

    const projects =
      externalConfig.projects && externalConfig.projects.length > 0
        ? externalConfig.projects
        : FRAMEWORK_DEFAULTS.projects;

    return {
      configPath,
      configExists: true,
      testDir,
      testDirAbsolute,
      testIgnore: externalConfig.testIgnore || FRAMEWORK_DEFAULTS.testIgnore,
      testMatch: externalConfig.testMatch || FRAMEWORK_DEFAULTS.testMatch,
      timeout: externalConfig.timeout ?? FRAMEWORK_DEFAULTS.timeout,
      expectTimeout: externalConfig.expect?.timeout ?? FRAMEWORK_DEFAULTS.expectTimeout,
      retries: externalConfig.retries ?? FRAMEWORK_DEFAULTS.retries,
      workers: externalConfig.workers ?? FRAMEWORK_DEFAULTS.workers,
      projects,
      reporter: mergedReporter,
      use,
      outputDir: frameworkOutputDir,
      snapshotDir: externalConfig.snapshotDir || FRAMEWORK_DEFAULTS.snapshotDir,
      baseURL,
      webServer: externalConfig.webServer,
      tag: externalConfig.tag || process.env.YUANTEST_ENVIRONMENT_TAG,
      warnings,
    };
  }

  private mergeReporters(
    externalReporters: Array<string | [string, Record<string, unknown>]> | undefined,
    frameworkOutputDir: string
  ): Array<string | [string, Record<string, unknown>]> {
    const merged: Array<string | [string, Record<string, unknown>]> = [];

    if (externalReporters && externalReporters.length > 0) {
      for (const reporter of externalReporters) {
        if (typeof reporter === 'string') {
          if (reporter === 'html' || reporter === 'json') {
            continue;
          }
          merged.push(reporter);
        } else if (Array.isArray(reporter)) {
          const [name, options] = reporter;
          if (name === 'html' || name === 'json') {
            continue;
          }
          merged.push([name, options]);
        }
      }
    }

    merged.push([
      'html',
      {
        open: 'never',
        outputFolder: path.join(frameworkOutputDir, 'html-reports'),
      },
    ]);

    merged.push([
      'json',
      {
        outputFile: path.join(frameworkOutputDir, 'results.json'),
      },
    ]);

    merged.push('list');

    return merged;
  }

  private buildFrameworkReporters(
    frameworkOutputDir: string
  ): Array<string | [string, Record<string, unknown>]> {
    return [
      [
        'html',
        {
          open: 'never',
          outputFolder: path.join(frameworkOutputDir, 'html-reports'),
        },
      ],
      [
        'json',
        {
          outputFile: path.join(frameworkOutputDir, 'results.json'),
        },
      ],
      'list',
    ];
  }

  buildCLIConfig(mergedConfig: MergedPlaywrightConfig): {
    configPath: string | null;
    testDir: string;
    reporters: Array<string | [string, Record<string, unknown>]>;
  } {
    return {
      configPath: mergedConfig.configPath,
      testDir: mergedConfig.testDirAbsolute,
      reporters: mergedConfig.reporter,
    };
  }
}

export const configMerger = new PlaywrightConfigMerger();
