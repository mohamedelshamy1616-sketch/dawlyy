import { ApiError, forbidden, notFound, unprocessable } from '@/src/api/errors';

/** Task 9: the SQLSTATE of a database error, whether postgres.js threw it or drizzle wrapped it. */
export function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && typeof current === 'object' && current !== null; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Task 9: translate guard and RLS refusals into the standard envelope; anything else is rethrown unchanged. */
export function mapMessagingError(error: unknown): unknown {
  if (error instanceof ApiError) return error;
  const code = pgCode(error);
  if (code === '42501') return forbidden();
  if (code === '23503') return notFound();
  if (code === '22023') return unprocessable('invalid_push_subscription', 'The push subscription is not valid');
  return error;
}
