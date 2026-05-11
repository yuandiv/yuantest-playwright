import { categorizeError, generateSuggestions, FailureCategory } from '../../src/diagnosis/categorizer';

describe('categorizer', () => {
  describe('categorizeError', () => {
    it('should categorize timeout errors', () => {
      expect(categorizeError('Timeout 30000ms exceeded')).toBe('timeout');
      expect(categorizeError('timed out waiting for element')).toBe('timeout');
      expect(categorizeError('Timeout exceeded time limit')).toBe('timeout');
    });

    it('should categorize selector errors', () => {
      expect(categorizeError('selector not found')).toBe('selector');
      expect(categorizeError('element not found in DOM')).toBe('selector');
      expect(categorizeError('waiting for locator ".btn"')).toBe('selector');
      expect(categorizeError('no element matches selector')).toBe('selector');
    });

    it('should categorize network errors', () => {
      expect(categorizeError('network error')).toBe('network');
      expect(categorizeError('fetch failed')).toBe('network');
      expect(categorizeError('ECONNREFUSED')).toBe('network');
      expect(categorizeError('DNS resolution failed')).toBe('network');
      expect(categorizeError('net::ERR_CONNECTION_REFUSED')).toBe('network');
      expect(categorizeError('request failed with status 500')).toBe('network');
      expect(categorizeError('err_connection_timed_out')).toBe('network');
      expect(categorizeError('CORS policy blocked')).toBe('network');
    });

    it('should categorize assertion errors', () => {
      expect(categorizeError('assertion failed')).toBe('assertion');
      expect(categorizeError('expect received but got different')).toBe('assertion');
      expect(categorizeError('expected 5 but got 3')).toBe('assertion');
    });

    it('should categorize frame errors', () => {
      expect(categorizeError('frame was detached')).toBe('frame');
      expect(categorizeError('context destroyed')).toBe('frame');
      expect(categorizeError('page closed unexpectedly')).toBe('frame');
    });

    it('should categorize auth errors', () => {
      expect(categorizeError('auth required')).toBe('auth');
      expect(categorizeError('unauthorized access')).toBe('auth');
      expect(categorizeError('forbidden 403')).toBe('auth');
      expect(categorizeError('401 Unauthorized')).toBe('auth');
      expect(categorizeError('login required')).toBe('auth');
      expect(categorizeError('token expired')).toBe('auth');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(categorizeError('something completely unexpected')).toBe('unknown');
      expect(categorizeError('')).toBe('unknown');
    });

    it('should prioritize knowledge base patterns over keyword matching', () => {
      expect(categorizeError('Timeout 30000ms exceeded waiting for selector ".btn"')).toBe('timeout');
      expect(categorizeError('No element found for selector ".submit"')).toBe('selector');
      expect(categorizeError('Expected text "Hello" received "World"')).toBe('assertion');
    });
  });

  describe('generateSuggestions', () => {
    it('should return Chinese suggestions by default', () => {
      const suggestions = generateSuggestions('some unknown error');
      expect(suggestions.length).toBeGreaterThan(0);
      suggestions.forEach(s => {
        expect(typeof s).toBe('string');
      });
    });

    it('should return English suggestions when lang=en', () => {
      const suggestions = generateSuggestions('some unknown error', 'en');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return knowledge base suggestions for known patterns', () => {
      const zhSuggestions = generateSuggestions('Timeout 30000ms exceeded waiting for selector ".btn"', 'zh');
      expect(zhSuggestions.length).toBeGreaterThan(0);
      expect(zhSuggestions.some(s => s.includes('超时') || s.includes('waitFor'))).toBe(true);

      const enSuggestions = generateSuggestions('Timeout 30000ms exceeded waiting for selector ".btn"', 'en');
      expect(enSuggestions.length).toBeGreaterThan(0);
      expect(enSuggestions.some(s => s.includes('timeout') || s.includes('Timeout') || s.includes('waitFor'))).toBe(true);
    });

    it('should return fallback suggestions for timeout errors', () => {
      const suggestions = generateSuggestions('timeout error occurred', 'zh');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return fallback suggestions for selector errors', () => {
      const suggestions = generateSuggestions('selector error', 'en');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return fallback suggestions for network errors', () => {
      const suggestions = generateSuggestions('network error', 'en');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return fallback suggestions for assertion errors', () => {
      const suggestions = generateSuggestions('assertion error', 'en');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return fallback suggestions for frame errors', () => {
      const suggestions = generateSuggestions('frame error', 'en');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return fallback suggestions for auth errors', () => {
      const suggestions = generateSuggestions('auth error', 'en');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return generic suggestions for unknown errors', () => {
      const zhSuggestions = generateSuggestions('something weird happened', 'zh');
      expect(zhSuggestions.length).toBeGreaterThan(0);

      const enSuggestions = generateSuggestions('something weird happened', 'en');
      expect(enSuggestions.length).toBeGreaterThan(0);
    });
  });
});
