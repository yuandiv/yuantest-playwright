import {
  FlakyTest,
  FlakyHistoryEntry,
  QuarantineConfig,
  FlakyClassification,
  RootCauseAnalysis,
  CorrelationGroup,
  RunResult,
  TestResult,
  TrendAnalysis,
  FlakyHealthScore,
  PredictionResult,
  DurationAnomaly,
  CausalGraph,
  ImpactAnalysis,
  QuarantineStrategy,
  IsolationLevel,
  CodeChangeCorrelation,
} from '../types';
import * as path from 'path';
import dayjs from 'dayjs';
import { ManagedManager } from '../base';
import { StorageProvider, getStorage } from '../storage';
import { FLAKY_CONFIG, CACHE_CONFIG, DEFAULTS } from '../constants';
import {
  classifyTest,
  calculateWeightedFailureRate,
  calculateConsecutiveFailures,
  calculateConsecutivePasses,
  isStatisticallySignificant,
  ClassifyConfig,
} from './classifier';
import { RootCauseAnalyzer, AnalysisContext } from './root-cause';
import { analyzeCorrelations, CorrelationConfig } from './correlation';
import { TrendAnalyzer, calculateHealthScore } from './trend';
import { FlakyPredictor, detectDurationAnomaly } from './predictor';
import {
  QuarantineStrategyManager,
  generateQuarantineStrategy,
  checkQuarantineBudget,
} from './quarantine-strategy';
import { CausalGraphBuilder } from './causal-graph';

export class FlakyTestManager extends ManagedManager {
  private flakyTests: Map<string, FlakyTest> = new Map();
  private quarantine: Set<string> = new Set();
  private config: QuarantineConfig;
  private storagePath: string;
  private historyFile: string;
  private storage: StorageProvider;
  private rootCauseAnalyzer: RootCauseAnalyzer;
  private trendAnalyzer: TrendAnalyzer;
  private predictor: FlakyPredictor;
  private strategyManager: QuarantineStrategyManager;
  private causalGraphBuilder: CausalGraphBuilder;
  private recentRuns: RunResult[] = [];
  private cachedCausalGraph: CausalGraph | null = null;
  private readonly MAX_RECENT_RUNS = 20;

  constructor(
    storagePath: string = DEFAULTS.DATA_DIR,
    config: Partial<QuarantineConfig> = {},
    storage?: StorageProvider
  ) {
    super();
    this.storagePath = storagePath;
    this.historyFile = path.join(storagePath, 'flaky-history.json');
    this.config = {
      enabled: true,
      threshold: FLAKY_CONFIG.DEFAULT_THRESHOLD,
      autoQuarantine: false,
      minimumRuns: FLAKY_CONFIG.MINIMUM_RUNS_FOR_QUARANTINE,
      autoReleaseAfterPasses: FLAKY_CONFIG.AUTO_RELEASE_AFTER_PASSES,
      quarantineExpiryDays: FLAKY_CONFIG.QUARANTINE_EXPIRY_DAYS,
      decayRate: FLAKY_CONFIG.DECAY_RATE,
      confidenceLevel: FLAKY_CONFIG.CONFIDENCE_LEVEL,
      brokenThreshold: FLAKY_CONFIG.BROKEN_CONSECUTIVE_THRESHOLD,
      regressionWindow: FLAKY_CONFIG.REGRESSION_WINDOW,
      enableRootCauseAnalysis: true,
      enableCorrelationAnalysis: true,
      enableTrendTracking: true,
      enablePrediction: true,
      enableCausalGraph: true,
      quarantineStrategy: 'graduated',
      maxQuarantineRatio: FLAKY_CONFIG.QUARANTINE_MAX_RATIO,
      predictionSensitivity: FLAKY_CONFIG.PREDICTION_SENSITIVITY,
      ...config,
    };
    this.storage = storage || getStorage();
    this.setSaveDelay(CACHE_CONFIG.SAVE_DELAY_MS);
    this.rootCauseAnalyzer = new RootCauseAnalyzer();
    this.trendAnalyzer = new TrendAnalyzer();
    this.predictor = new FlakyPredictor({ sensitivity: this.config.predictionSensitivity });
    this.strategyManager = new QuarantineStrategyManager();
    this.causalGraphBuilder = new CausalGraphBuilder();
  }

