import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import viteConfig from './vite.config';
export default mergeConfig(
  viteConfig,
  defineConfig({
    optimizeDeps: {
      include: [
        '@uiw/react-md-editor',
        '@radix-ui/react-dialog',
        'radix-ui',
        'react-router-dom',
        '@hookform/resolvers/zod',
        'react-hook-form',
        '@radix-ui/react-tabs',
        '@radix-ui/react-alert-dialog',
        '@radix-ui/react-checkbox',
      ],
    },
    test: {
      include: ['src/**/*.browser.test.{ts,tsx}'],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: 'chromium' }],
      },
    },
  }),
);
