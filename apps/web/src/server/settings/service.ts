import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { businessSettings, consents, media, memberships, tenants, userPreferences } from '@dawlyy/db/schema';
import type { BusinessSettings, UserPreferences } from '@dawlyy/db/schema';
import { forbidden, unprocessable, validationError } from '@/src/api/errors';
import { page, type Cursor } from '@/src/api/lib/pagination';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import type { BusinessUpdate, ConsentInput, PreferencesUpdate } from './schemas';

const DEFAULT_SETTINGS: BusinessSettings = {
  units: { weight: 'kg', length: 'cm' }, numerals: 'western', weekStartsOn: 6,
  exerciseCategories: [], measurementTemplate: [], checkinReviewTurnaroundHours: 48,
};

/** Task 11: what any member may read about the business (no counters, no slug internals). */
export type BusinessView = {
  name: string; defaultLocale: string; timezone: string; currency: string; settings: BusinessSettings;
};

/** Task 11: GET /settings/business. Every member reads it; RLS scopes both rows to the tenant. */
export async function getBusiness(tx: Tx, auth: AuthContext): Promise<BusinessView> {
  const [tenant] = await tx.select({
    name: tenants.name, defaultLocale: tenants.defaultLocale, timezone: tenants.timezone, currency: tenants.currency,
  }).from(tenants).where(eq(tenants.id, auth.tenantId)).limit(1);
  if (!tenant) throw forbidden();
  const [row] = await tx.select({ settings: businessSettings.settings }).from(businessSettings)
    .where(eq(businessSettings.tenantId, auth.tenantId)).limit(1);
  return { ...tenant, settings: { ...DEFAULT_SETTINGS, ...(row?.settings ?? {}) } };
}

/** Task 11: only the owner writes business settings (database policy), on top of the `settings:edit` grant. */
function requireBusinessWriter(auth: AuthContext): void {
  requirePermission(auth, 'settings', 'edit');
  if (auth.role !== 'owner') throw forbidden();
}

/** Task 11: PUT /settings/business. Merges the patch into the stored settings and the tenant columns. */
export async function updateBusiness(tx: Tx, auth: AuthContext, patch: BusinessUpdate): Promise<BusinessView> {
  requireBusinessWriter(auth);
  const before = await getBusiness(tx, auth);
  if (patch.logoMediaId) {
    const [logo] = await tx.select({ id: media.id }).from(media).where(and(
      eq(media.tenantId, auth.tenantId), eq(media.id, patch.logoMediaId), eq(media.purpose, 'branding'),
    )).limit(1);
    if (!logo) throw unprocessable('logo_not_found', 'The logo must be an uploaded branding image of this business');
  }
  const tenantPatch: Partial<typeof tenants.$inferInsert> = {};
  if (patch.name !== undefined) tenantPatch.name = patch.name;
  if (patch.defaultLocale !== undefined) tenantPatch.defaultLocale = patch.defaultLocale;
  if (patch.timezone !== undefined) tenantPatch.timezone = patch.timezone;
  if (Object.keys(tenantPatch).length) await tx.update(tenants).set(tenantPatch).where(eq(tenants.id, auth.tenantId));

  const next: BusinessSettings = { ...before.settings };
  if (patch.units) next.units = patch.units;
  if (patch.exerciseCategories) next.exerciseCategories = [...new Set(patch.exerciseCategories)];
  if (patch.measurementTemplate) next.measurementTemplate = [...new Set(patch.measurementTemplate)];
  if (patch.weekStartsOn !== undefined) next.weekStartsOn = patch.weekStartsOn;
  if (patch.numerals) next.numerals = patch.numerals;
  if (patch.checkinReviewTurnaroundHours !== undefined) next.checkinReviewTurnaroundHours = patch.checkinReviewTurnaroundHours;
  if (patch.logoMediaId !== undefined) { if (patch.logoMediaId) next.logoMediaId = patch.logoMediaId; else delete next.logoMediaId; }
  if (patch.brandColor !== undefined) { if (patch.brandColor) next.brandColor = patch.brandColor.toLowerCase(); else delete next.brandColor; }
  if (patch.quietHours !== undefined) { if (patch.quietHours) next.quietHours = patch.quietHours; else delete next.quietHours; }

  const [existing] = await tx.select({ tenantId: businessSettings.tenantId }).from(businessSettings)
    .where(eq(businessSettings.tenantId, auth.tenantId)).limit(1);
  if (existing) await tx.update(businessSettings).set({ settings: next }).where(eq(businessSettings.tenantId, auth.tenantId));
  else await tx.insert(businessSettings).values({ tenantId: auth.tenantId, settings: next });
  return getBusiness(tx, auth);
}

