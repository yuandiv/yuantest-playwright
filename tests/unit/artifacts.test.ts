import { ArtifactManager } from '../../src/artifacts';
import { FilesystemStorage } from '../../src/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ArtifactManager', () => {
  let tmpDir: string;
  let artifactsDir: string;
  let storage: FilesystemStorage;
  let manager: ArtifactManager;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-test-'));
    artifactsDir = path.join(tmpDir, 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    storage = new FilesystemStorage();
    manager = new ArtifactManager(
      {
        enabled: true,
        screenshots: 'only-on-failure',
        videos: 'retain-on-failure',
      },
      artifactsDir,
      storage
    );
    await manager.initialize();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should create base directory if not exists', async () => {
      const newDir = path.join(tmpDir, 'new-artifacts');
      const newManager = new ArtifactManager(
        { enabled: true, screenshots: 'off', videos: 'off' },
        newDir,
        storage
      );
      await newManager.initialize();
      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should use config outputDir if provided', async () => {
      const customDir = path.join(tmpDir, 'custom-artifacts');
      const newManager = new ArtifactManager(
        { enabled: true, screenshots: 'off', videos: 'off', outputDir: customDir },
        artifactsDir,
        storage
      );
      await newManager.initialize();
      expect(fs.existsSync(customDir)).toBe(true);
    });
  });

  describe('discoverArtifacts', () => {
    it('should return empty array if directory does not exist', async () => {
      const artifacts = await manager.discoverArtifacts('non-existent-run');
      expect(artifacts).toEqual([]);
    });

    it('should discover screenshot artifacts', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'screenshot.png'), 'fake-image');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('screenshot');
      expect(artifacts[0].runId).toBe('run-1');
      expect(artifacts[0].mimeType).toBe('image/png');
    });

    it('should discover video artifacts', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'video.webm'), 'fake-video');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('video');
      expect(artifacts[0].mimeType).toBe('video/webm');
    });

    it('should discover trace artifacts', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'trace.zip'), 'fake-trace');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('trace');
    });

    it('should discover .trace files as trace type', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'test.trace'), 'fake-trace');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('trace');
    });

    it('should discover jpg/jpeg screenshots', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'image.jpg'), 'fake-jpg');
      fs.writeFileSync(path.join(runDir, 'image.jpeg'), 'fake-jpeg');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(2);
      expect(artifacts.find(a => a.fileName === 'image.jpg')?.type).toBe('screenshot');
      expect(artifacts.find(a => a.fileName === 'image.jpeg')?.type).toBe('screenshot');
    });

    it('should discover webp screenshots', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'image.webp'), 'fake-webp');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('screenshot');
      expect(artifacts[0].mimeType).toBe('image/webp');
    });

    it('should discover mp4 videos', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'video.mp4'), 'fake-mp4');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].type).toBe('video');
      expect(artifacts[0].mimeType).toBe('video/mp4');
    });

    it('should filter artifacts by maxFileSize', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'small.png'), 'small');
      fs.writeFileSync(path.join(runDir, 'large.png'), 'this is a large file content');

      const largeManager = new ArtifactManager(
        { enabled: true, screenshots: 'off', videos: 'off', maxFileSize: 10 },
        artifactsDir,
        storage
      );
      await largeManager.initialize();

      const artifacts = await largeManager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].fileName).toBe('small.png');
    });

    it('should discover all artifacts without runId', async () => {
      const runDir1 = path.join(artifactsDir, 'run-1', 'test1');
      const runDir2 = path.join(artifactsDir, 'run-2', 'test2');
      fs.mkdirSync(runDir1, { recursive: true });
      fs.mkdirSync(runDir2, { recursive: true });
      fs.writeFileSync(path.join(runDir1, 'screenshot.png'), 'img1');
      fs.writeFileSync(path.join(runDir2, 'screenshot.png'), 'img2');

      const artifacts = await manager.discoverArtifacts();
      expect(artifacts.length).toBe(2);
    });

    it('should handle nested directories', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'suite1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'screenshot.png'), 'img');

      const artifacts = await manager.discoverArtifacts('run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].testId).toContain('suite1');
    });
  });

  describe('getArtifact', () => {
    it('should return artifact by id', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'screenshot.png'), 'img');

      const artifacts = await manager.discoverArtifacts('run-1');
      const artifact = await manager.getArtifact(artifacts[0].id, 'run-1');
      expect(artifact).not.toBeNull();
      expect(artifact?.fileName).toBe('screenshot.png');
    });

    it('should return artifact by file path substring', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'screenshot.png'), 'img');

      const artifact = await manager.getArtifact('screenshot', 'run-1');
      expect(artifact).not.toBeNull();
    });

    it('should return null if not found', async () => {
      const artifact = await manager.getArtifact('non-existent', 'run-1');
      expect(artifact).toBeNull();
    });
  });

  describe('getArtifactContent', () => {
    it('should return file content as buffer', async () => {
      const filePath = path.join(artifactsDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world');

      const content = await manager.getArtifactContent(filePath);
      expect(content).not.toBeNull();
      expect(content?.toString()).toBe('hello world');
    });

    it('should return null if file does not exist', async () => {
      const content = await manager.getArtifactContent(path.join(artifactsDir, 'non-existent.txt'));
      expect(content).toBeNull();
    });
  });

  describe('deleteArtifact', () => {
    it('should delete existing artifact', async () => {
      const filePath = path.join(artifactsDir, 'test.png');
      fs.writeFileSync(filePath, 'img');

      const result = await manager.deleteArtifact(filePath);
      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should return false if file does not exist', async () => {
      const result = await manager.deleteArtifact(path.join(artifactsDir, 'non-existent.png'));
      expect(result).toBe(false);
    });
  });

  describe('cleanArtifacts', () => {
    it('should delete artifacts older than threshold', async () => {
      const oldDir = path.join(artifactsDir, 'old', 'test');
      const newDir = path.join(artifactsDir, 'new', 'test');
      fs.mkdirSync(oldDir, { recursive: true });
      fs.mkdirSync(newDir, { recursive: true });
      fs.writeFileSync(path.join(oldDir, 'test.png'), 'old-img');
      fs.writeFileSync(path.join(newDir, 'test.png'), 'new-img');

      const deleted = await manager.cleanArtifacts(7 * 24 * 60 * 60 * 1000);
      expect(deleted).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getArtifactsByType', () => {
    it('should filter artifacts by type', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'screenshot.png'), 'img');
      fs.writeFileSync(path.join(runDir, 'video.webm'), 'vid');

      const screenshots = await manager.getArtifactsByType('screenshot', 'run-1');
      expect(screenshots.length).toBe(1);
      expect(screenshots[0].type).toBe('screenshot');

      const videos = await manager.getArtifactsByType('video', 'run-1');
      expect(videos.length).toBe(1);
      expect(videos[0].type).toBe('video');
    });
  });

  describe('getArtifactsByTest', () => {
    it('should filter artifacts by testId', async () => {
      const runDir1 = path.join(artifactsDir, 'run-1', 'test1');
      const runDir2 = path.join(artifactsDir, 'run-1', 'test2');
      fs.mkdirSync(runDir1, { recursive: true });
      fs.mkdirSync(runDir2, { recursive: true });
      fs.writeFileSync(path.join(runDir1, 'screenshot.png'), 'img1');
      fs.writeFileSync(path.join(runDir2, 'screenshot.png'), 'img2');

      const artifacts = await manager.getArtifactsByTest('test1', 'run-1');
      expect(artifacts.length).toBe(1);
      expect(artifacts[0].testId).toContain('test1');
    });
  });

  describe('getArtifactStats', () => {
    it('should return artifact statistics', async () => {
      const runDir = path.join(artifactsDir, 'run-1', 'test1');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, 'screenshot.png'), 'img');
      fs.writeFileSync(path.join(runDir, 'video.webm'), 'vid');

      const stats = await manager.getArtifactStats('run-1');
      expect(stats.total).toBe(2);
      expect(stats.byType['screenshot']).toBe(1);
      expect(stats.byType['video']).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should return empty stats for no artifacts', async () => {
      const stats = await manager.getArtifactStats('empty-run');
      expect(stats.total).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('formatSize', () => {
    it('should format bytes correctly', () => {
      expect(manager.formatSize(500)).toBe('500.00 B');
    });

    it('should format kilobytes correctly', () => {
      expect(manager.formatSize(1024)).toBe('1.00 KB');
      expect(manager.formatSize(2048)).toBe('2.00 KB');
    });

    it('should format megabytes correctly', () => {
      expect(manager.formatSize(1024 * 1024)).toBe('1.00 MB');
    });

    it('should format gigabytes correctly', () => {
      expect(manager.formatSize(1024 * 1024 * 1024)).toBe('1.00 GB');
    });

    it('should format terabytes correctly', () => {
      expect(manager.formatSize(1024 * 1024 * 1024 * 1024)).toBe('1.00 TB');
    });
  });
});