  protected async doInitialize(): Promise<void> {
    await this.storage.mkdir(this.storagePath);
    await this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    const data = await this.storage.readJSON<any>(this.historyFile);
    if (data) {
      if (data.flakyTests) {
        Object.entries(data.flakyTests).forEach(([id, test]) => {
          const flakyTest = test as FlakyTest;
          if (!flakyTest.classification) {
            flakyTest.classification = 'insufficient_data';
          }
          if (flakyTest.weightedFailureRate === undefined) {
            flakyTest.weightedFailureRate = flakyTest.failureRate;
          }
          if (flakyTest.consecutiveFailures === undefined) {
            flakyTest.consecutiveFailures = 0;
          }
          if (flakyTest.consecutivePasses === undefined) {
            flakyTest.consecutivePasses = 0;
          }
          if (!flakyTest.isolationLevel) {
            flakyTest.isolationLevel = 'none';
          }
          this.flakyTests.set(id, flakyTest);
        });
      }
      if (data.quarantine) {
        this.quarantine = new Set(data.quarantine);
      }
    }
  }

  private async saveHistory(): Promise<void> {
    const data = {
      flakyTests: Object.fromEntries(this.flakyTests),
      quarantine: Array.from(this.quarantine),
      lastUpdated: dayjs().toISOString(),
    };
    await this.storage.writeJSON(this.historyFile, data);
    this.dirty = false;
  }

  private scheduleSaveHistory(): void {
    this.scheduleSave(() => this.saveHistory());
  }

  private async ensureReady(): Promise<void> {
    await this.ready();
  }

  /**
   * 获取分类器配置
   * 从 QuarantineConfig 中提取分类器所需的参数
   */
  private getClassifyConfig(): ClassifyConfig {
    return {
      minimumRuns: this.config.minimumRuns ?? FLAKY_CONFIG.MINIMUM_RUNS_FOR_QUARANTINE,
      brokenThreshold: this.config.brokenThreshold ?? FLAKY_CONFIG.BROKEN_CONSECUTIVE_THRESHOLD,
      regressionWindow: this.config.regressionWindow ?? FLAKY_CONFIG.REGRESSION_WINDOW,
      decayRate: this.config.decayRate ?? FLAKY_CONFIG.DECAY_RATE,
      confidenceLevel: this.config.confidenceLevel ?? FLAKY_CONFIG.CONFIDENCE_LEVEL,
      flakyThreshold: this.config.threshold,
      stableThreshold: 0.05,
    };
  }

  /**
   * 更新测试的分类和统计信息
   * 包括加权失败率、连续失败/通过次数、分类判定、隔离级别、健康评分
   */
  private updateTestClassification(flakyTest: FlakyTest): void {
    flakyTest.weightedFailureRate = calculateWeightedFailureRate(
      flakyTest.history,
      this.config.decayRate ?? FLAKY_CONFIG.DECAY_RATE
    );
    flakyTest.consecutiveFailures = calculateConsecutiveFailures(flakyTest.history);
    flakyTest.consecutivePasses = calculateConsecutivePasses(flakyTest.history);
    flakyTest.classification = classifyTest(flakyTest, this.getClassifyConfig());
    flakyTest.lastClassifiedAt = Date.now();

    if (this.config.quarantineStrategy === 'graduated') {
      const strategy = this.strategyManager.generateStrategy(flakyTest);
      flakyTest.isolationLevel = strategy.isolationLevel;
      flakyTest.quarantineStrategy = strategy;
    }
  }

