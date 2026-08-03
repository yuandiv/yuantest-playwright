/**
 * Agent 工具：agent_heal — 分析失败测试并生成修复补丁
 */
import { defineTool } from '../types';
import type { AgentToolContext } from './types';

export function createAgentHealTool(ctx: AgentToolContext) {
  return defineTool(
    'agent_heal',
    'Analyze a failing test and generate fix patches',
    {
      testFilePath: { type: 'string', description: 'Path to the failing test file' },
      error: {
        type: 'string',
        description: 'Error message from the test failure (optional)',
      },
      stackTrace: {
        type: 'string',
        description: 'Stack trace from the test failure (optional)',
      },
    },
    ['testFilePath'],
    async (args) => {
      const result = await ctx.heal(String(args.testFilePath), {
        error: args.error as string | undefined,
        stackTrace: args.stackTrace as string | undefined,
      });
      if (result.success && result.data) {
        if (result.data.healed) {
          const patches = result.data.patches.map((p: any) => `- ${p.reason}`).join('\n');
          return `测试已修复，共 ${result.data.patches.length} 处修改:\n${patches}`;
        }
        return `测试未能自动修复（已尝试 ${result.data.roundsUsed} 轮）。`;
      }
      return `错误: ${result.error || '未知错误'}`;
    }
  );
}
