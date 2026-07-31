import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Executor } from '@yuantest/executor';
import { MemoryStorage } from '@yuantest/core';

const PROGRESS_MARKER = '__PW_PROGRESS__';

vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    checkEnvironment: vi.fn().mockResolvedValue({
      nodeVersion: '18.0.0',
      nodeOk: true,
      playwrightAvailable: true,
      playwrightVersion: '1.40.0',
      playwrightOk: true,
      errors: [],
    }),
    MIN_PLAYWRIGHT_VERSION: '1.40.0',
  };
});

function makeProgressMsg(type: string, data: any): string {
  return PROGRESS_MARKER + JSON.stringify({ type, ...data }) + '\n';
}

function makeTestEndMsg(id: string, title: string, status: string, suiteTitle: string = 'Suite', retries: number = 0): string {
  return makeProgressMsg('testEnd', {
    test: {
      id, title, fullTitle: `${suiteTitle} > ${title}`, suiteTitle,
      status, duration: 100, error: status === 'failed' ? 'Error' : undefined,
      retries, browser: 'chromium', attachments: [],
    },
  });
}

function setupTracker(executor: Executor) {
  const tracker = (executor as any).progressTracker;
  tracker.currentRun = {
    id: 'test-run', status: 'running', suites: [], totalTests: 0,
    passed: 0, failed: 0, skipped: 0, flakyTests: [], metadata: {},
  };
  tracker.stderrBuffer = '';
  tracker.realtimeStats = { passed: 0, failed: 0, skipped: 0, totalTests: 0 };
  tracker.suiteIndex = new Map();
  tracker.testIndex = new Map();
  tracker.testSuiteIndex = new Map();
  return tracker;
}

