import 'server-only';
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { clientColumns } from '@dawlyy/db';
import { foods, nutritionPlans, nutritionPlanVersions, tenantHiddenItems } from '@dawlyy/db/schema';
import { z } from 'zod';
import type { AuthContext, Tx } from '../db';
import { forbidden } from '../../api/errors';
import type { NutritionFood } from './helpers';

const scope = (auth: AuthContext) => or(isNull(foods.tenantId), eq(foods.tenantId, auth.tenantId));
const hiddenScope = (auth: AuthContext, id?: string) => and(eq(tenantHiddenItems.tenantId, auth.tenantId), eq(tenantHiddenItems.kind, 'food'), id ? eq(tenantHiddenItems.itemId, id) : undefined);
// Use the registered map for every column selected in a client endpoint, but omit its private fields from the response.
const clientProjection = { id: clientColumns.foods.id, slug: clientColumns.foods.slug, name: clientColumns.foods.name, aliases: clientColumns.foods.aliases, category: clientColumns.foods.category, per100: clientColumns.foods.per100, rawOrCooked: clientColumns.foods.rawOrCooked, counterpartSlug: clientColumns.foods.counterpartSlug, cookedYield: clientColumns.foods.cookedYield, measures: clientColumns.foods.measures, source: clientColumns.foods.source, brand: clientColumns.foods.brand, hidden: clientColumns.foods.hidden, isSystem: sql<boolean>`${clientColumns.foods.tenantId} is null` };

/** Task 6: resolve food ids under caller RLS, with tenant-local system hiding. */
export async function nutritionFoods(tx: Tx, auth: AuthContext, ids?: string[], _clientFacing = false): Promise<NutritionFood[]> {
  const valid = ids?.filter(id => z.uuid().safeParse(id).success);
  if (valid && !valid.length) return [];
  const rows = await tx.select(clientProjection).from(foods).where(and(scope(auth), valid ? inArray(foods.id, valid) : undefined));
  const hidden = new Set((await tx.select({ id: clientColumns.tenantHiddenItems.itemId }).from(tenantHiddenItems).where(hiddenScope(auth))).map(row => row.id));
  return rows.map(row => ({ ...row, hidden: row.hidden || hidden.has(row.id) }));
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
