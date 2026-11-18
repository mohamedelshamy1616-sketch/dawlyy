import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { closeDb, type AuthContext } from '../src/client';
import { buildPrivateFixture, mkMembership, truncateAll, type Fixture } from './fixtures';
import { as, expectCode, expectGuard, expectNoEffect, expectRls, one, q, serviceRow, svc } from './helpers';

// R4b/P9 only: unchanged runtime RLS/guards, independently of Hono. Never run in worktree acceptance.
let f: Fixture;
let reviewer: AuthContext;
const inputHash = 'a'.repeat(64);
const inputVersion = 'review-v1:2026-11-01:2026-11-07';
beforeAll(async () => {
  f = await buildPrivateFixture();
  reviewer = await mkMembership(f.s1, { permissions: {
    client_scope: 'assigned', modules: { clients: ['view'], checkins: ['review'], messages: ['create'] },
  } });
});
afterAll(async () => { try { await truncateAll(); } finally { await closeDb(); } });
async function draft(client = f.ua, creator = f.o1) {
  const id = randomUUID();
  await as(creator, tx => q(tx, sql`insert into ai_drafts
    (id,tenant_id,client_id,kind,input_hash,input_version,body,provider)
    values (${id}::uuid,${client.tenantId}::uuid,${client.clientId}::uuid,'week_review',${inputHash},${inputVersion},
      '{"text":"coach-owned reply","context":{"locale":"en"}}'::jsonb,'none')`));
  return id;
}
function approve(actor: AuthContext, id: string, hash = inputHash) {
  return as(actor, tx => one<{ status: string }>(tx, sql`select app.approve_ai_draft(${id}::uuid,${hash}) as status`));
}

