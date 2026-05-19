import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { AgentConfig, HealerPatch, LLMConfig, AgentHealResult } from '../types';

const HEALER_SYSTEM_PROMPT_ZH =
  '你是一位 Playwright 测试修复专家。你的任务是分析失败的测试并生成修复补丁。' +
  '你需要：\n' +
  '1. 分析测试失败的原因（选择器变更、等待时间不足、API 变更等）\n' +
  '2. 检查当前代码，找出需要修改的部分\n' +
  '3. 生成精确的代码补丁\n\n' +
  '你必须只返回有效的 JSON 格式，不要使用 markdown 格式，不要代码块。' +
  'JSON 必须包含以下字段：\n' +
  '"patches" (数组: 修复补丁列表，每项包含 filePath, originalCode, patchedCode, reason, confidence)\n' +
  '"summary" (字符串: 修复摘要)\n' +
  '"healed" (布尔值: 是否成功修复)\n' +
  '请使用中文回复。';

const HEALER_SYSTEM_PROMPT_EN =
  'You are a Playwright test healing expert. Your task is to analyze failing tests and generate fix patches. ' +
  'You need to:\n' +
  '1. Analyze the reason for test failure (selector changes, insufficient wait times, API changes, etc.)\n' +
  '2. Check the current code to find parts that need modification\n' +
  '3. Generate precise code patches\n\n' +
  'You must respond with valid JSON only, no markdown formatting, no code blocks. ' +
  'The JSON must have these fields:\n' +
  '"patches" (array: fix patch list, each with filePath, originalCode, patchedCode, reason, confidence)\n' +
  '"summary" (string: fix summary)\n' +
  '"healed" (boolean: whether the fix was successful)\n' +
  'Please respond in English.';

export class HealerAgent {
  private config: AgentConfig;
  private llmConfig: LLMConfig | null;
  private log = logger.child('HealerAgent');

  constructor(config: AgentConfig, llmConfig: LLMConfig | null) {
    this.config = config;
    this.llmConfig = llmConfig;
  }

  async healTest(
    testFilePath: string,
    options?: {
      maxRounds?: number;
      error?: string;
      stackTrace?: string;
    }
  ): Promise<AgentHealResult> {
    if (!this.llmConfig || !this.llmConfig.enabled) {
      throw new Error('LLM is not enabled');
    }

    const maxRounds = options?.maxRounds || this.config.maxHealRounds || 3;
    const testContent = fs.readFileSync(testFilePath, 'utf-8');
    const testFileName = path.basename(testFilePath);
    const testId = this.extractTestId(testContent, testFilePath);

    let currentError = options?.error || '';
    const currentStackTrace = options?.stackTrace || '';
    let roundsUsed = 0;
    let allPatches: HealerPatch[] = [];
    let healed = false;

    for (let round = 1; round <= maxRounds; round++) {
      roundsUsed = round;
      this.log.info(`Healer round ${round}/${maxRounds} for: ${testFileName}`);

      const result = await this.attemptHeal(
        testFilePath,
        testContent,
        currentError,
        currentStackTrace,
        round
      );

      if (result.patches.length > 0) {
        allPatches = [...allPatches, ...result.patches];

        if (result.healed) {
          healed = true;
          this.log.info(`Test healed after ${round} round(s): ${testFileName}`);
          break;
        }

        currentError = result.summary;
      } else {
        this.log.info(`No patches generated in round ${round}, stopping`);
        break;
      }
    }

    return {
      testId,
      testTitle: testFileName,
      patches: allPatches,
      healed,
      roundsUsed,
    };
  }

