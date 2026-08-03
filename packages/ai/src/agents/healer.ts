import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './base-agent';
import { PatchApplier } from './patch-applier';
import { LLMService } from './llm-service';
import { AgentOutputParser } from './output-parser';
import { AgentConfig, HealerPatch, LLMConfig, AgentHealResult } from '@yuantest/contracts';

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

export class HealerAgent extends BaseAgent {
  private patchApplier = new PatchApplier();

  protected getAgentName(): string {
    return 'HealerAgent';
  }

  constructor(config: AgentConfig, llmConfig: LLMConfig | null, llmService?: LLMService) {
    super(config, llmConfig, llmService);
  }

  async healTest(
    testFilePath: string,
    options?: {
      maxRounds?: number;
      error?: string;
      stackTrace?: string;
      /**
       * HITL：是否在写盘前等待人工审批补丁。
       * - true：每轮 patch 应用前调用 interrupt('patch-awaiting-approval')，
       *         UI 端通过 continue({ approved, modifiedPatch? }) 恢复。
       *         approved=false 时跳过本轮写盘，进入下一轮。
       * - false / undefined：自动写盘（默认行为，向后兼容）。
       */
      requireApproval?: boolean;
    }
  ): Promise<AgentHealResult> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const maxRounds = options?.maxRounds || this.config.maxHealRounds || 3;
    const testFileName = path.basename(testFilePath);
    const originalContent = fs.readFileSync(testFilePath, 'utf-8');
    const testId = this.extractTestId(originalContent, testFilePath);

    let currentError = options?.error || '';
    const currentStackTrace = options?.stackTrace || '';
    let roundsUsed = 0;
    const allPatches: HealerPatch[] = [];
    let healed = false;

    // 在内存中维护当前文件内容，避免中间状态写入磁盘
    let memoryContent = originalContent;

    for (let round = 1; round <= maxRounds; round++) {
      roundsUsed = round;
      this.log.info(`Healer round ${round}/${maxRounds} for: ${testFileName}`);

      const result = await this.attemptHeal(
        testFilePath,
        memoryContent,
        currentError,
        currentStackTrace,
        round
      );

      if (result.patches.length > 0) {
        // Include LLM-returned patches in the result (deduplicated)
        for (const patch of result.patches) {
          const isDuplicate = allPatches.some(
            (p) => p.originalCode === patch.originalCode && p.patchedCode === patch.patchedCode
          );
          if (!isDuplicate) {
            allPatches.push(patch);
          }
        }

        // 在内存中应用补丁，不写入磁盘
        let anyPatchApplied = false;
        for (const patch of result.patches) {
          const patched = this.patchApplier.applyPatchToContent(memoryContent, patch);
          if (patched !== null) {
            memoryContent = patched;
            anyPatchApplied = true;
          }
        }

        if (anyPatchApplied && result.healed) {
          // HITL：若启用 requireApproval，写盘前等待人工审批
          if (options?.requireApproval) {
            const decision = await this.interrupt('patch-awaiting-approval', {
              round,
              testFile: testFilePath,
              patches: result.patches,
              preview: memoryContent,
            });

            const d = decision as {
              approved?: boolean;
              modifiedPatch?: string;
            };
            if (d.modifiedPatch) {
              // 用户提供了修改后的内容，直接写盘
              memoryContent = d.modifiedPatch;
            }
            if (d.approved === false) {
              // 用户拒绝，跳过本轮写盘，进入下一轮
              this.log.info(`Healer round ${round} rejected by reviewer`);
              currentError = result.summary;
              continue;
            }
            // approved=true 或未明确拒绝：写盘
          }

          healed = true;
          // 仅在确认修复成功后才写入磁盘
          fs.writeFileSync(testFilePath, memoryContent, 'utf-8');
          this.log.info(`Test healed after ${round} round(s): ${testFileName}`);
          break;
        }

        currentError = result.summary;
      } else {
        this.log.info(`No patches generated in round ${round}, stopping`);
        break;
      }
    }

    // 未修复成功时不需要回滚，因为磁盘文件从未被修改
    if (!healed) {
      this.log.info(`Not healed after ${roundsUsed} round(s): ${testFileName}`);
    }

    return {
      testId,
      testTitle: testFileName,
      patches: allPatches,
      healed,
      roundsUsed,
    };
  }

  /**
   * 运行测试并在失败时尝试修复，包含事务性补丁应用和最终回滚逻辑
   */
  async runAndHeal(
    testFilePath: string,
    runTestFn: (
      filePath: string
    ) => Promise<{ passed: boolean; error?: string; stackTrace?: string }>,
    options?: {
      maxRounds?: number;
    }
  ): Promise<AgentHealResult> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const maxRounds = options?.maxRounds || this.config.maxHealRounds || 3;
    const testFileName = path.basename(testFilePath);
    // 保存原始文件内容，用于最终回滚
    const originalContent = fs.readFileSync(testFilePath, 'utf-8');
    const testId = this.extractTestId(originalContent, testFilePath);

    let allPatches: HealerPatch[] = [];
    let healed = false;
    let roundsUsed = 0;

    for (let round = 1; round <= maxRounds; round++) {
      roundsUsed = round;
      this.log.info(`runAndHeal 第 ${round}/${maxRounds} 轮: ${testFileName}`);

      // 运行测试
      const testResult = await runTestFn(testFilePath);
      if (testResult.passed) {
        healed = true;
        this.log.info(`测试通过，修复成功: ${testFileName}`);
        break;
      }

      // 测试失败，尝试修复
      const healResult = await this.attemptHeal(
        testFilePath,
        fs.readFileSync(testFilePath, 'utf-8'),
        testResult.error || '',
        testResult.stackTrace || '',
        round
      );

      if (healResult.patches.length > 0) {
        // 保存本轮补丁应用前的文件内容，用于回滚
        const roundStartContent = fs.readFileSync(testFilePath, 'utf-8');
        const projectRoot = this.config.projectRoot || process.cwd();
        let roundSuccess = true;

        // 逐个应用补丁
        for (const patch of healResult.patches) {
          const applied = this.patchApplier.applyPatch(patch, projectRoot);
          if (!applied) {
            // 补丁应用失败，回滚本轮所有已应用的补丁
            this.log.warn(`补丁应用失败，回滚本轮所有补丁: ${testFilePath}`);
            fs.writeFileSync(testFilePath, roundStartContent, 'utf-8');
            roundSuccess = false;
            break;
          }
        }

        if (roundSuccess) {
          // 本轮所有补丁应用成功，加入总补丁列表
          allPatches = [...allPatches, ...healResult.patches];
        } else {
          // 本轮回滚，继续下一轮
          this.log.info(`第 ${round} 轮补丁回滚，继续下一轮`);
        }
      } else {
        this.log.info(`第 ${round} 轮未生成补丁，停止修复`);
        break;
      }
    }

    // 所有轮次结束后仍未修复，回滚到原始内容
    if (!healed) {
      this.log.info(`所有轮次修复失败，回滚到原始内容: ${testFilePath}`);
      fs.writeFileSync(testFilePath, originalContent, 'utf-8');
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
    if (!this.llmService) {
      throw new Error('LLM config is not set');
    }

    const lang = this.config.language || 'zh';
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

    const responseText = await super.callLLM(systemPrompt, userPrompt);
    return AgentOutputParser.parseHealerPatches(responseText, testFilePath);
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
