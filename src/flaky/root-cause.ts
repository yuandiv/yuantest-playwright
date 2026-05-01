import {
  FlakyTest,
  RootCauseType,
  RootCauseAnalysis,
  RootCauseEvidence,
  RunResult,
  TestResult,
} from '../types';

/** 根因分析所需的上下文信息 */
export interface AnalysisContext {
  /** 最近 N 次运行结果，用于关联分析 */
  recentRuns: RunResult[];
  /** 分片信息映射：testId -> shardId */
  shardMap?: Map<string, number>;
  /** CI 节点信息：runId -> nodeLabel */
  ciNodeInfo?: Map<string, string>;
}

/** 时序问题关键词 */
const TIMING_KEYWORDS = [
  'timeout',
  'timed out',
  'waiting for selector',
  'waiting for element',
  'exceeded',
  'navigation',
  'waiting for',
  'slow',
];

/** 外部服务问题关键词 */
const EXTERNAL_SERVICE_KEYWORDS = [
  'network',
  'fetch',
  'econnrefused',
  'econnreset',
  'enetunreach',
  'err_connection',
  'cors',
  '5xx',
  '500',
  '502',
  '503',
  '504',
  'service unavailable',
  'gateway timeout',
  'bad gateway',
  'internal server error',
];

/** 断言不稳定关键词 */
const ASSERTION_KEYWORDS = [
  'assertion',
  'assert',
  'expect',
  'to be',
  'to equal',
  'to match',
  'received',
  'expected',
];

/** 资源泄漏关键词 */
const RESOURCE_LEAK_KEYWORDS = [
  'memory',
  'heap',
  'out of memory',
  'cannot allocate',
  'too many open files',
  'emfile',
  'connection pool',
  'max connections',
  'resource',
];

/** 持续时间变异系数阈值，超过此值认为持续时间波动大 */
const DURATION_CV_THRESHOLD = 0.5;

/** 持续时间趋势斜率阈值，超过此值认为持续时间在增长 */
const DURATION_TREND_THRESHOLD = 0.1;

/**
 * 检测时序问题
 * 判断依据：错误信息含 timeout/waiting 关键词，且持续时间变异系数大
 * @param test - Flaky 测试对象
 * @returns 根因证据，未检测到则返回 null
 */
function detectTimingIssue(test: FlakyTest): RootCauseEvidence | null {
  const indicators: string[] = [];
  let keywordHits = 0;

  for (const entry of test.history) {
    if (!entry.error) continue;
    const lower = entry.error.toLowerCase();
    for (const kw of TIMING_KEYWORDS) {
      if (lower.includes(kw)) {
        keywordHits++;
        if (!indicators.includes(kw)) {
          indicators.push(kw);
        }
        break;
      }
    }
  }

  const durations = test.history.map((h) => h.duration).filter((d) => d > 0);
  const cv = calculateCoefficientOfVariation(durations);

  if (cv > DURATION_CV_THRESHOLD) {
    indicators.push(`high_duration_variance_cv=${cv.toFixed(2)}`);
  }

  if (keywordHits === 0 && cv <= DURATION_CV_THRESHOLD) {
    return null;
  }

  const confidence = Math.min(
    1,
    (keywordHits / Math.max(test.history.length, 1)) * 0.7 +
      (cv > DURATION_CV_THRESHOLD ? 0.3 : 0)
  );

  return {
    type: 'timing',
    indicators,
    confidence: Math.round(confidence * 100) / 100,
    description: `时序问题：${keywordHits} 次运行出现超时/等待关键词${cv > DURATION_CV_THRESHOLD ? '，持续时间波动大(CV=' + cv.toFixed(2) + ')' : ''}`,
  };
}

/**
 * 检测数据竞争
 * 判断依据：同一测试在不同分片结果不一致
 * @param test - Flaky 测试对象
 * @param context - 分析上下文
 * @returns 根因证据，未检测到则返回 null
 */
function detectDataRace(
  test: FlakyTest,
  context: AnalysisContext
): RootCauseEvidence | null {
  if (!context.shardMap || context.recentRuns.length === 0) {
    return null;
  }

  const shardResults = new Map<number, { passed: number; failed: number }>();

  for (const run of context.recentRuns) {
    for (const suite of run.suites) {
      for (const t of suite.tests) {
        if (t.id === test.testId && t.shard !== undefined) {
          const shard = t.shard;
          if (!shardResults.has(shard)) {
            shardResults.set(shard, { passed: 0, failed: 0 });
          }
          const results = shardResults.get(shard)!;
          if (t.status === 'passed') results.passed++;
          else if (t.status === 'failed' || t.status === 'timedout') results.failed++;
        }
      }
    }
  }

  if (shardResults.size < 2) return null;

  const shardPassRates: number[] = [];
  for (const [, results] of shardResults) {
    const total = results.passed + results.failed;
    if (total > 0) {
      shardPassRates.push(results.passed / total);
    }
  }

  if (shardPassRates.length < 2) return null;

  const maxRate = Math.max(...shardPassRates);
  const minRate = Math.min(...shardPassRates);
  const divergence = maxRate - minRate;

  if (divergence < 0.3) return null;

  const indicators = [
    `分片间通过率差异: ${(minRate * 100).toFixed(0)}% ~ ${(maxRate * 100).toFixed(0)}%`,
    `涉及 ${shardResults.size} 个分片`,
  ];

  return {
    type: 'data_race',
    indicators,
    confidence: Math.min(1, divergence + 0.2),
    description: `数据竞争：不同分片间结果不一致，通过率差异 ${((divergence) * 100).toFixed(0)}%`,
  };
}