  async recordTestResult(result: TestResult): Promise<void> {
    await this.ensureReady();
    const existing = this.flakyTests.get(result.id);

    if (existing) {
      existing.history.push({
        timestamp: result.timestamp,
        status: result.status,
        duration: result.duration,
        error: result.error,
      });

      if (existing.history.length > FLAKY_CONFIG.MAX_HISTORY_ENTRIES) {
        existing.history = existing.history.slice(-FLAKY_CONFIG.MAX_HISTORY_ENTRIES);
      }

      const totalRuns = existing.history.length;
      const failures = existing.history.filter(
        (h) => h.status === 'failed' || h.status === 'timedout'
      ).length;
      existing.failureRate = failures / totalRuns;
      existing.totalRuns = totalRuns;

      if (result.status === 'failed' || result.status === 'timedout') {
        existing.lastFailure = result.timestamp;
      }

      this.updateTestClassification(existing);

      if (
        this.config.enablePrediction &&
        existing.history.length >= FLAKY_CONFIG.PREDICTION_MIN_HISTORY
      ) {
        const anomaly = detectDurationAnomaly(existing);
        if (anomaly) {
          existing.durationAnomaly = anomaly;
        }
      }

      if (existing.isQuarantined) {
        if (result.status === 'passed') {
          existing.consecutivePassesSinceQuarantine =
            (existing.consecutivePassesSinceQuarantine || 0) + 1;

          await this.checkAutoRelease(existing);
        } else {
          existing.consecutivePassesSinceQuarantine = 0;
        }
      }
    } else {
      const isFailed = result.status === 'failed' || result.status === 'timedout';
      const newTest: FlakyTest = {
        testId: result.id,
        title: result.title,
        failureRate: isFailed ? 1 : 0,
        totalRuns: 1,
        lastFailure: isFailed ? result.timestamp : undefined,
        isQuarantined: this.quarantine.has(result.id),
        quarantinedAt: undefined,
        consecutivePassesSinceQuarantine: 0,
        history: [
          {
            timestamp: result.timestamp,
            status: result.status,
            duration: result.duration,
            error: result.error,
          },
        ],
        classification: 'insufficient_data',
        weightedFailureRate: isFailed ? 1 : 0,
        consecutiveFailures: isFailed ? 1 : 0,
        consecutivePasses: isFailed ? 0 : 1,
        lastClassifiedAt: Date.now(),
        isolationLevel: 'none',
      };
      this.flakyTests.set(result.id, newTest);
    }

    if (result.status === 'failed' || result.status === 'timedout') {
      await this.detectFlaky(result);
    }

    this.cachedCausalGraph = null;
    this.scheduleSaveHistory();
  }

  async recordRunResults(runResult: RunResult): Promise<void> {
    await this.ensureReady();
    this.recentRuns.push(runResult);
    if (this.recentRuns.length > this.MAX_RECENT_RUNS) {
      this.recentRuns = this.recentRuns.slice(-this.MAX_RECENT_RUNS);
    }
    for (const suite of runResult.suites) {
      for (const test of suite.tests) {
        await this.recordTestResult(test);
      }
    }
  }

  private async detectFlaky(test: TestResult): Promise<void> {
    const flakyTest = this.flakyTests.get(test.id);
    if (!flakyTest) {
      return;
    }

    const minimumRuns = this.config.minimumRuns || FLAKY_CONFIG.MINIMUM_RUNS_FOR_QUARANTINE;
    if (flakyTest.totalRuns < minimumRuns) {
      return;
    }

    if (flakyTest.classification === 'broken') {
      return;
    }

    const confidenceLevel = this.config.confidenceLevel ?? FLAKY_CONFIG.CONFIDENCE_LEVEL;
    const isSignificant = isStatisticallySignificant(
      flakyTest,
      this.config.threshold,
      minimumRuns,
      confidenceLevel
    );

    if (!isSignificant && flakyTest.weightedFailureRate < FLAKY_CONFIG.HIGH_THRESHOLD) {
      return;
    }

    if (flakyTest.weightedFailureRate >= this.config.threshold || isSignificant) {
      if (flakyTest.weightedFailureRate >= FLAKY_CONFIG.HIGH_THRESHOLD || isSignificant) {
        this.emit('flaky_detected', {
          testId: flakyTest.testId,
          title: flakyTest.title,
          failureRate: flakyTest.failureRate,
          weightedFailureRate: flakyTest.weightedFailureRate,
          classification: flakyTest.classification,
          rootCause: flakyTest.rootCause?.primaryCause,
          isolationLevel: flakyTest.isolationLevel,
          timestamp: Date.now(),
        });

        if (this.config.autoQuarantine) {
          await this.quarantineTest(test.id);
        }
      }
    }
  }

