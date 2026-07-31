import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/verify.ts', 'dashboard/**'],
    testTimeout: 60000,
    hookTimeout: 60000,
    setupFiles: ['tests/setup.ts'],
    singleFork: true,
  },
});
