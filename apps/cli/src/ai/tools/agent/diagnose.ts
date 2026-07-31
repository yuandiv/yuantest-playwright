/**
 * Agent 工具：agent_diagnose — AI 诊断测试失败原因
 * 使用共享的 DiagnosisAgent 实例诊断测试失败原因并返回结构化结果
 */
import { defineTool } from '../types';
import type { AgentToolContext } from './types';
import type { AIDiagnosis } from '@yuantest/contracts';

export function createAgentDiagnoseTool(ctx: AgentToolContext) {
  return defineTool(
    'agent_diagnose',
    'Analyze a test failure using AI and return structured diagnosis with root cause and fix suggestions. Use this when the user asks why a test failed.',
    {
      title: {
        type: 'string',
        description: 'The test case title or identifier',
      },
      error: {
        type: 'string',
        description: 'The error message from the test failure',
      },
      stackTrace: {
        type: 'string',
        description: 'Optional stack trace from the failure',
      },
      filePath: {
        type: 'string',
        description: 'Optional path to the test file',
      },
    },
    ['title', 'error'],
    async (args) => {
      const agent = ctx.diagnosisAgent;
      if (!agent || !ctx.llmService) {
        return '❌ LLM 未配置，无法进行 AI 诊断。请先在设置中配置 LLM 连接。';
      }

      try {
        const diagnosis: AIDiagnosis = await agent.diagnose({
          title: String(args.title),
          error: String(args.error),
          stackTrace: args.stackTrace as string | undefined,
          filePath: args.filePath as string | undefined,
        });

        const confidencePercent = Math.round(
          (diagnosis.calibratedConfidence ?? diagnosis.confidence) * 100
        );
        const lowConfidenceWarning =
          confidencePercent < 50
            ? '\n\n> ⚠️ **置信度较低**（' +
              confidencePercent +
              '%），此分析仅供参考，建议人工复核。'
            : '';

        const suggestionList =
          diagnosis.suggestions.length > 0
            ? '\n' + diagnosis.suggestions.map((s: string) => `- ${s}`).join('\n')
            : '';

        const codeDiffInfo =
          diagnosis.codeDiffs && diagnosis.codeDiffs.length > 0
            ? '\n\n**代码修改建议**: ' + diagnosis.codeDiffs.length + ' 处'
            : '';

        return [
          `## AI 诊断结果`,
          ``,
          `**测试**: ${diagnosis.summary || args.title}`,
          `**根因**: ${diagnosis.rootCause}`,
          `**分类**: ${diagnosis.category}`,
          `**置信度**: ${confidencePercent}%`,
          suggestionList ? `**修复建议**:${suggestionList}` : '',
          codeDiffInfo,
          lowConfidenceWarning,
        ]
          .filter(Boolean)
          .join('\n');
      } catch (error) {
        return `❌ 诊断失败: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  );
}
