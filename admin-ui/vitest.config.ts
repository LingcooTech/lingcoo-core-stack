import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import viteConfig from './vite.config';
export default mergeConfig(
  viteConfig,
  defineConfig({
    optimizeDeps: { include: ['@radix-ui/react-dialog', 'radix-ui'] },
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