/**
 * 检测环境依赖
 * 判断依据：失败呈时间聚集，或特定 CI 节点才失败
 * @param test - Flaky 测试对象
 * @param context - 分析上下文
 * @returns 根因证据，未检测到则返回 null
 */
function detectEnvironmentDependency(
  test: FlakyTest,
  context: AnalysisContext
): RootCauseEvidence | null {
  const failedTimestamps = test.history
    .filter((h) => h.status === 'failed' || h.status === 'timedout')
    .map((h) => h.timestamp)
    .sort((a, b) => a - b);

  if (failedTimestamps.length < 2) return null;

  const timeClustered = isTimeClustered(failedTimestamps);

  let nodeClustered = false;
  const nodeIndicators: string[] = [];
  if (context.ciNodeInfo && context.recentRuns.length > 0) {
    const nodeFailCount = new Map<string, number>();
    const nodeTotalCount = new Map<string, number>();

    for (const run of context.recentRuns) {
      const node = context.ciNodeInfo.get(run.id) || 'unknown';
      for (const suite of run.suites) {
        for (const t of suite.tests) {
          if (t.id === test.testId) {
            nodeTotalCount.set(node, (nodeTotalCount.get(node) || 0) + 1);
            if (t.status === 'failed' || t.status === 'timedout') {
              nodeFailCount.set(node, (nodeFailCount.get(node) || 0) + 1);
            }
          }
        }
      }
    }

    for (const [node, failCount] of nodeFailCount) {
      const total = nodeTotalCount.get(node) || 0;
      if (total >= 2 && failCount / total >= 0.5) {
        nodeClustered = true;
        nodeIndicators.push(`节点 ${node} 失败率 ${(failCount / total * 100).toFixed(0)}%`);
      }
    }
  }

  if (!timeClustered && !nodeClustered) return null;

  const indicators: string[] = [];
  if (timeClustered) indicators.push('失败时间呈聚集模式');
  indicators.push(...nodeIndicators);

  const confidence = (timeClustered ? 0.4 : 0) + (nodeClustered ? 0.5 : 0);

  return {
    type: 'environment',
    indicators,
    confidence: Math.min(1, confidence),
    description: `环境依赖：${timeClustered ? '失败时间聚集' : ''}${timeClustered && nodeClustered ? '，' : ''}${nodeClustered ? '特定CI节点失败率更高' : ''}`,
  };
}

/**
 * 检测外部服务不稳定
 * 判断依据：错误信息含 network/fetch/5xx 等关键词
 * @param test - Flaky 测试对象
 * @returns 根因证据，未检测到则返回 null
 */
function detectExternalService(test: FlakyTest): RootCauseEvidence | null {
  const indicators: string[] = [];
  let keywordHits = 0;

  for (const entry of test.history) {
    if (!entry.error) continue;
    const lower = entry.error.toLowerCase();
    for (const kw of EXTERNAL_SERVICE_KEYWORDS) {
      if (lower.includes(kw)) {
        keywordHits++;
        if (!indicators.includes(kw)) {
          indicators.push(kw);
        }
        break;
      }
    }
  }

  if (keywordHits === 0) return null;

  const confidence = Math.min(1, keywordHits / Math.max(test.history.length, 1) * 0.8 + 0.2);

  return {
    type: 'external_service',
    indicators,
    confidence: Math.round(confidence * 100) / 100,
    description: `外部服务不稳定：${keywordHits} 次运行出现网络/服务错误`,
  };
}

/**
 * 检测测试顺序依赖
 * 判断依据：只在特定测试之后才失败
 * @param test - Flaky 测试对象
 * @param context - 分析上下文
 * @returns 根因证据，未检测到则返回 null
 */
