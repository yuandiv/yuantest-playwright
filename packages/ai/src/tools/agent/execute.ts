/**
 * Agent 工具：agent_execute — 运行 Playwright 测试并返回结果
 */
import * as path from 'path';
import { defineTool } from '../types';
import type { AgentToolContext } from './types';
import type { TestConfig } from '@yuantest/contracts';

export function createAgentExecuteTool(ctx: AgentToolContext) {
  return defineTool(
    'agent_execute',
    'Run Playwright tests and return pass/fail results. Use this when the user asks you to run or execute tests.',
    {
      testDir: {
        type: 'string',
        description: 'Test file directory (optional, defaults to the project test dir)',
      },
      grep: {
        type: 'string',
        description: 'Run only tests matching this name pattern (optional)',
      },
      timeout: {
        type: 'number',
        description: 'Test timeout in milliseconds (optional, default 30000)',
      },
      retries: {
        type: 'number',
        description: 'Number of retries on failure (optional, default 0)',
      },
    },
    [],
    async (args) => {
      const testDir = String(args.testDir || ctx.projectRoot || process.cwd());
      const config: TestConfig = {
        version: 'agent-run',
        testDir,
        outputDir: path.join(ctx.dataDir, 'runs', `agent-${Date.now()}`),
        timeout: Number(args.timeout || 30000),
        retries: Number(args.retries || 0),
        browsers: ['chromium'],
      };

      const progressMessages: string[] = [];

      try {
        if (!ctx.executor) {
          return '❌ 执行器未配置（agent_execute 不可用）：请检查 yuantest 配置是否正确注入执行能力。';
        }
        const runResult = await ctx.executor.execute(config, {
          onProgress: (progress: { passed: number; totalTests: number }) => {
            const msg = `⏳ 进度: ${progress.passed}/${progress.totalTests} 通过`;
            progressMessages.push(msg);
          },
          onTestResult: (result: { status: string; title: string; duration: number }) => {
            const icon = result.status === 'passed' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
            progressMessages.push(`${icon} [${result.status}] ${result.title} (${result.duration}ms)`);
          },
        });
        const recentProgress = progressMessages.slice(-5);

        const summary = [
          `## 测试执行结果`,
          ``,
          `- **运行 ID**: ${runResult.id}`,
          `- **状态**: ${runResult.status === 'success' ? '✅ 成功' : '❌ 失败'}`,
          `- **总计**: ${runResult.totalTests} 个用例`,
          `- **通过**: ${runResult.passed} 个`,
          `- **失败**: ${runResult.failed} 个`,
          `- **跳过**: ${runResult.skipped} 个`,
          runResult.duration ? `- **耗时**: ${(runResult.duration / 1000).toFixed(1)}s` : '',
          recentProgress.length > 0 ? `\n**执行详情**:\n${recentProgress.join('\n')}` : '',
          ``,
          runResult.failed > 0
            ? '⚠️ 存在失败用例，需要进一步分析。你可以让我用 agent_diagnose 诊断失败原因。'
            : '🎉 全部通过！',
        ]
          .filter(Boolean)
          .join('\n');

        return summary;
      } catch (error) {
        return `❌ 测试执行失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