/** Task 11: GET /settings/preferences. Own row only (policy `user_preferences_self`). */
export async function getPreferences(tx: Tx, auth: AuthContext): Promise<UserPreferences> {
  const [row] = await tx.select({ preferences: userPreferences.preferences }).from(userPreferences)
    .where(and(eq(userPreferences.tenantId, auth.tenantId), eq(userPreferences.userId, auth.userId))).limit(1);
  return row?.preferences ?? {};
}

/** Task 11: PUT /settings/preferences. Shallow merge; `channels` merges per channel; null clears quiet hours. */
export async function updatePreferences(tx: Tx, auth: AuthContext, patch: PreferencesUpdate): Promise<UserPreferences> {
  const current = await getPreferences(tx, auth);
  const next: UserPreferences = { ...current };
  if (patch.locale) next.locale = patch.locale;
  if (patch.timezone) next.timezone = patch.timezone;
  if (patch.units) next.units = patch.units;
  if (patch.channels) next.channels = { ...current.channels, ...patch.channels };
  if (patch.quietHours !== undefined) { if (patch.quietHours) next.quietHours = patch.quietHours; else delete next.quietHours; }
  const [existing] = await tx.select({ userId: userPreferences.userId }).from(userPreferences)
    .where(and(eq(userPreferences.tenantId, auth.tenantId), eq(userPreferences.userId, auth.userId))).limit(1);
  if (existing) {
    await tx.update(userPreferences).set({ preferences: next })
      .where(and(eq(userPreferences.tenantId, auth.tenantId), eq(userPreferences.userId, auth.userId)));
  } else {
    await tx.insert(userPreferences).values({ tenantId: auth.tenantId, userId: auth.userId, preferences: next });
  }
  return next;
}

/** Task 11: a consent row as the caller may see it; ip hash and user agent stay server-side. */
export type ConsentView = {
  id: string; kind: (typeof consents.$inferSelect)['kind']; version: string; locale: string;
  accepted: boolean; acceptedAt: string; withdrawnAt: string | null;
};

const stamp = (column: typeof consents.acceptedAt | typeof consents.withdrawnAt) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const consentColumns = {
  id: consents.id, kind: consents.kind, version: consents.version, locale: consents.locale, accepted: consents.accepted,
  acceptedAt: stamp(consents.acceptedAt),
  withdrawnAt: sql<string | null>`case when ${consents.withdrawnAt} is null then null else ${stamp(consents.withdrawnAt)} end`,
};

/** Task 11: newest row per kind decides the current state: `accepted`, `withdrawn` or absent. */
export function currentConsents(rows: readonly ConsentView[]): Record<string, { state: 'accepted' | 'withdrawn'; version: string; at: string }> {
  const result: Record<string, { state: 'accepted' | 'withdrawn'; version: string; at: string }> = {};
  const sorted = [...rows].sort((a, b) => (a.acceptedAt < b.acceptedAt ? 1 : a.acceptedAt > b.acceptedAt ? -1 : a.id < b.id ? 1 : -1));
  for (const row of sorted) {
    if (Object.hasOwn(result, row.kind)) continue;
    result[row.kind] = row.accepted && !row.withdrawnAt
      ? { state: 'accepted', version: row.version, at: row.acceptedAt }
      : { state: 'withdrawn', version: row.version, at: row.withdrawnAt ?? row.acceptedAt };
  }
  return result;
}

