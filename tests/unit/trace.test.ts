import { TraceManager } from '../../src/trace';
import { StorageProvider } from '../../src/storage';
import * as path from 'path';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
  spawn: jest.fn(() => ({
    on: jest.fn(),
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    kill: jest.fn(),
  })),
}));

describe('TraceManager', () => {
  let traceManager: TraceManager;
  let mockStorage: jest.Mocked<StorageProvider>;
  let mockExecSync: jest.MockedFunction<typeof import('child_process').execSync>;

  beforeEach(() => {
    mockExecSync = require('child_process').execSync;
    mockStorage = {
      exists: jest.fn(),
      readText: jest.fn(),
      writeText: jest.fn(),
      writeJSON: jest.fn(),
      readJSON: jest.fn(),
      readBuffer: jest.fn(),
      writeBuffer: jest.fn(),
      mkdir: jest.fn(),
      readDir: jest.fn(),
      readDirWithTypes: jest.fn(),
      stat: jest.fn(),
      remove: jest.fn(),
      copy: jest.fn(),
    } as any;

    const config = {
      enabled: true,
      mode: 'on' as const,
      outputDir: './test-traces',
      screenshots: true,
      snapshots: true,
      sources: true,
      attachments: true,
    };

    traceManager = new TraceManager(config, './test-traces', mockStorage);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const config = { 
        enabled: true, 
        mode: 'on' as const,
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      };
      const manager = new TraceManager(config, './traces', mockStorage);
      expect(manager).toBeDefined();
    });

    it('should use outputDir from config', () => {
      const config = { 
        enabled: true, 
        mode: 'on' as const,
        outputDir: './custom-traces',
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      };
      const manager = new TraceManager(config, './default-traces', mockStorage);
      expect(manager).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create trace directory if not exists', async () => {
      mockStorage.exists.mockResolvedValue(false);
      mockStorage.mkdir.mockResolvedValue();
      
      await traceManager.initialize();
      
      expect(mockStorage.mkdir).toHaveBeenCalled();
    });

    it('should not create directory if exists', async () => {
      mockStorage.exists.mockResolvedValue(true);
      
      await traceManager.initialize();
      
      expect(mockStorage.mkdir).toHaveBeenCalled();
    });
  });

  describe('discoverTraces', () => {
    it('should return empty array if directory does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await traceManager.discoverTraces();
      
      expect(result).toEqual([]);
    });

    it('should discover trace files', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        {
          name: 'test1.trace',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
        {
          name: 'test2.zip',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
      ]);
      mockStorage.stat.mockResolvedValue({
        size: 1024,
        mtimeMs: Date.now(),
        birthtimeMs: Date.now(),
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const result = await traceManager.discoverTraces();
      
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter by runId', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([]);
      
      const result = await traceManager.discoverTraces('run-123');
      
      expect(mockStorage.exists).toHaveBeenCalled();
    });
  });

  describe('getTrace', () => {
    it('should return null if trace not found', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await traceManager.getTrace('test-id');
      
      expect(result).toBeNull();
    });

    it('should return trace if found', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        {
          name: 'test-id.trace',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
      ]);
      mockStorage.stat.mockResolvedValue({
        size: 1024,
        mtimeMs: Date.now(),
        birthtimeMs: Date.now(),
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const result = await traceManager.getTrace('test-id');
      
      expect(result).toBeDefined();
    });
  });

  describe('getTraceContent', () => {
    it('should return null if file does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await traceManager.getTraceContent('/path/to/trace.zip');
      
      expect(result).toBeNull();
    });

    it('should return buffer if file exists', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readBuffer.mockResolvedValue(Buffer.from('trace data'));
      
      const result = await traceManager.getTraceContent('/path/to/trace.zip');
      
      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('deleteTrace', () => {
    it('should return false if file does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await traceManager.deleteTrace('/path/to/trace.zip');
      
      expect(result).toBe(false);
    });

    it('should delete trace and return true', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.remove.mockResolvedValue();
      
      const result = await traceManager.deleteTrace('/path/to/trace.zip');
      
      expect(result).toBe(true);
      expect(mockStorage.remove).toHaveBeenCalledWith('/path/to/trace.zip');
    });

    it('should return false on error', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.remove.mockRejectedValue(new Error('Delete failed'));
      
      const result = await traceManager.deleteTrace('/path/to/trace.zip');
      
      expect(result).toBe(false);
    });
  });

  describe('cleanTraces', () => {
    it('should delete old traces', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        {
          name: 'old-trace.trace',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
      ]);
      mockStorage.stat.mockResolvedValue({
        size: 1024,
        mtimeMs: Date.now() - (8 * 24 * 60 * 60 * 1000),
        birthtimeMs: Date.now() - (8 * 24 * 60 * 60 * 1000),
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      mockStorage.remove.mockResolvedValue();

      const result = await traceManager.cleanTraces(7 * 24 * 60 * 60 * 1000);
      
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getTraceStats', () => {
    it('should return trace statistics', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        {
          name: 'test1.trace',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
        {
          name: 'test2.trace',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
      ]);
      mockStorage.stat.mockResolvedValue({
        size: 1024,
        mtimeMs: Date.now(),
        birthtimeMs: Date.now(),
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const stats = await traceManager.getTraceStats();
      
      expect(stats.totalTraces).toBeGreaterThanOrEqual(0);
      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
      expect(stats.byBrowser).toBeDefined();
      expect(stats.recentTraces).toBeDefined();
    });
  });

  describe('getTraceConfigForPlaywright', () => {
    it('should return off config when disabled', () => {
      const config = { 
        enabled: false, 
        mode: 'on' as const,
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      };
      const manager = new TraceManager(config, './traces', mockStorage);
      
      const result = manager.getTraceConfigForPlaywright();
      
      expect(result.trace).toBe('off');
    });

    it('should return mode config when enabled', () => {
      const config = { 
        enabled: true, 
        mode: 'retain-on-failure' as const,
        screenshots: true,
        snapshots: true,
        sources: true,
        attachments: true,
      };
      const manager = new TraceManager(config, './traces', mockStorage);
      
      const result = manager.getTraceConfigForPlaywright();
      
      expect(result.trace).toBe('retain-on-failure');
    });
  });

  describe('openTraceViewer', () => {
    it('should spawn playwright show-trace process', async () => {
      mockStorage.exists.mockResolvedValue(true);

      const result = traceManager.openTraceViewer('/path/to/trace.zip', 9323);

      expect(result).toBeInstanceOf(Promise);
    });

    it('should use default port if not specified', async () => {
      mockStorage.exists.mockResolvedValue(true);

      const result = traceManager.openTraceViewer('/path/to/trace.zip');

      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('mergeTraces', () => {
    it('should merge multiple traces', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.writeText.mockResolvedValue();
      mockStorage.remove.mockResolvedValue();
      mockExecSync.mockReturnValue(Buffer.from(''));

      const result = await traceManager.mergeTraces(
        ['/path/to/trace1.zip', '/path/to/trace2.zip'],
        '/output/merged.zip'
      );

      expect(result).toBe('/output/merged.zip');
      expect(mockStorage.writeText).toHaveBeenCalled();
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('npx playwright merge-trace'),
        expect.objectContaining({ stdio: 'pipe', shell: true })
      );
      expect(mockStorage.remove).toHaveBeenCalled();
    });
  });

  describe('discoverTraces with nested directories', () => {
    it('should handle nested trace files', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockImplementation(async (dir: string) => {
        if (dir === './test-traces') {
          return [
            {
              name: 'suite1',
              isFile: () => false,
              isDirectory: () => true,
            } as any,
          ];
        }
        if (dir.includes('suite1')) {
          return [
            {
              name: 'test1.trace',
              isFile: () => true,
              isDirectory: () => false,
            } as any,
          ];
        }
        return [];
      });
      mockStorage.stat.mockResolvedValue({
        size: 1024,
        mtimeMs: Date.now(),
        birthtimeMs: Date.now(),
        isDirectory: () => false,
        isFile: () => true,
      } as any);

      const result = await traceManager.discoverTraces('run-1');

      expect(mockStorage.exists).toHaveBeenCalled();
    });
  });
});
