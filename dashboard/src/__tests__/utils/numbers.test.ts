import { describe, it, expect } from 'vitest';
import { safeNumber } from '../../utils/numbers';

describe('safeNumber', () => {
  it('returns the value for normal numbers', () => {
    expect(safeNumber(42)).toBe(42);
    expect(safeNumber(0)).toBe(0);
    expect(safeNumber(-3.14)).toBe(-3.14);
  });

  it('returns default value for NaN', () => {
    expect(safeNumber(NaN)).toBe(0);
  });

  it('returns default value for Infinity', () => {
    expect(safeNumber(Infinity)).toBe(0);
  });

  it('returns default value for -Infinity', () => {
    expect(safeNumber(-Infinity)).toBe(0);
  });

  it('returns default value for strings', () => {
    expect(safeNumber('42')).toBe(0);
  });

  it('returns default value for null', () => {
    expect(safeNumber(null)).toBe(0);
  });

  it('returns default value for undefined', () => {
    expect(safeNumber(undefined)).toBe(0);
  });

  it('returns default value for objects', () => {
    expect(safeNumber({})).toBe(0);
  });

  it('supports custom default value', () => {
    expect(safeNumber(NaN, -1)).toBe(-1);
    expect(safeNumber('abc', 100)).toBe(100);
    expect(safeNumber(null, 50)).toBe(50);
  });
});
