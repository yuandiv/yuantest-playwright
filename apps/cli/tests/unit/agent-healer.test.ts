import { vi } from 'vitest';
import { HealerAgent } from '@yuantest/ai';
import { AgentConfig, LLMConfig, HealerPatch, AgentHealResult } from '@yuantest/contracts';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ---------- helpers ----------

function createAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    enabled: true,
    loopTarget: 'vscode',
    specsDir: 'tests',
    autoHeal: true,
    maxHealRounds: 3,
    ...overrides,
  };
}

function createLLMConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'http://localhost:11434',
    model: 'test-model',
    remark: '',
    maxTokens: 2048,
    temperature: 0.2,
    ...overrides,
  };
}

function createHealerPatch(overrides: Partial<HealerPatch> = {}): HealerPatch {
  return {
    testId: 'login test',
    testTitle: 'login.spec.ts',
    filePath: '/tmp/login.spec.ts',
    originalCode: 'old code',
    patchedCode: 'new code',
    unifiedDiff: '',
    confidence: 0.8,
    reason: 'fix selector',
    ...overrides,
  };
}

/** Build a JSON healer response payload */
function healerResponseJSON(
  patches: Array<{ originalCode: string; patchedCode: string; reason?: string; confidence?: number; filePath?: string }>,
  opts: { summary?: string; healed?: boolean } = {}
) {
  return JSON.stringify({
    patches,
    summary: opts.summary || 'fixed',
    healed: opts.healed !== undefined ? opts.healed : true,
  });
}

// ---------- tests ----------

