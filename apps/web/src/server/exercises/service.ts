import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { exercises, tenantHiddenItems, businessSettings, media, idempotencyKeys } from '@dawlyy/db/schema';
import { matchScore, searchKey, slugify } from '@dawlyy/core/text';
import type { ColumnMapping } from '@dawlyy/core/csv';
import type { AuthContext, Tx } from '../db';
import { requirePermission } from '../require-permission';
import { createSupabaseServerClient } from '../supabase';
import { ApiError, forbidden, notFound, validationError } from '../../api/errors';
import { page, parseListQuery } from '../../api/lib/pagination';
import { exerciseInput, exercisePatch, type ExerciseInput } from './validation';
import { previewImport } from './import';

/** Task 4 / T4b: small HTTP picker contract; no tenant or author metadata. */
export type ExerciseListItem = {
  id: string; name: { ar?: string; en?: string }; primaryMuscles: string[]; equipment: string[];
  category: string; thumbnailUrl?: string; source: string; hidden: boolean; editable: boolean;
};
/** Task 4: raw, validated list parameters shared with the Server Component. */
export type ExerciseQuery = {
  q?: string; category?: string; muscle?: string; equipment?: string; pattern?: string; difficulty?: string;
  source?: 'system' | 'coach'; includeHidden?: boolean; limit?: string; cursor?: string;
};

const columns = {
  id: exercises.id, tenantId: exercises.tenantId, basedOnId: exercises.basedOnId, slug: exercises.slug,
  name: exercises.name, aliases: exercises.aliases, category: exercises.category, primaryMuscles: exercises.primaryMuscles,
  secondaryMuscles: exercises.secondaryMuscles, movementPattern: exercises.movementPattern, equipment: exercises.equipment,
  difficulty: exercises.difficulty, unilateral: exercises.unilateral, compound: exercises.compound, plane: exercises.plane,
  cues: exercises.cues, commonMistakes: exercises.commonMistakes, contraindications: exercises.contraindications,
  progressions: exercises.progressions, regressions: exercises.regressions, alternatives: exercises.alternatives,
  tags: exercises.tags, videoUrl: exercises.videoUrl, thumbnailMediaId: exercises.thumbnailMediaId,
  source: exercises.source, hidden: exercises.hidden,
};
const scope = (auth: AuthContext) => or(isNull(exercises.tenantId), eq(exercises.tenantId, auth.tenantId));
const hiddenScope = (auth: AuthContext, id?: string) => and(eq(tenantHiddenItems.tenantId, auth.tenantId), eq(tenantHiddenItems.kind, 'exercise'), id ? eq(tenantHiddenItems.itemId, id) : undefined);

async function library(tx: Tx, auth: AuthContext) {
  const rows = await tx.select({
    id: exercises.id, tenantId: exercises.tenantId, name: exercises.name, aliases: exercises.aliases,
    category: exercises.category, primaryMuscles: exercises.primaryMuscles, secondaryMuscles: exercises.secondaryMuscles,
    movementPattern: exercises.movementPattern, equipment: exercises.equipment, difficulty: exercises.difficulty,
    thumbnailMediaId: exercises.thumbnailMediaId, source: exercises.source, hidden: exercises.hidden,
  }).from(exercises).where(scope(auth));
  const hidden = new Set((await tx.select({ id: tenantHiddenItems.itemId }).from(tenantHiddenItems).where(hiddenScope(auth))).map((row) => row.id));
  return rows.map((row) => ({ ...row, hidden: row.hidden || hidden.has(row.id), editable: row.tenantId === auth.tenantId && row.source === 'coach' }));
}

async function thumbnail(tx: Tx, auth: AuthContext, id: string | null): Promise<string | undefined> {
  if (!id) return undefined;
  const [asset] = await tx.select({ bucket: media.bucket, path: media.path }).from(media).where(and(
    eq(media.id, id), eq(media.tenantId, auth.tenantId), isNull(media.clientId), isNull(media.deletedAt),
    or(eq(media.purpose, 'exercise_demo'), eq(media.purpose, 'branding')),
  )).limit(1);
  if (!asset) return undefined;
  const storage = await createSupabaseServerClient();
  const signed = await storage.storage.from(asset.bucket).createSignedUrl(asset.path, 3600);
  return signed.data?.signedUrl;
}

