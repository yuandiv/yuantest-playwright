import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  testIgnore: ['**/*.test.ts', '**/*.e2e.test.ts', '**/e2e/**', '**/integration/**', '**/unit/**', '**/__mocks__/**'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never', outputFolder: './test-sandbox/reports' }],
    ['json', { outputFile: './test-sandbox/reports/results.json' }],
    ['list'],
  ],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: './test-sandbox/artifacts',

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
      },
    },
  ],
});
