import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { withAuthTx } from '../server/db';
import { clientColumns } from '@dawlyy/db';
import { clients, exercises, memberships, packages, programs, programVersions, staffClientAssignments, subscriptions } from '@dawlyy/db/schema';
import { ProgramDocument, ScheduleRules } from '@dawlyy/core/types';
import { diffDocuments, summarizeDiff } from '@dawlyy/core/versioning';
import { call, setupApiData, setupApiFixture } from '../test/api-harness';
import { app } from './index';
import { mapProgramError } from '../server/programs/helpers';
import { createProgram } from '../server/programs/service';

const versionSchema = z.object({ id: z.string(), versionNo: z.number(), status: z.string(), document: ProgramDocument });
const detailSchema = z.object({ head: z.object({ id: z.string(), currentVersionId: z.string().nullable(), publishedVersionId: z.string().nullable() }), currentVersion: versionSchema, revision: z.string() });
const savedSchema = z.object({ document: ProgramDocument, versionNo: z.number(), revision: z.string() });
const errorSchema = z.object({ error: z.object({ code: z.string() }) });

describe('Task 4 program builder API and database boundaries', () => {
  let fixture: Awaited<ReturnType<typeof setupApiFixture>>;
  beforeEach(async () => { fixture = await setupApiFixture(); });
  afterEach(async () => { await fixture?.cleanup(); });
  const path = (id = '') => `/api/v1/programs${id ? `/${id}` : ''}`;
  async function create(trainingDays: number[] = []) {
    const response = await call(app, 'POST', path(), { as: fixture.owner.userId, body: { name: { en: 'Strength', ar: 'قوة' }, weeks: 1, trainingDays } });
    expect(response.status).toBe(201);
    return detailSchema.parse(response.json);
  }
  async function get(id: string) {
    const response = await call(app, 'GET', path(id), { as: fixture.owner.userId });
    expect(response.status).toBe(200);
    return detailSchema.parse(response.json);
  }
  async function publish(id: string) {
    const response = await call(app, 'POST', `${path(id)}/publish`, { as: fixture.owner.userId, body: {} });
    expect(response.status).toBe(200);
    return versionSchema.parse(response.json);
  }
  async function client(firstName: string) {
    return setupApiData(fixture.owner.tenantId, 'program client fixture', async tx => {
      const [row] = await tx.insert(clients).values({ tenantId: fixture.owner.tenantId, firstName }).returning({ id: clients.id });
      if (!row) throw new Error('Client fixture missing');
      return row;
    });
  }

  it('creates a template and draft v1 atomically, and ops return the edited document', async () => {
    const template = await create();
    expect(template.currentVersion).toMatchObject({ versionNo: 1, status: 'draft' });
    expect(template.head).toMatchObject({ currentVersionId: template.currentVersion.id, publishedVersionId: null });
    const result = await call(app, 'POST', `${path(template.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'meta.update', patch: { goal: { en: 'Stronger' } } }] } });
    expect(result.status).toBe(200);
    expect(savedSchema.parse(result.json).document.goal).toEqual({ en: 'Stronger' });
    expect((await get(template.head.id)).currentVersion.document.goal).toEqual({ en: 'Stronger' });
  });

  it('rejects stale version numbers and stale same-version revision tokens', async () => {
    const template = await create();
    const stale = await call(app, 'PUT', `${path(template.head.id)}/draft`, { as: fixture.owner.userId, body: { baseVersionNo: 9, document: template.currentVersion.document } });
    expect(stale.status).toBe(409);
    expect(errorSchema.parse(stale.json).error.code).toBe('stale_draft');
    const first = await call(app, 'POST', `${path(template.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, baseRevision: template.revision, ops: [{ type: 'meta.update', patch: { goal: { en: 'First tab' } } }] } });
    expect(first.status).toBe(200);
    const second = await call(app, 'PUT', `${path(template.head.id)}/draft`, { as: fixture.owner.userId, body: { baseVersionNo: 1, baseRevision: template.revision, document: template.currentVersion.document } });
    expect(second.status).toBe(409);
  });

  it('publishes in order, reads back the trigger pointer, and refuses direct frozen-version writes', async () => {
    const template = await create();
    const v1 = await publish(template.head.id);
    expect((await get(template.head.id)).head.publishedVersionId).toBe(v1.id);
    const edit = await call(app, 'POST', `${path(template.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'meta.update', patch: { goal: { en: 'Next cycle' } } }] } });
    expect(savedSchema.parse(edit.json).versionNo).toBe(2);
    const v2 = await publish(template.head.id);
    const rows = await withAuthTx(fixture.owner, tx => tx.select({ id: programVersions.id, status: programVersions.status }).from(programVersions).where(eq(programVersions.programId, template.head.id)));
    expect(rows).toEqual(expect.arrayContaining([{ id: v1.id, status: 'superseded' }, { id: v2.id, status: 'published' }]));
    const [head] = await withAuthTx(fixture.owner, tx => tx.select({ pointer: programs.publishedVersionId }).from(programs).where(eq(programs.id, template.head.id)));
    expect(head?.pointer).toBe(v2.id);
    for (const method of ['PATCH', 'PUT']) {
      const refused = await call(app, method, `${path(template.head.id)}/versions/1`, { as: fixture.owner.userId, body: { document: template.currentVersion.document } });
      expect(refused.status).toBe(409);
      expect(errorSchema.parse(refused.json).error.code).toBe('version_immutable');
    }
    const refusal = await withAuthTx(fixture.owner, tx => tx.update(programVersions).set({ document: { ...v1.document, notes: { en: 'Tampered history' } } }).where(eq(programVersions.id, v1.id))).then(() => null, error => mapProgramError(error));
    expect(refusal).toMatchObject({ status: 409, code: 'version_immutable' });
    const unchanged = await call(app, 'POST', `${path(template.head.id)}/publish`, { as: fixture.owner.userId, body: {} });
    expect(unchanged.status).toBe(422);
    expect(errorSchema.parse(unchanged.json).error.code).toBe('nothing_to_publish');
  });

  it('refuses invalid publication and planted exercise references', async () => {
    const template = await create([0]);
    const invalid = await call(app, 'POST', `${path(template.head.id)}/publish`, { as: fixture.owner.userId, body: {} });
    expect(invalid.status).toBe(422);
    expect(errorSchema.parse(invalid.json).error.code).toBe('program_invalid');
    const day = template.currentVersion.document.phases[0]!.weeks[0]!.days[0]!;
    const planted = await call(app, 'POST', `${path(template.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'item.add', dayId: day.id, blockId: day.workout!.blocks[0]!.id, exerciseId: randomUUID() }] } });
    expect(planted.status).toBe(422);
    const other = await setupApiFixture();
    try {
      const foreignId = await setupApiData(other.owner.tenantId, 'invisible exercise reference', async tx => {
        const [row] = await tx.insert(exercises).values({ tenantId: other.owner.tenantId, slug: 'private-lift', name: { en: 'Private' }, category: 'strength', movementPattern: 'squat', difficulty: 'beginner' }).returning({ id: exercises.id });
        if (!row) throw new Error('Missing exercise'); return row.id;
      });
      const foreign = await call(app, 'POST', `${path(template.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'item.add', dayId: day.id, blockId: day.workout!.blocks[0]!.id, exerciseId: foreignId }] } });
      expect(foreign.status).toBe(422);
      expect(errorSchema.parse(foreign.json).error.code).toBe('program_invalid');
    } finally { await other.cleanup(); }
  });

  it('keeps the template and B unchanged when A is edited and republished; replacement preserves the copy head', async () => {
    const template = await create();
    await publish(template.head.id);
    const a = await client('A'); const b = await client('B');
    async function assign(clientId: string, replace = false) {
      return call(app, 'POST', `${path(template.head.id)}/assign`, { as: fixture.owner.userId, body: { clientId, startDate: '2026-11-09', publish: true, replace } });
    }
    const copyAResponse = await assign(a.id); const copyBResponse = await assign(b.id);
    expect(copyAResponse.status).toBe(201); expect(copyBResponse.status).toBe(201);
    const copyA = detailSchema.parse(copyAResponse.json); const copyB = detailSchema.parse(copyBResponse.json);
    expect(copyA.currentVersion.document.startDate).toBe('2026-11-09');
    expect((await assign(a.id)).status).toBe(409);
    expect((await call(app, 'POST', `${path(copyA.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'meta.update', patch: { goal: { en: 'Only A' } } }] } })).status).toBe(200);
    await publish(copyA.head.id);
    expect((await get(template.head.id)).currentVersion.document).toEqual(template.currentVersion.document);
    expect((await get(copyB.head.id)).currentVersion.document).toEqual(copyB.currentVersion.document);
    const replaced = await assign(a.id, true);
    expect(replaced.status).toBe(201);
    expect(detailSchema.parse(replaced.json).head.id).toBe(copyA.head.id);
    expect(detailSchema.parse(replaced.json).currentVersion.versionNo).toBe(3);
  });

  it('enforces assigned scope and denies clients every coach route while RLS projections expose only their history', async () => {
    const template = await create(); await publish(template.head.id);
    const a = await client('A'); const b = await client('B');
    const staffId = randomUUID(); const staffMembership = randomUUID(); const clientUser = randomUUID(); const clientMembership = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'program scope memberships', async tx => {
      await tx.insert(memberships).values([
        { id: staffMembership, tenantId: fixture.owner.tenantId, userId: staffId, role: 'staff', status: 'active', permissions: { client_scope: 'assigned', modules: { programs: ['manage'] } } },
        { id: clientMembership, tenantId: fixture.owner.tenantId, userId: clientUser, role: 'client', status: 'active', clientId: a.id },
      ]);
      await tx.insert(staffClientAssignments).values({ tenantId: fixture.owner.tenantId, membershipId: staffMembership, clientId: a.id });
    });
    expect((await call(app, 'POST', `${path(template.head.id)}/assign`, { as: staffId, body: { clientId: b.id } })).status).toBe(404);
    const choices = await call(app, 'GET', `${path(template.head.id)}/assignment-clients`, { as: staffId });
    expect(choices.status).toBe(200);
    const choiceRows = z.object({ items: z.array(z.object({ id: z.string() })) }).parse(choices.json);
    expect(choiceRows.items.map(row => row.id)).toEqual([a.id]);
    const copy = detailSchema.parse((await call(app, 'POST', `${path(template.head.id)}/assign`, { as: staffId, body: { clientId: a.id, publish: true } })).json);
    await call(app, 'POST', `${path(template.head.id)}/assign`, { as: fixture.owner.userId, body: { clientId: b.id, publish: true } });
    await call(app, 'POST', `${path(copy.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'meta.update', patch: { notes: { en: 'Unpublished' } } }] } });
    const requests: Array<[string, string, unknown?]> = [
      ['GET', ''], ['POST', '', { name: { en: 'No' } }], ['GET', `/${template.head.id}`], ['PATCH', `/${template.head.id}`, { archived: true }],
      ['PUT', `/${copy.head.id}/draft`, { baseVersionNo: 2, document: template.currentVersion.document }],
      ['POST', `/${copy.head.id}/ops`, { baseVersionNo: 2, ops: [{ type: 'meta.update', patch: {} }] }],
      ...['submit-review', 'approve', 'duplicate', 'publish'].map(action => ['POST', `/${copy.head.id}/${action}`, {}] as [string, string, unknown]),
      ['POST', `/${copy.head.id}/revert`, { toVersionNo: 1 }], ['POST', `/${template.head.id}/assign`, { clientId: a.id }],
      ['GET', `/${copy.head.id}/versions`], ['GET', `/${copy.head.id}/versions/1`], ['GET', `/${copy.head.id}/versions/1/diff/2`],
      ['GET', `/${template.head.id}/assignment-clients`],
      ['PATCH', `/${copy.head.id}/versions/1`, { document: template.currentVersion.document }], ['PUT', `/${copy.head.id}/versions/1`, { document: template.currentVersion.document }],
    ];
    for (const [method, suffix, body] of requests) expect((await call(app, method, `${path()}${suffix}`, { as: clientUser, body })).status).toBe(403);
    const own = { userId: clientUser, tenantId: fixture.owner.tenantId, membershipId: clientMembership, role: 'client' as const, permissions: null, clientId: a.id };
    const visible = await withAuthTx(own, tx => tx.select(clientColumns.programVersions).from(programVersions));
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ programId: copy.head.id, status: 'published' });
    expect(visible[0]).not.toHaveProperty('changeNote'); expect(visible[0]).not.toHaveProperty('createdBy');
    expect(await withAuthTx(own, tx => tx.select(clientColumns.programs).from(programs))).toHaveLength(1);
  });

  it('revert appends a draft without altering history and diff summaries count core entries', async () => {
    const template = await create(); const v1 = await publish(template.head.id);
    await call(app, 'POST', `${path(template.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'meta.update', patch: { goal: { en: 'Changed' } } }] } });
    const v2 = await publish(template.head.id);
    const diff = await call(app, 'GET', `${path(template.head.id)}/versions/1/diff/2`, { as: fixture.owner.userId });
    expect(diff.json).toEqual(diffDocuments(v1.document, v2.document));
    const history = await call(app, 'GET', `${path(template.head.id)}/versions`, { as: fixture.owner.userId });
    const historyRows = z.object({ items: z.array(z.object({ versionNo: z.number(), diffSummary: z.unknown() })) }).parse(history.json);
    expect(historyRows.items.find(row => row.versionNo === 2)?.diffSummary).toEqual(summarizeDiff(diffDocuments(v1.document, v2.document)));
    expect(summarizeDiff(diffDocuments(v1.document, v2.document))).toMatchObject({ added: 1, removed: 0, changed: 0 });
    const reverted = await call(app, 'POST', `${path(template.head.id)}/revert`, { as: fixture.owner.userId, body: { toVersionNo: 1, changeNote: 'Return to original' } });
    expect(reverted.status).toBe(201);
    expect(savedSchema.parse(reverted.json)).toMatchObject({ versionNo: 3, document: v1.document });
    const [old] = await withAuthTx(fixture.owner, tx => tx.select({ document: programVersions.document, status: programVersions.status }).from(programVersions).where(and(eq(programVersions.programId, template.head.id), eq(programVersions.versionNo, 1))));
    expect(old).toEqual({ document: v1.document, status: 'superseded' });
  });

  it('paginates tied timestamps without skipping rows and searches folded Arabic names', async () => {
    const ids = await withAuthTx(fixture.owner, async tx => {
      const created = [];
      for (const name of ['أَحْمَد', 'Strength', 'Mobility']) created.push((await createProgram(tx, fixture.owner, { name: { ar: name }, weeks: 1, trainingDays: [] })).head.id);
      return created;
    });
    const list = z.object({ items: z.array(z.object({ id: z.string() })), nextCursor: z.string().nullable() });
    const seen: string[] = []; let cursor: string | null = null;
    for (let index = 0; index < 3; index++) {
      const result = await call(app, 'GET', `${path()}?limit=1${cursor ? `&cursor=${cursor}` : ''}`, { as: fixture.owner.userId });
      expect(result.status).toBe(200);
      const response = list.parse(result.json); seen.push(...response.items.map(row => row.id)); cursor = response.nextCursor;
    }
    expect(new Set(seen).size).toBe(3); expect(seen.toSorted()).toEqual(ids.toSorted()); expect(cursor).toBeNull();
    expect(list.parse((await call(app, 'GET', `${path()}?q=${encodeURIComponent('احمد')}`, { as: fixture.owner.userId })).json).items.map(row => row.id)).toEqual([ids[0]]);
    expect((await call(app, 'GET', `${path()}?cursor=bad`, { as: fixture.owner.userId })).status).toBe(400);
  });

  it('replays creation once and lets a solo owner publish through review or directly', async () => {
    const options = { as: fixture.owner.userId, body: { name: { en: 'Once' }, trainingDays: [] }, headers: { 'Idempotency-Key': randomUUID() } };
    const first = await call(app, 'POST', path(), options); const replay = await call(app, 'POST', path(), options);
    expect(first.status).toBe(201); expect(replay.json).toEqual(first.json);
    const template = detailSchema.parse(first.json);
    expect((await call(app, 'POST', `${path(template.head.id)}/approve`, { as: fixture.owner.userId })).status).toBe(422);
    expect((await call(app, 'POST', `${path(template.head.id)}/submit-review`, { as: fixture.owner.userId })).status).toBe(200);
    expect((await call(app, 'PUT', `${path(template.head.id)}/draft`, { as: fixture.owner.userId, body: { baseVersionNo: 1, document: template.currentVersion.document } })).status).toBe(422);
    expect((await call(app, 'POST', `${path(template.head.id)}/approve`, { as: fixture.owner.userId })).status).toBe(200);
    await publish(template.head.id);
    expect((await call(app, 'GET', `${path()}`, { as: fixture.owner.userId })).json).toMatchObject({ items: [expect.objectContaining({ id: template.head.id })] });
  });

  it('checks the mutation grant without requiring a staff view grant and rejects missing grants', async () => {
    const staffId = randomUUID();
    await setupApiData(fixture.owner.tenantId, 'create-only staff', async tx => {
      await tx.insert(memberships).values({ tenantId: fixture.owner.tenantId, userId: staffId, role: 'staff', status: 'active', permissions: { client_scope: 'all', modules: { programs: ['create'] } } });
    });
    const created = await call(app, 'POST', path(), { as: staffId, body: { name: { en: 'Staff-created' }, trainingDays: [] } });
    expect(created.status).toBe(201);
    const template = detailSchema.parse(created.json);
    expect((await call(app, 'GET', path(template.head.id), { as: staffId })).status).toBe(403);
    expect((await call(app, 'POST', `${path(template.head.id)}/publish`, { as: staffId, body: {} })).status).toBe(403);
    expect((await call(app, 'PATCH', path(template.head.id), { as: staffId, body: { archived: true } })).status).toBe(403);
    expect((await call(app, 'GET', path())).status).toBe(401);
  });

  it('duplicates a template without shared edits and checks subscription ownership when assigning', async () => {
    const template = await create(); await publish(template.head.id);
    const duplicateResponse = await call(app, 'POST', `${path(template.head.id)}/duplicate`, { as: fixture.owner.userId });
    expect(duplicateResponse.status).toBe(201);
    const duplicate = detailSchema.parse(duplicateResponse.json);
    expect(duplicate.head.id).not.toBe(template.head.id);
    expect(duplicate.currentVersion).toMatchObject({ status: 'draft', versionNo: 1, document: template.currentVersion.document });
    await call(app, 'POST', `${path(duplicate.head.id)}/ops`, { as: fixture.owner.userId, body: { baseVersionNo: 1, ops: [{ type: 'meta.update', patch: { goal: { en: 'Independent duplicate' } } }] } });
    expect((await get(template.head.id)).currentVersion.document).toEqual(template.currentVersion.document);
    const a = await client('A'); const b = await client('B');
    const subscription = await setupApiData(fixture.owner.tenantId, 'assignment subscription ownership', async tx => {
      const [pkg] = await tx.insert(packages).values({ tenantId: fixture.owner.tenantId, name: { en: 'Coaching' }, durationDays: 28, scheduleRules: ScheduleRules.parse({}) }).returning({ id: packages.id });
      if (!pkg) throw new Error('Missing package');
      const [row] = await tx.insert(subscriptions).values({ tenantId: fixture.owner.tenantId, clientId: a.id, packageId: pkg.id, startsOn: '2026-11-01', endsOn: '2026-11-29', state: 'active',
        packageSnapshot: { name: { en: 'Coaching' }, durationDays: 28, price: 0, currency: 'EGP', entitlements: [], scheduleRules: ScheduleRules.parse({}) } }).returning({ id: subscriptions.id });
      if (!row) throw new Error('Missing subscription'); return row;
    });
    expect((await call(app, 'POST', `${path(template.head.id)}/assign`, { as: fixture.owner.userId, body: { clientId: b.id, subscriptionId: subscription.id } })).status).toBe(404);
    const own = await call(app, 'POST', `${path(template.head.id)}/assign`, { as: fixture.owner.userId, body: { clientId: a.id } });
    expect(own.status).toBe(201);
    expect(own.json).toMatchObject({ head: { subscriptionId: subscription.id } });
    expect((await call(app, 'PATCH', path(duplicate.head.id), { as: fixture.owner.userId, body: { name: { en: 'Renamed' }, tags: ['strength'], archived: true } })).status).toBe(200);
    expect((await call(app, 'GET', `${path()}?kind=template&archived=true`, { as: fixture.owner.userId })).json).toMatchObject({ items: [expect.objectContaining({ id: duplicate.head.id })] });
    expect((await call(app, 'PATCH', path(duplicate.head.id), { as: fixture.owner.userId, body: { archived: false } })).status).toBe(200);
  });
});
