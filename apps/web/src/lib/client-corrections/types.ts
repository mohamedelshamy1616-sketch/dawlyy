import type { Macros } from '@dawlyy/core/types';

/** Serializable client contracts mirror the strict create schemas without importing server code. */
export type MealWrite = {
  clientUuid: string; localDate: string; mealId?: string; optionId?: string;
  status: 'eaten' | 'skipped' | 'partial';
  freeEntry?: { text: string; macros?: Macros }; note?: string; clientUpdatedAt: string;
};
export type MeasurementValue = { type: string; value: number; unit: 'cm' | 'in'; side?: 'left' | 'right' };
export type MeasurementWrite = { clientId?: string; localDate: string; clientUuid: string; clientUpdatedAt: string; values: MeasurementValue[] };
export type EntryKind = 'meal' | 'measurement' | 'metric' | 'workout';
export type VoidWrite = { reason?: string };
export type VoidReceipt = { id: string; voidedAt: string };

/** Unknown server timestamps stay null; a local date never substitutes for createdAt. */
export type MealHistoryRow = {
  id: string; clientUuid: string; localDate: string; mealId: string | null; optionId: string | null; planVersionId?: string | null;
  status: string; freeEntry: { text?: string; macros?: Macros } | null; note: string | null;
  clientUpdatedAt: string | null; createdAt: string | null; voidedAt: string | null; replacesId: string | null;
};
export type MeasurementHistoryRow = {
  id: string; localDate: string; values: MeasurementValue[];
  createdAt: string | null; voidedAt: string | null; replacesId: string | null;
  clientUuid?: string; clientUpdatedAt?: string | null;
  deltas?: Array<{ type: string; value: number; unit: string; side?: string; absolute: number | null; percent: number | null }>;
};

