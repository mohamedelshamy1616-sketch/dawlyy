import type { NutritionDocument } from '@dawlyy/core/types';
import type { NutritionFood } from '@/src/server/nutrition/helpers';

/** Task 6: serialized coach snapshot consumed by the builder. */
export type NutritionDetail = { head: { id: string; name: { ar?: string; en?: string }; tags: string[]; kind: string; archivedAt: string | null }; currentVersion: { id: string; versionNo: number; status: string; document: NutritionDocument; changeNote: string | null }; revision: string; foods: NutritionFood[]; issues: Array<{ code: string; foodId?: string }> };
/** Task 6: grants are resolved on the server and repeated at every API write. */
export type NutritionGrants = { view: boolean; create: boolean; edit: boolean; publish: boolean };
/** Task 6: client projection, date and scope for daily nutrition. */
export type ClientNutrition = { head: { id: string; name: { ar?: string; en?: string } } | null; version: { id: string; versionNo: number; document: NutritionDocument } | null; foods: NutritionFood[]; localDate: string; timezone: string; dayType: 'training' | 'rest'; targets: NutritionDocument['targets'] | null };
/** Task 6: client-visible daily log envelope. */
export type DailyLogs = { items: Array<{ id: string; mealId: string | null; optionId: string | null; clientUuid: string; status: string; freeEntry: { text?: string } | null; note: string | null; clientUpdatedAt: string | null }>; nextCursor: string | null; supplements: Array<{ supplementId: string; taken: boolean; clientUuid: string }>; waterMl: number; localDate: string };
