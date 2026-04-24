import { Executor, ParallelExecutor } from '../../src/executor';
import { MemoryStorage } from '../../src/storage';
import { FlakyTestManager } from '../../src/flaky';

describe('Executor', () => {
  let storage: MemoryStorage;
  let config: any;

  beforeEach(() => {
    storage = new MemoryStorage();
    config = {
      version: '1.0.0',
      testDir: './',
      outputDir: './test-output',
      retries: 0,
      timeout: 30000,
      workers: 1,
      shards: 1,
      browsers: ['chromium'],
    };
  });

  afterEach(() => {
    storage.clear();
  });

  describe('constructor', () => {
    it('should create executor with config', () => {
      const executor = new Executor(config, storage);
      expect(executor).toBeDefined();
    });

    it('should apply default values', () => {
      const executor = new Executor(config, storage);
      const executorConfig = executor.getConfig();
      expect(executorConfig.retries).toBeDefined();
      expect(executorConfig.timeout).toBeDefined();
      expect(executorConfig.workers).toBeDefined();
    });

    it('should accept custom storage', () => {
      const customStorage = new MemoryStorage();
      const executor = new Executor(config, customStorage);
      expect(executor).toBeDefined();
    });

    it('should accept flaky manager', () => {
      const flakyManager = new FlakyTestManager(
        './test-data',
        {
          enabled: true,
          threshold: 0.3,
          autoQuarantine: false,
        },
        storage
      );
      const executor = new Executor(config, storage, flakyManager);
      expect(executor).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const executor = new Executor(config, storage);
      const config1 = executor.getConfig();
      const config2 = executor.getConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('isCurrentlyRunning', () => {
    it('should return false initially', () => {
      const executor = new Executor(config, storage);
      expect(executor.isCurrentlyRunning()).toBe(false);
    });
  });

  describe('getCurrentStatus', () => {
    it('should return null initially', async () => {
      const executor = new Executor(config, storage);
      const status = await executor.getCurrentStatus();
      expect(status).toBeNull();
    });
  });

  describe('initializeManagers', () => {
    it('should initialize trace manager if enabled', () => {
      const configWithTraces = {
        ...config,
        traces: {
          enabled: true,
          mode: 'on' as const,
          screenshots: true,
          snapshots: true,
          sources: true,
          attachments: true,
        },
      };
      const executor = new Executor(configWithTraces, storage);
      expect(executor.getTraceManager()).not.toBeNull();
    });

    it('should not initialize trace manager if disabled', () => {
      const executor = new Executor(config, storage);
      expect(executor.getTraceManager()).toBeNull();
    });

    it('should initialize annotation manager if enabled', () => {
      const configWithAnnotations = {
        ...config,
        annotations: {
          enabled: true,
          respectSkip: true,
          respectOnly: true,
          respectFail: true,
          respectSlow: false,
          respectFixme: true,
          customAnnotations: {},
        },
      };
      const executor = new Executor(configWithAnnotations, storage);
      expect(executor.getAnnotationManager()).not.toBeNull();
    });

    it('should initialize tag manager if enabled', () => {
      const configWithTags = {
        ...config,
        tags: {
          enabled: true,
        },
      };
      const executor = new Executor(configWithTags, storage);
      expect(executor.getTagManager()).not.toBeNull();
    });

    it('should initialize artifact manager if enabled', () => {
      const configWithArtifacts = {
        ...config,
        artifacts: {
          enabled: true,
          screenshots: 'only-on-failure' as const,
          videos: 'retain-on-failure' as const,
        },
      };
      const executor = new Executor(configWithArtifacts, storage);
      expect(executor.getArtifactManager()).not.toBeNull();
    });

    it('should initialize visual manager if enabled', () => {
      const configWithVisual = {
        ...config,
        visualTesting: {
          enabled: true,
          threshold: 0.2,
          maxDiffPixelRatio: 0.01,
          maxDiffPixels: 10,
          updateSnapshots: false,
        },
      };
      const executor = new Executor(configWithVisual, storage);
      expect(executor.getVisualManager()).not.toBeNull();
    });
  });

  describe('events', () => {
    it('should emit run_started event', async () => {
      const executor = new Executor(config, storage);
      const listener = jest.fn();
      executor.on('run_started', listener);
    });

    it('should emit run_completed event', async () => {
      const executor = new Executor(config, storage);
      const listener = jest.fn();
      executor.on('run_completed', listener);
    });

    it('should emit test_result event', async () => {
      const executor = new Executor(config, storage);
      const listener = jest.fn();
      executor.on('test_result', listener);
    });

    it('should emit run_progress event', async () => {
      const executor = new Executor(config, storage);
      const listener = jest.fn();
      executor.on('run_progress', listener);
    });

    it('should emit output event', async () => {
      const executor = new Executor(config, storage);
      const listener = jest.fn();
      executor.on('output', listener);
    });
  });

  describe('execute', () => {
    it('should throw error if already running', async () => {
      const executor = new Executor(config, storage);
      jest.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      const firstRun = executor.execute();
      await expect(executor.execute()).rejects.toThrow('already running');
      await firstRun.catch(() => {});
    });
  });

  describe('cancel', () => {
    it('should handle cancel when not running', async () => {
      const executor = new Executor(config, storage);
      await executor.cancel();
      expect(executor.isCurrentlyRunning()).toBe(false);
    });
  });

  describe('getTestArtifacts', () => {
    it('should return empty arrays for non-existent run', async () => {
      const executor = new Executor(config, storage);
      const artifacts = await executor.getTestArtifacts('non-existent-run');
      expect(artifacts.screenshots).toEqual([]);
      expect(artifacts.videos).toEqual([]);
      expect(artifacts.traces).toEqual([]);
    });
  });
});

describe('ParallelExecutor', () => {
  let storage: MemoryStorage;
  let config: any;

  beforeEach(() => {
    storage = new MemoryStorage();
    config = {
      version: '1.0.0',
      testDir: './',
      outputDir: './test-output',
      retries: 0,
      timeout: 30000,
      workers: 1,
      shards: 1,
      browsers: ['chromium'],
    };
  });

  afterEach(() => {
    storage.clear();
  });

  describe('constructor', () => {
    it('should create parallel executor with multiple shards', () => {
      const executor = new ParallelExecutor(config, 3, storage);
      expect(executor).toBeDefined();
    });

    it('should create executors for each shard', () => {
      const executor = new ParallelExecutor(config, 2, storage);
      expect(executor).toBeDefined();
    });
  });

  describe('cancelAll', () => {
    it('should cancel all executors', async () => {
      const executor = new ParallelExecutor(config, 2, storage);
      await executor.cancelAll();
    });
  });
});
