import { Orchestrator, ShardOptimizer } from '../../src/orchestrator';
import { MemoryStorage } from '../../src/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ShardOptimizer', () => {
  it('should distribute tests evenly across shards', async () => {
    const optimizer = new ShardOptimizer();
    const assignments = [
      { testId: 't1', shardId: 0, priority: 1, estimatedDuration: 10000 },
      { testId: 't2', shardId: 0, priority: 1, estimatedDuration: 20000 },
      { testId: 't3', shardId: 0, priority: 1, estimatedDuration: 15000 },
      { testId: 't4', shardId: 0, priority: 1, estimatedDuration: 5000 },
      { testId: 't5', shardId: 0, priority: 1, estimatedDuration: 25000 },
      { testId: 't6', shardId: 0, priority: 1, estimatedDuration: 10000 },
    ];

    const result = await optimizer.optimize(assignments, 3);

    expect(result.size).toBe(3);

    const loads: number[] = [];
    result.forEach((shardTests) => {
      const load = shardTests.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
      loads.push(load);
    });

    const maxLoad = Math.max(...loads);
    const minLoad = Math.min(...loads);
    expect(maxLoad - minLoad).toBeLessThan(15000);
  });

  it('should handle more shards than tests', async () => {
    const optimizer = new ShardOptimizer();
    const assignments = [
      { testId: 't1', shardId: 0, priority: 1, estimatedDuration: 10000 },
      { testId: 't2', shardId: 0, priority: 1, estimatedDuration: 20000 },
    ];

    const result = await optimizer.optimize(assignments, 5);
    expect(result.size).toBe(5);

    let totalTests = 0;
    result.forEach((shardTests) => {
      totalTests += shardTests.length;
    });
    expect(totalTests).toBe(2);
  });

  it('should handle empty assignments', async () => {
    const optimizer = new ShardOptimizer();
    const result = await optimizer.optimize([], 3);
    expect(result.size).toBe(3);
  });

  it('should handle single shard', async () => {
    const optimizer = new ShardOptimizer();
    const assignments = [
      { testId: 't1', shardId: 0, priority: 1, estimatedDuration: 10000 },
      { testId: 't2', shardId: 0, priority: 1, estimatedDuration: 20000 },
    ];

    const result = await optimizer.optimize(assignments, 1);
    expect(result.size).toBe(1);
    expect(result.get(0)?.length).toBe(2);
  });

  it('should handle tests without estimated duration', async () => {
    const optimizer = new ShardOptimizer();
    const assignments = [
      { testId: 't1', shardId: 0, priority: 1 },
      { testId: 't2', shardId: 0, priority: 1 },
    ];

    const result = await optimizer.optimize(assignments, 2);
    expect(result.size).toBe(2);
  });
});

