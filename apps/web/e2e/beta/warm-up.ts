/**
 * Playwright globalSetup for the beta gates: touch the first routes one at a time before any spec runs.
 *
 * `next dev` compiles a route on its first request. Right after a clean `.next-e2e` the first spec opens a page and the
 * API at the same moment, and in run_checks at 838e503 that raced inside Next ("Unexpected end of JSON input" while
 * compiling /api/v1/me/app, one 500 in step 1 of beta-gate @en). Warming the routes in sequence takes the race out. It
 * asserts nothing and ignores every status and error: the specs own all checks.
 */
import type { FullConfig } from '@playwright/test';

const PATHS = ['/ar/login', '/en/login', '/api/v1/me/app', '/api/v1/me'];

export default async function warmUp(config: FullConfig): Promise<void> {
  const base = config.projects[0]?.use.baseURL ?? 'http://localhost:3220';
  for (const path of PATHS) {
    try {
      await fetch(new URL(path, base), { redirect: 'manual', signal: AbortSignal.timeout(240_000) });
    } catch {
      // The warm-up is best effort; a failure here shows up in the specs.
    }
  }
}
