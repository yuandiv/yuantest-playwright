import * as fs from 'fs';
import { logger } from '../logger';
import { AgentConfig, LLMConfig, TestPlan, TestPlanScenario, ProjectContext } from '../types';

const PLANNER_SYSTEM_PROMPT_ZH =
  '你是一位专业的测试规划专家。你的任务是探索应用并生成结构化的测试计划。' +
  '你需要根据被测应用的信息和用户描述的功能场景，生成详细的测试步骤和预期结果。' +
  '测试步骤应使用具体的页面元素定位器（如 getByRole、getByText、getByLabel 等），' +
  '确保生成的测试计划可以直接用于 Playwright 测试代码生成。' +
  '你必须只返回有效的 JSON 格式，不要使用 markdown 格式，不要代码块。' +
  'JSON 必须包含以下字段：' +
  '"title" (字符串: 测试计划标题), ' +
  '"description" (字符串: 计划描述), ' +
  '"scenarios" (数组: 测试场景列表，每项包含 name, steps, expectedResults)。' +
  '每个 step 包含 action, target, value(可选)。' +
  '请使用中文回复。';

const PLANNER_SYSTEM_PROMPT_EN =
  'You are a professional test planning expert. Your task is to explore the application and generate structured test plans. ' +
  'You need to generate detailed test steps and expected results based on the application information and feature scenarios described by the user. ' +
  'Test steps should use concrete page element locators (e.g. getByRole, getByText, getByLabel) ' +
  'to ensure the generated test plan can be directly used for Playwright test code generation. ' +
  'You must respond with valid JSON only, no markdown formatting, no code blocks. ' +
  'The JSON must have these fields: ' +
  '"title" (string: test plan title), ' +
  '"description" (string: plan description), ' +
  '"scenarios" (array: test scenario list, each with name, steps, expectedResults). ' +
  'Each step contains action, target, value(optional). ' +
  'Please respond in English.';

export class PlannerAgent {
  private config: AgentConfig;
  private llmConfig: LLMConfig | null;
  private log = logger.child('PlannerAgent');

  constructor(config: AgentConfig, llmConfig: LLMConfig | null) {
    this.config = config;
    this.llmConfig = llmConfig;
  }

  async generatePlan(
    description: string,
    options?: { seedTest?: string; prdPath?: string }
  ): Promise<TestPlan> {
    if (!this.llmConfig || !this.llmConfig.enabled) {
      throw new Error('LLM is not enabled');
    }

    const lang = 'zh';
    const systemPrompt = lang === 'zh' ? PLANNER_SYSTEM_PROMPT_ZH : PLANNER_SYSTEM_PROMPT_EN;

    let userPrompt =
      lang === 'zh'
        ? `请为以下功能生成测试计划：\n\n${description}\n`
        : `Generate a test plan for the following feature:\n\n${description}\n`;

    const ctx = this.config.projectContext;
    if (ctx) {
      userPrompt += this.buildContextPrompt(ctx, lang);
    }

    if (options?.seedTest && fs.existsSync(options.seedTest)) {
      const seedContent = fs.readFileSync(options.seedTest, 'utf-8');
      userPrompt +=
        lang === 'zh'
          ? `\n参考 Seed Test:\n\`\`\`typescript\n${seedContent}\n\`\`\`\n`
          : `\nReference Seed Test:\n\`\`\`typescript\n${seedContent}\n\`\`\`\n`;
    }

    if (options?.prdPath && fs.existsSync(options.prdPath)) {
      const prdContent = fs.readFileSync(options.prdPath, 'utf-8');
      userPrompt +=
        lang === 'zh'
          ? `\n产品需求文档:\n${prdContent.slice(0, 3000)}\n`
          : `\nProduct Requirement Document:\n${prdContent.slice(0, 3000)}\n`;
    }

    const responseText = await this.callLLM(systemPrompt, userPrompt);
    const plan = this.parsePlanResponse(responseText, description);

    return plan;
  }

