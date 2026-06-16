import * as fs from 'fs';
import * as path from 'path';
import { TestPlan, TestPlanScenario, TestPlanStep, HealerPatch } from '../types';

/**
 * Agent 输出解析器，统一三个 Agent 的 LLM 响应解析逻辑
 */
export class AgentOutputParser {
  // ─── Planner: JSON TestPlan ──────────────────────────────────────────

  /** 从 LLM 响应文本中提取 TestPlan */
  static parseTestPlan(responseText: string, originalDescription: string): TestPlan {
    let text = responseText.trim();

    // 1. 尝试直接 JSON 解析
    let parsed: Record<string, unknown> | null = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      // 2. 尝试从代码块中提取 JSON
      const jsonBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
      if (jsonBlockMatch) {
        try {
          parsed = JSON.parse(jsonBlockMatch[1].trim());
        } catch {
          parsed = null;
        }
      }
    }

    // 3. 尝试修复截断 JSON
    if (!parsed) {
      parsed = this.tryRepairTruncatedJSON(text);
    }

    if (!parsed) {
      throw new Error('无法解析测试计划，LLM 响应不是有效的 JSON 格式');
    }

    const scenarios = this.normalizeScenarios(parsed.scenarios);
    // 过滤无效场景
    const validScenarios = scenarios.filter(
      (s: TestPlanScenario) => s.name && s.steps && s.steps.length > 0
    );

    if (validScenarios.length === 0) {
      const rawKeys = parsed ? Object.keys(parsed).join(', ') : 'N/A';
      throw new Error(
        `测试计划 JSON 中未包含有效的 scenarios（共 ${scenarios.length} 个场景，均缺少步骤或名称为空）。` +
        `原始 JSON 顶层字段: ${rawKeys}。请检查功能描述是否足够具体，或重试。`
      );
    }

    return {
      id: this.generatePlanId(),
      title: String(parsed.title || originalDescription.slice(0, 50)),
      description: String(parsed.description || ''),
      scenarios: validScenarios,
      createdAt: Date.now(),
    };
  }

  // ─── Healer: JSON Patches ────────────────────────────────────────────

  /** 从 LLM 响应文本中提取修复补丁 */
  static parseHealerPatches(
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
      return {
        patches: [],
        summary: responseText.slice(0, 500),
        healed: false,
      };
    }
  }

  // ─── Generator: Code Blocks ──────────────────────────────────────────

  /** 从 LLM 响应中提取 Playwright 代码块 */
  static extractCodeBlocks(text: string): string[] {
    const blocks: string[] = [];
    const regex = /```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)```/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const code = match[1].trim();
      if (code.includes('test(') || code.includes('test.describe') || code.includes('import')) {
        blocks.push(code);
      }
    }
    return blocks;
  }

  /** 清理非代码块包装 */
  static cleanCode(text: string): string {
    let code = text;
    const codeBlockMatch = code.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      code = codeBlockMatch[1];
    }
    return code.trim();
  }

  // ─── Markdown Plan 解析 ────────────────────────────────────

  /** 从 Markdown 测试计划文件中解析 TestPlan */
  static parseMarkdownPlan(filePath: string): TestPlan | null {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const titleMatch = content.match(/^# (.+)$/m);
      const title = titleMatch ? titleMatch[1] : path.basename(filePath, '.md');

      const seedMatch = content.match(/\*\*Seed:\*\* `(.+?)`/);
      const seedTest = seedMatch ? seedMatch[1] : undefined;

      const descriptionLines: string[] = [];
      const lines = content.split('\n');
      let inDescription = false;
      for (const line of lines) {
        if (line.startsWith('# ') && !inDescription) {
          inDescription = true;
          continue;
        }
        if (line.startsWith('## ')) {
          break;
        }
        if (inDescription && line.trim() && !line.startsWith('**Seed:**')) {
          descriptionLines.push(line.trim());
        }
      }

      const scenarios: TestPlan['scenarios'] = [];
      const scenarioRegex = /^## (.+)$/gm;
      let scenarioMatch: RegExpExecArray | null;

      while ((scenarioMatch = scenarioRegex.exec(content)) !== null) {
        const scenarioName = scenarioMatch[1];
        const scenarioStart = scenarioMatch.index + scenarioMatch[0].length;
        const nextScenario = content.indexOf('## ', scenarioStart + 1);
        const scenarioContent = content.slice(
          scenarioStart,
          nextScenario === -1 ? undefined : nextScenario
        );

        const steps: TestPlanStep[] = [];
        const newFormatRegex = /^\d+\.\s+(.+?)(?:\s+→\s+`(.+?)`)?(?:\s+=\s+"(.+?)")?$/gm;
        let stepMatch: RegExpExecArray | null;
        const newFormatSteps: TestPlanStep[] = [];
        while ((stepMatch = newFormatRegex.exec(scenarioContent)) !== null) {
          newFormatSteps.push({
            action: stepMatch[1],
            target: stepMatch[2] || '',
            value: stepMatch[3],
          });
        }
        if (newFormatSteps.length > 0) {
          steps.push(...newFormatSteps);
        } else {
          const stepRegex = /^\d+\.\s+(.+?)(?:\s+on\s+`(.+?)`)?(?:\s+with\s+"(.+?)")?$/gm;
          while ((stepMatch = stepRegex.exec(scenarioContent)) !== null) {
            steps.push({
              action: stepMatch[1],
              target: stepMatch[2] || '',
              value: stepMatch[3],
            });
          }
        }

        const expectedResults: string[] = [];
        const resultRegex = /^- (.+)$/gm;
        let resultMatch: RegExpExecArray | null;
        while ((resultMatch = resultRegex.exec(scenarioContent)) !== null) {
          expectedResults.push(resultMatch[1]);
        }

        scenarios.push({ name: scenarioName, steps, expectedResults });
      }

      return {
        id: `plan-${Date.now()}`,
        title,
        description: descriptionLines.join(' '),
        scenarios,
        createdAt: Date.now(),
        seedTest,
        filePath,
      };
    } catch {
      return null;
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private static tryRepairTruncatedJSON(text: string): Record<string, unknown> | null {
    // 尝试补全截断的 JSON
    let repaired = text.trim();
    if (!repaired.endsWith('}') && !repaired.endsWith('}')) {
      // 尝试加回闭合括号
      if (repaired.includes('"scenarios"')) {
        repaired += ']}';
      }
      repaired += '}';
    }

    try {
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private static normalizeScenarios(scenarios: unknown): TestPlanScenario[] {
    if (!Array.isArray(scenarios)) return [];

    return scenarios.map((s: Record<string, unknown>) => ({
      name: String(s.name || ''),
      steps: this.normalizeSteps(s.steps),
      expectedResults: this.normalizeExpectedResults(s.expectedResults),
    }));
  }

  private static normalizeSteps(steps: unknown): TestPlanStep[] {
    if (!Array.isArray(steps)) return [];

    return steps.map((s: Record<string, unknown>) => ({
      action: String(s.action || ''),
      target: String(s.target || ''),
      value: s.value !== undefined ? String(s.value) : undefined,
    }));
  }

  private static normalizeExpectedResults(results: unknown): string[] {
    if (!Array.isArray(results)) return [];
    return results.map((r) => String(r));
  }

  private static generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private static generateUnifiedDiff(original: string, patched: string): string {
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
