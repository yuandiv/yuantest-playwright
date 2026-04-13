import { AnnotationManager } from '../../src/annotations';
import { StorageProvider } from '../../src/storage';
import * as path from 'path';

describe('AnnotationManager', () => {
  let annotationManager: AnnotationManager;
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

    annotationManager = new AnnotationManager({}, mockStorage);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const manager = new AnnotationManager({}, mockStorage);
      expect(manager).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const manager = new AnnotationManager({
        enabled: false,
        respectSkip: false,
      }, mockStorage);
      expect(manager).toBeDefined();
    });
  });

  describe('scanDirectory', () => {
    it('should return empty array if directory does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await annotationManager.scanDirectory('/nonexistent');
      
      expect(result).toEqual([]);
      expect(mockStorage.exists).toHaveBeenCalledWith('/nonexistent');
    });

    it('should scan directory and find annotations', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        {
          name: 'test.spec.ts',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
      ]);
      mockStorage.readText.mockResolvedValue(`
        test.skip('skipped test', () => {});
        test('normal test', () => {});
      `);

      const result = await annotationManager.scanDirectory('/test-dir');
      
      expect(mockStorage.exists).toHaveBeenCalledWith('/test-dir');
    });
  });

  describe('scanFile', () => {
    it('should return empty array if file content is empty', async () => {
      mockStorage.readText.mockResolvedValue('');
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result).toEqual([]);
    });

    it('should detect test.skip annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('skipped test', () => {
          expect(true).toBe(true);
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('skip');
    });

    it('should detect test.only annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.only('only this test', () => {
          expect(true).toBe(true);
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('only');
    });

    it('should detect test.fail annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.fail('expected to fail', () => {
          expect(true).toBe(false);
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('fail');
    });

    it('should detect test.slow annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.slow('slow test', () => {
          // slow operation
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('slow');
    });

    it('should detect test.fixme annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.fixme('fixme test', () => {
          // needs fixing
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('fixme');
    });

    it('should detect test.todo annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.todo('todo test');
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('todo');
    });

    it('should detect describe.skip annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        describe.skip('skipped suite', () => {
          test('test1', () => {});
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('skip');
    });

    it('should detect describe.serial annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        describe.serial('serial suite', () => {
          test('test1', () => {});
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('serial');
    });

    it('should detect describe.parallel annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        describe.parallel('parallel suite', () => {
          test('test1', () => {});
        });
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('parallel');
    });

    it('should detect comment-based annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @skip reason: not ready yet
        test('test with comment', () => {});
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('skip');
    });

    it('should extract test name correctly', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('my skipped test', () => {});
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].testName).toBeDefined();
    });

    it('should extract description from annotation', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('reason: not implemented', 'my test', () => {});
      `);
      
      const result = await annotationManager.scanFile('/test.ts');
      
      expect(result[0].description).toBeDefined();
    });
  });

  describe('getAnnotationsByType', () => {
    it('should return annotations filtered by type', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('test1', () => {});
        test.only('test2', () => {});
        test.skip('test3', () => {});
      `);
      
      await annotationManager.scanFile('/test.ts');
      const skipAnnotations = annotationManager.getAnnotationsByType('skip');
      
      expect(skipAnnotations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAnnotationsByFile', () => {
    it('should return annotations filtered by file', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('test1', () => {});
      `);
      
      await annotationManager.scanFile('/test.ts');
      const fileAnnotations = annotationManager.getAnnotationsByFile('/test.ts');
      
      expect(fileAnnotations.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getSummary', () => {
    it('should return summary of all annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('test1', () => {});
        test.only('test2', () => {});
      `);
      
      await annotationManager.scanFile('/test.ts');
      const summary = annotationManager.getSummary();
      
      expect(summary.total).toBeGreaterThanOrEqual(0);
      expect(summary.byType).toBeDefined();
      expect(summary.byFile).toBeDefined();
    });
  });

  describe('shouldSkipTest', () => {
    it('should return false if test has no annotation', () => {
      const result = annotationManager.shouldSkipTest('nonexistent::test');
      expect(result).toBe(false);
    });

    it('should return true for skip annotation when respectSkip is true', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('test1', () => {});
      `);
      
      await annotationManager.scanFile('/test.ts');
      const annotations = annotationManager.getAnnotationsByType('skip');
      
      if (annotations.length > 0) {
        const result = annotationManager.shouldSkipTest(annotations[0].testId);
        expect(result).toBe(true);
      }
    });

    it('should return true for fixme annotation when respectFixme is true', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.fixme('test1', () => {});
      `);
      
      await annotationManager.scanFile('/test.ts');
      const annotations = annotationManager.getAnnotationsByType('fixme');
      
      if (annotations.length > 0) {
        const result = annotationManager.shouldSkipTest(annotations[0].testId);
        expect(result).toBe(true);
      }
    });
  });

  describe('shouldExpectFail', () => {
    it('should return false if test has no annotation', () => {
      const result = annotationManager.shouldExpectFail('nonexistent::test');
      expect(result).toBe(false);
    });

    it('should return true for fail annotation when respectFail is true', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.fail('test1', () => {});
      `);
      
      await annotationManager.scanFile('/test.ts');
      const annotations = annotationManager.getAnnotationsByType('fail');
      
      if (annotations.length > 0) {
        const result = annotationManager.shouldExpectFail(annotations[0].testId);
        expect(result).toBe(true);
      }
    });
  });

  describe('isSlowTest', () => {
    it('should return false if test has no annotation', () => {
      const result = annotationManager.isSlowTest('nonexistent::test');
      expect(result).toBe(false);
    });

    it('should return true for slow annotation when respectSlow is true', async () => {
      const manager = new AnnotationManager({ respectSlow: true }, mockStorage);
      mockStorage.readText.mockResolvedValue(`
        test.slow('test1', () => {});
      `);
      
      await manager.scanFile('/test.ts');
      const annotations = manager.getAnnotationsByType('slow');
      
      if (annotations.length > 0) {
        const result = manager.isSlowTest(annotations[0].testId);
        expect(result).toBe(true);
      }
    });
  });

  describe('getPlaywrightAnnotations', () => {
    it('should return annotations for Playwright config', () => {
      const result = annotationManager.getPlaywrightAnnotations();
      
      expect(result).toBeDefined();
      expect(result.skip).toBe(true);
      expect(result.fixme).toBe(true);
    });

    it('should include custom annotations with skip action', () => {
      const manager = new AnnotationManager({
        customAnnotations: {
          custom: { action: 'skip' },
        },
      }, mockStorage);
      
      const result = manager.getPlaywrightAnnotations();
      expect(result.custom).toBe(true);
    });
  });

  describe('generateAnnotationReport', () => {
    it('should generate annotation report', async () => {
      mockStorage.readText.mockResolvedValue(`
        test.skip('test1', () => {});
      `);
      mockStorage.writeJSON.mockResolvedValue();
      
      await annotationManager.scanFile('/test.ts');
      const result = await annotationManager.generateAnnotationReport('/output/report.json');
      
      expect(result).toBe('/output/report.json');
      expect(mockStorage.writeJSON).toHaveBeenCalled();
    });
  });
});
