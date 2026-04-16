import * as fs from 'fs';
import * as path from 'path';
import { ErrorCode, PlaywrightRunnerError, Result, Ok, Err, createError } from '../types';

type LoggerType = typeof import('../logger').logger;

let _logger: LoggerType | null = null;
function getLogger(): LoggerType {
  if (!_logger) {
    _logger = require('../logger').logger;
  }
  return _logger!;
}

interface MemoryFile {
  content: string | Buffer;
  isDirectory: boolean;
  children: Set<string>;
}

function classifyFileSystemError(error: unknown, filePath: string): PlaywrightRunnerError {
  const nodeError = error as NodeJS.ErrnoException;
  switch (nodeError.code) {
    case 'ENOENT':
      return createError(ErrorCode.FILE_NOT_FOUND, `File not found: ${filePath}`, error);
    case 'EACCES':
    case 'EPERM':
      return createError(ErrorCode.PERMISSION_DENIED, `Permission denied: ${filePath}`, error);
    case 'ENOTDIR':
      return createError(ErrorCode.IO_ERROR, `Not a directory: ${filePath}`, error);
    case 'EISDIR':
      return createError(ErrorCode.IO_ERROR, `Is a directory: ${filePath}`, error);
    default:
      return createError(
        ErrorCode.IO_ERROR,
        `Filesystem error for ${filePath}: ${nodeError.message || 'Unknown error'}`,
        error
      );
  }
}

export class MemoryStorage implements StorageProvider {
  private store = new Map<string, MemoryFile>();
  private _log: ReturnType<LoggerType['child']> | null = null;

  private get log() {
    if (!this._log) {
      this._log = getLogger().child('MemoryStorage');
    }
    return this._log;
  }

  private normalizePath(filePath: string): string {
    return path.posix.normalize(filePath).replace(/\\/g, '/');
  }

