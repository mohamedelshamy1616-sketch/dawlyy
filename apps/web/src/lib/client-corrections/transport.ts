import type { EntryKind, MealWrite, MeasurementWrite, VoidWrite } from './types';

/** A single intended operation. Serialize once so retries keep the exact original body and identity. */
export type Mutation<Body = MealWrite | MeasurementWrite | VoidWrite> = {
  readonly path: string; readonly method: 'POST'; readonly body: Readonly<Body>;
  readonly serializedBody: string; readonly idempotencyKey: string;
};
export type MutationOptions = {
  fetch?: typeof fetch;
  onModuleDisabled?: (app: unknown) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
};

/** Messages are deliberately codes, never the potentially identifying server explanation. */
export class CorrectionError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: string, readonly status: number, retryable = status === 0 || status >= 500) {
    super(code); this.name = 'CorrectionError'; this.retryable = retryable;
  }
}
export type CorrectionErrorKey = 'refusal' | 'conflict' | 'moduleDisabled' | 'mealUnknown' | 'offline' | 'failed';
export function correctionErrorKey(error: unknown): CorrectionErrorKey {
  if (!(error instanceof CorrectionError)) return 'failed';
  if (error.code === 'module_disabled') return 'moduleDisabled';
  if (error.status === 403) return 'refusal';
  if (error.code === 'already_voided' || error.code === 'already_corrected' || error.status === 409) return 'conflict';
  if (error.code === 'meal_unknown') return 'mealUnknown';
  if (error.code === 'offline' || error.code === 'network_error') return 'offline';
  return 'failed';
}

function operation<Body>(path: string, body: Body, idempotencyKey: string): Mutation<Body> {
  if (!idempotencyKey) throw new CorrectionError('missing_idempotency_key', 0, false);
  const serializedBody = JSON.stringify(body);
  return Object.freeze({ path, method: 'POST' as const, body: Object.freeze(JSON.parse(serializedBody)) as Readonly<Body>, serializedBody, idempotencyKey });
}
export const mealCreate = (body: MealWrite, key: string): Mutation<MealWrite> => operation('/api/v1/meal-logs', body, key);
export const mealCorrection = (id: string, body: MealWrite, key: string): Mutation<MealWrite> => operation(`/api/v1/meal-logs/${encodeURIComponent(id)}/correct`, body, key);
export const measurementCorrection = (id: string, body: MeasurementWrite, key: string): Mutation<MeasurementWrite> => operation(`/api/v1/measurements/${encodeURIComponent(id)}/correct`, body, key);
const resources: Record<EntryKind, string> = { meal: 'meal-logs', measurement: 'measurements', metric: 'metrics', workout: 'workout-sessions' };
export function entryVoid(kind: EntryKind, id: string, reason: string | undefined, key: string): Mutation<VoidWrite> {
  if (reason !== undefined && reason.length > 500) throw new CorrectionError('invalid_reason', 422, false);
  return operation(`/api/v1/${resources[kind]}/${encodeURIComponent(id)}/void`, reason === undefined ? {} : { reason }, key);
}

async function safely(callback?: () => void | Promise<void>) { try { await callback?.(); } catch { /* Refresh must not mask the original mutation result. */ } }

/** Connectivity is required; correction/void operations never enter the offline outbox or retry automatically. */
export async function sendMutation<T = unknown>(mutation: Mutation, options: MutationOptions = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CorrectionError('offline', 0);
  const fetcher = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetcher(mutation.path, { method: mutation.method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': mutation.idempotencyKey }, body: mutation.serializedBody });
  } catch { throw new CorrectionError('network_error', 0); }
  let body: unknown;
  try { body = await response.json(); } catch {
    // A success response lost during decoding may already have committed. Keep its identity for a retry.
    throw new CorrectionError('invalid_response', response.status, response.ok || response.status >= 500);
  }
  if (response.ok) return body as T;
  const envelope = typeof body === 'object' && body !== null && 'error' in body ? body.error : undefined;
  const code = typeof envelope === 'object' && envelope !== null && 'code' in envelope && typeof envelope.code === 'string' ? envelope.code : 'request_failed';
  const error = new CorrectionError(code, response.status);
  if (code === 'module_disabled') {
    // Identity-only /me is never used for module preferences. One safe read, no fallback write path.
    let app: unknown;
    try {
      const context = await fetcher('/api/v1/me/app', { credentials: 'same-origin', cache: 'no-store' });
      if (context.ok) app = await context.json();
    } catch { /* Notify the caller even when bootstrap transport or decoding fails. */ }
    // The hook must clear pending UI and refresh its module context even without a usable bootstrap response.
    await safely(() => options.onModuleDisabled?.(app));
    await safely(options.onRefresh);
  } else if (response.status === 409) await safely(options.onRefresh);
  throw error;
}
