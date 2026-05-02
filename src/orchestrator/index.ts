import { TestConfig, OrchestrationConfig, TestAssignment, BrowserType, ErrorCode } from '../types';
import { PlaywrightRunnerError } from '../types';
import { logger } from '../logger';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, getStorage } from '../storage';
import { walkDirAsync } from '../utils/filesystem';
import { ManagedManager } from '../base';
import { DEFAULTS, FILE_PATTERNS, CACHE_CONFIG } from '../constants';

const EMA_ALPHA = 0.3;
const MIN_RUNS_FOR_CONFIDENCE = 3;
const HIGH_VARIANCE_THRESHOLD = 0.4;
const CALIBRATION_LEARNING_RATE = 0.2;
const MAX_CALIBRATION_FACTOR = 2.0;
const MIN_CALIBRATION_FACTOR = 0.5;

interface TestDurationHistory {
  testFile: string;
  avgDuration: number;
  runCount: number;
  variance: number;
  emaDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  lastDuration: number;
  lastRunTimestamp: number;
  recentDurations: number[];
}

interface ShardPredictionFeedback {
  shardId: number;
  predictedDuration: number;
  actualDuration: number;
  timestamp: number;
}

interface DurationEstimate {
  estimated: number;
  confidence: number;
  variance: number;
  source: 'history' | 'ema' | 'similar' | 'default';
}

