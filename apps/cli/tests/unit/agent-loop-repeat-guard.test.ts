/**
 * Agent Loop 死循环防护 —— 对话级回归验证
 *
 * 背景：真实事故中，模型对 browser_snapshot 的页面快照反复以相同参数重试，
 * 因工具结果被"纯前截断 + 结果过长已截断"标记诱导，循环 8+ 次直至预算耗尽，
 * 最终回复退化为"已执行 N 次工具调用"摘要。
 *
 * 本测试模拟该对话场景（顽固模型连续 3 次以相同参数调用 browser_snapshot），
 * 验证三项修复同时生效：
 * 1. 头尾双保留截断：回灌 LLM 的工具消息同时包含开头/结尾与条件引导提示；
 * 2. 重复调用硬闸：同一工具+同一参数最多执行 2 次，第 3 次跳过并强制收尾；
 * 3. 收尾质量：强制收尾时拼入最后一次完整工具结果，且向模型注入防护提示。
 */
import { vi } from 'vitest';
import { LLMService } from '@yuantest/ai';
import type { AgentDone, AgentToolResult } from '@yuantest/ai';
import { AGENT_EVENT } from '@yuantest/ai';
import { EventEmitter } from 'events';
import type { LLMConfig, ToolSchema } from '@yuantest/contracts';

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

const llmConfig: LLMConfig = {
  enabled: true,
  apiKey: 'test-key',
  baseUrl: 'http://localhost:11434',
  model: 'gpt-test',
  remark: '',
  maxTokens: 4096,
  temperature: 0.2,
};

const snapshotTool: ToolSchema = {
  type: 'function',
  function: {
    name: 'browser_snapshot',
    description: 'Get the accessibility snapshot of the current page',
    parameters: { type: 'object', properties: {} },
  },
};

/** 构造 SSE 流式响应（与 agent-events.test.ts 同款模式） */
function makeSSEResponse(chunks: unknown[]): Response {
  const sseText =
    chunks.map((c) => `data: ${JSON.stringify(c)}`).join('\n\n') + '\n\ndata: [DONE]\n\n';
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
  } as unknown as Response;
}

/** 模型返回一次工具调用（顽固模型每次回复同一工具+同一参数） */
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
            tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    },
  ];
}

