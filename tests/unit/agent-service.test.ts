import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentService } from '../../src/ai/agents';
import { TestPlan } from '../../src/types';

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

  // ─── generate ─────────────────────────────────────────────────────────

  describe('generate', () => {
    it('should return error when LLM is not enabled', async () => {
      const result = await service.generate('plan.md');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM is not enabled');
      expect(result.agentType).toBe('generator');
    });
  });

  // ─── heal ─────────────────────────────────────────────────────────────

  describe('heal', () => {
    it('should return error when LLM is not enabled', async () => {
      const result = await service.heal('test.spec.ts');
      expect(result.success).toBe(false);
      expect(result.error).toContain('LLM is not enabled');
      expect(result.agentType).toBe('healer');
    });

    it('should return error when test file does not exist', async () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir }, { enabled: true, model: 'gpt-4', apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', remark: '', maxTokens: 1000, temperature: 0.5 });
      const result = await service.heal('nonexistent-test.spec.ts');
      expect(result.success).toBe(false);
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
    });

    it('should parse old format (colon-based) as fallback', () => {
      const md = [
        '# Search Feature',
        'Test the search functionality',
        '',
        '## Basic Search',
        '',
        '**Steps:**',
        '',
        '1. Navigate: /search',
        '2. Fill: #query',
        '3. Click: #search-btn',
        '',
        '**Expected Results:**',
        '',
        '- Results are displayed',
      ].join('\n');

      const plan = writeAndParse(md);
      expect(plan).not.toBeNull();
      expect(plan!.title).toBe('Search Feature');
      expect(plan!.scenarios).toHaveLength(1);
      // Colon format: action contains full text, target may be empty
      expect(plan!.scenarios[0].steps[0].action).toContain('Navigate:');
      expect(plan!.scenarios[0].steps[0].target).toBe('');
    });

    it('should handle empty scenarios gracefully', () => {
      const md = [
        '# Empty Plan',
        'No scenarios here',
        '',
      ].join('\n');

      const plan = writeAndParse(md);
      expect(plan).not.toBeNull();
      expect(plan!.title).toBe('Empty Plan');
      expect(plan!.scenarios).toEqual([]);
    });

    it('should return null for non-existent file', () => {
      const result = service.parseMarkdownPlan('/nonexistent/path/plan.md');
      expect(result).toBeNull();
    });

    it('should handle missing title gracefully', () => {
      const md = [
        'Just some text without a title',
        '',
        '## Scenario',
        '',
        '**Steps:**',
        '',
        '1. Do something',
        '',
        '**Expected Results:**',
        '',
        '- Something happens',
      ].join('\n');

      const plan = writeAndParse(md);
      expect(plan).not.toBeNull();
      expect(plan!.title).toBe('plan');
    });

    it('should parse seed test reference', () => {
      const md = [
        '# Login Test',
        'Test login',
        '',
        '**Seed:** `tests/seed/auth.seed.ts`',
        '',
        '## Login Scenario',
        '',
        '**Steps:**',
        '',
        '1. Navigate → `/login`',
        '',
        '**Expected Results:**',
        '',
        '- Logged in',
      ].join('\n');

      const plan = writeAndParse(md);
      expect(plan).not.toBeNull();
      expect(plan!.seedTest).toBe('tests/seed/auth.seed.ts');
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

  // ─── configuration updates ───────────────────────────────────────────

  describe('configuration updates', () => {
    it('setLLMConfig should update config on all agents', () => {
      const service = new AgentService(tmpDir, { projectRoot: tmpDir });
      service.setLLMConfig({ enabled: true, model: 'gpt-4', apiKey: 'test', baseUrl: '', remark: '', maxTokens: 1000, temperature: 0.5 });
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
