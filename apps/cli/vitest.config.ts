import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Monorepo workspace 包统一解析到源码，避免 dist/源码双重实例导致 instanceof 失效
      '@yuantest/contracts': path.resolve(__dirname, '../../packages/contracts/src/index.ts'),
      '@yuantest/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@yuantest/executor': path.resolve(__dirname, '../../packages/executor/src/index.ts'),
      '@yuantest/reporter': path.resolve(__dirname, '../../packages/reporter/src/index.ts'),
      '@yuantest/diagnosis': path.resolve(__dirname, '../../packages/diagnosis/src/index.ts'),
      '@yuantest/flaky': path.resolve(__dirname, '../../packages/flaky/src/index.ts'),
    },
  },
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
