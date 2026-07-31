/**
 * Agent 工具：agent_generate — 根据测试计划内容直接生成测试代码并保存到文件
 */
import * as path from 'path';
import { defineTool } from '../types';
import type { AgentToolContext } from './types';
import { GeneratorAgent } from '../../agents/generator';
import { AgentConfig, LLMConfig } from '@yuantest/contracts';

export function createAgentGenerateTool(ctx: AgentToolContext) {
  return defineTool(
    'agent_generate',
    'Generate and save Playwright TypeScript test code from a test plan content',
    {
      planContent: { type: 'string', description: 'The test plan content in markdown format' },
      outputDir: {
        type: 'string',
        description: 'Output directory for generated test files (optional)',
      },
    },
    ['planContent'],
    async (args) => {
      const planContent = String(args.planContent);
      const outputDir = args.outputDir ? String(args.outputDir) : undefined;

      if (!ctx.llmService) {
        return '❌ LLM 未配置，无法生成测试代码。请先在设置中配置 LLM 连接。';
      }

      // 构造一个最小配置供 GeneratorAgent 使用
      const agentConfig: AgentConfig = {
        enabled: true,
        loopTarget: 'vscode',
        specsDir: 'specs',
        autoHeal: false,
        maxHealRounds: 3,
        projectRoot: ctx.projectRoot,
      };

      const generator = new GeneratorAgent(
        agentConfig,
        ctx.llmService.getConfig() as LLMConfig,
        ctx.llmService
      );

      try {
        const files = await generator.generateTests(planContent, {
          outputDir: outputDir || path.resolve(ctx.projectRoot, 'tests'),
        });
        if (files.length === 0) {
          return '⚠️ 未能从响应中提取到有效测试代码。请确认测试计划格式正确。';
        }
        return `✅ 测试代码已生成，共 ${files.length} 个文件：\n${files.map((f) => `  - ${f}`).join('\n')}`;
      } catch (error) {
        return `❌ 生成测试代码失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
