import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './base-agent';
import { LLMService } from './llm-service';
import {
  AgentConfig,
  AgentPrompts,
  LLMConfig,
  TestPlan,
  TestPlanScenario,
  TestPlanStep,
  ProjectContext,
} from '../types';

export const PLANNER_SYSTEM_PROMPT_ZH =
  '你是一位专业的测试规划专家。你的任务是根据被测应用的实际页面结构和用户描述的功能场景，生成全面、深入的结构化测试计划。' +
  '\n\n## 场景类型要求\n' +
  '你必须覆盖以下场景类型，每种类型至少1个场景，总场景数不少于8个：\n' +
  '1. 正向流程（Happy Path）：验证核心功能在正常输入下按预期工作\n' +
  '2. 反向/异常流程：验证系统对无效输入、错误操作的合理处理\n' +
  '3. 边界值测试：验证输入在边界条件下的行为（空值、最大长度、特殊字符等）\n' +
  '4. 数据验证：验证数据的完整性、一致性、格式正确性\n' +
  '5. 状态转换：验证页面/组件在不同状态间的切换行为\n' +
  '6. 安全/权限：验证未授权访问、XSS防护、CSRF防护等安全相关行为\n' +
  '\n## 测试方法论\n' +
  '请运用以下方法论设计测试场景：\n' +
  '- 等价类划分：将输入数据划分为有效等价类和无效等价类\n' +
  '- 边界值分析：关注输入边界和极端值\n' +
  '- 错误推测法：基于经验推测可能出错的情况\n' +
  '- 状态转换测试：验证系统在不同状态间的转换\n' +
  '\n## 输出格式要求\n' +
  '测试步骤应使用具体的页面元素定位器（如 getByRole、getByText、getByLabel 等），' +
  '确保生成的测试计划可以直接用于 Playwright 测试代码生成。' +
  '每个步骤必须包含明确的断言描述（在 expectedResults 中体现）。' +
  '\n你必须只返回有效的 JSON 格式，不要使用 markdown 格式，不要代码块。' +
  'JSON 必须包含以下字段：' +
  '"title" (字符串: 测试计划标题), ' +
  '"description" (字符串: 计划描述), ' +
  '"scenarios" (数组: 测试场景列表，每项包含 name, steps, expectedResults)。' +
  '每个 step 包含 action, target, value(可选)。' +
  '请使用中文回复。';

export const PLANNER_SYSTEM_PROMPT_EN =
  'You are a professional test planning expert. Your task is to generate comprehensive, in-depth structured test plans based on the actual page structure of the application and the feature scenarios described by the user. ' +
  '\n\n## Scenario Type Requirements\n' +
  'You must cover the following scenario types, at least 1 scenario per type, with a minimum of 8 total scenarios:\n' +
  '1. Happy Path: Verify core functionality works as expected with normal input\n' +
  '2. Negative/Error Flow: Verify the system handles invalid input and erroneous operations properly\n' +
  '3. Boundary Value Testing: Verify behavior at boundary conditions (empty values, max length, special characters, etc.)\n' +
  '4. Data Validation: Verify data integrity, consistency, and format correctness\n' +
  '5. State Transition: Verify page/component behavior when switching between different states\n' +
  '6. Security/Permission: Verify unauthorized access, XSS protection, CSRF protection, etc.\n' +
  '\n## Testing Methodology\n' +
  'Please apply the following methodologies to design test scenarios:\n' +
  '- Equivalence Partitioning: Divide input data into valid and invalid equivalence classes\n' +
  '- Boundary Value Analysis: Focus on input boundaries and extreme values\n' +
  '- Error Guessing: Based on experience, predict likely error scenarios\n' +
  '- State Transition Testing: Verify system transitions between different states\n' +
  '\n## Output Format Requirements\n' +
  'Test steps should use concrete page element locators (e.g. getByRole, getByText, getByLabel) ' +
  'to ensure the generated test plan can be directly used for Playwright test code generation. ' +
  'Each step must include clear assertion descriptions (reflected in expectedResults). ' +
  '\nYou must respond with valid JSON only, no markdown formatting, no code blocks. ' +
  'The JSON must have these fields: ' +
  '"title" (string: test plan title), ' +
  '"description" (string: plan description), ' +
  '"scenarios" (array: test scenario list, each with name, steps, expectedResults). ' +
  'Each step contains action, target, value(optional). ' +
  'Please respond in English.';

