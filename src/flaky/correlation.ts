import { FlakyTest, RunResult, CorrelationGroup, CorrelationType } from '../types';
import { FLAKY_CONFIG } from '../constants';

/** 关联分析配置 */
export interface CorrelationConfig {
  /** 共现阈值，Jaccard 系数超过此值的测试对被认为有关联 */
  coOccurrenceThreshold: number;
  /** 最少运行次数，少于此数量的测试不参与分析 */
  minRuns: number;
}

/** 默认关联分析配置 */
const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  coOccurrenceThreshold: FLAKY_CONFIG.CORRELATION_CO_OCCURRENCE_THRESHOLD,
  minRuns: FLAKY_CONFIG.CORRELATION_MIN_RUNS,
};

/**
 * 并查集数据结构
 * 用于高效合并高共现的测试对，形成关联组
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  /**
   * 查找元素所属的根节点，带路径压缩
   * @param x - 元素标识
   * @returns 根节点标识
   */
  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }

    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }

    return this.parent.get(x)!;
  }

  /**
   * 合并两个元素所在的集合，按秩合并
   * @param x - 第一个元素
   * @param y - 第二个元素
   */
  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX) ?? 0;
    const rankY = this.rank.get(rootY) ?? 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }
}

/**
 * 构建运行-失败映射
 * 对于每个 Flaky 测试，记录它在哪些运行中失败
 * @param flakyTests - Flaky 测试列表
 * @param recentRuns - 最近的运行结果列表
 * @returns Map<testId, Set<runId>>，每个测试在哪些运行中失败
 */
function buildRunFailureMap(
  flakyTests: FlakyTest[],
  recentRuns: RunResult[]
): Map<string, Set<string>> {
  const failureMap = new Map<string, Set<string>>();

  for (const test of flakyTests) {
    failureMap.set(test.testId, new Set());
  }

  for (const run of recentRuns) {
    for (const suite of run.suites) {
      for (const testResult of suite.tests) {
        const failedSet = failureMap.get(testResult.id);
        if (failedSet && (testResult.status === 'failed' || testResult.status === 'timedout')) {
          failedSet.add(run.id);
        }
      }
    }
  }

  return failureMap;
}

/**
 * 计算 Jaccard 共现系数
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
 * 用于衡量两个测试在同一运行中同时失败的频率
 * @param setA - 第一个集合
 * @param setB - 第二个集合
 * @returns Jaccard 系数，范围 [0, 1]
 */
