import { parseCsv, suggestMapping, mapExerciseRows, missingRequiredMappings, type ColumnMapping, type ExistingExercise } from '@dawlyy/core/csv';
import type { ExerciseSeed } from '@dawlyy/core/types';
import { searchKey } from '@dawlyy/core/text';
import { unprocessable, validationError } from '../../api/errors';
import { allowedVideoUrl, exerciseInput } from './validation';

/** Task 4: per-row preview, including normalized duplicates for the import-anyway choice. */
export type PreviewRow = { row: number; status: 'ok' | 'duplicate' | 'error'; errors: { code: string; field?: string }[]; normalized?: ExerciseSeed };

/** Task 4: pure import preview; no database access, identical validation before commit. */
export function previewImport(csv: string, supplied: ColumnMapping | undefined, existing: ExistingExercise[]) {
  let parsed: ReturnType<typeof parseCsv>;
  try { parsed = parseCsv(csv); } catch { throw validationError(undefined, 'invalid_csv'); }
  if (parsed.rows.length > 2000) throw unprocessable('import_too_large', 'At most 2,000 exercise rows are allowed');
  const mapping = supplied ?? suggestMapping(parsed.headers);
  if (Object.values(mapping).some((index) => index === undefined || index >= parsed.headers.length)) throw validationError(undefined, 'invalid_mapping');
  const missing = missingRequiredMappings(mapping);
  const seen = new Set(existing.flatMap((entry) => [entry.name.ar, entry.name.en]).filter((name): name is string => !!name).map(searchKey));
  // Map each row independently: core duplicate errors omit normalized rows, but import_anyway needs them.
  const rows: PreviewRow[] = parsed.rows.map((cells, index) => {
    const rawVideo = mapping.video_url === undefined ? '' : (cells[mapping.video_url] ?? '').trim();
    // Core canonicalizes YouTube HTTP links to HTTPS; validate the original input first.
    if (rawVideo && !allowedVideoUrl(rawVideo)) return { row: index + 1, status: 'error', errors: [{ code: 'invalid_url', field: 'video_url' }] };
    const result = mapExerciseRows({ ...parsed, rows: [cells] }, mapping).results[0];
    if (!result || !result.ok) return { row: index + 1, status: 'error', errors: result && !result.ok ? result.errors.map(({ code, field }) => ({ code, field })) : [{ code: 'required' }] };
    const normalized = result.exercise;
    if (normalized.videoUrl && !allowedVideoUrl(normalized.videoUrl)) return { row: index + 1, status: 'error', errors: [{ code: 'invalid_url', field: 'video_url' }] };
    const { slug, ...writable } = normalized;
    void slug;
    const validated = exerciseInput.safeParse(writable);
    if (!validated.success) return { row: index + 1, status: 'error', errors: validated.error.issues.map((issue) => ({ code: issue.code === 'too_big' ? 'too_long' : 'invalid', field: String(issue.path[0] ?? '') })) };
    const keys = [normalized.name.ar, normalized.name.en].filter((name): name is string => !!name).map(searchKey).filter(Boolean);
    const duplicate = keys.some((key) => seen.has(key));
    keys.forEach((key) => seen.add(key));
    return { row: index + 1, status: duplicate ? 'duplicate' : 'ok', errors: duplicate ? [{ code: 'duplicate' }] : [], normalized };
  });
  return { headers: parsed.headers, mapping, missingRequiredMappings: missing, rows, counts: {
    total: rows.length, ok: rows.filter((row) => row.status === 'ok').length,
    duplicate: rows.filter((row) => row.status === 'duplicate').length, error: rows.filter((row) => row.status === 'error').length,
  } };
}