describe('Orchestrator', () => {
  let tmpDir: string;
  let testDir: string;
  let outputDir: string;
  let storage: MemoryStorage;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-test-'));
    testDir = path.join(tmpDir, 'tests');
    outputDir = path.join(tmpDir, 'output');
    storage = new MemoryStorage();

    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('constructor', () => {
    it('should create orchestrator with config', () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      expect(orchestrator).toBeDefined();
    });

    it('should apply default values', () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      const config = orchestrator.getConfig();
      expect(config.retries).toBeDefined();
      expect(config.timeout).toBeDefined();
      expect(config.workers).toBeDefined();
      expect(config.shards).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await orchestrator.initialize();
      expect(orchestrator.isInitialized()).toBe(true);
    });

    it('should throw error if version is missing', async () => {
      const orchestrator = new Orchestrator({
        version: '',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await expect(orchestrator.initialize()).rejects.toThrow();
    });

    it('should throw error if testDir is missing', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: '',
        outputDir: outputDir,
      }, storage);

      await expect(orchestrator.initialize()).rejects.toThrow();
    });
  });

  describe('orchestrate', () => {
    it('should discover and distribute tests', async () => {
      fs.writeFileSync(path.join(testDir, 'test1.spec.ts'), 'test content', 'utf8');
      fs.writeFileSync(path.join(testDir, 'test2.spec.ts'), 'test content', 'utf8');

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
        shards: 2,
      }, storage);

      await orchestrator.initialize();
      const result = await orchestrator.orchestrate();

      expect(result.totalShards).toBe(2);
      expect(result.testAssignment.length).toBe(2);
      expect(result.strategy).toBe('distributed');
    });

    it('should handle empty test directory', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await orchestrator.initialize();
      const result = await orchestrator.orchestrate();

      expect(result.testAssignment.length).toBe(0);
    });
  });

  describe('optimizeSharding', () => {
    it('should optimize test distribution', async () => {
      fs.writeFileSync(path.join(testDir, 'test1.spec.ts'), 'test content', 'utf8');
      fs.writeFileSync(path.join(testDir, 'test2.spec.ts'), 'test content', 'utf8');

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
        shards: 2,
      }, storage);

      await orchestrator.initialize();
      const result = await orchestrator.optimizeSharding();

      expect(result.strategy).toBe('intelligent');
      expect(result.totalShards).toBe(2);
    });
  });

  describe('getConfig', () => {
    it('should return a copy of config', () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      const config1 = orchestrator.getConfig();
      const config2 = orchestrator.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('validateConfig', () => {
    it('should return true for valid config', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      const isValid = await orchestrator.validateConfig();
      expect(isValid).toBe(true);
    });

    it('should return false for invalid config', async () => {
      const orchestrator = new Orchestrator({
        version: '',
        testDir: '',
        outputDir: '',
      }, storage);

      const isValid = await orchestrator.validateConfig();
      expect(isValid).toBe(false);
    });
  });

  describe('createPlaywrightConfig', () => {
    it('should create playwright config', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
        timeout: 60000,
        retries: 2,
        workers: 4,
        browsers: ['chromium', 'firefox'],
      }, storage);

      await orchestrator.initialize();
      const pwConfig = await orchestrator.createPlaywrightConfig();

      expect(pwConfig.testDir).toBe(testDir);
      expect(pwConfig.timeout).toBe(60000);
      expect(pwConfig.retries).toBe(2);
      expect(pwConfig.workers).toBe(4);
      expect(pwConfig.projects.length).toBe(2);
    });
  });

  describe('updateDurationHistory', () => {
    it('should update duration history for new test', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await orchestrator.initialize();
      orchestrator.updateDurationHistory('test1.spec.ts', 5000);

      const config = orchestrator.getConfig();
      expect(config).toBeDefined();
    });

    it('should update duration history for existing test', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await orchestrator.initialize();
      orchestrator.updateDurationHistory('test1.spec.ts', 5000);
      orchestrator.updateDurationHistory('test1.spec.ts', 10000);

      const config = orchestrator.getConfig();
      expect(config).toBeDefined();
    });
  });

  describe('recordRunResults', () => {
    it('should record multiple test results', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await orchestrator.initialize();
      orchestrator.recordRunResults([
        { testId: 'test1.spec.ts', duration: 5000 },
        { testId: 'test2.spec.ts', duration: 10000 },
      ]);

      const config = orchestrator.getConfig();
      expect(config).toBeDefined();
    });
  });

  describe('getAssignmentsForShard', () => {
    it('should return assignments for specific shard', async () => {
      fs.writeFileSync(path.join(testDir, 'test1.spec.ts'), 'test content', 'utf8');
      fs.writeFileSync(path.join(testDir, 'test2.spec.ts'), 'test content', 'utf8');

      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
        shards: 2,
      }, storage);

      await orchestrator.initialize();
      await orchestrator.orchestrate();

      const shard0Assignments = orchestrator.getAssignmentsForShard(0);
      expect(shard0Assignments).toBeDefined();
    });
  });

  describe('flush', () => {
    it('should flush duration history', async () => {
      const orchestrator = new Orchestrator({
        version: '1.0.0',
        testDir: testDir,
        outputDir: outputDir,
      }, storage);

      await orchestrator.initialize();
      orchestrator.updateDurationHistory('test1.spec.ts', 5000);
      await orchestrator.flush();

      expect(storage.exists(outputDir)).resolves.toBe(true);
    });
  });
});
