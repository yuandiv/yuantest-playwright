import { TestConfig, BrowserType, TraceConfig, ArtifactConfig } from '../types';
import * as path from 'path';
import { logger } from '../logger';
import { StorageProvider, getStorage } from '../storage';

const CONFIG_FILE_NAMES = [
  'yuantest.config.ts',
  'yuantest.config.js',
  'yuantest.config.json',
  '.yuantrc',
  '.yuantrc.json',
  '.yuantrc.js',
];

export interface YuanTestConfigFile {
  version?: string;
  testDir?: string;
  outputDir?: string;
  baseURL?: string;
  retries?: number;
  timeout?: number;
  workers?: number;
  shards?: number;
  browsers?: BrowserType[];
  reporters?: string[];
  headers?: Record<string, string>;
  flakyThreshold?: number;
  isolateFlaky?: boolean;
  traces?: {
    enabled?: boolean;
    mode?: TraceConfig['mode'];
  };
  artifacts?: {
    enabled?: boolean;
    screenshots?: ArtifactConfig['screenshots'];
    videos?: ArtifactConfig['videos'];
  };
  visualTesting?: {
    enabled?: boolean;
    threshold?: number;
    maxDiffPixels?: number;
    updateSnapshots?: boolean;
  };
  annotations?: {
    enabled?: boolean;
    respectSkip?: boolean;
    respectOnly?: boolean;
    respectFail?: boolean;
    respectSlow?: boolean;
    respectFixme?: boolean;
  };
  tags?: {
    enabled?: boolean;
    include?: string[];
    exclude?: string[];
  };
  htmlReport?: boolean;
  dashboard?: {
    port?: number;
    outputDir?: string;
    dataDir?: string;
  };
}

