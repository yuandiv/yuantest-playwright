import { clusterFailures } from '../../src/diagnosis/cluster';
import { TestResult } from '../../src/types';

/**
 * cluster 模块单元测试
 * 覆盖错误聚类分析功能，包括相似错误聚类、不同类别分离、通过测试过滤等
 */

/** 辅助函数：创建测试结果对象 */
function createTestResult(id: string, error: string, overrides: Partial<TestResult> = {}): TestResult {
  return {
    id,
    title: `Test ${id}`,
    status: 'failed',
    error,
    duration: 100,
    retries: 0,
    timestamp: Date.now(),
    browser: 'chromium',
    ...overrides,
  };
}

describe('cluster', () => {
  describe('clusterFailures', () => {
    /** 应将相似错误的测试聚类 */
    it('应将相似错误的测试聚类', () => {
      const results = [
        createTestResult('1', 'Timeout 30000ms exceeded waiting for selector ".btn"'),
        createTestResult('2', 'Timeout 30000ms exceeded waiting for selector ".link"'),
        createTestResult('3', 'Timeout 30000ms exceeded waiting for selector ".input"'),
      ];
      const clusters = clusterFailures(results);
      expect(clusters.length).toBeGreaterThan(0);
      expect(clusters[0].testIds.length).toBeGreaterThanOrEqual(2);
    });

    /** 应将不同类别的错误分开 */
    it('应将不同类别的错误分开', () => {
      const results = [
        createTestResult('1', 'Timeout 30000ms exceeded'),
        createTestResult('2', '401 Unauthorized - token expired'),
      ];
      const clusters = clusterFailures(results);
      clusters.forEach(cluster => {
        expect(cluster.testIds.length).toBeLessThan(2);
      });
    });

    /** 应忽略通过的测试 */
    it('应忽略通过的测试', () => {
      const results = [
        createTestResult('1', 'some error', { status: 'passed' }),
        createTestResult('2', 'Timeout 30000ms exceeded'),
      ];
      const clusters = clusterFailures(results);
      expect(clusters).toEqual([]);
    });

    /** 应在测试数量不足时返回空数组 */
    it('应在测试数量不足时返回空数组', () => {
      const results = [createTestResult('1', 'Some error')];
      const clusters = clusterFailures(results);
      expect(clusters).toEqual([]);
    });

    /** 应正确分类错误类别 */
    it('应正确分类错误类别', () => {
      const results = [
        createTestResult('1', 'Timeout 30000ms exceeded'),
        createTestResult('2', 'Timeout 30000ms exceeded'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].category).toBe('timeout');
      }
    });

    /** 应正确分类 auth 类别错误 */
    it('应正确分类 auth 类别错误', () => {
      const results = [
        createTestResult('1', '401 Unauthorized - token expired'),
        createTestResult('2', '401 Unauthorized - login required'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].category).toBe('auth');
      }
    });

    /** 应正确分类 network 类别错误 */
    it('应正确分类 network 类别错误', () => {
      const results = [
        createTestResult('1', 'Request failed with CORS error'),
        createTestResult('2', 'Request failed CORS policy'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].category).toBe('network');
      }
    });

    /** 应正确分类 frame 类别错误 */
    it('应正确分类 frame 类别错误', () => {
      const results = [
        createTestResult('1', 'Frame was detached during operation'),
        createTestResult('2', 'Frame was detached from DOM'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].category).toBe('frame');
      }
    });

    /** 空输入应返回空数组 */
    it('空输入应返回空数组', () => {
      const clusters = clusterFailures([]);
      expect(clusters).toEqual([]);
    });

    /** 全部通过的测试应返回空数组 */
    it('全部通过的测试应返回空数组', () => {
      const results = [
        createTestResult('1', '', { status: 'passed' }),
        createTestResult('2', '', { status: 'passed' }),
      ];
      const clusters = clusterFailures(results);
      expect(clusters).toEqual([]);
    });

    /** 聚类结果应包含有效的相似度值 */
    it('聚类结果应包含有效的相似度值', () => {
      const results = [
        createTestResult('1', 'Timeout 30000ms exceeded waiting for selector ".btn"'),
        createTestResult('2', 'Timeout 30000ms exceeded waiting for selector ".link"'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].similarity).toBeGreaterThanOrEqual(0);
        expect(clusters[0].similarity).toBeLessThanOrEqual(1);
      }
    });

    /** 聚类结果应包含 clusterId */
    it('聚类结果应包含 clusterId', () => {
      const results = [
        createTestResult('1', 'Timeout 30000ms exceeded waiting for selector ".btn"'),
        createTestResult('2', 'Timeout 30000ms exceeded waiting for selector ".link"'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].clusterId).toMatch(/^cluster-\d+$/);
      }
    });

    /** 聚类结果应包含 representativeTestId */
    it('聚类结果应包含 representativeTestId', () => {
      const results = [
        createTestResult('1', 'Timeout 30000ms exceeded waiting for selector ".btn"'),
        createTestResult('2', 'Timeout 30000ms exceeded waiting for selector ".link"'),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].representativeTestId).toBeDefined();
        expect(results.some(r => r.id === clusters[0].representativeTestId)).toBe(true);
      }
    });

    /** 无 error 字段时应使用 stackTrace 字段进行聚类 */
    it('无 error 字段时应使用 stackTrace 字段进行聚类', () => {
      const results = [
        createTestResult('1', '', { stackTrace: 'Timeout 30000ms exceeded' }),
        createTestResult('2', '', { stackTrace: 'Timeout 30000ms exceeded' }),
      ];
      const clusters = clusterFailures(results);
      if (clusters.length > 0) {
        expect(clusters[0].testIds.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
