import 'server-only';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { businessSettings, consents, media, memberships, tenants } from '@dawlyy/db/schema';
import type { BusinessSettings } from '@dawlyy/db/schema';
import { forbidden, unprocessable, validationError } from '@/src/api/errors';
import { page, type Cursor } from '@/src/api/lib/pagination';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import type { BusinessUpdate } from './schemas';

import { getBusiness, consentColumns, type BusinessView } from './client-read';
export { getBusiness, getPreferences, updatePreferences, listOwnConsents, currentConsents, recordConsent, hashAddress } from './client-read';
export type { BusinessView, ConsentView, ConsentMeta } from './client-read';

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
