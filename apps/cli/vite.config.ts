/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'dashboard',
  build: {
    outDir: '../dist/public',
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5274',
      '/ws': {
        target: 'ws://localhost:5274',
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    css: true,
  },
});
