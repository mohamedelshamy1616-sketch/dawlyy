import { randomUUID } from 'node:crypto';
import { clients, memberships } from '@dawlyy/db/schema';
import { setupApiData, setupApiFixture, call } from '../../test/api-harness';
import { app } from '../../api/index';
import { z } from 'zod';
import { FormDocument } from '@dawlyy/core/types';

/** Task 7: isolated DB-backed identities and published form used by the API acceptance suites. */
export async function formsFixture(kind: 'intake' | 'checkin' | 'assessment' = 'checkin') {
  const fixture = await setupApiFixture();
  const userId = randomUUID(); const otherUserId = randomUUID(); const staffId = randomUUID();
  const ids = await setupApiData(fixture.owner.tenantId, 'forms clients and scoped reviewer', async tx => {
    const [a] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'A' }).returning();
    const [b] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName: 'B' }).returning();
    if (!a || !b) throw new Error('Missing fixture client');
    await tx.insert(memberships).values([
      { tenantId: fixture.owner.tenantId, userId, role: 'client', status: 'active', clientId: a.id },
      { tenantId: fixture.owner.tenantId, userId: otherUserId, role: 'client', status: 'active', clientId: b.id },
      { tenantId: fixture.owner.tenantId, userId: staffId, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { forms: ['view', 'create', 'edit', 'publish'], checkins: ['view', 'review'], assessments: ['view', 'review'] } } },
    ]);
    return { clientId: a.id, otherClientId: b.id };
  });
  const create = await call(app, 'POST', '/api/v1/forms', { as: fixture.owner.userId, body: { name: { en: 'Weekly', ar: 'المتابعة' }, formKind: kind } });
  if (create.status !== 201) throw new Error(`Create form: ${JSON.stringify(create.json)}`);
  const formId = z.object({ head: z.object({ id: z.string() }) }).parse(create.json).head.id;
  const document = FormDocument.parse({ sections: [{ id: 'health', title: { en: 'Health' }, questions: [
    { id: 'train', type: 'yes_no', label: { en: 'Training?' }, required: true },
    { id: 'photo', type: 'photo', label: { en: 'Photo' }, required: true, visibleIf: { questionId: 'train', op: 'eq', value: true } },
    { id: 'weight', type: 'number', label: { en: 'Weight' }, metricKey: 'weight', unit: 'kg' },
  ] }] });
  const draft = await call(app, 'PUT', `/api/v1/forms/${formId}/draft`, { as: fixture.owner.userId, body: { document, baseVersionNo: 1 } });
  if (draft.status !== 200) throw new Error(`Save form: ${JSON.stringify(draft.json)}`);
  const published = await call(app, 'POST', `/api/v1/forms/${formId}/publish`, { as: fixture.owner.userId, body: {} });
  if (published.status !== 200) throw new Error(`Publish form: ${JSON.stringify(published.json)}`);
  const versionId = z.object({ id: z.string() }).parse(published.json).id;
  async function send(clientId = ids.clientId) {
    const response = await call(app, 'POST', '/api/v1/forms/send', { as: fixture.owner.userId, body: { clientId, formId, formKind: kind, dueAt: '2026-01-01T08:00:00Z' } });
    if (response.status !== 201) throw new Error(`Send form: ${JSON.stringify(response.json)}`);
    return z.object({ id: z.string() }).parse(response.json).id;
  }
  return { ...fixture, ...ids, userId, otherUserId, staffId, formId, versionId, document, send };
}
