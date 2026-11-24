import 'server-only';
import { createHash } from 'node:crypto';
import { canonicalReviewInput, type WeekReviewInput } from '@dawlyy/core/review';

/** R4b: source identity/change markers detect equal-valued corrections. */
export type ReviewSourceMarker = { table: string; id: string; data: unknown };
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, item]) => [key, canonical(item)]));
  return value;
}
/** R4b: row order never changes the revision; permissions are part of the projection. */
export function canonicalSourceRevision(sources: readonly ReviewSourceMarker[], projection: unknown): string {
  return JSON.stringify(canonical({ projection, sources: [...sources].sort((a, b) => a.table.localeCompare(b.table, 'en') || a.id.localeCompare(b.id, 'en')) }));
}
export function hashReviewText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
/** R4b: exact server SHA-256 binding, independent of browser metadata. */
export function hashReviewInputs(input: WeekReviewInput, sourceRevision: string, locale: 'ar' | 'en'): string {
  return createHash('sha256').update(JSON.stringify({ locale, canonical: canonicalReviewInput(input), sourceRevision })).digest('hex');
}