function detectTestOrderDependency(
  test: FlakyTest,
  context: AnalysisContext
): RootCauseEvidence | null {
  if (context.recentRuns.length < 2) return null;

  const precedingTestsOnFail = new Map<string, number>();
  let failCount = 0;

  for (const run of context.recentRuns) {
    const allTests = run.suites.flatMap((s) => s.tests);
    const targetIndex = allTests.findIndex((t) => t.id === test.testId);
    if (targetIndex <= 0) continue;

    const target = allTests[targetIndex];
    if (target.status !== 'failed' && target.status !== 'timedout') continue;

    failCount++;
    const preceding = allTests[targetIndex - 1];
    if (preceding) {
      precedingTestsOnFail.set(
        preceding.id,
        (precedingTestsOnFail.get(preceding.id) || 0) + 1
      );
    }
  }

  if (failCount < 2) return null;

  let maxPrecedingId = '';
  let maxPrecedingCount = 0;
  for (const [id, count] of precedingTestsOnFail) {
    if (count > maxPrecedingCount) {
      maxPrecedingCount = count;
      maxPrecedingId = id;
    }
  }

  if (maxPrecedingCount < 2 || maxPrecedingCount / failCount < 0.5) return null;

  return {
    type: 'test_order',
    indicators: [`前置测试 ${maxPrecedingId} 出现在 ${maxPrecedingCount}/${failCount} 次失败中`],
    confidence: Math.min(1, maxPrecedingCount / failCount * 0.7 + 0.2),
    description: `测试顺序依赖：失败前经常运行测试 ${maxPrecedingId}`,
  };
}

/**
 * 检测资源泄漏
 * 判断依据：测试持续时间逐渐增长，或内存相关错误
 * @param test - Flaky 测试对象
 * @returns 根因证据，未检测到则返回 null
 */
function detectResourceLeak(test: FlakyTest): RootCauseEvidence | null {
  const indicators: string[] = [];

  let keywordHits = 0;
  for (const entry of test.history) {
    if (!entry.error) continue;
    const lower = entry.error.toLowerCase();
    for (const kw of RESOURCE_LEAK_KEYWORDS) {
      if (lower.includes(kw)) {
        keywordHits++;
        if (!indicators.includes(kw)) {
          indicators.push(kw);
        }
        break;
      }
    }
  }

  const durations = test.history.map((h) => h.duration).filter((d) => d > 0);
  const trendSlope = calculateTrendSlope(durations);

  if (trendSlope > DURATION_TREND_THRESHOLD) {
    indicators.push(`持续时间呈上升趋势(slope=${trendSlope.toFixed(3)})`);
  }

  if (keywordHits === 0 && trendSlope <= DURATION_TREND_THRESHOLD) return null;

  const confidence = Math.min(
    1,
    (keywordHits > 0 ? 0.5 : 0) + (trendSlope > DURATION_TREND_THRESHOLD ? 0.4 : 0)
  );

  return {
    type: 'resource_leak',
    indicators,
    confidence: Math.round(confidence * 100) / 100,
    description: `资源泄漏：${keywordHits > 0 ? '出现内存/资源相关错误' : ''}${keywordHits > 0 && trendSlope > DURATION_TREND_THRESHOLD ? '，' : ''}${trendSlope > DURATION_TREND_THRESHOLD ? '持续时间逐渐增长' : ''}`,
  };
}

/**
 * 检测断言不稳定
 * 判断依据：错误信息含 assertion/expect 关键词
 * @param test - Flaky 测试对象
 * @returns 根因证据，未检测到则返回 null
 */
function detectAssertionFlaky(test: FlakyTest): RootCauseEvidence | null {
  const indicators: string[] = [];
  let keywordHits = 0;

  for (const entry of test.history) {
    if (!entry.error) continue;
    const lower = entry.error.toLowerCase();
    for (const kw of ASSERTION_KEYWORDS) {
      if (lower.includes(kw)) {
        keywordHits++;
        if (!indicators.includes(kw)) {
          indicators.push(kw);
        }
        break;
      }
    }
  }

  if (keywordHits === 0) return null;

  const timingErrors = test.history.filter((h) => {
    if (!h.error) return false;
    const lower = h.error.toLowerCase();
    return TIMING_KEYWORDS.some((kw) => lower.includes(kw));
  }).length;

  if (timingErrors > keywordHits) return null;

  const confidence = Math.min(1, keywordHits / Math.max(test.history.length, 1) * 0.6 + 0.3);

  return {
    type: 'assertion_flaky',
    indicators,
    confidence: Math.round(confidence * 100) / 100,
    description: `断言不稳定：${keywordHits} 次运行出现断言相关错误`,
  };
}

/**
 * 计算变异系数（Coefficient of Variation）
 * CV = 标准差 / 均值，衡量数据相对波动程度
 * @param values - 数值数组
 * @returns 变异系数，数据不足时返回 0
 */
function calculateCoefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;

  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/**
 * 计算线性趋势斜率
 * 使用最小二乘法拟合直线，返回斜率
 * @param values - 按时间顺序排列的数值数组
 * @returns 归一化斜率，数据不足时返回 0
 */
