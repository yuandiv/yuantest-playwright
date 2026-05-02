import { CausalGraphBuilder } from '../../src/flaky/causal-graph';
import { FlakyTest, RunResult, CorrelationGroup, CausalGraph, ImpactAnalysis } from '../../src/types';

function createFlakyTest(testId: string, overrides: Partial<FlakyTest> = {}): FlakyTest {
  const now = Date.now();
  return {
    testId,
    title: `Test ${testId}`,
    failureRate: 0.4,
    totalRuns: 10,
    isQuarantined: false,
    history: Array(10).fill(null).map((_, i) => ({
      timestamp: now - (10 - i) * 3600000,
      status: i % 3 === 0 ? 'failed' as const : 'passed' as const,
      duration: 1000,
      error: i % 3 === 0 ? 'timeout' : undefined,
    })),
    classification: 'flaky',
    weightedFailureRate: 0.4,
    consecutiveFailures: 0,
    consecutivePasses: 1,
    ...overrides,
  };
}

function createRunResult(testIds: string[], failedIds: string[]): RunResult {
  return {
    id: `run-${Date.now()}-${Math.random()}`,
    version: '1.0.0',
    status: 'failed',
    startTime: Date.now() - 60000,
    endTime: Date.now(),
    duration: 60000,
    suites: [{
      name: 'Suite 1',
      totalTests: testIds.length,
      passed: testIds.length - failedIds.length,
      failed: failedIds.length,
      skipped: 0,
      duration: 60000,
      tests: testIds.map((id) => ({
        id,
        title: `Test ${id}`,
        status: failedIds.includes(id) ? 'failed' as const : 'passed' as const,
        duration: 1000,
        retries: 0,
        timestamp: Date.now(),
        browser: 'chromium' as const,
      })),
      timestamp: Date.now(),
    }],
    totalTests: testIds.length,
    passed: testIds.length - failedIds.length,
    failed: failedIds.length,
    skipped: 0,
    flakyTests: [],
  };
}

describe('CausalGraphBuilder', () => {
  test('空数据构建空图', () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build([], [], []);

    expect(graph.nodes.length).toBe(0);
    expect(graph.edges.length).toBe(0);
    expect(graph.rootCauses.length).toBe(0);
  });

  test('构建测试节点', () => {
    const builder = new CausalGraphBuilder();
    const tests = [
      createFlakyTest('test-1'),
      createFlakyTest('test-2'),
    ];

    const graph = builder.build(tests, [], []);
    expect(graph.nodes.length).toBe(2);
    expect(graph.nodes[0].type).toBe('test');
    expect(graph.nodes[0].id).toBe('test-1');
  });

  test('关联组生成基础设施节点', () => {
    const builder = new CausalGraphBuilder();
    const tests = [
      createFlakyTest('test-1'),
      createFlakyTest('test-2'),
    ];

    const correlations: CorrelationGroup[] = [{
      groupId: 'corr-1',
      testIds: ['test-1', 'test-2'],
      correlationType: 'same_error_pattern',
      confidence: 0.8,
      evidence: 'test-1 and test-2 frequently fail together',
    }];

    const graph = builder.build(tests, correlations, []);
    expect(graph.nodes.length).toBeGreaterThan(2);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  test('运行结果推断依赖边', () => {
    const builder = new CausalGraphBuilder();
    const tests = [
      createFlakyTest('test-1'),
      createFlakyTest('test-2'),
      createFlakyTest('test-3'),
    ];

    const runs: RunResult[] = [];
    for (let i = 0; i < 5; i++) {
      runs.push(createRunResult(['test-1', 'test-2', 'test-3'], ['test-1', 'test-2']));
    }

    const graph = builder.build(tests, [], runs);
    expect(graph.nodes.length).toBe(3);
  });

  test('影响分析', () => {
    const builder = new CausalGraphBuilder();
    const tests = [
      createFlakyTest('test-1'),
      createFlakyTest('test-2'),
    ];

    const correlations: CorrelationGroup[] = [{
      groupId: 'corr-1',
      testIds: ['test-1', 'test-2'],
      correlationType: 'same_error_pattern',
      confidence: 0.9,
      evidence: 'correlated',
    }];

    const graph = builder.build(tests, correlations, []);
    const impact = builder.analyzeImpact('test-1', graph);

    expect(impact).not.toBeNull();
    expect(impact!.testId).toBe('test-1');
    expect(typeof impact!.totalImpact).toBe('number');
    expect(impact!.riskLevel).toMatch(/^(low|medium|high|critical)$/);
    expect(typeof impact!.recommendation).toBe('string');
  });

  test('获取根因节点', () => {
    const builder = new CausalGraphBuilder();
    const tests = [
      createFlakyTest('test-1'),
      createFlakyTest('test-2'),
    ];

    const correlations: CorrelationGroup[] = [{
      groupId: 'corr-1',
      testIds: ['test-1', 'test-2'],
      correlationType: 'same_run',
      confidence: 0.9,
      evidence: 'correlated',
    }];

    const graph = builder.build(tests, correlations, []);
    const rootCauses = builder.getRootCauses(graph);
    expect(Array.isArray(rootCauses)).toBe(true);
  });

  test('获取下游影响链', () => {
    const builder = new CausalGraphBuilder();
    const tests = [
      createFlakyTest('test-1'),
      createFlakyTest('test-2'),
    ];

    const correlations: CorrelationGroup[] = [{
      groupId: 'corr-1',
      testIds: ['test-1', 'test-2'],
      correlationType: 'same_error_pattern',
      confidence: 0.9,
      evidence: 'correlated',
    }];

    const graph = builder.build(tests, correlations, []);
    const downstream = builder.getDownstreamChain('test-1', graph);
    expect(Array.isArray(downstream)).toBe(true);
  });

  test('图包含构建时间', () => {
    const builder = new CausalGraphBuilder();
    const graph = builder.build([], [], []);
    expect(graph.builtAt).toBeGreaterThan(0);
  });
});
