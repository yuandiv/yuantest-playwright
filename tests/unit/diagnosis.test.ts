import { DiagnosisService } from '../../src/diagnosis';
import { LLMConfig, AIDiagnosis } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DiagnosisService', () => {
  let tmpDir: string;
  let service: DiagnosisService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnosis-test-'));
    originalFetch = global.fetch;
    service = new DiagnosisService(tmpDir);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('constructor', () => {
    it('should create service with default config when no config file exists', () => {
      const config = service.getMaskedConfig();
      expect(config.enabled).toBe(false);
      expect(config.baseUrl).toBe('http://localhost:11434');
      expect(config.model).toBe('');
      expect(config.apiKey).toBe('');
    });

    it('should handle corrupted config file gracefully', () => {
      fs.writeFileSync(path.join(tmpDir, 'llm-config.json'), 'invalid json{{{');
      const svc = new DiagnosisService(tmpDir);
      const config = svc.getMaskedConfig();
      expect(config.enabled).toBe(false);
    });

    it('should load existing config file', async () => {
      const config: LLMConfig = {
        enabled: true,
        apiKey: 'sk-test123456',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: 'test',
        maxTokens: 2048,
        temperature: 0.3,
      };
      await service.saveConfig(config);
      const svc = new DiagnosisService(tmpDir);
      const loaded = svc.getMaskedConfig();
      expect(loaded.enabled).toBe(true);
      expect(loaded.model).toBe('qwen3:32b');
    });
  });

  describe('saveConfig / getMaskedConfig', () => {
    it('should save and load config', async () => {
      const config: LLMConfig = {
        enabled: true,
        apiKey: 'sk-test123456',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: 'test',
        maxTokens: 2048,
        temperature: 0.3,
      };
      await service.saveConfig(config);
      const loaded = service.getMaskedConfig();
      expect(loaded.enabled).toBe(true);
      expect(loaded.model).toBe('qwen3:32b');
      expect(loaded.baseUrl).toBe('http://localhost:11434');
    });

    it('should return original apiKey in getMaskedConfig', async () => {
      await service.saveConfig({
        enabled: true,
        apiKey: 'sk-test123456',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });
      const config = service.getMaskedConfig();
      expect(config.apiKey).toBe('sk-test123456');
    });

    it('should handle short apiKey', async () => {
      await service.saveConfig({
        enabled: true,
        apiKey: 'ab',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });
      const config = service.getMaskedConfig();
      expect(config.apiKey).toBe('ab');
    });

    it('should handle empty apiKey masking', async () => {
      const masked = service.getMaskedConfig();
      expect(masked.apiKey).toBe('');
    });

    it('should preserve original apiKey when saving config', async () => {
      await service.saveConfig({
        enabled: true,
        apiKey: 'sk-original-secret-key',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const config = service.getMaskedConfig();
      await service.saveConfig({
        ...config,
        temperature: 0.5,
      });

      const reloaded = service.getMaskedConfig();
      expect(reloaded.apiKey).toBe('sk-original-secret-key');
      expect(reloaded.temperature).toBe(0.5);
    });
  });

  describe('diagnose', () => {
    it('should return not-enabled diagnosis when LLM is disabled', async () => {
      const result = await service.diagnose(
        {
          title: 'Test login fails',
          error: 'Timeout waiting for selector',
        },
        'en'
      );
      expect(result.summary).toContain('not enabled');
      expect(result.confidence).toBe(0);
    });

    it('should call LLM and return structured diagnosis when enabled', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Element not found',
                rootCause: 'Selector outdated after UI change',
                suggestions: ['Update selector', 'Add wait for element'],
                confidence: 0.85,
              }),
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const result = await service.diagnose({
        title: 'Test login fails',
        error: 'Timeout waiting for selector #login-btn',
        stackTrace: 'at Object.<anonymous> (test.ts:10:5)',
        filePath: 'tests/login.spec.ts',
        lineNumber: 10,
      });

      expect(result.summary).toBe('Element not found');
      expect(result.rootCause).toBe('Selector outdated after UI change');
      expect(result.suggestions).toHaveLength(2);
      expect(result.confidence).toBe(0.85);
      expect(result.model).toBe('qwen3:32b');
    });

    it('should handle LLM response with markdown code blocks', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: '```json\n' + JSON.stringify({
                summary: 'Test summary',
                rootCause: 'Root cause',
                suggestions: ['Fix it'],
                confidence: 0.7,
              }) + '\n```',
            },
          },
        ],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const result = await service.diagnose({
        title: 'Test case',
        error: 'Some error',
      });

      expect(result.summary).toBe('Test summary');
      expect(result.suggestions).toHaveLength(1);
    });

    it('should return error diagnosis when LLM call fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const result = await service.diagnose(
        {
          title: 'Test case',
          error: 'Some error',
        },
        'en'
      );

      expect(result.summary).toBe('Diagnosis failed');
      expect(result.rootCause).toContain('Connection refused');
    });

    it('should return error diagnosis when LLM returns non-ok status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      await service.saveConfig({
        enabled: true,
        apiKey: 'invalid-key',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const result = await service.diagnose(
        {
          title: 'Test case',
          error: 'Some error',
        },
        'en'
      );

      expect(result.summary).toBe('Diagnosis failed');
    });
  });

  describe('cache', () => {
    it('should cache diagnosis results', async () => {
      let callCount = 0;
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Cached result',
                rootCause: 'Root cause',
                suggestions: ['Fix'],
                confidence: 0.9,
              }),
            },
          },
        ],
      };

      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });
      });

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const result1 = await service.diagnose({
        title: 'Test case',
        error: 'Error message',
      });
      const result2 = await service.diagnose({
        title: 'Test case',
        error: 'Error message',
      });

      expect(callCount).toBe(1);
      expect(result1.summary).toBe(result2.summary);
    });

    it('should clear cache on saveConfig', async () => {
      let callCount = 0;
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'New result',
                rootCause: 'Root cause',
                suggestions: ['Fix'],
                confidence: 0.9,
              }),
            },
          },
        ],
      };

      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });
      });

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      await service.diagnose({ title: 'Test', error: 'Error' });
      expect(callCount).toBe(1);

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.5,
      });

      await service.diagnose({ title: 'Test', error: 'Error' });
      expect(callCount).toBe(2);
    });

    it('should clear cache via clearCache method', async () => {
      service.clearCache();
      const config = service.getMaskedConfig();
      expect(config).toBeDefined();
    });
  });

  describe('testConnection', () => {
    it('should return failure when service is unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.testConnection({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:19999',
        model: 'test',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should return success when API responds ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
      });

      const result = await service.testConnection({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      expect(result.success).toBe(true);
    });

    it('should return failure when API responds non-ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await service.testConnection({
        enabled: true,
        apiKey: 'bad-key',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });
  });

  describe('getStatus', () => {
    it('should return yellow when not configured', async () => {
      const status = await service.getStatus();
      expect(status.status).toBe('yellow');
      expect(status.configured).toBe(false);
    });

    it('should return red when configured but unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:19999',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const status = await service.getStatus();
      expect(status.status).toBe('red');
      expect(status.configured).toBe(true);
      expect(status.connected).toBe(false);
    });

    it('should return green when configured and reachable', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const status = await service.getStatus();
      expect(status.status).toBe('green');
      expect(status.configured).toBe(true);
      expect(status.connected).toBe(true);
    });
  });
});
