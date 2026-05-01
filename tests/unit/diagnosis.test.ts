import { DiagnosisService } from '../../src/diagnosis';
import { LLMConfig, AIDiagnosis, ContextUsed } from '../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** 辅助函数：创建启用 LLM 的配置 */
function createEnabledConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    enabled: true,
    apiKey: '',
    baseUrl: 'http://localhost:11434',
    model: 'qwen3:32b',
    remark: '',
    maxTokens: 2048,
    temperature: 0.3,
    ...overrides,
  };
}

/** 辅助函数：创建 LLM mock 响应（带新增字段） */
function createMockLLMResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: 'Element not found',
            rootCause: 'Selector outdated after UI change',
            suggestions: ['Update selector', 'Add wait for element'],
            confidence: 0.85,
            category: 'timeout',
            codeDiffs: [
              { filePath: 'tests/login.spec.ts', unifiedDiff: '@@ -10,1 +10,1 @@', description: 'Update selector' },
            ],
            docLinks: [
              { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
            ],
            ...overrides,
          }),
        },
      },
    ],
  };
}

/** 辅助函数：创建无 tool_calls 的 LLM mock 响应（模拟不支持 tool_calling） */
function createMockLLMResponseNoTools(content: string) {
  return {
    choices: [
      {
        message: {
          content,
          tool_calls: undefined,
        },
      },
    ],
  };
}

