import { matchPatterns } from './knowledge-base';

export type FailureCategory =
  | 'assertion'
  | 'timeout'
  | 'network'
  | 'selector'
  | 'frame'
  | 'auth'
  | 'unknown';

export function categorizeError(error: string): FailureCategory {
  const matched = matchPatterns(error);
  if (matched.length > 0) {
    return matched[0].category;
  }

  const lower = error.toLowerCase();

  if (/timeout|timed?\s*out|exceeded.*time/.test(lower)) {
    return 'timeout';
  }
  if (/selector|element.*not.*found|waiting.*locator|no.*element/.test(lower)) {
    return 'selector';
  }
  if (/network|fetch|econnrefused|dns|net::|request.*fail|err_connection|cors/.test(lower)) {
    return 'network';
  }
  if (/assert|expect.*received|expected.*but/.test(lower)) {
    return 'assertion';
  }
  if (/frame|iframe|context.*destroyed|page.*closed/.test(lower)) {
    return 'frame';
  }
  if (/auth|unauthorized|forbidden|401|403|login|token/.test(lower)) {
    return 'auth';
  }

  return 'unknown';
}

const FALLBACK_SUGGESTIONS: Record<FailureCategory, { zh: string[]; en: string[] }> = {
  timeout: {
    zh: ['考虑增加超时时间', '检查元素是否加载过慢'],
    en: [
      'Consider increasing the timeout value',
      'Check if the element is taking too long to load',
    ],
  },
  selector: {
    zh: ['验证选择器是否正确', '检查元素是否存在于 DOM 中'],
    en: ['Verify the selector is correct', 'Check if the element exists in the DOM'],
  },
  network: {
    zh: ['检查网络连接', '确认 API 端点是否可访问'],
    en: ['Check network connectivity', 'Verify API endpoints are accessible'],
  },
  assertion: {
    zh: ['检查断言期望值是否正确', '确认动态内容是否已加载完成'],
    en: [
      'Verify the assertion expected value is correct',
      'Ensure dynamic content has fully loaded',
    ],
  },
  frame: {
    zh: ['检查 iframe 是否已加载完成', '确认是否需要先获取 frame 对象'],
    en: [
      'Check if the iframe has fully loaded',
      'Confirm if you need to get the frame object first',
    ],
  },
  auth: {
    zh: ['检查认证状态是否有效', '确认是否需要重新登录'],
    en: ['Check if the authentication state is valid', 'Confirm if you need to re-login'],
  },
  unknown: {
    zh: ['查看错误消息和堆栈跟踪', '检查最近的代码变更是否导致了此失败'],
    en: [
      'Review the error message and stack trace',
      'Check recent code changes that may have caused this failure',
    ],
  },
};

export function generateSuggestions(error: string, lang: 'zh' | 'en' = 'zh'): string[] {
  const matched = matchPatterns(error);
  if (matched.length > 0) {
    return matched[0].suggestionsTemplate[lang];
  }

  const category = categorizeError(error);
  return FALLBACK_SUGGESTIONS[category][lang];
}
