import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { FormDocument } from '@dawlyy/core/types';
import { formSubmissions, forms, formVersions, mealLogs, memberships, redFlags, staffClientAssignments } from '@dawlyy/db/schema';
import { call, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import { withAuthTx } from '../server/db';
import { raiseRedFlags } from '../server/red-flags';
import { app } from './index';

const idOf = (json: unknown) => z.object({ id: z.string() }).parse(json).id;
const flags = z.object({ items: z.array(z.object({ id: z.string(), clientId: z.string(), source: z.string(), sourceId: z.string(), category: z.string(), matched: z.string(), status: z.string(), handledBy: z.string().nullable(), handledAt: z.string().nullable() })), nextCursor: z.string().nullable() });

describe('R0c/R4c deterministic red flags in authenticated source transactions', () => {
  let f: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined); f = await trackingFixture(); });
  afterEach(async () => { try { await f?.cleanup(); } finally { vi.unstubAllEnvs(); } });
  async function list(status = 'open', suffix = '') {
    const response = await call(app, 'GET', `/api/v1/red-flags?status=${status}${suffix}`, { as: f.owner.userId });
    expect(response.status).toBe(200); return flags.parse(response.json);
  }
  async function message(text = 'I have knee pain', actor = f.a) {
    const opened = await call(app, 'POST', '/api/v1/conversations', { as: f.owner.userId, body: { clientId: actor.clientId } });
    expect([200, 201]).toContain(opened.status); const conversationId = idOf(opened.json);
    const body = { clientUuid: randomUUID(), body: text };
    const sent = await call(app, 'POST', `/api/v1/conversations/${conversationId}/messages`, { as: actor.userId, body });
    expect(sent.status).toBe(201); return { id: idOf(sent.json), conversationId, body };
  }
  it('message evidence revisions create separate flags; retries dedupe and handling preserves attribution', async () => {
    const source = await message();
    const open = await list(); expect(open.items).toHaveLength(1);
    const flag = open.items[0]!;
    expect(flag).toMatchObject({ clientId: f.a.clientId, source: 'message', sourceId: source.id, category: 'pain_injury', status: 'open', handledBy: null, handledAt: null });
    expect((await call(app, 'GET', '/api/v1/red-flags', { as: f.a.userId })).status).toBe(403);
    expect((await call(app, 'POST', `/api/v1/red-flags/${flag.id}/handle`, { as: f.a.userId })).status).toBe(403);
    expect((await call(app, 'POST', `/api/v1/conversations/${source.conversationId}/messages`, { as: f.a.userId, body: source.body })).status).toBe(200);
    expect((await call(app, 'PATCH', `/api/v1/conversations/${source.conversationId}/messages/${source.id}`, { as: f.a.userId, body: { body: 'There is still knee pain' } })).status).toBe(200);
    const revised = (await list()).items; expect(revised).toHaveLength(2);
    const secondFlag = revised.find(row => row.id !== flag.id)!;
    const handled = await call(app, 'POST', `/api/v1/red-flags/${flag.id}/handle`, { as: f.owner.userId, headers: { 'Idempotency-Key': randomUUID() } });
    expect(handled.status).toBe(200); expect(handled.json).toMatchObject({ id: flag.id, status: 'handled', handledBy: f.owner.userId, handledAt: expect.any(String) });
    expect((await list()).items).toEqual([secondFlag]);
    expect((await call(app, 'POST', `/api/v1/red-flags/${secondFlag.id}/handle`, { as: f.owner.userId })).status).toBe(200);
    expect((await list()).items).toHaveLength(0); expect((await list('handled')).items).toHaveLength(2);
    expect((await call(app, 'POST', `/api/v1/red-flags/${flag.id}/handle`, { as: f.owner.userId })).json).toEqual(handled.json);
    const history = (await list('handled')).items;
    const edit = () => call(app, 'PATCH', `/api/v1/conversations/${source.conversationId}/messages/${source.id}`,
      { as: f.a.userId, body: { body: 'The knee pain is much worse' } });
    expect((await edit()).status).toBe(200);
    const next = (await list()).items; expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ sourceId: source.id, category: 'pain_injury', status: 'open', handledBy: null, handledAt: null });
    expect(history.map(row => row.id)).not.toContain(next[0]!.id);
    expect((await edit()).status).toBe(200);
    expect((await list()).items).toEqual(next);
    expect((await list('handled')).items).toEqual(history);
    expect((await call(app, 'GET', '/api/v1/red-flags?status=unknown', { as: f.owner.userId })).status).toBe(400);
  });
  it('staff grants and assigned-client scope govern listing and either review permission handles', async () => {
    await message(); const outside = await message('Back pain', f.b);
    const reviewer = randomUUID(), memberId = randomUUID(), noReview = randomUUID();
    await setupApiData(f.owner.tenantId, 'red flag scoped staff', async tx => {
      await tx.insert(memberships).values([
        { id: memberId, tenantId: f.owner.tenantId, userId: reviewer, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { clients: ['view'], checkins: ['review'] } } },
        { tenantId: f.owner.tenantId, userId: noReview, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { clients: ['view'] } } },
      ]);
      await tx.insert(staffClientAssignments).values({ tenantId: f.owner.tenantId, membershipId: memberId, clientId: f.a.clientId });
    });
    const response = await call(app, 'GET', '/api/v1/red-flags', { as: reviewer }); expect(response.status).toBe(200);
    const visible = flags.parse(response.json); expect(visible.items).toHaveLength(1); const own = visible.items[0]!;
    expect((await call(app, 'POST', `/api/v1/red-flags/${own.id}/handle`, { as: noReview })).status).toBe(403);
    expect((await call(app, 'POST', `/api/v1/red-flags/${own.id}/handle`, { as: reviewer })).status).toBe(200);
    const outsideFlag = (await list()).items.find(row => row.sourceId === outside.id)!;
    expect((await call(app, 'POST', `/api/v1/red-flags/${outsideFlag.id}/handle`, { as: reviewer })).status).toBe(404);
  });
  it('meal notes and corrections flag actual persisted text; negation creates no flag', async () => {
    const meal = (note: string) => ({ clientUuid: randomUUID(), localDate: '2026-11-13', status: 'eaten', freeEntry: { text: 'Lunch' }, note, clientUpdatedAt: new Date().toISOString() });
    const first = await call(app, 'POST', '/api/v1/meal-logs', { as: f.a.userId, body: meal('No pain') }); expect(first.status).toBe(200);
    expect((await list()).items).toHaveLength(0);
    const corrected = await call(app, 'POST', `/api/v1/meal-logs/${idOf(first.json)}/correct`, { as: f.a.userId, body: meal('I have pain') }); expect(corrected.status).toBe(201);
    expect((await list()).items).toEqual([expect.objectContaining({ source: 'meal_note', sourceId: idOf(corrected.json), category: 'pain_injury' })]);
    const flag = (await list()).items[0]!;
    expect((await call(app, 'POST', `/api/v1/red-flags/${flag.id}/handle`, { as: f.owner.userId })).status).toBe(200);
    const history = (await list('handled')).items;
    const replacementBody = meal('The pain is much worse');
    const replacement = await call(app, 'POST', `/api/v1/meal-logs/${idOf(corrected.json)}/correct`,
      { as: f.a.userId, body: replacementBody });
    expect(replacement.status).toBe(201);
    const next = (await list()).items;
    expect(next).toEqual([expect.objectContaining({ source: 'meal_note', sourceId: idOf(replacement.json), category: 'pain_injury', status: 'open' })]);
    expect(next[0]!.id).not.toBe(flag.id);
    expect((await call(app, 'POST', '/api/v1/meal-logs', { as: f.a.userId, body: replacementBody })).status).toBe(200);
    expect((await list()).items).toEqual(next);
    expect((await list('handled')).items).toEqual(history);
  });
  it('only text-type checkin answers are detected on insert, update and submit', async () => {
    const formId = randomUUID(), versionId = randomUUID(), id = randomUUID();
    const document = FormDocument.parse({ sections: [{ id: 's', title: { en: 'Week' }, questions: [
      { id: 'note', type: 'long_text', label: { en: 'Notes' } },
      { id: 'choice', type: 'single', label: { en: 'Choice' }, options: [{ value: 'medication', label: { en: 'Medication' } }] },
    ] }] });
    await setupApiData(f.owner.tenantId, 'red flag checkin source', async tx => {
      await tx.insert(forms).values({ id: formId, tenantId: f.owner.tenantId, name: { en: 'Checkin' }, kind: 'template', formKind: 'checkin' });
      await tx.insert(formVersions).values({ id: versionId, tenantId: f.owner.tenantId, formId, versionNo: 1, status: 'published', publishedAt: new Date(), document });
      await tx.insert(formSubmissions).values({ id, tenantId: f.owner.tenantId, clientId: f.a.clientId, formId, formVersionId: versionId, formKind: 'checkin', state: 'due' });
    });
    const body = { clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), answers: { note: 'Knee pain', choice: 'medication' } };
    expect((await call(app, 'PUT', `/api/v1/submissions/${id}/answers`, { as: f.a.userId, body })).status).toBe(200);
    expect((await list()).items).toEqual([expect.objectContaining({ source: 'checkin', sourceId: id, category: 'pain_injury' })]);
    const flag = (await list()).items[0]!;
    expect((await call(app, 'POST', `/api/v1/red-flags/${flag.id}/handle`, { as: f.owner.userId })).status).toBe(200);
    const history = (await list('handled')).items;
    const save = (answers: Record<string, string>, offset: number) => call(app, 'PUT', `/api/v1/submissions/${id}/answers`,
      { as: f.a.userId, body: { ...body, answers, clientUpdatedAt: new Date(Date.parse(body.clientUpdatedAt) + offset).toISOString() } });
    // Non-text answers do not change the evidence, even after handling.
    expect((await save({ note: 'Knee pain' }, 1000)).status).toBe(200);
    expect((await list()).items).toHaveLength(0);
    expect((await save({ note: 'The knee pain is much worse' }, 2000)).status).toBe(200);
    const next = (await list()).items;
    expect(next).toEqual([expect.objectContaining({ source: 'checkin', sourceId: id, category: 'pain_injury', status: 'open' })]);
    expect(next[0]!.id).not.toBe(flag.id);
    expect((await list('handled')).items).toEqual(history);
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.a.userId })).status).toBe(200);
    expect((await list()).items).toHaveLength(1);
  });
  it('newest-first keyset pages and client filter have no duplicates', async () => {
    for (let n = 0; n < 3; n++) await message(`Knee pain ${n}`);
    await message('Back pain', f.b);
    const first = await list('open', `&clientId=${f.a.clientId}&limit=2`); expect(first.items).toHaveLength(2); expect(first.nextCursor).not.toBeNull();
    const second = await list('open', `&clientId=${f.a.clientId}&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`); expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(3);
    const rows = await setupApiData(f.owner.tenantId, 'inspect source/category dedupe', tx => tx.select({ id: redFlags.id }).from(redFlags).where(and(eq(redFlags.tenantId, f.owner.tenantId), eq(redFlags.clientId, f.a.clientId))));
    expect(rows).toHaveLength(3);
  });

  it('a red-flag source refusal aborts the enclosing source transaction', async () => {
    const id = randomUUID();
    await expect(withAuthTx(f.owner, async tx => {
      await tx.insert(mealLogs).values({ id, tenantId: f.owner.tenantId, clientId: f.a.clientId,
        clientUuid: randomUUID(), localDate: '2026-11-13', freeEntry: { text: 'Lunch' }, status: 'eaten', note: 'Knee pain' });
      // An incorrect source id is a programming bug. It must never silently drop the flag.
      await raiseRedFlags(tx, 'meal_note', randomUUID(), 'Knee pain');
    })).rejects.toMatchObject({ status: 500, code: 'internal_error' });
    const persisted = await setupApiData(f.owner.tenantId, 'source write rollback', tx => tx.select({ id: mealLogs.id }).from(mealLogs).where(eq(mealLogs.id, id)));
    expect(persisted).toEqual([]);
    expect((await list()).items).toEqual([]);
  });
});