export class Orchestrator extends ManagedManager {
  private config: TestConfig;
  private assignments: Map<string, TestAssignment[]> = new Map();
  private durationHistory: Map<string, TestDurationHistory> = new Map();
  private predictionFeedback: ShardPredictionFeedback[] = [];
  private calibrationFactor: number = 1.0;
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
          const migrated: TestDurationHistory = {
            testFile: entry.testFile,
            avgDuration: entry.avgDuration ?? 0,
            runCount: entry.runCount ?? 0,
            variance: entry.variance ?? 0,
            emaDuration: entry.emaDuration ?? entry.avgDuration ?? 0,
            minDuration: entry.minDuration ?? entry.avgDuration ?? 0,
            maxDuration: entry.maxDuration ?? entry.avgDuration ?? 0,
            p95Duration: entry.p95Duration ?? entry.avgDuration ?? 0,
            lastDuration: entry.lastDuration ?? entry.avgDuration ?? 0,
            lastRunTimestamp: entry.lastRunTimestamp ?? 0,
            recentDurations: entry.recentDurations ?? [],
          };
          this.durationHistory.set(entry.testFile, migrated);
        }
        this.log.debug(`Loaded duration history for ${this.durationHistory.size} tests`);
      }
      if (data && data.calibrationFactor) {
        this.calibrationFactor = data.calibrationFactor;
      }
      if (data && data.predictionFeedback) {
        this.predictionFeedback = data.predictionFeedback.slice(-20);
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

  /**
   * 智能分片策略：基于增强历史数据使用 ShardOptimizer 进行方差感知负载均衡
   * 传入完整的 DurationEstimate 信息（含置信度和方差），优化器据此做风险分散
   */
  async optimizeSharding(): Promise<OrchestrationConfig> {
    const testFiles = await this.discoverTests();
    const optimizer = new ShardOptimizer(this.durationHistory, this.calibrationFactor);
    const estimates = testFiles.map((file) => this.estimateTestDurationDetailed(file));

    const optimizedAssignments = await optimizer.optimize(
      testFiles.map((file, i) => ({
        testId: file,
        shardId: 0,
        priority: 1,
        estimatedDuration: estimates[i].estimated,
        durationConfidence: estimates[i].confidence,
        durationVariance: estimates[i].variance,
        estimationSource: estimates[i].source,
      })),
      this.config.shards || 1
    );

    const allAssignments: TestAssignment[] = [];
    optimizedAssignments.forEach((shardAssignments: TestAssignment[], shardId: number) => {
      allAssignments.push(...shardAssignments);
    });

    const shardLoads = optimizer.getShardLoads();
    this.log.info(
      `Optimized sharding: ${testFiles.length} tests across ${this.config.shards || 1} shards (intelligent strategy), ` +
        `loads: [${shardLoads.map((l: number) => `${(l / 1000).toFixed(1)}s`).join(', ')}], ` +
        `calibration: ${this.calibrationFactor.toFixed(3)}`
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
      const estimate = this.estimateTestDurationDetailed(file);
      assignments.push({
        testId: file,
        shardId,
        priority: 1,
        estimatedDuration: estimate.estimated,
        durationConfidence: estimate.confidence,
        durationVariance: estimate.variance,
        estimationSource: estimate.source,
      });
    });

    return assignments;
  }

  /**
   * 简化版估算：仅返回预估时间数值（向后兼容）
   */
  private estimateTestDuration(file: string): number {
    return this.estimateTestDurationDetailed(file).estimated;
  }

  /**
   * 增强版估算：返回完整的 DurationEstimate，包含置信度、方差和来源
   * 决策逻辑：
   * 1. 有 >= MIN_RUNS_FOR_CONFIDENCE 次历史 → 使用 EMA（指数移动平均），高置信度
   * 2. 有 1~2 次历史 → 使用简单平均，低置信度，尝试同类推断
   * 3. 无历史 → 基于同类测试推断，最低置信度
   * 4. 所有估算都乘以校准因子（反馈闭环）
   */
  private estimateTestDurationDetailed(file: string): DurationEstimate {
    const history = this.durationHistory.get(file);

    if (!history || history.runCount === 0) {
      const similarEstimate = this.estimateFromSimilarTests(file);
      if (similarEstimate) {
        return {
          estimated: similarEstimate.estimated * this.calibrationFactor,
          confidence: similarEstimate.confidence,
          variance: similarEstimate.variance,
          source: 'similar',
        };
      }
      return {
        estimated: DEFAULTS.TEST_TIMEOUT * this.calibrationFactor,
        confidence: 0.1,
        variance: DEFAULTS.TEST_TIMEOUT * DEFAULTS.TEST_TIMEOUT * 0.25,
        source: 'default',
      };
    }

    if (history.runCount < MIN_RUNS_FOR_CONFIDENCE) {
      const similarEstimate = this.estimateFromSimilarTests(file);
      const historyWeight = history.runCount / MIN_RUNS_FOR_CONFIDENCE;
      const similarWeight = 1 - historyWeight;

      let blended = history.avgDuration;
      if (similarEstimate) {
        blended = history.avgDuration * historyWeight + similarEstimate.estimated * similarWeight;
      }

      const cv = history.avgDuration > 0 ? Math.sqrt(history.variance) / history.avgDuration : 1.0;
      const confidence = Math.min(0.5, (history.runCount / MIN_RUNS_FOR_CONFIDENCE) * (1 - cv));

      return {
        estimated: blended * this.calibrationFactor,
        confidence,
        variance: history.variance,
        source: 'history',
      };
    }

    const cv = history.emaDuration > 0 ? Math.sqrt(history.variance) / history.emaDuration : 1.0;
    const confidence = Math.min(1.0, (1 - cv * 0.5) * Math.min(1, history.runCount / 10));

    return {
      estimated: history.emaDuration * this.calibrationFactor,
      confidence,
      variance: history.variance,
      source: 'ema',
    };
  }

  /**
   * 基于同类测试推断新测试的执行时间
   * 同类定义：同目录下的测试文件，或文件名模式相似的测试
   */
  private estimateFromSimilarTests(file: string): DurationEstimate | null {
    const dir = path.dirname(file);
    const dirDurations: number[] = [];

    for (const [testFile, history] of this.durationHistory) {
      if (testFile === file) {
        continue;
      }
      if (path.dirname(testFile) === dir && history.runCount >= MIN_RUNS_FOR_CONFIDENCE) {
        dirDurations.push(history.emaDuration);
      }
    }

    if (dirDurations.length >= 2) {
      dirDurations.sort((a, b) => a - b);
      const median = dirDurations[Math.floor(dirDurations.length / 2)];
      const mean = dirDurations.reduce((s, d) => s + d, 0) / dirDurations.length;
      const variance = dirDurations.reduce((s, d) => s + (d - mean) ** 2, 0) / dirDurations.length;

      return {
        estimated: median,
        confidence: 0.3,
        variance,
        source: 'similar',
      };
    }

    return null;
  }

  /**
   * 增强版历史更新：同时维护方差、EMA、百分位数、极值
   * 使用 Welford 在线算法计算方差，EMA 进行时间衰减
   */
  updateDurationHistory(testFile: string, duration: number): void {
    const existing = this.durationHistory.get(testFile);
    const now = Date.now();

    if (existing) {
      const newRunCount = existing.runCount + 1;
      const delta = duration - existing.avgDuration;
      const newAvg = existing.avgDuration + delta / newRunCount;
      const delta2 = duration - newAvg;
      const newVariance = (existing.variance * existing.runCount + delta * delta2) / newRunCount;

      const newEma = EMA_ALPHA * duration + (1 - EMA_ALPHA) * existing.emaDuration;

      const recentDurations = [...existing.recentDurations, duration].slice(-20);
      const sortedRecent = [...recentDurations].sort((a, b) => a - b);
      const p95Index = Math.ceil(sortedRecent.length * 0.95) - 1;
      const p95 = sortedRecent[Math.max(0, p95Index)];

      existing.avgDuration = newAvg;
      existing.runCount = newRunCount;
      existing.variance = newVariance;
      existing.emaDuration = newEma;
      existing.minDuration = Math.min(existing.minDuration, duration);
      existing.maxDuration = Math.max(existing.maxDuration, duration);
      existing.p95Duration = p95;
      existing.lastDuration = duration;
      existing.lastRunTimestamp = now;
      existing.recentDurations = recentDurations;
    } else {
      this.durationHistory.set(testFile, {
        testFile,
        avgDuration: duration,
        runCount: 1,
        variance: 0,
        emaDuration: duration,
        minDuration: duration,
        maxDuration: duration,
        p95Duration: duration,
        lastDuration: duration,
        lastRunTimestamp: now,
        recentDurations: [duration],
      });
    }
    this.scheduleSave(() => this.saveDurationHistory());
  }

  recordRunResults(results: Array<{ testId: string; duration: number }>): void {
    for (const result of results) {
      this.updateDurationHistory(result.testId, result.duration);
    }
  }

  /**
   * 记录分片预测反馈并自动校准
   * 对比每个分片的预测总耗时与实际总耗时，使用学习率调整校准因子
   */
  recordShardFeedback(feedback: ShardPredictionFeedback): void {
    this.predictionFeedback.push(feedback);
    if (this.predictionFeedback.length > 20) {
      this.predictionFeedback = this.predictionFeedback.slice(-20);
    }

    const recentFeedback = this.predictionFeedback.filter(
      (f) => Date.now() - f.timestamp < 7 * 24 * 60 * 60 * 1000
    );

    if (recentFeedback.length >= 3) {
      let totalPredicted = 0;
      let totalActual = 0;
      for (const f of recentFeedback) {
        totalPredicted += f.predictedDuration;
        totalActual += f.actualDuration;
      }

      if (totalPredicted > 0) {
        const observedRatio = totalActual / totalPredicted;
        this.calibrationFactor =
          this.calibrationFactor * (1 - CALIBRATION_LEARNING_RATE) +
          observedRatio * CALIBRATION_LEARNING_RATE;
        this.calibrationFactor = Math.max(
          MIN_CALIBRATION_FACTOR,
          Math.min(MAX_CALIBRATION_FACTOR, this.calibrationFactor)
        );
      }
    }

    this.scheduleSave(() => this.saveDurationHistory());
  }

  getCalibrationFactor(): number {
    return this.calibrationFactor;
  }

  getPredictionFeedback(): ShardPredictionFeedback[] {
    return [...this.predictionFeedback];
  }

  private async saveDurationHistory(): Promise<void> {
    const dataDir = this.config.outputDir || DEFAULTS.DATA_DIR;
    await this.storage.mkdir(dataDir);
    const historyFile = path.join(dataDir, 'duration-history.json');
    try {
      const data = {
        history: Array.from(this.durationHistory.values()),
        calibrationFactor: this.calibrationFactor,
        predictionFeedback: this.predictionFeedback.slice(-20),
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

/**
 * 方差感知智能分片优化器
 *
 * 核心算法改进（相比原 LPT 贪心）：
 *
 * 1. 风险感知负载计算
 *    分片负载 = Σ(estimatedDuration) + riskPenalty * Σ(sqrt(variance))
 *    高方差测试的不确定性被显式建模，避免多个不稳定测试聚集在同一分片
 *
 * 2. 多目标优化
 *    - 主目标：最小化最大分片负载（makespan）
 *    - 次目标：最小化分片间方差风险差异
 *    - 约束：高方差测试尽量分散到不同分片
 *
 * 3. 置信度加权
 *    低置信度测试的预估时间不确定性更高，分配时给予更大的风险惩罚
 *
 * 4. 两阶段分配
 *    第一阶段：LPT 基础分配（确定性测试）
 *    第二阶段：方差感知重平衡（高风险测试分散化）
 */
export class ShardOptimizer {
  private durationHistory: Map<string, TestDurationHistory>;
  private calibrationFactor: number;
  private shardLoads: number[] = [];
  private riskPenalty: number = 0.5;

  constructor(durationHistory?: Map<string, TestDurationHistory>, calibrationFactor?: number) {
    this.durationHistory = durationHistory || new Map();
    this.calibrationFactor = calibrationFactor ?? 1.0;
  }

  /**
   * 执行方差感知的分片优化
   * @param assignments 测试分配列表，需包含 estimatedDuration、durationConfidence、durationVariance
   * @param totalShards 总分片数
   * @returns 分片 ID → 测试分配列表的映射
   */
  optimize(
    assignments: TestAssignment[],
    totalShards: number
  ): Promise<Map<number, TestAssignment[]>> {
    const optimized = new Map<number, TestAssignment[]>();
    const shardVarianceSums = new Array(totalShards).fill(0);

    for (let i = 0; i < totalShards; i++) {
      optimized.set(i, []);
    }

    const enriched = assignments.map((a) => ({
      ...a,
      duration: a.estimatedDuration || DEFAULTS.TEST_TIMEOUT,
      confidence: a.durationConfidence ?? 0.1,
      variance: a.durationVariance ?? 0,
      riskScore: this.computeRiskScore(a),
    }));

    const highRisk = enriched
      .filter((a) => a.riskScore > HIGH_VARIANCE_THRESHOLD)
      .sort((a, b) => b.riskScore - a.riskScore);

    const stable = enriched
      .filter((a) => a.riskScore <= HIGH_VARIANCE_THRESHOLD)
      .sort((a, b) => b.duration - a.duration);

    const currentLoad = new Array(totalShards).fill(0);

    for (const test of highRisk) {
      const bestShard = this.findBestShardForHighRisk(
        test,
        currentLoad,
        shardVarianceSums,
        totalShards,
        optimized
      );
      optimized.get(bestShard)!.push(test);
      currentLoad[bestShard] += test.duration;
      shardVarianceSums[bestShard] += test.variance;
    }

    for (const test of stable) {
      const effectiveLoad = currentLoad.map(
        (load, i) => load + this.riskPenalty * Math.sqrt(shardVarianceSums[i])
      );
      const minLoadShard = effectiveLoad.indexOf(Math.min(...effectiveLoad));

      optimized.get(minLoadShard)!.push(test);
      currentLoad[minLoadShard] += test.duration;
      shardVarianceSums[minLoadShard] += test.variance;
    }

    this.rebalance(optimized, currentLoad, shardVarianceSums, totalShards);

    this.shardLoads = [...currentLoad];
    return Promise.resolve(optimized);
  }

  /**
   * 计算测试的风险评分（变异系数 + 置信度逆权重）
   * 风险越高，越需要分散到不同分片
   */
  private computeRiskScore(assignment: TestAssignment): number {
    const duration = assignment.estimatedDuration || DEFAULTS.TEST_TIMEOUT;
    const variance = assignment.durationVariance ?? 0;
    const confidence = assignment.durationConfidence ?? 0.1;

    const cv = duration > 0 ? Math.sqrt(variance) / duration : 1.0;
    const confidencePenalty = 1 - confidence;

    return cv * 0.6 + confidencePenalty * 0.4;
  }

  /**
   * 为高风险测试选择最佳分片
   * 策略：优先选择方差累计最小的分片（风险分散），其次考虑负载均衡
   */
  private findBestShardForHighRisk(
    test: TestAssignment & { duration: number; variance: number; riskScore: number },
    currentLoad: number[],
    shardVarianceSums: number[],
    totalShards: number,
    optimized: Map<number, TestAssignment[]>
  ): number {
    let bestShard = 0;
    let bestScore = Infinity;

    for (let i = 0; i < totalShards; i++) {
      const newVarianceSum = shardVarianceSums[i] + test.variance;
      const riskComponent = Math.sqrt(newVarianceSum);
      const loadComponent = currentLoad[i] + test.duration;
      const hasSimilarRisk = optimized
        .get(i)!
        .some((existing) => this.computeRiskScore(existing) > HIGH_VARIANCE_THRESHOLD);
      const diversityPenalty = hasSimilarRisk ? test.duration * 0.3 : 0;

      const score = loadComponent + this.riskPenalty * riskComponent + diversityPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestShard = i;
      }
    }

    return bestShard;
  }

  /**
   * 两两交换重平衡：尝试通过交换测试来减少分片间负载差异
   * 只在负载不均衡度超过阈值时触发
   */
  private rebalance(
    optimized: Map<number, TestAssignment[]>,
    currentLoad: number[],
    shardVarianceSums: number[],
    totalShards: number
  ): void {
    const maxIterations = 10;
    const improvementThreshold = 0.01;

    for (let iter = 0; iter < maxIterations; iter++) {
      const maxLoad = Math.max(...currentLoad);
      const minLoad = Math.min(...currentLoad);
      const avgLoad = currentLoad.reduce((s, l) => s + l, 0) / totalShards;

      if (maxLoad - minLoad <= avgLoad * improvementThreshold) {
        break;
      }

      const heaviestShard = currentLoad.indexOf(maxLoad);
      const lightestShard = currentLoad.indexOf(minLoad);

      let bestSwap: { fromIdx: number; toIdx: number; improvement: number } | null = null;
      let bestImprovement = 0;

      const heavyTests = optimized.get(heaviestShard)!;
      const lightTests = optimized.get(lightestShard)!;

      for (let fi = 0; fi < heavyTests.length; fi++) {
        const fromTest = heavyTests[fi];
        const fromDuration = fromTest.estimatedDuration || DEFAULTS.TEST_TIMEOUT;

        for (let ti = 0; ti < lightTests.length; ti++) {
          const toTest = lightTests[ti];
          const toDuration = toTest.estimatedDuration || DEFAULTS.TEST_TIMEOUT;

          const newHeavyLoad = maxLoad - fromDuration + toDuration;
          const newLightLoad = minLoad - toDuration + fromDuration;
          const newMax = Math.max(
            newHeavyLoad,
            newLightLoad,
            ...currentLoad.filter((_, i) => i !== heaviestShard && i !== lightestShard)
          );
          const improvement = maxLoad - newMax;

          if (improvement > bestImprovement) {
            bestImprovement = improvement;
            bestSwap = { fromIdx: fi, toIdx: ti, improvement };
          }
        }

        if (!bestSwap) {
          const newHeavyLoad = maxLoad - fromDuration;
          const newLightLoad = minLoad + fromDuration;
          const newMax = Math.max(
            newHeavyLoad,
            newLightLoad,
            ...currentLoad.filter((_, i) => i !== heaviestShard && i !== lightestShard)
          );
          const improvement = maxLoad - newMax;

          if (improvement > bestImprovement) {
            bestImprovement = improvement;
            bestSwap = { fromIdx: fi, toIdx: -1, improvement };
          }
        }
      }

      if (!bestSwap || bestSwap.improvement <= 0) {
        break;
      }

      const fromTest = heavyTests[bestSwap.fromIdx];
      const fromDuration = fromTest.estimatedDuration || DEFAULTS.TEST_TIMEOUT;
      const fromVariance = fromTest.durationVariance ?? 0;

      if (bestSwap.toIdx >= 0) {
        const toTest = lightTests[bestSwap.toIdx];
        const toDuration = toTest.estimatedDuration || DEFAULTS.TEST_TIMEOUT;
        const toVariance = toTest.durationVariance ?? 0;

        heavyTests.splice(bestSwap.fromIdx, 1, toTest);
        lightTests.splice(bestSwap.toIdx, 1, fromTest);

        currentLoad[heaviestShard] = currentLoad[heaviestShard] - fromDuration + toDuration;
        currentLoad[lightestShard] = currentLoad[lightestShard] - toDuration + fromDuration;
        shardVarianceSums[heaviestShard] =
          shardVarianceSums[heaviestShard] - fromVariance + toVariance;
        shardVarianceSums[lightestShard] =
          shardVarianceSums[lightestShard] - toVariance + fromVariance;
      } else {
        heavyTests.splice(bestSwap.fromIdx, 1);
        lightTests.push(fromTest);

        currentLoad[heaviestShard] -= fromDuration;
        currentLoad[lightestShard] += fromDuration;
        shardVarianceSums[heaviestShard] -= fromVariance;
        shardVarianceSums[lightestShard] += fromVariance;
      }
    }
  }

  /**
   * 获取最近一次优化后的各分片负载
   */
  getShardLoads(): number[] {
    return [...this.shardLoads];
  }
}