  private async checkAutoRelease(flakyTest: FlakyTest): Promise<void> {
    const requiredPasses =
      this.config.autoReleaseAfterPasses ?? FLAKY_CONFIG.AUTO_RELEASE_AFTER_PASSES;
    if ((flakyTest.consecutivePassesSinceQuarantine || 0) >= requiredPasses) {
      await this.releaseTest(flakyTest.testId, { resetHistory: true });
      this.emit('auto_released', {
        testId: flakyTest.testId,
        title: flakyTest.title,
        consecutivePasses: flakyTest.consecutivePassesSinceQuarantine,
      });
    }
  }

  async quarantineTest(testId: string): Promise<boolean> {
    await this.ensureReady();
    if (!this.flakyTests.has(testId)) {
      return false;
    }

    const totalTests = this.flakyTests.size;
    const currentQuarantined = this.quarantine.size;
    const budget = checkQuarantineBudget(totalTests, currentQuarantined);

    if (!budget.allowed && !this.quarantine.has(testId)) {
      return false;
    }

    const flakyTest = this.flakyTests.get(testId)!;
    flakyTest.isQuarantined = true;
    flakyTest.quarantinedAt = Date.now();
    flakyTest.consecutivePassesSinceQuarantine = 0;

    if (this.config.quarantineStrategy === 'graduated') {
      const strategy = this.strategyManager.generateStrategy(flakyTest);
      flakyTest.isolationLevel =
        strategy.isolationLevel === 'none' || strategy.isolationLevel === 'monitor'
          ? 'soft_quarantine'
          : strategy.isolationLevel;
      flakyTest.quarantineStrategy = { ...strategy, isolationLevel: flakyTest.isolationLevel };
    } else {
      flakyTest.isolationLevel = 'hard_quarantine';
    }

    this.quarantine.add(testId);

    this.emit('quarantine_updated', {
      testId,
      action: 'quarantined',
      flakyTest,
    });

    await this.saveHistory();
    return true;
  }

  async releaseTest(testId: string, options?: { resetHistory?: boolean }): Promise<boolean> {
    await this.ensureReady();
    if (!this.quarantine.has(testId)) {
      return false;
    }

    const flakyTest = this.flakyTests.get(testId);
    if (flakyTest) {
      flakyTest.isQuarantined = false;
      flakyTest.quarantinedAt = undefined;
      flakyTest.consecutivePassesSinceQuarantine = 0;
      flakyTest.isolationLevel = 'none';
      flakyTest.quarantineStrategy = undefined;

      if (options?.resetHistory) {
        flakyTest.history = [];
        flakyTest.failureRate = 0;
        flakyTest.weightedFailureRate = 0;
        flakyTest.totalRuns = 0;
        flakyTest.lastFailure = undefined;
        flakyTest.consecutiveFailures = 0;
        flakyTest.consecutivePasses = 0;
        flakyTest.classification = 'insufficient_data';
        flakyTest.rootCause = undefined;
        flakyTest.trendAnalysis = undefined;
        flakyTest.healthScore = undefined;
        flakyTest.durationAnomaly = undefined;
        flakyTest.lastPrediction = undefined;
      }
    }
    this.quarantine.delete(testId);

    this.emit('quarantine_updated', {
      testId,
      action: 'released',
      flakyTest,
    });

    await this.saveHistory();
    return true;
  }

