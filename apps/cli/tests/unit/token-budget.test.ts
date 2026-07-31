/**
 * TokenBudget / maxToolCalls 配额机制单元测试
 *
 * 验证点：
 * 1. TokenBudget 累计 token、递增 toolCallCount、isExceeded 判定
 * 2. chatWithAgentLoop 在工具调用次数超限时强制收尾（清空 tools 调用最终轮）
 * 3. maxToolCalls=1 时首次工具调用后立即触发收尾
 */
import { vi } from 'vitest';
import { LLMService } from '../../src/ai/agents/llm-service';
import { TokenBudget } from '../../src/ai/agents/token-budget';
import { LLMConfig, ToolSchema } from '@yuantest/contracts';

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
  apiKey: 'test-api-key',
  baseUrl: 'http://localhost:11434',
  model: 'gpt-test',
  remark: '',
  maxTokens: 1024,
  temperature: 0.2,
};

/**
 * 构造一个持续返回 tool_calls 的非流式响应。
 * chatWithToolsStream 内部调用 callAPI → fetch，我们 mock fetch 返回固定 JSON。
 *
 * 响应结构（非流式，choices[0].message.tool_calls）：
 * - 前 N 次返回 tool_calls，强制 Agent Loop 继续调用工具
 * - 第 N+1 次返回纯 content，模拟模型给出最终答案
 */
