import { vi } from 'vitest';
import { logger, initLoggerStorage } from '@yuantest/core';
import { MemoryStorage } from '@yuantest/core';

initLoggerStorage(new MemoryStorage());

vi.mock('@playwright/test', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(null),
          content: vi.fn().mockResolvedValue(''),
          screenshot: vi.fn().mockResolvedValue(Buffer.alloc(0)),
          close: vi.fn().mockResolvedValue(undefined),
          waitForSelector: vi.fn().mockResolvedValue(null),
          evaluate: vi.fn().mockResolvedValue(undefined),
          click: vi.fn().mockResolvedValue(undefined),
          fill: vi.fn().mockResolvedValue(undefined),
          type: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
  Browser: {},
  BrowserContext: {},
  Page: {},
  defineConfig: vi.fn((config) => config),
  devices: {},
}));
