import { matchPatterns, buildFewShotExamples } from '../../src/diagnosis/knowledge-base';

/**
 * knowledge-base 模块单元测试
 * 覆盖 matchPatterns 模式匹配和 buildFewShotExamples 示例生成功能
 */
describe('knowledge-base', () => {
  describe('matchPatterns', () => {
    /** 应匹配 TimeoutError 模式 */
    it('应匹配 TimeoutError 模式', () => {
      const patterns = matchPatterns('Timeout 30000ms exceeded waiting for selector ".btn"');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'timeout')).toBe(true);
    });

    /** 应匹配 SelectorError 模式 */
    it('应匹配 SelectorError 模式', () => {
      const patterns = matchPatterns('Error: strict mode violation: selector ".btn" matched 3 elements');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'selector')).toBe(true);
    });

    /** 应匹配 NetworkError 模式 */
    it('应匹配 NetworkError 模式', () => {
      const patterns = matchPatterns('Request failed with status 401 Unauthorized');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'network' || p.category === 'auth')).toBe(true);
    });

    /** 应匹配 FrameError 模式 */
    it('应匹配 FrameError 模式', () => {
      const patterns = matchPatterns('Frame was detached');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'frame')).toBe(true);
    });

    /** 应匹配 AuthError 模式 */
    it('应匹配 AuthError 模式', () => {
      const patterns = matchPatterns('401 Unauthorized - token expired');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'auth')).toBe(true);
    });

    /** 应对未知错误返回空数组 */
    it('应对未知错误返回空数组', () => {
      const patterns = matchPatterns('Something completely unexpected happened');
      expect(patterns).toEqual([]);
    });

    /** 应同时匹配多个模式 */
    it('应同时匹配多个模式', () => {
      const patterns = matchPatterns('Timeout waiting for selector after 401 Unauthorized redirect');
      expect(patterns.length).toBeGreaterThanOrEqual(2);
    });

    /** 应匹配导航超时模式 */
    it('应匹配导航超时模式', () => {
      const patterns = matchPatterns('Timeout navigating to page');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.id === 'timeout-navigation')).toBe(true);
    });

    /** 应匹配 API 响应超时模式 */
    it('应匹配 API 响应超时模式', () => {
      const patterns = matchPatterns('Timeout waiting for response from /api/data');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.id === 'timeout-api-response')).toBe(true);
    });

    /** 应匹配 CORS 跨域错误模式 */
    it('应匹配 CORS 跨域错误模式', () => {
      const patterns = matchPatterns('CORS policy blocked the request');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.id === 'network-cors')).toBe(true);
    });

    /** 应匹配元素不存在模式 */
    it('应匹配元素不存在模式', () => {
      const patterns = matchPatterns('No element found for selector ".missing"');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.id === 'selector-element-not-found')).toBe(true);
    });

    /** 应对空字符串返回空数组 */
    it('应对空字符串返回空数组', () => {
      const patterns = matchPatterns('');
      expect(patterns).toEqual([]);
    });

    /** 应匹配 AssertionError 模式 */
    it('应匹配 AssertionError 模式', () => {
      const patterns = matchPatterns('Expected text "Hello" but received "World"');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'assertion')).toBe(true);
    });

    /** 应匹配可见性断言失败 */
    it('应匹配可见性断言失败', () => {
      const patterns = matchPatterns('Element is not visible');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some(p => p.category === 'assertion')).toBe(true);
    });
  });

  describe('buildFewShotExamples', () => {
    /** 应生成中文 few-shot 示例 */
    it('应生成中文 few-shot 示例', () => {
      const patterns = matchPatterns('Timeout 30000ms exceeded waiting for selector ".btn"');
      const examples = buildFewShotExamples(patterns, 'zh');
      expect(examples).toContain('已知错误模式');
      expect(examples).toContain('Timeout');
    });

    /** 应生成英文 few-shot 示例 */
    it('应生成英文 few-shot 示例', () => {
      const patterns = matchPatterns('Timeout 30000ms exceeded waiting for selector ".btn"');
      const examples = buildFewShotExamples(patterns, 'en');
      expect(examples).toContain('Known error pattern');
    });

    /** 应对空模式列表返回空字符串 */
    it('应对空模式列表返回空字符串', () => {
      const examples = buildFewShotExamples([], 'zh');
      expect(examples).toBe('');
    });

    /** 中文示例应包含建议修复和参考文档 */
    it('中文示例应包含建议修复和参考文档', () => {
      const patterns = matchPatterns('Timeout 30000ms exceeded waiting for selector ".btn"');
      const examples = buildFewShotExamples(patterns, 'zh');
      expect(examples).toContain('建议修复');
      expect(examples).toContain('参考文档');
    });

    /** 英文示例应包含 Root cause 和 Suggestions */
    it('英文示例应包含 Root cause 和 Suggestions', () => {
      const patterns = matchPatterns('Timeout 30000ms exceeded waiting for selector ".btn"');
      const examples = buildFewShotExamples(patterns, 'en');
      expect(examples).toContain('Root cause');
      expect(examples).toContain('Suggestions');
    });

    /** 多个模式应生成多段示例 */
    it('多个模式应生成多段示例', () => {
      const patterns = matchPatterns('Timeout waiting for selector after 401 Unauthorized redirect');
      const examples = buildFewShotExamples(patterns, 'zh');
      const patternCount = (examples.match(/模式：/g) || []).length;
      expect(patternCount).toBe(patterns.length);
    });
  });
});
