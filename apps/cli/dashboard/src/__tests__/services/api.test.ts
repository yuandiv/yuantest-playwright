import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchJSON,
  setApiLang,
  getApiLang,
  startRun,
  stopRun,
  deleteRun,
  deleteAllRuns,
  getFlakyTests,
  releaseTest,
} from '../../services/api';

describe('API Service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    setApiLang('zh');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setApiLang / getApiLang', () => {
    it('sets and gets the current language', () => {
      setApiLang('en');
      expect(getApiLang()).toBe('en');
      setApiLang('zh');
      expect(getApiLang()).toBe('zh');
    });
  });

  describe('fetchJSON', () => {
    it('appends lang parameter for GET requests', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await fetchJSON('/api/v1/test');

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).toContain('lang=zh');
    });

    it('uses current language setting', async () => {
      setApiLang('en');
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await fetchJSON('/api/v1/test');

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).toContain('lang=en');
    });

    it('does not append lang for non-GET requests', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      await fetchJSON('/api/v1/test', { method: 'POST' });

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).not.toContain('lang=');
    });

    it('returns null for non-OK responses', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetchJSON('/api/v1/test');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const result = await fetchJSON('/api/v1/test');
      expect(result).toBeNull();
    });

    it('returns parsed JSON for successful responses', async () => {
      const mockData = { id: 1, name: 'test' };
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await fetchJSON('/api/v1/test');
      expect(result).toEqual(mockData);
    });
  });

  describe('startRun', () => {
    it('returns success on OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await startRun({ testDir: './e2e' });
      expect(result.success).toBe(true);
    });

    it('returns error on non-OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal error' }),
      });

      const result = await startRun({ testDir: './e2e' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error on network failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'));

      const result = await startRun({ testDir: './e2e' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });

  describe('stopRun', () => {
    it('returns true on OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      const result = await stopRun();
      expect(result).toBe(true);
    });

    it('returns false on non-OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });

      const result = await stopRun();
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const result = await stopRun();
      expect(result).toBe(false);
    });
  });

  describe('deleteRun', () => {
    it('returns true on OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, text: () => Promise.resolve('') });

      const result = await deleteRun('run-123');
      expect(result).toBe(true);
    });

    it('returns false on non-OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, text: () => Promise.resolve('Not found') });

      const result = await deleteRun('run-123');
      expect(result).toBe(false);
    });
  });

  describe('deleteAllRuns', () => {
    it('returns success with count on OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ count: 5 }),
      });

      const result = await deleteAllRuns();
      expect(result.success).toBe(true);
      expect(result.count).toBe(5);
    });

    it('returns failure on non-OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        text: () => Promise.resolve('Error'),
      });

      const result = await deleteAllRuns();
      expect(result.success).toBe(false);
    });
  });

  describe('getFlakyTests', () => {
    it('calls fetchJSON with correct URL', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await getFlakyTests(0.5);

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(calledUrl).toContain('threshold=0.5');
    });
  });

  describe('releaseTest', () => {
    it('returns true on OK response', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

      const result = await releaseTest('test-123');
      expect(result).toBe(true);
    });

    it('returns false on failure', async () => {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Error'));

      const result = await releaseTest('test-123');
      expect(result).toBe(false);
    });
  });
});
