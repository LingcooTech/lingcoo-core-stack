import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('react-markdown') || id.includes('remark-gfm') || id.includes('rehype-raw')) {
            return 'markdown';
          }

          if (id.includes('@tanstack/react-query')) {
            return 'query';
          }

          if (id.includes('react-router') || id.includes('@remix-run/router')) {
            return 'router';
          }

          if (id.includes('react-hook-form') || id.includes('@hookform/resolvers') || id.includes('zod')) {
            return 'forms';
          }

          if (id.includes('@radix-ui') || id.includes('cmdk')) {
            return 'ui-kit';
          }

          if (id.includes('lucide-react')) {
            return 'icons';
          }
        }
      }
    }
  }
});
