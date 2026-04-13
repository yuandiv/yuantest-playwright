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
});
