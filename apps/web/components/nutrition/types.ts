import type { NutritionDocument } from '@dawlyy/core/types';
import type { MealHistoryRow } from '@/src/lib/client-corrections/types';
import type { NutritionFood } from '@/src/server/nutrition/helpers';

/** Task 6: serialized coach snapshot consumed by the builder. */
export type NutritionDetail = { head: { id: string; name: { ar?: string; en?: string }; tags: string[]; kind: string; archivedAt: string | null }; currentVersion: { id: string; versionNo: number; status: string; document: NutritionDocument; changeNote: string | null }; revision: string; foods: NutritionFood[]; issues: Array<{ code: string; foodId?: string }> };
/** Task 6: grants are resolved on the server and repeated at every API write. */
export type NutritionGrants = { view: boolean; create: boolean; edit: boolean; publish: boolean };
/** Task 6: client projection, date and scope for daily nutrition. */
export type ClientNutrition = { head: { id: string; name: { ar?: string; en?: string } } | null; version: { id: string; versionNo: number; document: NutritionDocument } | null; foods: NutritionFood[]; localDate: string; timezone: string; dayType: 'training' | 'rest'; targets: NutritionDocument['targets'] | null };
/** Task 6: client-visible daily log envelope. */
export type DailyLogRow = Omit<MealHistoryRow, 'localDate' | 'createdAt' | 'voidedAt' | 'replacesId'> & Partial<Pick<MealHistoryRow, 'localDate' | 'createdAt' | 'voidedAt' | 'replacesId'>> & { planVersionId?: string | null };
export type DailyLogs = { items: DailyLogRow[]; nextCursor: string | null; supplements: Array<{ supplementId: string; taken: boolean; clientUuid: string }>; waterMl: number; localDate: string };
/** Legacy projections have unknown timestamps; a local date never becomes an eligibility timestamp. */
export function mealHistoryRow(row: DailyLogRow, localDate: string): MealHistoryRow {
  return { ...row, localDate: row.localDate ?? localDate, createdAt: row.createdAt ?? null, voidedAt: row.voidedAt ?? null, replacesId: row.replacesId ?? null };
}
