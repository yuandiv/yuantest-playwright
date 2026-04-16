import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { BaseManager } from '../base';
import { ArtifactConfig, Artifact, ArtifactType, BrowserType } from '../types';
import { StorageProvider, getStorage } from '../storage';

export class ArtifactManager extends BaseManager {
  private config: ArtifactConfig;
  private baseDir: string;
  private storage: StorageProvider;
  private artifacts: Artifact[] = [];

  constructor(
    config: ArtifactConfig,
    baseDir: string,
    storage?: StorageProvider
  ) {
    super();
    this.config = config;
    this.baseDir = config.outputDir || baseDir;
    this.storage = storage || getStorage();
  }

  protected async doInitialize(): Promise<void> {
    if (!(await this.storage.exists(this.baseDir))) {
      await this.storage.mkdir(this.baseDir);
    }
  }

  async discoverArtifacts(runId?: string): Promise<Artifact[]> {
    await this.ready();
    this.artifacts = [];

    const searchDir = runId ? path.join(this.baseDir, runId) : this.baseDir;

    if (!(await this.storage.exists(searchDir))) {
      return [];
    }

    await this.scanDirectory(searchDir, runId);
    return this.artifacts;
  }

  private async scanDirectory(dir: string, runId?: string): Promise<void> {
    const entries = await this.storage.readDirWithTypes(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(fullPath, runId);
      } else if (entry.isFile()) {
        const artifact = await this.createArtifact(fullPath, runId);
        if (artifact) {
          if (this.config.maxFileSize && artifact.size > this.config.maxFileSize) {
            continue;
          }
          this.artifacts.push(artifact);
        }
      }
    }
  }

  private async createArtifact(filePath: string, runId?: string): Promise<Artifact | null> {
    try {
      const stats = await this.storage.stat(filePath);
      if (!stats) {
        return null;
      }

      const fileName = path.basename(filePath);
      const ext = path.extname(fileName).toLowerCase();
      const type = this.getArtifactType(ext);
      const mimeType = this.getMimeType(ext);

      const relativePath = path.relative(this.baseDir, filePath);
      const pathParts = relativePath.split(path.sep);

      let artifactRunId = runId || '';
      let testId = '';

      if (pathParts.length >= 2) {
        if (!runId) {
          artifactRunId = pathParts[0];
        }
        testId = pathParts.slice(1, -1).join('/');
      }

      const testName = testId.split('/').pop() || fileName;

      return {
        id: this.generateId(filePath),
        runId: artifactRunId,
        testId,
        testName,
        type,
        filePath,
        fileName,
        size: stats.size,
        mimeType,
        timestamp: stats.mtimeMs,
        browser: 'chromium' as BrowserType,
      };
    } catch {
      return null;
    }
  }

  private getArtifactType(ext: string): ArtifactType {
    const screenshotExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
    const videoExts = ['.webm', '.mp4', '.ogg'];
    const traceExts = ['.zip', '.trace'];

    if (screenshotExts.includes(ext)) {
      return 'screenshot';
    }
    if (videoExts.includes(ext)) {
      return 'video';
    }
    if (traceExts.includes(ext)) {
      return 'trace';
    }
    return 'attachment';
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webm': 'video/webm',
      '.mp4': 'video/mp4',
      '.ogg': 'video/ogg',
      '.zip': 'application/zip',
      '.trace': 'application/octet-stream',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private generateId(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex');
  }

  async getArtifact(id: string, runId?: string): Promise<Artifact | null> {
    await this.ready();

    if (this.artifacts.length === 0) {
      await this.discoverArtifacts(runId);
    }

    let artifact = this.artifacts.find((a) => a.id === id);

    if (!artifact) {
      artifact = this.artifacts.find((a) => a.filePath.includes(id));
    }

    return artifact || null;
  }

  async getArtifactContent(filePath: string): Promise<Buffer | null> {
    await this.ready();

    if (!(await this.storage.exists(filePath))) {
      return null;
    }

    return this.storage.readBuffer(filePath);
  }

  async deleteArtifact(filePath: string): Promise<boolean> {
    await this.ready();

    if (!(await this.storage.exists(filePath))) {
      return false;
    }

    await this.storage.remove(filePath);
    return true;
  }

  async cleanArtifacts(olderThan?: number): Promise<number> {
    await this.ready();

    const threshold = olderThan || 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;

    if (!(await this.storage.exists(this.baseDir))) {
      return 0;
    }

    const cleanDir = async (dir: string): Promise<void> => {
      const entries = await this.storage.readDirWithTypes(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await cleanDir(fullPath);
          try {
            const files = await this.storage.readDir(fullPath);
            if (files.length === 0) {
              await this.storage.removeDir(fullPath);
            }
          } catch {
            // Ignore errors
          }
        } else if (entry.isFile()) {
          const stats = await this.storage.stat(fullPath);
          if (stats && now - stats.mtimeMs > threshold) {
            await this.storage.remove(fullPath);
            deleted++;
          }
        }
      }
    };

    await cleanDir(this.baseDir);
    return deleted;
  }

  async getArtifactsByType(type: ArtifactType, runId?: string): Promise<Artifact[]> {
    await this.ready();

    if (this.artifacts.length === 0) {
      await this.discoverArtifacts(runId);
    }

    return this.artifacts.filter((a) => a.type === type);
  }

  async getArtifactsByTest(testId: string, runId?: string): Promise<Artifact[]> {
    await this.ready();

    if (this.artifacts.length === 0) {
      await this.discoverArtifacts(runId);
    }

    return this.artifacts.filter((a) => a.testId.includes(testId));
  }

  async getArtifactStats(runId?: string): Promise<{
    total: number;
    totalArtifacts: number;
    byType: Record<string, number>;
    totalSize: number;
    byTypeSize: Record<string, number>;
  }> {
    await this.ready();

    if (this.artifacts.length === 0) {
      await this.discoverArtifacts(runId);
    }

    const byType: Record<string, number> = {};
    const byTypeSize: Record<string, number> = {};
    let totalSize = 0;

    for (const artifact of this.artifacts) {
      byType[artifact.type] = (byType[artifact.type] || 0) + 1;
      byTypeSize[artifact.type] = (byTypeSize[artifact.type] || 0) + artifact.size;
      totalSize += artifact.size;
    }

    return {
      total: this.artifacts.length,
      totalArtifacts: this.artifacts.length,
      byType,
      totalSize,
      byTypeSize,
    };
  }

  formatSize(bytes: number): string {
    if (bytes === 0) {
      return '0.00 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const size = bytes / Math.pow(k, i);

    return `${size.toFixed(2)} ${units[i]}`;
  }
}