export const PLANNER_FEW_SHOT_ZH = `

## 优秀测试计划示例

以下是一个登录功能的优秀测试计划示例，供参考其深度和广度：

{
  "title": "用户登录功能测试计划",
  "description": "针对用户登录功能的全面测试，覆盖正向流程、异常处理、边界值、安全验证等维度",
  "scenarios": [
    {
      "name": "正常登录 - 有效凭据",
      "steps": [
        {"action": "导航到登录页面", "target": "", "value": "/login"},
        {"action": "输入有效用户名", "target": "getByLabel('用户名')", "value": "testuser"},
        {"action": "输入有效密码", "target": "getByLabel('密码')", "value": "Test@123456"},
        {"action": "点击登录按钮", "target": "getByRole('button', { name: '登录' })"},
        {"action": "等待页面跳转", "target": "", "value": ""}
      ],
      "expectedResults": [
        "登录成功后跳转到首页",
        "页面显示用户名或欢迎信息",
        "URL 变更为 /dashboard"
      ]
    },
    {
      "name": "异常登录 - 错误密码",
      "steps": [
        {"action": "导航到登录页面", "target": "", "value": "/login"},
        {"action": "输入有效用户名", "target": "getByLabel('用户名')", "value": "testuser"},
        {"action": "输入错误密码", "target": "getByLabel('密码')", "value": "wrongpassword"},
        {"action": "点击登录按钮", "target": "getByRole('button', { name: '登录' })"}
      ],
      "expectedResults": [
        "显示错误提示信息：用户名或密码错误",
        "用户仍停留在登录页面",
        "密码输入框被清空"
      ]
    },
    {
      "name": "边界值 - 空用户名和密码",
      "steps": [
        {"action": "导航到登录页面", "target": "", "value": "/login"},
        {"action": "不输入任何内容直接点击登录", "target": "getByRole('button', { name: '登录' })"}
      ],
      "expectedResults": [
        "显示必填字段验证提示",
        "登录按钮不可用或提交被阻止",
        "用户名和密码输入框标记为错误状态"
      ]
    },
    {
      "name": "安全 - SQL注入尝试",
      "steps": [
        {"action": "导航到登录页面", "target": "", "value": "/login"},
        {"action": "在用户名输入SQL注入字符串", "target": "getByLabel('用户名')", "value": "' OR '1'='1"},
        {"action": "点击登录按钮", "target": "getByRole('button', { name: '登录' })"}
      ],
      "expectedResults": [
        "登录失败，不返回任何数据库信息",
        "显示通用错误提示而非技术错误信息",
        "系统记录异常登录尝试"
      ]
    }
  ]
}
`;

export const PLANNER_FEW_SHOT_EN = `

## Example of a Good Test Plan

Below is an example of a good test plan for a login feature, demonstrating depth and breadth:

{
  "title": "User Login Feature Test Plan",
  "description": "Comprehensive testing of user login functionality, covering happy path, error handling, boundary values, and security validation",
  "scenarios": [
    {
      "name": "Happy Path - Valid Credentials",
      "steps": [
        {"action": "Navigate to login page", "target": "", "value": "/login"},
        {"action": "Enter valid username", "target": "getByLabel('Username')", "value": "testuser"},
        {"action": "Enter valid password", "target": "getByLabel('Password')", "value": "Test@123456"},
        {"action": "Click login button", "target": "getByRole('button', { name: 'Login' })"},
        {"action": "Wait for page redirect", "target": "", "value": ""}
      ],
      "expectedResults": [
        "After successful login, redirect to dashboard",
        "Page displays username or welcome message",
        "URL changes to /dashboard"
      ]
    },
    {
      "name": "Error Flow - Wrong Password",
      "steps": [
        {"action": "Navigate to login page", "target": "", "value": "/login"},
        {"action": "Enter valid username", "target": "getByLabel('Username')", "value": "testuser"},
        {"action": "Enter wrong password", "target": "getByLabel('Password')", "value": "wrongpassword"},
        {"action": "Click login button", "target": "getByRole('button', { name: 'Login' })"}
      ],
      "expectedResults": [
        "Error message displayed: Invalid username or password",
        "User stays on login page",
        "Password field is cleared"
      ]
    },
    {
      "name": "Boundary - Empty Username and Password",
      "steps": [
        {"action": "Navigate to login page", "target": "", "value": "/login"},
        {"action": "Click login without entering anything", "target": "getByRole('button', { name: 'Login' })"}
      ],
      "expectedResults": [
        "Required field validation messages displayed",
        "Login button disabled or submission prevented",
        "Username and password fields marked as error state"
      ]
    },
    {
      "name": "Security - SQL Injection Attempt",
      "steps": [
        {"action": "Navigate to login page", "target": "", "value": "/login"},
        {"action": "Enter SQL injection string in username", "target": "getByLabel('Username')", "value": "' OR '1'='1"},
        {"action": "Click login button", "target": "getByRole('button', { name: 'Login' })"}
      ],
      "expectedResults": [
        "Login fails, no database information returned",
        "Generic error message shown instead of technical error",
        "System logs abnormal login attempt"
      ]
    }
  ]
}
`;

export class PlannerAgent extends BaseAgent {
  private customPrompts: Partial<AgentPrompts> | null = null;

  protected getAgentName(): string {
    return 'PlannerAgent';
  }

  /** Planner 需要 customPrompts 额外配置 */
  public getRequiredExtraConfigKeys(): string[] {
    return ['customPrompts'];
  }

