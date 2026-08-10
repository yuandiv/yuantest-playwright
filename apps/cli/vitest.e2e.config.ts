import { defineConfig } from 'vitest/config';
import * as path from 'path';

/**
 * E2E 测试专用配置：只运行 tests/e2e/**，与默认 vitest run（unit/integration）隔离。
 * 用法：vitest run --config vitest.e2e.config.ts（npm run test:e2e 已指向该配置）。
 */
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
      '@yuantest/ai': path.resolve(__dirname, '../../packages/ai/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    setupFiles: ['tests/setup.ts'],
    singleFork: true,
  },
});
