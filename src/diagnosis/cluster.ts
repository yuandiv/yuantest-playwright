import { TestResult } from '../types';

/** 错误聚类结果接口 */
export interface FailureCluster {
  clusterId: string;
  representativeTestId: string;
  testIds: string[];
  errorMessage: string;
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  similarity: number;
}

/** Jaccard 相似度阈值，达到此值的测试归为同一组 */
const SIMILARITY_THRESHOLD = 0.3;

/** 最小聚类大小，少于此数量的测试不形成聚类 */
const MIN_CLUSTER_SIZE = 2;

/**
 * 从错误消息中提取关键词
 * 包括错误类型、HTTP 状态码、错误代码和框架关键词
 * @param error - 错误消息字符串
 * @returns 提取到的关键词数组（统一小写）
 */
function extractKeywords(error: string): string[] {
  const lower = error.toLowerCase();
  const keywords: Set<string> = new Set();

  const errorTypes = [
    'timeout',
    'selector',
    'assertion',
    'element',
    'visible',
    'hidden',
    'attached',
    'detached',
    'navigation',
    'waiting',
  ];
  for (const kw of errorTypes) {
    if (lower.includes(kw)) {
      keywords.add(kw);
    }
  }

  const httpStatusPatterns = [/\b401\b/, /\b403\b/, /\b404\b/, /\b500\b/, /\b502\b/, /\b503\b/];
  const httpStatusNames = ['401', '403', '404', '500', '502', '503'];
  for (let i = 0; i < httpStatusPatterns.length; i++) {
    if (httpStatusPatterns[i].test(error)) {
      keywords.add(httpStatusNames[i]);
    }
  }

  const errorCodes = [
    'err_connection',
    'err_name_not_resolved',
    'err_connection_refused',
    'err_connection_timed_out',
    'err_timed_out',
    'net::err',
    'cors',
  ];
  for (const code of errorCodes) {
    if (lower.includes(code)) {
      keywords.add(code);
    }
  }

  const frameworkKeywords = [
    'waitfor',
    'expect',
    'page.',
    'browser.',
    'locator',
    'frame',
    'iframe',
    'goto',
    'click',
    'fill',
    'navigate',
    'fetch',
    'unauthorized',
    'auth',
  ];
  for (const kw of frameworkKeywords) {
    if (lower.includes(kw)) {
      keywords.add(kw);
    }
  }

  return Array.from(keywords);
}

/**
 * 根据错误消息内容对错误进行分类
 * @param error - 错误消息字符串
 * @returns 错误类别
 */
function categorizeError(error: string): FailureCluster['category'] {
  const lower = error.toLowerCase();

  if (lower.includes('timeout')) return 'timeout';
  if (lower.includes('selector') || lower.includes('element')) return 'selector';
  if (lower.includes('assertion') || lower.includes('expect')) return 'assertion';
  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('err_connection') ||
    lower.includes('cors')
  )
    return 'network';
  if (lower.includes('frame') || lower.includes('iframe')) return 'frame';
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized') || lower.includes('auth'))
    return 'auth';

  return 'unknown';
}

/**
 * 计算两个关键词集合之间的 Jaccard 相似度
 * Jaccard(A, B) = |A ∩ B| / |A ∪ B|
 * @param a - 第一个关键词数组
 * @param b - 第二个关键词数组
 * @returns Jaccard 相似度，范围 [0, 1]
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;

  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;

  const arrA = Array.from(setA);
  for (const item of arrA) {
    if (setB.has(item)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;

  return intersection / union;
}

/**
 * 并查集（Union-Find）数据结构，用于高效合并相似测试的分组
 */
class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  /** 查找元素所属的根节点，带路径压缩 */
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

  /** 合并两个元素所在的集合，按秩合并 */
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
 * 对失败的测试结果进行聚类分析
 * 基于错误消息关键词的 Jaccard 相似度，使用并查集算法将相似失败归为同一组
 * @param testResults - 测试结果数组
 * @returns 聚类结果数组，仅包含满足最小聚类大小的组
 */
export function clusterFailures(testResults: TestResult[]): FailureCluster[] {
  const failedTests = testResults.filter((t) => t.status === 'failed');

  if (failedTests.length < MIN_CLUSTER_SIZE) {
    return [];
  }

  const keywordMap = new Map<string, string[]>();
  for (const test of failedTests) {
    const error = test.error || test.stackTrace || '';
    keywordMap.set(test.id, extractKeywords(error));
  }

  const uf = new UnionFind();

  for (let i = 0; i < failedTests.length; i++) {
    for (let j = i + 1; j < failedTests.length; j++) {
      const keywordsA = keywordMap.get(failedTests[i].id)!;
      const keywordsB = keywordMap.get(failedTests[j].id)!;

      const sharedCount = keywordsA.filter((k) => keywordsB.includes(k)).length;
      const similarity = jaccardSimilarity(keywordsA, keywordsB);

      if (sharedCount >= 2 && similarity >= SIMILARITY_THRESHOLD) {
        uf.union(failedTests[i].id, failedTests[j].id);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const test of failedTests) {
    const root = uf.find(test.id);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(test.id);
  }

  const testMap = new Map<string, TestResult>();
  for (const test of failedTests) {
    testMap.set(test.id, test);
  }

  const clusters: FailureCluster[] = [];
  let clusterIndex = 0;

  for (const entry of Array.from(groups.entries())) {
    const root = entry[0];
    const ids = entry[1];
    if (ids.length < MIN_CLUSTER_SIZE) continue;

    const representative = testMap.get(root)!;
    const error = representative.error || representative.stackTrace || '';

    let totalSimilarity = 0;
    let pairCount = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        totalSimilarity += jaccardSimilarity(
          keywordMap.get(ids[i])!,
          keywordMap.get(ids[j])!
        );
        pairCount++;
      }
    }
    const avgSimilarity = pairCount > 0 ? totalSimilarity / pairCount : 0;

    clusters.push({
      clusterId: `cluster-${clusterIndex++}`,
      representativeTestId: root,
      testIds: ids,
      errorMessage: error,
      category: categorizeError(error),
      similarity: Math.round(avgSimilarity * 1000) / 1000,
    });
  }

  return clusters;
}
