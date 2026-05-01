import { FlakyTestManager } from '../../src/flaky';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FlakyTestManager', () => {
  let tmpDir: string;
  let manager: FlakyTestManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-test-'));
    manager = new FlakyTestManager(tmpDir);
    await manager.ready();
  });

  afterEach(async () => {
    await manager.flush();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('should record a single test result', async () => {
    await manager.recordTestResult({
      id: 'test-1',
      title: 'Test 1',
      status: 'passed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    const test = manager.getTestById('test-1');
    expect(test).toBeDefined();
    expect(test!.totalRuns).toBe(1);
    expect(test!.failureRate).toBe(0);
    expect(test!.classification).toBe('insufficient_data');
    expect(test!.weightedFailureRate).toBe(0);
    expect(test!.consecutiveFailures).toBe(0);
    expect(test!.consecutivePasses).toBe(1);
  });

  it('should detect flaky tests based on weighted failure rate', async () => {
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      await manager.recordTestResult({
        id: 'test-flaky',
        title: 'Flaky Test',
        status: i % 2 === 0 ? 'failed' : 'passed',
        duration: 100,
        timestamp: now + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    const flakyTests = manager.getFlakyTests(0.3);
    expect(flakyTests.length).toBeGreaterThan(0);
    const flaky = flakyTests.find(t => t.testId === 'test-flaky');
    expect(flaky).toBeDefined();
    expect(flaky!.failureRate).toBe(0.5);
    expect(flaky!.classification).toBe('flaky');
    expect(flaky!.weightedFailureRate).toBeGreaterThan(0);
  });

  it('should classify broken tests and not include them in flaky list', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await manager.recordTestResult({
        id: 'test-broken',
        title: 'Broken Test',
        status: 'failed',
        duration: 100,
        timestamp: now + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    const brokenTest = manager.getTestById('test-broken');
    expect(brokenTest).toBeDefined();
    expect(brokenTest!.classification).toBe('broken');
    expect(brokenTest!.consecutiveFailures).toBe(5);

    const flakyTests = manager.getFlakyTests(0.1);
    const brokenInFlaky = flakyTests.find(t => t.testId === 'test-broken');
    expect(brokenInFlaky).toBeUndefined();
  });

  it('should quarantine and release tests', async () => {
    await manager.recordTestResult({
      id: 'test-q',
      title: 'Quarantine Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    expect(await manager.quarantineTest('test-q')).toBe(true);
    expect(manager.isQuarantined('test-q')).toBe(true);
    expect(manager.getQuarantinedTests().length).toBe(1);

    expect(await manager.releaseTest('test-q')).toBe(true);
    expect(manager.isQuarantined('test-q')).toBe(false);
    expect(manager.getQuarantinedTests().length).toBe(0);
  });

  it('should not quarantine non-existent tests', async () => {
    expect(await manager.quarantineTest('non-existent')).toBe(false);
  });

  it('should persist and reload history', async () => {
    await manager.recordTestResult({
      id: 'test-persist',
      title: 'Persist Test',
      status: 'failed',
      duration: 200,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });
    await manager.flush();

    const manager2 = new FlakyTestManager(tmpDir);
    await manager2.ready();
    const test = manager2.getTestById('test-persist');
    expect(test).toBeDefined();
    expect(test!.totalRuns).toBe(1);
    expect(test!.failureRate).toBe(1);
    expect(test!.classification).toBeDefined();
    expect(test!.weightedFailureRate).toBeDefined();
    await manager2.flush();
  });

  it('should return correct quarantine stats with classification breakdown', async () => {
    const now = Date.now();
    await manager.recordTestResult({ id: 't1', title: 'T1', status: 'passed', duration: 100, timestamp: now, retries: 0, browser: 'chromium', screenshots: [], videos: [], traces: [], logs: [] });
    await manager.recordTestResult({ id: 't2', title: 'T2', status: 'failed', duration: 100, timestamp: now, retries: 0, browser: 'chromium', screenshots: [], videos: [], traces: [], logs: [] });
    await manager.recordTestResult({ id: 't2', title: 'T2', status: 'passed', duration: 100, timestamp: now + 1, retries: 0, browser: 'chromium', screenshots: [], videos: [], traces: [], logs: [] });
    await manager.quarantineTest('t2');

    const stats = manager.getQuarantineStats();
    expect(stats.totalTests).toBe(2);
    expect(stats.quarantined).toBe(1);
    expect(stats.flakyRate).toBeGreaterThan(0);
    expect(stats.classificationBreakdown).toBeDefined();
    expect(stats.classificationBreakdown.insufficient_data).toBeGreaterThanOrEqual(0);
  });

  it('should not auto-quarantine with fewer than minimum runs', async () => {
    const autoManager = new FlakyTestManager(tmpDir, {
      autoQuarantine: true,
      minimumRuns: 5,
    });
    await autoManager.ready();

    for (let i = 0; i < 3; i++) {
      await autoManager.recordTestResult({
        id: 'test-min',
        title: 'Min Runs Test',
        status: i % 2 === 0 ? 'failed' : 'passed',
        duration: 100,
        timestamp: Date.now() + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    expect(autoManager.isQuarantined('test-min')).toBe(false);

    for (let i = 3; i < 8; i++) {
      await autoManager.recordTestResult({
        id: 'test-min',
        title: 'Min Runs Test',
        status: i % 2 === 0 ? 'failed' : 'passed',
        duration: 100,
        timestamp: Date.now() + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    expect(autoManager.isQuarantined('test-min')).toBe(true);
    await autoManager.flush();
  });

  it('should auto-release after consecutive passes', async () => {
    const autoManager = new FlakyTestManager(tmpDir, {
      autoQuarantine: true,
      minimumRuns: 3,
      autoReleaseAfterPasses: 3,
    });
    await autoManager.ready();

    for (let i = 0; i < 6; i++) {
      await autoManager.recordTestResult({
        id: 'test-auto-release',
        title: 'Auto Release Test',
        status: i % 2 === 0 ? 'failed' : 'passed',
        duration: 100,
        timestamp: Date.now() + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    expect(autoManager.isQuarantined('test-auto-release')).toBe(true);

    for (let i = 0; i < 3; i++) {
      await autoManager.recordTestResult({
        id: 'test-auto-release',
        title: 'Auto Release Test',
        status: 'passed',
        duration: 100,
        timestamp: Date.now() + 10 + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    expect(autoManager.isQuarantined('test-auto-release')).toBe(false);

    const test = autoManager.getTestById('test-auto-release');
    expect(test!.failureRate).toBe(0);
    expect(test!.classification).toBe('insufficient_data');

    await autoManager.flush();
  });

  it('should reset consecutive passes on failure during quarantine', async () => {
    const autoManager = new FlakyTestManager(tmpDir, {
      autoQuarantine: true,
      minimumRuns: 3,
      autoReleaseAfterPasses: 3,
    });
    await autoManager.ready();

    for (let i = 0; i < 6; i++) {
      await autoManager.recordTestResult({
        id: 'test-reset',
        title: 'Reset Test',
        status: i % 2 === 0 ? 'failed' : 'passed',
        duration: 100,
        timestamp: Date.now() + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    expect(autoManager.isQuarantined('test-reset')).toBe(true);

    await autoManager.recordTestResult({
      id: 'test-reset',
      title: 'Reset Test',
      status: 'passed',
      duration: 100,
      timestamp: Date.now() + 10,
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await autoManager.recordTestResult({
      id: 'test-reset',
      title: 'Reset Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now() + 11,
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    const test = autoManager.getTestById('test-reset');
    expect(test!.consecutivePassesSinceQuarantine).toBe(0);
    expect(autoManager.isQuarantined('test-reset')).toBe(true);

    await autoManager.flush();
  });

  it('should release with resetHistory option', async () => {
    await manager.recordTestResult({
      id: 'test-release-reset',
      title: 'Release Reset Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-release-reset');
    expect(manager.isQuarantined('test-release-reset')).toBe(true);

    await manager.releaseTest('test-release-reset', { resetHistory: true });
    expect(manager.isQuarantined('test-release-reset')).toBe(false);

    const test = manager.getTestById('test-release-reset');
    expect(test!.history).toHaveLength(0);
    expect(test!.failureRate).toBe(0);
    expect(test!.totalRuns).toBe(0);
    expect(test!.classification).toBe('insufficient_data');
    expect(test!.weightedFailureRate).toBe(0);
  });

  it('should release without resetHistory by default', async () => {
    await manager.recordTestResult({
      id: 'test-release-no-reset',
      title: 'Release No Reset Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-release-no-reset');
    await manager.releaseTest('test-release-no-reset');

    const test = manager.getTestById('test-release-no-reset');
    expect(test!.history).toHaveLength(1);
    expect(test!.failureRate).toBe(1);
  });

  it('should record quarantinedAt timestamp', async () => {
    await manager.recordTestResult({
      id: 'test-ts',
      title: 'Timestamp Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    const beforeQuarantine = Date.now();
    await manager.quarantineTest('test-ts');
    const afterQuarantine = Date.now();

    const test = manager.getTestById('test-ts');
    expect(test!.quarantinedAt).toBeGreaterThanOrEqual(beforeQuarantine);
    expect(test!.quarantinedAt).toBeLessThanOrEqual(afterQuarantine);
  });

  it('should detect expired quarantine', async () => {
    await manager.recordTestResult({
      id: 'test-expired',
      title: 'Expired Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-expired');

    expect(manager.isQuarantineExpired('test-expired')).toBe(false);

    const test = manager.getTestById('test-expired');
    test!.quarantinedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;

    expect(manager.isQuarantineExpired('test-expired')).toBe(true);
  });

  it('should return expired quarantined tests', async () => {
    await manager.recordTestResult({
      id: 'test-expired-list',
      title: 'Expired List Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.recordTestResult({
      id: 'test-not-expired',
      title: 'Not Expired Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-expired-list');
    await manager.quarantineTest('test-not-expired');

    const expiredTest = manager.getTestById('test-expired-list');
    expiredTest!.quarantinedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;

    const expired = manager.getExpiredQuarantinedTests();
    expect(expired.length).toBe(1);
    expect(expired[0].testId).toBe('test-expired-list');
  });

  it('should build grep invert pattern from quarantined test titles', async () => {
    await manager.recordTestResult({
      id: 'test-grep-1',
      title: 'Login Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.recordTestResult({
      id: 'test-grep-2',
      title: 'Logout Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    expect(manager.buildGrepInvertPattern()).toBeNull();

    await manager.quarantineTest('test-grep-1');
    await manager.quarantineTest('test-grep-2');

    const pattern = manager.buildGrepInvertPattern();
    expect(pattern).toContain('Login Test');
    expect(pattern).toContain('Logout Test');
    expect(pattern).toContain('|');
  });

  it('should escape special regex chars in grep invert pattern', async () => {
    await manager.recordTestResult({
      id: 'test-regex',
      title: 'Test (with special + chars*)',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-regex');

    const pattern = manager.buildGrepInvertPattern();
    expect(pattern).toContain('\\(');
    expect(pattern).toContain('\\)');
    expect(pattern).toContain('\\+');
    expect(pattern).toContain('\\*');
  });

  it('should return quarantined test titles', async () => {
    await manager.recordTestResult({
      id: 'test-title-1',
      title: 'My Test Title',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-title-1');

    const titles = manager.getQuarantinedTestTitles();
    expect(titles).toEqual(['My Test Title']);
  });

  it('should include expiredQuarantined in stats', async () => {
    await manager.recordTestResult({
      id: 'test-stats-exp',
      title: 'Stats Expired Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-stats-exp');

    const test = manager.getTestById('test-stats-exp');
    test!.quarantinedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;

    const stats = manager.getQuarantineStats();
    expect(stats.expiredQuarantined).toBe(1);
  });

  it('should clear quarantinedAt and consecutivePasses on release', async () => {
    await manager.recordTestResult({
      id: 'test-clear-fields',
      title: 'Clear Fields Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    await manager.quarantineTest('test-clear-fields');

    await manager.recordTestResult({
      id: 'test-clear-fields',
      title: 'Clear Fields Test',
      status: 'passed',
      duration: 100,
      timestamp: Date.now() + 1,
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    const testBeforeRelease = manager.getTestById('test-clear-fields');
    expect(testBeforeRelease!.quarantinedAt).toBeDefined();
    expect(testBeforeRelease!.consecutivePassesSinceQuarantine).toBe(1);

    await manager.releaseTest('test-clear-fields');

    const testAfterRelease = manager.getTestById('test-clear-fields');
    expect(testAfterRelease!.quarantinedAt).toBeUndefined();
    expect(testAfterRelease!.consecutivePassesSinceQuarantine).toBe(0);
  });

  it('should perform root cause analysis', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await manager.recordTestResult({
        id: 'test-rc',
        title: 'Root Cause Test',
        status: i % 2 === 0 ? 'failed' : 'passed',
        duration: 100,
        timestamp: now + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
        error: i % 2 === 0 ? 'Timeout waiting for selector' : undefined,
      });
    }

    const analysis = await manager.analyzeRootCause('test-rc');
    expect(analysis).toBeDefined();
    expect(analysis!.testId).toBe('test-rc');
    expect(analysis!.primaryCause).toBeDefined();
    expect(analysis!.evidence.length).toBeGreaterThan(0);
    expect(analysis!.suggestedActions.length).toBeGreaterThan(0);
  });

  it('should return null for root cause analysis of non-existent test', async () => {
    const analysis = await manager.analyzeRootCause('non-existent');
    expect(analysis).toBeNull();
  });

  it('should get tests by classification', async () => {
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await manager.recordTestResult({
        id: 'test-broken-cls',
        title: 'Broken Classification Test',
        status: 'failed',
        duration: 100,
        timestamp: now + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    const brokenTests = manager.getTestsByClassification('broken');
    expect(brokenTests.length).toBeGreaterThan(0);
    expect(brokenTests[0].classification).toBe('broken');
  });

  it('should not auto-quarantine broken tests', async () => {
    const autoManager = new FlakyTestManager(tmpDir, {
      autoQuarantine: true,
      minimumRuns: 3,
    });
    await autoManager.ready();

    for (let i = 0; i < 5; i++) {
      await autoManager.recordTestResult({
        id: 'test-no-auto-q',
        title: 'No Auto Quarantine Test',
        status: 'failed',
        duration: 100,
        timestamp: Date.now() + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    const test = autoManager.getTestById('test-no-auto-q');
    expect(test!.classification).toBe('broken');
    expect(autoManager.isQuarantined('test-no-auto-q')).toBe(false);

    await autoManager.flush();
  });

  it('should analyze correlations', async () => {
    const result = manager.analyzeCorrelations();
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return null for root cause when disabled', async () => {
    const disabledManager = new FlakyTestManager(tmpDir, {
      enableRootCauseAnalysis: false,
    });
    await disabledManager.ready();

    await disabledManager.recordTestResult({
      id: 'test-disabled-rc',
      title: 'Disabled RC Test',
      status: 'failed',
      duration: 100,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    const analysis = await disabledManager.analyzeRootCause('test-disabled-rc');
    expect(analysis).toBeNull();

    await disabledManager.flush();
  });
});
