import { describe, expect, it } from 'vitest';
import { proofScreenName, REINVENT_PROOF_WIDTHS, reinventProofRoutes } from './manifest';

// R5: pure inventory checks. Routes of R2b, R2c and R4b are asserted as stable strings only: nothing here looks for
// their source files on disk.
const CLIENT = 'd0250000-0000-4000-8000-000000000301';
const OTHER = '11111111-2222-4333-8444-555555555555';

describe('REINVENT_PROOF_WIDTHS', () => {
  it('is exactly the four screen widths then Astryx 375 and 1440, without duplicates', () => {
    expect([...REINVENT_PROOF_WIDTHS]).toEqual([360, 390, 430, 1366, 375, 1440]);
    expect(new Set(REINVENT_PROOF_WIDTHS).size).toBe(REINVENT_PROOF_WIDTHS.length);
  });
});

describe('reinventProofRoutes', () => {
  const routes = reinventProofRoutes(CLIENT);
  const byId = new Map(routes.map(route => [route.id, route]));

  it('is deterministic and keeps ids unique and safe to use in a file name', () => {
    expect(reinventProofRoutes(CLIENT)).toEqual(routes);
    expect(byId.size).toBe(routes.length);
    for (const route of routes) {
      expect(route.id, route.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(route.path.startsWith(`/${route.area}`), `${route.id} lives in its own area`).toBe(true);
      expect(route.path, route.id).not.toMatch(/^\/(?:ar|en)(?:\/|$)/);
      expect(route.path, route.id).not.toContain('..');
    }
  });

  it('puts the caller-supplied client id in every client route and in no other', () => {
    const other = reinventProofRoutes(OTHER);
    expect(other.map(route => route.id)).toEqual(routes.map(route => route.id));
    for (const route of routes) {
      const mate = other.find(candidate => candidate.id === route.id);
      expect(mate?.path, route.id).toBe(route.path.replaceAll(CLIENT, OTHER));
      expect(route.path.includes(CLIENT)).toBe(route.id.startsWith('coach-client-') && route.id !== 'coach-clients-archived');
    }
    expect(byId.get('coach-client-hub')?.path).toBe(`/coach/clients/${CLIENT}`);
    expect(byId.get('coach-client-review')?.path).toBe(`/coach/clients/${CLIENT}/review`);
    expect(byId.get('coach-client-app')?.path).toBe(`/coach/clients/${CLIENT}/client-app`);
  });

  it('represents every new stable route of R1b, R2a, R2b, R2c, R3a, R3b, R4b and R4d', () => {
    const paths = new Set(routes.map(route => route.path));
    const wanted = ['/coach', '/coach/library', '/coach/money', `/coach/clients/${CLIENT}`,
      '/app/today', '/app/plan', '/app/coach', '/app/me', '/app/workout/start',
      '/app/history', '/app/nutrition/history', '/app/nutrition/log',
      '/coach/settings/client-app', `/coach/clients/${CLIENT}/client-app`,
      '/coach/clients?archived=true', '/coach/programs?archived=true', '/coach/packages?archived=true',
      '/coach/settings/activity', '/coach/settings/activity/version/program/d0250000-0000-4000-8000-000000000501/1',
      `/coach/clients/${CLIENT}/review`, '/coach/settings/review', '/coach/settings/ai'];
    for (const path of wanted) expect(paths.has(path), path).toBe(true);
    const owners = new Set(routes.map(route => route.owner));
    expect([...owners].sort()).toEqual(['r1b', 'r2a', 'r2b', 'r2c', 'r3a', 'r3b', 'r4b', 'r4d']);
  });

  it('gives every list an empty and a refused or retryable state, and keeps normal screens to one content row per route', () => {
    for (const list of ['coach-inbox', 'coach-client-hub-assign', 'app-nutrition-log', 'coach-settings-activity']) {
      expect(routes.some(route => route.id.startsWith(list) && route.state === 'empty'), `${list} empty`).toBe(true);
    }
    for (const list of ['coach-inbox', 'coach-client-hub-assign', 'app-nutrition-log', 'coach-settings-activity']) {
      expect(routes.some(route => route.id.startsWith(list) && (route.state === 'error' || route.state === 'unavailable')), `${list} refused or retryable`).toBe(true);
    }
    expect(byId.get('app-today-modules-off')?.state).toBe('unavailable');
    expect(byId.get('coach-settings-ai')?.state).toBe('unavailable');
    const contentPaths = routes.filter(route => route.state === 'content').map(route => route.path);
    expect(new Set(contentPaths).size).toBe(contentPaths.length);
  });

  it('rejects a client id that is not a UUID with a message that names the argument', () => {
    for (const bad of ['', 'not-a-uuid', `${CLIENT}/../x`, `${CLIENT}x`, '../../etc', '11111111-2222-4333-8444-55555555555']) {
      expect(() => reinventProofRoutes(bad), JSON.stringify(bad)).toThrow(/clientId must be a UUID/);
    }
  });
});

describe('proofScreenName', () => {
  it('builds the role-route-locale-width name used by the screens index', () => {
    expect(proofScreenName({ role: 'owner', routeId: 'coach-library', locale: 'ar', width: 360 })).toBe('owner-coach-library-ar-360.png');
    expect(proofScreenName({ role: 'client', routeId: 'app-plan', locale: 'en', width: 1440 })).toBe('client-app-plan-en-1440.png');
  });

  it('is deterministic and carries role, locale and width, so no two captures can share a name', () => {
    const names = new Set<string>();
    for (const role of ['owner', 'client'] as const) {
      for (const locale of ['ar', 'en'] as const) {
        for (const width of REINVENT_PROOF_WIDTHS) names.add(proofScreenName({ role, routeId: 'app-today', locale, width }));
      }
    }
    expect(names.size).toBe(2 * 2 * REINVENT_PROOF_WIDTHS.length);
    expect(proofScreenName({ role: 'owner', routeId: 'app-today', locale: 'ar', width: 390 })).toBe(proofScreenName({ role: 'owner', routeId: 'app-today', locale: 'ar', width: 390 }));
  });

  it('rejects traversal, empty or unsafe route ids', () => {
    for (const routeId of ['', '../secret', 'a/b', 'a\\b', 'Upper', 'a b', '-lead', 'trail-', 'double--hyphen', 'x'.repeat(97), 'a.png']) {
      expect(() => proofScreenName({ role: 'owner', routeId, locale: 'en', width: 390 }), JSON.stringify(routeId)).toThrow(/routeId/);
    }
  });

  it('rejects unsupported widths, locales and roles', () => {
    for (const width of [0, 320, 361, 1024, Number.NaN, -360]) {
      expect(() => proofScreenName({ role: 'owner', routeId: 'coach-money', locale: 'en', width }), String(width)).toThrow(/width must be one of/);
    }
    expect(() => proofScreenName({ role: 'owner', routeId: 'coach-money', locale: 'fr' as 'ar', width: 390 })).toThrow(/locale/);
    expect(() => proofScreenName({ role: 'staff' as 'owner', routeId: 'coach-money', locale: 'en', width: 390 })).toThrow(/role/);
  });
});
