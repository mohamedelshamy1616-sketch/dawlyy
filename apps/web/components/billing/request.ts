/** T3b: form failures expose stable error codes for localised UI, never raw server diagnostics. */
export class BillingRequestError extends Error {
  /** T3b: retain a safe API error code for presentation. */
  constructor(public readonly code: string) { super(code); }
}
const pendingMutations = new Map<string, { key: string; createdAt: number }>();

/** T3b: retain a mutation's key across an uncertain network result; a completed submission gets a fresh key next time. */
export async function billingRequest<T>(path: string, body?: unknown): Promise<T> {
  const signature = body === undefined ? undefined : JSON.stringify([path, body]);
  let key: string | undefined;
  if (signature !== undefined) {
    const now = Date.now();
    for (const [entry, value] of pendingMutations) if (value.createdAt <= now - 86400000) pendingMutations.delete(entry);
    const existing = pendingMutations.get(signature);
    key = existing?.key ?? crypto.randomUUID();
    pendingMutations.set(signature, { key, createdAt: existing?.createdAt ?? now });
  }
  const response = await fetch(`/api/v1${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: key === undefined ? undefined : { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const result: unknown = await response.json();
  if (signature !== undefined && response.status < 500) pendingMutations.delete(signature);
  if (!response.ok) {
    const code = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'object'
      && result.error !== null && 'code' in result.error && typeof result.error.code === 'string' ? result.error.code : 'request_failed';
    throw new BillingRequestError(code);
  }
  return result as T;
}