/** 辅助函数：创建带 tool_calls 的 LLM mock 响应（模拟支持 tool_calling） */
function createMockLLMResponseWithTools(toolCalls: Array<{ id: string; function: { name: string; arguments: string } }>, content: string | null = null) {
  return {
    choices: [
      {
        message: {
          content,
          tool_calls: toolCalls,
        },
      },
    ],
  };
}

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
      expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
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

  /**
   * 新增 AI 智能分析功能测试
   * 覆盖 calibrateConfidence、buildEnrichedPrompt、parseResponse 新增字段、降级模式、低置信度警告
   */
  describe('AI 智能分析 - calibrateConfidence', () => {
    /** 应在匹配知识库模式时提高校准置信度 */
    it('应在匹配知识库模式时提高校准置信度', async () => {
      const mockResponse = createMockLLMResponse({ confidence: 0.8, category: 'timeout' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test timeout',
        error: 'Timeout 30000ms exceeded waiting for selector ".btn"',
      });

      expect(result.category).toBe('timeout');
      expect(result.calibratedConfidence).toBeGreaterThan(0);
      expect(result.calibratedConfidence).toBeLessThanOrEqual(1);
    });

    /** 应在无上下文时校准置信度低于原始置信度 */
    it('应在无上下文时校准置信度低于原始置信度', async () => {
      const mockResponse = createMockLLMResponse({ confidence: 0.9 });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test unknown error',
        error: 'Something completely unexpected happened',
      });

      expect(result.calibratedConfidence).toBeLessThan(0.9);
    });

    /** 应在有截图和源代码上下文时增加校准置信度 */
    it('应在有截图和源代码上下文时增加校准置信度', async () => {
      const mockResponse = createMockLLMResponse({ confidence: 0.7 });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const testFilePath = path.join(tmpDir, 'test.spec.ts');
      fs.writeFileSync(testFilePath, 'const x = 1;\n');

      const result = await service.diagnose({
        title: 'Test with context',
        error: 'Timeout 30000ms exceeded',
        filePath: testFilePath,
        lineNumber: 1,
        stackTrace: 'at line 1',
        logs: ['console log 1'],
        browser: 'chromium',
      });

      expect(result.contextUsed.sourceCode).toBe(true);
      expect(result.contextUsed.stackTrace).toBe(true);
      expect(result.contextUsed.consoleLogs).toBe(true);
      expect(result.contextUsed.environmentInfo).toBe(true);
    });
  });

  describe('AI 智能分析 - buildEnrichedPrompt', () => {
    /** 生成的 prompt 应包含上下文信息 */
    it('生成的 prompt 应包含环境信息上下文', async () => {
      const mockResponse = createMockLLMResponse();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test with browser',
        error: 'Timeout 30000ms exceeded',
        browser: 'chromium',
      });

      expect(result.contextUsed.environmentInfo).toBe(true);
    });

    /** 生成的 prompt 应包含知识库 few-shot 示例 */
    it('生成的 prompt 应包含知识库 few-shot 示例', async () => {
      const mockResponse = createMockLLMResponse({ category: 'timeout' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test timeout',
        error: 'Timeout 30000ms exceeded waiting for selector ".btn"',
      });

      expect(result.category).toBe('timeout');
    });

    /** 中文模式应返回中文诊断结果 */
    it('中文模式应返回中文诊断结果', async () => {
      const mockResponse = createMockLLMResponse({
        summary: '元素未找到',
        rootCause: '选择器在 UI 变更后已过时',
        suggestions: ['更新选择器', '添加等待元素'],
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: '测试登录失败',
        error: 'Timeout 30000ms exceeded',
      }, 'zh');

      expect(result.summary).toBe('元素未找到');
    });
  });

  describe('AI 智能分析 - parseResponse 新增字段', () => {
    /** 应正确解析 category 字段 */
    it('应正确解析 category 字段', async () => {
      const mockResponse = createMockLLMResponse({ category: 'network' });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test network error',
        error: 'Request failed with CORS error',
      });

      expect(result.category).toBe('network');
    });

    /** 应正确解析 codeDiffs 字段 */
    it('应正确解析 codeDiffs 字段', async () => {
      const mockResponse = createMockLLMResponse({
        codeDiffs: [
          { filePath: 'tests/login.spec.ts', unifiedDiff: '@@ -10,1 +10,1 @@', description: 'Update selector' },
          { filePath: 'tests/home.spec.ts', unifiedDiff: '@@ -5,1 +5,1 @@', description: 'Fix wait' },
        ],
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test code diffs',
        error: 'Timeout 30000ms exceeded',
      });

      expect(result.codeDiffs).toHaveLength(2);
      expect(result.codeDiffs![0].filePath).toBe('tests/login.spec.ts');
    });

    /** 应正确解析 docLinks 字段 */
    it('应正确解析 docLinks 字段', async () => {
      const mockResponse = createMockLLMResponse({
        docLinks: [
          { title: 'Test Timeouts', url: 'https://playwright.dev/docs/test-timeouts' },
          { title: 'Selectors', url: 'https://playwright.dev/docs/selectors' },
        ],
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test doc links',
        error: 'Timeout 30000ms exceeded',
      });

      expect(result.docLinks).toHaveLength(2);
      expect(result.docLinks![0].title).toBe('Test Timeouts');
    });

    /** LLM 未返回 docLinks 时应从知识库模式中填充 */
    it('LLM 未返回 docLinks 时应从知识库模式中填充', async () => {
      const mockResponse = createMockLLMResponse({
        docLinks: undefined,
        category: 'timeout',
      });
      (mockResponse.choices[0].message as Record<string, unknown>).content = JSON.stringify({
        summary: 'Timeout error',
        rootCause: 'Page load too slow',
        suggestions: ['Increase timeout'],
        confidence: 0.8,
        category: 'timeout',
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test fallback doc links',
        error: 'Timeout 30000ms exceeded waiting for selector ".btn"',
      });

      expect(result.docLinks!.length).toBeGreaterThan(0);
    });

    /** 应正确解析 contextUsed 字段 */
    it('应正确解析 contextUsed 字段', async () => {
      const mockResponse = createMockLLMResponse();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test context used',
        error: 'Timeout 30000ms exceeded',
        browser: 'chromium',
      });

      expect(result.contextUsed).toBeDefined();
      expect(typeof result.contextUsed.environmentInfo).toBe('boolean');
    });

    /** LLM 未返回 category 时应从知识库模式推断 */
    it('LLM 未返回 category 时应从知识库模式推断', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Timeout error',
                rootCause: 'Page load too slow',
                suggestions: ['Increase timeout'],
                confidence: 0.8,
              }),
            },
          },
        ],
      };
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test category inference',
        error: 'Timeout 30000ms exceeded waiting for selector ".btn"',
      });

      expect(result.category).toBe('timeout');
    });

    /** 应正确解析 analysisMode 字段 */
    it('应正确解析 analysisMode 字段', async () => {
      const mockResponse = createMockLLMResponse();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test analysis mode',
        error: 'Timeout 30000ms exceeded',
      });

      expect(['agent', 'single', 'fallback']).toContain(result.analysisMode);
    });

    /** codeDiffs 中无效项应被过滤 */
    it('codeDiffs 中无效项应被过滤', async () => {
      const mockResponse = createMockLLMResponse({
        codeDiffs: [
          { filePath: 'valid.ts', unifiedDiff: '@@ -1,1 +1,1 @@', description: 'Valid diff' },
          { notFilePath: 'invalid.ts' },
          'string value',
        ],
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test invalid codeDiffs',
        error: 'Timeout 30000ms exceeded',
      });

      expect(result.codeDiffs).toHaveLength(1);
      expect(result.codeDiffs![0].filePath).toBe('valid.ts');
    });
  });

  describe('AI 智能分析 - 降级模式', () => {
    /** LLM 不支持 tool_calling 时应回退到单次调用模式 */
    it('LLM 不支持 tool_calling 时应回退到单次调用模式', async () => {
      const noToolResponse = {
        choices: [
          {
            message: {
              content: null,
              tool_calls: undefined,
            },
          },
        ],
      };

      const singleCallResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'Timeout error (fallback)',
                rootCause: 'Element not found (fallback)',
                suggestions: ['Wait for element (fallback)'],
                confidence: 0.6,
                category: 'timeout',
              }),
            },
          },
        ],
      };

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(noToolResponse),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(singleCallResponse),
        });
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test fallback mode',
        error: 'Timeout 30000ms exceeded',
      });

      expect(result.analysisMode).toBe('single');
      expect(result.summary).toContain('fallback');
    });

    /** Agent 循环出错时应降级到单次调用 */
    it('Agent 循环出错时应降级到单次调用', async () => {
      const singleCallResponse = createMockLLMResponseNoTools(
        JSON.stringify({
          summary: 'Fallback diagnosis',
          rootCause: 'Agent loop failed',
          suggestions: ['Check config'],
          confidence: 0.5,
          category: 'unknown',
        })
      );

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Agent loop error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(singleCallResponse),
        });
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test agent error fallback',
        error: 'Some error',
      });

      expect(result.summary).toBe('Fallback diagnosis');
      expect(result.analysisMode).toBe('single');
    });
  });

  describe('AI 智能分析 - 低置信度警告', () => {
    /** 低置信度时应自动追加"建议人工确认" */
    it('低置信度时应自动追加"建议人工确认"', async () => {
      const mockResponse = createMockLLMResponse({ confidence: 0.2 });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test low confidence',
        error: 'Something unexpected',
      }, 'zh');

      expect(result.calibratedConfidence).toBeLessThan(0.5);
      expect(result.suggestions.some(s => s.includes('建议人工确认'))).toBe(true);
    });

    /** 英文模式下低置信度应追加英文警告 */
    it('英文模式下低置信度应追加英文警告', async () => {
      const mockResponse = createMockLLMResponse({ confidence: 0.2 });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test low confidence en',
        error: 'Something unexpected',
      }, 'en');

      expect(result.calibratedConfidence).toBeLessThan(0.5);
      expect(result.suggestions.some(s => s.includes('manual review'))).toBe(true);
    });

    /** 高置信度时不应追加警告 */
    it('高置信度时不应追加警告', async () => {
      const mockResponse = createMockLLMResponse({ confidence: 0.95 });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await service.saveConfig(createEnabledConfig());

      const result = await service.diagnose({
        title: 'Test high confidence',
        error: 'Timeout 30000ms exceeded waiting for selector ".btn"',
      });

      expect(result.suggestions.some(s => s.includes('建议人工确认') || s.includes('manual review'))).toBe(false);
    });
  });

  describe('AI 智能分析 - diagnoseStream', () => {
    /** 流式诊断应在 LLM 未启用时返回错误事件 */
    it('流式诊断应在 LLM 未启用时返回错误事件', async () => {
      const events: string[] = [];
      for await (const event of service.diagnoseStream({
        title: 'Test stream',
        error: 'Some error',
      })) {
        events.push(event);
      }

      const parsed = events.map(e => JSON.parse(e.trim()));
      expect(parsed.some(e => e.type === 'error')).toBe(true);
    });

    /** 流式诊断应产生完整的事件序列 */
    it('流式诊断应产生完整的事件序列', async () => {
      const encoder = new TextEncoder();
      const chunk1 = JSON.stringify({ choices: [{ delta: { content: '{"sum' } }] });
      const chunk2 = JSON.stringify({ choices: [{ delta: { content: 'mary": "ok"}' } }] });

      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${chunk1}\n\n`));
          controller.enqueue(encoder.encode(`data: ${chunk2}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: mockStream,
      });

      await service.saveConfig(createEnabledConfig());

      const events: string[] = [];
      for await (const event of service.diagnoseStream({
        title: 'Test stream',
        error: 'Timeout 30000ms exceeded',
      })) {
        events.push(event);
      }

      const parsed = events.map(e => {
        try { return JSON.parse(e.trim()); } catch { return null; }
      }).filter(Boolean);

      expect(parsed.some(e => e.type === 'start')).toBe(true);
      expect(parsed.some(e => e.type === 'complete')).toBe(true);
    });
  });

  describe('AI 智能分析 - 禁用状态返回完整字段', () => {
    /** LLM 未启用时应返回包含所有新增字段的默认值 */
    it('LLM 未启用时应返回包含所有新增字段的默认值', async () => {
      const result = await service.diagnose({
        title: 'Test disabled',
        error: 'Some error',
      });

      expect(result.category).toBe('unknown');
      expect(result.codeDiffs).toEqual([]);
      expect(result.docLinks).toEqual([]);
      expect(result.contextUsed).toBeDefined();
      expect(result.reasoningSteps).toEqual([]);
      expect(result.calibratedConfidence).toBe(0);
      expect(result.analysisMode).toBe('fallback');
    });
  });
});
