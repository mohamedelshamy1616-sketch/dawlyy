import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeDb, type AuthContext } from '../src/client';
import { buildPrivateFixture, truncateAll } from './fixtures';
import { as, q, serviceRow } from './helpers';

afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
async function register(actor: AuthContext, endpoint: string) {
  return as(actor, async tx => (await q<{ id: string }>(tx,
    sql`select app.register_push(${endpoint}, '{"p256dh":"p","auth":"a"}'::jsonb, 'N2') as id`))[0]!.id);
}
describe('N2 push registration stays within the pinned tenant', () => {
  it('tenant A registering tenant B endpoint preserves B row and creates an independent A row', async () => {
    const f = await buildPrivateFixture(); const endpoint = `https://push.example.test/${randomUUID()}`;
    const b = await register(f.uc, endpoint);
    const before = await serviceRow('push_subscriptions', b);
    const a = await register(f.ua, endpoint);
    expect(a).not.toBe(b);
    expect(await serviceRow('push_subscriptions', b)).toEqual(before);
    expect(await serviceRow('push_subscriptions', a)).toMatchObject({ tenant_id: f.t1, user_id: f.ua.userId, endpoint });
    expect(await register(f.uc, endpoint)).toBe(b);
  });
  it('still hands an endpoint to another user within the caller tenant', async () => {
    const f = await buildPrivateFixture(); const endpoint = `https://push.example.test/${randomUUID()}`;
    const old = await register(f.ua, endpoint); const replacement = await register(f.ub, endpoint);
    expect(await serviceRow('push_subscriptions', old)).toBeUndefined();
    expect(await serviceRow('push_subscriptions', replacement)).toMatchObject({ tenant_id: f.t1, user_id: f.ub.userId });
  });
});
