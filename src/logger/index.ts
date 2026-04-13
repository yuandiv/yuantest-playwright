import * as fs from 'fs';
import * as path from 'path';
import { StorageProvider, getStorage } from '../storage';
import { LOG_LEVELS, CACHE_CONFIG } from '../constants';

enum LogLevel {
  DEBUG = LOG_LEVELS.DEBUG,
  INFO = LOG_LEVELS.INFO,
  WARN = LOG_LEVELS.WARN,
  ERROR = LOG_LEVELS.ERROR,
}

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
  error?: string;
  logLevel: LogLevel;
}

class Logger {
  private static instance: Logger;
  private logDir: string = './logs';
  private currentLogFile: string = '';
  private level: LogLevel = LogLevel.INFO;
  private initialized: boolean = false;
  private logQueue: string[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing: boolean = false;
  private readonly FLUSH_INTERVAL_MS = CACHE_CONFIG.FLUSH_INTERVAL_MS;
  private readonly MAX_QUEUE_SIZE = CACHE_CONFIG.MAX_QUEUE_SIZE;
  private writeStream: fs.WriteStream | null = null;
  private storage: StorageProvider;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.storage = getStorage();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  async init(logDir?: string, level?: string): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInit(logDir, level);
    return this.initPromise;
  }

  private async doInit(logDir?: string, level?: string): Promise<void> {
    if (logDir) {
      this.logDir = logDir;
    }
    if (level) {
      const upper = level.toUpperCase();
      if (upper in LogLevel) {
        this.level = LogLevel[upper as keyof typeof LogLevel];
      }
    }
    await this.storage.mkdir(this.logDir);
    const dateStr = new Date().toISOString().split('T')[0];
    this.currentLogFile = path.join(this.logDir, `yuantest-${dateStr}.log`);
    this.writeStream = fs.createWriteStream(this.currentLogFile, { flags: 'a', encoding: 'utf-8' });
    this.writeStream.on('error', () => {});
    this.initialized = true;
    this.startFlushTimer();
  }

  private startFlushTimer(): void {
    if (this.flushTimer) {
      return;
    }
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL_MS);
    this.flushTimer.unref();
  }

  private formatEntry(entry: LogEntry): string {
    return `[${entry.timestamp}] [${entry.level}] [${entry.module}] ${entry.message}${entry.error ? '\n  ' + entry.error : ''}`;
  }

  private write(entry: LogEntry): void {
    if (!this.initialized || entry.logLevel < this.level) {
      return;
    }
    const formatted = this.formatEntry(entry);
    console.log(formatted);
    this.logQueue.push(formatted);
    if (this.logQueue.length >= this.MAX_QUEUE_SIZE) {
      this.flush();
    }
  }

  private flush(): void {
    if (this.flushing || this.logQueue.length === 0) {
      return;
    }
    this.flushing = true;
    try {
      const batch = this.logQueue.splice(0);
      if (batch.length > 0 && this.writeStream && !this.writeStream.destroyed) {
        const data = batch.join('\n') + '\n';
        const canContinue = this.writeStream.write(data);
        if (!canContinue) {
          this.writeStream.once('drain', () => {
            this.flushing = false;
            if (this.logQueue.length > 0) {
              this.flush();
            }
          });
          return;
        }
      }
    } catch (error) {
      console.error(
        `[Logger] Failed to flush logs: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.flushing = false;
      if (this.logQueue.length > 0) {
        this.flush();
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
    if (this.writeStream && !this.writeStream.destroyed) {
      await new Promise<void>((resolve) => {
        this.writeStream!.end(() => resolve());
      });
      this.writeStream = null;
    }
  }

  debug(module: string, message: string, error?: Error): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      module,
      message,
      error: error?.stack,
      logLevel: LogLevel.DEBUG,
    });
  }

  info(module: string, message: string, error?: Error): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      module,
      message,
      error: error?.stack,
      logLevel: LogLevel.INFO,
    });
  }

  warn(module: string, message: string, error?: Error): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'WARN',
      module,
      message,
      error: error?.stack,
      logLevel: LogLevel.WARN,
    });
  }

  error(module: string, message: string, error?: Error): void {
    this.write({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      module,
      message,
      error: error?.stack,
      logLevel: LogLevel.ERROR,
    });
  }

  child(module: string): ChildLogger {
    return new ChildLogger(module, this);
  }
}

class ChildLogger {
  constructor(
    private module: string,
    private logger: Logger
  ) {}

  debug(message: string, error?: Error): void {
    this.logger.debug(this.module, message, error);
  }
  info(message: string, error?: Error): void {
    this.logger.info(this.module, message, error);
  }
  warn(message: string, error?: Error): void {
    this.logger.warn(this.module, message, error);
  }
  error(message: string, error?: Error): void {
    this.logger.error(this.module, message, error);
  }
}

export const logger = Logger.getInstance();
export { Logger, ChildLogger, LogLevel };
