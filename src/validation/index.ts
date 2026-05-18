import { z } from 'zod';
import { DEFAULTS, FLAKY_CONFIG, FILE_PATTERNS } from '../constants';

const BrowserTypeSchema = z.enum(['chromium', 'firefox', 'webkit']);

const TraceModeSchema = z.enum(['off', 'on', 'retain-on-failure', 'on-first-retry']);

const ScreenshotModeSchema = z.enum(['off', 'on', 'only-on-failure']);

const VideoModeSchema = z.enum(['off', 'on', 'retain-on-failure', 'on-first-retry']);

const _AnnotationTypeSchema = z.enum([
  'skip',
  'only',
  'fail',
  'slow',
  'fixme',
  'todo',
  'serial',
  'parallel',
]);

const TraceConfigSchema = z.object({
  enabled: z.boolean().default(false),
  mode: TraceModeSchema.default('on-first-retry'),
  screenshots: z.boolean().default(true),
  snapshots: z.boolean().default(true),
  sources: z.boolean().default(true),
  attachments: z.boolean().default(true),
  outputDir: z.string().optional(),
});

const ArtifactConfigSchema = z.object({
  enabled: z.boolean().default(false),
  screenshots: ScreenshotModeSchema.default('only-on-failure'),
  videos: VideoModeSchema.default('retain-on-failure'),
  downloads: z.boolean().optional(),
  outputDir: z.string().optional(),
  maxFileSize: z.number().optional(),
});

const VisualTestingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  threshold: z.number().min(0).max(1).default(0.2),
  maxDiffPixelRatio: z.number().min(0).max(1).default(0.01),
  maxDiffPixels: z.number().int().min(0).default(10),
  updateSnapshots: z.boolean().default(false),
  compareWith: z.string().optional(),
  outputDir: z.string().optional(),
});

const AnnotationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  respectSkip: z.boolean().default(true),
  respectOnly: z.boolean().default(true),
  respectFail: z.boolean().default(true),
  respectSlow: z.boolean().default(true),
  respectFixme: z.boolean().default(true),
  customAnnotations: z
    .record(
      z.object({
        action: z.enum(['skip', 'fail', 'slow', 'mark']),
      })
    )
    .optional(),
});

const TagConfigSchema = z.object({
  enabled: z.boolean().default(false),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  require: z.array(z.string()).optional(),
});

const QuarantineConfigSchema = z.object({
  enabled: z.boolean().default(true),
  threshold: z.number().min(0).max(1).default(FLAKY_CONFIG.DEFAULT_THRESHOLD),
  autoQuarantine: z.boolean().default(false),
});

export const TestConfigSchema = z.object({
  version: z.string().min(1, 'Version is required'),
  testDir: z.string().min(1, 'Test directory is required'),
  outputDir: z.string().default(DEFAULTS.OUTPUT_DIR),
  baseURL: z.string().url().optional(),
  retries: z.number().int().min(0).default(DEFAULTS.TEST_RETRIES),
  timeout: z.number().int().positive().default(DEFAULTS.TEST_TIMEOUT),
  workers: z.number().int().positive().default(DEFAULTS.WORKERS),
  shards: z.number().int().positive().default(DEFAULTS.SHARDS),
  reporters: z.array(z.string()).optional(),
  browsers: z.array(BrowserTypeSchema).default([...DEFAULTS.BROWSERS]),
  headers: z.record(z.string()).optional(),
  flakyThreshold: z.number().min(0).max(1).default(FLAKY_CONFIG.DEFAULT_THRESHOLD),
  isolateFlaky: z.boolean().default(false),
  traces: TraceConfigSchema.optional(),
  artifacts: ArtifactConfigSchema.optional(),
  visualTesting: VisualTestingConfigSchema.optional(),
  annotations: AnnotationConfigSchema.optional(),
  tags: TagConfigSchema.optional(),
  htmlReport: z.boolean().default(true),
  htmlReportDir: z.string().optional(),
  testMatch: z.array(z.string()).optional(),
  testIgnore: z.array(z.string()).optional(),
  ignoreDirs: z.array(z.string()).default([...FILE_PATTERNS.IGNORE_DIRS]),
  quarantine: QuarantineConfigSchema.optional(),
});