async function findConfigFile(startDir: string, storage: StorageProvider): Promise<string | null> {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (dir !== root) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.join(dir, name);
      if (await storage.exists(candidate)) {
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

async function loadJsonConfig(
  filePath: string,
  storage: StorageProvider
): Promise<YuanTestConfigFile> {
  const content = await storage.readText(filePath);
  if (!content) {
    throw new Error(`Config file not found: ${filePath}`);
  }
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in config file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function loadJsConfig(filePath: string): YuanTestConfigFile {
  const isTypeScript = filePath.endsWith('.ts') || filePath.endsWith('.mts');

  if (isTypeScript) {
    try {
      const tsx = require('tsx/cjs/api');
      const callerPath = resolveCallerPath();
      delete require.cache[require.resolve(filePath)];
      const config = tsx.require(filePath, callerPath);
      const result = config?.default ?? config;
      return typeof result === 'function'
        ? (result as () => YuanTestConfigFile)()
        : (result as YuanTestConfigFile);
    } catch (tsxError) {
      console.warn(
        `tsx load failed, trying jiti: ${tsxError instanceof Error ? tsxError.message : String(tsxError)}`
      );
    }
  }

  let jiti: (filePath: string) => unknown;
  try {
    const callerPath = resolveCallerPath();
    jiti = require('jiti')(callerPath, { interopDefault: true, esmResolve: true });
  } catch {
    jiti = require(filePath);
  }

  const resolvedPath = require.resolve(filePath);
  delete require.cache[resolvedPath];
  const config = jiti(filePath);
  return typeof config === 'function'
    ? (config as () => YuanTestConfigFile)()
    : (config as YuanTestConfigFile);
}

function resolveCallerPath(): string {
  if (typeof __filename !== 'undefined') {
    return __filename;
  }
  return process.cwd();
}

export async function loadConfigFile(
  startDir?: string,
  storage?: StorageProvider
): Promise<YuanTestConfigFile | null> {
  const store = storage || getStorage();
  const dir = startDir || process.cwd();
  const configPath = await findConfigFile(dir, store);
  if (!configPath) {
    return null;
  }

  const log = logger.child('ConfigLoader');
  log.info(`Loading config from: ${configPath}`);

  try {
    if (configPath.endsWith('.json') || configPath.endsWith('.yuantrc')) {
      return await loadJsonConfig(configPath, store);
    }
    return loadJsConfig(configPath);
  } catch (error: unknown) {
    log.warn(
      `Failed to load config file ${configPath}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

export function mergeConfig(
  fileConfig: YuanTestConfigFile | null,
  cliConfig: Partial<TestConfig>
): TestConfig {
  const base: TestConfig = {
    version: '1.0.0',
    testDir: './',
    outputDir: './test-output',
    retries: 0,
    timeout: 30000,
    workers: 1,
    shards: 1,
    browsers: ['chromium'],
    htmlReport: true,
  };

  if (fileConfig) {
    if (fileConfig.version) {
      base.version = fileConfig.version;
    }
    if (fileConfig.testDir) {
      base.testDir = fileConfig.testDir;
    }
    if (fileConfig.outputDir) {
      base.outputDir = fileConfig.outputDir;
    }
    if (fileConfig.baseURL) {
      base.baseURL = fileConfig.baseURL;
    }
    if (fileConfig.retries !== undefined) {
      base.retries = fileConfig.retries;
    }
    if (fileConfig.timeout !== undefined) {
      base.timeout = fileConfig.timeout;
    }
    if (fileConfig.workers !== undefined) {
      base.workers = fileConfig.workers;
    }
    if (fileConfig.shards !== undefined) {
      base.shards = fileConfig.shards;
    }
    if (fileConfig.browsers) {
      base.browsers = fileConfig.browsers;
    }
    if (fileConfig.reporters) {
      base.reporters = fileConfig.reporters;
    }
    if (fileConfig.headers) {
      base.headers = fileConfig.headers;
    }
    if (fileConfig.flakyThreshold !== undefined) {
      base.flakyThreshold = fileConfig.flakyThreshold;
    }
    if (fileConfig.isolateFlaky !== undefined) {
      base.isolateFlaky = fileConfig.isolateFlaky;
    }
    if (fileConfig.htmlReport !== undefined) {
      base.htmlReport = fileConfig.htmlReport;
    }

    if (fileConfig.traces) {
      base.traces = {
        enabled: fileConfig.traces.enabled ?? false,
        mode: fileConfig.traces.mode || 'on-first-retry',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      };
    }

    if (fileConfig.artifacts) {
      base.artifacts = {
        enabled: fileConfig.artifacts.enabled ?? false,
        screenshots: fileConfig.artifacts.screenshots || 'only-on-failure',
        videos: fileConfig.artifacts.videos || 'retain-on-failure',
      };
    }

    if (fileConfig.visualTesting) {
      base.visualTesting = {
        enabled: fileConfig.visualTesting.enabled ?? false,
        threshold: fileConfig.visualTesting.threshold ?? 0.2,
        maxDiffPixelRatio: 0.01,
        maxDiffPixels: fileConfig.visualTesting.maxDiffPixels ?? 10,
        updateSnapshots: fileConfig.visualTesting.updateSnapshots ?? false,
      };
    }

    if (fileConfig.annotations) {
      base.annotations = {
        enabled: fileConfig.annotations.enabled ?? false,
        respectSkip: fileConfig.annotations.respectSkip ?? true,
        respectOnly: fileConfig.annotations.respectOnly ?? true,
        respectFail: fileConfig.annotations.respectFail ?? true,
        respectSlow: fileConfig.annotations.respectSlow ?? false,
        respectFixme: fileConfig.annotations.respectFixme ?? true,
        customAnnotations: {},
      };
    }

    if (fileConfig.tags) {
      base.tags = {
        enabled: fileConfig.tags.enabled ?? false,
        include: fileConfig.tags.include,
        exclude: fileConfig.tags.exclude,
      };
    }
  }

  return { ...base, ...cliConfig };
}

export function getDashboardConfig(fileConfig: YuanTestConfigFile | null): {
  port: number;
  outputDir: string;
  dataDir: string;
} {
  if (fileConfig?.dashboard) {
    return {
      port: fileConfig.dashboard.port || 3000,
      outputDir: fileConfig.dashboard.outputDir || './test-reports',
      dataDir: fileConfig.dashboard.dataDir || './test-data',
    };
  }
  return {
    port: 3000,
    outputDir: './test-reports',
    dataDir: './test-data',
  };
}
