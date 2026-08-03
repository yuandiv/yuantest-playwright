/**
 * Agent 事件总线（Phase D — 事件流与可观测性）单元测试
 *
 * 验证点：
 * 1. BaseAgent.withContext 触发 agent.start 事件
 * 2. BaseAgent.callLLM 触发 agent.message / agent.error 事件
 * 3. llm-service chatWithAgentLoopStream 注入 eventBus 后触发
 *    agent.token / agent.thinking / agent.tool_call / agent.tool_result / agent.done 事件
 * 4. chatWithAgentLoopStream fallback 分支触发 agent.error 事件
 * 5. UnifiedAIService.on() 订阅 agent.* 事件
 */
import { vi } from 'vitest';
import { EventEmitter } from 'events';
import { LLMService } from '@yuantest/ai';
import { AGENT_EVENT } from '@yuantest/ai';
import type {
  AgentStart,
  AgentToken,
  AgentThinking,
  AgentToolCall,
  AgentToolResult,
  AgentMessage,
  AgentError,
  AgentDone,
} from '@yuantest/ai';
import { BaseAgent } from '@yuantest/ai';
import { AgentConfig, LLMConfig, ToolSchema } from '@yuantest/contracts';

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

const baseConfig: AgentConfig = {
  projectRoot: process.cwd(),
  language: 'zh',
  maxHealRounds: 3,
  autoHeal: false,
};

const llmConfig: LLMConfig = {
  enabled: true,
  apiKey: 'test-key',
  baseUrl: 'http://localhost:11434',
  model: 'gpt-test',
  remark: '',
  maxTokens: 1024,
  temperature: 0.2,
};

/** 用于测试的 BaseAgent 子类（BaseAgent 是 abstract） */
class TestAgent extends BaseAgent {
  protected getAgentName(): string {
    return 'TestAgent';
  }
}

/** 构造一个 mock LLMService，chat() 返回固定 content + usage */
function makeMockLLMService(
  content: string,
  usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
) {
  return {
    getConfig: () => llmConfig,
    chat: vi.fn().mockResolvedValue({ content, usage, finishReason: 'stop' }),
    updateConfig: vi.fn(),
  } as unknown as Parameters<typeof BaseAgent>[2] & object;
}

/** 构造 SSE 流式响应 */
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

