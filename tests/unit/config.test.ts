import { mergeConfig, loadConfigFile, getDashboardConfig } from '../../src/config/loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return defaults when no config file exists', () => {
    const config = mergeConfig(null, {});
    expect(config.version).toBe('1.0.0');
    expect(config.testDir).toBe('./');
    expect(config.outputDir).toBe('./test-output');
    expect(config.retries).toBe(0);
    expect(config.timeout).toBe(30000);
    expect(config.workers).toBe(1);
    expect(config.shards).toBe(1);
    expect(config.browsers).toEqual(['chromium']);
  });

  it('should merge file config with defaults', () => {
    const fileConfig = {
      version: '1.0.0',
      testDir: './e2e',
      retries: 2,
      timeout: 60000,
    };

    const config = mergeConfig(fileConfig, {});
    expect(config.version).toBe('1.0.0');
    expect(config.testDir).toBe('./e2e');
    expect(config.retries).toBe(2);
    expect(config.timeout).toBe(60000);
    expect(config.workers).toBe(1);
  });

  it('should let CLI overrides take precedence', () => {
    const fileConfig = {
      version: 'file-project',
      testDir: './file-tests',
      retries: 5,
    };

    const config = mergeConfig(fileConfig, {
      version: 'cli-project',
      retries: 1,
      workers: 4,
    });

    expect(config.version).toBe('cli-project');
    expect(config.testDir).toBe('./file-tests');
    expect(config.retries).toBe(1);
    expect(config.workers).toBe(4);
  });

  it('should load JSON config file', async () => {
    const configContent = JSON.stringify({
      version: 'json-project',
      testDir: './json-tests',
      retries: 3,
    });
    fs.writeFileSync(path.join(tmpDir, 'yuantest.config.json'), configContent, 'utf8');

    const originalCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const loaded = await loadConfigFile(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('json-project');
      expect(loaded!.testDir).toBe('./json-tests');
      expect(loaded!.retries).toBe(3);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should get dashboard config with defaults', () => {
    const config = mergeConfig(null, {});
    expect(config).toBeDefined();
  });

  it('should handle visual testing config', () => {
    const fileConfig = {
      visualTesting: {
        enabled: true,
        threshold: 0.1,
        maxDiffPixels: 5,
        updateSnapshots: true,
      },
    };

    const config = mergeConfig(fileConfig, {});
    expect(config.visualTesting).toBeDefined();
    expect(config.visualTesting!.enabled).toBe(true);
    expect(config.visualTesting!.threshold).toBe(0.1);
    expect(config.visualTesting!.maxDiffPixels).toBe(5);
    expect(config.visualTesting!.updateSnapshots).toBe(true);
  });

  describe('loadConfigFile', () => {
    it('should return null when no config file found', async () => {
      const loaded = await loadConfigFile(tmpDir);
      expect(loaded).toBeNull();
    });

    it('should load .yuantrc file', async () => {
      const configContent = JSON.stringify({
        version: 'yuantrc-project',
        testDir: './yuantrc-tests',
      });
      fs.writeFileSync(path.join(tmpDir, '.yuantrc'), configContent, 'utf8');

      const loaded = await loadConfigFile(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('yuantrc-project');
    });

    it('should load .yuantrc.json file', async () => {
      const configContent = JSON.stringify({
        version: 'yuantrc-json-project',
        testDir: './yuantrc-json-tests',
      });
      fs.writeFileSync(path.join(tmpDir, '.yuantrc.json'), configContent, 'utf8');

      const loaded = await loadConfigFile(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('yuantrc-json-project');
    });

    it('should handle invalid JSON config gracefully', async () => {
      fs.writeFileSync(path.join(tmpDir, 'yuantest.config.json'), 'invalid json', 'utf8');

      const loaded = await loadConfigFile(tmpDir);
      expect(loaded).toBeNull();
    });

    it('should search parent directories for config', async () => {
      const subDir = path.join(tmpDir, 'sub', 'dir');
      fs.mkdirSync(subDir, { recursive: true });

      const configContent = JSON.stringify({
        version: 'parent-config',
        testDir: './parent-tests',
      });
      fs.writeFileSync(path.join(tmpDir, 'yuantest.config.json'), configContent, 'utf8');

      const loaded = await loadConfigFile(subDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe('parent-config');
    });
  });

  describe('mergeConfig', () => {
    it('should handle browsers config', () => {
      const fileConfig = {
        browsers: ['chromium', 'firefox', 'webkit'] as ('chromium' | 'firefox' | 'webkit')[],
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.browsers).toEqual(['chromium', 'firefox', 'webkit']);
    });

    it('should handle reporters config', () => {
      const fileConfig = {
        reporters: ['html', 'json'],
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.reporters).toEqual(['html', 'json']);
    });

    it('should handle headers config', () => {
      const fileConfig = {
        headers: {
          'Authorization': 'Bearer token',
          'X-Custom': 'value',
        },
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.headers).toEqual({
        'Authorization': 'Bearer token',
        'X-Custom': 'value',
      });
    });

    it('should handle flakyThreshold config', () => {
      const fileConfig = {
        flakyThreshold: 0.3,
        isolateFlaky: true,
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.flakyThreshold).toBe(0.3);
      expect(config.isolateFlaky).toBe(true);
    });

    it('should handle traces config', () => {
      const fileConfig = {
        traces: {
          enabled: true,
          mode: 'on-first-retry' as const,
        },
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.traces).toBeDefined();
      expect(config.traces!.enabled).toBe(true);
      expect(config.traces!.mode).toBe('on-first-retry');
    });

    it('should handle artifacts config', () => {
      const fileConfig = {
        artifacts: {
          enabled: true,
          screenshots: 'on' as const,
          videos: 'on' as const,
        },
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.artifacts).toBeDefined();
      expect(config.artifacts!.enabled).toBe(true);
      expect(config.artifacts!.screenshots).toBe('on');
      expect(config.artifacts!.videos).toBe('on');
    });

    it('should handle annotations config', () => {
      const fileConfig = {
        annotations: {
          enabled: true,
          respectSkip: true,
          respectOnly: true,
          respectFail: false,
          respectSlow: true,
          respectFixme: false,
        },
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.annotations).toBeDefined();
      expect(config.annotations!.enabled).toBe(true);
      expect(config.annotations!.respectSkip).toBe(true);
      expect(config.annotations!.respectFail).toBe(false);
    });

    it('should handle tags config', () => {
      const fileConfig = {
        tags: {
          enabled: true,
          include: ['smoke', 'critical'],
          exclude: ['skip'],
        },
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.tags).toBeDefined();
      expect(config.tags!.enabled).toBe(true);
      expect(config.tags!.include).toEqual(['smoke', 'critical']);
      expect(config.tags!.exclude).toEqual(['skip']);
    });

    it('should handle htmlReport config', () => {
      const fileConfig = {
        htmlReport: false,
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.htmlReport).toBe(false);
    });

    it('should handle baseURL config', () => {
      const fileConfig = {
        baseURL: 'https://example.com',
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.baseURL).toBe('https://example.com');
    });

    it('should handle zero values correctly', () => {
      const fileConfig = {
        retries: 0,
        timeout: 0,
        workers: 0,
        shards: 0,
      };

      const config = mergeConfig(fileConfig, {});
      expect(config.retries).toBe(0);
      expect(config.timeout).toBe(0);
      expect(config.workers).toBe(0);
      expect(config.shards).toBe(0);
    });
  });

  describe('getDashboardConfig', () => {
    it('should return default dashboard config', () => {
      const dashboardConfig = getDashboardConfig(null);
      expect(dashboardConfig.port).toBe(3000);
      expect(dashboardConfig.outputDir).toBe('./test-reports');
      expect(dashboardConfig.dataDir).toBe('./test-data');
    });

    it('should return custom dashboard config', () => {
      const fileConfig = {
        dashboard: {
          port: 8080,
          outputDir: './custom-reports',
          dataDir: './custom-data',
        },
      };

      const dashboardConfig = getDashboardConfig(fileConfig);
      expect(dashboardConfig.port).toBe(8080);
      expect(dashboardConfig.outputDir).toBe('./custom-reports');
      expect(dashboardConfig.dataDir).toBe('./custom-data');
    });

    it('should use defaults for partial dashboard config', () => {
      const fileConfig = {
        dashboard: {
          port: 9000,
        },
      };

      const dashboardConfig = getDashboardConfig(fileConfig);
      expect(dashboardConfig.port).toBe(9000);
      expect(dashboardConfig.outputDir).toBe('./test-reports');
      expect(dashboardConfig.dataDir).toBe('./test-data');
    });
  });
});
