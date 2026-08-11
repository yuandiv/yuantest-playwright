/**
 * Agent Loop 任务拆解（复杂任务结构化进度）—— 对话级回归验证
 *
 * 背景：复杂问题（多页面/多功能点）要求 AI 先拆解为子任务再逐项执行。
 * P0 提示词（ai-service.ts buildSystemPrompt）强制模型输出 [T1]/[T2]... 拆解清单；
 * P1 将 planProgress 从 string[] 升级为结构化 PlanItem[]，注入每轮的
 * [System: Progress] 消息改为"任务进度"清单视图（[✓]/[!]/[ ] + Tn 编号），
 * 让模型能感知已规划/已完成/受阻的子任务。
 *
 * 本测试模拟三类对话场景验证：
 * 1. 复杂请求（多工具协作）：注入消息含结构化"任务进度"清单与 Tn 编号；
 * 2. 逐项完成标记：已完成项以 [✓] 标记、防护跳过项以 [!] 标记；
 * 3. 简单任务回归（无工具）：不受规划逻辑影响，正常单次回复。
 */
import { vi } from 'vitest';
import { LLMService } from '@yuantest/ai';
import type { AgentDone } from '@yuantest/ai';
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

const browserTool: ToolSchema = {
  type: 'function',
  function: {
    name: 'browser_snapshot',
    description: 'Get the accessibility snapshot of the current page',
    parameters: { type: 'object', properties: { region: { type: 'string' } } },
  },
};

const clickTool: ToolSchema = {
  type: 'function',
  function: {
    name: 'browser_click',
    description: 'Click an element on the page',
    parameters: { type: 'object', properties: { element: { type: 'string' } } },
  },
};

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
  return { ok: true, status: 200, statusText: 'OK', body } as unknown as Response;
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
            tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }],
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
    { choices: [{ delta: { content: text }, finish_reason: null }] },
    {
      choices: [{ delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    },
  ];
}

function collectEvents(bus: EventEmitter, ...eventNames: string[]) {
  const collected: Array<{ event: string; payload: unknown }> = [];
  for (const name of eventNames) {
    bus.on(name, (payload: unknown) => {
      collected.push({ event: name, payload });
    });
  }
  return collected;
}

async function consumeStream(
  client: LLMService,
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>
) {
  const eventBus = new EventEmitter();
  const events = collectEvents(eventBus, 'agent.done');

  const stream = client.chatWithAgentLoopStream(
    { system: 'sys', user: '分别分析导航、登录、注册三个区域' },
    llmConfig,
    [browserTool, clickTool],
    undefined,
    toolExecutor,
    undefined,
    undefined,
    eventBus,
    'planning-session'
  );

  for await (const _ of stream) {
    // 消费流
  }

  const doneEvents = events.filter((e) => e.event === 'agent.done');
  return { donePayload: doneEvents[0]?.payload as AgentDone | undefined };
}