  private async attemptHeal(
    testFilePath: string,
    testContent: string,
    error: string,
    stackTrace: string,
    round: number
  ): Promise<{ patches: HealerPatch[]; summary: string; healed: boolean }> {
    if (!this.llmConfig) {
      throw new Error('LLM config is not set');
    }

    const lang = 'zh';
    const systemPrompt = lang === 'zh' ? HEALER_SYSTEM_PROMPT_ZH : HEALER_SYSTEM_PROMPT_EN;

    let userPrompt =
      lang === 'zh'
        ? `请修复以下失败的 Playwright 测试：\n\n`
        : `Please fix the following failing Playwright test:\n\n`;

    userPrompt +=
      lang === 'zh' ? `文件路径: ${testFilePath}\n\n` : `File path: ${testFilePath}\n\n`;

    userPrompt +=
      lang === 'zh'
        ? `测试代码:\n\`\`\`typescript\n${testContent}\n\`\`\`\n\n`
        : `Test code:\n\`\`\`typescript\n${testContent}\n\`\`\`\n\n`;

    if (error) {
      userPrompt += lang === 'zh' ? `错误信息: ${error}\n\n` : `Error message: ${error}\n\n`;
    }

    if (stackTrace) {
      userPrompt +=
        lang === 'zh'
          ? `堆栈跟踪:\n${stackTrace.slice(0, 2000)}\n\n`
          : `Stack trace:\n${stackTrace.slice(0, 2000)}\n\n`;
    }

    if (round > 1) {
      userPrompt +=
        lang === 'zh'
          ? `\n注意：这是第 ${round} 轮修复尝试，之前的修复可能未完全解决问题。\n`
          : `\nNote: This is round ${round} of healing attempts, previous fixes may not have fully resolved the issue.\n`;
    }

    const url = `${this.llmConfig.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.llmConfig.apiKey) {
        headers['Authorization'] = `Bearer ${this.llmConfig.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.llmConfig.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: this.llmConfig.maxTokens || 4096,
          temperature: this.llmConfig.temperature || 0.2,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API returned ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      return this.parseHealerResponse(content, testFilePath);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseHealerResponse(
    responseText: string,
    testFilePath: string
  ): { patches: HealerPatch[]; summary: string; healed: boolean } {
    let text = responseText.trim();

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(text);

      const patches: HealerPatch[] = Array.isArray(parsed.patches)
        ? parsed.patches
            .filter((p: Record<string, unknown>) => p.originalCode && p.patchedCode)
            .map((p: Record<string, unknown>) => ({
              testId: '',
              testTitle: path.basename(testFilePath),
              filePath: p.filePath || testFilePath,
              originalCode: String(p.originalCode),
              patchedCode: String(p.patchedCode),
              unifiedDiff: '',
              confidence:
                typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0.5,
              reason: String(p.reason || ''),
            }))
        : [];

      for (const patch of patches) {
        patch.unifiedDiff = this.generateUnifiedDiff(patch.originalCode, patch.patchedCode);
      }

      return {
        patches,
        summary: String(parsed.summary || ''),
        healed: Boolean(parsed.healed),
      };
    } catch {
      this.log.warn('Failed to parse healer response as JSON');
      return {
        patches: [],
        summary: responseText.slice(0, 500),
        healed: false,
      };
    }
  }

  private extractTestId(testContent: string, filePath: string): string {
    const testMatch = testContent.match(/test\(['"](.+?)['"]/);
    if (testMatch) {
      return testMatch[1];
    }
    return path.basename(filePath, '.spec.ts');
  }

  private generateUnifiedDiff(original: string, patched: string): string {
    const origLines = original.split('\n');
    const patchedLines = patched.split('\n');
    const lines: string[] = ['--- original', '+++ patched'];

    const maxLen = Math.max(origLines.length, patchedLines.length);
    for (let i = 0; i < maxLen; i++) {
      const origLine = origLines[i];
      const patchedLine = patchedLines[i];

      if (origLine === undefined) {
        lines.push(`+ ${patchedLine}`);
      } else if (patchedLine === undefined) {
        lines.push(`- ${origLine}`);
      } else if (origLine !== patchedLine) {
        lines.push(`- ${origLine}`);
        lines.push(`+ ${patchedLine}`);
      } else {
        lines.push(`  ${origLine}`);
      }
    }

    return lines.join('\n');
  }
}
