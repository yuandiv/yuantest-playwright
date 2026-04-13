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
  });

  it('should detect flaky tests based on threshold', async () => {
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
    await manager2.flush();
  });

  it('should return correct quarantine stats', async () => {
    const now = Date.now();
    await manager.recordTestResult({ id: 't1', title: 'T1', status: 'passed', duration: 100, timestamp: now, retries: 0, browser: 'chromium', screenshots: [], videos: [], traces: [], logs: [] });
    await manager.recordTestResult({ id: 't2', title: 'T2', status: 'failed', duration: 100, timestamp: now, retries: 0, browser: 'chromium', screenshots: [], videos: [], traces: [], logs: [] });
    await manager.recordTestResult({ id: 't2', title: 'T2', status: 'passed', duration: 100, timestamp: now + 1, retries: 0, browser: 'chromium', screenshots: [], videos: [], traces: [], logs: [] });
    await manager.quarantineTest('t2');

    const stats = manager.getQuarantineStats();
    expect(stats.totalTests).toBe(2);
    expect(stats.quarantined).toBe(1);
    expect(stats.flakyRate).toBeGreaterThan(0);
  });
});
