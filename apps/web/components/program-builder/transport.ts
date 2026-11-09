/** Task 4: retain structured API errors so UI copy comes from next-intl instead of server strings. */
export class ProgramRequestError extends Error {
  constructor(readonly code: string, readonly details?: unknown) { super(code); }
}

/** Task 4: JSON transport with optional replay keys for coach mutations and abortable picker reads. */
export async function programRequest<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.method && options.method !== 'GET') headers.set('Idempotency-Key', crypto.randomUUID());
  const response = await fetch(path, { method: options.method ?? 'GET', headers, signal: options.signal, cache: 'no-store', ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
  const data: unknown = await response.json();
  if (!response.ok) {
    const envelope = data as { error?: { code?: unknown; details?: unknown } };
    throw new ProgramRequestError(typeof envelope.error?.code === 'string' ? envelope.error.code : 'request_failed', envelope.error?.details);
  }
  return data as T;
}

/** Task 4: finite translation key set for errors returned by program and exercise endpoints. */
export function programErrorKey(error: unknown): 'stale' | 'hasProgram' | 'notPublished' | 'invalid' | 'forbidden' | 'reviewLocked' | 'nothingToPublish' | 'requestFailed' {
  if (!(error instanceof ProgramRequestError)) return 'requestFailed';
  switch (error.code) {
    case 'stale_draft': return 'stale';
    case 'client_has_program': return 'hasProgram';
    case 'template_not_published': return 'notPublished';
    case 'program_invalid': return 'invalid';
    case 'forbidden': return 'forbidden';
    case 'review_locked': return 'reviewLocked';
    case 'nothing_to_publish': return 'nothingToPublish';
    default: return 'requestFailed';
  }
}
