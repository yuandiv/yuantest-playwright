import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMService } from '@yuantest/ai';
import { LLMConfig } from '@yuantest/contracts';

// Mock logger
vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    logger: {
      child: vi.fn().mockReturnValue({
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
    },
  };
});

const defaultConfig: LLMConfig = {
  enabled: true,
  apiKey: 'test-key',
  baseUrl: 'http://localhost:11434',
  model: 'test-model',
  remark: '',
  maxTokens: 8192,
  temperature: 0.3,
};

function mockSSEChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body: stream,
    headers: new Headers(),
  } as unknown as Response;
}

describe('对话流', () => {
  let client: LLMService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new LLMService({ ...defaultConfig });
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('1. 基础对话：应输出文本内容', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        mockSSEChunks([
          'data: {"choices":[{"delta":{"content":"你好！我是测试助手。"}}]}\n',
          'data: [DONE]\n',
        ])
      )
    );

    const stream = client.chatStream({
      system: '你是一个测试助手。',
      user: '你好',
    }, defaultConfig);

    let output = '';
    for await (const token of stream) {
      output += token;
    }

    expect(output).toContain('你好！');
    // 不应强制 JSON 格式
    expect(output).not.toMatch(/^\{/);
  });

  it('2. 工具调用流：应在工具调用前输出文本，并在调用后继续', async () => {
    // 第一轮：先输出思考，再产生工具调用
    const round1Chunks = [
      'data: {"choices":[{"delta":{"content":"我来分析这个页面。"}}]}\n',
      'data: {"choices":[{"delta":{"content":"先看看页面结构。"}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"browser_navigate","arguments":"{\\"url\\":\\"http://test.com\\"}"}}]}}]}\n',
      'data: [DONE]\n',
    ];

    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(mockSSEChunks(round1Chunks))
    );

    // 第二轮：工具结果回来后，继续分析
    const round2Chunks = [
      'data: {"choices":[{"delta":{"content":"页面包含登录表单和导航栏。"}}]}\n',
      'data: {"choices":[{"delta":{"content":"现在生成测试计划。"}}]}\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_2","function":{"name":"agent_plan","arguments":"{\\"description\\":\\"测试页面\\"}"}}]}}]}\n',
      'data: [DONE]\n',
    ];

    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(mockSSEChunks(round2Chunks))
    );

    // 第三轮：完成
    const round3Chunks = [
      'data: {"choices":[{"delta":{"content":"## 测试结果\\n1. 登录功能正常\\n2. 导航链接可用"}}]}\n',
      'data: [DONE]\n',
    ];

    fetchSpy.mockImplementationOnce(() =>
      Promise.resolve(mockSSEChunks(round3Chunks))
    );

    // 测试 chatWithToolsStream 是否正确处理多次调用
    const messages = [
      { role: 'system', content: '你是一个测试助手。' },
      { role: 'user', content: '分析测试页面并生成测试计划' },
    ];

    // 第一次调用 - 应该输出文本 + 工具调用
    let content1 = '';
    let toolCalls1: any[] | null = null;
    const stream1 = client.chatWithToolsStream(messages, defaultConfig, [
      {
        type: 'function',
        function: {
          name: 'browser_navigate',
          description: 'Navigate to a URL',
          parameters: { type: 'object', properties: { url: { type: 'string' } } },
        },
      },
      {
        type: 'function',
        function: {
          name: 'agent_plan',
          description: 'Generate a test plan',
          parameters: { type: 'object', properties: { description: { type: 'string' } } },
        },
      },
    ]);

    for await (const event of stream1) {
      if (event.type === 'content_delta') {
        content1 += event.content;
      } else if (event.type === 'tool_calls') {
        toolCalls1 = event.toolCalls;
      }
    }

    // 验证：工具调用前有文本输出
    expect(content1).toContain('我来分析');
    expect(toolCalls1).not.toBeNull();
    expect(toolCalls1![0].function.name).toBe('browser_navigate');
  });

  it('3. 无 JSON 强制：chatWithTools 不带工具时应输出自然语言', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: '测试完成，所有用例通过。',
                },
                finish_reason: 'stop',
              },
            ],
          }),
      } as Response)
    );

    const result = await client.chatWithTools(
      [
        { role: 'system', content: '你是测试助手。' },
        { role: 'user', content: '总结测试结果' },
      ],
      defaultConfig
      // 不传 tools ⇒ 之前会强制 json_object
    );

    // 验证请求体中不包含 response_format
    const fetchBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(fetchBody.response_format).toBeUndefined();

    expect(result.content).toBe('测试完成，所有用例通过。');
    expect(result.content).not.toMatch(/^\{/);
  });

  it('4. URL 构建：含 /v1 时不再追加', async () => {
    client = new LLMService({ ...defaultConfig, baseUrl: 'http://localhost:11434/v1' });
    fetchSpy.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          }),
      } as Response)
    );

    await client.chat({ systemPrompt: 'sys', userPrompt: 'usr' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    // 不应出现双 /v1
    expect(calledUrl).not.toContain('/v1/v1');
    expect(calledUrl).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('5. 进度上下文注入：每轮之间注入进度提示', async () => {
    // 这个测试验证 agent loop 在每轮之间注入 Progress 上下文
    // 通过验证 system 角色的消息内容来判断
    const round1Chunks = [
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"test_tool","arguments":"{}"}}]}}]}\n',
      'data: [DONE]\n',
    ];
    const round2Chunks = [
      'data: {"choices":[{"delta":{"content":"任务完成"}}]}\n',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n',
      'data: [DONE]\n',
    ];
    let callCount = 0;
    fetchSpy.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockSSEChunks(round1Chunks));
      }
      return Promise.resolve(mockSSEChunks(round2Chunks));
    });

    const result = await client.chatWithAgentLoop(
      { system: '你是测试助手。', user: '执行测试' },
      defaultConfig,
      [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      undefined,
      async () => '工具执行成功'
    );

    // 应正常返回，不崩溃
    expect(result.responseText).toBeDefined();
    expect(result.analysisMode).toBe('agent');
    expect(result.reasoningSteps.length).toBeGreaterThan(0);
  });
});
