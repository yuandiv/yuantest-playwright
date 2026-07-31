import { describe, it, expect } from 'vitest';
import { categorizeErrorLocal } from '../../utils/errorCategorizer';

describe('categorizeErrorLocal', () => {
  describe('timeout', () => {
    it('matches "timeout"', () => {
      expect(categorizeErrorLocal('Test timeout after 30000ms')).toBe('timeout');
    });
    it('matches "timed out"', () => {
      expect(categorizeErrorLocal('Operation timed out')).toBe('timeout');
    });
    it('matches "time out"', () => {
      expect(categorizeErrorLocal('Waiting for selector time out')).toBe('timeout');
    });
    it('matches "exceeded time"', () => {
      expect(categorizeErrorLocal('Exceeded time limit of 5000ms')).toBe('timeout');
    });
  });

  describe('selector', () => {
    it('matches "selector"', () => {
      expect(categorizeErrorLocal('Waiting for selector ".btn"')).toBe('selector');
    });
    it('matches "element not found"', () => {
      expect(categorizeErrorLocal('Element not found in DOM')).toBe('selector');
    });
    it('matches "waiting locator"', () => {
      expect(categorizeErrorLocal('waiting for locator to be visible')).toBe('selector');
    });
    it('matches "no element"', () => {
      expect(categorizeErrorLocal('No element matches selector')).toBe('selector');
    });
  });

  describe('network', () => {
    it('matches "network"', () => {
      expect(categorizeErrorLocal('Network request failed')).toBe('network');
    });
    it('matches "fetch"', () => {
      expect(categorizeErrorLocal('fetch failed: ECONNREFUSED')).toBe('network');
    });
    it('matches "ECONNREFUSED"', () => {
      expect(categorizeErrorLocal('Error: ECONNREFUSED 127.0.0.1:3000')).toBe('network');
    });
    it('matches "dns"', () => {
      expect(categorizeErrorLocal('dns resolution failed')).toBe('network');
    });
    it('matches "net::"', () => {
      expect(categorizeErrorLocal('net::ERR_CONNECTION_REFUSED')).toBe('network');
    });
    it('matches "cors"', () => {
      expect(categorizeErrorLocal('CORS policy blocked request')).toBe('network');
    });
    it('matches "request fail"', () => {
      expect(categorizeErrorLocal('request failed with status 500')).toBe('network');
    });
    it('matches "ERR_CONNECTION"', () => {
      expect(categorizeErrorLocal('ERR_CONNECTION_RESET')).toBe('network');
    });
  });

  describe('assertion', () => {
    it('matches "assert"', () => {
      expect(categorizeErrorLocal('Assertion failed: expected true')).toBe('assertion');
    });
    it('matches "expect received"', () => {
      expect(categorizeErrorLocal('expect(received).toBe(expected)')).toBe('assertion');
    });
    it('matches "expected but"', () => {
      expect(categorizeErrorLocal('Expected 5 but received 3')).toBe('assertion');
    });
  });

  describe('frame', () => {
    it('matches "frame"', () => {
      expect(categorizeErrorLocal('Frame detached')).toBe('frame');
    });
    it('matches "iframe"', () => {
      expect(categorizeErrorLocal('iframe navigation failed')).toBe('frame');
    });
    it('matches "context destroyed"', () => {
      expect(categorizeErrorLocal('Execution context was destroyed')).toBe('frame');
    });
    it('matches "page closed"', () => {
      expect(categorizeErrorLocal('page closed unexpectedly')).toBe('frame');
    });
  });

  describe('auth', () => {
    it('matches "auth"', () => {
      expect(categorizeErrorLocal('Authentication required')).toBe('auth');
    });
    it('matches "unauthorized"', () => {
      expect(categorizeErrorLocal('Unauthorized access')).toBe('auth');
    });
    it('matches "forbidden"', () => {
      expect(categorizeErrorLocal('Forbidden: access denied')).toBe('auth');
    });
    it('matches "401"', () => {
      expect(categorizeErrorLocal('HTTP 401 Unauthorized')).toBe('auth');
    });
    it('matches "403"', () => {
      expect(categorizeErrorLocal('HTTP 403 Forbidden')).toBe('auth');
    });
    it('matches "login"', () => {
      expect(categorizeErrorLocal('Login required to proceed')).toBe('auth');
    });
    it('matches "token"', () => {
      expect(categorizeErrorLocal('Token expired')).toBe('auth');
    });
  });

  describe('unknown', () => {
    it('returns unknown for unrecognized errors', () => {
      expect(categorizeErrorLocal('Something went wrong')).toBe('unknown');
    });
    it('returns unknown for empty string', () => {
      expect(categorizeErrorLocal('')).toBe('unknown');
    });
  });

  it('is case insensitive', () => {
    expect(categorizeErrorLocal('TIMEOUT')).toBe('timeout');
    expect(categorizeErrorLocal('Network Error')).toBe('network');
    expect(categorizeErrorLocal('ASSERTION FAILED')).toBe('assertion');
  });
});
