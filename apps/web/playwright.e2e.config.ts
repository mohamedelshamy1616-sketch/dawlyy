import { defineConfig } from '@playwright/test';

const databaseUrl = process.env.DATABASE_URL;
const serviceUrl = process.env.DATABASE_URL_SERVICE;
if (!databaseUrl || !serviceUrl) {
  throw new Error('Beta E2E needs DATABASE_URL and DATABASE_URL_SERVICE for a migrated, system/demo-seeded local database.');
}

/** Task 12 / P5-T12b: isolated, explicitly selected Arabic and English beta gates. */
export default defineConfig({
  testDir: './e2e/beta',
  globalSetup: './e2e/beta/warm-up.ts',
  outputDir: './test-results/beta',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  // The server is `next dev`, which compiles each route on its first visit; on a loaded PC that took 10 to 15 s
  // per route (trace of e2e-ar-trace2). On 25 Nov the PC was short of memory (under 1 GB free) and the page that a
  // successful mutation navigates to took more than 45 s in most full runs, at a different step each time (sampler
  // log in OPEN_DECISIONS 31). Assertions are unchanged; only the wait for them is longer (45 s to 120 s).
  expect: { timeout: 120_000 },
  use: {
    baseURL: 'http://localhost:3220',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    timezoneId: 'Africa/Cairo',
    reducedMotion: 'reduce',
    navigationTimeout: 240_000,
    actionTimeout: 60_000,
    // Invitation tokens and signed development cookies must remain in memory.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'e2e-ar', grep: /@ar\b/, use: { locale: 'ar-EG' } },
    { name: 'e2e-en', grep: /@en\b/, use: { locale: 'en-EG' } },
  ],
  webServer: {
    command: 'pnpm exec next dev --port 3220',
    url: 'http://localhost:3220/ar/login',
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      NODE_ENV: 'development',
      DAWLYY_DIST_DIR: '.next-e2e',
      DAWLYY_DEV_LOGIN: '1',
      DAWLYY_DEV_LOGIN_SECRET: process.env.DAWLYY_DEV_LOGIN_SECRET
        || '0123456789abcdef0123456789abcdef0123456789abcdef',
      DATABASE_URL: databaseUrl,
      DATABASE_URL_SERVICE: serviceUrl,
      // Force the existing filesystem adapter, even on a machine with Supabase configured.
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3220',
    },
  },
});
