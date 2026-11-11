import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { clients, memberships, staffClientAssignments, tasks } from '@dawlyy/db/schema';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { createSystemTask } from '../server/dashboard/tasks';
import { app } from './index';

const taskSchema = z.object({
  id: z.string(), clientId: z.string().nullable(), clientName: z.string().nullable(), title: z.string(), detail: z.string().nullable(), priority: z.string(), state: z.string(),
  dueAt: z.string().nullable(), snoozedUntil: z.string().nullable(), assigneeMembershipId: z.string().nullable(), source: z.string(), completedAt: z.string().nullable(),
});
const listSchema = z.object({ items: z.array(taskSchema), nextCursor: z.string().nullable() });
const errorSchema = z.object({ error: z.object({ code: z.string() }) });

describe('Task 10 tasks API', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  let clientA: string; let clientB: string;
  let scopedStaff: string; let viewOnlyStaff: string; let clientUser: string; let noGrantStaff: string; let staffMembership: string;
  beforeEach(async () => {
    fixture = await setupApiFixture();
    const tenantId = fixture.owner.tenantId;
    scopedStaff = randomUUID(); viewOnlyStaff = randomUUID(); clientUser = randomUUID(); noGrantStaff = randomUUID(); staffMembership = randomUUID();
    const ids = await setupApiData(tenantId, 'tasks fixture', async tx => {
      const [a] = await tx.insert(clients).values({ tenantId, firstName: 'Alaa', lastName: 'Hassan' }).returning({ id: clients.id });
      const [b] = await tx.insert(clients).values({ tenantId, firstName: 'Bassem' }).returning({ id: clients.id });
      if (!a || !b) throw new Error('Missing client fixture');
      await tx.insert(memberships).values([
        { id: staffMembership, tenantId, userId: scopedStaff, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { dashboard: ['view', 'create', 'edit'] } } },
        { tenantId, userId: viewOnlyStaff, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { dashboard: ['view'] } } },
        { tenantId, userId: noGrantStaff, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { clients: ['view'] } } },
        { tenantId, userId: clientUser, role: 'client', status: 'active', clientId: a.id },
      ]);
      await tx.insert(staffClientAssignments).values({ tenantId, membershipId: staffMembership, clientId: a.id });
      return { a: a.id, b: b.id };
    });
    clientA = ids.a; clientB = ids.b;
  });
  afterEach(async () => { await fixture?.cleanup(); });

  const owner = () => fixture.owner.userId;
  async function create(body: Record<string, unknown>, as = owner()) {
    const response = await call(app, 'POST', '/api/v1/tasks', { as, body });
    expect(response.status, JSON.stringify(response.json)).toBe(201);
    return taskSchema.parse(response.json);
  }
  async function list(query = '', as = owner()) {
    const response = await call(app, 'GET', `/api/v1/tasks${query}`, { as });
    expect(response.status, JSON.stringify(response.json)).toBe(200);
    return listSchema.parse(response.json);
  }
  const post = (path: string, body?: unknown, as = owner()) => call(app, 'POST', `/api/v1/tasks/${path}`, { as, ...(body === undefined ? {} : { body }) });
  const code = (json: unknown) => errorSchema.parse(json).error.code;

  it('creates a manual task with server-owned fields and rejects client-supplied ones', async () => {
    const task = await create({ title: '  Call Alaa  ', priority: 'high', dueAt: '2030-01-01T09:00:00Z', clientId: clientA, assigneeMembershipId: fixture.owner.membershipId });
    expect(task).toMatchObject({ title: 'Call Alaa', priority: 'high', state: 'open', source: 'manual', clientId: clientA, clientName: 'Alaa Hassan', assigneeMembershipId: fixture.owner.membershipId, completedAt: null });
    expect(await create({ title: 'Defaults' })).toMatchObject({ priority: 'normal', state: 'open', clientId: null, dueAt: null });
    for (const body of [{ title: '' }, { title: 'x', priority: 'asap' }, { title: 'x', source: 'rule:fake' }, { title: 'x', dedupeKey: 'k' }, { title: 'x', state: 'done' }, { title: 'x', dueAt: 'tomorrow' }]) {
      expect((await call(app, 'POST', '/api/v1/tasks', { as: owner(), body })).status, JSON.stringify(body)).toBe(400);
    }
    expect((await call(app, 'POST', '/api/v1/tasks', { as: owner(), body: { title: 'x', clientId: randomUUID() } })).status).toBe(404);
    const stranger = await call(app, 'POST', '/api/v1/tasks', { as: owner(), body: { title: 'x', assigneeMembershipId: randomUUID() } });
    expect(stranger.status).toBe(422);
    expect(code(stranger.json)).toBe('invalid_assignee');
    const clientAssignee = await setupApiData(fixture.owner.tenantId, 'client membership id', async tx =>
      (await tx.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, fixture.owner.tenantId), eq(memberships.userId, clientUser))))[0]?.id);
    const refused = await call(app, 'POST', '/api/v1/tasks', { as: owner(), body: { title: 'x', assigneeMembershipId: clientAssignee } });
    expect(refused.status).toBe(422);
  });

  it('snoozing hides a task from the default list until the time passes', async () => {
    const task = await create({ title: 'Check macros' });
    expect((await list()).items.map(item => item.id)).toEqual([task.id]);
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const snoozed = await post(`${task.id}/snooze`, { until });
    expect(snoozed.status).toBe(200);
    expect(taskSchema.parse(snoozed.json)).toMatchObject({ state: 'snoozed' });
    expect((await list()).items).toEqual([]);
    expect((await list('?state=snoozed')).items.map(item => item.id)).toEqual([task.id]);
    expect((await list('?state=all')).items.map(item => item.id)).toEqual([task.id]);
    // Re-snoozing a snoozed task moves the time.
    expect((await post(`${task.id}/snooze`, { until: new Date(Date.now() + 7_200_000).toISOString() })).status).toBe(200);
    // Time passes: the stored snooze moves into the past (service transaction; the clock cannot be advanced).
    await setupApiData(fixture.owner.tenantId, 'let the snooze expire', async tx => {
      await tx.update(tasks).set({ snoozedUntil: new Date(Date.now() - 1000) }).where(eq(tasks.id, task.id));
    });
    expect((await list()).items.map(item => item.id)).toEqual([task.id]);
    expect((await list('?state=snoozed')).items).toEqual([]);
    const past = await post(`${task.id}/snooze`, { until: new Date(Date.now() - 60_000).toISOString() });
    expect(past.status).toBe(422);
    expect(code(past.json)).toBe('snooze_in_past');
    expect((await post(`${task.id}/snooze`, {})).status).toBe(400);
  });

  it('completes and reopens with the database stamping completion', async () => {
    const task = await create({ title: 'Send plan' });
    const done = taskSchema.parse((await post(`${task.id}/complete`)).json);
    expect(done.state).toBe('done');
    expect(done.completedAt).not.toBeNull();
    expect((await list()).items).toEqual([]);
    expect((await list('?state=done')).items.map(item => item.id)).toEqual([task.id]);
    const again = await post(`${task.id}/complete`);
    expect(again.status).toBe(409);
    expect((await call(app, 'PATCH', `/api/v1/tasks/${task.id}`, { as: owner(), body: { title: 'Late edit' } })).status).toBe(409);
    expect((await post(`${task.id}/snooze`, { until: new Date(Date.now() + 60_000).toISOString() })).status).toBe(409);
    const reopened = taskSchema.parse((await post(`${task.id}/reopen`)).json);
    expect(reopened).toMatchObject({ state: 'open', completedAt: null, snoozedUntil: null });
    expect((await post(`${task.id}/reopen`)).status).toBe(409);
    expect((await post(`${randomUUID()}/complete`)).status).toBe(404);
    expect((await post('not-a-uuid/complete')).status).toBe(400);
  });

  it('patches editable fields, never the client, and refuses an empty patch', async () => {
    const task = await create({ title: 'Original', clientId: clientA });
    const patched = await call(app, 'PATCH', `/api/v1/tasks/${task.id}`, { as: owner(), body: { title: 'Renamed', priority: 'urgent', detail: 'Bring InBody', dueAt: '2031-02-03T10:00:00Z' } });
    expect(taskSchema.parse(patched.json)).toMatchObject({ title: 'Renamed', priority: 'urgent', detail: 'Bring InBody', clientId: clientA });
    expect(taskSchema.parse((await call(app, 'PATCH', `/api/v1/tasks/${task.id}`, { as: owner(), body: { dueAt: null, detail: null } })).json)).toMatchObject({ dueAt: null, detail: null });
    expect((await call(app, 'PATCH', `/api/v1/tasks/${task.id}`, { as: owner(), body: {} })).status).toBe(400);
    expect((await call(app, 'PATCH', `/api/v1/tasks/${task.id}`, { as: owner(), body: { clientId: clientB } })).status).toBe(400);
    expect((await call(app, 'PATCH', `/api/v1/tasks/${randomUUID()}`, { as: owner(), body: { title: 'x' } })).status).toBe(404);
  });

  it('filters by client, assignee and due date and pages with a stable keyset', async () => {
    const soon = await create({ title: 'soon', dueAt: '2030-01-01T00:00:00Z', clientId: clientA });
    const later = await create({ title: 'later', dueAt: '2030-06-01T00:00:00Z', assigneeMembershipId: fixture.owner.membershipId });
    const never = await create({ title: 'never', clientId: clientB });
    expect((await list()).items.map(item => item.id)).toEqual([soon.id, later.id, never.id]);
    expect((await list(`?clientId=${clientA}`)).items.map(item => item.id)).toEqual([soon.id]);
    expect((await list(`?assigneeMembershipId=${fixture.owner.membershipId}`)).items.map(item => item.id)).toEqual([later.id]);
    expect((await list('?dueBefore=2030-03-01T00:00:00Z')).items.map(item => item.id)).toEqual([soon.id]);
    const first = await list('?limit=2');
    expect(first.items.map(item => item.id)).toEqual([soon.id, later.id]);
    expect(first.nextCursor).not.toBeNull();
    const second = await list(`?limit=2&cursor=${first.nextCursor}`);
    expect(second.items.map(item => item.id)).toEqual([never.id]);
    expect(second.nextCursor).toBeNull();
    expect((await call(app, 'GET', '/api/v1/tasks?cursor=junk', { as: owner() })).status).toBe(400);
    expect((await call(app, 'GET', '/api/v1/tasks?state=weird', { as: owner() })).status).toBe(400);
  });

  it('creates one system task per dedupe key and tenant, without ON CONFLICT', async () => {
    const tenantId = fixture.owner.tenantId;
    const input = { tenantId, rule: 'missed_checkin', dedupeKey: `missed_checkin:${clientA}:2030-01-07`, title: 'Check-in missed', clientId: clientA, priority: 'high' as const };
    const first = await setupApiData(tenantId, 'system task', tx => createSystemTask(tx, input));
    const second = await setupApiData(tenantId, 'system task repeat', tx => createSystemTask(tx, { ...input, title: 'Check-in missed (again)' }));
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
    const rows = await setupApiData(tenantId, 'count system tasks', tx => tx.select().from(tasks).where(and(eq(tasks.tenantId, tenantId), eq(tasks.dedupeKey, input.dedupeKey))));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'rule:missed_checkin', title: 'Check-in missed' });
    const listed = (await list()).items.find(item => item.id === first.id);
    expect(listed).toMatchObject({ source: 'rule:missed_checkin', state: 'open' });
    // Concurrent callers with the same key still produce one row.
    const racing = { ...input, dedupeKey: 'racing-key' };
    await Promise.all([1, 2, 3].map(() => setupApiData(tenantId, 'racing system task', tx => createSystemTask(tx, racing))));
    expect(await setupApiData(tenantId, 'count racing', tx => tx.select().from(tasks).where(eq(tasks.dedupeKey, 'racing-key')))).toHaveLength(1);
  });

  it('enforces module grants, client scope and the client role', async () => {
    const forB = await create({ title: 'For B', clientId: clientB });
    const forA = await create({ title: 'For A', clientId: clientA });
    const general = await create({ title: 'General' });
    // Assigned-scope staff only see tasks of their clients plus tasks with no client.
    const visible = (await list('', scopedStaff)).items.map(item => item.id);
    expect(visible.sort()).toEqual([forA.id, general.id].sort());
    expect((await post(`${forB.id}/complete`, undefined, scopedStaff)).status).toBe(404);
    expect((await call(app, 'POST', '/api/v1/tasks', { as: scopedStaff, body: { title: 'x', clientId: clientB } })).status).toBe(404);
    expect(taskSchema.parse((await post(`${forA.id}/complete`, undefined, scopedStaff)).json).state).toBe('done');
    // View-only staff read but cannot write; staff without the dashboard grant cannot read.
    expect((await list('', viewOnlyStaff)).items.length).toBeGreaterThan(0);
    expect((await call(app, 'POST', '/api/v1/tasks', { as: viewOnlyStaff, body: { title: 'x' } })).status).toBe(403);
    expect((await post(`${general.id}/complete`, undefined, viewOnlyStaff)).status).toBe(403);
    expect((await call(app, 'PATCH', `/api/v1/tasks/${general.id}`, { as: viewOnlyStaff, body: { title: 'x' } })).status).toBe(403);
    expect((await call(app, 'GET', '/api/v1/tasks', { as: noGrantStaff })).status).toBe(403);
    // Clients get 403 on every route; anonymous callers get 401.
    expect((await call(app, 'GET', '/api/v1/tasks', { as: clientUser })).status).toBe(403);
    expect((await call(app, 'POST', '/api/v1/tasks', { as: clientUser, body: { title: 'x' } })).status).toBe(403);
    expect((await call(app, 'PATCH', `/api/v1/tasks/${general.id}`, { as: clientUser, body: { title: 'x' } })).status).toBe(403);
    for (const action of ['complete', 'reopen']) expect((await post(`${general.id}/${action}`, undefined, clientUser)).status, action).toBe(403);
    expect((await post(`${general.id}/snooze`, { until: new Date(Date.now() + 60_000).toISOString() }, clientUser)).status).toBe(403);
    expect((await call(app, 'GET', '/api/v1/tasks')).status).toBe(401);
  });
});