/** Task 4: Arabic-folded search and stable keyset pagination over the scoped library. */
export async function listExercises(tx: Tx, auth: AuthContext, query: ExerciseQuery = {}) {
  requirePermission(auth, 'exercises', 'view');
  const { limit, cursor } = parseListQuery(query);
  if (cursor && (typeof cursor.k !== 'string' || !/^[0-9a-f-]{36}$/i.test(cursor.id))) throw validationError(undefined, 'Invalid exercise cursor');
  // No normalized-name column exists in the frozen schema. Use core searchKey for both sorting and cursors.
  const rows = (await library(tx, auth)).map((row) => ({ ...row, nameKey: searchKey(row.name.en?.trim() || row.name.ar || '') }))
    .filter((row) => (query.includeHidden || !row.hidden)
      && (!query.q || !searchKey(query.q) || matchScore([row.name.ar, row.name.en, ...row.aliases, ...row.primaryMuscles, ...row.secondaryMuscles], query.q) > 0)
      && (!query.category || row.category === query.category) && (!query.muscle || [...row.primaryMuscles, ...row.secondaryMuscles].some((value) => searchKey(value) === searchKey(query.muscle ?? '')))
      && (!query.equipment || row.equipment.some((value) => searchKey(value) === searchKey(query.equipment ?? '')))
      && (!query.pattern || row.movementPattern === query.pattern) && (!query.difficulty || row.difficulty === query.difficulty)
      && (!query.source || row.source === query.source))
    .sort((a, b) => a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .filter((row) => !cursor || row.nameKey > String(cursor.k) || (row.nameKey === cursor.k && row.id > cursor.id))
    .slice(0, limit + 1);
  const result = page(rows, limit, (row) => row.nameKey);
  const items: ExerciseListItem[] = [];
  for (const row of result.items) items.push({ id: row.id, name: row.name, primaryMuscles: row.primaryMuscles, equipment: row.equipment,
    category: row.category, source: row.source, hidden: row.hidden, editable: row.editable, thumbnailUrl: await thumbnail(tx, auth, row.thumbnailMediaId) });
  return { items, nextCursor: result.nextCursor };
}

async function find(tx: Tx, auth: AuthContext, id: string) {
  const [row] = await tx.select(columns).from(exercises).where(and(scope(auth), eq(exercises.id, id))).limit(1);
  if (!row) throw notFound('Exercise not found');
  return row;
}

/** Task 4: full coach detail; hidden rows remain addressable for editing and unhiding. */
export async function getExercise(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'exercises', 'view');
  const row = await find(tx, auth, id);
  const hidden = await tx.select({ id: tenantHiddenItems.itemId }).from(tenantHiddenItems).where(hiddenScope(auth, id)).limit(1);
  const { tenantId, ...detail } = row;
  return { ...detail, editable: tenantId === auth.tenantId && row.source === 'coach', hidden: row.hidden || hidden.length > 0, thumbnailUrl: await thumbnail(tx, auth, row.thumbnailMediaId) };
}

