import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { calendarEvents, formSubmissions, metricEntries, memberships, staffClientAssignments } from '@dawlyy/db/schema';
import { withAuthTx } from '../server/db';
import { call, setupApiData } from '../test/api-harness';
import { formsFixture } from '../server/forms/api-fixture';
import { app } from './index';
import { bundleSchema, eventPageSchema } from '../../components/form-runner/contracts';
import { queueSchema, reviewDetailSchema } from '../../components/form-builder/contracts';

describe('Task 7 pinned submissions and visibility acceptance', () => {
  let fixture: Awaited<ReturnType<typeof formsFixture>> | undefined;
  afterEach(async () => { await fixture?.cleanup(); fixture = undefined; });
  async function save(f: Awaited<ReturnType<typeof formsFixture>>, event: string, answers: Record<string, unknown>) {
    const response = await call(app, 'PUT', `/api/v1/submissions/${event}/answers`, { as: f.userId, body: { answers, clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString() } });
    expect(response.status).toBe(200); return z.object({ id: z.string() }).parse(response.json).id;
  }
  it('ignores hidden required photos, pins the snapshot, completes the event, records weight, and replays idempotently', async () => {
    const f = fixture = await formsFixture(); const event = await f.send();
    const id = await save(f, event, { train: false, weight: 82 });
    const key = randomUUID(); const options = { as: f.userId, headers: { 'Idempotency-Key': key } };
    const submitted = await call(app, 'POST', `/api/v1/submissions/${id}/submit`, options);
    expect(submitted.status).toBe(200);
    // The frozen guard admits client due→submitted only; coach routing is reported as an integration gap.
    expect(submitted.json).toMatchObject({ state: 'submitted', missingRequired: [], formVersionId: f.versionId });
    expect(await call(app, 'POST', `/api/v1/submissions/${id}/submit`, options)).toEqual(submitted);
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.userId })).status).toBe(409);
    const stored = await withAuthTx(f.owner, async tx => ({
      events: await tx.select().from(calendarEvents).where(eq(calendarEvents.id, event)),
      metrics: await tx.select().from(metricEntries).where(and(eq(metricEntries.clientId, f.clientId), eq(metricEntries.metric, 'weight'))),
    }));
    expect(stored.events[0]).toMatchObject({ state: 'completed' }); expect(stored.metrics).toHaveLength(1);
    expect(stored.metrics[0]).toMatchObject({ value: 82, source: 'manual', unit: 'kg' });
    await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.owner.userId, body: { document: { ...f.document, intro: { en: 'Later template' } }, baseVersionNo: 1 } });
    await call(app, 'POST', `/api/v1/forms/${f.formId}/publish`, { as: f.owner.userId, body: {} });
    const review = await call(app, 'GET', `/api/v1/submissions/${id}`, { as: f.owner.userId });
    expect(review.json).toMatchObject({ submission: { formVersionId: f.versionId }, document: f.document });
    expect((await call(app, 'GET', '/api/v1/submissions', { as: f.owner.userId })).json).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ id })]) });
    const result = await call(app, 'POST', `/api/v1/submissions/${id}/review`, { as: f.owner.userId, body: { outcome: 'reviewed', coachFeedback: 'Keep going' } });
    expect(result.status).toBe(200); expect(result.json).toMatchObject({ state: 'reviewed' });
    const publicResult = await call(app, 'GET', `/api/v1/forms/for-client/${event}`, { as: f.userId });
    expect(publicResult.json).toMatchObject({ submission: { coachFeedback: 'Keep going' } });
    const serialized = JSON.stringify(publicResult.json);
    for (const field of ['changeNote', 'createdBy', 'payload', 'results']) expect(serialized).not.toContain(`"${field}"`);
  });
  it('blocks a visible required answer and isolates clients and assigned-scope reviewers', async () => {
    const f = fixture = await formsFixture(); const event = await f.send(); const id = await save(f, event, { train: true });
    const response = await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.userId });
    expect(response.status).toBe(422); expect(response.json).toMatchObject({ error: { code: 'missing_required', details: { questionIds: ['photo'] } } });
    expect((await call(app, 'GET', `/api/v1/forms/for-client/${event}`, { as: f.otherUserId })).status).toBe(404);
    expect((await call(app, 'PUT', `/api/v1/submissions/${id}/answers`, { as: f.otherUserId, body: { answers: {}, clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString() } })).status).toBe(404);
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.otherUserId })).status).toBe(404);
    expect((await call(app, 'GET', `/api/v1/submissions/${id}`, { as: f.staffId })).status).toBe(404);
    const found = await setupApiData(f.owner.tenantId, 'assign form reviewer', async tx => {
      const [staff] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, f.owner.tenantId), eq(memberships.userId, f.staffId)));
      if (!staff) throw new Error('Missing staff');
      await tx.insert(staffClientAssignments).values({ tenantId: f.owner.tenantId, membershipId: staff.id, clientId: f.clientId });
      return staff.id;
    });
    expect(found).toBeTruthy(); expect((await call(app, 'GET', `/api/v1/submissions/${id}`, { as: f.staffId })).status).toBe(200);
    const [unchanged] = await withAuthTx(f.owner, tx => tx.select({ state: formSubmissions.state }).from(formSubmissions).where(eq(formSubmissions.id, id)));
    expect(unchanged?.state).toBe('due');
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/review`, { as: f.userId, body: { outcome: 'reviewed' } })).status).toBe(403);
  });
  it('serves the browser contracts for the client bundle, event list, queue and review detail', async () => {
    const f = fixture = await formsFixture(); const event = await f.send(); const id = await save(f, event, { train: false, weight: 80 });
    const bundle = bundleSchema.parse((await call(app, 'GET', `/api/v1/forms/for-client/${event}`, { as: f.userId })).json);
    expect(bundle.version.id).toBe(f.versionId); expect(bundle.submission?.id).toBe(id); expect(bundle.event?.id).toBe(event);
    const events = eventPageSchema.parse((await call(app, 'GET', '/api/v1/forms/events?formKind=checkin', { as: f.userId })).json);
    expect(events.items.map(item => item.id)).toEqual([event]); expect(events.items[0]?.submission?.id).toBe(id);
    expect((await call(app, 'GET', '/api/v1/forms/events?formKind=checkin', { as: f.otherUserId })).json).toMatchObject({ items: [] });
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.userId })).status).toBe(200);
    const queue = queueSchema.parse((await call(app, 'GET', '/api/v1/submissions?formKind=checkin', { as: f.owner.userId })).json);
    expect(queue.items.map(item => item.id)).toEqual([id]); expect(queue.items[0]?.flags).toEqual([]);
    const detail = reviewDetailSchema.parse((await call(app, 'GET', `/api/v1/submissions/${id}`, { as: f.owner.userId })).json);
    expect(detail.submission.answers).toEqual({ train: false, weight: 80 }); expect(detail.clientName).toBe('A');
  });
  it('flags a visible photo question left empty in the review queue', async () => {
    const f = fixture = await formsFixture();
    const optional = structuredClone(f.document); optional.sections[0]!.questions[1]!.required = false;
    expect((await call(app, 'PUT', `/api/v1/forms/${f.formId}/draft`, { as: f.owner.userId, body: { document: optional, baseVersionNo: 1 } })).status).toBe(200);
    expect((await call(app, 'POST', `/api/v1/forms/${f.formId}/publish`, { as: f.owner.userId, body: {} })).status).toBe(200);
    const event = await f.send(); const id = await save(f, event, { train: true, weight: 80 });
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.userId })).status).toBe(200);
    expect((await call(app, 'GET', '/api/v1/submissions?formKind=checkin', { as: f.owner.userId })).json).toMatchObject({ items: [expect.objectContaining({ id, flags: ['missing_photos'] })] });
  });
  it('skips an event through the machine and blocks later answers', async () => {
    const f = fixture = await formsFixture(); const event = await f.send();
    expect((await call(app, 'POST', '/api/v1/forms/skip', { as: f.userId, body: { eventId: event, reason: 'travel' } })).status).toBe(403);
    const skipped = await call(app, 'POST', '/api/v1/forms/skip', { as: f.owner.userId, body: { eventId: event, reason: 'travel' } });
    expect(skipped.status).toBe(200); expect(skipped.json).toMatchObject({ state: 'skipped' });
    const late = await call(app, 'PUT', `/api/v1/submissions/${event}/answers`, { as: f.userId, body: { answers: { train: false }, clientUuid: randomUUID(), clientUpdatedAt: new Date().toISOString() } });
    expect(late.status).toBe(422); expect(late.json).toMatchObject({ error: { code: 'not_due' } });
    expect((await call(app, 'POST', '/api/v1/forms/skip', { as: f.owner.userId, body: { eventId: event, reason: 'again' } })).status).toBe(422);
  });
  it('refuses to ask for resubmission because the machine has no such edge, and keeps the submission open', async () => {
    const f = fixture = await formsFixture(); const event = await f.send(); const id = await save(f, event, { train: false });
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.userId })).status).toBe(200);
    const refused = await call(app, 'POST', `/api/v1/submissions/${id}/review`, { as: f.owner.userId, body: { outcome: 'needs_resubmission' } });
    expect(refused.status).toBe(422); expect(refused.json).toMatchObject({ error: { code: 'resubmission_unsupported' } });
    expect((await call(app, 'GET', `/api/v1/submissions/${id}`, { as: f.owner.userId })).json).toMatchObject({ submission: { state: 'submitted' } });
  });
  it('lets only an assigned reviewer review, and blocks clients from the queue', async () => {
    const f = fixture = await formsFixture(); const event = await f.send(); const id = await save(f, event, { train: false });
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/submit`, { as: f.userId })).status).toBe(200);
    expect((await call(app, 'GET', '/api/v1/submissions', { as: f.userId })).status).toBe(403);
    expect((await call(app, 'GET', `/api/v1/submissions/${id}`, { as: f.otherUserId })).status).toBe(403);
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/review`, { as: f.staffId, body: { outcome: 'reviewed' } })).status).toBe(404);
    expect((await call(app, 'GET', '/api/v1/submissions', { as: f.staffId })).json).toMatchObject({ items: [] });
    await setupApiData(f.owner.tenantId, 'assign form reviewer', async tx => {
      const [staff] = await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, f.owner.tenantId), eq(memberships.userId, f.staffId)));
      if (!staff) throw new Error('Missing staff');
      await tx.insert(staffClientAssignments).values({ tenantId: f.owner.tenantId, membershipId: staff.id, clientId: f.clientId });
    });
    expect((await call(app, 'GET', '/api/v1/submissions', { as: f.staffId })).json).toMatchObject({ items: [expect.objectContaining({ id })] });
    const reviewed = await call(app, 'POST', `/api/v1/submissions/${id}/review`, { as: f.staffId, body: { outcome: 'reviewed', coachFeedback: 'Well done' } });
    expect(reviewed.status).toBe(200); expect(reviewed.json).toMatchObject({ state: 'reviewed', coachFeedback: 'Well done' });
    expect((await call(app, 'POST', `/api/v1/submissions/${id}/review`, { as: f.staffId, body: { outcome: 'reviewed' } })).status).toBe(422);
  });
});
