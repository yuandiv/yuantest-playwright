/**
 * Agent 工具：agent_heal — 分析失败测试并生成修复补丁
 */
import { defineTool } from '../types';
import type { AgentToolContext } from './types';

export function createAgentHealTool(ctx: AgentToolContext) {
  return defineTool(
    'agent_heal',
    '分析失败的测试并生成修复补丁。当用户要求"修复/自愈失败的测试"时使用。',
    {
      testFilePath: { type: 'string', description: '失败测试文件的路径' },
      error: {
        type: 'string',
        description: '测试失败的错误信息（可选）',
      },
      stackTrace: {
        type: 'string',
        description: '测试失败的堆栈跟踪（可选）',
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
