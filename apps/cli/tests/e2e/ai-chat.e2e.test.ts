/**
 * AI 对话过程 E2E 验证 —— 10 个问题（回归：Agent Loop 死循环防护 + 截断 + 收尾质量）
 *
 * 方案：本地启动 mock LLM 服务器（脚本化 SSE 响应）+ 真实 DashboardServer，
 * 通过真实 HTTP chat API（SSE 流）驱动 10 个问题，覆盖：
 *   1. 基础问候（无工具）                    2. 顽固模型反复同参调用（死循环防护）
 *   3. 同参重试 2 次后停止（引导生效）       4. 不同参数多次调用（合法重试不受限）
 *   5. 大结果截断（头尾双保留+条件引导）     6. 多工具正常流程
 *   7. 预算耗尽强制收尾（truncated=true）    8. 收尾拼入最后一次工具结果
 *   9. thinking 分离                         10. 混合流程（先工具后文本）
 *
 * 运行：cd apps/cli && npx vitest run tests/e2e/ai-chat.e2e.test.ts
 */
import { vi } from 'vitest';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';
import { DashboardServer } from '../../src/ui/server';
import { TOKENS } from '@yuantest/core';
import type { ToolRegistry } from '@yuantest/ai';
import { LLMConfig } from '@yuantest/contracts';

vi.mock('@yuantest/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@yuantest/core')>();
  return {
    ...actual,
    logger: {
      ...actual.logger,
      child: vi.fn().mockReturnValue({
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      }),
      init: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// ─── mock LLM 脚本项类型 ─────────────────────────────────────────────
type ScriptItem =
  | { type: 'tool'; name: string; args: Record<string, unknown> } // 返回工具调用
  | { type: 'text'; content: string }; // 返回文本（含 <think> 时自动拆 thinking）

interface ConversationRecord {
  question: string;
  rounds: number;
  toolCalls: Array<{ name: string; args: string; result: string }>;
  done: { content: string; truncated?: boolean; analysisMode?: string } | null;
  error?: string;
  /** mock LLM 收到的最后一次请求 messages（用于断言截断回灌） */
  lastLlmRequest: unknown;
}

const RESULTS: ConversationRecord[] = [];

// ─── mock LLM 服务器：按 questionKey 推进脚本 ─────────────────────────
class MockLLMServer {
  server: http.Server;
  port = 0;
  private scripts = new Map<string, ScriptItem[]>();
  private counters = new Map<string, number>();
  lastRequestBody: unknown = null;

  constructor() {
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server.address() as AddressInfo).port;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  /** 注册问题脚本（questionKey = 第一条 user 消息内容） */
  registerScript(question: string, script: ScriptItem[]): void {
    this.scripts.set(question, script);
    this.counters.set(question, 0);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        this.lastRequestBody = parsed;
        const question = this.findQuestionKey(parsed.messages || []);
        const script = this.scripts.get(question);
        const idx = this.counters.get(question) ?? 0;
        this.counters.set(question, idx + 1);
        const item = script?.[idx] ?? { type: 'text', content: '（默认回复）已完成。' };

        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (item.type === 'tool') {
          this.writeToolCall(res, item);
        } else {
          this.writeText(res, item.content);
        }
        res.end();
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
  }

  private findQuestionKey(messages: Array<{ role: string; content?: unknown }>): string {
    for (const m of messages) {
      if (m.role === 'user' && typeof m.content === 'string' && m.content) {
        // 跳过 [System: Progress] 注入消息，取原始用户问题
        if (!m.content.startsWith('[System')) {
          return m.content;
        }
      }
    }
    return '';
  }

  private writeToolCall(res: http.ServerResponse, item: Extract<ScriptItem, { type: 'tool' }>): void {
    const id = `call_${Math.random().toString(36).slice(2, 8)}`;
    const argsJson = JSON.stringify(item.args);
    const chunks = [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id, type: 'function', function: { name: item.name, arguments: '' } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: argsJson } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
    ];
    res.write(chunks.map((c) => `data: ${JSON.stringify(c)}\n`).join(''));
    res.write('data: [DONE]\n');
  }

  private writeText(res: http.ServerResponse, content: string): void {
    const chunks = [
      { choices: [{ delta: { content }, finish_reason: null }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      },
    ];
    res.write(chunks.map((c) => `data: ${JSON.stringify(c)}\n`).join(''));
    res.write('data: [DONE]\n');
  }
}

// ─── SSE 客户端：解析 chat API 的事件流 ──────────────────────────────
interface SSEEvent {
  type: string;
  data: unknown;
}

async function collectSSE(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload);
        events.push({ type: event.type, data: event.data });
      } catch {
        // 忽略心跳 / 注释行
      }
    }
  }
  return events;
}

