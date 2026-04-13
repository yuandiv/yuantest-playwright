import { Orchestrator, ShardOptimizer } from '../src/orchestrator';
import { Executor } from '../src/executor';
import { Reporter } from '../src/reporter';
import { FlakyTestManager } from '../src/flaky';
import { RealtimeReporter } from '../src/realtime';
import { DashboardServer } from '../src/ui/server';
import { TestConfig, TestResult, RunResult, SuiteResult, BrowserType } from '../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const TEST_DATA_DIR = './test-sandbox';
const REPORTS_DIR = path.join(TEST_DATA_DIR, 'reports');
const DATA_DIR = path.join(TEST_DATA_DIR, 'data');

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition: boolean, message: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message}`);
  }
}

function assertEqual(actual: any, expected: any, message: string) {
  total++;
  if (actual === expected) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message} (expected: ${expected}, got: ${actual})`);
  }
}

function assertIncludes(arr: any[], item: any, message: string) {
  total++;
  if (arr.includes(item)) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    console.log(`  ❌ ${message} (item not found in array)`);
  }
}

function generateMockTestResult(id: string, title: string, status: TestResult['status'], browser: BrowserType = 'chromium'): TestResult {
  return {
    id,
    title,
    status,
    duration: Math.floor(Math.random() * 5000) + 500,
    retries: status === 'failed' ? Math.floor(Math.random() * 3) : 0,
    timestamp: Date.now() - Math.floor(Math.random() * 86400000),
    browser,
    screenshots: status === 'failed' ? ['screenshot1.png'] : [],
    error: status === 'failed' ? getRandomError() : undefined,
  };
}

function getRandomError(): string {
  const errors = [
    'Error: expect(received).toBe(expected) // Object.is equality\n  Expected: "Dashboard"\n  Received: "Error Page"',
    'Error: Timeout 30000ms exceeded waiting for selector ".user-profile"',
    'Error: net::ERR_CONNECTION_REFUSED at http://localhost:3000/api/users',
    'Error: locator.click: Target closed\n  Waiting for locator(\'button.submit\')',
    'Error: expect(received).toHaveText(expected)\n  Expected string: "Welcome back"\n  Received string: "Please login"',
  ];
  return errors[Math.floor(Math.random() * errors.length)];
}

