import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GeneratorAgent } from '../../src/agents/generator';
import { AgentConfig, LLMConfig } from '../../src/types';
import { LLMService } from '../../src/agents/llm-service';

// Helper to cast private methods for testing
type PrivateMethods = {
  extractTestName: (code: string) => string | null;
  extractCodeBlocks: (text: string) => string[];
  cleanCode: (text: string) => string;
  generateSlug: (text: string) => string;
};

function getPrivateMethods(agent: GeneratorAgent): PrivateMethods {
  return agent as unknown as PrivateMethods;
}

/** Mock LLMService.chatWithAgentLoop to return a given response text */
function mockAgentLoop(responseText: string) {
  return jest.spyOn(LLMService.prototype, 'chatWithAgentLoop').mockResolvedValue({
    responseText,
    reasoningSteps: [],
    analysisMode: 'single' as const,
  });
}

const defaultAgentConfig: AgentConfig = {
  enabled: true,
  loopTarget: 'vscode',
  specsDir: './specs',
  autoHeal: false,
  maxHealRounds: 0,
};

const defaultLLMConfig: LLMConfig = {
  enabled: true,
  apiKey: 'test-key',
  baseUrl: 'http://localhost:11434',
  model: 'test-model',
  remark: '',
  maxTokens: 4096,
  temperature: 0.2,
};