describe('R4b review API backing database boundary', () => {
  it('hides private drafts from clients, foreign tenants and unassigned reviewers', async () => {
    const id = await draft(), other = await draft(f.ub), foreign = await draft(f.uc, f.o2);
    for (const [actor, target] of [[f.ua, id], [f.o2, id], [reviewer, other], [f.o1, foreign]] as const) {
      expect(await as(actor, tx => q(tx, sql`select id,body from ai_drafts where id = ${target}::uuid`))).toEqual([]);
      await expectNoEffect(actor, sql`update ai_drafts set body = '{"text":"stolen"}'::jsonb where id = ${target}::uuid`,
        'ai_drafts', sql`id = ${target}::uuid`);
      await expectCode(approve(actor, target), '42501');
    }
  });
  it('refuses client, foreign and unassigned inserts even with known IDs', async () => {
    for (const [actor, tenantId, clientId] of [[f.ua, f.t1, f.clientA], [f.o1, f.t2, f.clientC], [reviewer, f.t1, f.clientB]] as const) {
      const id = randomUUID();
      await expectRls(as(actor, tx => q(tx, sql`insert into ai_drafts
        (id,tenant_id,client_id,kind,input_hash,input_version,body)
        values (${id}::uuid,${tenantId}::uuid,${clientId}::uuid,'week_review',${inputHash},${inputVersion},'{}'::jsonb)`)));
      expect(await serviceRow('ai_drafts', id)).toBeUndefined();
    }
  });
  it('requires checkins/review on approval even for visible rows', async () => {
    const id = await draft();
    await expectCode(approve(f.s1, id), '42501');
    await expectCode(approve(f.ua, id), '42501');
    await expectCode(approve(reviewer, randomUUID()), '42501');
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ status: 'draft', approved_by: null, approved_at: null });
  });
  for (const status of ['approved', 'stale'] as const) it(`refuses direct ${status} for owner and reviewer`, async () => {
    const id = await draft();
    for (const actor of [f.o1, reviewer]) await expectGuard(as(actor, tx => q(tx,
      sql`update ai_drafts set status = ${status} where id = ${id}::uuid`)), 'transitions', 'status');
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ status: 'draft' });
  });
  const protectedColumns: Array<[string, SQL]> = [
    ['input_hash', sql`${'b'.repeat(64)}`], ['input_version', sql`'forged-version'`], ['provider', sql`'openrouter'`],
    ['approved_by', sql`${randomUUID()}::uuid`], ['approved_at', sql`now()`],
  ];
  for (const [column, value] of protectedColumns) it(`keeps ${column} immutable for owner and staff`, async () => {
    const id = await draft(), before = await serviceRow('ai_drafts', id);
    for (const actor of [f.o1, reviewer]) await expectGuard(as(actor, tx => q(tx,
      sql`update ai_drafts set ${sql.identifier(column)} = ${value} where id = ${id}::uuid`)), 'immutable', column);
    expect(await serviceRow('ai_drafts', id)).toEqual(before);
  });
  it('stamps the real creator/approver once, audits once and freezes the body', async () => {
    const id = await draft(f.ua, reviewer);
    expect(await approve(f.o1, id)).toEqual({ status: 'approved' });
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ created_by: reviewer.userId, approved_by: f.o1.userId,
      approved_at: expect.any(Date), status: 'approved', input_hash: inputHash, input_version: inputVersion, provider: 'none' });
    expect(await svc(tx => q(tx, sql`select actor_user_id,actor_role from audit_log
      where tenant_id = ${f.t1}::uuid and entity = 'ai_drafts' and entity_id = ${id}
      and "before"->>'status' = 'draft' and "after"->>'status' = 'approved'`), f.t1))
      .toEqual([{ actor_user_id: f.o1.userId, actor_role: 'owner' }]);
    await expectCode(approve(reviewer, id), 'P0001');
    await expectGuard(as(f.o1, tx => q(tx, sql`update ai_drafts set body = '{}'::jsonb where id = ${id}::uuid`)), 'editable_in', 'body');
  });
  it('commits stale and leaves approval attribution null', async () => {
    const id = await draft();
    expect(await approve(reviewer, id, 'b'.repeat(64))).toEqual({ status: 'stale' });
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ status: 'stale', approved_by: null, approved_at: null });
    await expectGuard(as(reviewer, tx => q(tx, sql`update ai_drafts set body = '{}'::jsonb where id = ${id}::uuid`)), 'editable_in', 'body');
  });
  it('rolls approval and its audit back when later transactional work fails', async () => {
    const id = await draft();
    await expect(as(reviewer, async tx => {
      await q(tx, sql`select app.approve_ai_draft(${id}::uuid,${inputHash})`);
      throw new Error('simulated downstream send failure');
    })).rejects.toThrow('simulated downstream send failure');
    expect(await serviceRow('ai_drafts', id)).toMatchObject({ status: 'draft', approved_by: null, approved_at: null });
    expect(await svc(tx => q(tx, sql`select id from audit_log where tenant_id = ${f.t1}::uuid
      and entity = 'ai_drafts' and entity_id = ${id} and "after"->>'status' = 'approved'`), f.t1)).toEqual([]);
  });
  it('serializes two actual approval transactions: one wins and one receives P0001', async () => {
    const id = await draft();
    const results = await Promise.allSettled([approve(reviewer, id), approve(f.o1, id)]);
    const successes = results.filter(result => result.status === 'fulfilled');
    expect(successes).toHaveLength(1);
    expect(successes[0]).toMatchObject({ value: { status: 'approved' } });
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status !== 'rejected') throw new Error('Concurrent function retry must be refused');
    await expectCode(Promise.reject(failure.reason), 'P0001');
    expect([reviewer.userId, f.o1.userId]).toContain((await serviceRow('ai_drafts', id))?.approved_by);
    expect(await svc(tx => q(tx, sql`select id from audit_log where tenant_id = ${f.t1}::uuid
      and entity = 'ai_drafts' and entity_id = ${id} and "after"->>'status' = 'approved'`), f.t1)).toHaveLength(1);
  });
});