describe('HealerAgent', () => {
  let tmpDir: string;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'healer-test-'));
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ---- parseHealerResponse (tested indirectly via attemptHeal / healTest) ----

  describe('parseHealerResponse (indirect)', () => {
    it('should parse valid JSON response', async () => {
      const testFile = path.join(tmpDir, 'parse-valid.spec.ts');
      fs.writeFileSync(testFile, `test('example', () => {});`, 'utf-8');

      const validJSON = healerResponseJSON([
        { originalCode: "test('example'", patchedCode: "test('fixed'", reason: 'update name' },
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: validJSON } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.patches).toHaveLength(1);
      expect(result.patches[0].originalCode).toBe("test('example'");
      expect(result.patches[0].patchedCode).toBe("test('fixed'");
      expect(result.patches[0].unifiedDiff).toContain('--- original');
      expect(result.patches[0].unifiedDiff).toContain('+++ patched');
    });

    it('should parse JSON wrapped in code blocks', async () => {
      const testFile = path.join(tmpDir, 'parse-codeblock.spec.ts');
      fs.writeFileSync(testFile, `test('codeblock', () => {});`, 'utf-8');

      const jsonContent = healerResponseJSON([
        { originalCode: "test('codeblock'", patchedCode: "test('patched'", reason: 'fix' },
      ]);
      const wrappedInCodeBlock = '```json\n' + jsonContent + '\n```';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: wrappedInCodeBlock } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.patches).toHaveLength(1);
      expect(result.patches[0].originalCode).toBe("test('codeblock'");
    });

    it('should return empty patches for invalid JSON', async () => {
      const testFile = path.join(tmpDir, 'parse-invalid.spec.ts');
      fs.writeFileSync(testFile, `test('invalid', () => {});`, 'utf-8');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'this is not json at all' } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.patches).toHaveLength(0);
      expect(result.healed).toBe(false);
    });

    it('should filter patches missing originalCode or patchedCode', async () => {
      const testFile = path.join(tmpDir, 'parse-filter.spec.ts');
      fs.writeFileSync(testFile, `test('filter', () => {});`, 'utf-8');

      const jsonWithBadPatches = JSON.stringify({
        patches: [
          { originalCode: 'valid', patchedCode: 'valid2', reason: 'ok' },
          { originalCode: 'missing patched' },
          { patchedCode: 'missing original' },
        ],
        summary: 'mixed',
        healed: true,
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: jsonWithBadPatches } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.patches).toHaveLength(1);
      expect(result.patches[0].originalCode).toBe('valid');
    });
  });

  // ---- extractTestId ----

  describe('extractTestId', () => {
    it('should extract test id from test() pattern', async () => {
      const testFile = path.join(tmpDir, 'extract-test.spec.ts');
      fs.writeFileSync(testFile, `test('login flow works', async ({ page }) => {});`, 'utf-8');

      // Provide a response that marks healed=true immediately
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: healerResponseJSON([], { healed: true }) } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.testId).toBe('login flow works');
    });

    it('should extract test id from test.describe() pattern', async () => {
      const testFile = path.join(tmpDir, 'extract-describe.spec.ts');
      // test.describe does NOT match /test\(['"](.+?)['"]/ because
      // the dot after 'test' prevents it. The inner test() matches instead.
      fs.writeFileSync(
        testFile,
        `test.describe('user authentication', () => { test('login', () => {}); });`,
        'utf-8'
      );

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: healerResponseJSON([], { healed: true }) } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      // The regex /test\(['"](.+?)['"]/ matches the inner test('login')
      expect(result.testId).toBe('login');
    });

    it('should fall back to basename without .spec.ts when no test() found', async () => {
      const testFile = path.join(tmpDir, 'fallback-name.spec.ts');
      fs.writeFileSync(testFile, `// no test() calls here`, 'utf-8');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: healerResponseJSON([], { healed: true }) } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.testId).toBe('fallback-name');
    });
  });

  // ---- generateUnifiedDiff ----

  describe('generateUnifiedDiff', () => {
    it('should produce unified diff format with --- and +++ headers', async () => {
      const testFile = path.join(tmpDir, 'diff-format.spec.ts');
      fs.writeFileSync(testFile, `test('diff', () => {});`, 'utf-8');

      const json = healerResponseJSON([
        {
          originalCode: 'await page.click("#old-btn")',
          patchedCode: 'await page.click("#new-btn")',
          reason: 'selector changed',
        },
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: json } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      const diff = result.patches[0].unifiedDiff;
      expect(diff).toContain('--- original');
      expect(diff).toContain('+++ patched');
      expect(diff).toContain('- await page.click("#old-btn")');
      expect(diff).toContain('+ await page.click("#new-btn")');
    });

    it('should mark added lines with + and removed lines with -', async () => {
      const testFile = path.join(tmpDir, 'diff-add-remove.spec.ts');
      fs.writeFileSync(testFile, `test('diff2', () => {});`, 'utf-8');

      const originalCode = 'line1\nline2\nline3';
      const patchedCode = 'line1\nline2-modified\nline3\nline4';

      const json = healerResponseJSON([
        { originalCode, patchedCode, reason: 'multi-line change' },
      ]);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: json } }],
        }),
      });

      const agent = new HealerAgent(createAgentConfig(), createLLMConfig());
      const result = await agent.healTest(testFile);

      const diff = result.patches[0].unifiedDiff;
      const lines = diff.split('\n');
      // line1 is unchanged -> "  line1"
      expect(lines).toContain('  line1');
      // line2 changed -> "- line2" and "+ line2-modified"
      expect(lines).toContain('- line2');
      expect(lines).toContain('+ line2-modified');
      // line3 unchanged -> "  line3"
      expect(lines).toContain('  line3');
      // line4 added -> "+ line4"
      expect(lines).toContain('+ line4');
    });
  });

  // ---- healTest multi-round logic ----

  describe('healTest multi-round logic', () => {
    it('should apply patches between rounds so next round sees modified content', async () => {
      const testFile = path.join(tmpDir, 'multi-round.spec.ts');
      const originalContent = `test('multi', async () => {\n  await page.click('#old');\n});`;
      fs.writeFileSync(testFile, originalContent, 'utf-8');

      // Track what content is sent to the LLM in each round
      const sentContents: string[] = [];

      global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        const userPrompt = body.messages[1].content;
        // Extract the code block from the user prompt
        const codeMatch = userPrompt.match(/```typescript\n([\s\S]*?)```/);
        if (codeMatch) {
          sentContents.push(codeMatch[1]);
        }

        // Round 1: fix '#old' -> '#mid', not healed yet
        if (sentContents.length === 1) {
          return {
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: healerResponseJSON(
                      [
                        {
                          originalCode: "await page.click('#old')",
                          patchedCode: "await page.click('#mid')",
                          reason: 'fix selector step 1',
                        },
                      ],
                      { healed: false, summary: 'partial fix' }
                    ),
                  },
                },
              ],
            }),
          };
        }

        // Round 2: fix '#mid' -> '#new', healed
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: healerResponseJSON(
                    [
                      {
                        originalCode: "await page.click('#mid')",
                        patchedCode: "await page.click('#new')",
                        reason: 'fix selector step 2',
                      },
                    ],
                    { healed: true, summary: 'fully fixed' }
                  ),
                },
              },
            ],
          }),
        };
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 3 }), createLLMConfig());
      const result = await agent.healTest(testFile);

      // Round 1 should see original content
      expect(sentContents[0]).toContain("#old");
      // Round 2 should see the patched content from round 1
      expect(sentContents[1]).toContain("#mid");
      expect(sentContents[1]).not.toContain("#old");

      expect(result.roundsUsed).toBe(2);
      expect(result.healed).toBe(true);
      expect(result.patches).toHaveLength(2);

      // File should have the final patched content
      const finalContent = fs.readFileSync(testFile, 'utf-8');
      expect(finalContent).toContain("#new");
      expect(finalContent).not.toContain("#old");
    });
  });

  // ---- healTest rollback ----

  describe('healTest rollback', () => {
    it('should roll back file to original content when healed=false and patches were applied', async () => {
      const testFile = path.join(tmpDir, 'rollback.spec.ts');
      const originalContent = `test('rollback', async () => {\n  await page.click('#btn');\n});`;
      fs.writeFileSync(testFile, originalContent, 'utf-8');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON(
                  [
                    {
                      originalCode: "await page.click('#btn')",
                      patchedCode: "await page.click('#changed-btn')",
                      reason: 'attempt fix',
                    },
                  ],
                  { healed: false, summary: 'still failing' }
                ),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.healed).toBe(false);
      expect(result.patches).toHaveLength(1);

      // File should be rolled back to original content
      const fileContent = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent).toBe(originalContent);
    });

    it('should not roll back when healed=true', async () => {
      const testFile = path.join(tmpDir, 'no-rollback.spec.ts');
      const originalContent = `test('no-rollback', async () => {\n  await page.click('#old');\n});`;
      fs.writeFileSync(testFile, originalContent, 'utf-8');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON(
                  [
                    {
                      originalCode: "await page.click('#old')",
                      patchedCode: "await page.click('#new')",
                      reason: 'fixed',
                    },
                  ],
                  { healed: true }
                ),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.healed).toBe(true);

      // File should keep the patched content
      const fileContent = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent).toContain('#new');
      expect(fileContent).not.toContain('#old');
    });

    it('should not roll back when no patches were applied even if healed=false', async () => {
      const testFile = path.join(tmpDir, 'no-patches.spec.ts');
      const originalContent = `test('no-patches', async () => {});`;
      fs.writeFileSync(testFile, originalContent, 'utf-8');

      // LLM returns no patches
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON([], { healed: false, summary: 'nothing to do' }),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      const result = await agent.healTest(testFile);

      expect(result.healed).toBe(false);
      expect(result.patches).toHaveLength(0);

      // File should remain unchanged (no rollback needed since no patches were applied)
      const fileContent = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent).toBe(originalContent);
    });
  });

  // ---- applyPatchToFile with exact match ----

  describe('applyPatchToFile (exact match)', () => {
    it('should apply patch when originalCode exactly matches file content', async () => {
      const testFile = path.join(tmpDir, 'exact-match.spec.ts');
      const originalContent = `test('exact', async () => {\n  await page.click('#btn');\n});`;
      fs.writeFileSync(testFile, originalContent, 'utf-8');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON(
                  [
                    {
                      originalCode: "await page.click('#btn')",
                      patchedCode: "await page.click('#updated-btn')",
                      reason: 'selector update',
                    },
                  ],
                  { healed: true }
                ),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      await agent.healTest(testFile);

      const fileContent = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent).toContain('#updated-btn');
      expect(fileContent).not.toContain('#btn');
    });

    it('should return false and not modify file when originalCode is not found', async () => {
      const testFile = path.join(tmpDir, 'no-match.spec.ts');
      const originalContent = `test('no-match', async () => {\n  await page.click('#btn');\n});`;
      fs.writeFileSync(testFile, originalContent, 'utf-8');

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON(
                  [
                    {
                      originalCode: "await page.click('#nonexistent')",
                      patchedCode: "await page.click('#fixed')",
                      reason: 'wont match',
                    },
                  ],
                  { healed: false, summary: 'failed' }
                ),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      const result = await agent.healTest(testFile);

      // Patch could not be applied, file unchanged
      const fileContent = fs.readFileSync(testFile, 'utf-8');
      expect(fileContent).toBe(originalContent);
      // Since no patches were actually applied, rollback condition (patches.length > 0 but none applied)
      // The patches array still has entries from the LLM response, but they weren't applied to the file
      expect(result.patches).toHaveLength(1);
    });
  });

  // ---- applyPatchToFile with normalized whitespace match ----

  describe('applyPatchToFile (normalized whitespace match)', () => {
    it('should apply patch when whitespace differs but normalized content matches', async () => {
      const testFile = path.join(tmpDir, 'norm-ws.spec.ts');
      // File has extra spaces/tabs
      const fileContent = `test('norm', async  () => {\n  await  page.click('#btn');\n});`;
      fs.writeFileSync(testFile, fileContent, 'utf-8');

      // Patch specifies code with single spaces (normalized)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON(
                  [
                    {
                      originalCode: "await  page.click('#btn')",
                      patchedCode: "await page.click('#new-btn')",
                      reason: 'fix with whitespace normalization',
                    },
                  ],
                  { healed: true }
                ),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      await agent.healTest(testFile);

      const result = fs.readFileSync(testFile, 'utf-8');
      expect(result).toContain('#new-btn');
    });

    it('should apply patch when originalCode has different whitespace than file but same normalized form', async () => {
      const testFile = path.join(tmpDir, 'norm-ws2.spec.ts');
      // File uses extra whitespace (double space before page)
      const fileContent = `test('ws2', async () => {\n  await  page.click('#btn');\n});`;
      fs.writeFileSync(testFile, fileContent, 'utf-8');

      // Patch specifies code with single spaces (normalized form matches)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: healerResponseJSON(
                  [
                    {
                      // originalCode with single space won't match exactly,
                      // but after normalization it should match the double-space version
                      originalCode: "await page.click('#btn')",
                      patchedCode: "await page.click('#fixed')",
                      reason: 'normalized match',
                    },
                  ],
                  { healed: true }
                ),
              },
            },
          ],
        }),
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 1 }), createLLMConfig());
      await agent.healTest(testFile);

      const result = fs.readFileSync(testFile, 'utf-8');
      expect(result).toContain('#fixed');
    });
  });

  // ---- constructor and error handling ----

  describe('constructor and error handling', () => {
    it('should throw when healTest is called without LLM config', async () => {
      const agent = new HealerAgent(createAgentConfig(), null);
      await expect(agent.healTest('/tmp/any.spec.ts')).rejects.toThrow('LLM is not enabled');
    });

    it('should use maxHealRounds from options over config', async () => {
      const testFile = path.join(tmpDir, 'max-rounds.spec.ts');
      fs.writeFileSync(testFile, `test('rounds', () => {});`, 'utf-8');

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: healerResponseJSON(
                    [{ originalCode: 'never-match-xyz', patchedCode: 'nothing', reason: 'x' }],
                    { healed: false, summary: 'fail' }
                  ),
                },
              },
            ],
          }),
        };
      });

      const agent = new HealerAgent(createAgentConfig({ maxHealRounds: 5 }), createLLMConfig());
      const result = await agent.healTest(testFile, { maxRounds: 2 });

      // Should stop after 2 rounds (options.maxRounds overrides config)
      expect(callCount).toBe(2);
      expect(result.roundsUsed).toBe(2);
    });
  });

  // ---- edge cases and error handling ----

  describe('edge cases and error handling', () => {
    it('should handle LLM network error gracefully', async () => {
      const testFile = path.join(tmpDir, 'network-error.spec.ts');
      fs.writeFileSync(testFile, `test('network', () => {});`, 'utf-8');

      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const healer = new HealerAgent(createAgentConfig(), createLLMConfig());
      // Network error propagates since healTest does not catch LLM errors
      await expect(healer.healTest(testFile, { maxRounds: 1 })).rejects.toThrow();
    });

    it('should handle maxRounds=0 by using config fallback', async () => {
      const testFile = path.join(tmpDir, 'zero-rounds.spec.ts');
      fs.writeFileSync(testFile, `test('zero', () => {});`, 'utf-8');

      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: healerResponseJSON([], { healed: false, summary: 'no fix' }),
                },
              },
            ],
          }),
        };
      });

      // With maxHealRounds=0 in config, the fallback is 3 (0 || 3)
      const healer = new HealerAgent(createAgentConfig({ maxHealRounds: 0 }), createLLMConfig());
      const result = await healer.healTest(testFile, { maxRounds: 0 });

      // maxRounds=0 is falsy, so it falls back to config.maxHealRounds (0) then to 3
      expect(result.healed).toBe(false);
      expect(result.roundsUsed).toBeGreaterThan(0);
    });
  });
});