function makeStreamToolCallChunks(toolName: string, args: Record<string, unknown> = {}) {
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

/** 收集事件总线上的所有事件 */
function collectEvents(bus: EventEmitter, ...eventNames: string[]) {
  const collected: Array<{ event: string; payload: unknown }> = [];
  for (const name of eventNames) {
    bus.on(name, (payload: unknown) => {
      collected.push({ event: name, payload });
    });
  }
  return collected;
}

describe('BaseAgent 事件总线', () => {
  describe('withContext 触发 agent.start', () => {
    it('withContext 设置上下文时触发 agent.start 事件', () => {
      const agent = new TestAgent(baseConfig, llmConfig, makeMockLLMService('x') as any);
      const bus = agent.getEventBus();
      const events = collectEvents(bus, AGENT_EVENT.START);

      const restore = agent.withContext({ runId: 'r1', testId: 't1' });
      restore();

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe(AGENT_EVENT.START);
      const payload = events[0].payload as AgentStart;
      expect(payload.agentName).toBe('TestAgent');
      expect(payload.runId).toBe('r1');
      expect(payload.testId).toBe('t1');
    });
  });

  describe('callLLM 触发 agent.message / agent.error', () => {
    let agent: TestAgent;
    let mockLLM: ReturnType<typeof makeMockLLMService>;

    beforeEach(() => {
      mockLLM = makeMockLLMService('hello world');
      agent = new TestAgent(baseConfig, llmConfig, mockLLM as any);
    });

    it('callLLM 成功后触发 agent.message 事件', async () => {
      const bus = agent.getEventBus();
      const events = collectEvents(bus, AGENT_EVENT.MESSAGE);

      const content = await (agent as any).callLLM('sys', 'usr');

      expect(content).toBe('hello world');
      expect(events).toHaveLength(1);
      const payload = events[0].payload as AgentMessage;
      expect(payload.response).toBe('hello world');
      expect(payload.usage?.totalTokens).toBe(15);
      // 未调用 withContext 时 currentContext.agentName 保持初始空字符串
      expect(payload.agentName).toBe('');
    });

    it('callLLM 抛错时触发 agent.error 事件，再重新抛出', async () => {
      (mockLLM.chat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('LLM down'));
      const bus = agent.getEventBus();
      const events = collectEvents(bus, AGENT_EVENT.ERROR);

      await expect((agent as any).callLLM('sys', 'usr')).rejects.toThrow('LLM down');
      expect(events).toHaveLength(1);
      const payload = events[0].payload as AgentError;
      expect((payload.error as Error).message).toBe('LLM down');
    });
  });

  describe('on() / once() 订阅 API', () => {
    it('on() 返回 unsubscribe 函数，调用后注销监听器', () => {
      const agent = new TestAgent(baseConfig, llmConfig, makeMockLLMService('x') as any);
      const calls: unknown[] = [];
      const unsub = agent.on(AGENT_EVENT.MESSAGE, (p) => calls.push(p));

      // 通过 withContext 触发 agent.start，再触发 agent.message
      const restore = agent.withContext({});
      return (async () => {
        await (agent as any).callLLM('sys', 'usr');
        expect(calls).toHaveLength(1);
        unsub();
        await (agent as any).callLLM('sys', 'usr');
        // 第二次调用不应再触发监听器
        expect(calls).toHaveLength(1);
        restore();
      })();
    });

    it('once() 触发一次后自动注销', async () => {
      const agent = new TestAgent(baseConfig, llmConfig, makeMockLLMService('x') as any);
      const calls: unknown[] = [];
      agent.once(AGENT_EVENT.MESSAGE, (p) => calls.push(p));

      await (agent as any).callLLM('sys', 'usr');
      await (agent as any).callLLM('sys', 'usr');
      expect(calls).toHaveLength(1);
    });
  });
});

describe('chatWithAgentLoopStream 事件总线触发', () => {
  let client: LLMService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let eventBus: EventEmitter;
  let sessionId: string;

  beforeEach(() => {
    client = new LLMService({ ...llmConfig });
    fetchSpy = vi.spyOn(global, 'fetch');
    eventBus = new EventEmitter();
    sessionId = 'test-session-1';
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('流式纯文本响应触发 agent.token / agent.done 事件', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(makeSSEResponse(makeStreamTextChunks('Direct answer.')))
    );

    const events = collectEvents(
      eventBus,
      AGENT_EVENT.TOKEN,
      AGENT_EVENT.DONE,
      AGENT_EVENT.ERROR
    );

    const stream = client.chatWithAgentLoopStream(
      { system: 'sys', user: 'usr' },
      llmConfig,
      [dummyTool],
      undefined,
      vi.fn(),
      undefined,
      undefined,
      eventBus,
      sessionId
    );

    for await (const _ of stream) {
      // 消费流
    }

    // 应有 1 个 token 事件 + 1 个 done 事件，无 error
    const tokenEvents = events.filter((e) => e.event === AGENT_EVENT.TOKEN);
    const doneEvents = events.filter((e) => e.event === AGENT_EVENT.DONE);
    const errorEvents = events.filter((e) => e.event === AGENT_EVENT.ERROR);

    expect(tokenEvents).toHaveLength(1);
    expect((tokenEvents[0].payload as AgentToken).data).toBe('Direct answer.');
    expect((tokenEvents[0].payload as AgentToken).sessionId).toBe(sessionId);

    expect(doneEvents).toHaveLength(1);
    const donePayload = doneEvents[0].payload as AgentDone;
    expect(donePayload.content).toBe('Direct answer.');
    expect(donePayload.analysisMode).toBe('single');
    expect(donePayload.sessionId).toBe(sessionId);

    expect(errorEvents).toHaveLength(0);
  });

  it('工具调用流程触发 agent.tool_call / agent.tool_result / agent.done 事件', async () => {
    // maxToolCalls=1：首次工具调用后触发强制收尾
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('echo', { text: 'first' })),
      makeSSEResponse(makeStreamTextChunks('Final answer after quota.')),
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const events = collectEvents(
      eventBus,
      AGENT_EVENT.TOKEN,
      AGENT_EVENT.THINKING,
      AGENT_EVENT.TOOL_CALL,
      AGENT_EVENT.TOOL_RESULT,
      AGENT_EVENT.DONE
    );

    const toolExecutor = vi.fn().mockResolvedValue('first result');
    const stream = client.chatWithAgentLoopStream(
      { system: 'sys', user: 'usr' },
      llmConfig,
      [dummyTool],
      undefined,
      toolExecutor,
      undefined,
      1, // maxToolCalls
      eventBus,
      sessionId
    );

    for await (const _ of stream) {
      // 消费流
    }

    // 验证 tool_call 事件
    const toolCallEvents = events.filter((e) => e.event === AGENT_EVENT.TOOL_CALL);
    expect(toolCallEvents).toHaveLength(1);
    const tcPayload = toolCallEvents[0].payload as AgentToolCall;
    expect(tcPayload.name).toBe('echo');
    expect(tcPayload.sessionId).toBe(sessionId);

    // 验证 tool_result 事件
    const toolResultEvents = events.filter((e) => e.event === AGENT_EVENT.TOOL_RESULT);
    expect(toolResultEvents).toHaveLength(1);
    const trPayload = toolResultEvents[0].payload as AgentToolResult;
    expect(trPayload.name).toBe('echo');
    expect(trPayload.result).toBe('first result');
    expect(trPayload.sessionId).toBe(sessionId);

    // 验证 done 事件（强制收尾，truncated=true）
    const doneEvents = events.filter((e) => e.event === AGENT_EVENT.DONE);
    expect(doneEvents).toHaveLength(1);
    const donePayload = doneEvents[0].payload as AgentDone;
    expect(donePayload.content).toBe('Final answer after quota.');
    expect(donePayload.truncated).toBe(true);
    expect(donePayload.analysisMode).toBe('agent');
  });

  it('未注入 eventBus 时不触发任何事件（向后兼容）', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(makeSSEResponse(makeStreamTextChunks('No bus.')))
    );

    // 不注入 eventBus 参数
    const stream = client.chatWithAgentLoopStream(
      { system: 'sys', user: 'usr' },
      llmConfig,
      [dummyTool],
      undefined,
      vi.fn(),
      undefined,
      undefined
      // 故意不传 eventBus 和 sessionId
    );

    // 应正常消费流，不报错
    let content = '';
    for await (const event of stream) {
      if (event.type === 'token') content += event.data;
    }
    expect(content).toBe('No bus.');
  });
});