function generateMockRunResult(id: string, version: string, status: RunResult['status'] = 'success'): RunResult {
  const suites: SuiteResult[] = [
    {
      name: 'Login Page',
      totalTests: 4,
      passed: 3,
      failed: 1,
      skipped: 0,
      duration: 12000,
      timestamp: Date.now() - 3600000,
      tests: [
        generateMockTestResult('login-1', 'should display login form', 'passed'),
        generateMockTestResult('login-2', 'should login with valid credentials', 'passed'),
        generateMockTestResult('login-3', 'should show error with invalid credentials', 'failed'),
        generateMockTestResult('login-4', 'should navigate to forgot password', 'passed'),
      ],
    },
    {
      name: 'Dashboard Page',
      totalTests: 5,
      passed: 4,
      failed: 1,
      skipped: 0,
      duration: 18000,
      timestamp: Date.now() - 3500000,
      tests: [
        generateMockTestResult('dash-1', 'should display welcome message', 'passed'),
        generateMockTestResult('dash-2', 'should display navigation menu', 'passed'),
        generateMockTestResult('dash-3', 'should display user statistics', 'failed'),
        generateMockTestResult('dash-4', 'should navigate to profile page', 'passed'),
        generateMockTestResult('dash-5', 'should display recent activity', 'passed'),
      ],
    },
    {
      name: 'User Management',
      totalTests: 6,
      passed: 5,
      failed: 0,
      skipped: 1,
      duration: 25000,
      timestamp: Date.now() - 3400000,
      tests: [
        generateMockTestResult('user-1', 'should display users table', 'passed'),
        generateMockTestResult('user-2', 'should search users by name', 'passed'),
        generateMockTestResult('user-3', 'should add new user', 'passed'),
        generateMockTestResult('user-4', 'should edit existing user', 'passed'),
        generateMockTestResult('user-5', 'should delete user with confirmation', 'skipped'),
        generateMockTestResult('user-6', 'should paginate users list', 'passed'),
      ],
    },
    {
      name: 'Shopping Cart',
      totalTests: 6,
      passed: 4,
      failed: 2,
      skipped: 0,
      duration: 20000,
      timestamp: Date.now() - 3300000,
      tests: [
        generateMockTestResult('cart-1', 'should display product list', 'passed'),
        generateMockTestResult('cart-2', 'should add product to cart', 'passed'),
        generateMockTestResult('cart-3', 'should update cart quantity', 'failed'),
        generateMockTestResult('cart-4', 'should remove item from cart', 'passed'),
        generateMockTestResult('cart-5', 'should proceed to checkout', 'failed'),
        generateMockTestResult('cart-6', 'should apply discount code', 'passed'),
      ],
    },
    {
      name: 'API Endpoints',
      totalTests: 6,
      passed: 5,
      failed: 1,
      skipped: 0,
      duration: 8000,
      timestamp: Date.now() - 3200000,
      tests: [
        generateMockTestResult('api-1', 'GET /api/users should return 200', 'passed'),
        generateMockTestResult('api-2', 'POST /api/users should create user', 'passed'),
        generateMockTestResult('api-3', 'GET /api/users/:id should return user', 'passed'),
        generateMockTestResult('api-4', 'PUT /api/users/:id should update user', 'passed'),
        generateMockTestResult('api-5', 'DELETE /api/users/:id should delete user', 'failed'),
        generateMockTestResult('api-6', 'GET /api/products should support pagination', 'passed'),
      ],
    },
  ];

  const totalTests = suites.reduce((s, suite) => s + suite.totalTests, 0);
  const passed = suites.reduce((s, suite) => s + suite.passed, 0);
  const failedCount = suites.reduce((s, suite) => s + suite.failed, 0);
  const skipped = suites.reduce((s, suite) => s + suite.skipped, 0);

  const allFailedTests = suites.flatMap((s: SuiteResult) => s.tests.filter((t: TestResult) => t.status === 'failed'));

  return {
    id,
    version,
    status,
    startTime: Date.now() - 3600000,
    endTime: Date.now(),
    duration: 83000,
    suites,
    totalTests,
    passed,
    failed: failedCount,
    skipped,
    flakyTests: allFailedTests.slice(0, 2),
  };
}

