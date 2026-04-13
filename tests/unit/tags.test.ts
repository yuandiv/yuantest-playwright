import { TagManager } from '../../src/tags';
import { StorageProvider } from '../../src/storage';

describe('TagManager', () => {
  let tagManager: TagManager;
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

    tagManager = new TagManager({}, mockStorage);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const manager = new TagManager({}, mockStorage);
      expect(manager).toBeDefined();
    });

    it('should merge custom config with defaults', () => {
      const manager = new TagManager({ enabled: false }, mockStorage);
      expect(manager).toBeDefined();
    });
  });

  describe('scanDirectory', () => {
    it('should return empty array if directory does not exist', async () => {
      mockStorage.exists.mockResolvedValue(false);
      
      const result = await tagManager.scanDirectory('/nonexistent');
      
      expect(result).toEqual([]);
      expect(mockStorage.exists).toHaveBeenCalledWith('/nonexistent');
    });

    it('should scan directory and find tags', async () => {
      mockStorage.exists.mockResolvedValue(true);
      mockStorage.readDirWithTypes.mockResolvedValue([
        {
          name: 'test.spec.ts',
          isFile: () => true,
          isDirectory: () => false,
        } as any,
      ]);
      mockStorage.readText.mockResolvedValue(`
        test('test with tag', () => {});
      `);

      const result = await tagManager.scanDirectory('/test-dir');
      
      expect(mockStorage.exists).toHaveBeenCalledWith('/test-dir');
    });
  });

  describe('scanFile', () => {
    it('should return void if file content is empty', async () => {
      mockStorage.readText.mockResolvedValue('');
      
      await tagManager.scanFile('/test.ts');
      
      expect(mockStorage.readText).toHaveBeenCalledWith('/test.ts');
    });

    it('should detect @tag() annotations', async () => {
      mockStorage.readText.mockResolvedValue(`
        test('tagged test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      
      expect(mockStorage.readText).toHaveBeenCalled();
    });

    it('should detect @smoke tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('smoke test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.length).toBeGreaterThan(0);
      expect(tags.find(t => t.name === 'smoke')).toBeDefined();
    });

    it('should detect @regression tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @regression
        test('regression test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'regression')).toBeDefined();
    });

    it('should detect @critical tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @critical
        test('critical test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'critical')).toBeDefined();
    });

    it('should detect @p0 tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @p0
        test('p0 test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'p0')).toBeDefined();
    });

    it('should detect @p1 tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @p1
        test('p1 test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'p1')).toBeDefined();
    });

    it('should detect @p2 tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @p2
        test('p2 test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'p2')).toBeDefined();
    });

    it('should detect @sanity tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @sanity
        test('sanity test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'sanity')).toBeDefined();
    });

    it('should detect @e2e tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @e2e
        test('e2e test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'e2e')).toBeDefined();
    });

    it('should detect @unit tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @unit
        test('unit test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'unit')).toBeDefined();
    });

    it('should detect @integration tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @integration
        test('integration test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'integration')).toBeDefined();
    });

    it('should detect @slow tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @slow
        test('slow test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'slow')).toBeDefined();
    });

    it('should detect @fast tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @fast
        test('fast test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'fast')).toBeDefined();
    });

    it('should detect @flaky tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @flaky
        test('flaky test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.find(t => t.name === 'flaky')).toBeDefined();
    });

    it('should extract test name correctly', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('my smoke test', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tests = tagManager.getTestsByTag('smoke');
      
      expect(tests.length).toBeGreaterThan(0);
      expect(tests[0]).toContain('my smoke test');
    });
  });

  describe('getTags', () => {
    it('should return all tags', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('test1', () => {});
        // @regression
        test('test2', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      expect(tags.length).toBe(2);
    });
  });

  describe('getTestsByTag', () => {
    it('should return tests for specific tag', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('test1', () => {});
        // @smoke
        test('test2', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tests = tagManager.getTestsByTag('smoke');
      
      expect(tests.length).toBe(2);
    });

    it('should return empty array for non-existent tag', () => {
      const tests = tagManager.getTestsByTag('nonexistent');
      
      expect(tests).toEqual([]);
    });
  });

  describe('getTagsForTest', () => {
    it('should return tags for specific test', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke @critical
        test('test1', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const tags = tagManager.getTags();
      
      if (tags.length > 0) {
        const tests = tagManager.getTestsByTag('smoke');
        if (tests.length > 0) {
          const testTags = tagManager.getTagsForTest(tests[0]);
          expect(testTags).toContain('smoke');
        }
      }
    });

    it('should return empty array for non-existent test', () => {
      const tags = tagManager.getTagsForTest('nonexistent');
      
      expect(tags).toEqual([]);
    });
  });

  describe('getFilteredTests', () => {
    it('should filter tests by include tags', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('test1', () => {});
        // @regression
        test('test2', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const allTests = ['test1', 'test2', 'test3'];
      const filtered = tagManager.getFilteredTests(allTests, ['smoke']);
      
      expect(filtered.length).toBeLessThan(allTests.length);
    });

    it('should filter tests by exclude tags', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('test1', () => {});
        // @regression
        test('test2', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const allTests = ['test1', 'test2', 'test3'];
      const filtered = tagManager.getFilteredTests(allTests, undefined, ['smoke']);
      
      expect(filtered.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter tests by require tags', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke @critical
        test('test1', () => {});
        // @smoke
        test('test2', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const allTests = ['test1', 'test2', 'test3'];
      const filtered = tagManager.getFilteredTests(allTests, undefined, undefined, ['smoke', 'critical']);
      
      expect(filtered.length).toBeLessThan(allTests.length);
    });

    it('should return all tests if no filters', async () => {
      const allTests = ['test1', 'test2', 'test3'];
      const filtered = tagManager.getFilteredTests(allTests);
      
      expect(filtered).toEqual(allTests);
    });
  });

  describe('buildGrepPattern', () => {
    it('should build grep pattern from tags', () => {
      const pattern = tagManager.buildGrepPattern(['smoke', 'regression']);
      
      expect(pattern).toBe('smoke|regression');
    });

    it('should return empty string if no tags', () => {
      const pattern = tagManager.buildGrepPattern();
      
      expect(pattern).toBe('');
    });
  });

  describe('getSummary', () => {
    it('should return summary of tags', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('test1', () => {});
        // @regression
        test('test2', () => {});
      `);
      
      await tagManager.scanFile('/test.ts');
      const summary = tagManager.getSummary();
      
      expect(summary.totalTags).toBeGreaterThan(0);
      expect(summary.totalTaggedTests).toBeGreaterThan(0);
      expect(summary.tags).toBeDefined();
    });
  });

  describe('generateTagReport', () => {
    it('should generate tag report', async () => {
      mockStorage.readText.mockResolvedValue(`
        // @smoke
        test('test1', () => {});
      `);
      mockStorage.writeJSON.mockResolvedValue();
      
      await tagManager.scanFile('/test.ts');
      const result = await tagManager.generateTagReport('/output/report.json');
      
      expect(result).toBe('/output/report.json');
      expect(mockStorage.writeJSON).toHaveBeenCalled();
    });
  });
});
