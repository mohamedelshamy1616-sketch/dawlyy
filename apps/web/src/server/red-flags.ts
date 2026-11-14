import 'server-only';
import { sql } from 'drizzle-orm';
import { detectRedFlags } from '@dawlyy/core/safety';
import type { Tx } from './db';
import { ApiError } from '../api/errors';

/** R0c/R4c: deterministic matches only; a source-scope refusal must abort the source write. */
export async function raiseRedFlags(tx: Tx, source: 'message' | 'checkin' | 'meal_note', sourceId: string, text: string | null | undefined) {
  for (const match of detectRedFlags(text ?? '')) {
    try { await tx.execute(sql`select app.raise_red_flag(${source}, ${sourceId}::uuid, ${match.category}, ${match.matched.slice(0, 200)})`); }
    catch { throw new ApiError(500, 'internal_error', 'Red flag source validation failed'); }
  }
}
// C15: the staff-only inbox reads live in red-flags-inbox.ts, imported only by the requireStaffRole router.