async function cleanup() {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function testOrchestrator() {
  console.log('\n📋 Testing Orchestrator...');

  const config: TestConfig = {
    version: 'test-project',
    testDir: './tests',
    outputDir: REPORTS_DIR,
    shards: 4,
    workers: 2,
    timeout: 30000,
    retries: 2,
    browsers: ['chromium', 'firefox'],
  };

  const orchestrator = new Orchestrator(config);

  assertEqual(orchestrator.getConfig().version, 'test-project', 'Config version should be set');
  assertEqual(orchestrator.getConfig().shards, 4, 'Config shards should be 4');
  assertEqual(orchestrator.getConfig().browsers?.length, 2, 'Config browsers should have 2 items');

  const valid = await orchestrator.validateConfig();
  assert(valid, 'Config validation should pass');

  const orchestration = await orchestrator.orchestrate();
  assert(orchestration.totalShards === 4, 'Orchestration should have 4 shards');
  assert(orchestration.testAssignment.length >= 5, `Should discover at least 5 test files (found: ${orchestration.testAssignment.length})`);
  assert(orchestration.strategy === 'distributed', 'Strategy should be distributed');

  const pwConfig = await orchestrator.createPlaywrightConfig();
  assert(pwConfig.testDir === './tests', 'Playwright config testDir should match');
  assert(pwConfig.timeout === 30000, 'Playwright config timeout should match');
  assert(pwConfig.retries === 2, 'Playwright config retries should match');

  const optimizer = new ShardOptimizer();
  const optimized = await optimizer.optimize(orchestration.testAssignment, 4);
  assert(optimized.size === 4, 'Optimized should have 4 shards');
  let totalAssigned = 0;
  optimized.forEach((tests: any[]) => { totalAssigned += tests.length; });
  assertEqual(totalAssigned, orchestration.testAssignment.length, 'All tests should be assigned after optimization');

  console.log(`  📊 Discovered ${orchestration.testAssignment.length} test files across ${orchestration.totalShards} shards`);
}

async function testFlakyManager() {
  console.log('\n🐌 Testing Flaky Test Manager...');

  const manager = new FlakyTestManager(DATA_DIR, { threshold: 0.3, autoQuarantine: false });

  assertEqual(manager.getConfig().threshold, 0.3, 'Default threshold should be 0.3');

  const run1 = generateMockRunResult('run_001', 'project-a');
  const run2 = generateMockRunResult('run_002', 'project-a');
  const run3 = generateMockRunResult('run_003', 'project-a');

  manager.recordRunResults(run1);
  manager.recordRunResults(run2);
  manager.recordRunResults(run3);

  const allFlaky = manager.getAllFlakyTests();
  assert(allFlaky.length > 0, `Should detect flaky tests (found: ${allFlaky.length})`);

  const flakyAbove30 = manager.getFlakyTests(0.3);
  assert(flakyAbove30.length > 0, `Should have flaky tests above 30% threshold (found: ${flakyAbove30.length})`);

  if (flakyAbove30.length > 0) {
    const testId = flakyAbove30[0].testId;
    const test = manager.getTestById(testId);
    assert(test !== undefined, `Should find test by id: ${testId}`);
    assert(test!.history.length >= 3, `Test should have at least 3 history entries (has: ${test!.history.length})`);

    const quarantined = manager.quarantineTest(testId);
    assert(quarantined, 'Should quarantine test successfully');
    assert(manager.isQuarantined(testId), 'Test should be quarantined');

    const quarantinedTests = manager.getQuarantinedTests();
    assert(quarantinedTests.length > 0, 'Should have quarantined tests');

    const released = manager.releaseTest(testId);
    assert(released, 'Should release test successfully');
    assert(!manager.isQuarantined(testId), 'Test should not be quarantined after release');

    const skipList = manager.getTestsToSkip();
    assert(!skipList.includes(testId), 'Released test should not be in skip list');
  }

  const stats = manager.getQuarantineStats();
  assert(stats.totalTests > 0, `Stats totalTests should be > 0 (got: ${stats.totalTests})`);
  assert(typeof stats.flakyRate === 'number', 'Stats flakyRate should be a number');
  assert(Array.isArray(stats.topFlaky), 'Stats topFlaky should be an array');

  manager.clearHistory();
  const cleared = manager.getAllFlakyTests();
  assertEqual(cleared.length, 0, 'Should have no flaky tests after clearing history');
}

async function testReporter() {
  console.log('\n📊 Testing Reporter...');

  const reporter = new Reporter(REPORTS_DIR);

  const run1 = generateMockRunResult('run_20240315_100000_abc', 'project-alpha', 'success');
  const run2 = generateMockRunResult('run_20240315_110000_def', 'project-beta', 'failed');
  const run3 = generateMockRunResult('run_20240315_120000_ghi', 'project-alpha', 'success');

  const reportPath1 = await reporter.generateReport(run1);
  assert(fs.existsSync(reportPath1), `HTML report should exist: ${reportPath1}`);

  const jsonPath = path.join(REPORTS_DIR, 'run_20240315_100000_abc.json');
  assert(fs.existsSync(jsonPath), `JSON report should exist: ${jsonPath}`);

  const htmlContent = fs.readFileSync(reportPath1, 'utf-8');
  assert(htmlContent.includes('project-alpha'), 'HTML report should contain project name');
  assert(htmlContent.includes('<!DOCTYPE html>'), 'HTML report should be valid HTML');

  const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  assertEqual(jsonContent.id, 'run_20240315_100000_abc', 'JSON report should have correct run id');
  assertEqual(jsonContent.totalTests, run1.totalTests, 'JSON report should have correct totalTests');

  await reporter.generateReport(run2);
  await reporter.generateReport(run3);

  const fetched = await reporter.getReport('run_20240315_110000_def');
  assert(fetched !== null, 'Should fetch report by id');
  assertEqual(fetched!.status, 'failed', 'Fetched report should have correct status');

  const allReports = await reporter.getAllReports();
  assertEqual(allReports.length, 3, 'Should have 3 reports');

  const dashboard = await reporter.generateDashboard();
  assertEqual(dashboard.totalRuns, 3, 'Dashboard should show 3 total runs');
  assert(dashboard.passRate > 0, 'Dashboard passRate should be > 0');
  assert(dashboard.avgDuration > 0, 'Dashboard avgDuration should be > 0');

  const analysis = await reporter.analyzeFailures(run1);
  assert(analysis.length > 0, `Should analyze failures (found: ${analysis.length})`);
  if (analysis.length > 0) {
    const first = analysis[0];
    assert(['assertion', 'timeout', 'network', 'selector', 'unknown'].includes(first.category),
      `Failure category should be valid (got: ${first.category})`);
    assert(first.suggestions.length > 0, 'Failure analysis should have suggestions');
    assert(typeof first.lastOccurrence === 'number', 'Failure analysis should have lastOccurrence');
    assert(typeof first.title === 'string', 'Failure analysis should have title');
  }

  const notFound = await reporter.getReport('nonexistent');
  assert(notFound === null, 'Should return null for nonexistent report');
}

async function testRealtimeReporter() {
  console.log('\n📡 Testing Realtime Reporter...');

  const realtime = new RealtimeReporter();
  assertEqual(realtime.getConnectedClients(), 0, 'Should have 0 connected clients initially');
  assertEqual(realtime.getAllProgress().length, 0, 'Should have no progress initially');

  const mockServer = {
    on: (event: string, cb: Function) => {},
  } as any;

  realtime.initialize(mockServer);
  assertEqual(realtime.getConnectedClients(), 0, 'Should still have 0 clients after init (no real WS)');

  const runId = 'test-run-001';
  realtime.broadcastRunStarted(runId, 'test-project');
  const progress = realtime.getProgress(runId);
  assert(progress !== undefined, 'Should have progress after run started');
  assertEqual(progress!.status, 'running', 'Progress status should be running');
  assertEqual(progress!.progress, 0, 'Progress should be 0%');

  const mockTest: TestResult = {
    id: 'test-1',
    title: 'should pass',
    status: 'passed',
    duration: 1000,
    retries: 0,
    timestamp: Date.now(),
    browser: 'chromium',
  };
  realtime.broadcastTestResult(runId, mockTest);
  const updatedProgress = realtime.getProgress(runId);
  assertEqual(updatedProgress!.passed, 1, 'Should have 1 passed test');
  assertEqual(updatedProgress!.progress, 1, 'Progress should be 1%');

  const mockFailedTest: TestResult = {
    id: 'test-2',
    title: 'should fail',
    status: 'failed',
    duration: 2000,
    retries: 1,
    timestamp: Date.now(),
    browser: 'chromium',
    error: 'Timeout exceeded',
  };
  realtime.broadcastTestResult(runId, mockFailedTest);
  const afterFail = realtime.getProgress(runId);
  assertEqual(afterFail!.failed, 1, 'Should have 1 failed test');
  assertIncludes(afterFail!.flakyTests, 'test-2', 'Failed test should be in flakyTests list');

  realtime.broadcastSuiteCompleted(runId, 'Login Page');

  const mockRunResult = generateMockRunResult(runId, 'test-project');
  realtime.broadcastRunCompleted(runId, mockRunResult);
  const completed = realtime.getProgress(runId);
  assertEqual(completed!.status, 'completed', 'Progress status should be completed');
  assertEqual(completed!.progress, 100, 'Progress should be 100%');

  realtime.broadcastFlakyDetected(runId, mockFailedTest);
  realtime.broadcastError(runId, 'Something went wrong');

  realtime.shutdown();
  assertEqual(realtime.getConnectedClients(), 0, 'Should have 0 clients after shutdown');
}

async function testDashboardServer() {
  console.log('\n🌐 Testing Dashboard Server...');

  const server = new DashboardServer(3099, REPORTS_DIR, DATA_DIR);
  await server.start();

  const fetchJSON = (url: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      }).on('error', reject);
    });
  };

  const health = await fetchJSON('http://localhost:3099/api/health');
  assertEqual(health.status, 'ok', 'Health endpoint should return ok');
  assert(typeof health.uptime === 'number', 'Health should include uptime');

  const stats = await fetchJSON('http://localhost:3099/api/stats');
  assert(stats.totalRuns >= 3, `Stats should have at least 3 runs (got: ${stats.totalRuns})`);
  assert(stats.totalTests > 0, `Stats should have totalTests > 0 (got: ${stats.totalTests})`);
  assert(typeof stats.quarantinedTests === 'number', 'Stats should include quarantinedTests');

  const runs = await fetchJSON('http://localhost:3099/api/runs');
  assert(Array.isArray(runs), 'Runs endpoint should return array');
  assert(runs.length > 0, 'Runs should not be empty');

  const flaky = await fetchJSON('http://localhost:3099/api/flaky');
  assert(Array.isArray(flaky), 'Flaky endpoint should return array');

  const quarantined = await fetchJSON('http://localhost:3099/api/flaky/quarantined');
  assert(Array.isArray(quarantined), 'Quarantined endpoint should return array');

  const flakyStats = await fetchJSON('http://localhost:3099/api/flaky/stats');
  assert(typeof flakyStats.totalTests === 'number', 'Flaky stats should have totalTests');
  assert(Array.isArray(flakyStats.topFlaky), 'Flaky stats should have topFlaky');

  const analysis = await fetchJSON('http://localhost:3099/api/analysis/run_20240315_100000_abc');
  assert(Array.isArray(analysis), 'Analysis endpoint should return array');
  assert(analysis.length > 0, 'Analysis should have results');

  const progress = await fetchJSON('http://localhost:3099/api/progress');
  assert(Array.isArray(progress), 'Progress endpoint should return array');

  const indexPage: any = await fetchJSON('http://localhost:3099/');
  const indexStr = typeof indexPage === 'string' ? indexPage : JSON.stringify(indexPage);
  assert(indexStr.includes('YuanTest'), 'Index page should contain YuanTest');

  await server.stop();
}

