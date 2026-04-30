import { DiagnosisService } from '../../src/diagnosis';
import { LLMConfig } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('LLM Config API Integration', () => {
  let tmpDir: string;
  let service: DiagnosisService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-integration-test-'));
    originalFetch = global.fetch;
    service = new DiagnosisService(tmpDir);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe('config persistence', () => {
    it('should persist config to llm-config.json and reload on new instance', async () => {
      const config: LLMConfig = {
        enabled: true,
        apiKey: 'sk-test-key-1234',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: 'Local Qwen3',
        maxTokens: 2048,
        temperature: 0.3,
      };

      await service.saveConfig(config);

      const configPath = path.join(tmpDir, 'llm-config.json');
      expect(fs.existsSync(configPath)).toBe(true);

      const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(rawConfig.enabled).toBe(true);
      expect(rawConfig.model).toBe('qwen3:32b');
      expect(rawConfig.apiKey).toBe('sk-test-key-1234');

      const newService = new DiagnosisService(tmpDir);
      const loaded = newService.getMaskedConfig();
      expect(loaded.enabled).toBe(true);
      expect(loaded.model).toBe('qwen3:32b');
      expect(loaded.apiKey).toBe('sk-test-key-1234');
    });

    it('should return default config when no config file exists', () => {
      const config = service.getMaskedConfig();
      expect(config.enabled).toBe(false);
      expect(config.baseUrl).toBe('http://localhost:11434');
      expect(config.model).toBe('');
      expect(config.apiKey).toBe('');
      expect(config.maxTokens).toBe(2048);
      expect(config.temperature).toBe(0.3);
    });

    it('should update config fields independently', async () => {
      await service.saveConfig({
        enabled: true,
        apiKey: 'sk-original',
        baseUrl: 'http://localhost:11434',
        model: 'qwen3:32b',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const masked = service.getMaskedConfig();
      await service.saveConfig({
        ...masked,
        model: 'gemma4:27b',
        temperature: 0.5,
      });

      const updated = service.getMaskedConfig();
      expect(updated.model).toBe('gemma4:27b');
      expect(updated.temperature).toBe(0.5);
      expect(updated.apiKey).toBe('sk-original');
    });
  });

  describe('diagnosis flow', () => {
    it('should return not-enabled when LLM is disabled', async () => {
      const result = await service.diagnose({
        title: 'Test fails',
        error: 'Timeout waiting for element',
      });

      expect(result.summary).toBeDefined();
      expect(result.confidence).toBe(0);
    });

    it('should complete full diagnosis flow with mocked LLM', async () => {
      const diagnosisResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              summary: 'Element selector timeout',
              rootCause: 'The target element was not rendered within the timeout period',
              suggestions: [
                'Increase the timeout value in the test',
                'Add a waitForSelector before interacting',
                'Check if the page is fully loaded',
              ],
              confidence: 0.88,
            }),
          },
        }],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(diagnosisResponse),
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
        title: 'Login button not found',
        error: 'Timeout waiting for selector #login-btn',
        stackTrace: 'at Object.<anonymous> (tests/login.spec.ts:15:5)',
        filePath: 'tests/login.spec.ts',
        lineNumber: 15,
      });

      expect(result.summary).toBe('Element selector timeout');
      expect(result.rootCause).toContain('timeout period');
      expect(result.suggestions).toHaveLength(3);
      expect(result.confidence).toBe(0.88);
      expect(result.model).toBe('qwen3:32b');
      expect(result.timestamp).toBeGreaterThan(0);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.model).toBe('qwen3:32b');
      expect(body.messages).toBeDefined();
      expect(body.messages.length).toBeGreaterThan(0);
    });

    it('should use cache on second diagnosis of same test', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: JSON.stringify({
                  summary: 'Test summary',
                  rootCause: 'Root cause',
                  suggestions: ['Fix it'],
                  confidence: 0.7,
                }),
              },
            }],
          }),
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
        error: 'Error',
      });
      expect(callCount).toBe(1);

      const result2 = await service.diagnose({
        title: 'Test case',
        error: 'Error',
      });
      expect(callCount).toBe(1);
      expect(result1.summary).toBe(result2.summary);
    });

    it('should clear cache when config changes', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: JSON.stringify({
                  summary: 'Cached result',
                  rootCause: 'Root cause',
                  suggestions: ['Fix'],
                  confidence: 0.9,
                }),
              },
            }],
          }),
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
        remark: 'updated',
        maxTokens: 2048,
        temperature: 0.3,
      });

      await service.diagnose({ title: 'Test', error: 'Error' });
      expect(callCount).toBe(2);
    });
  });

  describe('connection status', () => {
    it('should return yellow status when not configured', async () => {
      const status = await service.getStatus();
      expect(status.configured).toBe(false);
      expect(status.connected).toBe(false);
      expect(status.status).toBe('yellow');
    });

    it('should return green status when configured and reachable', async () => {
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
      expect(status.configured).toBe(true);
      expect(status.connected).toBe(true);
      expect(status.status).toBe('green');
    });

    it('should return red status when configured but unreachable', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

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
      expect(status.configured).toBe(true);
      expect(status.connected).toBe(false);
      expect(status.status).toBe('red');
    });

    it('should return yellow when enabled but missing model', async () => {
      await service.saveConfig({
        enabled: true,
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: '',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      const status = await service.getStatus();
      expect(status.configured).toBe(false);
      expect(status.status).toBe('yellow');
    });
  });

  describe('test connection', () => {
    it('should test connection with custom config', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

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
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/models',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it('should test connection with API key', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.testConnection({
        enabled: true,
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com',
        model: 'gpt-4o',
        remark: '',
        maxTokens: 2048,
        temperature: 0.3,
      });

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer sk-test-key',
          }),
        })
      );
    });
  });
});