  private buildContextPrompt(ctx: ProjectContext, lang: string): string {
    const lines: string[] = [];

    if (lang === 'zh') {
      lines.push('\n被测应用信息：');
      if (ctx.baseURL) {
        lines.push(`- 应用 URL: ${ctx.baseURL}`);
      }
      if (ctx.technology) {
        lines.push(`- 技术栈: ${ctx.technology}`);
      }
      if (ctx.useViewport) {
        lines.push(`- 视口: ${ctx.useViewport.width}x${ctx.useViewport.height}`);
      }
      if (ctx.timeout) {
        lines.push(`- 默认超时: ${ctx.timeout}ms`);
      }
      if (ctx.testDir) {
        lines.push(`- 测试目录: ${ctx.testDir}`);
      }
      if (ctx.fixtures) {
        lines.push(`- Fixtures: ${ctx.fixtures}`);
      }
      if (ctx.packageJson?.name) {
        lines.push(`- 项目名称: ${ctx.packageJson.name}`);
      }
      lines.push(`- 项目根目录: ${ctx.projectRoot}`);
      lines.push('');
      lines.push('请根据以上应用信息生成精确的测试计划，使用具体的页面元素定位器。');
    } else {
      lines.push('\nApplication Information:');
      if (ctx.baseURL) {
        lines.push(`- URL: ${ctx.baseURL}`);
      }
      if (ctx.technology) {
        lines.push(`- Tech Stack: ${ctx.technology}`);
      }
      if (ctx.useViewport) {
        lines.push(`- Viewport: ${ctx.useViewport.width}x${ctx.useViewport.height}`);
      }
      if (ctx.timeout) {
        lines.push(`- Default Timeout: ${ctx.timeout}ms`);
      }
      if (ctx.testDir) {
        lines.push(`- Test Directory: ${ctx.testDir}`);
      }
      if (ctx.fixtures) {
        lines.push(`- Fixtures: ${ctx.fixtures}`);
      }
      if (ctx.packageJson?.name) {
        lines.push(`- Project Name: ${ctx.packageJson.name}`);
      }
      lines.push(`- Project Root: ${ctx.projectRoot}`);
      lines.push('');
      lines.push(
        'Generate precise test plans based on the application information above, using concrete page element locators.'
      );
    }

    return lines.join('\n');
  }

  private async callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.llmConfig) {
      throw new Error('LLM config is not set');
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
          temperature: this.llmConfig.temperature || 0.3,
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
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parsePlanResponse(responseText: string, originalDescription: string): TestPlan {
    let text = responseText.trim();

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      text = codeBlockMatch[1].trim();
    }

    try {
      const parsed = JSON.parse(text);

      const scenarios: TestPlanScenario[] = Array.isArray(parsed.scenarios)
        ? parsed.scenarios.map((s: Record<string, unknown>) => ({
            name: String(s.name || 'Unnamed Scenario'),
            steps: Array.isArray(s.steps)
              ? s.steps.map((step: Record<string, unknown>) => ({
                  action: String(step.action || ''),
                  target: String(step.target || ''),
                  value: step.value ? String(step.value) : undefined,
                }))
              : [],
            expectedResults: Array.isArray(s.expectedResults)
              ? s.expectedResults.map((r: unknown) => String(r))
              : [],
          }))
        : [];

      return {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: String(parsed.title || originalDescription),
        description: String(parsed.description || ''),
        scenarios,
        createdAt: Date.now(),
        seedTest: this.config.seedTest,
      };
    } catch {
      this.log.warn('Failed to parse planner response as JSON, creating fallback plan');

      return {
        id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: originalDescription,
        description: responseText.slice(0, 500),
        scenarios: [
          {
            name: originalDescription,
            steps: [{ action: responseText.slice(0, 200), target: '', value: undefined }],
            expectedResults: [],
          },
        ],
        createdAt: Date.now(),
        seedTest: this.config.seedTest,
      };
    }
  }
}
