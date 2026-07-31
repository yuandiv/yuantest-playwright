import type { Mock } from 'vitest';
import { vi } from 'vitest';
import { PlannerAgent, PLANNER_SYSTEM_PROMPT_ZH, PLANNER_SYSTEM_PROMPT_EN, PLANNER_FEW_SHOT_ZH, PLANNER_FEW_SHOT_EN } from '../../src/ai/agents/planner';
import { AgentConfig, LLMConfig } from '@yuantest/contracts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Helpers ──────────────────────────────────────────────────────────

function createLLMConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'http://localhost:11434',
    model: 'test-model',
    remark: '',
    maxTokens: 4096,
    temperature: 0.5,
    ...overrides,
  };
}

function createAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    enabled: true,
    loopTarget: 'vscode',
    specsDir: './specs',
    autoHeal: false,
    maxHealRounds: 0,
    ...overrides,
  };
}

/** Build a mock fetch that returns the given content string from the LLM. */
function mockFetchWithContent(content: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [{ message: { content }, finish_reason: 'stop' }],
    }),
  });
}

/** Valid JSON plan for testing parsePlanResponse through generatePlan. */
const VALID_PLAN_JSON = JSON.stringify({
  title: 'Login Feature Test Plan',
  description: 'Comprehensive login testing',
  scenarios: [
    {
      name: 'Happy Path',
      steps: [
        { action: 'Navigate to login', target: '', value: '/login' },
        { action: 'Enter username', target: "getByLabel('Username')", value: 'admin' },
        { action: 'Click login', target: "getByRole('button', { name: 'Login' })" },
      ],
      expectedResults: ['Redirect to dashboard', 'Welcome message shown'],
    },
    {
      name: 'Invalid Password',
      steps: [
        { action: 'Navigate to login', target: '', value: '/login' },
        { action: 'Enter wrong password', target: "getByLabel('Password')", value: 'bad' },
      ],
      expectedResults: ['Error message displayed'],
    },
  ],
});

/** Valid JSON plan wrapped in a markdown code block. */
const PLAN_IN_CODE_BLOCK = '```json\n' + VALID_PLAN_JSON + '\n```';

/** Truncated JSON – the scenarios array is cut off but first scenario is complete. */
const TRUNCATED_PLAN_JSON =
  '{"title":"Login Test","description":"Testing","scenarios":[{"name":"Happy Path","steps":[{"action":"Navigate","target":"","value":"/login"}],"expectedResults":["OK"]},';

/** Truncated JSON where repair can recover a complete first scenario. */
const TRUNCATED_PLAN_REPAIRABLE =
  '{"title":"Login Test","description":"Testing","scenarios":[{"name":"Happy Path","steps":[{"action":"Navigate","target":"","value":"/login"}],"expectedResults":["OK"]}';

/** Completely invalid (non-JSON) response. */
const INVALID_PLAN_RESPONSE = 'Sorry, I cannot generate a test plan for this.';

// ── Tests ────────────────────────────────────────────────────────────