/** Task 11: GET /settings/consents. The caller's own records, newest first, with the current state per kind. */
export async function listOwnConsents(tx: Tx, auth: AuthContext) {
  const rows = await tx.select(consentColumns).from(consents)
    .where(and(eq(consents.tenantId, auth.tenantId), eq(consents.userId, auth.userId)))
    .orderBy(desc(consents.acceptedAt), desc(consents.id)).limit(200);
  return { items: rows, current: currentConsents(rows) };
}

/** Task 11: salted digest of the caller address. The raw address is never stored. */
export function hashAddress(tenantId: string, address: string): string {
  return createHash('sha256').update(`${tenantId}:${address}`).digest('hex');
}

/** Task 11: request facts the server records with a consent. */
export type ConsentMeta = { address: string | null; userAgent: string | null };

/**
 * Task 11 / spec §44: POST /settings/consents. Append-only: an acceptance inserts a row; a withdrawal sets
 * `withdrawn_at` on the newest accepted, not yet withdrawn row of that kind and inserts nothing.
 * `accepted_at` is stamped by the guard trigger; address hash and user agent come from the request, not the body.
 */
export async function recordConsent(tx: Tx, auth: AuthContext, input: ConsentInput, meta: ConsentMeta): Promise<ConsentView> {
  if (input.accepted) {
    const [row] = await tx.insert(consents).values({
      tenantId: auth.tenantId, userId: auth.userId, kind: input.kind, version: input.version, locale: input.locale,
      accepted: true, ipHash: meta.address ? hashAddress(auth.tenantId, meta.address) : null,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 400) : null,
    }).returning({ id: consents.id });
    if (!row) throw forbidden();
    return readConsent(tx, auth, row.id);
  }
  const [target] = await tx.select({ id: consents.id }).from(consents).where(and(
    eq(consents.tenantId, auth.tenantId), eq(consents.userId, auth.userId), eq(consents.kind, input.kind),
    eq(consents.accepted, true), sql`${consents.withdrawnAt} is null`,
  )).orderBy(desc(consents.acceptedAt), desc(consents.id)).limit(1).for('update');
  if (!target) throw unprocessable('no_active_consent', 'There is no active consent of this kind to withdraw');
  await tx.update(consents).set({ withdrawnAt: new Date() }).where(and(eq(consents.tenantId, auth.tenantId), eq(consents.id, target.id)));
  return readConsent(tx, auth, target.id);
}

async function readConsent(tx: Tx, auth: AuthContext, id: string): Promise<ConsentView> {
  const [row] = await tx.select(consentColumns).from(consents)
    .where(and(eq(consents.tenantId, auth.tenantId), eq(consents.id, id))).limit(1);
  if (!row) throw forbidden();
  return row;
}

/** Task 11: GET /settings/consents/all. Owner only (policy `consents_owner`), keyset by (accepted_at, id) newest first. */
export async function listTenantConsents(tx: Tx, auth: AuthContext, query: { limit: number; cursor?: Cursor }) {
  if (auth.role !== 'owner') throw forbidden();
  let position;
  if (query.cursor) {
    const { k, id } = query.cursor;
    if (typeof k !== 'string' || !z.iso.datetime({ offset: true }).safeParse(k).success || !z.uuid().safeParse(id).success) throw validationError();
    // Compare as timestamptz text so Postgres microseconds survive the cursor round trip.
    position = or(sql`${consents.acceptedAt} < ${k}::timestamptz`,
      and(sql`${consents.acceptedAt} = ${k}::timestamptz`, lt(consents.id, id)));
  }
  const rows = await tx.select({
    ...consentColumns, userId: consents.userId, memberName: memberships.displayName,
  }).from(consents)
    .leftJoin(memberships, and(eq(memberships.tenantId, consents.tenantId), eq(memberships.userId, consents.userId)))
    .where(and(eq(consents.tenantId, auth.tenantId), position))
    .orderBy(desc(consents.acceptedAt), desc(consents.id)).limit(query.limit + 1);
  return page(rows, query.limit, (row) => row.acceptedAt);
}
