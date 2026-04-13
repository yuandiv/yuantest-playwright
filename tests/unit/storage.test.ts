import { MemoryStorage, FilesystemStorage, getStorage, setStorage } from '../../src/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => {
    storage.clear();
  });

  describe('basic operations', () => {
    it('should write and read text', async () => {
      await storage.writeText('/test/file.txt', 'hello world');
      const content = await storage.readText('/test/file.txt');
      expect(content).toBe('hello world');
    });

    it('should return null for non-existent file', async () => {
      const content = await storage.readText('/non-existent.txt');
      expect(content).toBeNull();
    });

    it('should write and read JSON', async () => {
      const data = { name: 'test', value: 42 };
      await storage.writeJSON('/test/data.json', data);
      const parsed = await storage.readJSON<typeof data>('/test/data.json');
      expect(parsed).toEqual(data);
    });

    it('should return null for invalid JSON', async () => {
      await storage.writeText('/test/invalid.json', 'not json');
      const parsed = await storage.readJSON('/test/invalid.json');
      expect(parsed).toBeNull();
    });

    it('should append text', async () => {
      await storage.writeText('/test/log.txt', 'line1\n');
      await storage.appendText('/test/log.txt', 'line2\n');
      const content = await storage.readText('/test/log.txt');
      expect(content).toBe('line1\nline2\n');
    });

    it('should overwrite existing file', async () => {
      await storage.writeText('/test/file.txt', 'original');
      await storage.writeText('/test/file.txt', 'updated');
      const content = await storage.readText('/test/file.txt');
      expect(content).toBe('updated');
    });
  });

  describe('directory operations', () => {
    it('should create directories', async () => {
      await storage.mkdir('/test/nested/dir');
      const exists = await storage.exists('/test/nested/dir');
      expect(exists).toBe(true);
    });

    it('should list directory contents', async () => {
      await storage.writeText('/test/a.txt', 'a');
      await storage.writeText('/test/b.txt', 'b');
      await storage.mkdir('/test/subdir');
      const files = await storage.readDir('/test');
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
      expect(files).toContain('subdir');
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await storage.readDir('/non-existent');
      expect(files).toEqual([]);
    });

    it('should return empty array for file path', async () => {
      await storage.writeText('/test/file.txt', 'content');
      const files = await storage.readDir('/test/file.txt');
      expect(files).toEqual([]);
    });

    it('should readDirWithTypes', async () => {
      await storage.writeText('/test/file.txt', 'content');
      await storage.mkdir('/test/dir');
      const entries = await storage.readDirWithTypes('/test');
      expect(entries.length).toBe(2);
      const file = entries.find(e => e.name === 'file.txt');
      const dir = entries.find(e => e.name === 'dir');
      expect(file?.isFile()).toBe(true);
      expect(dir?.isDirectory()).toBe(true);
    });
  });

  describe('file operations', () => {
    it('should check existence', async () => {
      await storage.writeText('/test/file.txt', 'content');
      expect(await storage.exists('/test/file.txt')).toBe(true);
      expect(await storage.exists('/test/non-existent.txt')).toBe(false);
    });

    it('should remove files', async () => {
      await storage.writeText('/test/file.txt', 'content');
      await storage.remove('/test/file.txt');
      expect(await storage.exists('/test/file.txt')).toBe(false);
    });

    it('should copy files', async () => {
      await storage.writeText('/test/src.txt', 'content');
      await storage.copy('/test/src.txt', '/test/dst.txt');
      expect(await storage.readText('/test/dst.txt')).toBe('content');
    });

    it('should not copy directories', async () => {
      await storage.mkdir('/test/dir');
      await storage.copy('/test/dir', '/test/dir2');
      expect(await storage.exists('/test/dir2')).toBe(false);
    });

    it('should return stat for files', async () => {
      await storage.writeText('/test/file.txt', 'hello');
      const stat = await storage.stat('/test/file.txt');
      expect(stat).not.toBeNull();
      expect(stat!.isFile()).toBe(true);
      expect(stat!.isDirectory()).toBe(false);
      expect(stat!.size).toBeGreaterThan(0);
    });

    it('should return stat for directories', async () => {
      await storage.mkdir('/test/dir');
      const stat = await storage.stat('/test/dir');
      expect(stat).not.toBeNull();
      expect(stat!.isDirectory()).toBe(true);
      expect(stat!.isFile()).toBe(false);
      expect(stat!.size).toBe(0);
    });

    it('should return null stat for non-existent path', async () => {
      const stat = await storage.stat('/non-existent');
      expect(stat).toBeNull();
    });
  });

  describe('path normalization', () => {
    it('should normalize backslashes to forward slashes', async () => {
      await storage.writeText('/test/sub/file.txt', 'content');
      expect(await storage.exists('/test/sub/file.txt')).toBe(true);
    });

    it('should handle trailing slashes in mkdir', async () => {
      await storage.mkdir('/test/dir');
      expect(await storage.exists('/test/dir')).toBe(true);
    });

    it('should handle double slashes', async () => {
      await storage.writeText('/test//file.txt', 'content');
      expect(await storage.exists('/test/file.txt')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all stored data', async () => {
      await storage.writeText('/test/a.txt', 'a');
      await storage.writeText('/test/b.txt', 'b');
      await storage.mkdir('/test/dir');
      storage.clear();
      expect(await storage.exists('/test/a.txt')).toBe(false);
      expect(await storage.exists('/test/b.txt')).toBe(false);
      expect(await storage.exists('/test/dir')).toBe(false);
    });
  });

  describe('auto-create parent directories', () => {
    it('should create parent dirs when writing text', async () => {
      await storage.writeText('/a/b/c/file.txt', 'deep');
      expect(await storage.exists('/a/b/c/file.txt')).toBe(true);
      expect(await storage.exists('/a/b/c')).toBe(true);
      expect(await storage.exists('/a/b')).toBe(true);
      expect(await storage.exists('/a')).toBe(true);
    });

    it('should create parent dirs when writing JSON', async () => {
      await storage.writeJSON('/x/y/data.json', { key: 'value' });
      expect(await storage.exists('/x/y/data.json')).toBe(true);
    });
  });

  describe('buffer operations', () => {
    it('should write and read buffer', async () => {
      const buffer = Buffer.from('binary data');
      await storage.writeBuffer('/test/binary.bin', buffer);
      const read = await storage.readBuffer('/test/binary.bin');
      expect(read).not.toBeNull();
      expect(read?.toString()).toBe('binary data');
    });

    it('should return null for non-existent buffer', async () => {
      const read = await storage.readBuffer('/non-existent.bin');
      expect(read).toBeNull();
    });
  });

  describe('removeDir', () => {
    it('should remove directory and its contents', async () => {
      await storage.writeText('/test/dir/file.txt', 'content');
      await storage.removeDir('/test/dir');
      expect(await storage.exists('/test/dir')).toBe(false);
      expect(await storage.exists('/test/dir/file.txt')).toBe(false);
    });

    it('should handle non-existent directory', async () => {
      await expect(storage.removeDir('/non-existent')).resolves.not.toThrow();
    });
  });
});

