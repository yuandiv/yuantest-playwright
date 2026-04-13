import {
  VisualTestingConfig,
  VisualTestResult,
  VisualTestStatus,
  VisualTestComparison,
  BrowserType,
} from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { StorageProvider, getStorage } from '../storage';
import { logger } from '../logger';

export class VisualTestingManager {
  private config: VisualTestingConfig;
  private baseDir: string;
  private results: Map<string, VisualTestResult> = new Map();
  private storage: StorageProvider;
  private log = logger.child('VisualTesting');

  constructor(
    config: VisualTestingConfig,
    baseDir: string = './visual-testing',
    storage?: StorageProvider
  ) {
    this.config = config;
    this.baseDir = config.outputDir || baseDir;
    this.storage = storage || getStorage();
  }

  async initialize(): Promise<void> {
    const dirs = ['baseline', 'current', 'diff', 'comparison'];
    for (const dir of dirs) {
      const fullPath = path.join(this.baseDir, dir);
      await this.storage.mkdir(fullPath);
    }
  }

  async captureBaseline(
    testId: string,
    screenshotPath: string,
    browser: BrowserType = 'chromium'
  ): Promise<string> {
    const baselinePath = this.getBaselinePath(testId, browser);
    const dir = path.dirname(baselinePath);
    await this.storage.mkdir(dir);

    const exists = await this.storage.exists(screenshotPath);
    if (exists) {
      await this.storage.copy(screenshotPath, baselinePath);
    }

    return baselinePath;
  }

  async captureCurrent(
    testId: string,
    screenshotPath: string,
    browser: BrowserType = 'chromium'
  ): Promise<string> {
    const currentPath = this.getCurrentPath(testId, browser);
    const dir = path.dirname(currentPath);
    await this.storage.mkdir(dir);

    const exists = await this.storage.exists(screenshotPath);
    if (exists) {
      await this.storage.copy(screenshotPath, currentPath);
    }

    return currentPath;
  }