  private ensureParentDirs(filePath: string): void {
    const normalized = this.normalizePath(filePath);
    const parts = normalized.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      const dirPath = '/' + parts.slice(0, i).join('/');
      if (!this.store.has(dirPath)) {
        this.store.set(dirPath, { content: '', isDirectory: true, children: new Set() });
      }
      if (i > 0) {
        const parentPath = '/' + parts.slice(0, i - 1).join('/') || '/';
        const parent = this.store.get(parentPath);
        if (parent) {
          parent.children.add(dirPath);
        }
      }
    }
  }

  async readJSON<T>(filePath: string): Promise<T | null> {
    const normalized = this.normalizePath(filePath);
    const file = this.store.get(normalized);
    if (!file || file.isDirectory) {
      return null;
    }
    try {
      const content = Buffer.isBuffer(file.content) ? file.content.toString('utf-8') : file.content;
      return JSON.parse(content) as T;
    } catch (error) {
      this.log.debug(
        `Failed to parse JSON from ${filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  async writeJSON(filePath: string, data: any): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.writeText(filePath, content);
  }

  async readText(filePath: string): Promise<string | null> {
    const normalized = this.normalizePath(filePath);
    const file = this.store.get(normalized);
    if (!file || file.isDirectory) {
      return null;
    }
    if (Buffer.isBuffer(file.content)) {
      return file.content.toString('utf-8');
    }
    return file.content;
  }

  async writeText(filePath: string, content: string): Promise<void> {
    const normalized = this.normalizePath(filePath);
    this.ensureParentDirs(normalized);
    this.store.set(normalized, { content, isDirectory: false, children: new Set() });
    const parentPath = path.posix.dirname(normalized);
    const parent = this.store.get(parentPath);
    if (parent) {
      parent.children.add(normalized);
    }
  }

  async appendText(filePath: string, content: string): Promise<void> {
    const normalized = this.normalizePath(filePath);
    const existing = await this.readText(normalized);
    await this.writeText(filePath, (existing ?? '') + content);
  }

  async readBuffer(filePath: string): Promise<Buffer | null> {
    const normalized = this.normalizePath(filePath);
    const file = this.store.get(normalized);
    if (!file || file.isDirectory) {
      return null;
    }
    if (Buffer.isBuffer(file.content)) {
      return file.content;
    }
    return Buffer.from(file.content, 'utf-8');
  }

  async writeBuffer(filePath: string, data: Buffer): Promise<void> {
    const normalized = this.normalizePath(filePath);
    this.ensureParentDirs(normalized);
    this.store.set(normalized, { content: data, isDirectory: false, children: new Set() });
    const parentPath = path.posix.dirname(normalized);
    const parent = this.store.get(parentPath);
    if (parent) {
      parent.children.add(normalized);
    }
  }

  async readDir(dirPath: string): Promise<string[]> {
    const normalized = this.normalizePath(dirPath);
    const dir = this.store.get(normalized);
    if (!dir || !dir.isDirectory) {
      return [];
    }
    return Array.from(dir.children).map((p) => path.posix.basename(p));
  }

  async exists(filePath: string): Promise<boolean> {
    const normalized = this.normalizePath(filePath);
    return this.store.has(normalized);
  }

  async mkdir(dirPath: string): Promise<void> {
    const normalized = this.normalizePath(dirPath);
    if (this.store.has(normalized)) {
      return;
    }
    this.ensureParentDirs(normalized);
    this.store.set(normalized, { content: '', isDirectory: true, children: new Set() });
    const parentPath = path.posix.dirname(normalized);
    const parent = this.store.get(parentPath);
    if (parent) {
      parent.children.add(normalized);
    }
  }

  async remove(filePath: string): Promise<void> {
    const normalized = this.normalizePath(filePath);
    this.store.delete(normalized);
    const parentPath = path.posix.dirname(normalized);
    const parent = this.store.get(parentPath);
    if (parent) {
      parent.children.delete(normalized);
    }
  }

  /**
   * 递归删除目录及其所有内容
   */
  async removeDir(dirPath: string): Promise<void> {
    const normalized = this.normalizePath(dirPath);
    const dir = this.store.get(normalized);
    if (!dir || !dir.isDirectory) {
      return;
    }

    const deleteRecursive = (currentPath: string) => {
      const current = this.store.get(currentPath);
      if (!current) {
        return;
      }

      if (current.isDirectory) {
        for (const childPath of Array.from(current.children)) {
          deleteRecursive(childPath);
        }
      }
      this.store.delete(currentPath);
    };

    deleteRecursive(normalized);

    const parentPath = path.posix.dirname(normalized);
    const parent = this.store.get(parentPath);
    if (parent) {
      parent.children.delete(normalized);
    }
  }

  async stat(filePath: string): Promise<fs.Stats | null> {
    const normalized = this.normalizePath(filePath);
    const file = this.store.get(normalized);
    if (!file) {
      return null;
    }
    const now = new Date();
    const mockStats = {
      isFile: () => !file.isDirectory,
      isDirectory: () => file.isDirectory,
      size: file.isDirectory ? 0 : Buffer.byteLength(file.content, 'utf-8'),
      mtime: now,
      ctime: now,
      birthtime: now,
    } as unknown as fs.Stats;
    return mockStats;
  }

  async copy(src: string, dest: string): Promise<void> {
    const normalizedSrc = this.normalizePath(src);
    const file = this.store.get(normalizedSrc);
    if (!file) {
      return;
    }
    if (file.isDirectory) {
      return;
    }
    if (Buffer.isBuffer(file.content)) {
      await this.writeBuffer(dest, file.content);
    } else {
      await this.writeText(dest, file.content);
    }
  }

  async readDirWithTypes(dirPath: string): Promise<fs.Dirent[]> {
    const normalized = this.normalizePath(dirPath);
    const dir = this.store.get(normalized);
    if (!dir || !dir.isDirectory) {
      return [];
    }
    const entries: fs.Dirent[] = [];
    for (const childPath of dir.children) {
      const child = this.store.get(childPath);
      if (!child) {
        continue;
      }
      const name = path.posix.basename(childPath);
      const entry = {
        name,
        isFile: () => !child.isDirectory,
        isDirectory: () => child.isDirectory,
      } as unknown as fs.Dirent;
      entries.push(entry);
    }
    return entries;
  }

  clear(): void {
    this.store.clear();
  }
}

export interface StorageProvider {
  readJSON<T>(filePath: string): Promise<T | null>;
  writeJSON(filePath: string, data: any): Promise<void>;
  readText(filePath: string): Promise<string | null>;
  writeText(filePath: string, content: string): Promise<void>;
  appendText(filePath: string, content: string): Promise<void>;
  readBuffer(filePath: string): Promise<Buffer | null>;
  writeBuffer(filePath: string, data: Buffer): Promise<void>;
  readDir(dirPath: string): Promise<string[]>;
  exists(filePath: string): Promise<boolean>;
  mkdir(dirPath: string): Promise<void>;
  remove(filePath: string): Promise<void>;
  removeDir(dirPath: string): Promise<void>;
  stat(filePath: string): Promise<fs.Stats | null>;
  copy(src: string, dest: string): Promise<void>;
  readDirWithTypes(dirPath: string): Promise<fs.Dirent[]>;
}

export interface StorageProviderWithResult {
  readJSONWithResult<T>(filePath: string): Promise<Result<T>>;
  readTextWithResult(filePath: string): Promise<Result<string>>;
  readBufferWithResult(filePath: string): Promise<Result<Buffer>>;
  readDirWithResult(dirPath: string): Promise<Result<string[]>>;
  statWithResult(filePath: string): Promise<Result<fs.Stats>>;
  removeWithResult(filePath: string): Promise<Result<void>>;
}

export class FilesystemStorage implements StorageProvider, StorageProviderWithResult {
  private _log: ReturnType<LoggerType['child']> | null = null;

  private get log() {
    if (!this._log) {
      this._log = getLogger().child('FilesystemStorage');
    }
    return this._log;
  }

  async readJSON<T>(filePath: string): Promise<T | null> {
    const result = await this.readJSONWithResult<T>(filePath);
    return result.ok ? result.value : null;
  }

  async readJSONWithResult<T>(filePath: string): Promise<Result<T>> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      try {
        return Ok(JSON.parse(content) as T);
      } catch (parseError) {
        this.log.debug(
          `JSON parse error in ${filePath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`
        );
        return Err(createError(ErrorCode.PARSE_ERROR, `Invalid JSON in ${filePath}`, parseError));
      }
    } catch (error) {
      const classified = classifyFileSystemError(error, filePath);
      this.log.debug(`Failed to read ${filePath}: ${classified.message}`);
      return Err(classified);
    }
  }

  async writeJSON(filePath: string, data: any): Promise<void> {
    const dir = path.dirname(filePath);
    await this.mkdir(dir);
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async readText(filePath: string): Promise<string | null> {
    const result = await this.readTextWithResult(filePath);
    return result.ok ? result.value : null;
  }

  async readTextWithResult(filePath: string): Promise<Result<string>> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return Ok(content);
    } catch (error) {
      const classified = classifyFileSystemError(error, filePath);
      this.log.debug(`Failed to read text ${filePath}: ${classified.message}`);
      return Err(classified);
    }
  }

  async writeText(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.mkdir(dir);
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }

  async appendText(filePath: string, content: string): Promise<void> {
    const dir = path.dirname(filePath);
    await this.mkdir(dir);
    await fs.promises.appendFile(filePath, content, 'utf-8');
  }

  async readBuffer(filePath: string): Promise<Buffer | null> {
    const result = await this.readBufferWithResult(filePath);
    return result.ok ? result.value : null;
  }

  async readBufferWithResult(filePath: string): Promise<Result<Buffer>> {
    try {
      const buffer = await fs.promises.readFile(filePath);
      return Ok(buffer);
    } catch (error) {
      const classified = classifyFileSystemError(error, filePath);
      this.log.debug(`Failed to read buffer ${filePath}: ${classified.message}`);
      return Err(classified);
    }
  }

  async writeBuffer(filePath: string, data: Buffer): Promise<void> {
    const dir = path.dirname(filePath);
    await this.mkdir(dir);
    await fs.promises.writeFile(filePath, data);
  }

  async readDir(dirPath: string): Promise<string[]> {
    const result = await this.readDirWithResult(dirPath);
    return result.ok ? result.value : [];
  }

  async readDirWithResult(dirPath: string): Promise<Result<string[]>> {
    try {
      const entries = await fs.promises.readdir(dirPath);
      return Ok(entries);
    } catch (error) {
      const classified = classifyFileSystemError(error, dirPath);
      this.log.debug(`Failed to read directory ${dirPath}: ${classified.message}`);
      return Err(classified);
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath);
      return;
    } catch {
      // Directory doesn't exist, create it
    }
    try {
      await fs.promises.mkdir(dirPath, { recursive: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'EEXIST') {
        return;
      }
      throw error;
    }
  }

  async remove(filePath: string): Promise<void> {
    const result = await this.removeWithResult(filePath);
    if (!result.ok) {
      this.log.debug(`remove(${filePath}) failed: ${result.error.message}`);
    }
  }

  async removeWithResult(filePath: string): Promise<Result<void>> {
    try {
      await fs.promises.unlink(filePath);
      return Ok(undefined);
    } catch (error) {
      const classified = classifyFileSystemError(error, filePath);
      return Err(classified);
    }
  }

  /**
   * 递归删除目录及其所有内容
   */
  async removeDir(dirPath: string): Promise<void> {
    try {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
      this.log.debug(
        `removeDir(${dirPath}) failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async stat(filePath: string): Promise<fs.Stats | null> {
    const result = await this.statWithResult(filePath);
    return result.ok ? result.value : null;
  }

  async statWithResult(filePath: string): Promise<Result<fs.Stats>> {
    try {
      const stats = await fs.promises.stat(filePath);
      return Ok(stats);
    } catch (error) {
      const classified = classifyFileSystemError(error, filePath);
      this.log.debug(`Failed to stat ${filePath}: ${classified.message}`);
      return Err(classified);
    }
  }

  async copy(src: string, dest: string): Promise<void> {
    const dir = path.dirname(dest);
    await this.mkdir(dir);
    await fs.promises.copyFile(src, dest);
  }

  async readDirWithTypes(dirPath: string): Promise<fs.Dirent[]> {
    try {
      return await fs.promises.readdir(dirPath, { withFileTypes: true });
    } catch (error) {
      this.log.debug(
        `Failed to read directory with types ${dirPath}: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
}

let defaultStorage: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!defaultStorage) {
    defaultStorage = new FilesystemStorage();
  }
  return defaultStorage;
}

export function setStorage(storage: StorageProvider): void {
  defaultStorage = storage;
}
