import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, arrayContains, desc, eq, exists, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { entitlementId } from '@dawlyy/core/entitlements';
import { ENTITLEMENT_KEYS } from '@dawlyy/core/types';
import { normalizePhone, searchKey } from '@dawlyy/core/text';
import { clientEntitlementOverrides, clientNotes, clients, packages, subscriptions } from '@dawlyy/db/schema';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { ApiError, notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { overrideBodySchema } from '../packages/schemas';
import { buildClientSearchKey, entitlementDisplay } from './models';
import { clientListSchema, createClientSchema, updateClientSchema } from './schemas';

/** Task 3: coach-only client record, shared by pages and the client management API. */
export type CoachClient = typeof clients.$inferSelect;

async function readClient(tx: Tx, id: string): Promise<CoachClient> {
  const [row] = await tx.select().from(clients).where(eq(clients.id, id)).limit(1);
  if (!row) throw notFound('Client not found');
  return row;
}

async function latestNote(tx: Tx, id: string): Promise<string> {
  const [note] = await tx.select({ body: clientNotes.body }).from(clientNotes).where(eq(clientNotes.clientId, id))
    .orderBy(desc(clientNotes.createdAt), desc(clientNotes.id)).limit(1);
  return note?.body ?? '';
}

/** Task 3: full coach profile; private notes never enter a client-facing projection. */
export async function getClient(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'clients', 'view');
  const row = await readClient(tx, id);
  const [subscription] = await tx.select({ snapshot: subscriptions.packageSnapshot }).from(subscriptions)
    .where(and(eq(subscriptions.clientId, id), inArray(subscriptions.state, ['active', 'grace', 'paused', 'suspended'])))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(1);
  return { ...row, notes: await latestNote(tx, id), activePackage: subscription?.snapshot.name ?? null };
}

/** Task 3: stable descending client search and filters; RLS alone supplies assigned-client scope. */
export async function listClients(tx: Tx, auth: AuthContext, input: z.input<typeof clientListSchema>) {
  requirePermission(auth, 'clients', 'view');
  const query = clientListSchema.parse(input);
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (!z.string().uuid().safeParse(cursor.id).success || !z.iso.datetime().safeParse(cursor.k).success)) {
    throw validationError(undefined, 'Invalid client cursor');
  }
  const folded = searchKey(query.q ?? '');
  const normalizedPhone = query.q ? normalizePhone(query.q) : null;
  const stamp = sql<string>`to_char(${clients.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const found = await tx.select({ row: clients, cursorStamp: stamp }).from(clients).where(and(
    folded ? or(sql`${clients.searchKey} like ${`%${folded}%`}`,
      sql`replace(lower(${clients.code}), '-', ' ') like ${`%${folded}%`}`,
      normalizedPhone ? sql`${clients.searchKey} like ${`%${searchKey(normalizedPhone)}%`}` : undefined) : undefined,
    query.status ? eq(clients.status, query.status) : undefined,
    query.tag ? arrayContains(clients.tags, [query.tag]) : undefined,
    query.packageId ? exists(tx.select({ id: subscriptions.id }).from(subscriptions).where(and(
      eq(subscriptions.clientId, clients.id), eq(subscriptions.packageId, query.packageId), inArray(subscriptions.state, ['active', 'grace', 'paused', 'suspended']),
    ))) : undefined,
    cursor ? or(sql`${clients.createdAt} < ${cursor.k}::timestamptz`, and(sql`${clients.createdAt} = ${cursor.k}::timestamptz`, lt(clients.id, cursor.id))) : undefined,
  )).orderBy(desc(clients.createdAt), desc(clients.id)).limit(limit + 1);
  const result = page(found.map(item => ({ ...item.row, cursorStamp: item.cursorStamp })), limit, row => row.cursorStamp);
  const current = result.items.length ? await tx.select({ clientId: subscriptions.clientId, packageId: subscriptions.packageId,
    name: subscriptions.packageSnapshot, endsOn: subscriptions.endsOn, timezone: subscriptions.timezone }).from(subscriptions)
    .where(and(inArray(subscriptions.clientId, result.items.map(row => row.id)), inArray(subscriptions.state, ['active', 'grace'])))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)) : [];
  return { ...result, items: result.items.map(({ cursorStamp: _stamp, ...row }) => {
    void _stamp;
    const subscription = current.find(item => item.clientId === row.id);
    const parts = subscription ? new Intl.DateTimeFormat('en', { timeZone: subscription.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()) : [];
    const today = subscription ? `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}-${parts.find(part => part.type === 'day')?.value}` : null;
    return { ...row, activePackage: subscription ? { id: subscription.packageId, name: subscription.name.name } : null,
      daysLeft: subscription && today ? Math.max(0, Math.round((Date.parse(subscription.endsOn) - Date.parse(today)) / 86400000)) : null };
  }) };
}

/** Task 3: small filter/form projections under the clients permission and the caller's RLS scope. */
export async function clientFormOptions(tx: Tx, auth: AuthContext, action: 'view' | 'create' = 'view') {
  requirePermission(auth, 'clients', action);
  const choices = await tx.select({ id: packages.id, name: packages.name }).from(packages).where(isNull(packages.archivedAt))
    .orderBy(packages.sortOrder, packages.id);
  const tags = action === 'view' ? await tx.select({ tags: clients.tags }).from(clients) : [];
  return { packages: choices, tags: [...new Set(tags.flatMap(row => row.tags))].sort() };
}

async function lockClientWrites(tx: Tx, tenantId: string) {
  // The schema has no unique phone/email indexes. Serialize this module's duplicate check and write.
  // The check intentionally remains RLS-scoped: hidden clients cannot be disclosed or probed.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`clients:${tenantId}`}, 0))`);
}

