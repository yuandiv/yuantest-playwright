import type { Mocked } from 'vitest';
import { vi } from 'vitest';
import {
  walkDir,
  walkDirWithCallback,
  walkDirAsync,
  walkDirWithCallbackAsync,
  ensureDir,
  ensureDirAsync,
  getFileStats,
  getFileStatsAsync,
} from '@yuantest/core';
import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider } from '@yuantest/core';

describe('filesystem utils', () => {
  let mockStorage: Mocked<StorageProvider>;

  beforeEach(() => {
    mockStorage = {
      exists: vi.fn(),
      readText: vi.fn(),
      writeText: vi.fn(),
      writeJSON: vi.fn(),
      readJSON: vi.fn(),
      readBuffer: vi.fn(),
      writeBuffer: vi.fn(),
      mkdir: vi.fn(),
      readDir: vi.fn(),
      readDirWithTypes: vi.fn(),
      stat: vi.fn(),
      remove: vi.fn(),
      copy: vi.fn(),
    } as any;
  });

  describe('walkDir', () => {
    it('should return empty array if directory does not exist', () => {
      const result = walkDir('/nonexistent');

      expect(result).toEqual([]);
    });

    it('should walk directory and return files', () => {
      const testDir = path.join(__dirname, '../../');
      const result = walkDir(testDir, { extensions: ['.ts'] });

      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by extensions', () => {
      const testDir = path.join(__dirname, '../../');
      const result = walkDir(testDir, { extensions: ['.ts'] });

      expect(result.every((f) => f.endsWith('.ts'))).toBe(true);
    });

    it('should ignore specified directories', () => {
      const testDir = path.join(__dirname, '../../');
      const result = walkDir(testDir, { ignoreDirs: ['node_modules', '__mocks__'] });

      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('walkDirWithCallback', () => {
    it('should not call callback if directory does not exist', () => {
      const callback = vi.fn();

      walkDirWithCallback('/nonexistent', callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should call callback for each file', () => {
      const testDir = path.join(__dirname, '../../');
      const callback = vi.fn();

      walkDirWithCallback(testDir, callback, { extensions: ['.ts'] });

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('walkDirAsync', () => {
    it('should return empty array if directory does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);

      const result = await walkDirAsync('/nonexistent', {}, mockStorage);

      expect(result).toEqual([]);
    });

    it('should walk directory asynchronously', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false } as any,
      ]);

      const result = await walkDirAsync('/test-dir', {}, mockStorage);

      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle errors when reading directory', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockRejectedValue(new Error('Read error'));

      const result = await walkDirAsync('/test-dir', {}, mockStorage);

      expect(result).toEqual([]);
    });

    it('should filter by extensions', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false } as any,
        { name: 'file2.js', isFile: () => true, isDirectory: () => false } as any,
      ]);

      const result = await walkDirAsync('/test-dir', { extensions: ['.ts'] }, mockStorage);

      expect(result.every((f) => f.endsWith('.ts'))).toBe(true);
    });

    it('should ignore specified directories', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        { name: 'node_modules', isFile: () => false, isDirectory: () => true } as any,
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false } as any,
      ]);

      const result = await walkDirAsync('/test-dir', { ignoreDirs: ['node_modules'] }, mockStorage);

      expect(result.length).toBe(1);
    });
  });

  describe('walkDirWithCallbackAsync', () => {
    it('should not call callback if directory does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      const callback = vi.fn();

      await walkDirWithCallbackAsync('/nonexistent', callback, {}, mockStorage);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should call callback for each file', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        { name: 'file1.ts', isFile: () => true, isDirectory: () => false } as any,
      ]);
      const callback = vi.fn();

      await walkDirWithCallbackAsync('/test-dir', callback, {}, mockStorage);

      expect(callback).toHaveBeenCalled();
    });

    it('should handle errors when reading directory', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockRejectedValue(new Error('Read error'));
      const callback = vi.fn();

      await walkDirWithCallbackAsync('/test-dir', callback, {}, mockStorage);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', () => {
      const testDir = path.join(__dirname, 'test-temp-dir');

      ensureDir(testDir);

      expect(fs.existsSync(testDir)).toBe(true);

      if (fs.existsSync(testDir)) {
        fs.rmdirSync(testDir);
      }
    });

    it('should not throw if directory exists', () => {
      const testDir = path.join(__dirname);

      expect(() => ensureDir(testDir)).not.toThrow();
    });
  });

  describe('ensureDirAsync', () => {
    it('should create directory if it does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      mockStorage.mkdir.mockResolvedValue();

      await ensureDirAsync('/test-dir', mockStorage);

      expect(mockStorage.mkdir).toHaveBeenCalled();
    });

    it('should not create directory if it exists', async () => {
      mockStorage.exists.mockResolvedValue(true);

      await ensureDirAsync('/test-dir', mockStorage);

      expect(mockStorage.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('getFileStats', () => {
    it('should return null if file does not exist', () => {
      const result = getFileStats('/nonexistent');

      expect(result).toBeNull();
    });

    it('should return file stats if file exists', () => {
      const testFile = __filename;
      const result = getFileStats(testFile);

      expect(result).toBeDefined();
      expect(result?.size).toBeGreaterThan(0);
    });
  });

  describe('getFileStatsAsync', () => {
    it('should return null if file does not exist', async () => {
      mockStorage.stat.mockResolvedValue(null);

      const result = await getFileStatsAsync('/nonexistent', mockStorage);

      expect(result).toBeNull();
    });

    it('should return file stats if file exists', async () => {
      const mockStat = {
        size: 1024,
        birthtimeMs: Date.now(),
        mtimeMs: Date.now(),
      };
      mockStorage.stat.mockResolvedValue(mockStat as any);

      const result = await getFileStatsAsync('/test-file', mockStorage);

      expect(result).toBeDefined();
      expect(result?.size).toBe(1024);
    });
  });

  describe('escapeShellArg', () => {
    it('Windows：含空格路径应被双引号包裹，避免 cmd 拆词', async () => {
      const { escapeShellArg } = await import('@yuantest/core');
      // 模拟 Windows 平台行为（测试环境为 Windows 时直接验证；否则按 POSIX 分支验证）
      const result = escapeShellArg('D:/my project/playwright.config.ts');
      if (process.platform === 'win32') {
        expect(result).toBe('"D:/my project/playwright.config.ts"');
      } else {
        expect(result).toBe("'D:/my project/playwright.config.ts'");
      }
    });

    it('Windows：无空格的普通参数不做多余包装', async () => {
      const { escapeShellArg } = await import('@yuantest/core');
      const result = escapeShellArg('specs/login.spec.ts');
      if (process.platform === 'win32') {
        expect(result).toBe('specs/login.spec.ts');
      } else {
        expect(result).toBe('specs/login.spec.ts');
      }
    });

    it('Windows：含空格的 --config 参数整体被引号包裹', async () => {
      const { escapeShellArg } = await import('@yuantest/core');
      const result = escapeShellArg('--config=D:/my project/playwright.config.ts');
      if (process.platform === 'win32') {
        expect(result).toBe('"--config=D:/my project/playwright.config.ts"');
      } else {
        expect(result).toBe("'--config=D:/my project/playwright.config.ts'");
      }
    });
  });
});