  getQuarantinedTests(): FlakyTest[] {
    return Array.from(this.quarantine)
      .map((id) => this.flakyTests.get(id))
      .filter((t): t is FlakyTest => t !== undefined);
  }

  getQuarantinedTestTitles(): string[] {
    return this.getQuarantinedTests()
      .map((t) => t.title)
      .filter((title) => title && title.length > 0);
  }

  buildGrepInvertPattern(): string | null {
    const quarantinedTitles = this.getQuarantinedTests()
      .filter(
        (t) => t.isolationLevel === 'hard_quarantine' || t.isolationLevel === 'soft_quarantine'
      )
      .map((t) => t.title)
      .filter((title) => title && title.length > 0);

    if (quarantinedTitles.length === 0) {
      return null;
    }
    const escapedTitles = quarantinedTitles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return escapedTitles.join('|');
  }

  isQuarantineExpired(testId: string): boolean {
    const flakyTest = this.flakyTests.get(testId);
    if (!flakyTest || !flakyTest.quarantinedAt) {
      return false;
    }
    const expiryDays = this.config.quarantineExpiryDays ?? FLAKY_CONFIG.QUARANTINE_EXPIRY_DAYS;
    const expiryMs = expiryDays * 24 * 60 * 60 * 1000;
    return Date.now() - flakyTest.quarantinedAt > expiryMs;
  }

  getExpiredQuarantinedTests(): FlakyTest[] {
    return this.getQuarantinedTests().filter((t) => this.isQuarantineExpired(t.testId));
  }

  getFlakyTests(threshold: number = FLAKY_CONFIG.DEFAULT_THRESHOLD): FlakyTest[] {
    return Array.from(this.flakyTests.values())
      .filter((t) => t.weightedFailureRate >= threshold && t.classification !== 'broken')
      .sort((a, b) => b.weightedFailureRate - a.weightedFailureRate);
  }

  getAllFlakyTests(): FlakyTest[] {
    return Array.from(this.flakyTests.values())
      .filter((t) => t.failureRate > 0)
      .sort((a, b) => b.weightedFailureRate - a.weightedFailureRate);
  }

  getTestById(testId: string): FlakyTest | undefined {
    return this.flakyTests.get(testId);
  }

  isQuarantined(testId: string): boolean {
    return this.quarantine.has(testId);
  }

  getQuarantineStats(): {
    totalTests: number;
    quarantined: number;
    flakyRate: number;
    topFlaky: FlakyTest[];
    expiredQuarantined: number;
    classificationBreakdown: Record<FlakyClassification, number>;
    budgetUtilization: number;
    avgHealthScore: number;
  } {
    const allFlaky = this.getAllFlakyTests();
    const quarantinedTests = this.getQuarantinedTests();
    const expiredTests = this.getExpiredQuarantinedTests();

    const classificationBreakdown: Record<FlakyClassification, number> = {
      flaky: 0,
      broken: 0,
      regression: 0,
      stable: 0,
      insufficient_data: 0,
    };

    let totalHealth = 0;
    let healthCount = 0;

    for (const test of this.flakyTests.values()) {
      classificationBreakdown[test.classification]++;
      if (test.healthScore) {
        totalHealth += test.healthScore.overall;
        healthCount++;
      }
    }

    const budget = checkQuarantineBudget(this.flakyTests.size, quarantinedTests.length);

    return {
      totalTests: this.flakyTests.size,
      quarantined: quarantinedTests.length,
      flakyRate: this.flakyTests.size > 0 ? (allFlaky.length / this.flakyTests.size) * 100 : 0,
      topFlaky: allFlaky.slice(0, 10),
      expiredQuarantined: expiredTests.length,
      classificationBreakdown,
      budgetUtilization: budget.utilization,
      avgHealthScore: healthCount > 0 ? Math.round((totalHealth / healthCount) * 100) / 100 : 0,
    };
  }

