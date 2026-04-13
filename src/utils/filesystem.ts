import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, getStorage } from '../storage';
import { logger } from '../logger';

const log = logger.child('filesystem');

export interface WalkOptions {
  extensions?: string[];
  ignoreDirs?: string[];
  ignorePatterns?: string[];
  matchPatterns?: string[];
  relativeTo?: string;
}

export interface WalkResult {
  fullPath: string;
  relativePath: string;
  entry: fs.Dirent;
}

const DEFAULT_IGNORE_DIRS = [
  'node_modules',
  '__snapshots__',
  '__image_snapshots__',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
];

export function walkDir(dir: string, options: WalkOptions = {}): string[] {
  const {
    extensions,
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    ignorePatterns = [],
    matchPatterns = [],
    relativeTo,
  } = options;

  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const baseDir = relativeTo || dir;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(baseDir, fullPath);

        if (ignorePatterns.length > 0) {
          const isIgnored = ignorePatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (isIgnored) {
            continue;
          }
        }

        if (extensions && extensions.length > 0) {
          const hasExtension = extensions.some((ext) => entry.name.endsWith(ext));
          if (!hasExtension) {
            continue;
          }
        }

        if (matchPatterns.length > 0) {
          const isMatch = matchPatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (!isMatch) {
            continue;
          }
        }

        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

export function walkDirWithCallback(
  dir: string,
  callback: (fullPath: string, relativePath: string, entry: fs.Dirent) => void,
  options: WalkOptions = {}
): void {
  const {
    extensions,
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    ignorePatterns = [],
    matchPatterns = [],
    relativeTo,
  } = options;

  if (!fs.existsSync(dir)) {
    return;
  }

  const baseDir = relativeTo || dir;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) {
          continue;
        }
        walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(baseDir, fullPath);

        if (ignorePatterns.length > 0) {
          const isIgnored = ignorePatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (isIgnored) {
            continue;
          }
        }

        if (extensions && extensions.length > 0) {
          const hasExtension = extensions.some((ext) => entry.name.endsWith(ext));
          if (!hasExtension) {
            continue;
          }
        }

        if (matchPatterns.length > 0) {
          const isMatch = matchPatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (!isMatch) {
            continue;
          }
        }

        callback(fullPath, relativePath, entry);
      }
    }
  }

  walk(dir);
}

export async function walkDirAsync(
  dir: string,
  options: WalkOptions = {},
  storage?: StorageProvider
): Promise<string[]> {
  const {
    extensions,
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    ignorePatterns = [],
    matchPatterns = [],
    relativeTo,
  } = options;

  const results: string[] = [];
  const store = storage || getStorage();

  if (!(await store.exists(dir))) {
    return results;
  }

  const baseDir = relativeTo || dir;

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await store.readDirWithTypes(currentDir);
    } catch (error) {
      log.debug(
        `Failed to read directory ${currentDir}: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(baseDir, fullPath);

        if (ignorePatterns.length > 0) {
          const isIgnored = ignorePatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (isIgnored) {
            continue;
          }
        }

        if (extensions && extensions.length > 0) {
          const hasExtension = extensions.some((ext) => entry.name.endsWith(ext));
          if (!hasExtension) {
            continue;
          }
        }

        if (matchPatterns.length > 0) {
          const isMatch = matchPatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (!isMatch) {
            continue;
          }
        }

        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

export async function walkDirWithCallbackAsync(
  dir: string,
  callback: (fullPath: string, relativePath: string, entry: fs.Dirent) => Promise<void>,
  options: WalkOptions = {},
  storage?: StorageProvider
): Promise<void> {
  const {
    extensions,
    ignoreDirs = DEFAULT_IGNORE_DIRS,
    ignorePatterns = [],
    matchPatterns = [],
    relativeTo,
  } = options;

  const store = storage || getStorage();

  if (!(await store.exists(dir))) {
    return;
  }

  const baseDir = relativeTo || dir;

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await store.readDirWithTypes(currentDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (ignoreDirs.includes(entry.name)) {
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(baseDir, fullPath);

        if (ignorePatterns.length > 0) {
          const isIgnored = ignorePatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (isIgnored) {
            continue;
          }
        }

        if (extensions && extensions.length > 0) {
          const hasExtension = extensions.some((ext) => entry.name.endsWith(ext));
          if (!hasExtension) {
            continue;
          }
        }

        if (matchPatterns.length > 0) {
          const isMatch = matchPatterns.some((pattern) => {
            return matchPattern(pattern, relativePath) || matchPattern(pattern, entry.name);
          });
          if (!isMatch) {
            continue;
          }
        }

        await callback(fullPath, relativePath, entry);
      }
    }
  }

  await walk(dir);
}

function matchPattern(pattern: string, text: string): boolean {
  if (pattern.startsWith('*') || pattern.includes('/') || pattern.includes('*')) {
    const regex = new RegExp(
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    );
    return regex.test(text);
  }
  return text === pattern;
}

export async function ensureDirAsync(dir: string, storage?: StorageProvider): Promise<void> {
  const store = storage || getStorage();
  if (!(await store.exists(dir))) {
    await store.mkdir(dir);
  }
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function getFileStatsAsync(
  filePath: string,
  storage?: StorageProvider
): Promise<{
  size: number;
  created: number;
  modified: number;
} | null> {
  const store = storage || getStorage();
  const stat = await store.stat(filePath);
  if (!stat) {
    return null;
  }

  return {
    size: stat.size,
    created: stat.birthtimeMs,
    modified: stat.mtimeMs,
  };
}

export function getFileStats(filePath: string): {
  size: number;
  created: number;
  modified: number;
} | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  return {
    size: stat.size,
    created: stat.birthtimeMs,
    modified: stat.mtimeMs,
  };
}
