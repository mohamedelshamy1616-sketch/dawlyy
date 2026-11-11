import 'server-only';
import { createHash } from 'node:crypto';
import { and, desc, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { clients, nutritionPlans, nutritionPlanVersions } from '@dawlyy/db/schema';
import { NutritionDocument } from '@dawlyy/core/types';
import type { Action } from '@dawlyy/core/authz';
import { diffDocuments, summarizeDiff } from '@dawlyy/core/versioning';
import { searchKey } from '@dawlyy/core/text';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden, notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { nutritionFoods } from './foods';
import { documentTotals } from './helpers';
import type { planListSchema } from './schemas';

/** Task 6: coach workspace permission boundary; clients use /nutrition/me exclusively. */
export function nutritionPermission(auth: AuthContext, action: Action = 'view') {
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'nutrition', action);
}
/** Task 6: canonical content/state token for concurrent edits within one draft number. */
export function documentRevision(value: unknown): string {
  const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(',')}}` : JSON.stringify(v) ?? 'null';
  return createHash('sha256').update(canonical(value)).digest('hex');
}
/** Task 6: inaccessible heads are indistinguishable from missing heads. */
export async function nutritionHead(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  nutritionPermission(auth, action);
  const [head] = await tx.select().from(nutritionPlans).where(and(eq(nutritionPlans.id, id), eq(nutritionPlans.tenantId, auth.tenantId))).limit(1);
  if (!head) throw notFound(); return head;
}
/** Task 6: publication issues resolve every food through RLS and tenant-local hiding. */
export async function nutritionIssues(tx: Tx, auth: AuthContext, document: NutritionDocument) {
  const issues: Array<{ code: string; foodId?: string }> = [];
  if (!NutritionDocument.safeParse(document).success || document.targets.kcal <= 0 || document.targets.proteinG <= 0) issues.push({ code: 'targets_or_meals_missing' });
  const ids = [...new Set(document.meals.flatMap(m => m.options.flatMap(o => o.items.map(i => i.foodId))))];
  const available = await nutritionFoods(tx, auth, ids);
  for (const id of ids) { const f = available.find(f => f.id === id); if (!f || f.hidden) issues.push({ code: f ? 'food_hidden' : 'food_unknown', foodId: id }); }
  return issues;
}
/** Task 6: detail initializes the builder with core totals and a revision token. */
export async function getNutrition(tx: Tx, auth: AuthContext, id: string, action: Action = 'view') {
  const head = await nutritionHead(tx, auth, id, action);
  const [version] = await tx.select().from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.planId, id), eq(nutritionPlanVersions.id, head.currentVersionId ?? head.publishedVersionId ?? id))).limit(1);
  if (!version) throw notFound();
  const foods = await nutritionFoods(tx, auth, [...new Set(version.document.meals.flatMap(m => m.options.flatMap(o => o.items.map(i => i.foodId))))]);
  const [published] = head.publishedVersionId ? await tx.select({ versionNo: nutritionPlanVersions.versionNo }).from(nutritionPlanVersions).where(eq(nutritionPlanVersions.id, head.publishedVersionId)).limit(1) : [];
  return { head, currentVersion: version, publishedVersionNo: published?.versionNo ?? null, foods, totals: documentTotals(version.document, foods), issues: await nutritionIssues(tx, auth, version.document), revision: documentRevision({ id: version.id, status: version.status, document: version.document }) };
}
/** Task 6: keyset list with exact Postgres timestamps and a stable UUID tie-breaker. */
export async function listNutrition(tx: Tx, auth: AuthContext, query: z.infer<typeof planListSchema>) {
  nutritionPermission(auth); const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !z.iso.datetime({ precision: 6 }).safeParse(cursor.k).success || !z.uuid().safeParse(cursor.id).success)) throw validationError();
  const current = alias(nutritionPlanVersions, 'working'); const published = alias(nutritionPlanVersions, 'published');
  const stamp = sql`coalesce(${nutritionPlans.updatedAt}, ${nutritionPlans.createdAt})`;
  const sortAt = sql<string>`to_char(${stamp} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  // As in the bounded food library, fold names with core before applying the keyset slice.
  const rows = await tx.select({ id: nutritionPlans.id, name: nutritionPlans.name, kind: nutritionPlans.kind, clientId: nutritionPlans.clientId, archivedAt: nutritionPlans.archivedAt, sortAt, currentStatus: current.status, currentVersionNo: current.versionNo, targets: sql<NutritionDocument['targets'] | null>`${current.document}->'targets'`, publishedVersionNo: published.versionNo,
    assignedClientsCount: sql<number>`(select count(distinct copy.client_id)::int from public.nutrition_plans copy where copy.template_id = ${nutritionPlans.id} and copy.archived_at is null)`.mapWith(Number),
  }).from(nutritionPlans).leftJoin(current, eq(current.id, nutritionPlans.currentVersionId)).leftJoin(published, eq(published.id, nutritionPlans.publishedVersionId))
    .where(and(eq(nutritionPlans.tenantId, auth.tenantId), query.kind ? eq(nutritionPlans.kind, query.kind) : undefined, query.clientId ? eq(nutritionPlans.clientId, query.clientId) : undefined, query.archived === 'true' ? isNotNull(nutritionPlans.archivedAt) : isNull(nutritionPlans.archivedAt),
      cursor ? or(sql`${stamp} < ${cursor.k}::timestamptz`, and(sql`${stamp} = ${cursor.k}::timestamptz`, lt(nutritionPlans.id, cursor.id))) : undefined)).orderBy(desc(stamp), desc(nutritionPlans.id));
  const q = searchKey(query.q ?? '');
  return page(rows.filter(r => !q || searchKey(`${r.name.ar ?? ''} ${r.name.en ?? ''}`).includes(q)).slice(0, limit + 1), limit, r => r.sortAt);
}
/** Task 6: historic document lookup never mutates a snapshot. */
export async function getNutritionVersion(tx: Tx, auth: AuthContext, id: string, versionNo: number, action: Action = 'view') {
  await nutritionHead(tx, auth, id, action);
  const [v] = await tx.select().from(nutritionPlanVersions).where(and(eq(nutritionPlanVersions.planId, id), eq(nutritionPlanVersions.versionNo, versionNo))).limit(1);
  if (!v) throw notFound(); return v;
}
/** Task 6: stable version history plus core semantic summaries. */
export async function listNutritionVersions(tx: Tx, auth: AuthContext, id: string, query: { cursor?: string; limit?: string }) {
  await nutritionHead(tx, auth, id); const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'number' || !Number.isSafeInteger(cursor.k) || cursor.k < 1 || !z.uuid().safeParse(cursor.id).success)) throw validationError();
  const versions = await tx.select().from(nutritionPlanVersions).where(eq(nutritionPlanVersions.planId, id)).orderBy(desc(nutritionPlanVersions.versionNo), desc(nutritionPlanVersions.id));
  const rows = versions.filter(v => !cursor || v.versionNo < Number(cursor.k) || (v.versionNo === cursor.k && v.id < cursor.id)).slice(0, limit + 1);
  return page(rows.map(v => ({ ...v, diffSummary: summarizeDiff(diffDocuments(versions.find(p => p.versionNo < v.versionNo)?.document ?? {}, v.document, { flavor: 'generic' })) })), limit, v => v.versionNo);
}
/** Task 6: compare arbitrary snapshots with core diff labels. */
export async function nutritionDiff(tx: Tx, auth: AuthContext, id: string, a: number, b: number) {
  const before = await getNutritionVersion(tx, auth, id, a); const after = await getNutritionVersion(tx, auth, id, b);
  return diffDocuments(before.document, after.document, { flavor: 'generic' });
}
/** Task 6: minimal assignment picker under nutrition permissions and client RLS. */
export async function assignmentClients(tx: Tx, auth: AuthContext, id: string, query: { q?: string; limit?: string; cursor?: string }) {
  await nutritionHead(tx, auth, id, 'edit'); const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || cursor.k !== cursor.id || !z.uuid().safeParse(cursor.id).success)) throw validationError();
  const q = searchKey(query.q ?? '');
  const rows = await tx.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName, code: clients.code }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), isNull(clients.archivedAt), q ? or(sql`position(${q} in ${clients.searchKey}) > 0`, sql`position(${q} in replace(lower(${clients.code}), '-', ' ')) > 0`) : undefined, cursor ? lt(clients.id, cursor.id) : undefined)).orderBy(desc(clients.id)).limit(limit + 1);
  return page(rows, limit, r => r.id);
}