  getTestsToSkip(): string[] {
    return this.getQuarantinedTests()
      .filter(
        (t) => t.isolationLevel === 'hard_quarantine' || t.isolationLevel === 'soft_quarantine'
      )
      .map((t) => t.testId);
  }

  /**
   * 对指定测试进行根因分析
   * 综合运行历史和上下文信息，判断 Flaky 的根本原因
   * @param testId - 测试 ID
   * @param context - 分析上下文（可选，默认使用内部缓存的运行数据）
   * @returns 根因分析结果，测试不存在时返回 null
   */
  async analyzeRootCause(
    testId: string,
    context?: AnalysisContext
  ): Promise<RootCauseAnalysis | null> {
    await this.ensureReady();

    if (!this.config.enableRootCauseAnalysis) {
      return null;
    }

    const flakyTest = this.flakyTests.get(testId);
    if (!flakyTest || flakyTest.history.length === 0) {
      return null;
    }

    const analysisContext: AnalysisContext = context || {
      recentRuns: this.recentRuns,
    };

    const analysis = this.rootCauseAnalyzer.analyze(flakyTest, analysisContext);
    flakyTest.rootCause = analysis;
    this.scheduleSaveHistory();

    return analysis;
  }

  /**
   * 分析同次运行中多个 Flaky 测试的关联性
   * 如果多个测试频繁在同一次运行中一起失败，可能是环境问题
   * @param config - 关联分析配置（可选）
   * @returns 关联组列表
   */
  analyzeCorrelations(config?: Partial<CorrelationConfig>): CorrelationGroup[] {
    if (!this.config.enableCorrelationAnalysis) {
      return [];
    }

    const allFlaky = this.getAllFlakyTests();
    return analyzeCorrelations(allFlaky, this.recentRuns, config);
  }

  /**
   * 按分类获取测试列表
   * @param classification - 分类类型
   * @returns 匹配分类的测试列表
   */
  getTestsByClassification(classification: FlakyClassification): FlakyTest[] {
    return Array.from(this.flakyTests.values())
      .filter((t) => t.classification === classification)
      .sort((a, b) => b.weightedFailureRate - a.weightedFailureRate);
  }

  /**
   * 对指定测试进行趋势分析
   * 包括时间序列聚合、趋势方向、变点检测、季节模式、预测
   * @param testId - 测试 ID
   * @param codeChanges - 代码变更记录（可选，用于关联分析）
   * @returns 趋势分析结果，测试不存在时返回 null
   */
  async analyzeTrend(
    testId: string,
    codeChanges?: CodeChangeCorrelation[]
  ): Promise<TrendAnalysis | null> {
    await this.ensureReady();

    if (!this.config.enableTrendTracking) {
      return null;
    }

    const flakyTest = this.flakyTests.get(testId);
    if (!flakyTest || flakyTest.history.length < FLAKY_CONFIG.TREND_MIN_DATA_POINTS) {
      return null;
    }

    const analysis = this.trendAnalyzer.analyze(flakyTest, codeChanges);
    flakyTest.trendAnalysis = analysis;

    flakyTest.healthScore = calculateHealthScore(flakyTest, analysis.direction, analysis.r2);

    this.scheduleSaveHistory();
    return analysis;
  }

  /**
   * 对所有 Flaky 测试进行批量趋势分析
   * @param codeChanges - 代码变更记录（可选）
   * @returns 趋势分析结果映射
   */
  async analyzeAllTrends(
    codeChanges?: CodeChangeCorrelation[]
  ): Promise<Map<string, TrendAnalysis>> {
    await this.ensureReady();

    const results = new Map<string, TrendAnalysis>();
    const tests = this.getAllFlakyTests();

    for (const test of tests) {
      if (test.history.length >= FLAKY_CONFIG.TREND_MIN_DATA_POINTS) {
        const analysis = this.trendAnalyzer.analyze(test, codeChanges);
        test.trendAnalysis = analysis;
        test.healthScore = calculateHealthScore(test, analysis.direction, analysis.r2);
        results.set(test.testId, analysis);
      }
    }

    this.scheduleSaveHistory();
    return results;
  }