function jaccardCoOccurrence(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 判断两个测试是否在同一文件中
 * @param testA - 第一个测试
 * @param testB - 第二个测试
 * @returns 是否同文件
 */
function isSameFile(testA: FlakyTest, testB: FlakyTest): boolean {
  const fileA = testA.history.find((h) => h.error)?.error;
  const fileB = testB.history.find((h) => h.error)?.error;
  if (!fileA || !fileB) return false;

  const fileMatchA = fileA.match(/(?:at\s+)?(.+?\.(?:spec|test)\.(?:ts|tsx|js|jsx))/);
  const fileMatchB = fileB.match(/(?:at\s+)?(.+?\.(?:spec|test)\.(?:ts|tsx|js|jsx))/);

  if (fileMatchA && fileMatchB) {
    return fileMatchA[1] === fileMatchB[1];
  }

  return false;
}

/**
 * 判断两个测试是否有相同的错误模式
 * @param testA - 第一个测试
 * @param testB - 第二个测试
 * @returns 是否有相同错误模式
 */
function hasSameErrorPattern(testA: FlakyTest, testB: FlakyTest): boolean {
  const errorsA = testA.history
    .filter((h) => h.error && (h.status === 'failed' || h.status === 'timedout'))
    .map((h) => h.error!.toLowerCase());

  const errorsB = testB.history
    .filter((h) => h.error && (h.status === 'failed' || h.status === 'timedout'))
    .map((h) => h.error!.toLowerCase());

  if (errorsA.length === 0 || errorsB.length === 0) return false;

  const keywordsA = new Set<string>();
  const keywordsB = new Set<string>();

  const significantKeywords = [
    'timeout', 'selector', 'element', 'network', 'fetch',
    'assertion', 'expect', 'navigation', 'waiting',
    'econnrefused', 'cors', '500', '502', '503',
  ];

  for (const error of errorsA) {
    for (const kw of significantKeywords) {
      if (error.includes(kw)) keywordsA.add(kw);
    }
  }

  for (const error of errorsB) {
    for (const kw of significantKeywords) {
      if (error.includes(kw)) keywordsB.add(kw);
    }
  }

  let shared = 0;
  for (const kw of keywordsA) {
    if (keywordsB.has(kw)) shared++;
  }

  return shared >= 2 && keywordsA.size > 0 && keywordsB.size > 0 && shared / Math.max(keywordsA.size, keywordsB.size) >= 0.5;
}

/**
 * 确定关联类型
 * 根据两个测试的共同特征判断关联类型
 * @param testA - 第一个测试
 * @param testB - 第二个测试
 * @param coOccurrence - 共现系数
 * @returns 关联类型
 */
function determineCorrelationType(
  testA: FlakyTest,
  testB: FlakyTest,
  coOccurrence: number
): CorrelationType {
  if (hasSameErrorPattern(testA, testB)) return 'same_error_pattern';
  if (isSameFile(testA, testB)) return 'same_file';
  if (coOccurrence >= 0.8) return 'same_run';
  return 'same_time_window';
}

/**
 * 分析同次运行中多个 Flaky 测试的关联性
 * 如果多个测试频繁在同一次运行中一起失败，可能是环境问题而非测试本身问题
 * @param allFlakyTests - 所有 Flaky 测试列表
 * @param recentRunResults - 最近的运行结果列表
 * @param config - 关联分析配置（可选）
 * @returns 关联组列表
 */
export function analyzeCorrelations(
  allFlakyTests: FlakyTest[],
  recentRunResults: RunResult[],
  config: Partial<CorrelationConfig> = {}
): CorrelationGroup[] {
  const cfg = { ...DEFAULT_CORRELATION_CONFIG, ...config };

  const eligibleTests = allFlakyTests.filter((t) => t.totalRuns >= cfg.minRuns);
  if (eligibleTests.length < 2) return [];

  const failureMap = buildRunFailureMap(eligibleTests, recentRunResults);

  const uf = new UnionFind();
  const pairCorrelations = new Map<string, { coOccurrence: number; type: CorrelationType }>();

  for (let i = 0; i < eligibleTests.length; i++) {
    for (let j = i + 1; j < eligibleTests.length; j++) {
      const testA = eligibleTests[i];
      const testB = eligibleTests[j];

      const failedRunsA = failureMap.get(testA.testId) || new Set();
      const failedRunsB = failureMap.get(testB.testId) || new Set();

      if (failedRunsA.size === 0 || failedRunsB.size === 0) continue;

      const coOccurrence = jaccardCoOccurrence(failedRunsA, failedRunsB);

      if (coOccurrence >= cfg.coOccurrenceThreshold) {
        uf.union(testA.testId, testB.testId);

        const pairKey = `${testA.testId}::${testB.testId}`;
        pairCorrelations.set(pairKey, {
          coOccurrence,
          type: determineCorrelationType(testA, testB, coOccurrence),
        });
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const test of eligibleTests) {
    const root = uf.find(test.testId);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(test.testId);
  }

  const testMap = new Map<string, FlakyTest>();
  for (const test of eligibleTests) {
    testMap.set(test.testId, test);
  }

  const correlationGroups: CorrelationGroup[] = [];
  let groupIndex = 0;

  for (const [root, testIds] of groups) {
    if (testIds.length < 2) continue;

    let totalCoOccurrence = 0;
    let pairCount = 0;
    let dominantType: CorrelationType = 'same_run';
    const typeCounts = new Map<CorrelationType, number>();

    for (let i = 0; i < testIds.length; i++) {
      for (let j = i + 1; j < testIds.length; j++) {
        const pairKey = `${testIds[i]}::${testIds[j]}`;
        const pairInfo = pairCorrelations.get(pairKey);
        if (pairInfo) {
          totalCoOccurrence += pairInfo.coOccurrence;
          pairCount++;
          typeCounts.set(pairInfo.type, (typeCounts.get(pairInfo.type) || 0) + 1);
        }
      }
    }

    let maxTypeCount = 0;
    for (const [type, count] of typeCounts) {
      if (count > maxTypeCount) {
        maxTypeCount = count;
        dominantType = type;
      }
    }

    const avgCoOccurrence = pairCount > 0 ? totalCoOccurrence / pairCount : 0;

    const testTitles = testIds
      .map((id) => testMap.get(id)?.title || id)
      .join(', ');

    const evidence = `${testIds.length} 个测试频繁同时失败（平均共现系数 ${avgCoOccurrence.toFixed(2)}）：${testTitles}`;

    correlationGroups.push({
      groupId: `correlation-${groupIndex++}`,
      testIds,
      correlationType: dominantType,
      confidence: Math.min(1, avgCoOccurrence),
      evidence,
    });
  }

  return correlationGroups.sort((a, b) => b.confidence - a.confidence);
}
