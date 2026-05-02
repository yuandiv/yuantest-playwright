import {
  FlakyTest,
  RunResult,
  CausalNode,
  CausalEdge,
  CausalGraph,
  ImpactAnalysis,
  CorrelationGroup,
  RootCauseType,
} from '../types';
import { FLAKY_CONFIG } from '../constants';

/** 因果图构建配置 */
export interface CausalGraphConfig {
  minCorrelation: number;
  maxDepth: number;
}

/** 默认因果图配置 */
const DEFAULT_CAUSAL_CONFIG: CausalGraphConfig = {
  minCorrelation: FLAKY_CONFIG.CAUSAL_MIN_CORRELATION,
  maxDepth: FLAKY_CONFIG.CAUSAL_MAX_DEPTH,
};

/**
 * 从测试列表构建因果节点
 * 将每个 Flaky 测试转换为因果图节点
 * @param tests - Flaky 测试列表
 * @returns 因果节点数组
 */
function buildTestNodes(tests: FlakyTest[]): CausalNode[] {
  return tests.map((test) => ({
    id: test.testId,
    type: 'test' as const,
    label: test.title || test.testId,
    metadata: {
      classification: test.classification,
      failureRate: test.weightedFailureRate,
      rootCause: test.rootCause?.primaryCause,
    },
  }));
}

/**
 * 从关联组推断基础设施节点
 * 如果多个测试共享同一根因，创建一个基础设施节点
 * @param correlationGroups - 关联组列表
 * @param tests - Flaky 测试列表
 * @returns 推断出的基础设施节点和边
 */
function inferInfrastructureNodes(
  correlationGroups: CorrelationGroup[],
  tests: FlakyTest[]
): { nodes: CausalNode[]; edges: CausalEdge[] } {
  const nodes: CausalNode[] = [];
  const edges: CausalEdge[] = [];

  const testMap = new Map(tests.map((t) => [t.testId, t]));

  for (const group of correlationGroups) {
    if (group.testIds.length < 2) continue;

    const rootCauses = group.testIds
      .map((id) => testMap.get(id)?.rootCause?.primaryCause)
      .filter((c): c is RootCauseType => c !== undefined);

    const causeCounts = new Map<RootCauseType, number>();
    for (const cause of rootCauses) {
      causeCounts.set(cause, (causeCounts.get(cause) || 0) + 1);
    }

    let dominantCause: RootCauseType = 'unknown';
    let maxCount = 0;
    for (const [cause, count] of causeCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantCause = cause;
      }
    }

    const infraNodeId = `infra-${group.groupId}`;
    const causeToType: Record<string, 'infrastructure' | 'external_service' | 'shared_state'> = {
      timing: 'infrastructure',
      environment: 'infrastructure',
      external_service: 'external_service',
      data_race: 'shared_state',
      test_order: 'shared_state',
      resource_leak: 'infrastructure',
      assertion_flaky: 'shared_state',
      unknown: 'infrastructure',
    };

    nodes.push({
      id: infraNodeId,
      type: causeToType[dominantCause] || 'infrastructure',
      label: `${dominantCause} (共享)`,
      metadata: {
        correlationType: group.correlationType,
        confidence: group.confidence,
        rootCause: dominantCause,
        affectedTests: group.testIds.length,
      },
    });

    for (const testId of group.testIds) {
      edges.push({
        from: infraNodeId,
        to: testId,
        weight: group.confidence,
        type: group.correlationType === 'same_error_pattern' ? 'correlated_failure' : 'same_environment',
        confidence: group.confidence,
      });
    }
  }

  return { nodes, edges };
}

/**
 * 从运行结果推断测试间依赖边
 * 分析测试执行顺序和结果关联
 * @param tests - Flaky 测试列表
 * @param recentRuns - 最近运行结果
 * @param minCorrelation - 最小关联度
 * @returns 因果边数组
 */
function inferDependencyEdges(
  tests: FlakyTest[],
  recentRuns: RunResult[],
  minCorrelation: number
): CausalEdge[] {
  const edges: CausalEdge[] = [];
  const testIds = new Set(tests.map((t) => t.testId));

  if (recentRuns.length < 2) return edges;

  const coFailure = new Map<string, Map<string, { both: number; either: number }>>();

  for (const run of recentRuns) {
    const allTests = run.suites.flatMap((s) => s.tests);
    const failedInRun = allTests.filter(
      (t) => testIds.has(t.id) && (t.status === 'failed' || t.status === 'timedout')
    );

    for (let i = 0; i < failedInRun.length; i++) {
      for (let j = i + 1; j < failedInRun.length; j++) {
        const idA = failedInRun[i].id;
        const idB = failedInRun[j].id;

        if (!coFailure.has(idA)) coFailure.set(idA, new Map());
        if (!coFailure.has(idB)) coFailure.set(idB, new Map());

        const pairA = coFailure.get(idA)!;
        const pairB = coFailure.get(idB)!;

        if (!pairA.has(idB)) pairA.set(idB, { both: 0, either: 0 });
        if (!pairB.has(idA)) pairB.set(idA, { both: 0, either: 0 });

        pairA.get(idB)!.both++;
        pairA.get(idB)!.either++;
        pairB.get(idA)!.both++;
        pairB.get(idA)!.either++;
      }
    }

    const relevantTests = allTests.filter((t) => testIds.has(t.id));
    for (const t of relevantTests) {
      if (t.status !== 'failed' && t.status !== 'timedout') {
        const pairs = coFailure.get(t.id);
        if (pairs) {
          for (const [, stats] of pairs) {
            stats.either++;
          }
        }
      }
    }
  }

  const processed = new Set<string>();
  for (const [idA, pairs] of coFailure) {
    for (const [idB, stats] of pairs) {
      const key = [idA, idB].sort().join('::');
      if (processed.has(key)) continue;
      processed.add(key);

      const correlation = stats.either > 0 ? stats.both / stats.either : 0;
      if (correlation >= minCorrelation) {
        edges.push({
          from: idA,
          to: idB,
          weight: Math.round(correlation * 100) / 100,
          type: 'correlated_failure',
          confidence: Math.round(correlation * 100) / 100,
        });
      }
    }
  }

  return edges;
}

