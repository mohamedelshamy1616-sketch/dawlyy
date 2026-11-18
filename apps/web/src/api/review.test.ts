import { OpenAPIHono } from '@hono/zod-openapi';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext, Tx } from '../server/db';
import type { ApiEnv } from './env';
import { ApiError } from './errors';

const mock = vi.hoisted(() => ({
  getAuth: vi.fn(), withAuthTx: vi.fn(), withServiceTx: vi.fn(), commits: [] as string[],
  build: vi.fn(), edit: vi.fn(), approve: vi.fn(), latest: vi.fn(), proposal: vi.fn(), getPrefs: vi.fn(), putPrefs: vi.fn(), notify: vi.fn(),
}));
vi.mock('@/src/server/auth', () => ({ getAuthContext: mock.getAuth }));
vi.mock('../server/db', () => ({ withAuthTx: mock.withAuthTx, withServiceTx: mock.withServiceTx }));
vi.mock('../server/messaging/service', () => ({ notifyMessage: mock.notify, openConversation: vi.fn(), sendMessage: vi.fn() }));
vi.mock('../server/review/service', async original => ({
  ...await original<typeof import('../server/review/service')>(),
  buildReview: mock.build, editReview: mock.edit, approveReview: mock.approve, getLatestReview: mock.latest,
}));
vi.mock('../server/review/proposals', () => ({ applyReviewProposal: mock.proposal }));
vi.mock('../server/review/preferences', () => ({ getReviewPreferences: mock.getPrefs, putReviewPreferences: mock.putPrefs }));
import { router, reviewPreferencesRouter } from './review';

const id = '11111111-1111-4111-8111-111111111111';
const clientId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const owner: AuthContext = { userId: id, tenantId: id, membershipId: id, role: 'owner', permissions: null };
const tx = {} as Tx;
const base = `/api/v1/clients/${clientId}/review`;
const dto = { id: draftId, clientId, status: 'draft', provider: 'none', inputVersion: 'review-v1:2026-11-01:2026-11-07', createdAt: '2026-11-07T00:00:00.000Z',
  review: { summary: {}, mustHandleFlags: false, draft: { locale: 'en', dialect: 'egyptian', text: 'Hi' }, proposals: [] }, text: 'Hi', evidenceUnavailable: [], proposalDraft: null };

function application() {
  const app = new OpenAPIHono<ApiEnv>();
  app.onError((error, c) => error instanceof ApiError ? c.json(error.toBody(), error.status) : c.json({ error: { code: 'unexpected' } }, 500));
  app.route('/api/v1/clients', router);
  app.route('/api/v1/settings/review-preferences', reviewPreferencesRouter);
  // Neighbouring routes must stay outside the staff-only boundary.
  app.get('/api/v1/settings/unrelated', c => c.json({ ok: true }));
  return app;
}
const json = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks(); mock.commits.length = 0;
  mock.getAuth.mockResolvedValue(owner);
  mock.withAuthTx.mockImplementation(async (_auth: AuthContext, callback: (tx: Tx) => Promise<unknown>) => { const value = await callback(tx); mock.commits.push('commit'); return value; });
  mock.withServiceTx.mockImplementation(() => { throw new Error('Service transaction forbidden'); });
  mock.latest.mockResolvedValue(dto); mock.build.mockResolvedValue(dto); mock.edit.mockResolvedValue({ ...dto, text: 'Edited' });
  mock.getPrefs.mockResolvedValue({ dialect: 'egyptian', signaturePhrases: [] }); mock.putPrefs.mockImplementation(async (_tx: Tx, _auth: AuthContext, value: unknown) => value);
  mock.notify.mockResolvedValue(1);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network forbidden'); }));
});