  /**
   * 对指定测试进行失败预测
   * 基于持续时间异常、失败模式、环境偏移、资源压力等信号
   * @param testId - 测试 ID
   * @returns 预测结果，测试不存在时返回 null
   */
  async predictTestFailure(testId: string): Promise<PredictionResult | null> {
    await this.ensureReady();

    if (!this.config.enablePrediction) {
      return null;
    }

    const flakyTest = this.flakyTests.get(testId);
    if (!flakyTest || flakyTest.history.length < FLAKY_CONFIG.PREDICTION_MIN_HISTORY) {
      return null;
    }

    const prediction = this.predictor.predict(flakyTest);
    flakyTest.lastPrediction = prediction;

    const anomaly = detectDurationAnomaly(flakyTest);
    if (anomaly) {
      flakyTest.durationAnomaly = anomaly;
    }

    this.scheduleSaveHistory();
    return prediction;
  }

  /**
   * 批量获取高风险测试预测
   * @returns 预测将失败的测试列表
   */
  async getHighRiskTests(): Promise<PredictionResult[]> {
    await this.ensureReady();

    if (!this.config.enablePrediction) {
      return [];
    }

    return this.predictor.getHighRiskTests(this.getAllFlakyTests());
  }

  /**
   * 获取所有持续时间异常的测试
   * @returns 异常列表
   */
  async getDurationAnomalies(): Promise<DurationAnomaly[]> {
    await this.ensureReady();

    if (!this.config.enablePrediction) {
      return [];
    }

    return this.predictor.detectAnomalies(this.getAllFlakyTests());
  }

  /**
   * 构建因果依赖图
   * 综合测试数据、关联组和运行结果构建因果图
   * @returns 因果图
   */
  async buildCausalGraph(): Promise<CausalGraph> {
    await this.ensureReady();

    if (!this.config.enableCausalGraph) {
      return { nodes: [], edges: [], rootCauses: [], impactMap: new Map(), builtAt: Date.now() };
    }

    if (this.cachedCausalGraph) {
      return this.cachedCausalGraph;
    }

    const allFlaky = this.getAllFlakyTests();
    const correlations = this.analyzeCorrelations();

    this.cachedCausalGraph = this.causalGraphBuilder.build(allFlaky, correlations, this.recentRuns);

    return this.cachedCausalGraph;
  }

  /**
   * 分析指定测试的影响范围
   * @param testId - 测试 ID
   * @returns 影响分析结果
   */
  async analyzeImpact(testId: string): Promise<ImpactAnalysis | null> {
    await this.ensureReady();

    if (!this.config.enableCausalGraph) {
      return null;
    }

    const graph = await this.buildCausalGraph();
    return this.causalGraphBuilder.analyzeImpact(testId, graph);
  }

  /**
   * 获取因果图的根因节点
   * @returns 根因节点列表
   */
  async getRootCauses() {
    const graph = await this.buildCausalGraph();
    return this.causalGraphBuilder.getRootCauses(graph);
  }

  /**
   * 获取指定测试的隔离策略
   * @param testId - 测试 ID
   * @returns 隔离策略，测试不存在时返回 null
   */
  async getQuarantineStrategy(testId: string): Promise<QuarantineStrategy | null> {
    await this.ensureReady();

    const flakyTest = this.flakyTests.get(testId);
    if (!flakyTest) {
      return null;
    }

    if (flakyTest.quarantineStrategy) {
      return flakyTest.quarantineStrategy;
    }

    return generateQuarantineStrategy(flakyTest);
  }

  /**
   * 获取隔离预算使用情况
   * @returns 预算状态
   */
  getQuarantineBudget() {
    return checkQuarantineBudget(this.flakyTests.size, this.quarantine.size);
  }