export const StartRunRequestSchema = z.object({
  version: z.string().optional(),
  testDir: z.string().optional(),
  testFiles: z.array(z.string()).optional(),
  testLocations: z.array(z.string()).optional(),
  testIds: z.array(z.string()).optional(),
  describePattern: z.string().optional(),
  grepPattern: z.string().optional(),
  tagFilter: z.array(z.string()).optional(),
  projectFilter: z.string().optional(),
  updateSnapshots: z.boolean().optional(),
});

export const SetTestDirRequestSchema = z.object({
  testDir: z.string().min(1, 'testDir is required'),
});

const FlakyCriteriaSchema = z.object({
  minimumRuns: z.number().int().min(1).optional(),
  flakyThreshold: z.number().min(0).max(1).optional(),
  monitorThreshold: z.number().min(0).max(1).optional(),
  stableThreshold: z.number().min(0).max(1).optional(),
  highThreshold: z.number().min(0).max(1).optional(),
  brokenConsecutiveThreshold: z.number().int().min(1).optional(),
  regressionWindow: z.number().int().min(1).optional(),
  regressionRecentFailRate: z.number().min(0).max(1).optional(),
  regressionOlderFailRate: z.number().min(0).max(1).optional(),
  decayRate: z.number().min(0).max(1).optional(),
  confidenceLevel: z.number().min(0).max(1).optional(),
  autoReleaseAfterPasses: z.number().int().min(1).optional(),
});

const QuarantineCriteriaSchema = z.object({
  softThreshold: z.number().min(0).max(1).optional(),
  hardThreshold: z.number().min(0).max(1).optional(),
  maxQuarantineRatio: z.number().min(0).max(1).optional(),
  autoReleaseHardQuarantinePasses: z.number().int().min(1).optional(),
  quarantineExpiryDays: z.number().int().min(1).optional(),
  quarantineExpiryDowngrade: z.boolean().optional(),
  retryMax: z.number().int().min(0).optional(),
  retryDelayMs: z.number().int().min(0).optional(),
  retryBackoff: z.number().min(0).optional(),
});

export const SavePreferencesRequestSchema = z.object({
  lang: z.enum(['zh', 'en']).optional(),
  lastVersion: z.string().optional(),
  testDir: z.string().optional(),
  flakyCriteria: FlakyCriteriaSchema.optional(),
  quarantineCriteria: QuarantineCriteriaSchema.optional(),
});

export type TestConfigInput = z.infer<typeof TestConfigSchema>;
export type StartRunRequestInput = z.infer<typeof StartRunRequestSchema>;
export type SetTestDirRequestInput = z.infer<typeof SetTestDirRequestSchema>;
export type SavePreferencesRequestInput = z.infer<typeof SavePreferencesRequestSchema>;

export function validateTestConfig(config: unknown) {
  return TestConfigSchema.safeParse(config);
}

export function validateStartRunRequest(data: unknown) {
  return StartRunRequestSchema.safeParse(data);
}

export function validateSetTestDirRequest(data: unknown) {
  return SetTestDirRequestSchema.safeParse(data);
}

export function validateSavePreferencesRequest(data: unknown) {
  return SavePreferencesRequestSchema.safeParse(data);
}

export function getDefaultConfig(): Partial<TestConfigInput> {
  return {
    outputDir: DEFAULTS.OUTPUT_DIR,
    retries: DEFAULTS.TEST_RETRIES,
    timeout: DEFAULTS.TEST_TIMEOUT,
    workers: DEFAULTS.WORKERS,
    shards: DEFAULTS.SHARDS,
    browsers: [...DEFAULTS.BROWSERS],
    flakyThreshold: FLAKY_CONFIG.DEFAULT_THRESHOLD,
    htmlReport: true,
    ignoreDirs: [...FILE_PATTERNS.IGNORE_DIRS],
  };
}
