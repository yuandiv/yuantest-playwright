import { TestConfig, OrchestrationConfig, TestAssignment, BrowserType, ErrorCode } from '../types';
import { PlaywrightRunnerError } from '../types';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, getStorage } from '../storage';
import { walkDirAsync } from '../utils/filesystem';
import { ManagedManager } from '../base';
import { DEFAULTS, FILE_PATTERNS, CACHE_CONFIG } from '../constants';

interface TestDurationHistory {
  testFile: string;
  avgDuration: number;
  runCount: number;
}

export class Orchestrator extends ManagedManager {
  private config: TestConfig;
  private assignments: Map<string, TestAssignment[]> = new Map();
  private durationHistory: Map<string, TestDurationHistory> = new Map();
  private storage: StorageProvider;

  constructor(config: TestConfig, storage?: StorageProvider) {
    super();
    this.config = {
      retries: DEFAULTS.TEST_RETRIES,
      timeout: DEFAULTS.TEST_TIMEOUT,
      workers: DEFAULTS.WORKERS,
      shards: DEFAULTS.SHARDS,
      browsers: [...DEFAULTS.BROWSERS],
      ...config,
    };
    this.storage = storage || getStorage();
    this.setSaveDelay(CACHE_CONFIG.SAVE_DELAY_MS);
  }

  protected async doInitialize(): Promise<void> {
    await this.loadDurationHistory();
  }