describe('GeneratorAgent', () => {
  let tmpDir: string;
  let agent: GeneratorAgent;
  let privates: PrivateMethods;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'generator-test-'));
    agent = new GeneratorAgent(
      { ...defaultAgentConfig, projectRoot: tmpDir },
      defaultLLMConfig
    );
    privates = getPrivateMethods(agent);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- extractTestName / generateSlug ---

  describe('extractTestName', () => {
    it('should extract English test name from test.describe', () => {
      const code = `import { test } from '@playwright/test';\ntest.describe('Login Flow', () => {});`;
      const result = privates.extractTestName(code);
      expect(result).toBe('Login-Flow');
    });

    it('should extract English test name from test()', () => {
      const code = `test('Login Flow', async ({ page }) => {});`;
      const result = privates.extractTestName(code);
      expect(result).toBe('Login-Flow');
    });

    it('should return null when no test name is found', () => {
      const code = `const x = 1;`;
      const result = privates.extractTestName(code);
      expect(result).toBeNull();
    });

    it('should handle Chinese test name from test.describe and preserve Unicode', () => {
      const code = `test.describe('用户登录功能', () => {});`;
      const result = privates.extractTestName(code);
      expect(result).not.toBe('');
      expect(result).not.toBeNull();
      // generateSlug preserves Unicode characters
      expect(result).toContain('用户登录功能');
    });

    it('should handle Chinese test name from test() and not produce empty string', () => {
      const code = `test('用户登录功能', async ({ page }) => {});`;
      const result = privates.extractTestName(code);
      expect(result).not.toBe('');
      expect(result).not.toBeNull();
      expect(result).toContain('用户登录功能');
    });

    it('should produce a valid non-empty file name for Chinese test names', () => {
      const code = `test('用户登录功能', async ({ page }) => {});`;
      const testName = privates.extractTestName(code);
      expect(testName).toBeTruthy();
      // The resulting file name should be usable
      const fileName = `${testName}.spec.ts`;
      expect(fileName.length).toBeGreaterThan('.spec.ts'.length);
    });
  });

  describe('generateSlug', () => {
    it('should convert spaces to hyphens', () => {
      expect(privates.generateSlug('Login Flow Test')).toBe('Login-Flow-Test');
    });

    it('should replace special filesystem characters with hyphens', () => {
      expect(privates.generateSlug('test/case:1')).toBe('test-case-1');
    });

    it('should collapse multiple hyphens', () => {
      expect(privates.generateSlug('test   case')).toBe('test-case');
    });

    it('should trim leading/trailing hyphens', () => {
      expect(privates.generateSlug(' test ')).toBe('test');
    });

    it('should truncate to 50 characters', () => {
      const long = 'a'.repeat(100);
      expect(privates.generateSlug(long).length).toBe(50);
    });

    it('should preserve Chinese characters', () => {
      const result = privates.generateSlug('用户登录功能');
      expect(result).toBe('用户登录功能');
    });

    it('should handle mixed Chinese and English with spaces', () => {
      const result = privates.generateSlug('用户 Login 功能');
      expect(result).toBe('用户-Login-功能');
    });

    it('should fallback to ASCII-only slug when result would be empty', () => {
      // Characters that are all stripped by the first pass but have ASCII fallback
      const result = privates.generateSlug('???');
      // The first pass strips all special chars, leaving empty, then fallback runs
      // Fallback: toLowerCase + replace non-alphanumeric -> all stripped -> empty string
      expect(result).toBe('');
    });
  });

  // --- extractCodeBlocks ---

  describe('extractCodeBlocks', () => {
    it('should extract typescript code blocks', () => {
      const text = 'Some text\n```typescript\nimport { test } from "@playwright/test";\ntest("example", () => {});\n```\nMore text';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain('import { test }');
    });

    it('should extract ts code blocks', () => {
      const text = '```ts\ntest("example", () => {});\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toContain('test("example", () => {})');
    });

    it('should extract javascript code blocks', () => {
      const text = '```javascript\ntest("example", () => {});\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should extract js code blocks', () => {
      const text = '```js\ntest("example", () => {});\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should extract code blocks with no language tag', () => {
      const text = '```\nimport { test } from "@playwright/test";\ntest("example", () => {});\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should filter out code blocks without test/import keywords', () => {
      const text = '```typescript\nconst x = 42;\nconsole.log(x);\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(0);
    });

    it('should include code blocks with test.describe', () => {
      const text = '```typescript\ntest.describe("suite", () => {});\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should include code blocks with import statements', () => {
      const text = '```typescript\nimport { test, expect } from "@playwright/test";\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(1);
    });

    it('should extract multiple code blocks', () => {
      const text =
        '```typescript\nimport { test } from "@playwright/test";\ntest("a", () => {});\n```\n' +
        'Some explanation\n' +
        '```typescript\ntest("b", () => {});\n```';
      const blocks = privates.extractCodeBlocks(text);
      expect(blocks).toHaveLength(2);
    });
  });

  // --- cleanCode ---

  describe('cleanCode', () => {
    it('should extract code from typescript code blocks', () => {
      const text = '```typescript\nimport { test } from "@playwright/test";\ntest("example", () => {});\n```';
      const result = privates.cleanCode(text);
      expect(result).not.toContain('```');
      expect(result).toContain('import { test }');
    });

    it('should extract code from ts code blocks', () => {
      const text = '```ts\nconst x = 1;\n```';
      const result = privates.cleanCode(text);
      expect(result).toBe('const x = 1;');
    });

    it('should return trimmed text when no code block is present', () => {
      const text = '  plain code here  ';
      const result = privates.cleanCode(text);
      expect(result).toBe('plain code here');
    });

    it('should extract only the first code block', () => {
      const text = '```ts\nfirst\n```\n```ts\nsecond\n```';
      const result = privates.cleanCode(text);
      expect(result).toBe('first');
    });
  });

  // --- generateTests full flow ---

  describe('generateTests', () => {
    it('should throw error when LLM is not enabled', async () => {
      const noLlmAgent = new GeneratorAgent(defaultAgentConfig, null);
      await expect(
        noLlmAgent.generateTests('test plan')
      ).rejects.toThrow('LLM is not enabled');
    });

    it('should create test files from LLM response with code blocks', async () => {
      const responseText =
        'Here is the generated test:\n\n' +
        '```typescript\n' +
        "import { test, expect } from '@playwright/test';\n\n" +
        "test.describe('Login Flow', () => {\n" +
        "  test('should login successfully', async ({ page }) => {\n" +
        "    await page.goto('/login');\n" +
        '  });\n' +
        '});\n' +
        '```';

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'generated-tests');
      const files = await agent.generateTests('Test plan for login', { outputDir });

      expect(files.length).toBeGreaterThan(0);
      expect(fs.existsSync(files[0])).toBe(true);

      const content = fs.readFileSync(files[0], 'utf-8');
      expect(content).toContain("import { test, expect }");
      expect(content).toContain("test.describe('Login Flow'");

      // File name should contain the test name slug
      const basename = path.basename(files[0]);
      expect(basename).toMatch(/\.spec\.ts$/);

      spy.mockRestore();
    });

    it('should create test file with generated name when no code blocks are present', async () => {
      const responseText =
        "import { test, expect } from '@playwright/test';\n\ntest('basic test', async ({ page }) => {\n  await page.goto('/');\n});";

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'no-blocks');
      const files = await agent.generateTests('Simple test plan', { outputDir });

      expect(files).toHaveLength(1);
      expect(fs.existsSync(files[0])).toBe(true);

      const basename = path.basename(files[0]);
      expect(basename).toMatch(/^generated-.*\.spec\.ts$/);

      spy.mockRestore();
    });

    it('should handle Chinese test names and produce valid file names', async () => {
      const responseText =
        '```typescript\n' +
        "import { test, expect } from '@playwright/test';\n\n" +
        "test.describe('用户登录功能', () => {\n" +
        "  test('should work', async ({ page }) => {\n" +
        "    await page.goto('/login');\n" +
        '  });\n' +
        '});\n' +
        '```';

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'chinese-tests');
      const files = await agent.generateTests('用户登录测试计划', { outputDir });

      expect(files).toHaveLength(1);
      expect(fs.existsSync(files[0])).toBe(true);

      const basename = path.basename(files[0]);
      // Should not be empty before .spec.ts
      const namePart = basename.replace(/\.spec\.ts$/, '');
      expect(namePart.length).toBeGreaterThan(0);
      // Should contain the Chinese characters
      expect(basename).toContain('用户登录功能');

      spy.mockRestore();
    });

    it('should create output directory if it does not exist', async () => {
      const responseText =
        '```typescript\n' +
        "import { test } from '@playwright/test';\n" +
        "test('example', async ({ page }) => {});\n" +
        '```';

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'nested', 'dir', 'tests');
      expect(fs.existsSync(outputDir)).toBe(false);

      const files = await agent.generateTests('Plan', { outputDir });

      expect(fs.existsSync(outputDir)).toBe(true);
      expect(files.length).toBeGreaterThan(0);

      spy.mockRestore();
    });

    it('should deduplicate file names with index suffix', async () => {
      const responseText =
        '```typescript\n' +
        "test.describe('Same Name', () => {\n" +
        "  test('a', async ({ page }) => {});\n" +
        '});\n' +
        '```\n' +
        '```typescript\n' +
        "test.describe('Same Name', () => {\n" +
        "  test('b', async ({ page }) => {});\n" +
        '});\n' +
        '```';

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'dedup');
      const files = await agent.generateTests('Plan', { outputDir });

      expect(files).toHaveLength(2);
      const basenames = files.map((f) => path.basename(f));
      // One should be the base name, the other with index suffix
      expect(basenames.some((b) => b === 'Same-Name.spec.ts')).toBe(true);
      expect(basenames.some((b) => b === 'Same-Name-2.spec.ts')).toBe(true);

      spy.mockRestore();
    });

    it('should use English system prompt when language is en', async () => {
      const enAgent = new GeneratorAgent(
        { ...defaultAgentConfig, projectRoot: tmpDir, language: 'en' },
        defaultLLMConfig
      );

      const responseText =
        '```typescript\n' +
        "import { test } from '@playwright/test';\n" +
        "test('example', async ({ page }) => {});\n" +
        '```';

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'en-tests');
      await enAgent.generateTests('Test plan', { outputDir });

      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0][0] as { system: string; user: string };
      expect(callArgs.system).toContain('Playwright test engineer');
      expect(callArgs.user).toContain('Generate Playwright test code');

      spy.mockRestore();
    });

    it('should use Chinese system prompt when language is zh', async () => {
      const zhAgent = new GeneratorAgent(
        { ...defaultAgentConfig, projectRoot: tmpDir, language: 'zh' },
        defaultLLMConfig
      );

      const responseText =
        '```typescript\n' +
        "import { test } from '@playwright/test';\n" +
        "test('example', async ({ page }) => {});\n" +
        '```';

      const spy = mockAgentLoop(responseText);

      const outputDir = path.join(tmpDir, 'zh-tests');
      await zhAgent.generateTests('测试计划', { outputDir });

      expect(spy).toHaveBeenCalledTimes(1);
      const callArgs = spy.mock.calls[0][0] as { system: string; user: string };
      expect(callArgs.system).toContain('Playwright 测试工程师');
      expect(callArgs.user).toContain('请根据以下测试计划生成');

      spy.mockRestore();
    });
  });
});
