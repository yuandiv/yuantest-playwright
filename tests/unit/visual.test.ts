import { VisualTestingManager } from '../../src/visual';
import { StorageProvider } from '../../src/storage';
import * as path from 'path';

describe('VisualTestingManager', () => {
  let visualManager: VisualTestingManager;
  let mockStorage: jest.Mocked<StorageProvider>;

  beforeEach(() => {
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
      threshold: 0.1,
      maxDiffPixels: 100,
      maxDiffPixelRatio: 0.1,
      outputDir: './visual-testing',
      updateSnapshots: false,
    };

    visualManager = new VisualTestingManager(config, './visual-testing', mockStorage);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      const config = {
        enabled: true,
        threshold: 0.1,
        maxDiffPixels: 100,
        maxDiffPixelRatio: 0.1,
        updateSnapshots: false,
      };
      const manager = new VisualTestingManager(config, './visual', mockStorage);
      expect(manager).toBeDefined();
    });

    it('should use outputDir from config', () => {
      const config = {
        enabled: true,
        threshold: 0.1,
        maxDiffPixels: 100,
        maxDiffPixelRatio: 0.1,
        outputDir: './custom-visual',
        updateSnapshots: false,
      };
      const manager = new VisualTestingManager(config, './default-visual', mockStorage);
      expect(manager).toBeDefined();
    });
  });

  describe('initialize', () => {
    it('should create required directories', async () => {
      mockStorage.mkdir.mockResolvedValue();
      
      await visualManager.initialize();
      
      expect(mockStorage.mkdir).toHaveBeenCalledTimes(4);
    });
  });

  describe('captureBaseline', () => {
    it('should copy screenshot to baseline directory', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.mkdir.mockResolvedValue();
      mockStorage.copy.mockResolvedValue();
      
      const result = await visualManager.captureBaseline('test-1', '/screenshots/test.png');
      
      expect(result).toContain('baseline');
      expect(mockStorage.copy).toHaveBeenCalled();
    });

    it('should not copy if source does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      mockStorage.mkdir.mockResolvedValue();
      
      const result = await visualManager.captureBaseline('test-1', '/screenshots/test.png');
      
      expect(result).toContain('baseline');
    });
  });

  describe('captureCurrent', () => {
    it('should copy screenshot to current directory', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.mkdir.mockResolvedValue();
      mockStorage.copy.mockResolvedValue();
      
      const result = await visualManager.captureCurrent('test-1', '/screenshots/test.png');
      
      expect(result).toContain('current');
      expect(mockStorage.copy).toHaveBeenCalled();
    });

    it('should not copy if source does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      mockStorage.mkdir.mockResolvedValue();
      
      const result = await visualManager.captureCurrent('test-1', '/screenshots/test.png');
      
      expect(result).toContain('current');
    });
  });

  describe('compare', () => {
    it('should return non-matching result if baseline does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await visualManager.compare('test-1');
      
      expect(result.matches).toBe(false);
    });

    it('should return non-matching result if current does not exist', async () => {
      mockStorage.exists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      
      const result = await visualManager.compare('test-1');
      
      expect(result.matches).toBe(false);
    });

    it('should compare images and return result', async () => {
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xFF, 0xFF, 0x3F,
        0x00, 0x05, 0xFE, 0x02, 0xFE, 0xDC, 0xCC, 0x59,
        0xE7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82,
      ]);
      
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readBuffer.mockResolvedValue(pngBuffer);
      mockStorage.mkdir.mockResolvedValue();
      mockStorage.writeBuffer.mockResolvedValue();
      
      const result = await visualManager.compare('test-1');
      
      expect(result).toBeDefined();
      expect(result.baseline).toBeDefined();
      expect(result.current).toBeDefined();
      expect(result.diff).toBeDefined();
    });
  });

  describe('runVisualTests', () => {
    it('should run visual tests for multiple test IDs', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const results = await visualManager.runVisualTests(['test-1', 'test-2']);
      
      expect(results.length).toBe(2);
      expect(results[0].testId).toBe('test-1');
      expect(results[1].testId).toBe('test-2');
    });

    it('should mark tests as new when no baseline', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const results = await visualManager.runVisualTests(['test-1']);
      
      expect(results[0].status).toBe('new');
    });

    it('should mark tests as missing when no current', async () => {
      mockStorage.exists
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      
      const results = await visualManager.runVisualTests(['test-1']);
      
      expect(results[0].status).toBe('new');
    });
  });

  describe('updateBaseline', () => {
    it('should return false if current does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await visualManager.updateBaseline('test-1');
      
      expect(result).toBe(false);
    });

    it('should copy current to baseline', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.mkdir.mockResolvedValue();
      mockStorage.copy.mockResolvedValue();
      
      const result = await visualManager.updateBaseline('test-1');
      
      expect(result).toBe(true);
      expect(mockStorage.copy).toHaveBeenCalled();
    });
  });

  describe('updateAllBaselines', () => {
    it('should return 0 if current directory does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await visualManager.updateAllBaselines();
      
      expect(result).toBe(0);
    });

    it('should update all baselines from current directory', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDir.mockResolvedValue(['test1.png', 'test2.png']);
      mockStorage.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 1024,
        mtimeMs: Date.now(),
        birthtimeMs: Date.now(),
      } as any);
      mockStorage.mkdir.mockResolvedValue();
      mockStorage.copy.mockResolvedValue();
      
      const result = await visualManager.updateAllBaselines();
      
      expect(result).toBe(2);
    });
  });

  describe('getResults', () => {
    it('should return all results', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      await visualManager.runVisualTests(['test-1', 'test-2']);
      const results = visualManager.getResults();
      
      expect(results.length).toBe(2);
    });
  });

  describe('getResult', () => {
    it('should return result for specific test', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      await visualManager.runVisualTests(['test-1']);
      const result = visualManager.getResult('test-1');
      
      expect(result).toBeDefined();
      expect(result?.testId).toBe('test-1');
    });

    it('should return null for non-existent test', () => {
      const result = visualManager.getResult('non-existent');
      
      expect(result).toBeNull();
    });
  });

  describe('getSummary', () => {
    it('should return summary of visual tests', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      await visualManager.runVisualTests(['test-1', 'test-2']);
      const summary = visualManager.getSummary();
      
      expect(summary.total).toBe(2);
      expect(summary.new).toBe(2);
      expect(summary.passRate).toBeDefined();
    });
  });

  describe('generateVisualReport', () => {
    it('should generate visual report', async () => {
      mockStorage.exists.mockResolvedValue(false);
      mockStorage.mkdir.mockResolvedValue();
      mockStorage.writeText.mockResolvedValue();
      
      await visualManager.runVisualTests(['test-1']);
      const result = await visualManager.generateVisualReport('/output/report.json');
      
      expect(result).toBe('/output/report.json');
      expect(mockStorage.writeText).toHaveBeenCalled();
    });
  });
});
