import { and, asc, eq, gt, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { AuthContext, Tx } from '@dawlyy/db';
import { clients, tasks } from '@dawlyy/db/schema';
import { conflict, notFound, unprocessable } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { requirePermission } from '../require-permission';
import type { CreateTaskInput, PatchTaskInput, TaskListQuery } from './schemas';

const clientName = sql<string | null>`coalesce(nullif(${clients.displayName}, ''), nullif(trim(${clients.firstName} || ' ' || coalesce(${clients.lastName}, '')), ''))`;
const sortKey = sql<string>`case when ${tasks.dueAt} is null then 'infinity' else to_char(${tasks.dueAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end`;
const dueSort = sql`coalesce(${tasks.dueAt}, 'infinity'::timestamptz)`;

const taskSelect = {
  id: tasks.id, clientId: tasks.clientId, clientName, title: tasks.title, detail: tasks.detail, priority: tasks.priority, state: tasks.state,
  dueAt: tasks.dueAt, snoozedUntil: tasks.snoozedUntil, assigneeMembershipId: tasks.assigneeMembershipId, source: tasks.source,
  link: tasks.link, completedAt: tasks.completedAt, createdAt: tasks.createdAt, updatedAt: tasks.updatedAt,
};

function stateFilter(state: NonNullable<TaskListQuery['state']>): SQL | undefined {
  switch (state) {
    case 'open': return or(eq(tasks.state, 'open'), and(eq(tasks.state, 'snoozed'), or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, sql`now()`))));
    case 'snoozed': return and(eq(tasks.state, 'snoozed'), gt(tasks.snoozedUntil, sql`now()`));
    case 'all': return undefined;
    default: return eq(tasks.state, state);
  }
}

/**
 * Task 10: list tasks, soonest due first (no due date last), keyset on (due, id).
 * The default `open` view is open tasks plus snoozed tasks whose snooze has passed.
 */
export async function listTasks(tx: Tx, auth: AuthContext, query: TaskListQuery) {
  requirePermission(auth, 'dashboard', 'view');
  const { limit, cursor } = parseListQuery(query);
  const conditions: Array<SQL | undefined> = [
    eq(tasks.tenantId, auth.tenantId),
    stateFilter(query.state ?? 'open'),
    query.assigneeMembershipId ? eq(tasks.assigneeMembershipId, query.assigneeMembershipId) : undefined,
    query.clientId ? eq(tasks.clientId, query.clientId) : undefined,
    query.dueBefore ? sql`${tasks.dueAt} < ${query.dueBefore}::timestamptz` : undefined,
    cursor ? sql`(${dueSort}, ${tasks.id}) > (${String(cursor.k)}::timestamptz, ${cursor.id}::uuid)` : undefined,
  ];
  const rows = await tx.select({ ...taskSelect, sortKey }).from(tasks)
    .leftJoin(clients, and(eq(clients.tenantId, tasks.tenantId), eq(clients.id, tasks.clientId)))
    .where(and(...conditions)).orderBy(asc(dueSort), asc(tasks.id)).limit(limit + 1);
  return page(rows, limit, row => row.sortKey);
}

/** Task 10: one task or 404 (RLS hides tasks of clients outside the caller's scope). */
export async function getTask(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'dashboard', 'view');
  const [row] = await tx.select(taskSelect).from(tasks)
    .leftJoin(clients, and(eq(clients.tenantId, tasks.tenantId), eq(clients.id, tasks.clientId)))
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id))).limit(1);
  if (!row) throw notFound('Task not found');
  return row;
}

/** Task 10: create a manual task. Source, dedupe key, state and stamps are pinned by the database guard. */
export async function createTask(tx: Tx, auth: AuthContext, input: CreateTaskInput) {
  requirePermission(auth, 'dashboard', 'create');
  if (input.clientId) {
    const [client] = await tx.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), eq(clients.id, input.clientId))).limit(1);
    if (!client) throw notFound('Client not found');
  }
  const [created] = await tx.insert(tasks).values({
    tenantId: auth.tenantId, clientId: input.clientId ?? null, title: input.title, detail: input.detail ?? null, priority: input.priority,
    dueAt: input.dueAt ? new Date(input.dueAt) : null, assigneeMembershipId: input.assigneeMembershipId ?? null,
  }).returning({ id: tasks.id });
  if (!created) throw notFound('Task not found');
  return getTask(tx, auth, created.id);
}

