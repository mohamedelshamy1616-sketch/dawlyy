import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { emptyProgram } from '@dawlyy/core/program-edit';
import { aiDrafts, clients, foods, mealLogs, measurementSets, memberships, messages, metricEntries, programs, programVersions, workoutSessions,
  nutritionPlans, nutritionPlanVersions, redFlags, staffClientAssignments } from '@dawlyy/db/schema';
import type { StaffPermissions } from '@dawlyy/core/authz';
import type { NutritionDocument } from '@dawlyy/core/types';
import { call, setupActiveSubscription, setupApiData } from '../test/api-harness';
import { trackingFixture } from '../server/tracking/test-fixture';
import * as messaging from '../server/messaging/service';
import type { ReviewDraftDto, ReviewProposalDraft } from '../server/review/types';
import { app } from './index';

// R4b/P9 only. Apply integration/r4b.md first; identity alone is faked by the real API harness.
// Send and evidence queries use real transactions. Only post-commit notification delivery is suppressed.
const period = { from: '2026-11-01', to: '2026-11-14' };
const sourceGrants: StaffPermissions['modules'] = { clients: ['view'], checkins: ['view', 'review'],
  messages: ['view', 'create'], programs: ['view'], exercises: ['view'], nutrition: ['view', 'edit'], tracking: ['view'],
  calendar: ['view'], billing: ['view'], forms: ['view'], dashboard: ['view'] };