describe('FilesystemStorage', () => {
  let tmpDir: string;
  let storage: FilesystemStorage;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-storage-test-'));
    storage = new FilesystemStorage();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('basic operations', () => {
    it('should write and read text', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await storage.writeText(filePath, 'hello world');
      const content = await storage.readText(filePath);
      expect(content).toBe('hello world');
    });

    it('should return null for non-existent file', async () => {
      const content = await storage.readText(path.join(tmpDir, 'non-existent.txt'));
      expect(content).toBeNull();
    });

    it('should write and read JSON', async () => {
      const filePath = path.join(tmpDir, 'data.json');
      const data = { name: 'test', value: 42 };
      await storage.writeJSON(filePath, data);
      const parsed = await storage.readJSON<typeof data>(filePath);
      expect(parsed).toEqual(data);
    });

    it('should return null for invalid JSON', async () => {
      const filePath = path.join(tmpDir, 'invalid.json');
      fs.writeFileSync(filePath, 'not json', 'utf8');
      const parsed = await storage.readJSON(filePath);
      expect(parsed).toBeNull();
    });

    it('should append text', async () => {
      const filePath = path.join(tmpDir, 'log.txt');
      await storage.writeText(filePath, 'line1\n');
      await storage.appendText(filePath, 'line2\n');
      const content = await storage.readText(filePath);
      expect(content).toBe('line1\nline2\n');
    });
  });

  describe('directory operations', () => {
    it('should create directories', async () => {
      const dirPath = path.join(tmpDir, 'nested', 'dir');
      await storage.mkdir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(true);
    });

    it('should list directory contents', async () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'b');
      fs.mkdirSync(path.join(tmpDir, 'subdir'));

      const files = await storage.readDir(tmpDir);
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
      expect(files).toContain('subdir');
    });

    it('should return empty array for non-existent directory', async () => {
      const files = await storage.readDir(path.join(tmpDir, 'non-existent'));
      expect(files).toEqual([]);
    });

    it('should readDirWithTypes', async () => {
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'content');
      fs.mkdirSync(path.join(tmpDir, 'dir'));

      const entries = await storage.readDirWithTypes(tmpDir);
      expect(entries.length).toBe(2);
      const file = entries.find(e => e.name === 'file.txt');
      const dir = entries.find(e => e.name === 'dir');
      expect(file?.isFile()).toBe(true);
      expect(dir?.isDirectory()).toBe(true);
    });
  });

  describe('file operations', () => {
    it('should check existence', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      expect(await storage.exists(filePath)).toBe(true);
      expect(await storage.exists(path.join(tmpDir, 'non-existent.txt'))).toBe(false);
    });

    it('should remove files', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');
      await storage.remove(filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should copy files', async () => {
      const srcPath = path.join(tmpDir, 'src.txt');
      const dstPath = path.join(tmpDir, 'dst.txt');
      fs.writeFileSync(srcPath, 'content');
      await storage.copy(srcPath, dstPath);
      expect(fs.readFileSync(dstPath, 'utf8')).toBe('content');
    });

    it('should return stat for files', async () => {
      const filePath = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(filePath, 'hello');
      const stat = await storage.stat(filePath);
      expect(stat).not.toBeNull();
      expect(stat!.isFile()).toBe(true);
      expect(stat!.size).toBeGreaterThan(0);
    });

    it('should return stat for directories', async () => {
      const dirPath = path.join(tmpDir, 'dir');
      fs.mkdirSync(dirPath);
      const stat = await storage.stat(dirPath);
      expect(stat).not.toBeNull();
      expect(stat!.isDirectory()).toBe(true);
    });

    it('should return null stat for non-existent path', async () => {
      const stat = await storage.stat(path.join(tmpDir, 'non-existent'));
      expect(stat).toBeNull();
    });
  });

  describe('buffer operations', () => {
    it('should write and read buffer', async () => {
      const filePath = path.join(tmpDir, 'binary.bin');
      const buffer = Buffer.from('binary data');
      await storage.writeBuffer(filePath, buffer);
      const read = await storage.readBuffer(filePath);
      expect(read).not.toBeNull();
      expect(read?.toString()).toBe('binary data');
    });
  });

  describe('removeDir', () => {
    it('should remove directory and its contents', async () => {
      const dirPath = path.join(tmpDir, 'dir');
      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(path.join(dirPath, 'file.txt'), 'content');

      await storage.removeDir(dirPath);
      expect(fs.existsSync(dirPath)).toBe(false);
    });
  });
});

describe('Storage Provider', () => {
  it('should get default storage', () => {
    const storage = getStorage();
    expect(storage).toBeDefined();
  });

  it('should set custom storage', () => {
    const customStorage = new MemoryStorage();
    setStorage(customStorage);
    expect(getStorage()).toBe(customStorage);
  });
});
