/**
 * Mock for @playwright/test - avoids dynamic import errors in Jest
 */

export const chromium = {
  launch: jest.fn().mockResolvedValue({
    newContext: jest.fn().mockResolvedValue({
      newPage: jest.fn().mockResolvedValue({
        goto: jest.fn().mockResolvedValue(null),
        content: jest.fn().mockResolvedValue(''),
        screenshot: jest.fn().mockResolvedValue(Buffer.alloc(0)),
        close: jest.fn().mockResolvedValue(undefined),
        waitForSelector: jest.fn().mockResolvedValue(null),
        evaluate: jest.fn().mockResolvedValue(undefined),
        click: jest.fn().mockResolvedValue(undefined),
        fill: jest.fn().mockResolvedValue(undefined),
        type: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
};

export const Browser = {};
export const BrowserContext = {};
export const Page = {};
export const defineConfig = jest.fn((config: any) => config);
export const devices = {};
