/**
 * R5: the proof inventory. One typed list of the routes the reinvention added, shared by the screen capture
 * (e2e/screens.spec.ts) and the P9 polish spec (e2e/beta/r5-polish-proof.spec.ts). It is proof infrastructure,
 * not app navigation, and it reads no environment, clock, cookie or database.
 *
 * `state` names the fixture a screenshot needs, so the normal screen is not captured five times:
 *   content      the ordinary seeded screen (the only state e2e/screens.spec.ts captures);
 *   empty        a list with nothing to show (needs an empty fixture, or a synthetic same-origin response);
 *   loading      the temporary pending view (must settle before it can count as a result);
 *   error        a retryable failed read;
 *   unavailable  refused or switched off: no permission, module disabled, provider off.
 */
export type ReinventProofRoute = {
  id: string;
  area: 'coach' | 'app';
  path: string;
  owner: 'r1b' | 'r2a' | 'r2b' | 'r2c' | 'r3a' | 'r3b' | 'r4b' | 'r4d';
  state: 'content' | 'empty' | 'loading' | 'error' | 'unavailable';
};

/** Phone small/common/large, desktop, then Astryx's own proof widths (375 and 1440). */
export const REINVENT_PROOF_WIDTHS: readonly number[] = [360, 390, 430, 1366, 375, 1440];

/** The seeded demo program head (packages/db/seed/demo/ids.ts), whose version 1 the seed inserts. Constant by design: no seed import. */
const DEMO_PROGRAM_HEAD = 'd0250000-0000-4000-8000-000000000501';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Every route the reinvention added or reshaped, for a caller-supplied client id.
 * Throws a descriptive Error when `clientId` is not a UUID, so a typo cannot build a path to the wrong record.
 */
