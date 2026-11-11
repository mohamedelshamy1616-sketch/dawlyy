/** Task 6: typed API failures preserve status/code without exposing server error text in UI. */
export class NutritionRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly details?: unknown) { super(code); }
}
/** Task 6: same-origin transport with fresh keys for writes and stable keys for offline replays. */
export async function nutritionRequest<T>(path: string, options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? 'GET'; const headers = new Headers();
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('Idempotency-Key', options.key ?? crypto.randomUUID());
  const response = await fetch(path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), signal: options.signal, credentials: 'same-origin', cache: 'no-store' });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
    throw new NutritionRequestError(response.status, error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'request_failed', error && typeof error === 'object' && 'details' in error ? error.details : undefined);
  }
  return data as T;
}
