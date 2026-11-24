import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { WeekReviewInput } from '@dawlyy/core/review';
import type { AuthContext, Tx } from '../db';
import { approveReview as approveStoredReview, buildReview, editReview, finalizeReviewApproval, getLatestReview } from './service';
import { applyReviewProposal } from './proposals';
import type { ReviewDraftBody } from './types';

const fake = vi.hoisted(() => ({ load: vi.fn(), client: vi.fn(), preferences: vi.fn(), open: vi.fn(), send: vi.fn(), notify: vi.fn(), put: vi.fn() }));
vi.mock('./inputs', async original => ({ ...await original<typeof import('./inputs')>(), loadReviewInputs: fake.load, getReviewClient: fake.client }));
vi.mock('./preferences', () => ({ getReviewPreferences: fake.preferences }));
vi.mock('../messaging/service', () => ({ openConversation: fake.open, sendMessage: fake.send, notifyMessage: fake.notify }));
vi.mock('../nutrition/service', () => ({ putNutritionDraft: fake.put }));

const ids = {
  client: '00000000-0000-4000-8000-000000000001', draft: '00000000-0000-4000-8000-000000000002',
  user: '00000000-0000-4000-8000-000000000003', tenant: '00000000-0000-4000-8000-000000000004',
  conversation: '00000000-0000-4000-8000-000000000005', message: '00000000-0000-4000-8000-000000000006',
  version: '00000000-0000-4000-8000-000000000007', plan: '00000000-0000-4000-8000-000000000008',
};
const auth: AuthContext = { userId: ids.user, tenantId: ids.tenant, membershipId: ids.user, role: 'owner', permissions: null };
function input() {
  return WeekReviewInput.parse({
    client: { id: ids.client, firstName: 'Mona', goal: 'lose' }, coach: { firstName: 'Coach', dialect: 'egyptian', signaturePhrases: [] },
    period: { from: '2026-11-01', to: '2026-11-07' }, workouts: { planned: 3, done: 3, previousPlanned: 3, previousDone: 2 }, exercises: [],
    meals: { nutritionAssigned: false, daysLogged: 0, daysInPeriod: 7, avgKcal: null, targetKcal: null }, checkin: { current: null, previous: null },
    weights: [], measurements: [], redFlags: [], attention: null, nutrition: null,
  });
}
type DraftRow = { id: string; tenantId: string; clientId: string; kind: string; inputHash: string; inputVersion: string; provider: string;
  status: string; body: ReviewDraftBody; approvedBy: string | null; approvedAt: Date | null; createdAt: Date; createdBy: string | null; updatedAt: Date | null };
