'use client';

/** Task 4: preserve API error codes without displaying untranslated server messages. */
export class ExerciseRequestError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Task 4: same-origin exercise HTTP boundary, with caller-owned keys for retryable writes. */
export async function exerciseRequest<T>(path: string, options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<T> {
  const headers = new Headers();
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.key) headers.set('Idempotency-Key', options.key);
  const response = await fetch(`/api/v1/exercises${path}`, { method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store',
    headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal });
  const result: unknown = await response.json();
  if (!response.ok) {
    const code = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'object' && result.error !== null && 'code' in result.error ? String(result.error.code) : 'request';
    throw new ExerciseRequestError(code);
  }
  return result as T;
}
