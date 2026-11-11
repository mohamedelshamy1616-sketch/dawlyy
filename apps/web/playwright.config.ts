import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.DATABASE_URL;
const serviceUrl = process.env.DATABASE_URL_SERVICE;
if (!databaseUrl || !serviceUrl) {
  throw new Error('Screenshots need DATABASE_URL and DATABASE_URL_SERVICE from packages/db/.env. Migrate and seed the local database first.');
}

/** doc §14 / autopilot P2.5: Chromium screenshots use a fresh development server with local demo auth. */
export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results/screens',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 3_600_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:3210',
    browserName: 'chromium',
    navigationTimeout: 60_000,
    reducedMotion: 'reduce',
    // Keep the signed development cookie in memory, out of trace/storage-state files.
    trace: 'off',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'pnpm exec next dev --port 3210',
    url: 'http://localhost:3210/ar/login',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NODE_ENV: 'development',
      DAWLYY_DIST_DIR: '.next-screens',
      DAWLYY_DEV_LOGIN: '1',
      DAWLYY_DEV_LOGIN_SECRET: process.env.DAWLYY_DEV_LOGIN_SECRET
        || '0123456789abcdef0123456789abcdef0123456789abcdef',
      DATABASE_URL: databaseUrl,
      DATABASE_URL_SERVICE: serviceUrl,
    },
  },
});
