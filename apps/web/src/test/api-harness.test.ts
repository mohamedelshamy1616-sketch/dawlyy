import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { call, setupApiFixture } from './api-harness';

describe.runIf(Boolean(process.env.DATABASE_URL))('database-backed API authentication', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  let app: (typeof import('@/src/api/index'))['app'];

  beforeAll(async () => {
    vi.stubEnv('DAWLYY_DEV_LOGIN', '0');
    fixture = await setupApiFixture();
    app = (await import('@/src/api/index')).app;
  });

  afterAll(async () => {
    try {
      await fixture?.cleanup();
    } finally {
      const { closeDb } = await import('@dawlyy/db');
      await closeDb();
      vi.unstubAllEnvs();
    }
  });

  it('GET /api/v1/me resolves an owner through the real membership boundary', async () => {
    const result = await call(app, 'GET', '/api/v1/me', { as: fixture.owner.userId });
    expect(result.status).toBe(200);
    expect(result.json).toEqual({
      userId: fixture.owner.userId,
      tenantId: fixture.owner.tenantId,
      membershipId: fixture.owner.membershipId,
      role: 'owner',
    });
  });

  it('GET /api/v1/me rejects a signed-out caller', async () => {
    expect(await call(app, 'GET', '/api/v1/me')).toEqual({
      status: 401,
      json: { error: { code: 'unauthenticated', message: 'Authentication required' } },
    });
  });
});
