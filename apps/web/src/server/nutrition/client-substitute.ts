import 'server-only';
import { equivalentQuantity } from '@dawlyy/core/nutrition';
import type { AuthContext, Tx } from '../db';
import { notFound } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { foodsByIds, nutritionFoods } from './client-read';
import { foodMap } from './helpers';

/** Client substitutions resolve both foods only through the current published plan. */
export async function substituteClientFood(tx: Tx, auth: AuthContext, body: { foodId: string; toFoodId: string; grams: number; rule: 'protein' | 'carbs' | 'fat' | 'kcal' }) {
  if (auth.role !== 'client') requirePermission(auth, 'nutrition', 'view');
  const rows = auth.role === 'client' ? (await foodsByIds(tx, auth, [body.foodId, body.toFoodId])).items : await nutritionFoods(tx, auth, [body.foodId, body.toFoodId]);
  const map = foodMap(rows.filter(f => !f.hidden));
  const from = map.get(body.foodId); const to = map.get(body.toFoodId);
  if (!from || !to) throw notFound();
  return equivalentQuantity(from, to, body.grams, body.rule);
}
