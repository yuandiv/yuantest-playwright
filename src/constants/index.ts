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
} as const;

export const FLAKY_CONFIG = {
  DEFAULT_THRESHOLD: 0.3,
  HIGH_THRESHOLD: 0.5,
  MAX_HISTORY_ENTRIES: 50,
  MINIMUM_RUNS_FOR_QUARANTINE: 5,
  AUTO_RELEASE_AFTER_PASSES: 3,
  QUARANTINE_EXPIRY_DAYS: 30,
  DECAY_RATE: 0.1,
  CONFIDENCE_LEVEL: 0.95,
  BROKEN_CONSECUTIVE_THRESHOLD: 3,
  REGRESSION_WINDOW: 5,
  CORRELATION_CO_OCCURRENCE_THRESHOLD: 0.6,
  CORRELATION_MIN_RUNS: 3,
} as const;

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