function makeToolCallResponse(toolName: string, args: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: `call_${Math.random().toString(36).slice(2, 8)}`,
              type: 'function',
              function: {
                name: toolName,
                arguments: JSON.stringify(args),
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function makeFinalTextResponse(text: string) {
  return {
    choices: [
      {
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  };
}

/**
 * 构造 SSE 流式响应（模拟 OpenAI chat/completions stream:true 返回）。
 * 每个 chunk 形如 `data: {...}\n\n`，最后追加 `data: [DONE]\n\n`。
 */
function makeSSEResponse(chunks: unknown[]): Response {
  const sseText =
    chunks.map((c) => `data: ${JSON.stringify(c)}`).join('\n\n') +
    '\n\ndata: [DONE]\n\n';
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    body,
  } as Response;
}

/**
 * 构造一个流式 tool_calls chunk 序列：
 * - 第 1 个 chunk：tool_calls delta（含 id / function.name）
 * - 第 2 个 chunk：finish_reason=tool_calls + usage
 */
function makeStreamToolCallChunks(
  toolName: string,
  args: Record<string, unknown> = {}
) {
  const callId = `call_${Math.random().toString(36).slice(2, 8)}`;
  return [
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: callId,
                type: 'function',
                function: { name: toolName, arguments: '' },
              },
            ],
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                function: { arguments: JSON.stringify(args) },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  ];
}

/**
 * 构造一个流式纯文本 chunk 序列：
 * - content delta chunk
 * - finish_reason=stop + usage chunk
 */
function makeStreamTextChunks(text: string) {
  return [
    {
      choices: [
        {
          delta: { content: text },
          finish_reason: null,
        },
      ],
    },
    {
      choices: [
        {
          delta: {},
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    },
  ];
}

const dummyTool: ToolSchema = {
  type: 'function',
  function: {
    name: 'echo',
    description: 'Echo back the input',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
    },
  },
};

describe('TokenBudget', () => {
  it('默认配额：maxToolCalls=10, maxTotalTokens=100000', () => {
    const budget = new TokenBudget();
    expect(budget.maxToolCalls).toBe(10);
    expect(budget.maxTotalTokens).toBe(100_000);
    expect(budget.isExceeded()).toBe(false);
  });

  it('accumulate 累计 prompt/completion/total tokens', () => {
    const budget = new TokenBudget({ maxTotalTokens: 100 });
    budget.accumulate({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    budget.accumulate({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    expect(budget.getTotalUsage()).toEqual({
      promptTokens: 30,
      completionTokens: 15,
      totalTokens: 45,
    });
    expect(budget.isExceeded()).toBe(false);
  });

  it('recordToolCall 递增计数，isToolCallLimitReached 在达上限时为 true', () => {
    const budget = new TokenBudget({ maxToolCalls: 3 });
    budget.recordToolCall();
    expect(budget.toolCallsExecuted).toBe(1);
    expect(budget.isToolCallLimitReached()).toBe(false);

    budget.recordToolCall();
    budget.recordToolCall();
    expect(budget.toolCallsExecuted).toBe(3);
    expect(budget.isToolCallLimitReached()).toBe(true);
    expect(budget.isExceeded()).toBe(true);
  });

  it('isTokenLimitReached 在累计 total 超过上限时为 true', () => {
    const budget = new TokenBudget({ maxTotalTokens: 40 });
    budget.accumulate({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    expect(budget.isTokenLimitReached()).toBe(false);

    budget.accumulate({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    // 累计 totalTokens = 45 > 40
    expect(budget.isTokenLimitReached()).toBe(true);
    expect(budget.isExceeded()).toBe(true);
  });

  it('reset 清空累计与计数', () => {
    const budget = new TokenBudget({ maxToolCalls: 2, maxTotalTokens: 100 });
    budget.accumulate({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    budget.recordToolCall();
    budget.recordToolCall();

    expect(budget.isExceeded()).toBe(true);
    budget.reset();
    expect(budget.toolCallsExecuted).toBe(0);
    expect(budget.getTotalUsage()).toBeUndefined();
    expect(budget.isExceeded()).toBe(false);
  });

  it('accumulate 传入 undefined 不报错', () => {
    const budget = new TokenBudget();
    expect(() => budget.accumulate(undefined)).not.toThrow();
    expect(budget.getTotalUsage()).toBeUndefined();
  });
});

describe('chatWithAgentLoop maxToolCalls 配额', () => {
  let client: LLMService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new LLMService({ ...defaultConfig });
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  /**
   * 场景：模型连续返回 tool_calls，maxToolCalls=1。
   * 预期：首次工具执行后 toolCallCount=1，第二轮 budget.isExceeded() 为 true，
   *      清空 tools 再调用一次模型，强制其给出文本响应。
   *
   * fetch 调用序列（chatWithToolsStream 走 stream:true）：
   * 1. 首次流式调用 → SSE 返回 tool_calls（echo）
   * 2. 配额超限，再次 chatWithToolsStream（空 tools）→ SSE 返回纯文本
   */
  it('maxToolCalls=1 时首次工具调用后强制收尾', async () => {
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('echo', { text: 'hello' })),
      makeSSEResponse(makeStreamTextChunks('Agent terminated: max tool calls reached.')),
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const toolExecutor = vi.fn().mockResolvedValue('echo result');
    const result = await client.chatWithAgentLoop(
      { system: 'sys', user: 'usr' },
      defaultConfig,
      [dummyTool],
      undefined,
      toolExecutor,
      undefined,
      1 // maxToolCalls
    );

    // 工具应执行一次后被配额截断
    expect(toolExecutor).toHaveBeenCalledTimes(1);
    expect(result.responseText).toContain('max tool calls reached');
    expect(result.truncated).toBe(true);
  });

  /**
   * 场景：maxToolCalls=2，模型连续 2 次返回 tool_calls。
   * 预期：第 1 次工具执行（toolCallCount=1），第 2 轮检查 1>=2=false 继续；
   *      第 2 次工具执行（toolCallCount=2），第 3 轮检查 2>=2=true 触发收尾。
   *
   * fetch 调用序列：
   * 1. 首次 chatWithToolsStream → SSE 返回 tool_calls（echo #1）
   * 2. 第 2 轮 chatWithToolsStream → SSE 返回 tool_calls（echo #2）
   * 3. 配额超限，chatWithToolsStream（空 tools）→ SSE 返回纯文本
   */
  it('maxToolCalls=2 时第二次工具调用后强制收尾', async () => {
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('echo', { text: 'first' })),
      makeSSEResponse(makeStreamToolCallChunks('echo', { text: 'second' })),
      makeSSEResponse(makeStreamTextChunks('Agent terminated: max tool calls reached.')),
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const toolExecutor = vi.fn().mockResolvedValue('echo result');
    const result = await client.chatWithAgentLoop(
      { system: 'sys', user: 'usr' },
      defaultConfig,
      [dummyTool],
      undefined,
      toolExecutor,
      undefined,
      2 // maxToolCalls
    );

    // 工具应执行 2 次后被配额截断
    expect(toolExecutor).toHaveBeenCalledTimes(2);
    expect(result.responseText).toContain('max tool calls reached');
    expect(result.truncated).toBe(true);
  });

  /**
   * 场景：模型首次响应即为纯文本（无 tool_calls）。
   * 预期：走单次回复路径，analysisMode='single'，不触发配额检查。
   */
  it('模型无工具调用时走单次回复路径', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(makeSSEResponse(makeStreamTextChunks('Direct answer.')))
    );

    const result = await client.chatWithAgentLoop(
      { system: 'sys', user: 'usr' },
      defaultConfig,
      [dummyTool],
      undefined,
      vi.fn(),
      undefined,
      5
    );

    expect(result.responseText).toBe('Direct answer.');
    expect(result.analysisMode).toBe('single');
  });
});
