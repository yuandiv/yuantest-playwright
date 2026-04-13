import { TraceConfig, TraceFile, BrowserType } from '../types';
import * as path from 'path';
import { walkDirAsync, walkDirWithCallbackAsync } from '../utils/filesystem';
import { StorageProvider, getStorage } from '../storage';
import { logger } from '../logger';

export class TraceManager {
  private config: TraceConfig;
  private baseDir: string;
  private traces: Map<string, TraceFile> = new Map();
  private storage: StorageProvider;
  private initialized: Promise<void>;
  private log = logger.child('TraceManager');

  constructor(config: TraceConfig, baseDir: string = './traces', storage?: StorageProvider) {
    this.config = config;
    this.baseDir = config.outputDir || baseDir;
    this.storage = storage || getStorage();
    this.initialized = this.init();
  }

  async initialize(): Promise<void> {
    await this.initialized;
  }

  private async init(): Promise<void> {
    if (!(await this.storage.exists(this.baseDir))) {
      await this.storage.mkdir(this.baseDir);
    }
  }

  async discoverTraces(runId?: string): Promise<TraceFile[]> {
    await this.initialized;
    const tracesDir = runId ? path.join(this.baseDir, runId) : this.baseDir;

    if (!(await this.storage.exists(tracesDir))) {
      return [];
    }

    const traceFiles: TraceFile[] = [];

    await walkDirWithCallbackAsync(
      tracesDir,
      async (fullPath, relativePath) => {
        const ext = path.extname(fullPath).toLowerCase();
        if (ext !== '.zip' && ext !== '.trace') {
          return;
        }

        const stat = await this.storage.stat(fullPath);
        if (!stat) {
          return;
        }

        const parts = relativePath.split(path.sep);

        traceFiles.push({
          runId: runId || 'unknown',
          testId: parts.slice(0, -1).join('/') || 'unknown',
          testName: parts.length > 1 ? parts[parts.length - 2] : path.basename(fullPath, ext),
          filePath: fullPath,
          size: stat.size,
          timestamp: stat.mtimeMs,
          browser: 'chromium',
        });
      },
      { relativeTo: tracesDir }
    );

    return traceFiles;
  }

  async getTrace(testId: string, runId?: string): Promise<TraceFile | null> {
    const allTraces = await this.discoverTraces(runId);
    return allTraces.find((t) => t.testId === testId || t.filePath.includes(testId)) || null;
  }

  async getTraceContent(filePath: string): Promise<Buffer | null> {
    if (!(await this.storage.exists(filePath))) {
      return null;
    }
    return this.storage.readBuffer(filePath);
  }

  async deleteTrace(filePath: string): Promise<boolean> {
    try {
      if (await this.storage.exists(filePath)) {
        await this.storage.remove(filePath);
        return true;
      }
      return false;
    } catch (error) {
      this.log.debug(
        `Failed to delete trace ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  async cleanTraces(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    const allTraces = await this.discoverTraces();
    const cutoff = Date.now() - olderThanMs;
    let deleted = 0;

    for (const trace of allTraces) {
      if (trace.timestamp < cutoff) {
        const success = await this.deleteTrace(trace.filePath);
        if (success) {
          deleted++;
        }
      }
    }

    return deleted;
  }

  async getTraceStats(): Promise<{
    totalTraces: number;
    totalSize: number;
    byBrowser: Record<string, number>;
    recentTraces: TraceFile[];
  }> {
    const allTraces = await this.discoverTraces();
    const totalSize = allTraces.reduce((sum, t) => sum + t.size, 0);
    const byBrowser: Record<string, number> = {};

    for (const trace of allTraces) {
      byBrowser[trace.browser] = (byBrowser[trace.browser] || 0) + 1;
    }

    const recentTraces = allTraces.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

    return {
      totalTraces: allTraces.length,
      totalSize,
      byBrowser,
      recentTraces,
    };
  }

  async openTraceViewer(tracePath: string, port?: number): Promise<string> {
    const { spawn } = require('child_process');
    const viewerPort = port || 9323;

    const child = spawn(
      'npx',
      ['playwright', 'show-trace', tracePath, '--port', String(viewerPort)],
      {
        stdio: 'pipe',
        shell: true,
      }
    );

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        resolve(`http://localhost:${viewerPort}`);
      }, 5000);

      child.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(`http://localhost:${match[1]}`);
        }
      });

      child.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve(`http://localhost:${match[1]}`);
        }
      });

      child.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async mergeTraces(tracePaths: string[], outputPath: string): Promise<string> {
    const { execSync } = require('child_process');
    const listFile = path.join(this.baseDir, 'trace-merge-list.txt');
    await this.storage.writeText(listFile, tracePaths.join('\n'));

    try {
      execSync(`npx playwright merge-trace ${listFile} ${outputPath}`, {
        stdio: 'pipe',
        shell: true,
      });
      return outputPath;
    } finally {
      if (await this.storage.exists(listFile)) {
        await this.storage.remove(listFile);
      }
    }
  }

  getTraceConfigForPlaywright(): Record<string, any> {
    if (!this.config.enabled) {
      return { trace: 'off' };
    }

    return {
      trace: this.config.mode,
    };
  }
}
