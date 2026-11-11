import 'server-only';
import { ApiError, forbidden, unprocessable, validationError } from '@/src/api/errors';

function databaseError(error: unknown): { code?: string; detail?: string } {
  if (!error || typeof error !== 'object') return {};
  const own = {
    code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
    detail: 'detail' in error && typeof error.detail === 'string' ? error.detail : undefined,
  };
  if (own.code) return own;
  return 'cause' in error ? databaseError(error.cause) : {};
}

/**
 * Task 11: run a service call and map database refusals to the standard envelope. RLS or an allow-list refusal (42501)
 * is 403, a failed check or key (23514, 23503) is 400, a duplicate (23505) is 409, a guard rule (P0001) is 422.
 * Query parameters never reach the message.
 */
export async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof ApiError) throw error;
    const { code, detail } = databaseError(error);
    if (code === '42501') throw forbidden();
    if (code === '23503' || code === '23514') throw validationError();
    if (code === '23505') throw new ApiError(409, 'conflict', 'The request conflicts with existing data');
    if (code === 'P0001') {
      throw detail?.includes('keep_one_owner')
        ? unprocessable('last_owner', 'A business must keep at least one active owner')
        : unprocessable();
    }
    throw error;
  }
}
