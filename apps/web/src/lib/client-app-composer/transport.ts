import { z } from 'zod';
import { CLIENT_MODULES, ClientModules, EntitlementOverride, type ClientModule } from '@dawlyy/core/types';
import { COMPOSER_KEY, sortRows, type ComposerOverrideRow } from './state';

/** R2c: only the existing request contracts of the module and override routes; no generic API client. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type FailureKind =
  | 'validation' | 'unauthenticated' | 'forbidden' | 'not_found' | 'unprocessable'
  | 'conflict' | 'in_progress' | 'server' | 'network';

export type ComposerFailure = {
  ok: false; kind: FailureKind; status: number; code: string; message: string;
  /** True when the server may or may not have applied the write: keep the key, refresh before claiming a result. */
  indeterminate: boolean;
};
export type ComposerResult<T> = { ok: true; data: T } | ComposerFailure;

const BASE = '/api/v1';
const OVERRIDE_PATH = (clientId: string) => `${BASE}/clients/${encodeURIComponent(clientId)}/overrides/${encodeURIComponent(COMPOSER_KEY)}`;

const OverridesResponse = z.object({
  overrides: z.array(z.object({
    id: z.string(), createdAt: z.string(), revokedAt: z.string().nullish(), override: EntitlementOverride,
  })),
});

/** The minimal ordered projection the composer needs; revoked rows never count. */
export function projectOverrideRows(body: unknown): ComposerOverrideRow[] | null {
  const parsed = OverridesResponse.safeParse(body);
  if (!parsed.success) return null;
  return sortRows(parsed.data.overrides.filter(row => !row.revokedAt)
    .map(row => ({ id: row.id, createdAt: row.createdAt, override: row.override })));
}

function failure(kind: FailureKind, status: number, code: string, message: string, indeterminate = false): ComposerFailure {
  return { ok: false, kind, status, code, message, indeterminate };
}

function envelope(body: unknown): { code: string; message: string } {
  const error = typeof body === 'object' && body !== null && 'error' in body ? (body as { error: unknown }).error : null;
  const fields = (typeof error === 'object' && error !== null ? error : {}) as { code?: unknown; message?: unknown };
  return { code: typeof fields.code === 'string' ? fields.code : 'request_failed', message: typeof fields.message === 'string' ? fields.message : '' };
}

function classify(status: number, body: unknown): ComposerFailure {
  const { code, message } = envelope(body);
  if (status >= 500) return failure('server', status, code, message, true);
  if (status === 400) return failure('validation', status, code, message);
  if (status === 401) return failure('unauthenticated', status, code, message);
  if (status === 403) return failure('forbidden', status, code, message);
  if (status === 404) return failure('not_found', status, code, message);
  if (status === 409 && code === 'idempotency_in_progress') return failure('in_progress', status, code, message, true);
  if (status === 409) return failure('conflict', status, code, message);
  if (status === 422) return failure('unprocessable', status, code, message);
  return failure('server', status, code, message, status === 0);
}

/** A plain object in the fixed module order, so the bytes of one intended payload never vary. */
const orderedModules = (modules: Partial<ClientModules>): Partial<ClientModules> => {
  const ordered: Partial<ClientModules> = {};
  for (const key of CLIENT_MODULES) { const value = modules[key]; if (value !== undefined) ordered[key] = value; }
  return ordered;
};

export type ComposerTransport = ReturnType<typeof createComposerTransport>;

/**
 * R2c: the transport. `fetch` is injected so tests never reach the network. A mutation keeps its Idempotency-Key
 * only across an indeterminate outcome (network error, 5xx, request still in progress) for the identical method,
 * path and bytes; any settled answer drops it, and a changed payload is a different request with a new key.
 */
export function createComposerTransport(options: { fetch?: FetchLike; newKey?: () => string } = {}) {
  const send: FetchLike = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const newKey = options.newKey ?? (() => crypto.randomUUID());
  const pending = new Map<string, string>();

  async function call<T>(method: 'GET' | 'PUT' | 'DELETE', path: string, body: string | undefined,
    parse: (json: unknown) => T | null): Promise<ComposerResult<T>> {
    const mutating = method !== 'GET';
    const signature = JSON.stringify([method, path, body ?? null]);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (mutating) {
      const key = pending.get(signature) ?? newKey();
      pending.set(signature, key);
      headers['Idempotency-Key'] = key;
    }
    let response: Response;
    try {
      response = await send(path, { method, credentials: 'same-origin', cache: 'no-store', headers, ...(body === undefined ? {} : { body }) });
    } catch {
      return failure('network', 0, 'network_error', '', true);
    }
    let json: unknown = null;
    try { json = await response.json(); } catch { /* an empty or non-JSON body is judged by the status below */ }
    if (mutating && response.status < 500 && !(response.status === 409 && envelope(json).code === 'idempotency_in_progress')) pending.delete(signature);
    if (!response.ok) return classify(response.status, json);
    const data = parse(json);
    // A 2xx whose body cannot be read may still have applied the write: treat it as unknown, never as saved.
    return data === null ? failure('server', response.status, 'bad_response', '', mutating) : { ok: true, data };
  }

  const modules = (json: unknown): ClientModules | null => {
    const parsed = ClientModules.safeParse(json);
    return parsed.success ? parsed.data : null;
  };

  return {
    /** GET /settings/client-modules */
    getTenantModules: () => call('GET', `${BASE}/settings/client-modules`, undefined, modules),
    /** PUT /settings/client-modules with all seven keys (owner only; the server decides). */
    putTenantModules: (value: ClientModules) => {
      const strict = ClientModules.parse(value);
      return call('PUT', `${BASE}/settings/client-modules`, JSON.stringify(Object.fromEntries(CLIENT_MODULES.map((module: ClientModule) => [module, strict[module]]))), modules);
    },
    /** GET /clients/{id}/overrides */
    getClientOverrides: (clientId: string) => call('GET', `${BASE}/clients/${encodeURIComponent(clientId)}/overrides`, undefined, projectOverrideRows),
    /** PUT /clients/{id}/overrides/custom%3Aclient_app: enabled stays true, `modules` carries visibility. */
    putClientOverride: (clientId: string, partial: Partial<ClientModules>) =>
      call('PUT', OVERRIDE_PATH(clientId), JSON.stringify({ enabled: true, modules: orderedModules(ClientModules.partial().parse(partial)) }), projectOverrideRows),
    /** DELETE /clients/{id}/overrides/custom%3Aclient_app, no body. */
    deleteClientOverride: (clientId: string) => call('DELETE', OVERRIDE_PATH(clientId), undefined, projectOverrideRows),
  };
}

let shared: ComposerTransport | null = null;
/** The browser transport the composer uses unless a test injects its own. */
export function browserTransport(): ComposerTransport {
  shared ??= createComposerTransport();
  return shared;
}
