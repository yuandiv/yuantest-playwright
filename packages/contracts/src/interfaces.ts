/**
 * 包间接口定义（contracts 核心价值）
 *
 * 这些接口是各包之间唯一的协作契约：
 * - 实现方 / 消费方见架构文档 §2 表
 * - 接口签名需与实现对齐，新增/变更接口时应同步实现
 * - 各包只允许 import 本文件定义的类型，禁止跨包运行时 import
 */
import type {
  AIDiagnosis,
  Annotation,
  Artifact,
  FlakyTest,
  RootCauseAnalysis,
  RunResult,
  TagInfo,
  TestConfig,
  TestResult,
  VisualTestResult,
} from './index';

/** Executor.execute 的选项（与 apps/cli/src/executor 对齐） */
export interface ExecutorRunOptions {
  shardIndex?: number;
  shardTotal?: number;
  grepPattern?: string;
  tagFilter?: string[];
  updateSnapshots?: boolean;
  projectFilter?: string;
  testFiles?: string[];
  testLocations?: string[];
  parentRunId?: string;
}

/** 失败诊断的输入信息 */
export interface DiagnoseInput {
  title: string;
  error?: string;
  stackTrace?: string;
  filePath?: string;
  lineNumber?: number;
  screenshots?: string[];
  logs?: string[];
  browser?: string;
}

/**
 * ITestExecutor — 执行测试能力
 * 实现：@yuantest/executor 的 Executor；消费：@yuantest/ai（agent_execute 工具，经注入）
 */
export interface ITestExecutor {
  execute(config: TestConfig, options?: ExecutorRunOptions): Promise<RunResult>;
}

/**
 * IFlakyManager — flaky 隔离 / 分析
 * 实现：@yuantest/flaky 的 FlakyTestManager；消费：@yuantest/executor（quarantine 过滤，经注入）
 */
export interface IFlakyManager {
  getQuarantinedTests(): FlakyTest[];
  buildGrepInvertPattern(): string | null;
  isQuarantined(testId: string): boolean;
  recordTestResult(result: TestResult): Promise<void>;
  recordRunResults(runResult: RunResult): Promise<void>;
  /** 报告器统计 flaky 测试（阈值由实现内部决定） */
  getFlakyTests(threshold?: number): FlakyTest[];
}

/**
 * IFailureDiagnoser — 失败诊断能力
 * 实现：@yuantest/ai 的 DiagnosisAgent；消费：@yuantest/reporter（可选注入）、apps 层
 */
export interface IFailureDiagnoser {
  diagnose(
    testInfo: DiagnoseInput,
    lang?: string,
    runId?: string,
    testId?: string,
    rootCauseData?: RootCauseAnalysis
  ): Promise<AIDiagnosis>;
}

/**
 * IResultEnrichers — 执行结果管理（artifacts / annotations / tags / visual）
 * 实现：@yuantest/reporter 的结果管理器；消费：@yuantest/executor（经 apps 层注入）
 * executor 不直接 new 这些管理器，由 apps 组合根按配置创建后传入。
 */
export interface IAnnotationManager {
  scanDirectory(testDir: string): Promise<Annotation[]>;
  getSummary(): {
    total: number;
    byType: Record<string, number>;
    byFile: Record<string, number>;
  };
}

export interface ITagManager {
  scanDirectory(testDir: string): Promise<TagInfo[]>;
  getSummary(): {
    totalTags: number;
    totalTaggedTests: number;
    tags: { name: string; count: number }[];
  };
  buildGrepPattern(include?: string[], exclude?: string[]): string;
}

export interface IArtifactManager {
  initialize(): Promise<void>;
  discoverArtifacts(runId?: string): Promise<Artifact[]>;
}

export interface IVisualTestingManager {
  initialize(): Promise<void>;
  runVisualTests(testIds: string[]): Promise<VisualTestResult[]>;
  getSummary(): {
    total: number;
    identical: number;
    different: number;
    new: number;
    missing: number;
    regression: number;
    passRate: number;
  };
}

export interface IResultEnrichers {
  annotations?: IAnnotationManager;
  tags?: ITagManager;
  artifacts?: IArtifactManager;
  visual?: IVisualTestingManager;
}
