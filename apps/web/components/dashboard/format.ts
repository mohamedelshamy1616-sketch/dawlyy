/** Task 10: locale-aware dates for dashboard rows; null-safe. */
export function formatDate(value: string | null | undefined, locale: string, withTime = false): string {
  if (!value) return '';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium', ...(value.length === 10 ? { timeZone: 'UTC' } : {}) }).format(date);
}

/** Task 10: send JSON to the API with a fresh idempotency key; throws on any non-2xx so callers can show one error. */
export async function sendJson<T>(path: string, method: 'GET' | 'POST' | 'PATCH', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(method === 'GET' ? {} : { 'Idempotency-Key': crypto.randomUUID() }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
  return await response.json() as T;
}