describe('PlannerAgent', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // ── generatePlan / parsePlanResponse ─────────────────────────────

  describe('generatePlan (parsePlanResponse indirectly)', () => {
    it('parses valid JSON response from LLM', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(createAgentConfig(), createLLMConfig());
      const plan = await agent.generatePlan('Login feature');

      expect(plan.title).toBe('Login Feature Test Plan');
      expect(plan.description).toBe('Comprehensive login testing');
      expect(plan.scenarios).toHaveLength(2);
      expect(plan.scenarios[0].name).toBe('Happy Path');
      expect(plan.scenarios[0].steps).toHaveLength(3);
      expect(plan.scenarios[0].steps[1].value).toBe('admin');
      expect(plan.scenarios[0].expectedResults).toEqual(['Redirect to dashboard', 'Welcome message shown']);
      expect(plan.id).toMatch(/^plan-/);
      expect(typeof plan.createdAt).toBe('number');
    });

    it('parses JSON wrapped in a markdown code block', async () => {
      global.fetch = mockFetchWithContent(PLAN_IN_CODE_BLOCK);

      const agent = new PlannerAgent(createAgentConfig(), createLLMConfig());
      const plan = await agent.generatePlan('Login feature');

      expect(plan.title).toBe('Login Feature Test Plan');
      expect(plan.scenarios).toHaveLength(2);
    });

    it('repairs truncated JSON and recovers partial scenarios', async () => {
      global.fetch = mockFetchWithContent(TRUNCATED_PLAN_REPAIRABLE);

      const agent = new PlannerAgent(createAgentConfig(), createLLMConfig());
      const plan = await agent.generatePlan('Login feature');

      // The repair should recover the first scenario
      expect(plan.scenarios.length).toBeGreaterThanOrEqual(1);
      expect(plan.scenarios[0].name).toBe('Happy Path');
      expect(plan.scenarios[0].steps[0].action).toBe('Navigate');
    });

    it('creates fallback plan when truncated JSON cannot be repaired', async () => {
      global.fetch = mockFetchWithContent(TRUNCATED_PLAN_JSON);

      const agent = new PlannerAgent(createAgentConfig(), createLLMConfig());
      const plan = await agent.generatePlan('Login feature');

      // Repair fails for this truncation pattern, falls back to default plan
      expect(plan.title).toBe('Login feature');
      expect(plan.scenarios).toHaveLength(1);
      expect(plan.scenarios[0].name).toBe('Login feature');
    });

    it('creates a fallback plan for completely invalid JSON', async () => {
      global.fetch = mockFetchWithContent(INVALID_PLAN_RESPONSE);

      const agent = new PlannerAgent(createAgentConfig(), createLLMConfig());
      const plan = await agent.generatePlan('Login feature');

      // Fallback plan uses the original description as title
      expect(plan.title).toBe('Login feature');
      expect(plan.scenarios).toHaveLength(1);
      expect(plan.scenarios[0].name).toBe('Login feature');
      expect(plan.scenarios[0].expectedResults).toEqual([]);
    });

    it('throws if LLM is not enabled', async () => {
      const agent = new PlannerAgent(createAgentConfig(), null);
      await expect(agent.generatePlan('test')).rejects.toThrow('LLM is not enabled');
    });
  });

  // ── System prompt & few-shot selection by language ───────────────

  describe('system prompt and few-shot selection by language', () => {
    it('uses Chinese system prompt and few-shot when language is zh', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(createAgentConfig({ language: 'zh' }), createLLMConfig());
      await agent.generatePlan('登录功能');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');

      expect(systemMsg.content).toContain(PLANNER_SYSTEM_PROMPT_ZH);
      expect(systemMsg.content).toContain(PLANNER_FEW_SHOT_ZH);
    });

    it('uses English system prompt and few-shot when language is en', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(createAgentConfig({ language: 'en' }), createLLMConfig());
      await agent.generatePlan('Login feature');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');

      expect(systemMsg.content).toContain(PLANNER_SYSTEM_PROMPT_EN);
      expect(systemMsg.content).toContain(PLANNER_FEW_SHOT_EN);
    });

    it('defaults to Chinese when language is not specified', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(createAgentConfig(), createLLMConfig());
      await agent.generatePlan('登录功能');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');

      expect(systemMsg.content).toContain(PLANNER_SYSTEM_PROMPT_ZH);
    });

    it('uses custom prompts when provided', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const customSystemZh = '自定义中文系统提示';
      const customFewShotZh = '自定义中文示例';
      const agent = new PlannerAgent(
        createAgentConfig({ language: 'zh' }),
        createLLMConfig(),
        { plannerSystemZh: customSystemZh, plannerFewShotZh: customFewShotZh }
      );
      await agent.generatePlan('登录功能');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const systemMsg = body.messages.find((m: { role: string }) => m.role === 'system');

      expect(systemMsg.content).toContain(customSystemZh);
      expect(systemMsg.content).toContain(customFewShotZh);
      expect(systemMsg.content).not.toContain(PLANNER_SYSTEM_PROMPT_ZH);
    });
  });

  // ── Project context injection ────────────────────────────────────

  describe('project context injection', () => {
    it('injects project context into user prompt (Chinese)', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(
        createAgentConfig({
          language: 'zh',
          projectContext: {
            projectRoot: '/home/user/project',
            baseURL: 'https://app.example.com',
            technology: 'React + TypeScript',
            useViewport: { width: 1280, height: 720 },
            timeout: 30000,
            testDir: './tests',
            fixtures: 'auth.fixture.ts',
            packageJson: { name: 'my-app' },
          },
        }),
        createLLMConfig()
      );
      await agent.generatePlan('登录功能');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).toContain('被测应用信息');
      expect(userMsg.content).toContain('应用 URL: https://app.example.com');
      expect(userMsg.content).toContain('技术栈: React + TypeScript');
      expect(userMsg.content).toContain('视口: 1280x720');
      expect(userMsg.content).toContain('默认超时: 30000ms');
      expect(userMsg.content).toContain('测试目录: ./tests');
      expect(userMsg.content).toContain('Fixtures: auth.fixture.ts');
      expect(userMsg.content).toContain('项目名称: my-app');
      expect(userMsg.content).toContain('项目根目录: /home/user/project');
    });

    it('injects project context into user prompt (English)', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(
        createAgentConfig({
          language: 'en',
          projectContext: {
            projectRoot: '/home/user/project',
            baseURL: 'https://app.example.com',
            technology: 'Vue 3',
          },
        }),
        createLLMConfig()
      );
      await agent.generatePlan('Login feature');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).toContain('Application Information');
      expect(userMsg.content).toContain('URL: https://app.example.com');
      expect(userMsg.content).toContain('Tech Stack: Vue 3');
      expect(userMsg.content).toContain('Project Root: /home/user/project');
    });

    it('omits context section when projectContext is not set', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(createAgentConfig({ language: 'en' }), createLLMConfig());
      await agent.generatePlan('Login feature');

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).not.toContain('Application Information');
      expect(userMsg.content).not.toContain('被测应用信息');
    });
  });

  // ── Seed test & PRD injection ────────────────────────────────────

  describe('seed test and PRD content injection', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    });

    it('injects seed test content into user prompt (Chinese)', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const seedPath = path.join(tmpDir, 'seed.spec.ts');
      const seedContent = "test('login', async ({ page }) => { await page.goto('/login'); });";
      fs.writeFileSync(seedPath, seedContent, 'utf-8');

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'zh', seedTest: seedPath }),
        createLLMConfig()
      );
      await agent.generatePlan('登录功能', { seedTest: seedPath });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).toContain('参考 Seed Test');
      expect(userMsg.content).toContain(seedContent);
    });

    it('injects seed test content into user prompt (English)', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const seedPath = path.join(tmpDir, 'seed.spec.ts');
      const seedContent = "test('login', async ({ page }) => { await page.goto('/login'); });";
      fs.writeFileSync(seedPath, seedContent, 'utf-8');

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'en' }),
        createLLMConfig()
      );
      await agent.generatePlan('Login feature', { seedTest: seedPath });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).toContain('Reference Seed Test');
      expect(userMsg.content).toContain(seedContent);
    });

    it('injects PRD content into user prompt (Chinese)', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const prdPath = path.join(tmpDir, 'prd.md');
      const prdContent = '# 产品需求\n\n用户登录功能需要支持多种认证方式。';
      fs.writeFileSync(prdPath, prdContent, 'utf-8');

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'zh' }),
        createLLMConfig()
      );
      await agent.generatePlan('登录功能', { prdPath });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).toContain('产品需求文档');
      expect(userMsg.content).toContain(prdContent);
    });

    it('injects PRD content into user prompt (English)', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const prdPath = path.join(tmpDir, 'prd.md');
      const prdContent = '# Requirements\n\nUser login must support multiple auth methods.';
      fs.writeFileSync(prdPath, prdContent, 'utf-8');

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'en' }),
        createLLMConfig()
      );
      await agent.generatePlan('Login feature', { prdPath });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).toContain('Product Requirement Document');
      expect(userMsg.content).toContain(prdContent);
    });

    it('truncates PRD content to 3000 characters', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const prdPath = path.join(tmpDir, 'long-prd.md');
      const longContent = 'x'.repeat(5000);
      fs.writeFileSync(prdPath, longContent, 'utf-8');

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'en' }),
        createLLMConfig()
      );
      await agent.generatePlan('Login feature', { prdPath });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      // The PRD content in the prompt should be at most 3000 chars
      const prdSection = userMsg.content.split('Product Requirement Document:')[1];
      expect(prdSection.length).toBeLessThanOrEqual(3010); // small margin for newline
    });

    it('skips seed test injection when file does not exist', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'en' }),
        createLLMConfig()
      );
      await agent.generatePlan('Login feature', { seedTest: '/nonexistent/seed.spec.ts' });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).not.toContain('Reference Seed Test');
    });

    it('skips PRD injection when file does not exist', async () => {
      global.fetch = mockFetchWithContent(VALID_PLAN_JSON);

      const agent = new PlannerAgent(
        createAgentConfig({ language: 'en' }),
        createLLMConfig()
      );
      await agent.generatePlan('Login feature', { prdPath: '/nonexistent/prd.md' });

      const fetchCall = (global.fetch as Mock).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body);
      const userMsg = body.messages.find((m: { role: string }) => m.role === 'user');

      expect(userMsg.content).not.toContain('Product Requirement Document');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle LLM network error', async () => {
      const planner = new PlannerAgent(createAgentConfig(), createLLMConfig());

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(planner.generatePlan('Test login')).rejects.toThrow();
    });

    it('should handle empty description', async () => {
      const planner = new PlannerAgent(createAgentConfig(), createLLMConfig());

      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      // Should not crash with empty description
      await expect(planner.generatePlan('')).rejects.toThrow();
    });
  });
});
