import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { call } from '../test/api-harness';
import { formsFixture } from '../server/forms/api-fixture';
import { app } from './index';
import { detailSchema, formPageSchema } from '../../components/form-builder/contracts';

describe('Task 7 form versions and coach actions', () => {
  let fixture: Awaited<ReturnType<typeof formsFixture>> | undefined;
  afterEach(async () => { await fixture?.cleanup(); fixture = undefined; });
  it('creates v1, publishes with its pointer, appends drafts, rejects stale edits and preserves history', async () => {
    const f = fixture = await formsFixture();
    const detail = await call(app, 'GET', `/api/v1/forms/${f.formId}`, { as: f.owner.userId });
    expect(detail.json).toMatchObject({ head: { publishedVersionId: f.versionId }, currentVersion: { versionNo: 1, status: 'published' } });
    const changed = { ...f.document, intro: { en: 'New introduction' } };
    expect((await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.owner.userId, body: { document: changed, baseVersionNo: 1 } })).json).toMatchObject({ currentVersion: { versionNo: 2, status: 'draft' } });
    expect((await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.owner.userId, body: { document: changed, baseVersionNo: 1 } })).status).toBe(409);
    expect((await call(app, 'POST', `/api/v1/forms/${f.formId}/publish`, { as: f.owner.userId, body: {} })).status).toBe(200);
    expect((await call(app, 'GET', `/api/v1/forms/${f.formId}/versions/1`, { as: f.owner.userId })).json).toMatchObject({ status: 'superseded', document: f.document });
  });
  it('refuses invalid publication with 422 and leaves the published pointer intact', async () => {
    const f = fixture = await formsFixture(); const document = structuredClone(f.document);
    document.sections[0]!.questions.push({ id: 'choice', type: 'single', label: { en: 'Choice' }, required: false });
    expect((await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.owner.userId, body: { document, baseVersionNo: 1 } })).status).toBe(200);
    const response = await call(app, 'POST', `/api/v1/forms/${f.formId}/publish`, { as: f.owner.userId, body: {} });
    expect(response.status).toBe(422); expect(response.json).toMatchObject({ error: { code: 'form_invalid' } });
  });
  it('customizes a published template privately and clients cannot use coach routes', async () => {
    const f = fixture = await formsFixture();
    const copy = await call(app, 'POST', `/api/v1/forms/${f.formId}/customize`, { as: f.owner.userId, body: { clientId: f.clientId } });
    expect(copy.status).toBe(201); expect(copy.json).toMatchObject({ head: { kind: 'client', clientId: f.clientId, templateId: f.formId }, currentVersion: { versionNo: 1, document: f.document } });
    const id = z.object({ head: z.object({ id: z.string() }) }).parse(copy.json).head.id;
    expect(id).not.toBe(f.formId);
    // The private copy can change without touching the template (plan acceptance for customise).
    const editedCopy = { ...f.document, intro: { en: 'Only for this client' } };
    expect((await call(app, 'PUT', `/api/v1/forms/${id}/draft`, { as: f.owner.userId, body: { document: editedCopy, baseVersionNo: 1 } })).status).toBe(200);
    expect((await call(app, 'GET', `/api/v1/forms/${f.formId}`, { as: f.owner.userId })).json).toMatchObject({ currentVersion: { versionNo: 1, status: 'published', document: f.document } });
    expect((await call(app, 'GET', '/api/v1/forms', { as: f.userId })).status).toBe(403);
    expect((await call(app, 'POST', `/api/v1/forms/${f.formId}/customize`, { as: f.userId, body: { clientId: f.clientId } })).status).toBe(403);
  });
  it('records coach-known intake without asking the client again', async () => {
    const f = fixture = await formsFixture('intake');
    expect((await call(app, 'PATCH', `/api/v1/forms/${f.formId}`, { as: f.owner.userId, body: { is_default: true } })).status).toBe(200);
    const known = await call(app, 'POST', '/api/v1/forms/mark-known', { as: f.owner.userId, body: { clientId: f.clientId, formId: f.formId, answers: { train: false } } });
    expect(known.status).toBe(201); expect(known.json).toMatchObject({ state: 'reviewed', answers: { train: false } });
    expect((await call(app, 'GET', '/api/v1/forms/intake', { as: f.userId })).json).toMatchObject({ submission: { state: 'reviewed' } });
  });
  it('lists templates and client copies with stable cursor pages and exclusive defaults', async () => {
    const f = fixture = await formsFixture();
    for (const en of ['Second', 'Third']) {
      expect((await call(app, 'POST', '/api/v1/forms', { as: f.owner.userId, body: { name: { en }, formKind: 'checkin' } })).status).toBe(201);
    }
    const first = await call(app, 'GET', '/api/v1/forms?formKind=checkin&kind=template&limit=2', { as: f.owner.userId });
    const one = formPageSchema.parse(first.json);
    expect(one.items).toHaveLength(2); expect(one.nextCursor).toBeTruthy();
    const second = formPageSchema.parse((await call(app, 'GET', `/api/v1/forms?formKind=checkin&kind=template&limit=2&cursor=${encodeURIComponent(one.nextCursor ?? '')}`, { as: f.owner.userId })).json);
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    const ids = [...one.items, ...second.items].map(item => item.id);
    expect(new Set(ids).size).toBe(3); expect(ids).toContain(f.formId);
    expect(formPageSchema.parse((await call(app, 'GET', '/api/v1/forms?formKind=intake', { as: f.owner.userId })).json).items).toHaveLength(0);
    await call(app, 'POST', `/api/v1/forms/${f.formId}/customize`, { as: f.owner.userId, body: { clientId: f.clientId } });
    const copies = formPageSchema.parse((await call(app, 'GET', `/api/v1/forms?kind=client&clientId=${f.clientId}`, { as: f.owner.userId })).json);
    expect(copies.items).toHaveLength(1); expect(copies.items[0]).toMatchObject({ kind: 'client', clientId: f.clientId });
    const otherId = ids.find(id => id !== f.formId) ?? '';
    expect((await call(app, 'PATCH', `/api/v1/forms/${f.formId}`, { as: f.owner.userId, body: { is_default: true } })).status).toBe(200);
    expect((await call(app, 'PATCH', `/api/v1/forms/${otherId}`, { as: f.owner.userId, body: { is_default: true } })).status).toBe(200);
    const defaults = formPageSchema.parse((await call(app, 'GET', '/api/v1/forms?formKind=checkin&kind=template', { as: f.owner.userId })).json).items.filter(item => item.isDefault === 1);
    expect(defaults.map(item => item.id)).toEqual([otherId]);
  });
  it('returns detail payloads that match the browser contract', async () => {
    const f = fixture = await formsFixture();
    const detail = detailSchema.parse((await call(app, 'GET', `/api/v1/forms/${f.formId}`, { as: f.owner.userId })).json);
    expect(detail.currentVersion.document).toEqual(f.document); expect(detail.issues).toEqual([]);
  });
  it('enforces the module of each form kind and refuses a wrong base version', async () => {
    const f = fixture = await formsFixture();
    // The scoped staff member holds checkins:view and review only, so reading works but writing and publishing do not.
    expect((await call(app, 'GET', `/api/v1/forms/${f.formId}`, { as: f.staffId })).status).toBe(200);
    expect((await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.staffId, body: { document: f.document, baseVersionNo: 1 } })).status).toBe(403);
    expect((await call(app, 'POST', `/api/v1/forms/${f.formId}/publish`, { as: f.staffId, body: {} })).status).toBe(403);
    const stale = await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.owner.userId, body: { document: f.document, baseVersionNo: 7 } });
    expect(stale.status).toBe(409); expect(stale.json).toMatchObject({ error: { code: 'stale_draft' } });
  });
});
