import {
  DEFAULTS,
  CACHE_CONFIG,
  FLAKY_CONFIG,
  WEBSOCKET_CONFIG,
  FILE_PATTERNS,
  HTTP_STATUS,
  LOG_LEVELS,
} from '../../src/constants';

describe('Constants', () => {
  describe('DEFAULTS', () => {
    it('should have correct default values', () => {
      expect(DEFAULTS.TEST_TIMEOUT).toBe(30000);
      expect(DEFAULTS.TEST_RETRIES).toBe(0);
      expect(DEFAULTS.WORKERS).toBe(1);
      expect(DEFAULTS.SHARDS).toBe(1);
      expect(DEFAULTS.BROWSERS).toEqual(['chromium']);
      expect(DEFAULTS.PROJECT_NAME).toBe('test-project');
      expect(DEFAULTS.OUTPUT_DIR).toBe('./test-output');
      expect(DEFAULTS.TEST_DIR).toBe('./');
      expect(DEFAULTS.DATA_DIR).toBe('./test-data');
      expect(DEFAULTS.REPORTS_DIR).toBe('./test-reports');
    });

    it('should have browsers array with correct values', () => {
      expect(DEFAULTS.BROWSERS).toEqual(['chromium']);
      expect(DEFAULTS.BROWSERS.length).toBe(1);
    });
  });

  describe('CACHE_CONFIG', () => {
    it('should have correct cache configuration', () => {
      expect(CACHE_CONFIG.MAX_REPORT_CACHE_SIZE).toBe(50);
      expect(CACHE_CONFIG.MAX_COMPLETED_RUNS).toBe(10);
      expect(CACHE_CONFIG.TEST_DISCOVERY_TTL).toBe(60000);
      expect(CACHE_CONFIG.SAVE_DELAY_MS).toBe(1000);
      expect(CACHE_CONFIG.FLUSH_INTERVAL_MS).toBe(500);
      expect(CACHE_CONFIG.MAX_QUEUE_SIZE).toBe(500);
    });
  });

  describe('FLAKY_CONFIG', () => {
    it('should have correct flaky configuration', () => {
      expect(FLAKY_CONFIG.DEFAULT_THRESHOLD).toBe(0.3);
      expect(FLAKY_CONFIG.HIGH_THRESHOLD).toBe(0.5);
      expect(FLAKY_CONFIG.MAX_HISTORY_ENTRIES).toBe(50);
    });
  });

  describe('WEBSOCKET_CONFIG', () => {
    it('should have correct websocket configuration', () => {
      expect(WEBSOCKET_CONFIG.RECONNECT_BASE_DELAY).toBe(1000);
      expect(WEBSOCKET_CONFIG.RECONNECT_MAX_DELAY).toBe(30000);
      expect(WEBSOCKET_CONFIG.MAX_RECONNECT_ATTEMPTS).toBe(10);
    });
  });

  describe('FILE_PATTERNS', () => {
    it('should have correct test extensions', () => {
      expect(FILE_PATTERNS.TEST_EXTENSIONS).toContain('.spec.ts');
      expect(FILE_PATTERNS.TEST_EXTENSIONS).toContain('.spec.tsx');
      expect(FILE_PATTERNS.TEST_EXTENSIONS).toContain('.test.ts');
      expect(FILE_PATTERNS.TEST_EXTENSIONS).toContain('.test.tsx');
    });

    it('should have correct config names', () => {
      expect(FILE_PATTERNS.CONFIG_NAMES).toContain('playwright.config.ts');
      expect(FILE_PATTERNS.CONFIG_NAMES).toContain('playwright.config.js');
    });

    it('should have correct ignore dirs', () => {
      expect(FILE_PATTERNS.IGNORE_DIRS).toContain('node_modules');
      expect(FILE_PATTERNS.IGNORE_DIRS).toContain('.git');
      expect(FILE_PATTERNS.IGNORE_DIRS).toContain('dist');
    });
  });

  describe('HTTP_STATUS', () => {
    it('should have correct HTTP status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.INTERNAL_ERROR).toBe(500);
    });
  });

  describe('LOG_LEVELS', () => {
    it('should have correct log level values', () => {
      expect(LOG_LEVELS.DEBUG).toBe(0);
      expect(LOG_LEVELS.INFO).toBe(1);
      expect(LOG_LEVELS.WARN).toBe(2);
      expect(LOG_LEVELS.ERROR).toBe(3);
    });
  });
});