// ─── 工具：向 ToolRegistry 注册 mock 浏览器工具（返回可控大结果） ────
const bigSnapshotHead = '【页面结构】导航栏 / 内容区 / 表单';
const bigSnapshotTail = '【页面结尾】页脚与版权信息';
const BIG_SNAPSHOT = bigSnapshotHead + 'M'.repeat(9000) + bigSnapshotTail;

// ─── 测试主体 ─────────────────────────────────────────────────────────
describe('AI 对话过程 E2E（10 问）', () => {
  let tmpDir: string;
  let mockLLM: MockLLMServer;
  let server: DashboardServer;
  let baseUrl: string;
  let snapshotCallCount = 0;
  /** CONFIG_DIR 在模块加载时固定为 <cwd>/test-data（@yuantest/core config/loader） */
  const configDir = path.resolve('./test-data');
  const configPath = path.join(configDir, 'llm-config.json');
  let originalConfig: string | null = null;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-chat-e2e-'));
    const dataDir = path.join(tmpDir, 'data');
    const outputDir = path.join(tmpDir, 'output');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // 1. 启动 mock LLM 服务器
    mockLLM = new MockLLMServer();
    await mockLLM.start();

    // 2. 写入 LLM 配置（CONFIG_DIR 为模块加载时固定的 <cwd>/test-data）
    const llmConfig: LLMConfig = {
      enabled: true,
      apiKey: 'e2e-key',
      baseUrl: `http://127.0.0.1:${mockLLM.port}`,
      model: 'e2e-mock-model',
      remark: '',
      maxTokens: 4096,
      temperature: 0.2,
    };
    fs.mkdirSync(configDir, { recursive: true });
    if (fs.existsSync(configPath)) {
      originalConfig = fs.readFileSync(configPath, 'utf-8');
    }
    fs.writeFileSync(configPath, JSON.stringify(llmConfig, null, 2));

    // 3. 启动真实 DashboardServer（随机端口）
    const port = 0;
    server = new DashboardServer(port, outputDir, dataDir);
    await server.start();
    const httpServer = (server as unknown as { server: http.Server }).server;
    const actualPort = (httpServer.address() as AddressInfo).port;
    baseUrl = `http://127.0.0.1:${actualPort}/api/v1`;

    // 4. 注册 mock 浏览器工具（走真实 toolExecutor → toolRegistry 链路）
    const registry = server.getContainer().resolve<ToolRegistry>(TOKENS.ToolRegistry);
    registry.registerTool(
      'browser_snapshot',
      {
        type: 'function',
        function: {
          name: 'browser_snapshot',
          description: 'Get the accessibility snapshot of the current page',
          parameters: { type: 'object', properties: { url: { type: 'string' } } },
        },
      },
      async () => {
        snapshotCallCount++;
        return BIG_SNAPSHOT;
      }
    );
  }, 120000);

  afterAll(async () => {
    await server.stop();
    await mockLLM.stop();
    // 恢复原始 LLM 配置（若测试前存在），避免污染开发环境
    try {
      if (originalConfig !== null) {
        fs.writeFileSync(configPath, originalConfig);
      } else if (fs.existsSync(configPath)) {
        fs.rmSync(configPath);
      }
    } catch {
      // ignore cleanup errors
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    // 输出分析报告数据（写入 gitignore 的 test-output/，供 CI artifact 上传与人工查阅）
    const e2eOutDir = path.join(process.cwd(), 'test-output', 'e2e');
    fs.mkdirSync(e2eOutDir, { recursive: true });
    fs.writeFileSync(
      path.join(e2eOutDir, 'ai-chat-e2e-results.json'),
      JSON.stringify(RESULTS, null, 2)
    );
  }, 30000);

  /** 创建会话并发送消息，收集 SSE 事件，返回对话记录 */
  async function runConversation(question: string): Promise<ConversationRecord> {
    const createRes = await fetch(`${baseUrl}/chat/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: question.slice(0, 20) }),
    });
    const conv = (await createRes.json()) as { id: string };

    const msgRes = await fetch(`${baseUrl}/chat/conversations/${conv.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question }),
    });
    const events = await collectSSE(msgRes);

    const record: ConversationRecord = {
      question,
      rounds: 0,
      toolCalls: [],
      done: null,
      lastLlmRequest: mockLLM.lastRequestBody,
    };

    for (const ev of events) {
      if (ev.type === 'tool_call') {
        const d = ev.data as { name: string; arguments: string };
        record.toolCalls.push({ name: d.name, args: d.arguments, result: '' });
      } else if (ev.type === 'tool_result') {
        const d = ev.data as { name: string; result: string };
        const last = record.toolCalls[record.toolCalls.length - 1];
        if (last) last.result = d.result;
      } else if (ev.type === 'done') {
        const d = ev.data as {
          content: string;
          truncated?: boolean;
          analysisMode?: string;
        };
        record.done = { content: d.content, truncated: d.truncated, analysisMode: d.analysisMode };
      } else if (ev.type === 'error') {
        record.error = String(ev.data);
      }
    }
    record.rounds = events.filter((e) => e.type === 'tool_call').length;
    RESULTS.push(record);
    return record;
  }

  it('Q1 基础问候（无工具）：应直接返回文本，无工具调用，truncated=false', async () => {
    const question = '你好，请介绍一下你自己';
    mockLLM.registerScript(question, [{ type: 'text', content: '你好！我是 Playwright 测试助手。' }]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(rec.done).not.toBeNull();
    expect(rec.done!.content).toContain('Playwright');
    expect(rec.done!.truncated).toBeFalsy();
    expect(rec.toolCalls).toHaveLength(0);
  }, 30000);

  it('Q2 顽固模型反复同参调用 browser_snapshot：死循环防护应拦截（执行≤2次、第3次跳过）', async () => {
    const question = '帮我分析一下 http://localhost:5274/ 页面结构';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'text', content: '页面结构：导航、内容区、表单。' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    // 硬闸：工具真实执行 ≤2 次（第 3 次被防护跳过）
    expect(snapshotCallCount).toBeLessThanOrEqual(2);
    // 收到 3 个 tool_result：2 个真实结果 + 1 个防护跳过提示
    const guardResult = rec.toolCalls.filter((t) => t.result.includes('重复调用防护'));
    expect(guardResult.length).toBeGreaterThanOrEqual(1);
    // 强制收尾：truncated=true 且给出最终文本
    expect(rec.done).not.toBeNull();
    expect(rec.done!.truncated).toBe(true);
    expect(rec.done!.content).toContain('页面结构');
  }, 30000);

  it('Q3 同参重试 2 次后停止：第 2 次仍执行（引导而非禁止），正常结束 truncated=false', async () => {
    const question = '分析当前页面有哪些表单元素';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'text', content: '页面包含登录表单和搜索框。' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(snapshotCallCount).toBe(2); // 同参第 2 次仍执行
    expect(rec.done).not.toBeNull();
    expect(rec.done!.truncated).toBeFalsy();
    expect(rec.done!.content).toContain('登录表单');
  }, 30000);

  it('Q4 不同参数多次调用：合法重试不受限，全部执行，正常结束', async () => {
    const question = '分别分析页面顶部、中部、底部区域';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { region: 'header' } },
      { type: 'tool', name: 'browser_snapshot', args: { region: 'main' } },
      { type: 'tool', name: 'browser_snapshot', args: { region: 'footer' } },
      { type: 'text', content: '三个区域结构已分析完成。' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(snapshotCallCount).toBe(3); // 参数不同 → 均执行
    expect(rec.done!.truncated).toBeFalsy();
    expect(rec.done!.content).toContain('分析完成');
  }, 30000);

  it('Q5 大结果截断：回灌 LLM 的工具消息含头尾+中段省略+条件引导（非"禁止重试"）', async () => {
    const question = '获取页面完整结构并总结';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'text', content: '页面结构已总结。' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    // 工具真实执行过且返回大快照
    expect(snapshotCallCount).toBe(1);
    expect(rec.toolCalls[0].result).toContain(bigSnapshotHead);
    // mock LLM 收到的最后一次请求中，tool 消息应被头尾截断并带条件引导
    const req = rec.lastLlmRequest as { messages?: Array<{ role: string; content?: unknown }> };
    const toolMsg = (req?.messages || []).find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    const content = typeof toolMsg!.content === 'string' ? toolMsg!.content : '';
    expect(content).toContain(bigSnapshotHead); // 保留开头
    expect(content).toContain(bigSnapshotTail); // 保留结尾
    expect(content).toContain('中段省略'); // 中段省略标记
    expect(content).toContain('以相同参数重复调用不会获得新内容'); // 条件引导
    expect(content).not.toContain('禁止再次调用'); // 不写死禁止
    expect(content.length).toBeLessThan(3300); // 总长受控
  }, 30000);

  it('Q6 多工具正常流程：多个不同工具调用后正常结束', async () => {
    const question = '先看页面再查项目里有哪些 spec 文件';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'tool', name: 'search_codebase', args: { pattern: 'spec' } },
      { type: 'text', content: '页面与 spec 文件都已了解。' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(rec.toolCalls.length).toBeGreaterThanOrEqual(2);
    expect(rec.toolCalls.map((t) => t.name)).toContain('browser_snapshot');
    expect(rec.toolCalls.map((t) => t.name)).toContain('search_codebase');
    expect(rec.done!.truncated).toBeFalsy();
  }, 30000);

  it('Q7 预算耗尽强制收尾：模型持续调用工具直到 maxToolCalls，truncated=true', async () => {
    const question = '请连续探索页面多个区域直到完成';
    snapshotCallCount = 0;
    const script: ScriptItem[] = [];
    for (let i = 0; i < 12; i++) {
      script.push({ type: 'tool', name: 'browser_snapshot', args: { region: `area-${i}` } });
    }
    script.push({ type: 'text', content: '探索结束。' });
    mockLLM.registerScript(question, script);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(rec.done).not.toBeNull();
    expect(rec.done!.truncated).toBe(true); // 预算耗尽强制收尾
    expect(rec.done!.content.length).toBeGreaterThan(0);
  }, 30000);

  it('Q8 收尾质量：模型未返回正文时，最终回复应拼入最后一次工具结果', async () => {
    const question = '只执行工具但不要输出正文';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      // 强制收尾调用返回空正文 → synthesizeFinalContent 应拼入最后一次工具结果
      { type: 'text', content: '' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(rec.done).not.toBeNull();
    // 空正文场景下，最终回复包含工具结果预览（不再是纯"已执行 N 次"清单）
    expect(rec.done!.content.length).toBeGreaterThan(0);
    expect(rec.done!.content).toMatch(/工具调用|最后一次|页面结构/);
  }, 30000);

  it('Q9 thinking 分离：模型思考过程与正文分离，不泄漏 <think> 标签', async () => {
    const question = '1+1 等于多少？请先思考再回答';
    mockLLM.registerScript(question, [
      {
        type: 'text',
        content: '<think>让我先算一下：1+1=2。</think>答案是 2。',
      },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(rec.done).not.toBeNull();
    expect(rec.done!.content).toContain('答案是 2');
    expect(rec.done!.content).not.toContain('<think>'); // 正文不泄漏标签
  }, 30000);

  it('Q10 混合流程：先工具探索再输出最终文本（完整 agent 流程）', async () => {
    const question = '帮我分析页面结构并给出测试要点';
    snapshotCallCount = 0;
    mockLLM.registerScript(question, [
      { type: 'tool', name: 'browser_snapshot', args: { url: 'http://localhost:5274/' } },
      { type: 'text', content: '页面结构完整，测试要点：导航、表单、响应式。' },
    ]);
    const rec = await runConversation(question);
    expect(rec.error).toBeUndefined();
    expect(rec.toolCalls).toHaveLength(1);
    expect(rec.done).not.toBeNull();
    expect(rec.done!.truncated).toBeFalsy();
    expect(rec.done!.content).toContain('测试要点');
  }, 30000);
});
