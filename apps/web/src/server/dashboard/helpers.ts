import { ApiError, forbidden, notFound, unprocessable } from '../../api/errors';

/** Task 10 / doc §7.11.2: map database refusals on tasks and dashboard reads to the standard error codes. */
export function mapDashboardError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  let nested = error;
  for (let depth = 0; depth < 5 && nested && typeof nested === 'object'; depth++) {
    const pg = nested as { code?: string; detail?: string; cause?: unknown };
    if (pg.code === '23503' && pg.detail === 'rule:app.task_assignee_check') return unprocessable('invalid_assignee', 'The assignee must be an active owner or staff member');
    if (pg.code === '42501') return forbidden();
    if (pg.code === '23503') return notFound();
    if (pg.code === '23505') return new ApiError(409, 'conflict', 'Request conflicts with the current state');
    if (pg.code === 'P0001') return unprocessable('transition_refused', 'The database refused this state change');
    if (pg.code === '23514') return unprocessable('task_invalid');
    nested = pg.cause;
  }
  return error;
}