export function reinventProofRoutes(clientId: string): readonly ReinventProofRoute[] {
  if (typeof clientId !== 'string' || !UUID.test(clientId)) throw new Error(`reinventProofRoutes: clientId must be a UUID, got ${JSON.stringify(clientId)}`);
  const client = `/coach/clients/${clientId}`;
  return [
    // R1b: the ranked inbox, the two hubs, and the R1c client hub they lead to.
    { id: 'coach-inbox', area: 'coach', path: '/coach', owner: 'r1b', state: 'content' },
    { id: 'coach-inbox-empty', area: 'coach', path: '/coach', owner: 'r1b', state: 'empty' },
    { id: 'coach-inbox-no-access', area: 'coach', path: '/coach', owner: 'r1b', state: 'unavailable' },
    { id: 'coach-library', area: 'coach', path: '/coach/library', owner: 'r1b', state: 'content' },
    { id: 'coach-money', area: 'coach', path: '/coach/money', owner: 'r1b', state: 'content' },
    { id: 'coach-client-hub', area: 'coach', path: client, owner: 'r1b', state: 'content' },
    { id: 'coach-client-hub-assign-empty', area: 'coach', path: client, owner: 'r1b', state: 'empty' },
    { id: 'coach-client-hub-assign-error', area: 'coach', path: client, owner: 'r1b', state: 'error' },
    // R2a: the client app's five destinations and Start.
    { id: 'app-today', area: 'app', path: '/app/today', owner: 'r2a', state: 'content' },
    { id: 'app-plan', area: 'app', path: '/app/plan', owner: 'r2a', state: 'content' },
    { id: 'app-coach', area: 'app', path: '/app/coach', owner: 'r2a', state: 'content' },
    { id: 'app-me', area: 'app', path: '/app/me', owner: 'r2a', state: 'content' },
    { id: 'app-workout-start', area: 'app', path: '/app/workout/start', owner: 'r2a', state: 'content' },
    // R2b: corrections and quick log, on the existing history and nutrition routes.
    { id: 'app-history', area: 'app', path: '/app/history', owner: 'r2b', state: 'content' },
    { id: 'app-nutrition-history', area: 'app', path: '/app/nutrition/history', owner: 'r2b', state: 'content' },
    { id: 'app-nutrition-log', area: 'app', path: '/app/nutrition/log', owner: 'r2b', state: 'content' },
    { id: 'app-nutrition-log-empty', area: 'app', path: '/app/nutrition/log', owner: 'r2b', state: 'empty' },
    { id: 'app-nutrition-log-error', area: 'app', path: '/app/nutrition/log', owner: 'r2b', state: 'error' },
    // R2c: client modules. Today with every module off is the "unavailable" view of the same route as app-today.
    { id: 'coach-settings-client-app', area: 'coach', path: '/coach/settings/client-app', owner: 'r2c', state: 'content' },
    { id: 'coach-client-app', area: 'coach', path: `${client}/client-app`, owner: 'r2c', state: 'content' },
    { id: 'app-today-modules-off', area: 'app', path: '/app/today', owner: 'r2c', state: 'unavailable' },
    // R3a: archived lists (the archive itself, undo and restore are R3a's own spec).
    { id: 'coach-clients-archived', area: 'coach', path: '/coach/clients?archived=true', owner: 'r3a', state: 'content' },
    { id: 'coach-programs-archived', area: 'coach', path: '/coach/programs?archived=true', owner: 'r3a', state: 'content' },
    { id: 'coach-packages-archived', area: 'coach', path: '/coach/packages?archived=true', owner: 'r3a', state: 'content' },
    // R3b: the business-wide activity log, an exact version, and its list states.
    { id: 'coach-settings-activity', area: 'coach', path: '/coach/settings/activity', owner: 'r3b', state: 'content' },
    { id: 'coach-settings-activity-empty', area: 'coach', path: '/coach/settings/activity', owner: 'r3b', state: 'empty' },
    { id: 'coach-settings-activity-error', area: 'coach', path: '/coach/settings/activity', owner: 'r3b', state: 'error' },
    { id: 'coach-activity-version', area: 'coach', path: `/coach/settings/activity/version/program/${DEMO_PROGRAM_HEAD}/1`, owner: 'r3b', state: 'content' },
    // R4b: the weekly review and its preferences.
    { id: 'coach-client-review', area: 'coach', path: `${client}/review`, owner: 'r4b', state: 'content' },
    { id: 'coach-client-review-stale', area: 'coach', path: `${client}/review`, owner: 'r4b', state: 'error' },
    { id: 'coach-settings-review', area: 'coach', path: '/coach/settings/review', owner: 'r4b', state: 'content' },
    // R4d: the provider status page (provider none, off without a key and legal review).
    { id: 'coach-settings-ai', area: 'coach', path: '/coach/settings/ai', owner: 'r4d', state: 'unavailable' },
  ];
}

/**
 * The screenshot file name for one capture: `<role>-<routeId>-<locale>-<width>.png`, the same shape
 * e2e/screens.spec.ts has always used. Throws on anything that could escape the screens folder or name no real capture.
 */
export function proofScreenName(input: { role: 'owner' | 'client'; routeId: string; locale: 'ar' | 'en'; width: number }): string {
  const { role, routeId, locale, width } = input;
  if (role !== 'owner' && role !== 'client') throw new Error(`proofScreenName: role must be owner or client, got ${JSON.stringify(role)}`);
  if (typeof routeId !== 'string' || routeId.length === 0 || routeId.length > 96 || !SAFE_ID.test(routeId)) {
    throw new Error(`proofScreenName: routeId must be lowercase words joined by single hyphens, got ${JSON.stringify(routeId)}`);
  }
  if (locale !== 'ar' && locale !== 'en') throw new Error(`proofScreenName: locale must be ar or en, got ${JSON.stringify(locale)}`);
  if (!REINVENT_PROOF_WIDTHS.includes(width)) throw new Error(`proofScreenName: width must be one of ${REINVENT_PROOF_WIDTHS.join(', ')}, got ${String(width)}`);
  return `${role}-${routeId}-${locale}-${width}.png`;
}