/** 模型返回纯文本（强制收尾/正常结束时的最终回复） */
function makeStreamTextChunks(text: string) {
  return [
    { choices: [{ delta: { content: text }, finish_reason: null }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    },
  ];
}

/** 收集事件总线事件 */
function collectEvents(bus: EventEmitter, ...eventNames: string[]) {
  const collected: Array<{ event: string; payload: unknown }> = [];
  for (const name of eventNames) {
    bus.on(name, (payload: unknown) => {
      collected.push({ event: name, payload });
    });
  }
  return collected;
}

/** 消费整个 agent loop 流 */
async function consumeStream(
  client: LLMService,
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>,
  maxToolCalls?: number
) {
  const eventBus = new EventEmitter();
  const events = collectEvents(
    eventBus,
    AGENT_EVENT.TOOL_CALL,
    AGENT_EVENT.TOOL_RESULT,
    AGENT_EVENT.DONE
  );

  const stream = client.chatWithAgentLoopStream(
    { system: 'sys', user: '分析页面结构' },
    llmConfig,
    [snapshotTool],
    undefined,
    toolExecutor,
    undefined,
    maxToolCalls,
    eventBus,
    'verify-session'
  );

  for await (const _ of stream) {
    // 消费流
  }

  const doneEvents = events.filter((e) => e.event === AGENT_EVENT.DONE);
  const toolResultEvents = events.filter((e) => e.event === AGENT_EVENT.TOOL_RESULT);
  return {
    donePayload: doneEvents[0]?.payload as AgentDone | undefined,
    toolResultPayloads: toolResultEvents.map((e) => e.payload as AgentToolResult),
  };
}

describe('Agent Loop 死循环防护（对话级回归）', () => {
  let client: LLMService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new LLMService({ ...llmConfig });
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('顽固模型连续 3 次相同参数调用 browser_snapshot：第 3 次被跳过并强制收尾', async () => {
    // 模拟真实事故：模型每轮都调用 browser_snapshot 且参数完全相同
    const stubbornArgs = { url: 'http://localhost:5274/' };
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', stubbornArgs)), // 第 1 次（round 1）
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', stubbornArgs)), // 第 2 次（round 2，注入引导）
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', stubbornArgs)), // 第 3 次（应被跳过）
      makeSSEResponse(makeStreamTextChunks('页面结构：顶部导航、中部内容区、底部页脚。')), // 强制收尾
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    // 快照工具返回超长结果（>3000 字符，模拟页面无障碍快照），确保触发截断
    const snapshotHead = '【页面结构】导航栏 / 内容区 / 表单';
    const snapshotTail = '【页面结尾】页脚与版权信息';
    const bigSnapshot = snapshotHead + 'M'.repeat(9000) + snapshotTail;

    const toolExecutor = vi.fn().mockResolvedValue(bigSnapshot);
    const { donePayload, toolResultPayloads } = await consumeStream(client, toolExecutor);

    // ── 验证 1：重复调用硬闸 —— 工具只被执行 2 次，第 3 次被防护跳过 ──
    expect(toolExecutor).toHaveBeenCalledTimes(2);
    expect(toolResultPayloads).toHaveLength(3); // 2 次真实结果 + 1 次防护跳过提示
    const guardResult = toolResultPayloads[2];
    expect(guardResult.name).toBe('browser_snapshot');
    expect(guardResult.result).toContain('重复调用防护');

    // ── 验证 2：强制收尾正常产出 done（truncated=true），且为 agent 模式 ──
    expect(donePayload).toBeDefined();
    expect(donePayload!.truncated).toBe(true);
    expect(donePayload!.analysisMode).toBe('agent');
    // 收尾调用让模型给出最终答案
    expect(donePayload!.content).toContain('页面结构：顶部导航');

    // ── 验证 3：工具结果回灌 LLM 时采用头尾双保留截断 + 条件引导提示 ──
    // 第 2 次 fetch（round 2 请求体）应包含截断后的工具消息
    const round2Body = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
    const toolMsg = round2Body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.content).toContain(snapshotHead); // 保留开头
    expect(toolMsg.content).toContain(snapshotTail); // 保留结尾
    expect(toolMsg.content).toContain('中段省略'); // 中段被省略标记
    expect(toolMsg.content).toContain('以相同参数重复调用不会获得新内容'); // 条件引导（非禁止重试）
    // 总长度不超过 3000 + 标记开销
    expect(toolMsg.content.length).toBeLessThan(3300);

    // ── 验证 4：强制收尾的请求体包含防护提示（模型被告知为何停止） ──
    const finalBody = JSON.parse((fetchSpy.mock.calls[3][1] as RequestInit).body as string);
    const finalMessagesText = finalBody.messages
      .map((m: { content?: unknown }) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
      )
      .join('\n');
    expect(finalMessagesText).toContain('重复调用防护');
    // 已执行的工具调用（含参数）仍被保留供模型参考
    expect(finalMessagesText).toContain('browser_snapshot');
  });

  it('相同参数仅重试 1 次（第 2 次）：仍执行但注入引导，不误伤合法重试', async () => {
    const args = { url: 'http://localhost:5274/' };
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', args)), // 第 1 次
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', args)), // 第 2 次（注入引导但仍执行）
      makeSSEResponse(makeStreamTextChunks('已基于快照完成分析。')), // 模型停止重试，正常结束
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const toolExecutor = vi.fn().mockResolvedValue('snapshot content');
    const { donePayload } = await consumeStream(client, toolExecutor);

    // 第 2 次相同参数仍被允许执行（引导而非禁止）
    expect(toolExecutor).toHaveBeenCalledTimes(2);
    // 引导提示在 round 2 执行时注入 planProgress，随 round 3 的进度消息发送（fetch #2）
    const round3Body = JSON.parse((fetchSpy.mock.calls[2][1] as RequestInit).body as string);
    const progressText = JSON.stringify(round3Body.messages);
    expect(progressText).toContain('原样重试不会获得新信息');
    // 正常结束：truncated 为 false，输出模型最终文本
    expect(donePayload!.truncated).toBeFalsy();
    expect(donePayload!.content).toContain('已基于快照完成分析');
  });

  it('参数变化的合法重试不受防护限制（滚动/展开/点击后重拍语义）', async () => {
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'header' })),
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'main' })),
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'footer' })),
      makeSSEResponse(makeStreamTextChunks('三个区域均已分析。')),
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const toolExecutor = vi.fn().mockResolvedValue('region snapshot');
    const { donePayload } = await consumeStream(client, toolExecutor);

    // 参数不同 → 视为不同调用，全部执行，防护不触发
    expect(toolExecutor).toHaveBeenCalledTimes(3);
    expect(donePayload!.truncated).toBeFalsy();
    expect(donePayload!.content).toContain('三个区域均已分析');
  });
});