describe('Agent Loop 任务拆解（结构化任务进度）', () => {
  let client: LLMService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = new LLMService({ ...llmConfig });
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('复杂请求（多工具协作）：注入消息包含结构化"任务进度"清单与 Tn 编号', async () => {
    // 模拟复杂任务：模型先探索三个区域（多轮工具调用），最后汇总
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'nav' })),
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'login' })),
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'register' })),
      makeSSEResponse(makeStreamTextChunks('三个区域均已分析完成。')),
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const toolExecutor = vi.fn().mockResolvedValue('region snapshot');
    const { donePayload } = await consumeStream(client, toolExecutor);

    // ── 验证 1：每轮注入的 [System: Progress] 消息是"任务进度"清单视图 ──
    // 第 2 次 fetch（round 2 请求体）应包含"任务进度"与 T1 编号
    const round2Body = JSON.parse((fetchSpy.mock.calls[1][1] as RequestInit).body as string);
    const progressMsg = round2Body.messages.find((m: { role: string; content: unknown }) => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.startsWith('[System: Progress');
    });
    expect(progressMsg).toBeDefined();
    const progressText = (progressMsg as { content: string }).content;
    expect(progressText).toContain('任务进度'); // 结构化清单标题
    expect(progressText).toContain('T1'); // 任务编号
    expect(progressText).toContain('[✓]'); // 已完成标记

    // ── 验证 2：最终正常结束，模型给出汇总 ──
    expect(donePayload).toBeDefined();
    expect(donePayload!.truncated).toBeFalsy();
    expect(donePayload!.content).toContain('三个区域均已分析完成');
  });

  it('逐项完成标记：已完成项 [✓]、防护跳过项 [!] 均出现在清单视图', async () => {
    // 模拟：模型调用 2 次相同参数 snapshot（第 2 次仍执行）+ 第 3 次触发防护跳过
    const responses = [
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'nav' })),
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'nav' })),
      makeSSEResponse(makeStreamToolCallChunks('browser_snapshot', { region: 'nav' })),
      makeSSEResponse(makeStreamTextChunks('已基于快照完成分析。')),
    ];
    fetchSpy.mockImplementation(() => Promise.resolve(responses.shift() as Response));

    const toolExecutor = vi.fn().mockResolvedValue('snapshot content');
    const { donePayload } = await consumeStream(client, toolExecutor);

    // round 3 请求（calls[2]）：防护尚未触发，应含 [✓]（正常完成）与 [!]（count===2 引导提示）
    const round3Body = JSON.parse((fetchSpy.mock.calls[2][1] as RequestInit).body as string);
    const progressMsg = round3Body.messages.find((m: { role: string; content: unknown }) => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.startsWith('[System: Progress');
    });
    const progressText = (progressMsg as { content: string }).content;
    expect(progressText).toContain('[✓]'); // 正常完成的调用
    expect(progressText).toContain('[!]'); // count===2 引导提示（blocked）

    // 强制收尾调用（calls[3] = emitForcedTermination 最终调用）：
    // 应注入"最终任务进度"清单，含防护跳过项（[!] + 重复调用防护 x3）
    const finalBody = JSON.parse((fetchSpy.mock.calls[3][1] as RequestInit).body as string);
    const finalMsg = finalBody.messages.find((m: { role: string; content: unknown }) => {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.startsWith('[System: 最终任务进度]');
    });
    expect(finalMsg).toBeDefined();
    const finalText = (finalMsg as { content: string }).content;
    expect(finalText).toContain('[!]'); // 防护跳过项标记
    expect(finalText).toContain('重复调用防护'); // 防护原因可见
    expect(donePayload).toBeDefined();
    expect(donePayload!.truncated).toBe(true); // 防护触发后强制收尾
  });

  it('简单任务回归（无工具）：不受规划逻辑影响，正常单次回复', async () => {
    // 纯文本对话：首次即无工具调用 → 单次回复，无 [System: Progress] 注入
    fetchSpy.mockImplementation(() =>
      Promise.resolve(makeSSEResponse(makeStreamTextChunks('你好！我是测试助手。')))
    );

    const toolExecutor = vi.fn();
    const eventBus = new EventEmitter();
    const events = collectEvents(eventBus, 'agent.done');

    const stream = client.chatWithAgentLoopStream(
      { system: 'sys', user: '你好' },
      llmConfig,
      [browserTool],
      undefined,
      toolExecutor,
      undefined,
      undefined,
      eventBus,
      'planning-simple'
    );
    for await (const _ of stream) {
      // 消费流
    }

    const doneEvents = events.filter((e) => e.event === 'agent.done');
    const donePayload = doneEvents[0]?.payload as AgentDone | undefined;
    expect(toolExecutor).not.toHaveBeenCalled();
    expect(donePayload).toBeDefined();
    expect(donePayload!.content).toContain('你好');
    // 单次模式（single）不走 agent loop，无任务进度注入
    expect(donePayload!.analysisMode).toBe('single');
  });
});