describe('R4b real API isolation, approval commit and message atomicity', () => {
  let f: Awaited<ReturnType<typeof trackingFixture>>;
  beforeEach(async () => {
    f = await trackingFixture();
    await setupActiveSubscription(f.owner.tenantId, f.a.clientId);
    await setupActiveSubscription(f.owner.tenantId, f.b.clientId);
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('P9 review database tests forbid network'); }));
    vi.spyOn(messaging, 'notifyMessage').mockResolvedValue(0);
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await f?.cleanup(); });
  const path = (clientId: string, suffix = '') => `/api/v1/clients/${clientId}/review${suffix}`;
  async function staff(grants = sourceGrants, assigned = true) {
    const userId = randomUUID(), membershipId = randomUUID();
    await setupApiData(f.owner.tenantId, 'review caller with explicit grants', async tx => {
      await tx.insert(memberships).values({ id: membershipId, tenantId: f.owner.tenantId, userId, role: 'staff', status: 'active',
        displayName: 'Different reviewer', permissions: { client_scope: assigned ? 'assigned' : 'all', modules: grants } });
      if (assigned) await tx.insert(staffClientAssignments).values({ tenantId: f.owner.tenantId, membershipId, clientId: f.a.clientId });
    });
    return { userId, membershipId };
  }
  async function build(as = f.owner.userId, clientId = f.a.clientId) {
    const result = await call(app, 'POST', path(clientId), { as, body: { locale: 'en', period } });
    expect(result.status).toBe(201);
    const draft = result.json as ReviewDraftDto;
    expect(draft).toMatchObject({ clientId, status: 'draft', provider: 'none', inputVersion: `review-v1:${period.from}:${period.to}` });
    expect(draft).not.toHaveProperty('inputHash'); expect(draft).not.toHaveProperty('context');
    return draft;
  }
  function approve(draft: ReviewDraftDto, as = f.owner.userId) {
    return call(app, 'POST', path(draft.clientId, `/${draft.id}/approve`), { as, body: { expectedTextHash: draft.textHash } });
  }
  async function snapshot(id: string) {
    return setupApiData(f.owner.tenantId, 'independent review state witness', async tx => {
      const [row] = await tx.select().from(aiDrafts).where(and(eq(aiDrafts.tenantId, f.owner.tenantId), eq(aiDrafts.id, id)));
      if (!row) throw new Error('Missing persisted review'); return row;
    });
  }
  async function linked(id: string) {
    return setupApiData(f.owner.tenantId, 'independent message dedupe witness', tx => tx.select({ id: messages.id,
      body: messages.body, senderUserId: messages.senderUserId, conversationId: messages.conversationId })
      .from(messages).where(and(eq(messages.tenantId, f.owner.tenantId), eq(messages.clientUuid, id))));
  }
  async function proposalFixture(weights: ReadonlyArray<readonly [string, number]> = [['2026-11-01', 90], ['2026-11-07', 88], ['2026-11-14', 86]]) {
    const planId = randomUUID(), versionId = randomUUID(), foodId = randomUUID();
    const document: NutritionDocument = { schemaVersion: 1, targets: { kcal: 2000, proteinG: 120, carbsG: 240, fatG: 60 },
      meals: [{ id: 'meal', name: { en: 'Lunch' }, options: [{ id: 'option', items: [
        { id: 'item', foodId, quantity: 100, measure: { kind: 'g' }, approx: false },
      ] }] }], supplements: [], allergens: [] };
    await setupApiData(f.owner.tenantId, 'published proposal source and falling weights', async tx => {
      await tx.update(clients).set({ profile: { goal: 'lose' } }).where(eq(clients.id, f.a.clientId));
      await tx.insert(foods).values({ id: foodId, tenantId: f.owner.tenantId, slug: `r4b-${foodId}`, name: { en: 'Source food' },
        category: 'test', per100: { kcal: 100, proteinG: 10, carbsG: 10, fatG: 2 } });
      await tx.insert(nutritionPlans).values({ id: planId, tenantId: f.owner.tenantId, clientId: f.a.clientId, kind: 'client', name: { en: 'Source plan' } });
      await tx.insert(nutritionPlanVersions).values({ id: versionId, tenantId: f.owner.tenantId, planId, versionNo: 1,
        status: 'published', document, publishedAt: new Date(), publishedBy: f.owner.userId });
      await tx.update(nutritionPlans).set({ currentVersionId: versionId }).where(eq(nutritionPlans.id, planId));
      for (const [date, value] of weights) {
        await tx.insert(metricEntries).values({ tenantId: f.owner.tenantId, clientId: f.a.clientId, metric: 'weight', value,
          unit: 'kg', source: 'manual', localDate: date, recordedAt: new Date(`${date}T07:00:00Z`), timezone: 'Africa/Cairo', clientUuid: randomUUID() });
      }
    });
    return { planId, versionId, document };
  }
  it('enforces identity, staff grants, scope and tenant isolation on all evidence paths', async () => {
    expect((await call(app, 'GET', path(f.a.clientId))).status).toBe(401);
    expect((await call(app, 'GET', path(f.a.clientId), { as: f.a.userId })).status).toBe(403);
    for (const grants of [{ clients: ['view'] }, { checkins: ['review'] }] as Record<string, string[]>[]) {
      expect((await call(app, 'GET', path(f.a.clientId), { as: (await staff(grants)).userId })).status).toBe(403);
    }
    const assigned = await staff();
    expect((await call(app, 'POST', path(f.b.clientId), { as: assigned.userId, body: { locale: 'en' } })).status).toBe(404);
    expect((await call(app, 'GET', path(randomUUID()), { as: f.owner.userId })).status).toBe(404);
    const foreign = await trackingFixture();
    try { expect((await call(app, 'GET', path(foreign.a.clientId), { as: f.owner.userId })).status).toBe(404); }
    finally { await foreign.cleanup(); }
  });
  it('rejects forged hash A, then commits stale after an equal-value source correction B with zero sends', async () => {
    const id = randomUUID();
    await setupApiData(f.owner.tenantId, 'review measurement source A', tx => tx.insert(measurementSets).values({ id,
      tenantId: f.owner.tenantId, clientId: f.a.clientId, localDate: period.to, clientUuid: randomUUID(), values: [{ type: 'waist', value: 80, unit: 'cm' }] }));
    const draft = await build(), original = await snapshot(draft.id);
    const corrected = await call(app, 'POST', `/api/v1/measurements/${id}/correct`, { as: f.a.userId, body: {
      localDate: period.to, clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString(), values: [{ type: 'waist', value: 80, unit: 'cm' }],
    } });
    expect(corrected.status).toBe(201);
    const send = vi.spyOn(messaging, 'sendMessage');
    expect((await call(app, 'POST', path(f.a.clientId, `/${draft.id}/approve`), { as: f.owner.userId, body: { inputHash: original.inputHash } })).status).toBe(400);
    const result = await approve(draft);
    expect(result).toMatchObject({ status: 409, json: { error: { code: 'review_stale' } } });
    expect(await snapshot(draft.id)).toMatchObject({ status: 'stale', approvedBy: null, approvedAt: null, inputHash: original.inputHash });
    expect(send).not.toHaveBeenCalled(); expect(messaging.notifyMessage).not.toHaveBeenCalled(); expect(await linked(draft.id)).toEqual([]);
    expect((await call(app, 'GET', path(f.a.clientId), { as: f.owner.userId })).json).toMatchObject({ draft: { status: 'stale' } });
  });
  it('preserves protected metadata on text edits, rejects extra keys, and sends exactly the edited prose', async () => {
    const draft = await build(), before = await snapshot(draft.id), text = 'My exact edited coaching reply 123.';
    for (const extra of [{ inputHash: 'x' }, { provider: 'anthropic' }, { context: {} }, { review: {} }]) {
      expect((await call(app, 'PATCH', path(f.a.clientId, `/${draft.id}`), { as: f.owner.userId, body: { text, ...extra } })).status).toBe(400);
    }
    expect(draft.textHash).toBe(createHash('sha256').update(draft.text).digest('hex'));
    const reviewer = await staff();
    const patched = await call(app, 'PATCH', path(f.a.clientId, `/${draft.id}`), {
      as: reviewer.userId, body: { text, expectedTextHash: draft.textHash },
    });
    expect(patched.status).toBe(200);
    const current = patched.json as ReviewDraftDto;
    expect(current.textHash).toBe(createHash('sha256').update(text).digest('hex'));
    const edited = await snapshot(draft.id);
    expect(edited).toMatchObject({ inputHash: before.inputHash, inputVersion: before.inputVersion, provider: before.provider });
    expect(edited.body.context).toEqual(before.body.context); expect(edited.body.review).toEqual(before.body.review);
    expect(await approve(draft)).toMatchObject({ status: 409, json: { error: { code: 'draft_changed', details: { draft: current } } } });
    expect(await snapshot(draft.id)).toMatchObject({ status: 'draft', approvedAt: null });
    expect(await linked(draft.id)).toEqual([]); expect(messaging.notifyMessage).not.toHaveBeenCalled();
    const sent = await approve(current);
    expect(sent.status).toBe(200); expect(await linked(draft.id)).toMatchObject([{ body: text }]);
    expect((await call(app, 'PATCH', path(f.a.clientId, `/${draft.id}`), { as: f.owner.userId, body: { text: 'later edit' } })).status).toBe(409);
  });
  it('rolls the real approval back on a send error; a later retry succeeds', async () => {
    const draft = await build();
    vi.spyOn(messaging, 'sendMessage').mockRejectedValueOnce(new Error('injected send failure'));
    expect((await approve(draft)).status).toBe(500);
    expect(await snapshot(draft.id)).toMatchObject({ status: 'draft', approvedAt: null });
    expect(await linked(draft.id)).toEqual([]); expect(messaging.notifyMessage).not.toHaveBeenCalled();
    expect((await approve(draft)).status).toBe(200);
    expect(await linked(draft.id)).toHaveLength(1);
  });
  it('concurrent double clicks and a different authorized coach return a single original message', async () => {
    const draft = await build();
    const [a, b] = await Promise.all([approve(draft), approve(draft)]);
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(a.json).toMatchObject({ messageId: (b.json as { messageId: string }).messageId });
    expect(await linked(draft.id)).toHaveLength(1);
    const second = await staff();
    const retried = await approve(draft, second.userId);
    expect(retried.status).toBe(200); expect(retried.json).toMatchObject({ messageId: (a.json as { messageId: string }).messageId });
    expect(await linked(draft.id)).toMatchObject([{ senderUserId: f.owner.userId }]);
  });
  it('checks captured source grants before exposing an old summary or edited text', async () => {
    const actor = await staff(), draft = await build(actor.userId);
    await setupApiData(f.owner.tenantId, 'revoke nutrition evidence after drafting', tx => tx.update(memberships)
      .set({ permissions: { client_scope: 'assigned', modules: { clients: ['view'], checkins: ['review'], messages: ['create'] } } })
      .where(eq(memberships.id, actor.membershipId)));
    const read = await call(app, 'GET', path(f.a.clientId), { as: actor.userId });
    expect(read).toMatchObject({ status: 403, json: { error: { code: 'review_evidence_not_allowed' } } });
    expect(JSON.stringify(read.json)).not.toContain(draft.text); expect(read.json).not.toHaveProperty('draft');
  });
  it('missing drafts return 404; messages/create remains required at approval', async () => {
    const draft = await build();
    expect((await approve({ ...draft, id: randomUUID() })).status).toBe(404);
    const actor = await staff({ ...sourceGrants, messages: ['view'] });
    expect((await approve(draft, actor.userId)).status).toBe(403);
    expect(await linked(draft.id)).toEqual([]);
  });
  it('blocks open flags without sending; handling requires rebuild before approval', async () => {
    const flagId = randomUUID();
    await setupApiData(f.owner.tenantId, 'open safety flag', tx => tx.insert(redFlags).values({ id: flagId,
      tenantId: f.owner.tenantId, clientId: f.a.clientId, source: 'message', sourceId: randomUUID(), category: 'pain_injury', matched: 'pain', evidenceHash: 'a'.repeat(64) }));
    const draft = await build();
    expect(await approve(draft))
      .toMatchObject({ status: 409, json: { error: { code: 'red_flags_open' } } });
    expect(await linked(draft.id)).toEqual([]);
    expect((await call(app, 'POST', `/api/v1/red-flags/${flagId}/handle`, { as: f.owner.userId })).status).toBe(200);
    expect(await approve(draft))
      .toMatchObject({ status: 409, json: { error: { code: 'review_stale' } } });
    const rebuilt = await build();
    expect((await approve(rebuilt)).status).toBe(200);
  });
  it.each([
    ['2026-11-01', []],
    ['2026-10-31', ['lower_kcal_flat']],
  ] as const)('uses rolling evidence starting %s for a one-day review', async (first, expected) => {
    const end = period.to;
    await proposalFixture([[first, 80], ['2026-11-07', 80], [end, 80]]);
    const tenantId = f.owner.tenantId, clientId = f.a.clientId;
    await setupApiData(tenantId, 'one planned and completed training day and a logged meal', async tx => {
      const programId = randomUUID();
      const document = emptyProgram({ newId: randomUUID }, { weeks: 1, trainingDays: [0] });
      document.startDate = end;
      await tx.insert(programs).values({ id: programId, tenantId, clientId, kind: 'client', name: { en: 'Training' } });
      await tx.insert(programVersions).values({ tenantId, clientId, programId, versionNo: 1, status: 'published',
        document, publishedAt: new Date(), publishedBy: f.owner.userId });
      await tx.insert(workoutSessions).values({ tenantId, clientId, localDate: end, clientUuid: randomUUID(), state: 'completed', timezone: 'Africa/Cairo' });
      await tx.insert(mealLogs).values({ tenantId, clientId, localDate: end, clientUuid: randomUUID(), status: 'eaten', freeEntry: { text: 'Lunch' } });
    });
    const response = await call(app, 'POST', path(clientId), { as: f.owner.userId, body: { locale: 'en', period: { from: end, to: end } } });
    expect(response.status).toBe(201);
    const { review } = response.json as ReviewDraftDto;
    expect(review.summary.adherence.workouts.percent).toBe(100);
    expect(review.summary.adherence.meals?.percent).toBe(100);
    expect(review.summary.weight.first?.on).toBe(end);
    expect(review.proposals.map(item => item.code)).toEqual(expected);
  });
  it('creates only a nutrition draft, replays its result, and then approves without self-staling', async () => {
    const source = await proposalFixture(), draft = await build();
    const code = draft.review.proposals[0]?.code;
    expect(code).toBe('slow_loss_too_fast');
    const route = path(f.a.clientId, `/${draft.id}/proposal`);
    const a = await call(app, 'POST', route, { as: f.owner.userId, body: { proposalCode: code } });
    expect(a.status).toBe(201);
    const b = await call(app, 'POST', route, { as: f.owner.userId, body: { proposalCode: code } });
    expect(b.status).toBe(200); expect(b.json).toEqual(a.json);
    const result = a.json as ReviewProposalDraft;
    expect(result.planId).toBe(source.planId); expect(result.versionNo).toBe(2); expect(result.versionId).not.toBe(source.versionId);
    const state = await setupApiData(f.owner.tenantId, 'proposal preserves published source', async tx => ({
      heads: await tx.select().from(nutritionPlans).where(eq(nutritionPlans.id, source.planId)),
      versions: await tx.select().from(nutritionPlanVersions).where(eq(nutritionPlanVersions.planId, source.planId)),
    }));
    expect(state.heads[0]?.publishedVersionId).toBe(source.versionId);
    expect(state.versions.find(row => row.id === result.versionId)?.status).toBe('draft');
    expect((await approve(draft)).status).toBe(200);
    expect((await call(app, 'POST', route, { as: f.owner.userId, body: { proposalCode: code } })).json).toEqual(a.json);
  });
  it('rejects overwriting another working draft and blocks changed publication', async () => {
    const source = await proposalFixture(), draft = await build();
    const body = { proposalCode: draft.review.proposals[0]!.code };
    expect((await call(app, 'PUT', `/api/v1/nutrition/${source.planId}/draft`, { as: f.owner.userId,
      body: { document: source.document, baseVersionNo: 1 } })).status).toBe(200);
    expect((await call(app, 'POST', path(f.a.clientId, `/${draft.id}/proposal`), { as: f.owner.userId, body })))
      .toMatchObject({ status: 409, json: { error: { code: 'nutrition_draft_exists' } } });
    expect((await call(app, 'POST', `/api/v1/nutrition/${source.planId}/publish`, { as: f.owner.userId, body: {} })).status).toBe(200);
    expect(await approve(draft))
      .toMatchObject({ status: 409, json: { error: { code: 'review_stale' } } });
    expect(await linked(draft.id)).toEqual([]);
  });
  it('preferences are caller-only JSON merges and retain unrelated keys', async () => {
    await setupApiData(f.owner.tenantId, 'existing caller numerals and channels', tx => tx.execute(sql`insert into user_preferences
      (tenant_id,user_id,preferences) values (${f.owner.tenantId}::uuid,${f.owner.userId}::uuid,
      '{"numerals":"arab","channels":{"push":false},"unrelated":{"keep":true}}'::jsonb)`));
    const route = '/api/v1/settings/review-preferences';
    const preferences = { dialect: 'gulf', signaturePhrases: ['Keep going'] };
    expect((await call(app, 'PUT', route, { as: f.owner.userId, body: preferences })).json).toEqual(preferences);
    const rows = await setupApiData(f.owner.tenantId, 'independent preference merge witness', tx => tx.execute<{ preferences: Record<string, unknown> }>(
      sql`select preferences from user_preferences where tenant_id = ${f.owner.tenantId}::uuid and user_id = ${f.owner.userId}::uuid`));
    expect(rows[0]?.preferences).toMatchObject({ numerals: 'arab', channels: { push: false }, unrelated: { keep: true }, review: preferences });
    const actor = await staff({ checkins: ['review'] });
    expect((await call(app, 'GET', route, { as: actor.userId })).json).toEqual({ dialect: 'egyptian', signaturePhrases: [] });
  });
});