function calculateTrendSlope(values: number[]): number {
  if (values.length < 3) return 0;

  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, v) => sum + v, 0) / n;

  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (i - meanX) * (values[i] - meanY);
    denominator += (i - meanX) ** 2;
  }

  if (denominator === 0) return 0;

  const slope = numerator / denominator;
  return meanY > 0 ? slope / meanY : 0;
}

/**
 * 判断时间戳是否呈聚集模式
 * 如果失败时间戳之间的间隔显著小于随机分布的期望间隔，
 * 则认为失败呈时间聚集
 * @param timestamps - 排序后的时间戳数组
 * @returns 是否呈聚集模式
 */
function isTimeClustered(timestamps: number[]): boolean {
  if (timestamps.length < 3) return false;

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }

  const meanInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
  const minInterval = Math.min(...intervals);

  if (meanInterval === 0) return false;

  const shortIntervals = intervals.filter((v) => v < meanInterval * 0.3).length;
  return shortIntervals >= intervals.length * 0.5;
}

/**
 * 根据根因类型生成建议操作
 * @param causeType - 根因类型
 * @returns 建议操作列表
 */
function generateSuggestedActions(causeType: RootCauseType): string[] {
  const actionMap: Record<RootCauseType, string[]> = {
    timing: [
      '增加测试超时时间',
      '添加显式等待（waitFor）替代固定等待',
      '检查页面加载性能',
      '考虑使用 retry 机制',
    ],
    data_race: [
      '检查测试间的共享状态',
      '确保测试数据独立性',
      '避免依赖全局状态或单例',
      '使用 test.beforeEach 重置状态',
    ],
    environment: [
      '检查 CI 环境配置差异',
      '确保测试环境一致性',
      '检查特定时间段资源竞争',
      '考虑增加 CI 资源或错峰运行',
    ],
    external_service: [
      '添加服务健康检查前置条件',
      '使用 mock 替代外部服务调用',
      '增加网络请求重试机制',
      '检查外部服务 SLA 和稳定性',
    ],
    test_order: [
      '确保测试独立性，不依赖执行顺序',
      '检查测试间的状态泄漏',
      '使用 test.beforeEach/afterEach 清理状态',
      '考虑将依赖测试合并或拆分',
    ],
    resource_leak: [
      '检查未关闭的连接和文件句柄',
      '确保 afterAll/afterEach 正确清理资源',
      '监控测试过程中的内存使用',
      '检查页面/浏览器实例是否正确关闭',
    ],
    assertion_flaky: [
      '检查断言中的浮点数比较',
      '避免依赖精确时间匹配',
      '使用更宽松的匹配器（toBeCloseTo 等）',
      '检查动态内容的断言方式',
    ],
    unknown: [
      '收集更多运行数据以辅助分析',
      '检查测试代码中的非确定性逻辑',
      '考虑添加更多日志和诊断信息',
    ],
  };

  return actionMap[causeType] || actionMap.unknown;
}

/**
 * 根因分析器
 * 综合多种启发式规则和统计方法，判断 Flaky 测试的根因
 */
export class RootCauseAnalyzer {
  /**
   * 对单个 Flaky 测试进行根因分析
   * 依次运行所有检测器，返回置信度最高的根因
   * @param test - Flaky 测试对象
   * @param context - 分析上下文
   * @returns 根因分析结果
   */
  analyze(test: FlakyTest, context: AnalysisContext): RootCauseAnalysis {
    const evidenceList: RootCauseEvidence[] = [];

    const timing = detectTimingIssue(test);
    if (timing) evidenceList.push(timing);

    const dataRace = detectDataRace(test, context);
    if (dataRace) evidenceList.push(dataRace);

    const environment = detectEnvironmentDependency(test, context);
    if (environment) evidenceList.push(environment);

    const externalService = detectExternalService(test);
    if (externalService) evidenceList.push(externalService);

    const testOrder = detectTestOrderDependency(test, context);
    if (testOrder) evidenceList.push(testOrder);

    const resourceLeak = detectResourceLeak(test);
    if (resourceLeak) evidenceList.push(resourceLeak);

    const assertionFlaky = detectAssertionFlaky(test);
    if (assertionFlaky) evidenceList.push(assertionFlaky);

    evidenceList.sort((a, b) => b.confidence - a.confidence);

    const primaryCause = evidenceList.length > 0 ? evidenceList[0].type : 'unknown';
    const confidence = evidenceList.length > 0 ? evidenceList[0].confidence : 0;

    return {
      testId: test.testId,
      primaryCause,
      confidence,
      evidence: evidenceList,
      suggestedActions: generateSuggestedActions(primaryCause),
      analyzedAt: Date.now(),
    };
  }
}