  constructor(
    config: AgentConfig,
    llmConfig: LLMConfig | null,
    customPrompts?: Partial<AgentPrompts>,
    llmService?: LLMService
  ) {
    super(config, llmConfig, llmService);
    this.customPrompts = customPrompts || null;
  }

  updateConfig(
    config: AgentConfig,
    llmConfig: LLMConfig | null,
    extraParams?: Record<string, unknown>
  ): void {
    super.updateConfig(config, llmConfig, extraParams);
    if (extraParams) {
      if (extraParams.customPrompts !== undefined) {
        this.customPrompts = extraParams.customPrompts as Partial<AgentPrompts> | null;
      }
    }
  }

  async generatePlan(
    description: string,
    options?: {
      seedTest?: string;
      prdPath?: string;
      pageSnapshot?: string;
    }
  ): Promise<TestPlan> {
    if (!this.llmService) {
      throw new Error('LLM is not enabled');
    }

    const lang = this.config.language || 'zh';
    const systemPrompt =
      (lang === 'zh'
        ? this.customPrompts?.plannerSystemZh || PLANNER_SYSTEM_PROMPT_ZH
        : this.customPrompts?.plannerSystemEn || PLANNER_SYSTEM_PROMPT_EN) +
      (lang === 'zh'
        ? this.customPrompts?.plannerFewShotZh || PLANNER_FEW_SHOT_ZH
        : this.customPrompts?.plannerFewShotEn || PLANNER_FEW_SHOT_EN);

    let userPrompt =
      lang === 'zh'
        ? `请为以下功能生成测试计划：\n\n${description}\n\n` +
          `请考虑以下测试维度：正常流程、异常流程、边界条件、数据验证、权限控制。\n` +
          `请为每个场景提供详细的测试步骤，包括前置条件、操作步骤和断言验证。\n` +
          `请确保覆盖关键业务路径和潜在风险点。\n`
        : `Generate a test plan for the following feature:\n\n${description}\n\n` +
          `Please consider these testing dimensions: normal flow, error flow, boundary conditions, data validation, permission control.\n` +
          `Provide detailed test steps for each scenario, including preconditions, action steps, and assertion verifications.\n` +
          `Ensure coverage of critical business paths and potential risk points.\n`;

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

    if (options?.pageSnapshot) {
      userPrompt +=
        lang === 'zh'
          ? `\n页面观察结果:\n${options.pageSnapshot.slice(0, 3000)}\n`
          : `\nPage Observations:\n${options.pageSnapshot.slice(0, 3000)}\n`;
    }

    const responseText = await super.callLLM(systemPrompt, userPrompt);
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
      // JSON parse failed — likely truncated. Try to repair and extract partial data.
      this.log.warn('Failed to parse planner response as JSON, attempting repair');

      const repaired = this.tryRepairTruncatedJSON(text);
      if (repaired) {
        try {
          const scenarios: TestPlanScenario[] = Array.isArray(repaired.scenarios)
            ? repaired.scenarios
                .filter((s: Record<string, unknown>) => s && typeof s === 'object')
                .map((s: Record<string, unknown>) => ({
                  name: String(s.name || 'Unnamed Scenario'),
                  steps: Array.isArray(s.steps)
                    ? s.steps
                        .filter((step: unknown) => step && typeof step === 'object')
                        .map((step: Record<string, unknown>) => ({
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

          if (scenarios.length > 0) {
            this.log.info(`Repaired truncated JSON: recovered ${scenarios.length} scenarios`);
            return {
              id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title: String(repaired.title || originalDescription),
              description: String(repaired.description || ''),
              scenarios,
              createdAt: Date.now(),
              seedTest: this.config.seedTest,
            };
          }
        } catch {
          // Repair didn't work either, fall through to fallback
        }
      }

      this.log.warn('JSON repair failed, creating fallback plan');

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

  /**
   * 尝试修复截断的 JSON，通过补全未关闭的括号/花括号
   * 处理 LLM 输出被截断的常见情况
   */
  private tryRepairTruncatedJSON(text: string): Record<string, unknown> | null {
    try {
      // 找到 JSON 对象的起始位置
      const start = text.indexOf('{');
      if (start === -1) {
        return null;
      }

      let json = text.slice(start);

      // 统计未关闭的括号和花括号
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escape = false;

      for (let i = 0; i < json.length; i++) {
        const ch = json[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) {
          continue;
        }

        if (ch === '{') {
          openBraces++;
        } else if (ch === '}') {
          openBraces--;
        } else if (ch === '[') {
          openBrackets++;
        } else if (ch === ']') {
          openBrackets--;
        }
      }

      // 如果在字符串中，先关闭字符串
      if (inString) {
        json += '"';
      }

      // 补全未关闭的括号和花括号
      for (let i = 0; i < openBrackets; i++) {
        json += ']';
      }
      for (let i = 0; i < openBraces; i++) {
        json += '}';
      }

      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  /** 从 Markdown 文件解析 TestPlan */
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
}
