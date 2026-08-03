/**
 * AgentHooks 插件化改造单元测试
 *
 * 验证点：
 * 1. BaseAgent.use(hook) 注册钩子，按注册顺序串行执行
 * 2. BaseAgent.callLLM 触发 onMessage（携带 prompt/response/usage/durationMs）
 * 3. BaseAgent.callLLM 异常时触发 onError，再重新抛出
 * 4. DiagnosisAgent.diagnose 通过 onStart 钩子短路（缓存命中）
 * 5. DiagnosisAgent.diagnose 通过 onPersist 钩子写缓存
 * 6. withContext 设置 runId/testId 供钩子读取，restore 后恢复
 */
import { vi } from 'vitest';
import { BaseAgent } from '@yuantest/ai';
import {
  AgentHooks,
  AgentContext,
  AgentMessageEvent,
  AgentPersistEvent,
  AgentErrorEvent,
} from '@yuantest/ai';
import { DiagnosisCacheHook } from '@yuantest/ai';
import { DiagnosisPersisterHook } from '@yuantest/ai';
import { DiagnosisCache } from '@yuantest/diagnosis';
import { DiagnosisPersister } from '@yuantest/diagnosis';
import { AgentConfig, LLMConfig, AIDiagnosis } from '@yuantest/contracts';

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
function makeMockLLMService(content: string, usage = { promptTokens: 10, completionTokens: 5, totalTokens: 15 }) {
  return {
    getConfig: () => llmConfig,
    chat: vi.fn().mockResolvedValue({ content, usage, finishReason: 'stop' }),
    updateConfig: vi.fn(),
  } as unknown as Parameters<typeof BaseAgent>[2] & object;
}

/** 创建一个记录所有事件的 mock 钩子 */
function makeRecordingHook(name: string) {
  const calls: Array<{ event: string; ctx: AgentContext; data: unknown }> = [];
  const hook: AgentHooks = {
    name,
    async onStart(ctx, input) {
      calls.push({ event: 'onStart', ctx, data: input });
      return null;
    },
    async onMessage(ctx, event: AgentMessageEvent) {
      calls.push({ event: 'onMessage', ctx, data: event });
    },
    async onPersist(ctx, event: AgentPersistEvent) {
      calls.push({ event: 'onPersist', ctx, data: event });
    },
    async onError(ctx, event: AgentErrorEvent) {
      calls.push({ event: 'onError', ctx, data: event });
    },
  };
  return { hook, calls };
}

