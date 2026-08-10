import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
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
  results.sort();
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
  results.sort();
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

export function hasChineseChars(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}

export function getShortPath(longPath: string): string {
  if (process.platform !== 'win32') {
    return longPath;
  }

  if (!fs.existsSync(longPath)) {
    return longPath;
  }

  try {
    const result = execSync(`cmd /c for %I in ("${longPath}") do @echo %~sI`, {
      encoding: 'utf-8',
      windowsHide: true,
    }).trim();
    return result || longPath;
  } catch {
    return longPath;
  }
}

export function safePathForCLI(inputPath: string): string {
  if (process.platform !== 'win32') {
    return inputPath;
  }

  if (hasChineseChars(inputPath)) {
    return getShortPath(inputPath);
  }

  return inputPath;
}

/**
 * 将单个参数转义为 shell 可安全解析的形式（用于 `shell: true` 场景）。
 *
 * 背景：Node spawn 在 `shell: true` 时会把参数数组直接用空格拼接交给 shell
 * （cmd.exe / sh），**不做任何转义**（见 DEP0190 警告）。当参数含空格或特殊
 * 字符（如 `--config=C:\my project\playwright.config.ts`）时，shell 会把路径
 * 在空格处拆词，导致命令解析失败；在中文 Windows（代码页 936/GBK）上 cmd 会
 * 输出 GBK 编码的错误消息（如"不是内部或外部命令"），被上层按 UTF-8 解码后
 * 即为乱码，且进程立即退出（表现为"第二次点击运行选中后乱码报错、任务即结束"）。
 *
 * - Windows (cmd.exe)：含空格/特殊字符时用双引号包裹，内部双引号加倍；
 * - POSIX (sh)：含特殊字符时用单引号包裹，内部单引号按 `'\''` 转义。
 */
export function escapeShellArg(arg: string): string {
  if (process.platform === 'win32') {
    // cmd.exe 特殊字符集合（双引号、空格及元字符）
    if (/[ \t"&|<>^()%!]/.test(arg)) {
      return '"' + arg.replace(/"/g, '""') + '"';
    }
    return arg;
  }
  // POSIX sh：保留字母数字与常见路径字符，其余用单引号包裹
  if (/^[A-Za-z0-9_\-./:=@]+$/.test(arg)) {
    return arg;
  }
  return "'" + arg.replace(/'/g, `'\\''`) + "'";
}

export function buildSpawnEnv(additionalEnv?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };

  if (process.platform === 'win32') {
    env.CHCP = '65001';
    env.PYTHONIOENCODING = 'utf-8';
    env.LANG = 'en_US.UTF-8';
    env.PYTHONUTF8 = '1';
  }

  if (additionalEnv) {
    Object.assign(env, additionalEnv);
  }

  return env;
}
