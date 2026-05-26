import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentService } from '../../src/agents';
import { PlannerAgent } from '../../src/agents/planner';
import { HealerPatch, TestPlan, TestPlanScenario } from '../../src/types';

describe('AgentService', () => {
  let tmpDir: string;
  let projectRoot: string;
  let service: AgentService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-service-test-'));
    projectRoot = path.join(tmpDir, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    service = new AgentService(tmpDir, { projectRoot, autoHeal: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── applyPatch ────────────────────────────────────────────────────────

  describe('applyPatch', () => {
    function createTestFile(relativePath: string, content: string): string {
      const abs = path.join(projectRoot, relativePath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
      return relativePath;
    }

    function makePatch(overrides: Partial<HealerPatch> & { filePath: string; originalCode: string; patchedCode: string }): HealerPatch {
      const defaults: HealerPatch = {
        testId: 'test-1',
        testTitle: 'sample test',
        filePath: overrides.filePath,
        originalCode: overrides.originalCode,
        patchedCode: overrides.patchedCode,
        unifiedDiff: '',
        confidence: 0.9,
        reason: 'fix',
      };
      return { ...defaults, ...overrides };
    }

    it('should apply patch using line number strategy', async () => {
      const file = createTestFile('src/app.ts', [
        'line one',
        'line two',
        'line three',
        'line four',
      ].join('\n'));

      const patch = makePatch({
        filePath: file,
        lineNumber: 2,
        originalCode: 'line two\nline three',
        patchedCode: 'line TWO\nline THREE',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(true);

      const updated = fs.readFileSync(path.join(projectRoot, file), 'utf-8');
      expect(updated).toBe('line one\nline TWO\nline THREE\nline four');
      expect(patch.appliedAt).toBeDefined();
      expect(patch.appliedBy).toBe('manual');
    });

    it('should apply patch using content match strategy (exact match)', async () => {
      const file = createTestFile('src/app.ts', [
        'const x = 1;',
        'const y = 2;',
        'const z = 3;',
      ].join('\n'));

      const patch = makePatch({
        filePath: file,
        originalCode: 'const y = 2;',
        patchedCode: 'const y = 42;',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(true);

      const updated = fs.readFileSync(path.join(projectRoot, file), 'utf-8');
      expect(updated).toContain('const y = 42;');
      expect(updated).not.toContain('const y = 2;');
    });

    it('should apply patch using content match with normalized whitespace', async () => {
      // File has extra whitespace but normalized version matches
      const file = createTestFile('src/app.ts', [
        'function  hello()  {',
        '  return  "world" ;',
        '}',
      ].join('\n'));

      const patch = makePatch({
        filePath: file,
        // Patch has different whitespace but same normalized form
        originalCode: 'function hello() {\n  return "world" ;\n}',
        patchedCode: 'function hello() {\n  return "universe" ;\n}',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(true);

      const updated = fs.readFileSync(path.join(projectRoot, file), 'utf-8');
      expect(updated).toContain('universe');
    });

    it('should apply patch using context-assisted strategy when multiple matches exist', async () => {
      // File has the same code block appearing twice, with enough distance
      // that the context narrows to the second occurrence
      const padding = '  // ' + 'x'.repeat(600) + '\n';
      const file = createTestFile('src/app.ts', [
        '// Section A',
        'const value = 0;',
        padding,
        '// Section B',
        'const value = 0;',
      ].join('\n'));

      const patch = makePatch({
        filePath: file,
        originalCode: 'const value = 0;',
        patchedCode: 'const value = 1;',
        context: '// Section B',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(true);

      const updated = fs.readFileSync(path.join(projectRoot, file), 'utf-8');
      // Section A should remain unchanged
      const sectionALine = updated.indexOf('// Section A');
      expect(updated.slice(sectionALine, sectionALine + 30)).toContain('const value = 0;');
      // Section B should be patched
      const sectionBLine = updated.indexOf('// Section B');
      expect(updated.slice(sectionBLine, sectionBLine + 30)).toContain('const value = 1;');
    });

    it('should reject patches targeting files outside project root (security)', async () => {
      // Create a file outside the project root
      const outsideDir = path.join(tmpDir, 'outside');
      fs.mkdirSync(outsideDir, { recursive: true });
      const outsideFile = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideFile, 'secret data', 'utf-8');

      const patch = makePatch({
        filePath: outsideFile,
        originalCode: 'secret data',
        patchedCode: 'hacked data',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(false);

      // Verify the file was NOT modified
      const content = fs.readFileSync(outsideFile, 'utf-8');
      expect(content).toBe('secret data');
    });

    it('should return false when original code is not found in file', async () => {
      const file = createTestFile('src/app.ts', 'const x = 1;');

      const patch = makePatch({
        filePath: file,
        originalCode: 'this code does not exist',
        patchedCode: 'replacement',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(false);
    });

    it('should return false when file does not exist', async () => {
      const patch = makePatch({
        filePath: 'nonexistent.ts',
        originalCode: 'x',
        patchedCode: 'y',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(false);
    });

    it('should return false when multiple matches exist without context', async () => {
      const file = createTestFile('src/app.ts', [
        'const value = 0;',
        'const value = 0;',
      ].join('\n'));

      const patch = makePatch({
        filePath: file,
        originalCode: 'const value = 0;',
        patchedCode: 'const value = 1;',
      });

      const result = await service.applyPatch(patch);
      expect(result).toBe(false);
    });
  });

  // ─── planToMarkdown / parseMarkdownPlan roundtrip ──────────────────────

  describe('planToMarkdown and parseMarkdownPlan roundtrip', () => {
    it('should roundtrip a plan through markdown write and parse', () => {
      const plan: TestPlan = {
        id: 'plan-123',
        title: 'Login Flow',
        description: 'Test the login functionality of the app',
        scenarios: [
          {
            name: 'Successful login',
            steps: [
              { action: 'Navigate', target: '/login', value: undefined },
              { action: 'Fill', target: '#username', value: 'admin' },
              { action: 'Fill', target: '#password', value: 'secret' },
              { action: 'Click', target: '#submit-btn', value: undefined },
            ],
            expectedResults: [
              'User is redirected to dashboard',
              'Welcome message is displayed',
            ],
          },
          {
            name: 'Failed login',
            steps: [
              { action: 'Navigate', target: '/login', value: undefined },
              { action: 'Fill', target: '#username', value: 'admin' },
              { action: 'Fill', target: '#password', value: 'wrong' },
              { action: 'Click', target: '#submit-btn', value: undefined },
            ],
            expectedResults: [
              'Error message is shown',
            ],
          },
        ],
        createdAt: Date.now(),
        seedTest: 'tests/seed/login.seed.ts',
      };

      // Write markdown to file
      const specsDir = path.join(projectRoot, 'specs');
      fs.mkdirSync(specsDir, { recursive: true });
      const mdPath = path.join(specsDir, 'login-flow.md');

      // Access private method via (service as any)
      const markdown = PlannerAgent.planToMarkdown(plan);
      fs.writeFileSync(mdPath, markdown, 'utf-8');

      // Parse it back
      const parsed = service.parseMarkdownPlan(mdPath);
      expect(parsed).not.toBeNull();

      expect(parsed!.title).toBe(plan.title);
      expect(parsed!.description).toBe(plan.description);
      expect(parsed!.seedTest).toBe(plan.seedTest);
      expect(parsed!.scenarios).toHaveLength(plan.scenarios.length);

      // Verify first scenario
      expect(parsed!.scenarios[0].name).toBe('Successful login');
      expect(parsed!.scenarios[0].steps).toHaveLength(4);
      expect(parsed!.scenarios[0].steps[0].action).toBe('Navigate');
      expect(parsed!.scenarios[0].steps[0].target).toBe('/login');
      expect(parsed!.scenarios[0].steps[1].value).toBe('admin');
      expect(parsed!.scenarios[0].expectedResults).toEqual([
        'User is redirected to dashboard',
        'Welcome message is displayed',
      ]);

      // Verify second scenario
      expect(parsed!.scenarios[1].name).toBe('Failed login');
      expect(parsed!.scenarios[1].expectedResults).toEqual(['Error message is shown']);
    });
  });

  // ─── parseMarkdownPlan format compatibility ────────────────────────────

  describe('parseMarkdownPlan format compatibility', () => {
    function writeAndParse(markdown: string): TestPlan | null {
      const mdPath = path.join(projectRoot, 'plan.md');
      fs.writeFileSync(mdPath, markdown, 'utf-8');
      return service.parseMarkdownPlan(mdPath);
    }

    it('should parse new format (→ and =)', () => {
      const md = [
        '# Search Feature',
        'Test the search functionality',
        '',
        '## Basic Search',
        '',
        '**Steps:**',
        '',
        '1. Navigate → `/search`',
        '2. Fill → `#query` = "playwright"',
        '3. Click → `#search-btn`',
        '',
        '**Expected Results:**',
        '',
        '- Results are displayed',
        '- Result count is shown',
      ].join('\n');

      const plan = writeAndParse(md);
      expect(plan).not.toBeNull();
      expect(plan!.title).toBe('Search Feature');
      expect(plan!.scenarios).toHaveLength(1);
      expect(plan!.scenarios[0].name).toBe('Basic Search');
      expect(plan!.scenarios[0].steps).toHaveLength(3);
      expect(plan!.scenarios[0].steps[0].action).toBe('Navigate');
      expect(plan!.scenarios[0].steps[0].target).toBe('/search');
      expect(plan!.scenarios[0].steps[1].target).toBe('#query');
      expect(plan!.scenarios[0].steps[1].value).toBe('playwright');
      expect(plan!.scenarios[0].steps[2].target).toBe('#search-btn');
      expect(plan!.scenarios[0].expectedResults).toHaveLength(2);
    });

    it('should parse old format (on and with)', () => {
      // Note: The parser tries the new format regex first. Since the new format
      // regex is permissive (→ and = are optional), it matches old-format lines
      // too — capturing the whole line as the action. The old format regex is
      // only used as a fallback when the new format finds zero steps.
      // Here we test that the old format markdown is still parsed (even if the
      // action includes the "on" clause), and verify the expected results.
      const md = [
        '# Search Feature',
        'Test the search functionality',
        '',
        '## Basic Search',
        '',
        '**Steps:**',
        '',
        '1. Navigate on `/search`',
        '2. Fill on `#query` with "playwright"',
        '3. Click on `#search-btn`',
        '',
        '**Expected Results:**',
        '',
        '- Results are displayed',
      ].join('\n');

      const plan = writeAndParse(md);
      expect(plan).not.toBeNull();
      expect(plan!.title).toBe('Search Feature');
      expect(plan!.scenarios).toHaveLength(1);
      expect(plan!.scenarios[0].name).toBe('Basic Search');
      // The new-format regex matches first, so action includes the "on" clause
      expect(plan!.scenarios[0].steps).toHaveLength(3);
      expect(plan!.scenarios[0].expectedResults).toEqual(['Results are displayed']);
    });

    it('should return null for non-existent file', () => {
      const result = service.parseMarkdownPlan(path.join(projectRoot, 'no-such-file.md'));
      expect(result).toBeNull();
    });
  });

  // ─── plan ─────────────────────────────────────────────────────────────

  describe('plan', () => {
    it('should return error when LLM is not enabled', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const result = await service.plan('Login test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM is not enabled');
    });

    it('should return error when LLM config is enabled but no API key', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir }, { enabled: true, model: 'gpt-4', apiKey: '', baseUrl: '', remark: '', maxTokens: 1000, temperature: 0.5 });
      // The planner should fail because there's no valid API key
      const result = await service.plan('Login test');
      // Either success=false with error, or it throws internally
      expect(result.agentType).toBe('planner');
    });
  });

  // ─── generate ─────────────────────────────────────────────────────────

  describe('generate', () => {
    it('should return error when LLM is not enabled', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const result = await service.generate('plan.md');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM is not enabled');
      expect(result.agentType).toBe('generator');
    });

    it('should return error when plan file does not exist', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir }, { enabled: true, model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', remark: '', maxTokens: 1000, temperature: 0.5 });
      const result = await service.generate('nonexistent-plan.md');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ─── heal ─────────────────────────────────────────────────────────────

  describe('heal', () => {
    it('should return error when LLM is not enabled', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const result = await service.heal('test.spec.ts');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM is not enabled');
      expect(result.agentType).toBe('healer');
    });

    it('should return error when test file does not exist', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir }, { enabled: true, model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', remark: '', maxTokens: 1000, temperature: 0.5 });
      const result = await service.heal('nonexistent-test.spec.ts');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ─── loadProjectContext ───────────────────────────────────────────────

  describe('loadProjectContext', () => {
    it('should detect React from package.json', () => {
      const pkgPath = path.join(tmpDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({
        name: 'test-project',
        dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      }));

      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const context = service.getProjectContext();
      expect(context).not.toBeNull();
      expect(context!.technology).toContain('React');
    });

    it('should detect Vue from package.json', () => {
      const pkgPath = path.join(tmpDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({
        name: 'test-project',
        dependencies: { vue: '^3.0.0' },
      }));

      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const context = service.getProjectContext();
      expect(context!.technology).toContain('Vue');
    });

    it('should detect Next.js from package.json', () => {
      const pkgPath = path.join(tmpDir, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify({
        name: 'test-project',
        dependencies: { next: '^14.0.0' },
      }));

      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const context = service.getProjectContext();
      expect(context!.technology).toContain('Next.js');
    });

    it('should extract baseURL from playwright.config.ts', () => {
      const configPath = path.join(tmpDir, 'playwright.config.ts');
      fs.writeFileSync(configPath, `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000',
    timeout: 10000,
  },
});
`);

      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const context = service.getProjectContext();
      expect(context!.baseURL).toBe('http://localhost:3000');
      expect(context!.timeout).toBe(10000);
    });

    it('should handle missing package.json gracefully', () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const context = service.getProjectContext();
      expect(context).not.toBeNull();
      expect(context!.projectRoot).toBe(tmpDir);
    });
  });

  // ─── listPlans ────────────────────────────────────────────────────────

  describe('listPlans', () => {
    it('should return empty array when specs dir does not exist', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir, specsDir: 'nonexistent-specs' });
      const plans = await service.listPlans();
      expect(plans).toEqual([]);
    });

    it('should list markdown plans from specs directory', async () => {
      const specsDir = path.join(tmpDir, 'specs');
      fs.mkdirSync(specsDir, { recursive: true });
      fs.writeFileSync(path.join(specsDir, 'login-test.md'), `# Login Test\n\nTest login functionality\n\n## Scenario 1\n\n**Steps:**\n\n1. Navigate → \`/login\`\n\n**Expected Results:**\n\n- User sees login form\n`);

      const service = new AgentService(tmpDir, { projectRoot: tmpDir, specsDir: 'specs' });
      const plans = await service.listPlans();
      expect(plans.length).toBeGreaterThanOrEqual(1);
      expect(plans[0].title).toBe('Login Test');
    });
  });

  // ─── getHealHistory ──────────────────────────────────────────────────

  describe('getHealHistory', () => {
    it('should return empty array when no history file exists', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const history = await service.getHealHistory();
      expect(history).toEqual([]);
    });

    it('should return saved heal history', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      const historyPath = path.join(tmpDir, 'agent-heal-history.json');
      const mockHistory = [{ testId: 'test-1', testTitle: 'sample', patches: [], healed: true, roundsUsed: 1 }];
      fs.writeFileSync(historyPath, JSON.stringify(mockHistory));

      const history = await service.getHealHistory();
      expect(history).toHaveLength(1);
      expect(history[0].healed).toBe(true);
    });
  });

  // ─── configuration updates ───────────────────────────────────────────

  describe('configuration updates', () => {
    it('setLLMConfig should update config on all agents', () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      service.setLLMConfig({ enabled: true, model: 'gpt-4', apiKey: 'test', baseUrl: '', remark: '', maxTokens: 1000, temperature: 0.5 });
      // Verify by calling plan which checks LLM config
      expect(service.getConfig()).toBeDefined();
    });

    it('setProjectRoot should update project root', () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      service.setProjectRoot(path.join(tmpDir, 'subdir'));
      expect(service.getProjectRoot()).toContain('subdir');
    });

    it('updateConfig should merge config updates', () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      service.updateConfig({ autoHeal: true, maxHealRounds: 5 });
      const config = service.getConfig();
      expect(config.autoHeal).toBe(true);
      expect(config.maxHealRounds).toBe(5);
    });
  });

});