describe('Progress Display Stability', () => {
  let storage: MemoryStorage;
  let config: any;
  let executor: Executor;
  let tracker: any;

  beforeEach(() => {
    storage = new MemoryStorage();
    config = {
      version: '1.0.0', testDir: './', outputDir: './test-output',
      retries: 0, timeout: 30000, workers: 1, shards: 1, browsers: ['chromium'],
    };
    executor = new Executor(config, storage);
    tracker = setupTracker(executor);
  });

  it('P-01: high-frequency progress message burst', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 100 }));

    let data = '';
    for (let i = 0; i < 100; i++) {
      data += makeTestEndMsg(`test-${i}`, `Test ${i}`, i % 3 === 0 ? 'passed' : i % 3 === 1 ? 'failed' : 'skipped');
    }
    tracker.handleData(data);

    expect(tracker.testIndex.size).toBe(100);
    expect(tracker.stats.passed + tracker.stats.failed + tracker.stats.skipped).toBe(100);
    expect(tracker.stats.totalTests).toBe(100);

    const ids = new Set<string>();
    for (const [, val] of tracker.testIndex) {
      ids.add(val.id);
    }
    expect(ids.size).toBe(100);
  });

  it('P-02: out-of-order progress messages', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 1 }));
    tracker.handleData(makeTestEndMsg('t-1', 'OutOrder', 'passed'));

    const testResult = tracker.testIndex.get('t-1');
    expect(testResult).toBeDefined();
    expect(testResult.status).toBe('passed');
    expect(testResult.title).toBe('OutOrder');
  });

  it('P-03: progress messages with missing fields', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 1 }));

    const msgNoTest = PROGRESS_MARKER + JSON.stringify({ type: 'testEnd' }) + '\n';
    expect(() => tracker.handleData(msgNoTest)).not.toThrow();

    const msgNoTotal = PROGRESS_MARKER + JSON.stringify({ type: 'begin' }) + '\n';
    expect(() => tracker.handleData(msgNoTotal)).not.toThrow();

    expect(tracker.testIndex.size).toBe(0);
  });

  it('P-04: extremely large totalTests', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 100000 }));

    expect(tracker.stats.totalTests).toBe(100000);
    expect(tracker.currentRun.totalTests).toBe(100000);

    const percentage = (tracker.stats.passed + tracker.stats.failed + tracker.stats.skipped) / tracker.stats.totalTests;
    expect(percentage).toBe(0);
    expect(isFinite(percentage)).toBe(true);
  });

  it('P-05: realtimeStats consistency', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 6 }));

    tracker.handleData(makeTestEndMsg('t-1', 'Pass1', 'passed'));
    tracker.handleData(makeTestEndMsg('t-2', 'Pass2', 'passed'));
    tracker.handleData(makeTestEndMsg('t-3', 'Fail1', 'failed'));
    tracker.handleData(makeTestEndMsg('t-4', 'Skip1', 'skipped'));
    tracker.handleData(makeTestEndMsg('t-5', 'Pass3', 'passed'));
    tracker.handleData(makeTestEndMsg('t-6', 'Fail2', 'failed'));

    const stats = tracker.stats;
    expect(stats.passed).toBe(3);
    expect(stats.failed).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.passed + stats.failed + stats.skipped).toBe(stats.totalTests);
  });

  it('P-06: stderr buffer segmented receive', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 1 }));

    const fullMsg = makeTestEndMsg('seg-1', 'Segmented', 'passed');
    const splitPoint = Math.floor(fullMsg.length / 2);

    const part1 = fullMsg.substring(0, splitPoint);
    const part2 = fullMsg.substring(splitPoint);

    tracker.handleData(part1);
    expect(tracker.testIndex.size).toBe(0);

    tracker.handleData(part2);

    expect(tracker.testIndex.size).toBe(1);
    const testResult = tracker.testIndex.get('seg-1');
    expect(testResult).toBeDefined();
    expect(testResult.title).toBe('Segmented');
    expect(testResult.status).toBe('passed');
  });

  it('P-07: mixed marker and non-marker stderr', () => {
    const outputEvents: any[] = [];
    tracker.on('output', (evt: any) => outputEvents.push(evt));

    tracker.handleData(makeProgressMsg('begin', { totalTests: 1 }));
    tracker.handleData('some random stderr line\n');
    tracker.handleData('another plain text line\n');
    tracker.handleData(makeTestEndMsg('mix-1', 'Mixed', 'passed'));
    tracker.handleData('yet another non-marker line\n');

    expect(tracker.testIndex.size).toBe(1);
    expect(tracker.testIndex.get('mix-1')).toBeDefined();
    expect(tracker.stats.passed).toBe(1);

    const nonMarkerOutput = outputEvents.filter((e: any) =>
      e.data === 'some random stderr line' ||
      e.data === 'another plain text line' ||
      e.data === 'yet another non-marker line'
    );
    expect(nonMarkerOutput.length).toBe(0);
  });

  it('P-08: stall detection trigger', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 1 }));

    const oldTimestamp = Date.now() - 310000;
    tracker.lastProgressTimestamp = oldTimestamp;

    expect(tracker.progressTimestamp).toBe(oldTimestamp);

    const elapsed = Date.now() - tracker.progressTimestamp;
    expect(elapsed).toBeGreaterThan(300000);
  });

  it('P-09: progress messages with special characters', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 1 }));

    const specialTitle = '测试\u4e2d\u6587';
    const msgWithSpecial = makeProgressMsg('testEnd', {
      test: {
        id: 'special-1',
        title: specialTitle,
        fullTitle: `Suite > ${specialTitle}`,
        suiteTitle: 'Suite',
        status: 'failed',
        duration: 100,
        error: '\x1b[31mRed Error\x1b[0m\n  at something',
        retries: 0,
        browser: 'chromium',
        attachments: [],
      },
    });

    tracker.handleData(msgWithSpecial);

    expect(tracker.testIndex.size).toBe(1);
    const testResult = tracker.testIndex.get('special-1');
    expect(testResult).toBeDefined();
    expect(testResult.title).toBe(specialTitle);
    expect(testResult.status).toBe('failed');
    expect(testResult.error).not.toContain('\x1b');
    expect(testResult.error).toContain('Red Error');
  });

  it('P-10: multiple begin messages', () => {
    tracker.handleData(makeProgressMsg('begin', { totalTests: 10 }));
    expect(tracker.stats.totalTests).toBe(10);

    tracker.handleData(makeProgressMsg('begin', { totalTests: 25 }));
    expect(tracker.stats.totalTests).toBe(25);
    expect(tracker.currentRun.totalTests).toBe(25);
  });
});
