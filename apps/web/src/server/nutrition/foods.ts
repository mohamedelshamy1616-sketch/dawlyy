import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { foods, nutritionPlans, nutritionPlanVersions, tenantHiddenItems } from '@dawlyy/db/schema';
import { slugify } from '@dawlyy/core/text';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { forbidden, notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { foodSearchScore, foodSortKey, type NutritionFood } from './helpers';
import { foodInput, foodPatch, type foodListSchema } from './schemas';

const scope = (auth: AuthContext) => or(isNull(foods.tenantId), eq(foods.tenantId, auth.tenantId));
const hiddenScope = (auth: AuthContext, id?: string) => and(eq(tenantHiddenItems.tenantId, auth.tenantId), eq(tenantHiddenItems.kind, 'food'), id ? eq(tenantHiddenItems.itemId, id) : undefined);
const projection = { id: foods.id, slug: foods.slug, name: foods.name, aliases: foods.aliases, category: foods.category, per100: foods.per100, rawOrCooked: foods.rawOrCooked, counterpartSlug: foods.counterpartSlug, cookedYield: foods.cookedYield, measures: foods.measures, source: foods.source, brand: foods.brand, hidden: foods.hidden, isSystem: sql<boolean>`${foods.tenantId} is null` };
// Use the registered map for every column selected in a client endpoint, but omit its private fields from the response.
const cp = clientColumns.foods;
const clientProjection = { id: cp.id, slug: cp.slug, name: cp.name, aliases: cp.aliases, category: cp.category, per100: cp.per100, rawOrCooked: cp.rawOrCooked, counterpartSlug: cp.counterpartSlug, cookedYield: cp.cookedYield, measures: cp.measures, source: cp.source, brand: cp.brand, hidden: cp.hidden, isSystem: sql<boolean>`${cp.tenantId} is null` };

/** Task 6: resolve food ids under caller RLS, with tenant-local system hiding. */
export async function nutritionFoods(tx: Tx, auth: AuthContext, ids?: string[], clientFacing = false): Promise<NutritionFood[]> {
  const valid = ids?.filter(id => z.uuid().safeParse(id).success);
  if (valid && !valid.length) return [];
  const rows = await tx.select(clientFacing ? clientProjection : projection).from(foods).where(and(scope(auth), valid ? inArray(foods.id, valid) : undefined));
  const hidden = new Set((await tx.select({ id: clientColumns.tenantHiddenItems.itemId }).from(tenantHiddenItems).where(hiddenScope(auth))).map(row => row.id));
  return rows.map(row => ({ ...row, hidden: row.hidden || hidden.has(row.id) }));
}
/** Task 6: coach-only folded search with the shared keyset envelope. */
export async function listFoods(tx: Tx, auth: AuthContext, query: z.infer<typeof foodListSchema> = {}) {
  if (auth.role === 'client') throw forbidden();
  requirePermission(auth, 'foods', 'view');
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !z.uuid().safeParse(cursor.id).success)) throw validationError();
  // Frozen schema has no folded-name index; match T4a's bounded library scan and core folding.
  const rows = (await nutritionFoods(tx, auth)).filter(row => (query.includeHidden === 'true' || !row.hidden)
    && (!query.category || row.category === query.category) && (!query.source || row.source === query.source)
    && (!query.q?.trim() || foodSearchScore(row, query.q) > 0))
    .map(row => ({ ...row, nameKey: foodSortKey(row) }))
    .sort((a, b) => a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .filter(row => !cursor || row.nameKey > String(cursor.k) || (row.nameKey === cursor.k && row.id > cursor.id)).slice(0, limit + 1);
  const result = page(rows, limit, row => row.nameKey);
  return { ...result, items: result.items.map(({ nameKey, ...row }) => { void nameKey; return row; }) };
}
/** Task 6: clients can resolve only foods in their currently published plan, through the safe map. */
export async function foodsByIds(tx: Tx, auth: AuthContext, ids: string[]) {
  if (auth.role !== 'client' || !auth.clientId) throw forbidden();
  const versions = await tx.select({ document: clientColumns.nutritionPlanVersions.document }).from(nutritionPlanVersions)
    .innerJoin(nutritionPlans, and(eq(nutritionPlans.id, nutritionPlanVersions.planId), eq(nutritionPlans.publishedVersionId, nutritionPlanVersions.id)))
    .where(and(eq(nutritionPlans.tenantId, auth.tenantId), eq(nutritionPlans.clientId, auth.clientId), isNull(nutritionPlans.archivedAt), eq(nutritionPlanVersions.status, 'published')));
  const allowed = new Set(versions.flatMap(row => row.document.meals.flatMap(meal => meal.options.flatMap(option => option.items.map(item => item.foodId)))));
  return { items: await nutritionFoods(tx, auth, ids.filter(id => allowed.has(id)), true) };
}
/** Task 6: single coach food lookup shares library visibility and module checks. */
export async function getFood(tx: Tx, auth: AuthContext, id: string) {
  if (auth.role === 'client') throw forbidden(); requirePermission(auth, 'foods', 'view');
  const [food] = await nutritionFoods(tx, auth, [id]); if (!food) throw notFound(); return food;
}
async function lock(tx: Tx, auth: AuthContext) { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`foods:${auth.tenantId}`}::text, 0))`); }
async function editable(tx: Tx, auth: AuthContext, id: string) {
  const [row] = await tx.select({ id: foods.id, tenantId: foods.tenantId }).from(foods).where(and(eq(foods.id, id), scope(auth))).limit(1);
  if (!row) throw notFound(); return row;
}
/** Task 6: create a tenant-owned food, generating source, slug and all stamps on the server. */
export async function createFood(tx: Tx, auth: AuthContext, body: z.infer<typeof foodInput>) {
  requirePermission(auth, 'foods', 'edit'); await lock(tx, auth);
  const value = foodInput.parse(body);
  const [row] = await tx.insert(foods).values({ ...value, tenantId: auth.tenantId, source: 'coach', slug: `${slugify(value.name.en ?? '') || 'food'}-${randomUUID()}` }).returning({ id: foods.id });
  if (!row) throw notFound(); return (await nutritionFoods(tx, auth, [row.id]))[0]!;
}
/** Task 6: system rows are immutable, even for the owner. */
export async function patchFood(tx: Tx, auth: AuthContext, id: string, body: z.infer<typeof foodPatch>) {
  requirePermission(auth, 'foods', 'edit'); await lock(tx, auth);
  if ((await editable(tx, auth, id)).tenantId === null) throw forbidden('system_item_readonly', 'Customise this food first');
  await tx.update(foods).set(foodPatch.parse(body)).where(and(eq(foods.id, id), eq(foods.tenantId, auth.tenantId)));
  return (await nutritionFoods(tx, auth, [id]))[0]!;
}
/** Task 6: system foods hide via tenant_hidden_items; custom foods use their own hidden flag. */
export async function hideFood(tx: Tx, auth: AuthContext, id: string, hidden: boolean) {
  requirePermission(auth, 'foods', 'edit'); await lock(tx, auth); const row = await editable(tx, auth, id);
  if (row.tenantId === null) {
    if (hidden) await tx.insert(tenantHiddenItems).values({ tenantId: auth.tenantId, kind: 'food', itemId: id }).onConflictDoNothing();
    else await tx.delete(tenantHiddenItems).where(hiddenScope(auth, id));
  } else await tx.update(foods).set({ hidden }).where(and(eq(foods.id, id), eq(foods.tenantId, auth.tenantId)));
  return { id, hidden };
}
/** Task 6: clone a shared seed food, preserving provenance without changing the seed. */
export async function cloneFood(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'foods', 'edit'); await lock(tx, auth); const row = await editable(tx, auth, id);
  if (row.tenantId !== null) throw validationError(undefined, 'Only system foods can be customised');
  const [source] = await tx.select().from(foods).where(eq(foods.id, id)).limit(1); if (!source) throw notFound();
  // Pick only the editable nutritional fields: the strict input schema rejects identity, tenant and stamp columns.
  const value = foodInput.parse({ name: source.name, aliases: source.aliases, category: source.category, per100: source.per100, measures: source.measures, tags: source.tags,
    micronutrients: source.micronutrients ?? undefined, rawOrCooked: source.rawOrCooked ?? undefined, counterpartSlug: source.counterpartSlug ?? undefined,
    cookedYield: source.cookedYield ?? undefined, brand: source.brand ?? undefined });
  const [copy] = await tx.insert(foods).values({ ...value, tenantId: auth.tenantId, basedOnId: id, source: 'coach', slug: `${source.slug}-${randomUUID()}` }).returning({ id: foods.id });
  if (!copy) throw notFound(); return (await nutritionFoods(tx, auth, [copy.id]))[0]!;
}
