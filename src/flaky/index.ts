import { EventEmitter } from 'events';
import { FlakyTest, FlakyHistoryEntry, QuarantineConfig, TestResult, RunResult } from '../types';
import * as path from 'path';
import dayjs from 'dayjs';
import { ManagedManager } from '../base';
import { StorageProvider, getStorage } from '../storage';
import { FLAKY_CONFIG, CACHE_CONFIG, DEFAULTS } from '../constants';

export class FlakyTestManager extends ManagedManager {
  private flakyTests: Map<string, FlakyTest> = new Map();
  private quarantine: Set<string> = new Set();
  private config: QuarantineConfig;
  private storagePath: string;
  private historyFile: string;
  private storage: StorageProvider;

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
      ...config,
    };
    this.storage = storage || getStorage();
    this.setSaveDelay(CACHE_CONFIG.SAVE_DELAY_MS);
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
          this.flakyTests.set(id, test as FlakyTest);
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
      const failures = existing.history.filter((h) => h.status === 'failed').length;
      existing.failureRate = failures / totalRuns;
      existing.totalRuns = totalRuns;

      if (result.status === 'failed') {
        existing.lastFailure = result.timestamp;
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
      this.flakyTests.set(result.id, {
        testId: result.id,
        title: result.title,
        failureRate: result.status === 'failed' ? 1 : 0,
        totalRuns: 1,
        lastFailure: result.status === 'failed' ? result.timestamp : undefined,
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
      });
    }

    if (result.status === 'failed') {
      await this.detectFlaky(result);
    }

    this.scheduleSaveHistory();
  }

  async recordRunResults(runResult: RunResult): Promise<void> {
    await this.ensureReady();
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

    if (flakyTest.failureRate >= this.config.threshold) {
      if (flakyTest.failureRate >= FLAKY_CONFIG.HIGH_THRESHOLD) {
        this.emit('flaky_detected', flakyTest);

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

    const flakyTest = this.flakyTests.get(testId)!;
    flakyTest.isQuarantined = true;
    flakyTest.quarantinedAt = Date.now();
    flakyTest.consecutivePassesSinceQuarantine = 0;
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

      if (options?.resetHistory) {
        flakyTest.history = [];
        flakyTest.failureRate = 0;
        flakyTest.totalRuns = 0;
        flakyTest.lastFailure = undefined;
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
    const titles = this.getQuarantinedTestTitles();
    if (titles.length === 0) {
      return null;
    }
    const escapedTitles = titles.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
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
      .filter((t) => t.failureRate >= threshold)
      .sort((a, b) => b.failureRate - a.failureRate);
  }

  getAllFlakyTests(): FlakyTest[] {
    return Array.from(this.flakyTests.values())
      .filter((t) => t.failureRate > 0)
      .sort((a, b) => b.failureRate - a.failureRate);
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
  } {
    const allFlaky = this.getAllFlakyTests();
    const quarantinedTests = this.getQuarantinedTests();
    const expiredTests = this.getExpiredQuarantinedTests();

    return {
      totalTests: this.flakyTests.size,
      quarantined: quarantinedTests.length,
      flakyRate: this.flakyTests.size > 0 ? (allFlaky.length / this.flakyTests.size) * 100 : 0,
      topFlaky: allFlaky.slice(0, 10),
      expiredQuarantined: expiredTests.length,
    };
  }

  getTestsToSkip(): string[] {
    return Array.from(this.quarantine);
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