async function lockLibrary(tx: Tx, auth: AuthContext) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`exercises:${auth.tenantId}`}, 0))`);
}

async function checkThumbnail(tx: Tx, auth: AuthContext, id: string | null | undefined) {
  if (!id) return;
  const [asset] = await tx.select({ id: media.id }).from(media).where(and(eq(media.id, id), eq(media.tenantId, auth.tenantId),
    isNull(media.clientId), isNull(media.deletedAt), or(eq(media.purpose, 'exercise_demo'), eq(media.purpose, 'branding')))).limit(1);
  if (!asset) throw validationError(undefined, 'invalid_thumbnail');
}

function insertValues(input: ExerciseInput, auth: AuthContext) {
  return { ...input, tenantId: auth.tenantId, source: 'coach', slug: `${slugify(input.name.en ?? '') || 'exercise'}-${randomUUID()}` };
}

/** Task 4: server-owned source, identity and slug; guard stamps authorship and timestamps. */
export async function createExercise(tx: Tx, auth: AuthContext, input: ExerciseInput) {
  requirePermission(auth, 'exercises', 'create');
  await lockLibrary(tx, auth);
  const parsed = exerciseInput.parse(input);
  await checkThumbnail(tx, auth, parsed.thumbnailMediaId);
  const [row] = await tx.insert(exercises).values(insertValues(parsed, auth)).returning({ id: exercises.id });
  if (!row) throw notFound();
  return getExerciseAfterWrite(tx, auth, row.id);
}

async function getExerciseAfterWrite(tx: Tx, auth: AuthContext, id: string) {
  const { tenantId, ...row } = await find(tx, auth, id);
  return { ...row, editable: tenantId === auth.tenantId, thumbnailUrl: await thumbnail(tx, auth, row.thumbnailMediaId) };
}

/** Task 4: PATCH never edits a shared system row; omitted fields retain their stored values. */
export async function updateExercise(tx: Tx, auth: AuthContext, id: string, input: unknown) {
  requirePermission(auth, 'exercises', 'edit');
  await lockLibrary(tx, auth);
  const row = await find(tx, auth, id);
  if (row.tenantId === null || row.source !== 'coach') throw forbidden('system_item_readonly', 'Use customise to create your own copy');
  const parsed = exercisePatch.parse(input);
  await checkThumbnail(tx, auth, parsed.thumbnailMediaId);
  await tx.update(exercises).set(parsed).where(and(eq(exercises.id, id), eq(exercises.tenantId, auth.tenantId)));
  return getExerciseAfterWrite(tx, auth, id);
}

async function hide(tx: Tx, auth: AuthContext, id: string, hidden: boolean) {
  const row = await find(tx, auth, id);
  if (row.tenantId === null) {
    if (hidden) await tx.insert(tenantHiddenItems).values({ tenantId: auth.tenantId, kind: 'exercise', itemId: id }).onConflictDoNothing();
    else await tx.delete(tenantHiddenItems).where(hiddenScope(auth, id));
  } else await tx.update(exercises).set({ hidden }).where(and(eq(exercises.id, id), eq(exercises.tenantId, auth.tenantId)));
}

/** Task 4: hide/unhide preserves program references and only changes this tenant's visibility. */
export async function setExerciseHidden(tx: Tx, auth: AuthContext, id: string, hidden: boolean) {
  requirePermission(auth, 'exercises', 'edit');
  await lockLibrary(tx, auth);
  await hide(tx, auth, id, hidden);
  return { id, hidden };
}

/** Task 4 / doc §7.6: copy only a visible system reference and hide the original atomically. */
export async function customiseExercise(tx: Tx, auth: AuthContext, id: string) {
  requirePermission(auth, 'exercises', 'edit');
  requirePermission(auth, 'exercises', 'create');
  await lockLibrary(tx, auth);
  const original = await find(tx, auth, id);
  if (original.tenantId !== null || original.source !== 'system') throw validationError(undefined, 'Only system exercises can be customised');
  const input = exerciseInput.parse({ ...Object.fromEntries(Object.keys(exerciseInput.shape).map((key) => [key, original[key as keyof typeof original]])), thumbnailMediaId: null });
  const [copy] = await tx.insert(exercises).values({ ...insertValues(input, auth), basedOnId: id }).returning({ id: exercises.id });
  if (!copy) throw notFound();
  await hide(tx, auth, id, true);
  return getExerciseAfterWrite(tx, auth, copy.id);
}

/** Task 4: configured tabs followed by categories in visible exercises, deduplicated with Arabic folding. */
export async function getCategories(tx: Tx, auth: AuthContext) {
  requirePermission(auth, 'exercises', 'view');
  const [settings] = await tx.select({ settings: businessSettings.settings }).from(businessSettings).where(eq(businessSettings.tenantId, auth.tenantId)).limit(1);
  const used = (await library(tx, auth)).filter((row) => !row.hidden).map((row) => row.category).sort();
  const seen = new Set<string>();
  return [...(settings?.settings.exerciseCategories ?? []), ...used].filter((value) => { const key = searchKey(value); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Task 4: owner-only replacement of categories preserves every other business setting. */
export async function replaceCategories(tx: Tx, auth: AuthContext, categories: string[]) {
  requirePermission(auth, 'exercises', 'edit');
  if (auth.role !== 'owner') throw forbidden();
  await lockLibrary(tx, auth);
  await tx.insert(businessSettings).values({ tenantId: auth.tenantId, settings: {
    units: { weight: 'kg', length: 'cm' }, exerciseCategories: categories, measurementTemplate: [], weekStartsOn: 6,
    checkinReviewTurnaroundHours: 48, numerals: 'western',
  } }).onConflictDoUpdate({ target: businessSettings.tenantId, set: {
    settings: sql`jsonb_set(${businessSettings.settings}, '{exerciseCategories}', ${JSON.stringify(categories)}::jsonb)`,
  } });
  return { categories };
}

/** Task 4: preview reads visible exercises and never writes. */
export async function previewExerciseImport(tx: Tx, auth: AuthContext, csv: string, mapping?: ColumnMapping) {
  requirePermission(auth, 'exercises', 'create');
  return previewImport(csv, mapping, (await library(tx, auth)).filter((row) => !row.hidden));
}

/** Task 4: revalidate under the transaction lock, then insert batches of 100 in the caller's single transaction. */
export async function commitExerciseImport(tx: Tx, auth: AuthContext, csv: string, mapping: ColumnMapping, onDuplicate: 'skip' | 'import_anyway', replay: { key: string; requestHash: string }) {
  requirePermission(auth, 'exercises', 'create');
  await lockLibrary(tx, auth);
  // The shared middleware also persists responses, but its post-handler save is a separate transaction.
  // This receipt makes successful imports atomic even if a response is lost or first requests overlap.
  const replayScope = and(eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId), eq(idempotencyKeys.key, replay.key));
  const cutoff = new Date(Date.now() - 86_400_000);
  const [stored] = await tx.select({ hash: idempotencyKeys.requestHash, status: idempotencyKeys.statusCode, body: idempotencyKeys.responseBody, createdAt: idempotencyKeys.createdAt }).from(idempotencyKeys).where(replayScope).limit(1);
  const receipt = z.object({ inserted: z.number().int(), skipped: z.number().int(), errors: z.array(z.object({ row: z.number().int(), status: z.literal('error'), errors: z.array(z.object({ code: z.string(), field: z.string().optional() })) })) });
  if (stored && stored.createdAt > cutoff) {
    if (stored.hash !== replay.requestHash) throw new ApiError(409, 'idempotency_key_reused', 'Idempotency-Key was already used for a different request');
    if (stored.status !== 200) throw new ApiError(409, 'conflict', 'A previous request already used this key');
    return receipt.parse(stored.body);
  }
  const preview = await previewExerciseImport(tx, auth, csv, mapping);
  if (preview.missingRequiredMappings.length) throw validationError(preview.missingRequiredMappings, 'missing_required_mappings');
  const accepted = preview.rows.filter((row) => row.status === 'ok' || (row.status === 'duplicate' && onDuplicate === 'import_anyway'));
  const values = accepted.flatMap((row) => {
    if (!row.normalized) return [];
    const value = { ...row.normalized };
    const { slug, ...writable } = value;
    // The mapper slug is never an identity input; insertValues generates a collision-free tenant slug.
    void slug;
    return [insertValues(exerciseInput.parse(writable), auth)];
  });
  for (let offset = 0; offset < values.length; offset += 100) await tx.insert(exercises).values(values.slice(offset, offset + 100));
  const result = receipt.parse({ inserted: values.length, skipped: onDuplicate === 'skip' ? preview.counts.duplicate : 0, errors: preview.rows.filter((row) => row.status === 'error') });
  await tx.delete(idempotencyKeys).where(and(replayScope, lte(idempotencyKeys.createdAt, cutoff)));
  await tx.insert(idempotencyKeys).values({ tenantId: auth.tenantId, userId: auth.userId, key: replay.key, requestHash: replay.requestHash, statusCode: 200, responseBody: result });
  return result;
}
