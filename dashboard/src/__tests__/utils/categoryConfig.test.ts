import { describe, it, expect } from 'vitest';
import { getCategoryConfig, CATEGORY_CONFIG } from '../../utils/categoryConfig';

describe('getCategoryConfig', () => {
  it('returns config for known category "timeout"', () => {
    const config = getCategoryConfig('timeout');
    expect(config).toEqual(CATEGORY_CONFIG.timeout);
    expect(config.icon).toBe('fas fa-clock');
    expect(config.color).toBe('text-yellow-600');
    expect(config.bg).toBe('bg-yellow-50');
    expect(config.border).toBe('border-yellow-200');
    expect(config.text).toBe('bg-yellow-100 text-yellow-700');
  });

  it('returns config for known category "selector"', () => {
    const config = getCategoryConfig('selector');
    expect(config).toEqual(CATEGORY_CONFIG.selector);
    expect(config.icon).toBe('fas fa-crosshairs');
  });

  it('returns config for known category "network"', () => {
    const config = getCategoryConfig('network');
    expect(config).toEqual(CATEGORY_CONFIG.network);
    expect(config.icon).toBe('fas fa-wifi');
  });

  it('returns config for known category "assertion"', () => {
    const config = getCategoryConfig('assertion');
    expect(config).toEqual(CATEGORY_CONFIG.assertion);
    expect(config.icon).toBe('fas fa-exclamation-triangle');
  });

  it('returns unknown config for unknown category', () => {
    const config = getCategoryConfig('nonexistent');
    expect(config).toEqual(CATEGORY_CONFIG.unknown);
    expect(config.icon).toBe('fas fa-question-circle');
  });

  it('returns unknown config for empty string', () => {
    const config = getCategoryConfig('');
    expect(config).toEqual(CATEGORY_CONFIG.unknown);
  });
});