async function checkDuplicate(tx: Tx, contact: { phone?: string | null; email?: string | null }, exclude?: string) {
  if (!contact.phone && !contact.email) return;
  const [existing] = await tx.select({ id: clients.id }).from(clients).where(and(
    exclude ? ne(clients.id, exclude) : undefined,
    or(contact.phone ? eq(clients.phone, contact.phone) : undefined, contact.email ? sql`lower(${clients.email}) = ${contact.email}` : undefined),
  )).limit(1);
  if (existing) throw new ApiError(409, 'duplicate_client', 'A client with this phone or email already exists', { clientId: existing.id });
}

async function appendNote(tx: Tx, auth: AuthContext, clientId: string, notes: string | undefined) {
  if (notes === undefined) return;
  await tx.insert(clientNotes).values({ tenantId: auth.tenantId, clientId, body: notes, authorUserId: auth.userId });
}

/** Task 3 / §12.1 items 13–14: insert without RETURNING; creator assignment precedes the separate read. */
export async function createClient(tx: Tx, auth: AuthContext, input: z.output<typeof createClientSchema>) {
  requirePermission(auth, 'clients', 'create');
  const { notes, packageId, ...body } = createClientSchema.parse(input);
  if (packageId) {
    const [pkg] = await tx.select({ id: packages.id }).from(packages).where(and(eq(packages.id, packageId), isNull(packages.archivedAt))).limit(1);
    if (!pkg) throw notFound('Package not found');
  }
  await lockClientWrites(tx, auth.tenantId);
  await checkDuplicate(tx, body);
  const id = randomUUID();
  await tx.insert(clients).values({ ...body, id, tenantId: auth.tenantId, searchKey: buildClientSearchKey(body) });
  const row = await readClient(tx, id);
  await appendNote(tx, auth, id, notes);
  // packageId is a validated sale hint only. T3b owns creating subscriptions.
  return { ...row, notes: notes ?? '' };
}

/** Task 3: merge a sparse profile patch before regenerating the entire folded search document. */
export async function updateClient(tx: Tx, auth: AuthContext, id: string, input: z.output<typeof updateClientSchema>) {
  requirePermission(auth, 'clients', 'edit');
  const { notes, ...body } = updateClientSchema.parse(input);
  await lockClientWrites(tx, auth.tenantId);
  const previous = await readClient(tx, id);
  const merged = { ...previous, ...body };
  await checkDuplicate(tx, merged, id);
  await tx.update(clients).set({ ...body, searchKey: buildClientSearchKey(merged) }).where(eq(clients.id, id));
  await appendNote(tx, auth, id, notes);
  return { ...await readClient(tx, id), notes: notes ?? await latestNote(tx, id) };
}

