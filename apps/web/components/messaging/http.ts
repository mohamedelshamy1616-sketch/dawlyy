/** Task 9: JSON helper for the messaging and notification screens. Mutations carry an idempotency key (stable when the caller passes one). */
export class RequestError extends Error {
  readonly status: number;
  constructor(status: number) { super(`request_failed_${status}`); this.name = 'RequestError'; this.status = status; }
}

export async function requestJson<T>(path: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', body?: unknown, idempotencyKey?: string): Promise<T> {
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: { 'content-type': 'application/json', ...(method === 'GET' ? {} : { 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new RequestError(response.status);
  return await response.json() as T;
}
