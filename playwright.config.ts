import { defineConfig } from '@playwright/test';

// The extension under test is built by `pnpm build:e2e` into .output/chrome-mv3-e2e (see tests/e2e/fixtures.ts).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
