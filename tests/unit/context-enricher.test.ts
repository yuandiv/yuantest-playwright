import {
  buildEnvironmentInfo,
  readSourceCode,
  encodeScreenshot,
  buildHistoryContext,
  enrichContext,
  EnrichedContext,
} from '../../src/diagnosis/context-enricher';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * context-enricher 模块单元测试
 * 覆盖环境信息构建、源代码读取、截图编码、历史上下文构建和上下文富集主函数
 */
describe('context-enricher', () => {
  describe('buildEnvironmentInfo', () => {
    /** 应包含浏览器信息 */
    it('应包含浏览器信息', () => {
      const info = buildEnvironmentInfo({ browser: 'chromium' });
      expect(info).toContain('chromium');
    });

    /** 应包含操作系统信息 */
    it('应包含操作系统信息', () => {
      const info = buildEnvironmentInfo({});
      expect(info).toContain('OS:');
    });

    /** 应包含 Node.js 版本 */
    it('应包含 Node.js 版本', () => {
      const info = buildEnvironmentInfo({});
      expect(info).toContain('Node.js:');
    });

    /** 应在无浏览器信息时显示 unknown */
    it('应在无浏览器信息时显示 unknown', () => {
      const info = buildEnvironmentInfo({});
      expect(info).toContain('unknown');
    });

    /** 应包含工作目录信息 */
    it('应包含工作目录信息', () => {
      const info = buildEnvironmentInfo({});
      expect(info).toContain('CWD:');
    });

    /** 应正确显示 firefox 浏览器 */
    it('应正确显示 firefox 浏览器', () => {
      const info = buildEnvironmentInfo({ browser: 'firefox' });
      expect(info).toContain('firefox');
    });
  });

  describe('readSourceCode', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-enricher-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    /** 应读取存在的文件内容 */
    it('应读取存在的文件内容', async () => {
      const filePath = path.join(tmpDir, 'test.ts');
      fs.writeFileSync(filePath, 'const x = 1;\nconst y = 2;\n');
      const result = await readSourceCode(filePath);
      expect(result).toContain('const x = 1');
    });

    /** 应在指定行号处标记 >>> 前缀 */
    it('应在指定行号处标记 >>> 前缀', async () => {
      const filePath = path.join(tmpDir, 'test-line.ts');
      const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
      fs.writeFileSync(filePath, lines.join('\n'));
      const result = await readSourceCode(filePath, 25);
      expect(result).toContain('>>> 25 | line 25');
    });

    /** 文件不存在时应返回 undefined */
    it('文件不存在时应返回 undefined', async () => {
      const result = await readSourceCode(path.join(tmpDir, 'nonexistent.ts'));
      expect(result).toBeUndefined();
    });
  });

  describe('encodeScreenshot', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-screenshot-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    /** 空数组应返回 undefined */
    it('空数组应返回 undefined', async () => {
      const result = await encodeScreenshot([]);
      expect(result).toBeUndefined();
    });

    /** 文件不存在时应返回 undefined */
    it('文件不存在时应返回 undefined', async () => {
      const result = await encodeScreenshot([path.join(tmpDir, 'missing.png')]);
      expect(result).toBeUndefined();
    });

    /** 应正确编码存在的截图文件 */
    it('应正确编码存在的截图文件', async () => {
      const filePath = path.join(tmpDir, 'screenshot.png');
      fs.writeFileSync(filePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      const result = await encodeScreenshot([filePath]);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('buildHistoryContext', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-history-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    /** 无历史文件时应返回 undefined */
    it('无历史文件时应返回 undefined', async () => {
      const result = await buildHistoryContext('Test 1', tmpDir);
      expect(result).toBeUndefined();
    });

    /** 应返回匹配测试的历史上下文 */
    it('应返回匹配测试的历史上下文', async () => {
      const historyPath = path.join(tmpDir, 'history.json');
      const historyData = [
        { title: 'Test 1', status: 'passed', timestamp: Date.now() - 2000 },
        { title: 'Test 1', status: 'failed', error: 'Timeout', timestamp: Date.now() - 1000 },
        { title: 'Test 2', status: 'passed', timestamp: Date.now() },
      ];
      fs.writeFileSync(historyPath, JSON.stringify(historyData));
      const result = await buildHistoryContext('Test 1', tmpDir);
      expect(result).toContain('历史运行记录');
      expect(result).toContain('失败率');
    });

    /** 无匹配记录时应返回 undefined */
    it('无匹配记录时应返回 undefined', async () => {
      const historyPath = path.join(tmpDir, 'history.json');
      const historyData = [
        { title: 'Test A', status: 'passed', timestamp: Date.now() },
      ];
      fs.writeFileSync(historyPath, JSON.stringify(historyData));
      const result = await buildHistoryContext('Test B', tmpDir);
      expect(result).toBeUndefined();
    });
  });

  describe('enrichContext', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-enrich-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    /** 应返回包含环境信息的上下文对象 */
    it('应返回包含环境信息的上下文对象', async () => {
      const context = await enrichContext(
        { title: 'Test 1', error: 'some error', browser: 'chromium' },
        tmpDir
      );
      expect(context.environmentInfo).toContain('chromium');
      expect(context.contextUsed.environmentInfo).toBe(true);
    });

    /** 应正确标记未使用的上下文 */
    it('应正确标记未使用的上下文', async () => {
      const context = await enrichContext(
        { title: 'Test 1', error: 'some error' },
        tmpDir
      );
      expect(context.contextUsed.sourceCode).toBe(false);
      expect(context.contextUsed.screenshot).toBe(false);
      expect(context.contextUsed.consoleLogs).toBe(false);
      expect(context.contextUsed.stackTrace).toBe(false);
    });

    /** 有日志时应标记 consoleLogs 为 true */
    it('有日志时应标记 consoleLogs 为 true', async () => {
      const context = await enrichContext(
        { title: 'Test 1', error: 'some error', logs: ['log line 1', 'log line 2'] },
        tmpDir
      );
      expect(context.contextUsed.consoleLogs).toBe(true);
      expect(context.consoleLogs).toEqual(['log line 1', 'log line 2']);
    });

    /** 有堆栈跟踪时应标记 stackTrace 为 true */
    it('有堆栈跟踪时应标记 stackTrace 为 true', async () => {
      const context = await enrichContext(
        { title: 'Test 1', error: 'some error', stackTrace: 'at line 10' },
        tmpDir
      );
      expect(context.contextUsed.stackTrace).toBe(true);
      expect(context.stackTrace).toBe('at line 10');
    });
  });
});
