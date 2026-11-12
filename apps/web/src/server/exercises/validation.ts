import { z } from 'zod';
import { ExerciseSeed, PLANES } from '@dawlyy/core/types';
import { EXERCISE_IMPORT_FIELDS } from '@dawlyy/core/csv';
import { MAX_CSV_BYTES } from '../request-limits';

/** Task 4: exact external video host allow-list; own storage uses the configured Supabase origin. */
export const VIDEO_HOSTS: readonly string[] = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

/** Task 4: reject unsafe schemes, credentials, lookalike hosts and arbitrary storage paths. */
export function allowedVideoUrl(value: string, storageOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    if (VIDEO_HOSTS.includes(url.hostname)) return true;
    return !!storageOrigin && url.origin === new URL(storageOrigin).origin && url.pathname.startsWith('/storage/v1/object/');
  } catch { return false; }
}

const video = z.string().max(2048).refine((value) => allowedVideoUrl(value), 'invalid_video_url');
const text = z.string().trim().min(1).max(200);
const strings = z.array(text).max(100);
const localized = ExerciseSeed.shape.name.refine((value) => [value.ar, value.en].every((part) => part === undefined || part.length <= 200), 'too_long');
const localizedRows = z.array(localized).max(100);
const fields = ExerciseSeed.omit({ slug: true }).extend({
  name: localized, category: text, aliases: strings.default([]), primaryMuscles: strings.default([]),
  secondaryMuscles: strings.default([]), equipment: strings.default([]), tags: strings.default([]),
  cues: localizedRows.default([]), commonMistakes: localizedRows.default([]), contraindications: localizedRows.default([]),
  progressions: strings.default([]), regressions: strings.default([]), alternatives: strings.default([]),
  videoUrl: video.nullable().optional(), thumbnailMediaId: z.uuid().nullable().optional(),
});

/** Task 4: writable exercise fields only; reject server-owned and unknown fields. */
export const exerciseInput = fields.strict();
/** Task 4: partial updates do not reset omitted fields to core defaults. */
export const exercisePatch = fields.extend({
  aliases: strings, primaryMuscles: strings, secondaryMuscles: strings, equipment: strings, tags: strings,
  cues: localizedRows, commonMistakes: localizedRows, contraindications: localizedRows,
  progressions: strings, regressions: strings, alternatives: strings,
  unilateral: z.boolean(), compound: z.boolean(), plane: z.enum(PLANES),
}).partial().strict().refine((value) => Object.keys(value).length > 0, 'empty_patch');
/** Task 4: validated writable payload shared by the form and API. */
export type ExerciseInput = z.infer<typeof exerciseInput>;
/** Task 4: import mapping keys and nonnegative column positions. */
export const columnMapping = z.partialRecord(z.enum(EXERCISE_IMPORT_FIELDS), z.number().int().min(0).max(1000));
/** Task 4: CSV upload is bounded by UTF-8 bytes, not JavaScript code units. */
export const importInput = z.object({
  csv: z.string().max(MAX_CSV_BYTES).refine((value) => new TextEncoder().encode(value).length <= MAX_CSV_BYTES, 'csv_too_large'),
  mapping: columnMapping.optional(),
}).strict();
