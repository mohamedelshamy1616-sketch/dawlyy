import { NutritionError } from '@dawlyy/core/nutrition';
import { VersioningError } from '@dawlyy/core/versioning';
import { ApiError, forbidden, notFound, unprocessable } from '../../api/errors';

/** Task 6 / §7.1: preserve database refusals, including immutable published snapshots. */
export function mapNutritionError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  if (error instanceof NutritionError || error instanceof VersioningError) return unprocessable(error.code);
  let nested = error;
  for (let depth = 0; depth < 5 && nested && typeof nested === 'object'; depth++) {
    const pg = nested as { code?: string; detail?: string; cause?: unknown };
    if (pg.detail === 'rule:app.protect_published_version') return new ApiError(409, 'version_immutable', 'Published versions are immutable');
    if (pg.code === '42501') return forbidden();
    if (pg.code === '23503') return notFound();
    if (pg.code === '23505') return new ApiError(409, 'stale_draft', 'The document changed; reload');
    if (pg.code === '23514' || pg.code === 'P0001') return unprocessable('plan_invalid');
    nested = pg.cause;
  }
  return error;
}