/** Task 3 / spec §30: archive retains history; unarchive returns to inactive pending an explicit sale. */
export async function setClientArchived(tx: Tx, auth: AuthContext, id: string, archived: boolean) {
  requirePermission(auth, 'clients', 'edit');
  await lockClientWrites(tx, auth.tenantId);
  const previous = await readClient(tx, id);
  if (archived && previous.status !== 'archived') {
    await tx.update(clients).set({ status: 'archived', archivedAt: new Date() }).where(eq(clients.id, id));
  } else if (!archived && (previous.status === 'archived' || previous.archivedAt !== null)) {
    await tx.update(clients).set({ status: 'inactive', archivedAt: null }).where(eq(clients.id, id));
  }
  return readClient(tx, id);
}

async function overrideContext(tx: Tx, clientId: string) {
  await readClient(tx, clientId);
  // Prefer a current subscription over pending or historical rows; edits to a master never change its snapshot.
  const [subscription] = await tx.select().from(subscriptions).where(and(eq(subscriptions.clientId, clientId), ne(subscriptions.state, 'cancelled')))
    .orderBy(sql`case when ${subscriptions.state} in ('active', 'grace', 'paused', 'suspended') then 0 when ${subscriptions.state} = 'pending' then 1 else 2 end`, desc(subscriptions.createdAt), desc(subscriptions.id)).limit(1);
  const rows = await tx.select().from(clientEntitlementOverrides).where(and(eq(clientEntitlementOverrides.clientId, clientId),
    isNull(clientEntitlementOverrides.revokedAt), subscription ? or(isNull(clientEntitlementOverrides.subscriptionId), eq(clientEntitlementOverrides.subscriptionId, subscription.id)) : isNull(clientEntitlementOverrides.subscriptionId)))
    .orderBy(clientEntitlementOverrides.createdAt, clientEntitlementOverrides.id);
  return { subscription, rows };
}

/** Task 3: package snapshot, live override rows and core-resolved values with provenance. */
export async function getClientOverrides(tx: Tx, auth: AuthContext, clientId: string) {
  requirePermission(auth, 'clients', 'edit');
  const { subscription, rows } = await overrideContext(tx, clientId);
  const entitlements = subscription?.packageSnapshot.entitlements ?? [];
  return { packageId: subscription?.packageId ?? null, entitlements, overrides: rows,
    resolved: entitlementDisplay(entitlements, rows.map(row => row.override)) };
}

function keyIdentity(key: string) {
  if (key.startsWith('custom:') && key.slice(7).trim()) return { key: 'custom' as const, customKey: key.slice(7) };
  const known = ENTITLEMENT_KEYS.find(item => item === key && item !== 'custom');
  if (!known) throw validationError(undefined, 'Invalid entitlement key');
  return { key: known };
}

/** Task 3 / §6.3: replacements revoke the immutable row then append; billing:edit is a database requirement. */
export async function putClientOverride(tx: Tx, auth: AuthContext, clientId: string, key: string, input: z.output<typeof overrideBodySchema>) {
  requirePermission(auth, 'clients', 'edit');
  requirePermission(auth, 'billing', 'edit');
  const body = overrideBodySchema.parse(input);
  const identity = keyIdentity(key);
  await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).for('update');
  const { subscription, rows } = await overrideContext(tx, clientId);
  const override = { ...identity, ...body };
  // Validate the merged result before any write, including custom identity rules absent from core's schema.
  entitlementDisplay(subscription?.packageSnapshot.entitlements ?? [], [override]);
  const old = rows.filter(row => entitlementId(row.override) === key);
  if (old.length) await tx.update(clientEntitlementOverrides).set({ revokedAt: new Date() }).where(inArray(clientEntitlementOverrides.id, old.map(row => row.id)));
  await tx.insert(clientEntitlementOverrides).values({ tenantId: auth.tenantId, clientId, override });
  return getClientOverrides(tx, auth, clientId);
}

/** Task 3 / §6.3: resetting an entitlement revokes matching live rows and retains their audit history. */
export async function resetClientOverride(tx: Tx, auth: AuthContext, clientId: string, key: string) {
  requirePermission(auth, 'clients', 'edit');
  requirePermission(auth, 'billing', 'edit');
  keyIdentity(key);
  await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).for('update');
  const { rows } = await overrideContext(tx, clientId);
  const matching = rows.filter(row => entitlementId(row.override) === key);
  if (matching.length) await tx.update(clientEntitlementOverrides).set({ revokedAt: new Date() }).where(inArray(clientEntitlementOverrides.id, matching.map(row => row.id)));
  return getClientOverrides(tx, auth, clientId);
}
