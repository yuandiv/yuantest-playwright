import { describe, it, expect } from 'vitest';
import { generateSampleHealthMetrics } from '../../utils/healthDataGenerator';

describe('generateSampleHealthMetrics', () => {
  it('generates default 14 days of data', () => {
    const metrics = generateSampleHealthMetrics();
    expect(metrics).toHaveLength(14);
  });

  it('generates custom number of days', () => {
    const metrics = generateSampleHealthMetrics(7);
    expect(metrics).toHaveLength(7);
  });

  it('generates data with complete fields', () => {
    const metrics = generateSampleHealthMetrics(1);
    const metric = metrics[0];
    expect(metric).toHaveProperty('date');
    expect(metric).toHaveProperty('timestamp');
    expect(metric).toHaveProperty('runStatus');
    expect(metric.runStatus).toHaveProperty('passed');
    expect(metric.runStatus).toHaveProperty('failed');
    expect(metric.runStatus).toHaveProperty('total');
    expect(metric.runStatus).toHaveProperty('passRate');
    expect(metric).toHaveProperty('runDuration');
    expect(metric).toHaveProperty('testSuiteSize');
    expect(metric).toHaveProperty('testFlakiness');
  });

  it('calculates passRate correctly', () => {
    const metrics = generateSampleHealthMetrics(1);
    const metric = metrics[0];
    const expectedRate = (metric.runStatus.passed / metric.runStatus.total) * 100;
    expect(metric.runStatus.passRate).toBeCloseTo(expectedRate, 1);
  });

  it('generates dates in chronological order (oldest first)', () => {
    const metrics = generateSampleHealthMetrics(5);
    for (let i = 1; i < metrics.length; i++) {
      expect(metrics[i].timestamp).toBeGreaterThan(metrics[i - 1].timestamp);
    }
  });

  it('generates date strings in YYYY-MM-DD format', () => {
    const metrics = generateSampleHealthMetrics(1);
    expect(metrics[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
