import { z } from 'zod';

/** Task 7: preserve API error codes for translated client UI; never show raw server diagnostics. */
export class FormRequestError extends Error {
  constructor(readonly code: string, readonly details?: unknown) { super(code); }
}
const errorSchema = z.object({ error: z.object({ code: z.string(), details: z.unknown().optional() }) });
/** Task 7: same-origin JSON requests with an explicit replay key for writes. */
export async function formRequest(path: string, method = 'GET', body?: unknown, key?: string): Promise<unknown> {
  const response = await fetch(`/api/v1${path}`, { method, credentials: 'same-origin', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value: unknown = await response.json();
  if (!response.ok) {
    const error = errorSchema.safeParse(value); throw new FormRequestError(error.success ? error.data.error.code : 'request_failed', error.success ? error.data.error.details : undefined);
  }
  return value;
}