async function refuseTransition(tx: Tx, auth: AuthContext, id: string, message: string): Promise<never> {
  const [row] = await tx.select({ state: tasks.state }).from(tasks).where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id))).limit(1);
  if (!row) throw notFound('Task not found');
  throw conflict(message, { state: row.state });
}

/** Task 10: update the editable fields of an open or snoozed task; closed tasks are 409. */
export async function patchTask(tx: Tx, auth: AuthContext, id: string, input: PatchTaskInput) {
  requirePermission(auth, 'dashboard', 'edit');
  const set: Partial<typeof tasks.$inferInsert> = {};
  if (input.title !== undefined) set.title = input.title;
  if (input.detail !== undefined) set.detail = input.detail;
  if (input.priority !== undefined) set.priority = input.priority;
  if (input.dueAt !== undefined) set.dueAt = input.dueAt === null ? null : new Date(input.dueAt);
  if (input.assigneeMembershipId !== undefined) set.assigneeMembershipId = input.assigneeMembershipId;
  const updated = await tx.update(tasks).set(set)
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id), sql`${tasks.state} in ('open', 'snoozed')`)).returning({ id: tasks.id });
  if (!updated.length) await refuseTransition(tx, auth, id, 'Closed tasks cannot be edited; reopen first');
  return getTask(tx, auth, id);
}

/** Task 10: open or snoozed to done; the guard stamps completed_at and completed_by. */
export async function completeTask(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'dashboard', 'edit');
  const updated = await tx.update(tasks).set({ state: 'done', snoozedUntil: null })
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id), sql`${tasks.state} in ('open', 'snoozed')`)).returning({ id: tasks.id });
  if (!updated.length) await refuseTransition(tx, auth, id, 'Only open or snoozed tasks can be completed');
  return getTask(tx, auth, id);
}

/** Task 10: open or snoozed to snoozed until a future instant (422 snooze_in_past otherwise). */
export async function snoozeTask(tx: Tx, auth: AuthContext, id: string, until: string) {
  requirePermission(auth, 'dashboard', 'edit');
  const when = new Date(until);
  if (when.getTime() <= Date.now()) throw unprocessable('snooze_in_past', 'The snooze time must be in the future');
  const updated = await tx.update(tasks).set({ state: 'snoozed', snoozedUntil: when })
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id), sql`${tasks.state} in ('open', 'snoozed')`)).returning({ id: tasks.id });
  if (!updated.length) await refuseTransition(tx, auth, id, 'Only open or snoozed tasks can be snoozed');
  return getTask(tx, auth, id);
}

/** Task 10: done, cancelled or snoozed back to open (clears completion stamps and the snooze). */
export async function reopenTask(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'dashboard', 'edit');
  const updated = await tx.update(tasks).set({ state: 'open', snoozedUntil: null })
    .where(and(eq(tasks.tenantId, auth.tenantId), eq(tasks.id, id), sql`${tasks.state} in ('done', 'cancelled', 'snoozed')`)).returning({ id: tasks.id });
  if (!updated.length) await refuseTransition(tx, auth, id, 'The task is already open');
  return getTask(tx, auth, id);
}

/**
 * Task 10 / doc §6.3: create a system task (source `rule:<rule>`) once per `dedupeKey` and tenant.
 * Only service transactions may call this: the runtime guard pins source and dedupe_key for the app role.
 * A repeat call with the same key returns the existing task and inserts nothing (select-then-insert under an
 * advisory lock; no ON CONFLICT).
 */
export async function createSystemTask(tx: Tx, input: {
  tenantId: string; rule: string; dedupeKey: string; title: string; detail?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent'; clientId?: string | null; dueAt?: Date | null; link?: string | null;
}): Promise<{ id: string; created: boolean }> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tasks-dedupe:${input.tenantId}:${input.dedupeKey}`}::text, 0))`);
  const [existing] = await tx.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.tenantId, input.tenantId), eq(tasks.dedupeKey, input.dedupeKey))).limit(1);
  if (existing) return { id: existing.id, created: false };
  const [row] = await tx.insert(tasks).values({
    tenantId: input.tenantId, clientId: input.clientId ?? null, title: input.title, detail: input.detail ?? null, priority: input.priority ?? 'normal',
    dueAt: input.dueAt ?? null, source: `rule:${input.rule}`, dedupeKey: input.dedupeKey, link: input.link ?? null,
  }).returning({ id: tasks.id });
  if (!row) throw new Error('System task insert returned no row');
  return { id: row.id, created: true };
}
