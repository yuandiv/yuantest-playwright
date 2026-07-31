export const DEFAULTS = {
  TEST_TIMEOUT: 30000,
  TEST_RETRIES: 0,
  WORKERS: 1,
  SHARDS: 1,
  BROWSERS: ['chromium'] as const,
  PROJECT_NAME: 'test-project',
  OUTPUT_DIR: './test-output',
  TEST_DIR: './',
  DATA_DIR: './test-data',
  REPORTS_DIR: './test-reports',
} as const;

export const CACHE_CONFIG = {
  MAX_REPORT_CACHE_SIZE: 50,
  MAX_COMPLETED_RUNS: 10,
  TEST_DISCOVERY_TTL: 300000,
  SAVE_DELAY_MS: 1000,
  FLUSH_INTERVAL_MS: 500,
  MAX_QUEUE_SIZE: 500,
  DISCOVERY_MAX_STDOUT_SIZE: 50 * 1024 * 1024,
  DISCOVERY_LARGE_TEST_THRESHOLD: 5000,
  DISCOVERY_VERBOSE_LOG_THRESHOLD: 1000,
} as const;

export const FLAKY_CONFIG = {
  DEFAULT_THRESHOLD: 0.3,
  MONITOR_THRESHOLD: 0.1,
  HIGH_THRESHOLD: 0.5,
  MAX_HISTORY_ENTRIES: 50,
  MINIMUM_RUNS_FOR_QUARANTINE: 5,
  AUTO_RELEASE_AFTER_PASSES: 3,
  AUTO_RELEASE_HARD_QUARANTINE_PASSES: 5,
  QUARANTINE_EXPIRY_DAYS: 30,
  QUARANTINE_EXPIRY_DOWNGRADE: true,
  DECAY_RATE: 0.1,
  CONFIDENCE_LEVEL: 0.95,
  BROKEN_CONSECUTIVE_THRESHOLD: 5,
  REGRESSION_WINDOW: 5,
  CORRELATION_CO_OCCURRENCE_THRESHOLD: 0.6,
  CORRELATION_MIN_RUNS: 3,
  TREND_AGGREGATION_WINDOW_DAYS: 7,
  TREND_MIN_DATA_POINTS: 5,
  TREND_CHANGE_POINT_THRESHOLD: 0.3,
  TREND_SEASONAL_MIN_CYCLES: 3,
  PREDICTION_WINDOW_RUNS: 10,
  PREDICTION_DURATION_ANOMALY_ZSCORE: 2.0,
  PREDICTION_MIN_HISTORY: 8,
  PREDICTION_SENSITIVITY: 0.5,
  QUARANTINE_MAX_RATIO: 0.2,
  QUARANTINE_SOFT_THRESHOLD: 0.15,
  QUARANTINE_HARD_THRESHOLD: 0.4,
  QUARANTINE_RETRY_MAX: 3,
  QUARANTINE_RETRY_DELAY_MS: 1000,
  QUARANTINE_RETRY_BACKOFF: 2,
  CAUSAL_MIN_CORRELATION: 0.4,
  CAUSAL_MAX_DEPTH: 5,
  HEALTH_SCORE_WEIGHTS: {
    stability: 0.35,
    trend: 0.25,
    recoverability: 0.2,
    predictability: 0.2,
  },
} as const;

export const DEFAULT_FLAKY_CRITERIA: import('@yuantest/contracts').FlakyCriteriaConfig = {
  minimumRuns: FLAKY_CONFIG.MINIMUM_RUNS_FOR_QUARANTINE,
  flakyThreshold: FLAKY_CONFIG.DEFAULT_THRESHOLD,
  monitorThreshold: FLAKY_CONFIG.MONITOR_THRESHOLD,
  stableThreshold: 0.05,
  highThreshold: FLAKY_CONFIG.HIGH_THRESHOLD,
  brokenConsecutiveThreshold: FLAKY_CONFIG.BROKEN_CONSECUTIVE_THRESHOLD,
  regressionWindow: FLAKY_CONFIG.REGRESSION_WINDOW,
  regressionRecentFailRate: 0.6,
  regressionOlderFailRate: 0.2,
  decayRate: FLAKY_CONFIG.DECAY_RATE,
  confidenceLevel: FLAKY_CONFIG.CONFIDENCE_LEVEL,
  autoReleaseAfterPasses: FLAKY_CONFIG.AUTO_RELEASE_AFTER_PASSES,
};

export const DEFAULT_QUARANTINE_CRITERIA: import('@yuantest/contracts').QuarantineCriteriaConfig = {
  softThreshold: FLAKY_CONFIG.QUARANTINE_SOFT_THRESHOLD,
  hardThreshold: FLAKY_CONFIG.QUARANTINE_HARD_THRESHOLD,
  maxQuarantineRatio: FLAKY_CONFIG.QUARANTINE_MAX_RATIO,
  autoReleaseHardQuarantinePasses: FLAKY_CONFIG.AUTO_RELEASE_HARD_QUARANTINE_PASSES,
  quarantineExpiryDays: FLAKY_CONFIG.QUARANTINE_EXPIRY_DAYS,
  quarantineExpiryDowngrade: FLAKY_CONFIG.QUARANTINE_EXPIRY_DOWNGRADE,
  retryMax: FLAKY_CONFIG.QUARANTINE_RETRY_MAX,
  retryDelayMs: FLAKY_CONFIG.QUARANTINE_RETRY_DELAY_MS,
  retryBackoff: FLAKY_CONFIG.QUARANTINE_RETRY_BACKOFF,
};

export const WEBSOCKET_CONFIG = {
  RECONNECT_BASE_DELAY: 1000,
  RECONNECT_MAX_DELAY: 30000,
  MAX_RECONNECT_ATTEMPTS: 10,
} as const;

export const FILE_PATTERNS = {
  TEST_EXTENSIONS: ['.spec.ts', '.spec.tsx', '.test.ts', '.test.tsx'] as const,
  CONFIG_NAMES: [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mts',
    'playwright.config.mjs',
  ] as const,
  IGNORE_DIRS: [
    'node_modules',
    '__snapshots__',
    '__image_snapshots__',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
    '.output',
    '.svelte-kit',
  ] as const,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
} as const;

export const PROGRESS_MARKER = '__PW_PROGRESS__';

export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;