/**
 * 识别根因节点
 * 使用入度分析识别因果图中的根因节点
 * 入度为 0 或入度远低于出度的节点更可能是根因
 * @param graph - 因果图
 * @returns 根因节点列表
 */
function identifyRootCauses(graph: CausalGraph): CausalNode[] {
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }

  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + edge.weight);
    outDegree.set(edge.from, (outDegree.get(edge.from) || 0) + edge.weight);
  }

  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const rootCauses = graph.nodes
    .filter((node) => {
      const inD = inDegree.get(node.id) || 0;
      const outD = outDegree.get(node.id) || 0;
      return node.type !== 'test' || (outD > inD * 2 && outD > 0.5);
    })
    .sort((a, b) => {
      const outA = outDegree.get(a.id) || 0;
      const outB = outDegree.get(b.id) || 0;
      return outB - outA;
    });

  return rootCauses.length > 0 ? rootCauses : [];
}

/**
 * 构建影响映射
 * 对每个节点，计算其直接影响和间接影响的节点
 * @param graph - 因果图
 * @param maxDepth - 最大遍历深度
 * @returns 影响映射
 */
function buildImpactMap(graph: CausalGraph, maxDepth: number): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge.to);
  }

  const impactMap = new Map<string, string[]>();

  for (const node of graph.nodes) {
    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: node.id, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id) || current.depth > maxDepth) continue;
      visited.add(current.id);

      const neighbors = adjacency.get(current.id) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ id: neighbor, depth: current.depth + 1 });
        }
      }
    }

    visited.delete(node.id);
    impactMap.set(node.id, Array.from(visited));
  }

  return impactMap;
}

/**
 * 因果图构建器
 * 从测试数据和运行结果构建因果依赖图
 */
export class CausalGraphBuilder {
  private config: CausalGraphConfig;

  constructor(config: Partial<CausalGraphConfig> = {}) {
    this.config = { ...DEFAULT_CAUSAL_CONFIG, ...config };
  }

  /**
   * 构建因果图
   * 综合测试数据、关联组和运行结果构建完整的因果依赖图
   * @param tests - Flaky 测试列表
   * @param correlationGroups - 关联组列表
   * @param recentRuns - 最近运行结果
   * @returns 因果图
   */
  build(
    tests: FlakyTest[],
    correlationGroups: CorrelationGroup[],
    recentRuns: RunResult[]
  ): CausalGraph {
    const testNodes = buildTestNodes(tests);
    const { nodes: infraNodes, edges: infraEdges } = inferInfrastructureNodes(
      correlationGroups,
      tests
    );
    const dependencyEdges = inferDependencyEdges(
      tests,
      recentRuns,
      this.config.minCorrelation
    );

    const allNodes = [...testNodes, ...infraNodes];
    const allEdges = [...infraEdges, ...dependencyEdges];

    const graph: CausalGraph = {
      nodes: allNodes,
      edges: allEdges,
      rootCauses: [],
      impactMap: new Map(),
      builtAt: Date.now(),
    };

    graph.rootCauses = identifyRootCauses(graph);
    graph.impactMap = buildImpactMap(graph, this.config.maxDepth);

    return graph;
  }

  /**
   * 分析指定测试的影响范围
   * @param testId - 测试 ID
   * @param graph - 因果图
   * @returns 影响分析结果
   */
  analyzeImpact(testId: string, graph: CausalGraph): ImpactAnalysis {
    const directlyAffected = graph.edges
      .filter((e) => e.from === testId)
      .map((e) => e.to);

    const allAffected = graph.impactMap.get(testId) || [];
    const indirectlyAffected = allAffected.filter((id) => !directlyAffected.includes(id));

    const totalImpact = directlyAffected.length * 2 + indirectlyAffected.length;

    const riskLevel = totalImpact >= 10 ? 'critical'
      : totalImpact >= 5 ? 'high'
      : totalImpact >= 2 ? 'medium'
      : 'low';

    const recommendations: Record<string, string> = {
      critical: '影响范围极大，修复此测试可解决多个关联问题，建议最高优先级处理',
      high: '影响范围较大，修复此测试有助于稳定多个关联测试',
      medium: '有一定影响，建议在方便时修复',
      low: '影响范围有限，可按正常优先级处理',
    };

    return {
      testId,
      directlyAffected,
      indirectlyAffected,
      totalImpact,
      riskLevel,
      recommendation: recommendations[riskLevel],
    };
  }

  /**
   * 获取所有根因节点
   * @param graph - 因果图
   * @returns 根因节点列表
   */
  getRootCauses(graph: CausalGraph): CausalNode[] {
    return graph.rootCauses;
  }

  /**
   * 获取指定节点的下游影响链
   * @param nodeId - 节点 ID
   * @param graph - 因果图
   * @returns 下游节点 ID 列表（按距离排序）
   */
  getDownstreamChain(nodeId: string, graph: CausalGraph): string[] {
    return graph.impactMap.get(nodeId) || [];
  }
}