  async compare(testId: string, browser: BrowserType = 'chromium'): Promise<VisualTestComparison> {
    const baselinePath = this.getBaselinePath(testId, browser);
    const currentPath = this.getCurrentPath(testId, browser);
    const diffPath = this.getDiffPath(testId, browser);

    const baselineExists = await this.storage.exists(baselinePath);
    const currentExists = await this.storage.exists(currentPath);

    if (!baselineExists) {
      return {
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels: 0,
        totalPixels: 0,
        diffRatio: 0,
        matches: false,
      };
    }

    if (!currentExists) {
      return {
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels: 0,
        totalPixels: 0,
        diffRatio: 0,
        matches: false,
      };
    }

    try {
      const pixelDiff = await this.pixelCompare(baselinePath, currentPath);
      const matches = pixelDiff.diffRatio <= this.config.threshold;

      if (!matches && this.config.maxDiffPixels > 0) {
        pixelDiff.matches = pixelDiff.diffPixels <= this.config.maxDiffPixels;
      }

      return pixelDiff;
    } catch (error: unknown) {
      this.log.warn(
        `Pixel comparison failed for ${testId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels: -1,
        totalPixels: 0,
        diffRatio: 1,
        matches: false,
      };
    }
  }

  private async pixelCompare(
    baselinePath: string,
    currentPath: string
  ): Promise<VisualTestComparison> {
    const diffPath = baselinePath.replace(/baseline/, 'diff');
    const dir = path.dirname(diffPath);
    await this.storage.mkdir(dir);

    const baselineBuffer = await this.storage.readBuffer(baselinePath);
    const currentBuffer = await this.storage.readBuffer(currentPath);

    if (!baselineBuffer || !currentBuffer) {
      return {
        baseline: baselinePath,
        current: currentPath,
        diff: diffPath,
        diffPixels: -1,
        totalPixels: 0,
        diffRatio: 1,
        matches: false,
      };
    }

    const baselinePng = PNG.sync.read(baselineBuffer);
    const currentPng = PNG.sync.read(currentBuffer);

    const width = Math.max(baselinePng.width, currentPng.width);
    const height = Math.max(baselinePng.height, currentPng.height);

    const baselineData = new Uint8Array(width * height * 4);
    const currentData = new Uint8Array(width * height * 4);
    const diffData = new Uint8Array(width * height * 4);

    baselineData.set(
      baselinePng.data.subarray(0, Math.min(baselinePng.data.length, baselineData.length))
    );
    currentData.set(
      currentPng.data.subarray(0, Math.min(currentPng.data.length, currentData.length))
    );

    const diffPng = new PNG({ width, height });
    const diffPixels = pixelmatch(baselineData, currentData, diffPng.data, width, height, {
      threshold: 0.1,
    });

    await this.storage.writeBuffer(diffPath, Buffer.from(PNG.sync.write(diffPng)));

    const totalPixels = width * height;
    const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

    return {
      baseline: baselinePath,
      current: currentPath,
      diff: diffPath,
      diffPixels,
      totalPixels,
      diffRatio,
      matches: diffRatio <= this.config.threshold,
    };
  }

  async runVisualTests(
    testIds: string[],
    browser: BrowserType = 'chromium'
  ): Promise<VisualTestResult[]> {
    const results: VisualTestResult[] = [];

    for (const testId of testIds) {
      const comparison = await this.compare(testId, browser);

      const baselineExists = await this.storage.exists(comparison.baseline);
      const currentExists = await this.storage.exists(comparison.current);

      let status: VisualTestStatus;
      if (!baselineExists) {
        status = 'new';
      } else if (!currentExists) {
        status = 'missing';
      } else if (comparison.matches) {
        status = 'identical';
      } else if (comparison.diffRatio > this.config.maxDiffPixelRatio) {
        status = 'regression';
      } else {
        status = 'different';
      }

      const result: VisualTestResult = {
        testId,
        testName: testId.split('::').pop() || testId,
        status,
        baselinePath: comparison.baseline,
        comparisonPath: comparison.current,
        diffPath: comparison.diff,
        diffPixelRatio: comparison.diffRatio,
        diffPixels: comparison.diffPixels,
        threshold: this.config.threshold,
        timestamp: Date.now(),
        browser,
      };

      results.push(result);
      this.results.set(testId, result);
    }

    return results;
  }

  async updateBaseline(testId: string, browser: BrowserType = 'chromium'): Promise<boolean> {
    const currentPath = this.getCurrentPath(testId, browser);
    const baselinePath = this.getBaselinePath(testId, browser);

    const currentExists = await this.storage.exists(currentPath);
    if (!currentExists) {
      return false;
    }

    const dir = path.dirname(baselinePath);
    await this.storage.mkdir(dir);

    await this.storage.copy(currentPath, baselinePath);
    return true;
  }

  async updateAllBaselines(browser: BrowserType = 'chromium'): Promise<number> {
    const currentDir = path.join(this.baseDir, 'current');
    const currentExists = await this.storage.exists(currentDir);
    if (!currentExists) {
      return 0;
    }

    const files = await this.storage.readDir(currentDir);
    let updated = 0;

    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = await this.storage.stat(filePath);
      if (!stat || stat.isDirectory()) {
        continue;
      }

      const relativePath = path.relative(currentDir, filePath);
      const baselinePath = path.join(this.baseDir, 'baseline', relativePath);
      const dir = path.dirname(baselinePath);
      await this.storage.mkdir(dir);
      await this.storage.copy(filePath, baselinePath);
      updated++;
    }

    return updated;
  }

  getResults(): VisualTestResult[] {
    return Array.from(this.results.values());
  }

  getResult(testId: string): VisualTestResult | null {
    return this.results.get(testId) || null;
  }

  getSummary(): {
    total: number;
    identical: number;
    different: number;
    new: number;
    missing: number;
    regression: number;
    passRate: number;
  } {
    const all = Array.from(this.results.values());
    const counts = {
      total: all.length,
      identical: 0,
      different: 0,
      new: 0,
      missing: 0,
      regression: 0,
      passRate: 0,
    };

    for (const r of all) {
      counts[r.status]++;
    }

    const passing = counts.identical + counts.new;
    counts.passRate = counts.total > 0 ? passing / counts.total : 0;

    return counts;
  }

  async generateVisualReport(outputPath: string): Promise<string> {
    const summary = this.getSummary();
    const results = this.getResults();

    const report = {
      generatedAt: new Date().toISOString(),
      config: this.config,
      summary,
      results: results.map((r) => ({
        testId: r.testId,
        testName: r.testName,
        status: r.status,
        diffPixelRatio: r.diffPixelRatio,
        diffPixels: r.diffPixels,
        threshold: r.threshold,
        browser: r.browser,
      })),
    };

    const dir = path.dirname(outputPath);
    await this.storage.mkdir(dir);

    await this.storage.writeText(outputPath, JSON.stringify(report, null, 2));
    return outputPath;
  }

  private getBaselinePath(testId: string, browser: BrowserType): string {
    const safeId = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, 'baseline', browser, `${safeId}.png`);
  }

  private getCurrentPath(testId: string, browser: BrowserType): string {
    const safeId = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, 'current', browser, `${safeId}.png`);
  }

  private getDiffPath(testId: string, browser: BrowserType): string {
    const safeId = testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.baseDir, 'diff', browser, `${safeId}.png`);
  }
}
