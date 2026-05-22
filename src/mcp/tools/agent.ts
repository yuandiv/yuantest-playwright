import * as fs from 'fs';
import * as path from 'path';
import type { MCPTool } from '../types';
import type { LLMConfig } from '../../types';

// 模块级单例：AgentService 实例
let agentServiceInstance: import('../../agents').AgentService | null = null;

/**
 * 获取或创建 AgentService 单例
 * 首次调用时创建实例，并尝试从 dataDir/llm-config.json 加载 LLM 配置
 */
async function getOrCreateAgentService() {
  if (agentServiceInstance) {
    return agentServiceInstance;
  }

  const { AgentService } = await import('../../agents');
  const dataDir = process.env.YUANTEST_DATA_DIR || './data';

  // 尝试从 llm-config.json 加载 LLM 配置
  let llmConfig: LLMConfig | undefined;
  const configPath = path.join(dataDir, 'llm-config.json');
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.enabled) {
        llmConfig = parsed;
      }
    }
  } catch {
    // 配置文件不存在或解析失败，不传 LLM 配置，AgentService 仍可创建
  }

  agentServiceInstance = new AgentService(dataDir, undefined, llmConfig);
  return agentServiceInstance;
}

export const agentPlan: MCPTool = {
  name: 'agent_plan',
  description: 'Generate a test plan from a description',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Description of the test scenario to plan' },
      url: { type: 'string', description: 'URL of the application to explore (optional)' },
    },
    required: ['description'],
  },
  handler: async (args) => {
    try {
      const description = args.description as string;
      const agentService = await getOrCreateAgentService();
      const result = await agentService.plan(description);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Plan generation failed: ${result.error}` }],
        };
      }

      const plan = result.data;
      const output = [
        `Test Plan: ${plan?.title || 'Untitled'}`,
        `Description: ${plan?.description || ''}`,
        `File: ${plan?.filePath || 'N/A'}`,
        `Scenarios: ${plan?.scenarios.length || 0}`,
        `Duration: ${result.duration}ms`,
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: output }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error generating plan: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

export const agentGenerate: MCPTool = {
  name: 'agent_generate',
  description: 'Generate test code from a test plan file',
  inputSchema: {
    type: 'object',
    properties: {
      planPath: { type: 'string', description: 'Path to the test plan markdown file' },
    },
    required: ['planPath'],
  },
  handler: async (args) => {
    try {
      const planPath = args.planPath as string;
      const agentService = await getOrCreateAgentService();
      const result = await agentService.generate(planPath);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Test generation failed: ${result.error}` }],
        };
      }

      const files = result.data || [];
      const output = [
        `Generated ${files.length} test file(s):`,
        ...files.map((f) => `  - ${f}`),
        `Duration: ${result.duration}ms`,
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: output }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error generating tests: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

export const agentHeal: MCPTool = {
  name: 'agent_heal',
  description: 'Heal a failing test file by automatically diagnosing and fixing issues',
  inputSchema: {
    type: 'object',
    properties: {
      testFilePath: { type: 'string', description: 'Path to the failing test file' },
      maxRounds: { type: 'number', description: 'Maximum number of heal rounds (default 3)' },
    },
    required: ['testFilePath'],
  },
  handler: async (args) => {
    try {
      const testFilePath = args.testFilePath as string;
      const agentService = await getOrCreateAgentService();
      const result = await agentService.heal(testFilePath, undefined);

      if (!result.success) {
        return {
          content: [{ type: 'text' as const, text: `Healing failed: ${result.error}` }],
        };
      }

      const data = result.data;
      const output = [
        `Healing Result:`,
        `  Healed: ${data?.healed ? 'Yes' : 'No'}`,
        `  Rounds: ${(data as any)?.roundsUsed || 0}`,
        `  Patches: ${data?.patches?.length || 0}`,
        `  Verified: ${(data as any)?.verified ? 'Yes' : 'No'}`,
        `Duration: ${result.duration}ms`,
      ].join('\n');

      return {
        content: [{ type: 'text' as const, text: output }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error healing test: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
};

export const agentTools: MCPTool[] = [agentPlan, agentGenerate, agentHeal];
