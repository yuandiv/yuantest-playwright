import { LLMClient, LLMChatOptions } from '../../src/agents/llm-client';
import { LLMConfig } from '../../src/types';

// Mock the logger module
jest.mock('../../src/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const defaultConfig: LLMConfig = {
  enabled: true,
  apiKey: 'test-api-key',
  baseUrl: 'http://localhost:11434',
  model: 'gpt-test',
  remark: '',
  maxTokens: 1024,
  temperature: 0.2,
};

function mockFetchResponse(body: unknown, ok = true, status = 200, statusText = 'OK') {
  return Promise.resolve({
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('LLMClient', () => {
  let client: LLMClient;
  let fetchSpy: jest.SpiedFunction<typeof global.fetch>;

  beforeEach(() => {
    client = new LLMClient({ ...defaultConfig });
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('URL construction', () => {
    it('should construct URL correctly when baseUrl has no trailing slash', async () => {
      client = new LLMClient({ ...defaultConfig, baseUrl: 'http://localhost:11434' });
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        })
      );

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:11434/v1/chat/completions');
    });

    it('should construct URL correctly when baseUrl has a trailing slash', async () => {
      client = new LLMClient({ ...defaultConfig, baseUrl: 'http://localhost:11434/' });
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        })
      );

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:11434/v1/chat/completions');
    });

    it('should construct URL correctly when baseUrl has multiple trailing slashes', async () => {
      client = new LLMClient({ ...defaultConfig, baseUrl: 'http://localhost:11434///' });
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        })
      );

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toBe('http://localhost:11434/v1/chat/completions');
    });
  });

  describe('chat() request body', () => {
    it('should send correct request body with model, messages, max_tokens, temperature, and response_format', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'response' }, finish_reason: 'stop' }],
        })
      );

      const options: LLMChatOptions = {
        systemPrompt: 'You are a helper',
        userPrompt: 'Hello',
        maxTokens: 2048,
        temperature: 0.5,
        responseFormat: { type: 'json_object' },
      };

      await client.chat(options);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://localhost:11434/v1/chat/completions');

      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe('gpt-test');
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are a helper' },
        { role: 'user', content: 'Hello' },
      ]);
      expect(body.max_tokens).toBe(2048);
      expect(body.temperature).toBe(0.5);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });

    it('should use config defaults when optional fields are not provided', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'response' }, finish_reason: 'stop' }],
        })
      );

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(body.max_tokens).toBe(1024);
      expect(body.temperature).toBe(0.2);
      expect(body).not.toHaveProperty('response_format');
    });
  });

  describe('chat() Authorization header', () => {
    it('should send Authorization header when apiKey is provided', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        })
      );

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('should NOT send Authorization header when apiKey is empty', async () => {
      client = new LLMClient({ ...defaultConfig, apiKey: '' });
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        })
      );

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers).not.toHaveProperty('Authorization');
    });
  });

  describe('chat() error handling', () => {
    it('should throw error with status code on non-ok response', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({}, false, 429, 'Too Many Requests')
      );

      await expect(
        client.chat({ systemPrompt: 'sys', userPrompt: 'usr' })
      ).rejects.toThrow('LLM API returned 429: Too Many Requests');
    });

    it('should throw "Empty response from LLM" when response content is empty', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        })
      );

      await expect(
        client.chat({ systemPrompt: 'sys', userPrompt: 'usr' })
      ).rejects.toThrow('Empty response from LLM');
    });

    it('should throw "Empty response from LLM" when choices array is empty', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({ choices: [] })
      );

      await expect(
        client.chat({ systemPrompt: 'sys', userPrompt: 'usr' })
      ).rejects.toThrow('Empty response from LLM');
    });

    it('should throw "Empty response from LLM" when choices is undefined', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({})
      );

      await expect(
        client.chat({ systemPrompt: 'sys', userPrompt: 'usr' })
      ).rejects.toThrow('Empty response from LLM');
    });
  });

  describe('chat() finish_reason=length', () => {
    it('should log a warning when finish_reason is "length"', async () => {
      const { logger } = require('../../src/logger');
      const childLogger = logger.child('LLMClient');

      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'truncated response' }, finish_reason: 'length' }],
        })
      );

      const result = await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      expect(result.content).toBe('truncated response');
      expect(result.finishReason).toBe('length');
      expect(childLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('finish_reason=length')
      );
    });
  });

  describe('chat() timeout', () => {
    it('should abort request after timeout', async () => {
      jest.useFakeTimers();

      fetchSpy.mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'));
            });
          }
        });
      });

      const chatPromise = client.chat({
        systemPrompt: 'sys',
        userPrompt: 'usr',
        timeout: 5000,
      });

      jest.advanceTimersByTime(5000);

      await expect(chatPromise).rejects.toThrow();

      jest.useRealTimers();
    });
  });

  describe('updateConfig() and getConfig()', () => {
    it('should update and retrieve config', () => {
      const newConfig: LLMConfig = {
        enabled: false,
        apiKey: 'new-key',
        baseUrl: 'http://new-host:8080',
        model: 'new-model',
        remark: 'updated',
        maxTokens: 4096,
        temperature: 0.8,
      };

      client.updateConfig(newConfig);
      const retrieved = client.getConfig();

      expect(retrieved).toEqual(newConfig);
    });

    it('should use updated config in subsequent chat calls', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
        })
      );

      client.updateConfig({
        ...defaultConfig,
        baseUrl: 'http://updated-host:9090',
        model: 'updated-model',
        apiKey: 'updated-key',
      });

      await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://updated-host:9090/v1/chat/completions');

      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.model).toBe('updated-model');

      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer updated-key');
    });
  });

  describe('edge cases', () => {
    it('should handle network exception (ECONNREFUSED)', async () => {
      fetchSpy.mockImplementation(() => Promise.reject(new Error('ECONNREFUSED')));

      await expect(
        client.chat({ systemPrompt: 'sys', userPrompt: 'usr' })
      ).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle finish_reason=content_filter', async () => {
      fetchSpy.mockImplementation(() =>
        mockFetchResponse({
          choices: [{ message: { content: 'Filtered', role: 'assistant' }, finish_reason: 'content_filter' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      );

      const result = await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

      expect(result.content).toBe('Filtered');
      expect(result.finishReason).toBe('content_filter');
    });

    it('should handle concurrent requests', async () => {
      let callCount = 0;
      fetchSpy.mockImplementation(async () => {
        callCount++;
        return mockFetchResponse({
          choices: [{ message: { content: `Response ${callCount}`, role: 'assistant' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      });

      const results = await Promise.all([
        client.chat({ systemPrompt: 'sys', userPrompt: 'test1' }),
        client.chat({ systemPrompt: 'sys', userPrompt: 'test2' }),
        client.chat({ systemPrompt: 'sys', userPrompt: 'test3' }),
      ]);

      expect(results).toHaveLength(3);
      expect(callCount).toBe(3);
    });
  });
});