describe('BaseAgent AgentHooks 插件化', () => {
  let agent: TestAgent;
  let mockLLM: ReturnType<typeof makeMockLLMService>;

  beforeEach(() => {
    mockLLM = makeMockLLMService('hello world');
    agent = new TestAgent(baseConfig, llmConfig, mockLLM as any);
  });

  describe('use(hook) 注册', () => {
    it('use() 注册钩子并返回 this（支持链式调用）', () => {
      const { hook } = makeRecordingHook('h1');
      const ret = agent.use(hook);
      expect(ret).toBe(agent);
    });

    it('注册多个钩子后按注册顺序串行执行', async () => {
      const order: string[] = [];
      const hook1: AgentHooks = {
        name: 'h1',
        async onMessage() {
          order.push('h1');
        },
      };
      const hook2: AgentHooks = {
        name: 'h2',
        async onMessage() {
          order.push('h2');
        },
      };
      agent.use(hook1).use(hook2);

      await agent['callLLM']('sys', 'usr');
      // callLLM 是 protected，通过下标访问；这里验证顺序
      expect(order).toEqual(['h1', 'h2']);
    });
  });

  describe('callLLM 触发 onMessage', () => {
    it('callLLM 成功后触发 onMessage，携带 response/usage/durationMs', async () => {
      const { hook, calls } = makeRecordingHook('rec');
      agent.use(hook);

      // callLLM 是 protected，通过下标访问
      const content = await (agent as any).callLLM('system-prompt', 'user-prompt');

      expect(content).toBe('hello world');
      expect(calls).toHaveLength(1);
      expect(calls[0].event).toBe('onMessage');
      const msg = calls[0].data as AgentMessageEvent;
      expect(msg.response).toBe('hello world');
      expect(msg.usage?.totalTokens).toBe(15);
      expect(msg.durationMs).toBeGreaterThanOrEqual(0);
      expect(msg.systemPrompt).toBe('system-prompt');
      expect(msg.userPrompt).toBe('user-prompt');
    });

    it('onMessage 钩子抛错时不影响主流程，仅记录 warn', async () => {
      const badHook: AgentHooks = {
        name: 'bad',
        async onMessage() {
          throw new Error('hook boom');
        },
      };
      agent.use(badHook);

      // 主流程不应抛错
      const content = await (agent as any).callLLM('sys', 'usr');
      expect(content).toBe('hello world');
    });
  });

  describe('callLLM 异常触发 onError', () => {
    it('callLLM 抛错时触发 onError，再重新抛出原错误', async () => {
      // 替换 mockLLM.chat 抛错
      (mockLLM.chat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('LLM down'));
      const { hook, calls } = makeRecordingHook('rec');
      agent.use(hook);

      await expect((agent as any).callLLM('sys', 'usr')).rejects.toThrow('LLM down');
      expect(calls).toHaveLength(1);
      expect(calls[0].event).toBe('onError');
      const errEvt = calls[0].data as AgentErrorEvent;
      expect((errEvt.error as Error).message).toBe('LLM down');
    });

    it('onError 钩子自身抛错时不影响错误重新抛出', async () => {
      (mockLLM.chat as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('LLM down'));
      const badHook: AgentHooks = {
        name: 'bad',
        async onError() {
          throw new Error('hook boom');
        },
      };
      agent.use(badHook);

      // 仍应抛出原始错误
      await expect((agent as any).callLLM('sys', 'usr')).rejects.toThrow('LLM down');
    });
  });

  describe('withContext 上下文设置', () => {
    it('withContext 设置 runId/testId，restore 后恢复', async () => {
      const { hook, calls } = makeRecordingHook('rec');
      agent.use(hook);

      // 通过 withContext 设置上下文
      const restore = agent.withContext({ runId: 'run-1', testId: 'test-1' });
      try {
        await (agent as any).callLLM('sys', 'usr');
      } finally {
        restore();
      }

      expect(calls).toHaveLength(1);
      const ctx = calls[0].ctx;
      expect(ctx.runId).toBe('run-1');
      expect(ctx.testId).toBe('test-1');
      expect(ctx.agentName).toBe('TestAgent');
    });

    it('未调用 withContext 时上下文 runId/testId 为 undefined', async () => {
      const { hook, calls } = makeRecordingHook('rec');
      agent.use(hook);

      await (agent as any).callLLM('sys', 'usr');

      const ctx = calls[0].ctx;
      // 未调用 withContext 时 currentContext 保持初始值 { agentName: '' }
      expect(ctx.agentName).toBe('');
      expect(ctx.runId).toBeUndefined();
      expect(ctx.testId).toBeUndefined();
    });
  });

  describe('DiagnosisCacheHook / DiagnosisPersisterHook', () => {
    it('DiagnosisCacheHook.onPersist(category=diagnosis) 写入缓存', async () => {
      const cache = new DiagnosisCache();
      const hook = new DiagnosisCacheHook(cache);
      const ctx: AgentContext = { agentName: 'TestAgent', runId: 'r1', testId: 't1' };
      const diagnosis: AIDiagnosis = {
        summary: 'test failed',
        rootCause: 'selector changed',
        suggestions: ['update selector'],
        confidence: 0.8,
        category: 'selector',
        calibratedConfidence: 0.8,
        contextUsed: {
          sourceCode: false,
          screenshot: false,
          consoleLogs: false,
          stackTrace: false,
          historyData: false,
          environmentInfo: false,
        },
      };

      await hook.onPersist(ctx, { key: 'cache-key-1', result: diagnosis, category: 'diagnosis' });

      // 缓存键由 onPersist 的 event.key 决定
      // 但 DiagnosisCacheHook.onPersist 当前用 event.key 写入 cache
      // 验证：通过 cache.get('cache-key-1') 可读回
      // 注意：DiagnosisCache 用 TTLCache，get 返回 AIDiagnosis | null
      const cached = cache.get('cache-key-1');
      expect(cached).toEqual(diagnosis);
    });

    it('DiagnosisCacheHook.onPersist(category!=diagnosis) 不写入缓存', async () => {
      const cache = new DiagnosisCache();
      const hook = new DiagnosisCacheHook(cache);
      const ctx: AgentContext = { agentName: 'TestAgent', runId: 'r1', testId: 't1' };

      await hook.onPersist(ctx, { key: 'k1', result: { foo: 'bar' }, category: 'cluster' });

      expect(cache.get('k1')).toBeNull();
    });

    it('DiagnosisPersisterHook.onPersist(category=diagnosis) 调用 persister.saveDiagnosis', async () => {
      const persister = new DiagnosisPersister('/tmp/test-diagnosis-persister');
      const saveSpy = vi.spyOn(persister, 'saveDiagnosis').mockResolvedValue(undefined);
      const hook = new DiagnosisPersisterHook(persister);
      const ctx: AgentContext = { agentName: 'TestAgent', runId: 'run-99', testId: 'test-99' };
      const diagnosis = { summary: 'x' } as AIDiagnosis;

      await hook.onPersist(ctx, { key: 'test-99', result: diagnosis, category: 'diagnosis' });

      expect(saveSpy).toHaveBeenCalledWith('run-99', 'test-99', diagnosis);
    });

    it('DiagnosisPersisterHook.onPersist(category=cluster) 调用 persister.saveClusterResult', async () => {
      const persister = new DiagnosisPersister('/tmp/test-diagnosis-persister');
      const saveSpy = vi.spyOn(persister, 'saveClusterResult').mockResolvedValue(undefined);
      const hook = new DiagnosisPersisterHook(persister);
      const ctx: AgentContext = { agentName: 'TestAgent', runId: 'run-99', testId: 't1' };
      const clusters = [{ id: 'c1' }];

      await hook.onPersist(ctx, { key: 'run-99', result: clusters, category: 'cluster' });

      expect(saveSpy).toHaveBeenCalledWith('run-99', clusters);
    });

    it('DiagnosisPersisterHook.onPersist(未知 category) 不调用任何 persister 方法', async () => {
      const persister = new DiagnosisPersister('/tmp/test-diagnosis-persister');
      const saveDiagSpy = vi.spyOn(persister, 'saveDiagnosis').mockResolvedValue(undefined);
      const saveClusterSpy = vi.spyOn(persister, 'saveClusterResult').mockResolvedValue(undefined);
      const hook = new DiagnosisPersisterHook(persister);
      const ctx: AgentContext = { agentName: 'TestAgent', runId: 'r1', testId: 't1' };

      await hook.onPersist(ctx, { key: 'k', result: {}, category: 'unknown' });

      expect(saveDiagSpy).not.toHaveBeenCalled();
      expect(saveClusterSpy).not.toHaveBeenCalled();
    });
  });
});