let row: DraftRow | undefined;
let source = 'A'; let liveInput = input(); let flags: { id: string }[] = [];
let message: Record<string, unknown> | undefined; let calls: string[] = []; let sourceVersion = ids.version; let working = false;
let lockTail: Promise<void> = Promise.resolve();
function select(table: unknown) {
  const name = getTableName(table as Parameters<typeof getTableName>[0]);
  if (name === 'ai_drafts') return row ? [row] : [];
  if (name === 'memberships') return [{ displayName: 'Coach' }];
  if (name === 'red_flags') return flags;
  if (name === 'messages') return message ? [message] : [];
  if (name === 'conversations') return [{ id: ids.conversation, clientId: ids.client, kind: 'client' }];
  if (name === 'nutrition_plans') return [{ id: ids.plan, clientId: ids.client, publishedVersionId: sourceVersion, currentVersionId: working ? ids.draft : sourceVersion, archivedAt: null }];
  if (name === 'nutrition_plan_versions') return [{ id: sourceVersion, planId: ids.plan, versionNo: 1, status: 'published', document: { schemaVersion: 1, targets: { kcal: 2000, proteinG: 120, carbsG: 240, fatG: 60, waterMl: 2500, steps: 8000 }, meals: [{ id: ids.client, name: { en: 'Meal' }, options: [{ id: ids.version, items: [{ id: ids.plan, foodId: ids.user, quantity: 100, measure: { kind: 'g' }, approx: false }] }] }], supplements: [], allergens: [] } }];
  return [];
}
function chain(read: () => unknown) {
  let tableRead = read;
  const builder = { where: () => builder, from: (table: unknown) => { tableRead = () => select(table); return builder; },
    innerJoin: () => builder, orderBy: () => builder, limit: () => builder, for: () => builder, returning: () => builder,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(tableRead()).then(resolve) };
  return builder;
}
const tx = {
  select: () => chain(() => []),
  insert: () => ({ values: (values: Omit<DraftRow, 'id' | 'createdAt' | 'approvedBy' | 'approvedAt' | 'createdBy' | 'updatedAt'>) => {
    row = { ...values, id: ids.draft, createdAt: new Date('2026-11-07T10:00:00Z'), approvedBy: null, approvedAt: null, createdBy: ids.user, updatedAt: null };
    return chain(() => [row]);
  } }),
  update: () => ({ set: (values: Partial<DraftRow>) => { if (row) Object.assign(row, values); return chain(() => row ? [row] : []); } }),
  execute: async (statement: SQL) => {
    const query = new PgDialect().sqlToQuery(statement);
    if (!query.sql.includes('approve_ai_draft')) return [];
    calls.push('approve');
    if (!row || row.status !== 'draft') throw { code: 'P0001' };
    if (query.params[1] !== row.inputHash) { row.status = 'stale'; return [{ status: 'stale' }]; }
    row.status = 'approved'; row.approvedBy = auth.userId; return [{ status: 'approved' }];
  },
} as unknown as Tx;
// P9 proves the actual database lock; this unit boundary models transaction serialization and rollback.
async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  const previous = lockTail; let release = () => {};
  lockTail = new Promise<void>(resolve => { release = resolve; }); await previous;
  const before = structuredClone(row); const priorMessage = structuredClone(message);
  try { return await fn(); } catch (error) { row = before; message = priorMessage; throw error; } finally { release(); }
}
let reviewedHash: string;
async function build() {
  const draft = await transaction(() => buildReview(tx, auth, ids.client, { locale: 'en', period: liveInput.period }));
  reviewedHash = draft.textHash;
  return draft;
}
function approveReview(transactionTx: Tx, actor: AuthContext, clientId: string, draftId: string) {
  return approveStoredReview(transactionTx, actor, clientId, draftId, reviewedHash);
}
beforeEach(() => {
  reviewedHash = '0'.repeat(64);
  vi.clearAllMocks(); row = undefined; liveInput = input(); source = 'A'; calls = []; flags = []; message = undefined;
  sourceVersion = ids.version; working = false; lockTail = Promise.resolve();
  fake.client.mockResolvedValue({ id: ids.client, firstName: 'Mona', goal: 'lose', timezone: 'Africa/Cairo', today: '2026-11-07' });
  fake.preferences.mockResolvedValue({ dialect: 'egyptian', signaturePhrases: [] });
  fake.load.mockImplementation(async (_tx, _auth, _client, context) => ({ input: { ...liveInput, coach: context.coach }, sourceRevision: source, sourcePermissions: [], evidenceUnavailable: [] }));
  fake.open.mockResolvedValue({ conversation: { id: ids.conversation, clientId: ids.client }, created: true });
  fake.send.mockImplementation(async (_tx, actor: AuthContext, conversationId: string, value: { body: string; clientUuid: string }) => {
    message = { id: ids.message, body: value.body, attachments: [], conversationId, clientId: ids.client, senderUserId: actor.userId, clientUuid: value.clientUuid };
    return { conversation: { id: conversationId, clientId: ids.client }, message, created: true };
  });
  fake.notify.mockResolvedValue(1);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
});
describe('R4b approval transaction', () => {
  it('builds protected inputs and commits changed source stale without sends or proposals', async () => {
    const draft = await build(); expect(draft.provider).toBe('none'); expect(draft.inputVersion).toBe('review-v1:2026-11-01:2026-11-07');
    source = 'B'; const result = await transaction(() => approveReview(tx, auth, ids.client, draft.id));
    expect(result.kind).toBe('stale'); expect(row?.status).toBe('stale');
    expect(fake.send).not.toHaveBeenCalled(); expect(fake.notify).not.toHaveBeenCalled(); expect(fake.put).not.toHaveBeenCalled();
  });
  it('sends edited prose once with stable draft id and notifies after commit', async () => {
    const draft = await build();
    reviewedHash = (await editReview(tx, auth, ids.client, draft.id, { text: 'Coach edited text' })).textHash;
    const result = await transaction(() => approveReview(tx, auth, ids.client, draft.id));
    expect(fake.notify).not.toHaveBeenCalled(); expect(row?.status).toBe('approved');
    expect(await finalizeReviewApproval(auth, result)).toMatchObject({ messageId: ids.message, notified: true });
    expect(fake.send).toHaveBeenCalledWith(tx, auth, ids.conversation, { body: 'Coach edited text', clientUuid: draft.id });
    expect(fake.notify).toHaveBeenCalledTimes(1);
  });
  it('rolls approval back if sending fails', async () => {
    await build(); fake.send.mockRejectedValueOnce(new Error('send failed'));
    await expect(transaction(() => approveReview(tx, auth, ids.client, ids.draft))).rejects.toThrow('send failed');
    expect(row?.status).toBe('draft'); expect(fake.notify).not.toHaveBeenCalled();
  });
  it('keeps sent message recoverable after post-commit notification failure', async () => {
    await build(); fake.notify.mockRejectedValueOnce(new Error('notify failed'));
    const result = await transaction(() => approveReview(tx, auth, ids.client, ids.draft));
    expect(await finalizeReviewApproval(auth, result)).toMatchObject({ notified: false, messageId: ids.message }); expect(row?.status).toBe('approved');
  });
  it('serializes duplicate approval and resolves a different coach retry by original approver', async () => {
    await build(); const other: AuthContext = { ...auth, userId: ids.version };
    const results = await Promise.all([transaction(() => approveReview(tx, auth, ids.client, ids.draft)), transaction(() => approveReview(tx, other, ids.client, ids.draft))]);
    expect(results.every(result => result.kind === 'approved')).toBe(true); expect(fake.send).toHaveBeenCalledTimes(1); expect(calls).toEqual(['approve']);
  });
  it('refuses approved row with a missing linked message rather than sending again', async () => {
    await build(); if (row) { row.status = 'approved'; row.approvedBy = ids.user; }
    await expect(approveReview(tx, auth, ids.client, ids.draft)).rejects.toMatchObject({ code: 'review_message_missing' }); expect(fake.send).not.toHaveBeenCalled();
  });
  it('blocks open flags before approval without changing status', async () => {
    await build(); flags = [{ id: ids.version }];
    await expect(approveReview(tx, auth, ids.client, ids.draft)).rejects.toMatchObject({ status: 409, code: 'red_flags_open' });
    expect(row?.status).toBe('draft'); expect(calls).toEqual([]); expect(fake.send).not.toHaveBeenCalled();
  });
  it('uses original period and coach snapshot for later approver', async () => {
    await build(); const context = row?.body.context; await approveReview(tx, { ...auth, userId: ids.version }, ids.client, ids.draft);
    expect(fake.load).toHaveBeenLastCalledWith(tx, expect.anything(), ids.client, context);
  });
  it('refuses missing drafts and non-draft edits', async () => {
    await expect(approveReview(tx, auth, ids.client, ids.draft)).rejects.toMatchObject({ status: 404 }); await build(); if (row) row.status = 'stale';
    await expect(editReview(tx, auth, ids.client, ids.draft, { text: 'edit' })).rejects.toMatchObject({ code: 'draft_not_editable' });
    await expect(approveReview(tx, auth, ids.client, ids.draft)).rejects.toMatchObject({ status: 409 });
  });
  it('checks original source permissions before disclosing stored summary', async () => {
    await build(); if (row) row.body.sourcePermissions = [{ module: 'nutrition', action: 'view' }];
    const limited: AuthContext = { ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { clients: ['view'], checkins: ['review'] } } };
    await expect(getLatestReview(tx, limited, ids.client)).rejects.toMatchObject({ code: 'review_evidence_not_allowed' });
  });
  it('requires check-in review and messages creation grants', async () => {
    await build(); const limited: AuthContext = { ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { clients: ['view'], checkins: ['review'] } } };
    await expect(approveReview(tx, limited, ids.client, ids.draft)).rejects.toMatchObject({ status: 403 });
    await expect(getLatestReview(tx, { ...limited, permissions: { client_scope: 'all', modules: { clients: ['view'] } } }, ids.client)).rejects.toMatchObject({ status: 403 });
  });
});
describe('R4b proposal transaction', () => {
  async function proposalReview() {
    liveInput.nutrition = { versionId: ids.version, targets: { kcal: 2000, proteinG: 120, carbsG: 240, fatG: 60, waterMl: 2500, steps: 8000 } };
    liveInput.weights = [{ on: '2026-10-31', kg: 80 }, { on: '2026-11-04', kg: 79 }, { on: '2026-11-07', kg: 78 }]; await build();
  }
  it('creates separate draft, replays ids, and approves unchanged published input', async () => {
    await proposalReview(); fake.put.mockResolvedValue({ currentVersion: { id: ids.message, versionNo: 2 }, head: { id: ids.plan } });
    const request = { proposalCode: 'slow_loss_too_fast' as const }; const created = await applyReviewProposal(tx, auth, ids.client, ids.draft, request);
    expect(created).toMatchObject({ kind: 'proposal', created: true, result: { planId: ids.plan, versionId: ids.message, versionNo: 2 } });
    expect(fake.put).toHaveBeenCalledOnce(); expect(await applyReviewProposal(tx, auth, ids.client, ids.draft, request)).toMatchObject({ created: false });
    expect((await approveReview(tx, auth, ids.client, ids.draft)).kind).toBe('approved'); expect(fake.put).toHaveBeenCalledOnce();
  });
  it('refuses changed published version and existing unpublished working version', async () => {
    await proposalReview(); sourceVersion = ids.message;
    await expect(applyReviewProposal(tx, auth, ids.client, ids.draft, { proposalCode: 'slow_loss_too_fast' })).rejects.toMatchObject({ code: 'proposal_version_mismatch' });
    sourceVersion = ids.version; working = true;
    await expect(applyReviewProposal(tx, auth, ids.client, ids.draft, { proposalCode: 'slow_loss_too_fast' })).rejects.toMatchObject({ code: 'nutrition_draft_exists' }); expect(fake.put).not.toHaveBeenCalled();
  });
  it('refuses flags, mismatching proposal codes and missing nutrition edit grant', async () => {
    await proposalReview(); flags = [{ id: ids.message }];
    await expect(applyReviewProposal(tx, auth, ids.client, ids.draft, { proposalCode: 'slow_loss_too_fast' })).rejects.toMatchObject({ code: 'red_flags_open' }); flags = [];
    await expect(applyReviewProposal(tx, auth, ids.client, ids.draft, { proposalCode: 'lower_kcal_flat' })).rejects.toMatchObject({ code: 'proposal_not_available' });
    const limited: AuthContext = { ...auth, role: 'staff', permissions: { client_scope: 'all', modules: { clients: ['view'], checkins: ['review'], nutrition: ['view'] } } };
    await expect(applyReviewProposal(tx, limited, ids.client, ids.draft, { proposalCode: 'slow_loss_too_fast' })).rejects.toMatchObject({ status: 403 });
  });
});
