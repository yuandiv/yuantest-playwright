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
  outputDir: './test-sandbox/reports',
  snapshotDir: './test-sandbox/snapshots',
};

export class PlaywrightConfigMerger {
  private log = logger.child('PlaywrightConfigMerger');
  private storage: StorageProvider;
  private lang: Lang = 'zh';

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
      const testDir = config.testDir || './tests';
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
      };
    } catch (error) {
      return {
        valid: false,
        configPath,
        configExists: true,
        testDir: null,
        testDirAbsolute: null,
        error: `${t('configParseFailed', this.lang)}: ${error instanceof Error ? error.message : String(error)}`,
        warnings,
      };
    }
  }

  async loadPlaywrightConfig(configPath: string): Promise<PlaywrightConfigFile> {
    const absolutePath = path.resolve(configPath);

    if (!(await this.storage.exists(absolutePath))) {
      throw new Error(`${t('configFileNotFound', this.lang)}: ${absolutePath}`);
    }

    try {
      const config = await this.loadConfigInSubprocess(absolutePath);
      return typeof config === 'function'
        ? (config as () => PlaywrightConfigFile)()
        : (config as PlaywrightConfigFile);
    } catch (subprocessError) {
      this.log.debug?.(
        `Subprocess load failed, trying in-process load: ${subprocessError instanceof Error ? subprocessError.message : String(subprocessError)}`
      );

      const config = await this.loadConfigWithJiti(absolutePath);
      return typeof config === 'function'
        ? (config as () => PlaywrightConfigFile)()
        : (config as PlaywrightConfigFile);
    }
  }

  private async loadConfigInSubprocess(absolutePath: string): Promise<unknown> {
    const CONFIG_LOAD_TIMEOUT = 30000;

    return new Promise((resolve, reject) => {
      const loaderScript = `
        const configPath = process.argv[1];
        
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

      const child = spawn('node', ['-e', loaderScript, absolutePath], {
        cwd: path.dirname(absolutePath),
        env: { ...process.env, NODE_OPTIONS: '--require tsx/cjs' },
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

        if (error) {
          try {
            child.kill('SIGTERM');
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
        this.log.debug?.(
          `tsx load failed, trying jiti: ${tsxError instanceof Error ? tsxError.message : String(tsxError)}`
        );
      }
    }

    let createJiti: (id: string, opts?: Record<string, unknown>) => (filePath: string) => unknown;
    try {
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
      this.log.debug?.(
        `jiti load failed, trying with require fallback: ${jitiError instanceof Error ? jitiError.message : String(jitiError)}`
      );

      try {
        delete require.cache[require.resolve(absolutePath)];
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
      const tsx = require('tsx/cjs/api');
      delete require.cache[require.resolve(absolutePath)];

      const callerPath = this.resolveJitiId();
      const config = tsx.require(absolutePath, callerPath);
      return config?.default ?? config;
    } catch (error) {
      throw new Error(
        `tsx load failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
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
        testDir: './tests',
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
        testDir: './tests',
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

    const testDir = externalConfig.testDir || './tests';
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
