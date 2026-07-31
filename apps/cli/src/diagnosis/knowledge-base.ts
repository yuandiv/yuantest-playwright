/**
 * 错误模式知识库 — 模式匹配、注册与提示构建
 *
 * 模式数据已迁移至 ./patterns/ 目录按类别拆分。
 * 本文件仅保留 ErrorPattern 接口定义、注册/查询/匹配函数。
 */
import { BUILTIN_PATTERNS } from './patterns';

// ─── ErrorPattern 接口 ──────────────────────────────────────────────────────

export interface ErrorPattern {
  id: string;
  category: 'timeout' | 'selector' | 'assertion' | 'network' | 'frame' | 'auth' | 'unknown';
  name: string;
  description: string;
  regex: RegExp[];
  rootCauseTemplate: { zh: string; en: string };
  suggestionsTemplate: { zh: string[]; en: string[] };
  docLinks: { title: string; url: string }[];
}

// ─── 自定义模式存储 ─────────────────────────────────────────────────────────

const customPatterns: ErrorPattern[] = [];

// ─── 公开 API ───────────────────────────────────────────────────────────────

export function registerPattern(pattern: ErrorPattern): void {
  const existingIdx = customPatterns.findIndex((p) => p.id === pattern.id);
  if (existingIdx >= 0) {
    customPatterns[existingIdx] = pattern;
  } else {
    customPatterns.push(pattern);
  }
}

export function unregisterPattern(patternId: string): boolean {
  const idx = customPatterns.findIndex((p) => p.id === patternId);
  if (idx >= 0) {
    customPatterns.splice(idx, 1);
    return true;
  }
  return false;
}

export function getCustomPatterns(): ErrorPattern[] {
  return [...customPatterns];
}

export function getAllPatterns(): ErrorPattern[] {
  return [...BUILTIN_PATTERNS, ...customPatterns];
}

export function loadPatternsFromConfig(
  configPatterns: Array<{
    id: string;
    category: ErrorPattern['category'];
    name: string;
    description: string;
    regex: string[];
    rootCauseTemplate: { zh: string; en: string };
    suggestionsTemplate: { zh: string[]; en: string[] };
    docLinks?: { title: string; url: string }[];
  }>
): void {
  for (const cp of configPatterns) {
    registerPattern({
      id: cp.id,
      category: cp.category,
      name: cp.name,
      description: cp.description,
      regex: cp.regex.map((r) => new RegExp(r, 'i')),
      rootCauseTemplate: cp.rootCauseTemplate,
      suggestionsTemplate: cp.suggestionsTemplate,
      docLinks: cp.docLinks || [],
    });
  }
}

export function matchPatterns(error: string): ErrorPattern[] {
  const allPatterns = getAllPatterns();
  return allPatterns.filter((pattern) => pattern.regex.some((re) => re.test(error)));
}

/**
 * 将匹配到的错误模式转换为 few-shot prompt 片段
 */
export function buildFewShotExamples(patterns: ErrorPattern[], lang: string): string {
  if (patterns.length === 0) {
    return '';
  }

  const isZh = lang === 'zh';
  const lines: string[] = [isZh ? '已知错误模式分析：' : 'Known error pattern analysis:'];

  for (const pattern of patterns) {
    const rootCause = isZh ? pattern.rootCauseTemplate.zh : pattern.rootCauseTemplate.en;
    const suggestions = isZh ? pattern.suggestionsTemplate.zh : pattern.suggestionsTemplate.en;
    const docLinks = pattern.docLinks.map((link) => `${link.title}: ${link.url}`).join('; ');

    lines.push(`- ${isZh ? '模式' : 'Pattern'}：${pattern.name}`);
    lines.push(`  ${isZh ? '典型根因' : 'Root cause'}：${rootCause}`);
    lines.push(`  ${isZh ? '建议修复' : 'Suggestions'}：${suggestions.join('；')}`);
    lines.push(`  ${isZh ? '参考文档' : 'References'}：${docLinks}`);
  }

  return lines.join('\n');
}
