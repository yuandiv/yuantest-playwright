import * as path from 'path';
import * as fs from 'fs';
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

    let jiti: (filePath: string) => unknown;
    try {
      jiti = require('jiti')(__filename, { interopDefault: true, esmResolve: true });
    } catch {
      jiti = require(absolutePath);
    }

    delete require.cache[require.resolve(absolutePath)];
    const config = jiti(absolutePath);

    return typeof config === 'function'
      ? (config as () => PlaywrightConfigFile)()
      : (config as PlaywrightConfigFile);
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