describe('R4b review router with mocked authentication and service boundary', () => {
  const requests: [string, string, unknown?][] = [
    ['GET', base], ['POST', base, { locale: 'en' }], ['PATCH', `${base}/${draftId}`, { text: 'x' }], ['POST', `${base}/${draftId}/approve`, {}],
    ['POST', `${base}/${draftId}/proposal`, { proposalCode: 'lower_kcal_flat' }], ['GET', '/api/v1/settings/review-preferences'],
    ['PUT', '/api/v1/settings/review-preferences', { dialect: 'gulf', signaturePhrases: [] }],
  ];
  it.each(requests)('rejects missing auth (401) and client callers (403) before any transaction: %s %s', async (method, path, body) => {
    const init = body === undefined ? { method } : json(method, body); const app = application();
    mock.getAuth.mockResolvedValue(null);
    expect((await app.request(path, init)).status).toBe(401);
    mock.getAuth.mockResolvedValue({ ...owner, role: 'client', clientId });
    expect((await app.request(path, init)).status).toBe(403);
    expect(mock.withAuthTx).not.toHaveBeenCalled();
  });
  it('leaves a neighbouring route outside the staff boundary', async () => {
    mock.getAuth.mockResolvedValue({ ...owner, role: 'client', clientId });
    expect((await application().request('/api/v1/settings/unrelated')).status).toBe(200);
  });
  it('reads, builds and edits through the authenticated transaction with private no-store responses', async () => {
    const app = application();
    const read = await app.request(base); expect(read.status).toBe(200); expect(read.headers.get('cache-control')).toBe('private, no-store');
    expect(await read.json()).toEqual({ draft: dto }); expect(mock.latest).toHaveBeenCalledWith(tx, owner, clientId);
    const built = await app.request(base, json('POST', { locale: 'ar', period: { from: '2026-11-01', to: '2026-11-07' } }));
    expect(built.status).toBe(201); expect(mock.build).toHaveBeenCalledWith(tx, owner, clientId, { locale: 'ar', period: { from: '2026-11-01', to: '2026-11-07' } });
    const edited = await app.request(`${base}/${draftId}`, json('PATCH', { text: '  Edited  ' }));
    expect(edited.status).toBe(200); expect(mock.edit).toHaveBeenCalledWith(tx, owner, clientId, draftId, { text: 'Edited' });
    expect(mock.withServiceTx).not.toHaveBeenCalled();
  });
  it('maps a missing latest draft to null and a service 404 to the standard envelope', async () => {
    mock.latest.mockResolvedValueOnce(null);
    expect(await (await application().request(base)).json()).toEqual({ draft: null });
    mock.latest.mockRejectedValueOnce(new ApiError(404, 'not_found', 'Resource not found'));
    const missing = await application().request(base); expect(missing.status).toBe(404); expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } });
  });
  it.each([
    ['browser-supplied provider', 'POST', base, { locale: 'en', provider: 'anthropic' }],
    ['browser-supplied hash', 'POST', base, { locale: 'en', inputHash: 'a'.repeat(64) }],
    ['unknown locale', 'POST', base, { locale: 'fr' }],
    ['a 15 day period', 'POST', base, { locale: 'en', period: { from: '2026-11-01', to: '2026-11-15' } }],
    ['blank text', 'PATCH', `${base}/${draftId}`, { text: '   ' }],
    ['oversized text', 'PATCH', `${base}/${draftId}`, { text: 'x'.repeat(4001) }],
    ['edit of the input hash', 'PATCH', `${base}/${draftId}`, { text: 'ok', inputHash: 'x' }],
    ['edit of the provider', 'PATCH', `${base}/${draftId}`, { text: 'ok', provider: 'none' }],
    ['forged hash on approve', 'POST', `${base}/${draftId}/approve`, { hash: 'A' }],
    ['client supplied proposal target', 'POST', `${base}/${draftId}/proposal`, { proposalCode: 'lower_kcal_flat', deltaKcal: -900 }],
    ['unknown proposal code', 'POST', `${base}/${draftId}/proposal`, { proposalCode: 'other' }],
    ['six signature phrases', 'PUT', '/api/v1/settings/review-preferences', { dialect: 'gulf', signaturePhrases: Array(6).fill('hello') }],
    ['unknown preference dialect', 'PUT', '/api/v1/settings/review-preferences', { dialect: 'invented', signaturePhrases: [] }],
    ['foreign user id', 'PUT', '/api/v1/settings/review-preferences', { dialect: 'gulf', signaturePhrases: [], userId: id }],
  ] as const)('rejects %s with 400 before the service runs', async (_name, method, path, body) => {
    const response = await application().request(path, json(method, body));
    expect(response.status).toBe(400); expect((await response.json() as { error: { code: string } }).error.code).toBe('validation_error');
    for (const fn of [mock.build, mock.edit, mock.approve, mock.proposal, mock.putPrefs]) expect(fn).not.toHaveBeenCalled();
  });
  it('rejects a malformed client or draft id', async () => {
    expect((await application().request('/api/v1/clients/not-a-uuid/review')).status).toBe(400);
    expect((await application().request(`${base}/nope`, json('PATCH', { text: 'x' }))).status).toBe(400);
  });
});

