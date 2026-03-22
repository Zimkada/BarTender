import { mergeConfig } from 'vite';
import { defineConfig as defineVitestConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineVitestConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/tests/setup.ts',
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/e2e/**', // Playwright tests — run via npx playwright test, not Vitest
      ],
    },
  })
);
