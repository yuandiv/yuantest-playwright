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
    '使用 AI 分析测试失败原因，返回包含根因与修复建议的结构化诊断。' +
      '当用户问"测试为什么失败、分析失败原因"时使用。',
    {
      title: {
        type: 'string',
        description: '测试用例标题或标识',
      },
      error: {
        type: 'string',
        description: '测试失败的错误信息',
      },
      stackTrace: {
        type: 'string',
        description: '失败堆栈跟踪（可选）',
      },
      filePath: {
        type: 'string',
        description: '测试文件路径（可选）',
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
