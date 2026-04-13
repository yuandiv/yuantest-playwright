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
    } else {
      this.flakyTests.set(result.id, {
        testId: result.id,
        title: result.title,
        failureRate: result.status === 'failed' ? 1 : 0,
        totalRuns: 1,
        lastFailure: result.status === 'failed' ? result.timestamp : undefined,
        isQuarantined: this.quarantine.has(result.id),
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

    if (flakyTest.failureRate >= this.config.threshold) {
      if (flakyTest.failureRate >= FLAKY_CONFIG.HIGH_THRESHOLD) {
        this.emit('flaky_detected', flakyTest);

        if (this.config.autoQuarantine) {
          await this.quarantineTest(test.id);
        }
      }
    }
  }

  async quarantineTest(testId: string): Promise<boolean> {
    await this.ensureReady();
    if (!this.flakyTests.has(testId)) {
      return false;
    }

    const flakyTest = this.flakyTests.get(testId)!;
    flakyTest.isQuarantined = true;
    this.quarantine.add(testId);

    this.emit('quarantine_updated', {
      testId,
      action: 'quarantined',
      flakyTest,
    });

    await this.saveHistory();
    return true;
  }

  async releaseTest(testId: string): Promise<boolean> {
    await this.ensureReady();
    if (!this.quarantine.has(testId)) {
      return false;
    }

    const flakyTest = this.flakyTests.get(testId);
    if (flakyTest) {
      flakyTest.isQuarantined = false;
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
  } {
    const allFlaky = this.getAllFlakyTests();
    const quarantinedTests = this.getQuarantinedTests();

    return {
      totalTests: this.flakyTests.size,
      quarantined: quarantinedTests.length,
      flakyRate: this.flakyTests.size > 0 ? (allFlaky.length / this.flakyTests.size) * 100 : 0,
      topFlaky: allFlaky.slice(0, 10),
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
