import 'server-only';
import { sql } from 'drizzle-orm';
import type { AuthContext, Tx } from '../db';
import { forbidden } from '../../api/errors';
import { requirePermission } from '../require-permission';
import { reviewPreferencesSchema } from './schemas';
import type { ReviewPreferences } from './types';

function requirePreferenceAccess(auth: AuthContext): void {
  if (auth.role !== 'owner' && auth.role !== 'staff') throw forbidden();
  requirePermission(auth, 'checkins', 'review');
}
/** R4b: the unknown JSON review key is trusted only after strict validation. */
export function readReviewPreferences(preferences: unknown): ReviewPreferences {
  const value = preferences !== null && typeof preferences === 'object' && 'review' in preferences ? preferences.review : undefined;
  const parsed = reviewPreferencesSchema.safeParse(value);
  return parsed.success ? parsed.data : { dialect: 'egyptian', signaturePhrases: [] };
}
/** R4b: pure merge; persistence uses atomic jsonb_set to avoid lost unrelated changes. */
export function mergeReviewPreferences(preferences: Record<string, unknown>, input: ReviewPreferences): Record<string, unknown> {
  return { ...preferences, review: reviewPreferencesSchema.parse(input) };
}
/** R4b: self-only read even for tenant owners. */
export async function getReviewPreferences(tx: Tx, auth: AuthContext): Promise<ReviewPreferences> {
  requirePreferenceAccess(auth);
  const [row] = await tx.execute<{ review: unknown }>(sql`
    select preferences->'review' as review from public.user_preferences
    where tenant_id = ${auth.tenantId}::uuid and user_id = ${auth.userId}::uuid`);
  return readReviewPreferences(row);
}
/** R4b: self-only RLS/guard retain numerals, channels and every unknown key. */
export async function putReviewPreferences(tx: Tx, auth: AuthContext, input: ReviewPreferences): Promise<ReviewPreferences> {
  requirePreferenceAccess(auth);
  const preferences = reviewPreferencesSchema.parse(input);
  const [row] = await tx.execute<{ review: unknown }>(sql`
    insert into public.user_preferences (tenant_id, user_id, preferences)
    values (${auth.tenantId}::uuid, ${auth.userId}::uuid, jsonb_build_object('review', ${JSON.stringify(preferences)}::jsonb))
    on conflict (tenant_id, user_id) do update set preferences =
      jsonb_set(public.user_preferences.preferences, '{review}', ${JSON.stringify(preferences)}::jsonb, true)
    returning preferences->'review' as review`);
  return readReviewPreferences(row);
}
