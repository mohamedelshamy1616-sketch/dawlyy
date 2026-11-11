/** Task 11: a failed settings call. `code` is the stable API error code, mapped to copy by the caller. */
export class SettingsRequestError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code); }
}

const pending = new Map<string, { key: string; createdAt: number }>();

/**
 * Task 11: JSON call to /api/v1 with an Idempotency-Key. The key is kept across an uncertain network result so a
 * retry of the same body replays instead of repeating; a finished call (anything below 500) gets a fresh key next time.
 */
export async function settingsRequest<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const mutating = method !== 'GET';
  const signature = JSON.stringify([method, path, body ?? null]);
  let key: string | undefined;
  if (mutating) {
    const now = Date.now();
    for (const [entry, value] of pending) if (value.createdAt <= now - 86_400_000) pending.delete(entry);
    const existing = pending.get(signature);
    key = existing?.key ?? crypto.randomUUID();
    pending.set(signature, { key, createdAt: existing?.createdAt ?? now });
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (key) headers['Idempotency-Key'] = key;
  const response = await fetch(`/api/v1${path}`, {
    method, credentials: 'same-origin', cache: 'no-store', headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (mutating && response.status < 500) pending.delete(signature);
  let result: unknown = null;
  try { result = await response.json(); } catch { /* an empty body is handled by the status below */ }
  if (!response.ok) {
    const code = typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'object'
      && result.error !== null && 'code' in result.error && typeof result.error.code === 'string' ? result.error.code : 'request_failed';
    throw new SettingsRequestError(code, response.status);
  }
  return result as T;
}

/** Error codes that have copy under `settings.shared.errors`. */
export const KNOWN_ERRORS = [
  'forbidden', 'validation_error', 'unprocessable', 'conflict', 'unauthenticated', 'not_found', 'last_owner',
  'owner_permissions_fixed', 'unknown_module', 'unknown_action', 'unknown_preset', 'not_active', 'not_disabled',
  'logo_not_found', 'no_active_consent', 'request_failed',
] as const;

/** Task 11: pick the `settings.shared.errors.*` key for a failure, falling back to the generic message. */
export function errorKey(error: unknown, known: readonly string[] = KNOWN_ERRORS): string {
  const code = error instanceof SettingsRequestError ? error.code : 'request_failed';
  return known.includes(code) ? code : 'request_failed';
}
