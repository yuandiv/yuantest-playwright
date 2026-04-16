import { Orchestrator } from '../../src/orchestrator';
import { Executor } from '../../src/executor';
import { Reporter } from '../../src/reporter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Orchestrator-Executor Integration', () => {
  let tmpDir: string;
  let testDir: string;
  let outputDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-executor-test-'));
    testDir = path.join(tmpDir, 'tests');
    outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Orchestrator', () => {
    it('should initialize with valid config', async () => {
      const orchestrator = new Orchestrator({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      await orchestrator.initialize();
      const config = orchestrator.getConfig();

      expect(config.version).toBe('test-project');
      expect(config.testDir).toBe(testDir);
      expect(config.outputDir).toBe(outputDir);
    });

    it('should throw error when project name is missing', async () => {
      const orchestrator = new Orchestrator({
        testDir: testDir,
        outputDir: outputDir,
      } as any);

      await expect(orchestrator.initialize()).rejects.toThrow('Version is required');
    });

    it('should throw error when test directory is missing', async () => {
      const orchestrator = new Orchestrator({
        version: 'test-project',
        outputDir: outputDir,
      } as any);

      await expect(orchestrator.initialize()).rejects.toThrow('Test directory is required');
    });

    it('should discover test files', async () => {
      fs.writeFileSync(path.join(testDir, 'example.spec.ts'), `
        import { test, expect } from '@playwright/test';
        test('example test', async () => {
          expect(1).toBe(1);
        });
      `);

      const orchestrator = new Orchestrator({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      await orchestrator.initialize();
      const result = await orchestrator.orchestrate();

      expect(result.testAssignment.length).toBeGreaterThan(0);
      expect(result.totalShards).toBe(1);
    });

    it('should distribute tests across shards', async () => {
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(testDir, `test${i}.spec.ts`), `
          import { test, expect } from '@playwright/test';
          test('test ${i}', async () => {
            expect(${i}).toBe(${i});
          });
        `);
      }

      const orchestrator = new Orchestrator({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
        shards: 3,
      });

      await orchestrator.initialize();
      const result = await orchestrator.orchestrate();

      expect(result.totalShards).toBe(3);
      expect(result.testAssignment.length).toBe(5);

      const shardCounts = [0, 0, 0];
      result.testAssignment.forEach(a => {
        shardCounts[a.shardId]++;
      });

      expect(shardCounts.reduce((a, b) => a + b, 0)).toBe(5);
    });

    it('should validate config correctly', async () => {
      const validOrchestrator = new Orchestrator({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      await validOrchestrator.initialize();
      const isValid = await validOrchestrator.validateConfig();
      expect(isValid).toBe(true);
    });

    it('should create Playwright config', async () => {
      const orchestrator = new Orchestrator({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
        timeout: 60000,
        retries: 2,
        workers: 4,
        browsers: ['chromium', 'firefox'],
      });

      await orchestrator.initialize();
      const pwConfig = await orchestrator.createPlaywrightConfig();

      expect(pwConfig.testDir).toBe(testDir);
      expect(pwConfig.timeout).toBe(60000);
      expect(pwConfig.retries).toBe(2);
      expect(pwConfig.workers).toBe(4);
      expect(pwConfig.projects).toHaveLength(2);
    });
  });

  describe('Executor', () => {
    it('should initialize with config', () => {
      const executor = new Executor({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      const config = executor.getConfig();
      expect(config.version).toBe('test-project');
      expect(config.testDir).toBe(testDir);
    });

    it('should not be running initially', () => {
      const executor = new Executor({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      expect(executor.isCurrentlyRunning()).toBe(false);
    });

    it('should return null status when no run has occurred', async () => {
      const executor = new Executor({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      const status = await executor.getCurrentStatus();
      expect(status).toBeNull();
    });

    it('should throw error when already running', async () => {
      const executor = new Executor({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      jest.spyOn(executor as any, 'runPlaywrightTests').mockImplementation(async () => {});
      const runPromise = executor.execute();
      await expect(executor.execute()).rejects.toThrow('Executor is already running');
      await runPromise.catch(() => {});
    });
  });

  describe('Orchestrator-Executor Workflow', () => {
    it('should orchestrate and prepare for execution', async () => {
      fs.writeFileSync(path.join(testDir, 'simple.spec.ts'), `
        import { test, expect } from '@playwright/test';
        test('simple test', async () => {
          expect(true).toBe(true);
        });
      `);

      const orchestrator = new Orchestrator({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
        shards: 1,
      });

      await orchestrator.initialize();
      const orchestrationResult = await orchestrator.orchestrate();

      expect(orchestrationResult.testAssignment.length).toBeGreaterThan(0);

      const executor = new Executor({
        version: 'test-project',
        testDir: testDir,
        outputDir: outputDir,
      });

      expect(executor.isCurrentlyRunning()).toBe(false);
    });
  });
});