  /**
   * 获取按隔离级别分组的测试
   * @returns 隔离级别到测试列表的映射
   */
  getTestsByIsolationLevel(): Record<IsolationLevel, FlakyTest[]> {
    const result: Record<IsolationLevel, FlakyTest[]> = {
      none: [],
      monitor: [],
      soft_quarantine: [],
      hard_quarantine: [],
    };

    for (const test of this.flakyTests.values()) {
      const level = test.isolationLevel || 'none';
      result[level].push(test);
    }

    return result;
  }

  /**
   * 获取项目整体健康评分
   * 综合所有测试的健康评分计算项目级评分
   * @returns 健康评分
   */
  async getOverallHealthScore(): Promise<FlakyHealthScore> {
    await this.ensureReady();

    const tests = Array.from(this.flakyTests.values());
    if (tests.length === 0) {
      return {
        overall: 1,
        breakdown: { stability: 1, trend: 0.7, recoverability: 1, predictability: 0.5 },
        grade: 'A',
        label: '无测试数据',
      };
    }

    let totalStability = 0;
    let totalTrend = 0;
    let totalRecoverability = 0;
    let totalPredictability = 0;
    let analyzedCount = 0;

    for (const test of tests) {
      if (!test.healthScore && test.history.length >= FLAKY_CONFIG.TREND_MIN_DATA_POINTS) {
        const analysis = this.trendAnalyzer.analyze(test);
        test.trendAnalysis = analysis;
        test.healthScore = calculateHealthScore(test, analysis.direction, analysis.r2);
      }

      if (test.healthScore) {
        totalStability += test.healthScore.breakdown.stability;
        totalTrend += test.healthScore.breakdown.trend;
        totalRecoverability += test.healthScore.breakdown.recoverability;
        totalPredictability += test.healthScore.breakdown.predictability;
        analyzedCount++;
      } else {
        const stability = 1 - test.weightedFailureRate;
        totalStability += stability;
        totalRecoverability += test.totalRuns > 0 ? Math.min(1, (1 - test.failureRate) * 1.5) : 0;
        analyzedCount++;
      }
    }

    const overallStability = analyzedCount > 0 ? totalStability / analyzedCount : 0;
    const overallTrend = analyzedCount > 0 ? totalTrend / analyzedCount : 0.7;
    const overallRecoverability = analyzedCount > 0 ? totalRecoverability / analyzedCount : 0;
    const overallPredictability = analyzedCount > 0 ? totalPredictability / analyzedCount : 0;

    const weights = FLAKY_CONFIG.HEALTH_SCORE_WEIGHTS;
    const overall =
      overallStability * weights.stability +
      overallTrend * weights.trend +
      overallRecoverability * weights.recoverability +
      overallPredictability * weights.predictability;

    const grade =
      overall >= 0.9
        ? 'A'
        : overall >= 0.75
          ? 'B'
          : overall >= 0.6
            ? 'C'
            : overall >= 0.4
              ? 'D'
              : 'F';
    const labels: Record<string, string> = {
      A: '非常健康',
      B: '基本健康',
      C: '需要关注',
      D: '不健康',
      F: '严重不健康',
    };

    return {
      overall: Math.round(overall * 100) / 100,
      breakdown: {
        stability: Math.round(overallStability * 100) / 100,
        trend: Math.round(overallTrend * 100) / 100,
        recoverability: Math.round(overallRecoverability * 100) / 100,
        predictability: Math.round(overallPredictability * 100) / 100,
      },
      grade,
      label: labels[grade],
    };
  }

  async clearHistory(testId?: string): Promise<void> {
    await this.ensureReady();
    if (testId) {
      this.flakyTests.delete(testId);
      this.quarantine.delete(testId);
    } else {
      this.flakyTests.clear();
      this.quarantine.clear();
    }
    this.cachedCausalGraph = null;
    await this.saveHistory();
  }

  setConfig(config: Partial<QuarantineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): QuarantineConfig {
    return { ...this.config };
  }

  async flush(): Promise<void> {
    await super.flush(() => this.saveHistory());
  }
}