describe('R4b approval status mapping', () => {
  const approved = { kind: 'approved', draftId, conversation: { id: '44444444-4444-4444-8444-444444444444', clientId }, message: { id: '55555555-5555-4555-8555-555555555555', body: 'Hi', attachments: [] }, created: true };
  it('returns the exact success shape and notifies only after the transaction committed', async () => {
    mock.approve.mockResolvedValue(approved);
    mock.notify.mockImplementation(async () => { expect(mock.commits).toEqual(['commit']); return 1; });
    const response = await application().request(`${base}/${draftId}/approve`, json('POST', {}));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ draftId, status: 'approved', conversationId: approved.conversation.id, messageId: approved.message.id, notified: true });
    expect(mock.notify).toHaveBeenCalledTimes(1);
  });
  it('keeps the sent message when notification fails and never notifies a replay', async () => {
    mock.approve.mockResolvedValue(approved); mock.notify.mockRejectedValueOnce(new Error('push down'));
    expect(await (await application().request(`${base}/${draftId}/approve`, json('POST', {}))).json()).toMatchObject({ status: 'approved', notified: false });
    mock.approve.mockResolvedValue({ ...approved, created: false }); mock.notify.mockClear();
    expect(await (await application().request(`${base}/${draftId}/approve`, json('POST', {}))).json()).toMatchObject({ notified: false });
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it('commits the stale mark first, then answers 409 review_stale with no notification', async () => {
    mock.approve.mockResolvedValue({ kind: 'stale', draftId });
    const response = await application().request(`${base}/${draftId}/approve`, json('POST', {}));
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: 'review_stale' } });
    // The transaction callback returned normally, so withAuthTx committed instead of rolling back.
    expect(mock.commits).toEqual(['commit']); expect(mock.notify).not.toHaveBeenCalled();
  });
  it.each([
    ['database no-access', { code: '42501' }, 403, 'forbidden'],
    ['an already decided draft from the typed service error', new ApiError(409, 'draft_not_editable', 'x'), 409, 'draft_not_editable'],
    ['an open flag', new ApiError(409, 'red_flags_open', 'x'), 409, 'red_flags_open'],
    ['missing grants', new ApiError(403, 'forbidden', 'x'), 403, 'forbidden'],
    ['a source grant lost since the build', new ApiError(403, 'review_evidence_not_allowed', 'x'), 403, 'review_evidence_not_allowed'],
    ['a missing draft', new ApiError(404, 'not_found', 'x'), 404, 'not_found'],
  ])('maps %s', async (_name, failure, status, code) => {
    mock.approve.mockRejectedValue(failure);
    const response = await application().request(`${base}/${draftId}/approve`, json('POST', {}));
    expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ error: { code } });
    expect(mock.notify).not.toHaveBeenCalled();
  });
});

describe('R4b proposals and preferences', () => {
  const result = { planId: id, versionId: clientId, versionNo: 2 };
  it('answers 201 for a new proposal draft, 200 for the replay and 409 when the review went stale', async () => {
    const send = () => application().request(`${base}/${draftId}/proposal`, json('POST', { proposalCode: 'slow_loss_too_fast' }));
    mock.proposal.mockResolvedValueOnce({ kind: 'proposal', created: true, result });
    const created = await send(); expect(created.status).toBe(201); expect(await created.json()).toEqual(result);
    mock.proposal.mockResolvedValueOnce({ kind: 'proposal', created: false, result });
    const replay = await send(); expect(replay.status).toBe(200); expect(await replay.json()).toEqual(result);
    mock.proposal.mockResolvedValueOnce({ kind: 'stale', draftId });
    const stale = await send(); expect(stale.status).toBe(409); expect(await stale.json()).toMatchObject({ error: { code: 'review_stale' } });
    expect(mock.proposal).toHaveBeenCalledWith(tx, owner, clientId, draftId, { proposalCode: 'slow_loss_too_fast' });
  });
  it('reads and saves only the caller preferences', async () => {
    const app = application();
    expect(await (await app.request('/api/v1/settings/review-preferences')).json()).toEqual({ dialect: 'egyptian', signaturePhrases: [] });
    const saved = await app.request('/api/v1/settings/review-preferences', json('PUT', { dialect: 'gulf', signaturePhrases: [' Keep going '] }));
    expect(saved.status).toBe(200); expect(await saved.json()).toEqual({ dialect: 'gulf', signaturePhrases: ['Keep going'] });
    expect(mock.putPrefs).toHaveBeenCalledWith(tx, owner, { dialect: 'gulf', signaturePhrases: ['Keep going'] });
  });
});
