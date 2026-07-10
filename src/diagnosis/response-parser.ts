/**
 * LLM 诊断响应解析器 — 将 LLM 的 JSON 回复解析为 AIDiagnosis 结构
 */
import type { AIDiagnosis, CodeDiff, DocLink, ContextUsed } from '../types';
import type { ErrorPattern } from './knowledge-base';

const defaultContextUsed: ContextUsed = {
  sourceCode: false,
  screenshot: false,
  consoleLogs: false,
  stackTrace: false,
  historyData: false,
  environmentInfo: false,
};

function parseDiagnosisJSON(
  parsed: Record<string, unknown>,
  patterns: ErrorPattern[],
  model: string
): AIDiagnosis {
  const category = (parsed.category as AIDiagnosis['category']) || patterns[0]?.category || 'unknown';

  const codeDiffs: CodeDiff[] = Array.isArray(parsed.codeDiffs)
    ? parsed.codeDiffs.filter(
        (d: unknown) =>
          typeof d === 'object' && d !== null && 'filePath' in (d as Record<string, unknown>)
      )
    : [];

  const parsedDocLinks: DocLink[] = Array.isArray(parsed.docLinks)
    ? parsed.docLinks.filter(
        (d: unknown) =>
          typeof d === 'object' &&
          d !== null &&
          'title' in (d as Record<string, unknown>) &&
          'url' in (d as Record<string, unknown>)
      )
    : [];

  const docLinks: DocLink[] =
    parsedDocLinks.length > 0 ? parsedDocLinks : patterns.flatMap((p) => p.docLinks);

  const rawConfidence =
    typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5;

  return {
    summary: String(parsed.summary || ''),
    rootCause: String(parsed.rootCause || ''),
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
    confidence: rawConfidence,
    model,
    timestamp: Date.now(),
    category,
    codeDiffs,
    docLinks,
    contextUsed: defaultContextUsed,
    reasoningSteps: [],
    calibratedConfidence: rawConfidence,
    analysisMode: 'single',
  };
}

/**
 * 将 LLM 返回的文本解析为结构化 AIDiagnosis
 */
export function parseResponse(responseText: string, patterns: ErrorPattern[] = [], model: string): AIDiagnosis {
  let text = responseText.trim();

  // 移除 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(text);
    return parseDiagnosisJSON(parsed, patterns, model);
  } catch {
    // 首次解析失败，尝试从文本中提取 JSON 对象
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parseDiagnosisJSON(parsed, patterns, model);
      }
    } catch {
      // fall through to fallback
    }

    // 兜底：返回非结构化诊断
    return {
      summary: responseText.slice(0, 200),
      rootCause: 'Unable to parse structured diagnosis from LLM response',
      suggestions: [],
      confidence: 0,
      model,
      timestamp: Date.now(),
      category: patterns[0]?.category || 'unknown',
      codeDiffs: [],
      docLinks: patterns.flatMap((p) => p.docLinks),
      contextUsed: defaultContextUsed,
      reasoningSteps: [],
      calibratedConfidence: 0,
      analysisMode: 'fallback',
    };
  }
}
