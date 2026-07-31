import {
  TestConfigSchema,
  StartRunRequestSchema,
  SetTestDirRequestSchema,
  SavePreferencesRequestSchema,
  validateTestConfig,
  validateStartRunRequest,
  validateSetTestDirRequest,
  validateSavePreferencesRequest,
  getDefaultConfig,
} from '../../src/validation';

describe('Validation Module', () => {
  describe('TestConfigSchema', () => {
    it('should validate a valid config', () => {
      const config = {
        version: '1.0.0',
        testDir: './',
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe('1.0.0');
        expect(result.data.testDir).toBe('./');
        expect(result.data.outputDir).toBe('./test-output');
        expect(result.data.timeout).toBe(30000);
      }
    });

    it('should reject config without version', () => {
      const config = {
        testDir: './',
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject config without testDir', () => {
      const config = {
        version: '1.0.0',
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid browser type', () => {
      const config = {
        version: '1.0.0',
        testDir: './',
        browsers: ['invalid-browser'],
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject negative timeout', () => {
      const config = {
        version: '1.0.0',
        testDir: './',
        timeout: -1000,
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid baseURL', () => {
      const config = {
        version: '1.0.0',
        testDir: './',
        baseURL: 'not-a-url',
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should accept valid browsers', () => {
      const config = {
        version: '1.0.0',
        testDir: './',
        browsers: ['chromium', 'firefox', 'webkit'],
      };
      const result = TestConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe('StartRunRequestSchema', () => {
    it('should validate empty request', () => {
      const result = StartRunRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should validate testFiles array', () => {
      const request = {
        testFiles: ['test1.spec.ts', 'test2.spec.ts'],
      };
      const result = StartRunRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate testLocations array', () => {
      const request = {
        testLocations: ['tests/login.spec.ts:10', 'tests/home.spec.ts:20'],
      };
      const result = StartRunRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should reject invalid browsers in request', () => {
      const request = {
        browsers: ['safari'],
      };
      const result = StartRunRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject negative retries', () => {
      const request = {
        retries: -1,
      };
      const result = StartRunRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('SetTestDirRequestSchema', () => {
    it('should validate valid testDir', () => {
      const result = SetTestDirRequestSchema.safeParse({ testDir: './' });
      expect(result.success).toBe(true);
    });

    it('should reject missing testDir', () => {
      const result = SetTestDirRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject empty testDir', () => {
      const result = SetTestDirRequestSchema.safeParse({ testDir: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('SavePreferencesRequestSchema', () => {
    it('should validate valid preferences', () => {
      const result = SavePreferencesRequestSchema.safeParse({
        lang: 'en',
        lastVersion: '1.0.0',
        testDir: './',
      });
      expect(result.success).toBe(true);
    });

    it('should validate partial preferences', () => {
      const result = SavePreferencesRequestSchema.safeParse({ lang: 'zh' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid lang', () => {
      const result = SavePreferencesRequestSchema.safeParse({ lang: 'fr' });
      expect(result.success).toBe(false);
    });
  });

  describe('validateTestConfig', () => {
    it('should return success for valid config', () => {
      const result = validateTestConfig({
        version: '1.0.0',
        testDir: './',
      });
      expect(result.success).toBe(true);
    });

    it('should return error for invalid config', () => {
      const result = validateTestConfig({});
      expect(result.success).toBe(false);
    });
  });

  describe('validateStartRunRequest', () => {
    it('should return success for valid request', () => {
      const result = validateStartRunRequest({ version: '1.0.0' });
      expect(result.success).toBe(true);
    });
  });

  describe('validateSetTestDirRequest', () => {
    it('should return success for valid request', () => {
      const result = validateSetTestDirRequest({ testDir: './' });
      expect(result.success).toBe(true);
    });

    it('should return error for missing testDir', () => {
      const result = validateSetTestDirRequest({});
      expect(result.success).toBe(false);
    });
  });

  describe('validateSavePreferencesRequest', () => {
    it('should return success for valid request', () => {
      const result = validateSavePreferencesRequest({ lang: 'en' });
      expect(result.success).toBe(true);
    });
  });

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const defaults = getDefaultConfig();
      expect(defaults.outputDir).toBe('./test-output');
      expect(defaults.retries).toBe(0);
      expect(defaults.timeout).toBe(30000);
      expect(defaults.workers).toBe(1);
      expect(defaults.shards).toBe(1);
      expect(defaults.browsers).toEqual(['chromium']);
      expect(defaults.flakyThreshold).toBe(0.3);
      expect(defaults.htmlReport).toBe(true);
    });
  });
});