  private async loadDurationHistory(): Promise<void> {
    const historyFile = path.join(
      this.config.outputDir || DEFAULTS.DATA_DIR,
      'duration-history.json'
    );
    try {
      const data = await this.storage.readJSON<any>(historyFile);
      if (data && data.history) {
        for (const entry of data.history) {
          this.durationHistory.set(entry.testFile, entry);
        }
        this.log.debug(`Loaded duration history for ${this.durationHistory.size} tests`);
      }
    } catch (error: unknown) {
      this.log.warn(
        `Failed to load duration history: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async initialize(): Promise<void> {
    await super.initialize();
    if (!this.config.version) {
      throw new PlaywrightRunnerError('Version is required', ErrorCode.INVALID_CONFIG);
    }
    if (!this.config.testDir) {
      throw new PlaywrightRunnerError('Test directory is required', ErrorCode.INVALID_CONFIG);
    }
    this.log.info(`Orchestrator initialized for version: ${this.config.version}`);
  }

  async orchestrate(): Promise<OrchestrationConfig> {
    const testFiles = await this.discoverTests();
    const assignments = this.distributeTests(testFiles);

    return {
      totalShards: this.config.shards || 1,
      shardIndex: 0,
      testAssignment: assignments,
      strategy: 'distributed',
    };
  }

  async optimizeSharding(): Promise<OrchestrationConfig> {
    const testFiles = await this.discoverTests();
    const optimizer = new ShardOptimizer(this.durationHistory);
    const optimizedAssignments = await optimizer.optimize(
      testFiles.map((file) => ({
        testId: file,
        shardId: 0,
        priority: 1,
        estimatedDuration: this.estimateTestDuration(file),
      })),
      this.config.shards || 1
    );

    const allAssignments: TestAssignment[] = [];
    optimizedAssignments.forEach((shardAssignments: TestAssignment[], shardId: number) => {
      allAssignments.push(...shardAssignments);
    });

    this.log.info(
      `Optimized sharding: ${testFiles.length} tests across ${this.config.shards || 1} shards (intelligent strategy)`
    );
    return {
      totalShards: this.config.shards || 1,
      shardIndex: 0,
      testAssignment: allAssignments,
      strategy: 'intelligent',
    };
  }

  private readonly DEFAULT_TEST_EXTENSIONS = [...FILE_PATTERNS.TEST_EXTENSIONS];
  private readonly DEFAULT_IGNORE_DIRS = [...FILE_PATTERNS.IGNORE_DIRS];

  private async discoverTests(): Promise<string[]> {
    await this.ready();
    const testMatch = this.config.testMatch?.length
      ? this.config.testMatch
      : this.DEFAULT_TEST_EXTENSIONS.map((ext) => `*${ext}`);

    const testIgnore = this.config.testIgnore || [];
    const ignoreDirs = this.config.ignoreDirs?.length
      ? this.config.ignoreDirs
      : this.DEFAULT_IGNORE_DIRS;

    const testDir = this.config.testDir;

    const tests = await walkDirAsync(testDir, {
      extensions: this.DEFAULT_TEST_EXTENSIONS,
      ignoreDirs: ignoreDirs,
      ignorePatterns: testIgnore,
      matchPatterns: testMatch,
      relativeTo: testDir,
    });

    this.log.info(
      `Discovered ${tests.length} test files in ${testDir} (match: ${testMatch.join(', ')}, ignoreDirs: ${ignoreDirs.join(', ')})`
    );
    return tests;
  }

  private distributeTests(testFiles: string[]): TestAssignment[] {
    const shards = this.config.shards || 1;
    const assignments: TestAssignment[] = [];

    testFiles.forEach((file, index) => {
      const shardId = index % shards;
      assignments.push({
        testId: file,
        shardId,
        priority: 1,
        estimatedDuration: this.estimateTestDuration(file),
      });
    });

    return assignments;
  }

  private estimateTestDuration(file: string): number {
    const history = this.durationHistory.get(file);
    if (history && history.runCount >= 2) {
      return history.avgDuration;
    }
    return DEFAULTS.TEST_TIMEOUT;
  }

  updateDurationHistory(testFile: string, duration: number): void {
    const existing = this.durationHistory.get(testFile);
    if (existing) {
      const totalDuration = existing.avgDuration * existing.runCount + duration;
      existing.runCount += 1;
      existing.avgDuration = totalDuration / existing.runCount;
    } else {
      this.durationHistory.set(testFile, {
        testFile,
        avgDuration: duration,
        runCount: 1,
      });
    }
    this.scheduleSave(() => this.saveDurationHistory());
  }

  recordRunResults(results: Array<{ testId: string; duration: number }>): void {
    for (const result of results) {
      this.updateDurationHistory(result.testId, result.duration);
    }
  }

  private async saveDurationHistory(): Promise<void> {
    const dataDir = this.config.outputDir || DEFAULTS.DATA_DIR;
    await this.storage.mkdir(dataDir);
    const historyFile = path.join(dataDir, 'duration-history.json');
    try {
      const data = {
        history: Array.from(this.durationHistory.values()),
        lastUpdated: new Date().toISOString(),
      };
      await this.storage.writeJSON(historyFile, data);
      this.dirty = false;
    } catch (error: unknown) {
      this.log.warn(
        `Failed to save duration history: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async flush(): Promise<void> {
    await super.flush(() => this.saveDurationHistory());
  }

  getAssignmentsForShard(shardId: number): TestAssignment[] {
    return Array.from(this.assignments.values())
      .flat()
      .filter((a) => a.shardId === shardId);
  }

  async validateConfig(): Promise<boolean> {
    return !!this.config.version && !!this.config.testDir && !!this.config.outputDir;
  }

  getConfig(): TestConfig {
    return { ...this.config };
  }

  async createPlaywrightConfig(): Promise<any> {
    return {
      testDir: this.config.testDir,
      timeout: this.config.timeout,
      retries: this.config.retries,
      workers: this.config.workers,
      use: {
        baseURL: this.config.baseURL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
      },
      projects: this.config.browsers?.map((browser) => ({
        name: browser,
        use: { browserName: browser },
      })),
      reporter: this.config.reporters || [['list']],
    };
  }
}

export class ShardOptimizer {
  private durationHistory: Map<string, TestDurationHistory>;

  constructor(durationHistory?: Map<string, TestDurationHistory>) {
    this.durationHistory = durationHistory || new Map();
  }

  optimize(
    assignments: TestAssignment[],
    totalShards: number
  ): Promise<Map<number, TestAssignment[]>> {
    const optimized = new Map<number, TestAssignment[]>();

    for (let i = 0; i < totalShards; i++) {
      optimized.set(i, []);
    }

    const sortedAssignments = [...assignments].sort(
      (a, b) => (b.estimatedDuration || 0) - (a.estimatedDuration || 0)
    );

    const currentLoad = new Array(totalShards).fill(0);

    for (const assignment of sortedAssignments) {
      const minLoadShard = currentLoad.indexOf(Math.min(...currentLoad));
      const shardId = minLoadShard;

      optimized.get(shardId)!.push(assignment);
      currentLoad[shardId] += assignment.estimatedDuration || DEFAULTS.TEST_TIMEOUT;
    }

    return Promise.resolve(optimized);
  }
}
