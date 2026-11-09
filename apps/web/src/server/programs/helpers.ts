import { createHash, randomUUID } from 'node:crypto';
import type { EditCtx } from '@dawlyy/core/program-edit';
import { ProgramEditError } from '@dawlyy/core/program-edit';
import type { ProgramDocument, PublishState } from '@dawlyy/core/types';
import { VersioningError, type VersionRecord } from '@dawlyy/core/versioning';
import { ApiError, forbidden, notFound, unprocessable, validationError } from '../../api/errors';

/** Task 4: the exact core EditCtx is { newId: () => crypto.randomUUID() }, or a browser-generated UUID replay. */
export function editContext(ids?: readonly string[]): EditCtx {
  let index = 0;
  return { newId: () => {
    if (ids === undefined) return randomUUID();
    const id = ids[index++];
    if (id === undefined) throw validationError(undefined, 'The edit id replay was exhausted');
    return id;
  } };
}

/** Doc §12.1 item 3: alternatives are also JSON references and must be resolved through RLS. */
export function exerciseReferences(document: ProgramDocument): string[] {
  const ids = new Set<string>();
  for (const phase of document.phases) for (const week of phase.weeks) for (const day of week.days) {
    for (const block of day.workout?.blocks ?? []) for (const item of block.items) {
      ids.add(item.exerciseId);
      for (const id of item.alternatives ?? []) ids.add(id);
    }
  }
  return [...ids];
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

/** Task 4: content/state token detects two tabs editing the same draft version number. */
export function documentRevision(version: { id: string; status: string; document: unknown }): string {
  return createHash('sha256').update(canonical(version)).digest('hex');
}

/** Task 4: map nullable database snapshots to core's optional ISO timestamp records. */
export function versionRecords<D>(versions: Array<{ id: string; versionNo: number; status: PublishState; document: D; publishedAt: Date | null; changeNote: string | null }>): VersionRecord<D>[] {
  return versions.map(value => ({ id: value.id, versionNo: value.versionNo, status: value.status, document: value.document,
    ...(value.publishedAt ? { publishedAt: value.publishedAt.toISOString() } : {}), ...(value.changeNote === null ? {} : { changeNote: value.changeNote }) }));
}

/** Task 4 / doc §7.1: preserve guard refusals and map frozen version writes to the contract's 409. */
export function mapProgramError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof ProgramEditError) return unprocessable(error.code, error.message);
  if (error instanceof VersioningError) return unprocessable(error.code);
  let nested = error;
  for (let depth = 0; depth < 5 && nested && typeof nested === 'object'; depth++) {
    const pg = nested as { code?: string; detail?: string; cause?: unknown };
    if (pg.detail === 'rule:app.protect_published_version') return new ApiError(409, 'version_immutable', 'Published versions are immutable; create a new draft');
    if (pg.code === '42501') return forbidden();
    if (pg.code === '23503') return notFound();
    if (pg.code === '23505') return new ApiError(409, 'stale_draft', 'The program changed; reload before saving');
    if (pg.code === 'P0001') return unprocessable('transition_refused', 'The database refused this state change');
    if (pg.code === '23514') return unprocessable('program_invalid');
    nested = pg.cause;
  }
  return error;
}
