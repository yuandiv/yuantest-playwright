import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { logger } from '../../logger';

export interface BrowserSessionOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  storageState?: string;
  extraHeaders?: Record<string, string>;
  authToken?: string;
  ignoreHTTPSErrors?: boolean;
}

export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  createdAt: number;
  lastAccessedAt: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
const LOG_MODULE = 'browser-session';

export class BrowserSessionManager {
  private sessions = new Map<string, BrowserSession>();
  private idleTimeoutMs: number;

  constructor(idleTimeoutMs?: number) {
    this.idleTimeoutMs = idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

    process.on('exit', () => {
      const sessions = Array.from(this.sessions.values());
      for (const session of sessions) {
        try {
          void session.browser.close();
        } catch {
          // best-effort cleanup on process exit
        }
      }
    });
  }

  async getSession(id: string, options?: BrowserSessionOptions): Promise<BrowserSession> {
    this.cleanupExpiredSessions();

    const existing = this.sessions.get(id);
    if (existing) {
      existing.lastAccessedAt = Date.now();
      return existing;
    }

    const headless = options?.headless ?? true;
    const viewport = options?.viewport ?? DEFAULT_VIEWPORT;

    logger.info(LOG_MODULE, `Launching browser for session ${id} (headless=${headless})`);

    const browser = await chromium.launch({ headless });

    const extraHTTPHeaders: Record<string, string> = { ...options?.extraHeaders };
    if (options?.authToken) {
      extraHTTPHeaders['Authorization'] = `Bearer ${options.authToken}`;
    }

    const context = await browser.newContext({
      viewport,
      ignoreHTTPSErrors: options?.ignoreHTTPSErrors,
      storageState: options?.storageState,
      extraHTTPHeaders: Object.keys(extraHTTPHeaders).length > 0 ? extraHTTPHeaders : undefined,
    });

    const now = Date.now();
    const session: BrowserSession = {
      id,
      browser,
      context,
      createdAt: now,
      lastAccessedAt: now,
    };

    this.sessions.set(id, session);
    logger.info(LOG_MODULE, `Browser session ${id} created`);

    return session;
  }

  async getPage(sessionId: string): Promise<Page> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No browser session found with id: ${sessionId}`);
    }
    session.lastAccessedAt = Date.now();
    const page = await session.context.newPage();
    return page;
  }

  async getActivePage(sessionId: string): Promise<Page | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    const pages = session.context.pages();
    return pages.length > 0 ? pages[pages.length - 1] : null;
  }

  async closeSession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }
    try {
      await session.browser.close();
      logger.info(LOG_MODULE, `Browser session ${id} closed`);
    } catch (err) {
      logger.warn(LOG_MODULE, `Error closing browser session ${id}: ${err}`);
    } finally {
      this.sessions.delete(id);
    }
  }

  async closeAll(): Promise<void> {
    const ids = this.getActiveSessionIds();
    await Promise.all(ids.map((id) => this.closeSession(id)));
  }

  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const entries = Array.from(this.sessions.entries());
    for (const [id, session] of entries) {
      if (now - session.lastAccessedAt > this.idleTimeoutMs) {
        logger.info(LOG_MODULE, `Browser session ${id} expired due to inactivity`);
        this.closeSession(id).catch(() => {
          // best-effort async cleanup
        });
      }
    }
  }
}
