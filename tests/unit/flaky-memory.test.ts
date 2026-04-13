import { FlakyTestManager } from '../../src/flaky';
import { MemoryStorage } from '../../src/storage';

describe('FlakyTestManager with MemoryStorage', () => {
  let storage: MemoryStorage;
  let manager: FlakyTestManager;

  beforeEach(async () => {
    storage = new MemoryStorage();
    manager = new FlakyTestManager('./test-data', {}, storage);
    await manager.ready();
  });

  afterEach(async () => {
    await manager.flush();
  });

  it('should record test results in memory', async () => {
    await manager.recordTestResult({
      id: 'mem-test-1',
      title: 'Memory Test 1',
      status: 'passed',
      duration: 50,
      timestamp: Date.now(),
      retries: 0,
      browser: 'chromium',
      screenshots: [],
      videos: [],
      traces: [],
      logs: [],
    });

    const test = manager.getTestById('mem-test-1');
    expect(test).toBeDefined();
    expect(test!.totalRuns).toBe(1);
    expect(test!.failureRate).toBe(0);
  });

  it('should detect flaky tests with MemoryStorage', async () => {
    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      await manager.recordTestResult({
        id: 'mem-flaky',
        title: 'Memory Flaky Test',
        status: i < 3 ? 'failed' : 'passed',
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
    const flaky = flakyTests.find(t => t.testId === 'mem-flaky');
    expect(flaky).toBeDefined();
    expect(flaky!.failureRate).toBe(0.5);
  });

  it('should quarantine and release with MemoryStorage', async () => {
    await manager.recordTestResult({
      id: 'mem-q',
      title: 'Memory Quarantine Test',
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

    expect(await manager.quarantineTest('mem-q')).toBe(true);
    expect(manager.isQuarantined('mem-q')).toBe(true);

    expect(await manager.releaseTest('mem-q')).toBe(true);
    expect(manager.isQuarantined('mem-q')).toBe(false);
  });

  it('should limit history to 50 entries', async () => {
    const now = Date.now();
    for (let i = 0; i < 60; i++) {
      await manager.recordTestResult({
        id: 'mem-history',
        title: 'History Limit Test',
        status: 'passed',
        duration: 10,
        timestamp: now + i,
        retries: 0,
        browser: 'chromium',
        screenshots: [],
        videos: [],
        traces: [],
        logs: [],
      });
    }

    const test = manager.getTestById('mem-history');
    expect(test).toBeDefined();
    expect(test!.history.length).toBe(50);
  });

  it('should clear history for specific test', async () => {
    await manager.recordTestResult({
      id: 'mem-clear-1',
      title: 'Clear Test 1',
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
      id: 'mem-clear-2',
      title: 'Clear Test 2',
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

    await manager.clearHistory('mem-clear-1');
    expect(manager.getTestById('mem-clear-1')).toBeUndefined();
    expect(manager.getTestById('mem-clear-2')).toBeDefined();
  });

  it('should clear all history', async () => {
    await manager.recordTestResult({
      id: 'mem-all-1',
      title: 'All Clear 1',
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
      id: 'mem-all-2',
      title: 'All Clear 2',
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

    await manager.clearHistory();
    expect(manager.getTestById('mem-all-1')).toBeUndefined();
    expect(manager.getTestById('mem-all-2')).toBeUndefined();
    expect(manager.getAllFlakyTests().length).toBe(0);
  });
});