async function testCLIViaAPI() {
  console.log('\n💻 Testing CLI Integration (via modules)...');

  const config: TestConfig = {
    version: 'cli-test',
    testDir: './tests',
    outputDir: REPORTS_DIR,
    shards: 2,
  };

  const orchestrator = new Orchestrator(config);
  await orchestrator.initialize();
  const plan = await orchestrator.orchestrate();
  assert(plan.testAssignment.length > 0, 'CLI orchestrate should discover tests');

  const reporter = new Reporter(REPORTS_DIR);
  const mockRun = generateMockRunResult('cli_run_001', 'cli-test');
  await reporter.generateReport(mockRun);

  const fetched = await reporter.getReport('cli_run_001');
  assert(fetched !== null, 'CLI generated report should be fetchable');
  assertEqual(fetched!.version, 'cli-test', 'CLI report should have correct version');

  const flakyManager = new FlakyTestManager(DATA_DIR);
  flakyManager.recordRunResults(mockRun);
  const stats = flakyManager.getQuarantineStats();
  assert(typeof stats.totalTests === 'number', 'CLI flaky stats should work');
}

async function main() {
  console.log('🚀 YuanTest Deep Verification');
  console.log('='.repeat(50));

  await cleanup();

  try {
    await testOrchestrator();
    await testFlakyManager();
    await testReporter();
    await testRealtimeReporter();
    await testDashboardServer();
    await testCLIViaAPI();
  } catch (error: any) {
    console.error(`\n💥 Test suite crashed: ${error.message}`);
    console.error(error.stack);
    failed++;
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\n🎯 Results: ${chalk.green(`${passed} passed`)}, ${failed > 0 ? chalk.red(`${failed} failed`) : chalk.green('0 failed')}, ${total} total`);
  console.log(`\n📁 Test data in: ${TEST_DATA_DIR}`);
  console.log(`📊 Reports in: ${REPORTS_DIR}`);

  if (failed > 0) {
    process.exit(1);
  }
}

import chalk from 'chalk';
main();
