/**
 * 诊断缓存 — TTLCache 封装，提供缓存读取/写入/清除
 */
import { TTLCache } from '@yuantest/core';
import type { AIDiagnosis } from '@yuantest/contracts';

const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

export class DiagnosisCache {
  private cache = new TTLCache<AIDiagnosis>(CACHE_TTL_MS, { maxSize: CACHE_MAX_SIZE });

  getCacheKey(testInfo: {
    title: string;
    error?: string;
    filePath?: string;
    lineNumber?: number;
  }): string {
    return `${testInfo.title}::${testInfo.error || ''}::${testInfo.filePath || ''}::${testInfo.lineNumber || ''}`;
  }

  get(key: string): AIDiagnosis | null {
    return this.cache.get(key) ?? null;
  }

  set(key: string, result: AIDiagnosis): void {
    this.cache.set(key, result);
  }

  clear(): void {
    this.cache.clear();
  }
}
