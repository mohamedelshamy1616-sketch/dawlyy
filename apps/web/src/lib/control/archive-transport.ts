/**
 * R3a: transport for the R0c archive, restore, hide and calendar cancel/restore endpoints. Pure functions over an
 * injected fetch, so the exact URLs, headers and key handling are testable without a browser. There is no new API:
 * every call here hits a route that already exists.
 */

/** The six library entities that archive; foods and system exercises hide, calendar events cancel. */
export const ARCHIVE_ENTITIES = ['clients', 'programs', 'nutrition', 'forms', 'packages', 'exercises'] as const;
export type ArchiveEntity = (typeof ARCHIVE_ENTITIES)[number];
export type ArchiveOp = 'archive' | 'unarchive';

export type ControlErrorKind = 'forbidden' | 'not_found' | 'system_exercise' | 'illegal_transition' | 'network' | 'failed';

/** An API failure keeps its status and code; the UI shows translated copy chosen by kind, never server text. */
export class ControlRequestError extends Error {
  constructor(readonly status: number, readonly code: string, readonly details?: unknown) { super(code); }
}
export function errorKind(error: unknown): ControlErrorKind {
  if (!(error instanceof ControlRequestError)) return 'failed';
  if (error.status === 0) return 'network';
  if (error.code === 'system_exercise_use_hide') return 'system_exercise';
  if (error.code === 'illegal_transition') return 'illegal_transition';
  if (error.status === 403 || error.code === 'forbidden') return 'forbidden';
  if (error.status === 404 || error.code === 'not_found') return 'not_found';
  return 'failed';
}

export type FetchLike = (input: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export const archivePath = (entity: ArchiveEntity, id: string, op: ArchiveOp) => `/api/v1/${entity}/${encodeURIComponent(id)}/${op}`;
export const hidePath = (kind: 'foods' | 'exercises', id: string, op: 'hide' | 'unhide') => `/api/v1/${kind}/${encodeURIComponent(id)}/${op}`;
export const calendarPath = (id: string, op: 'cancel' | 'restore') => `/api/v1/calendar/${encodeURIComponent(id)}/${op}`;
export const assignPath = (programId: string) => `/api/v1/programs/${encodeURIComponent(programId)}/assign`;
export const assignmentClientsPath = (programId: string, params: { q?: string; cursor?: string | null; limit?: number } = {}) => {
  const search = new URLSearchParams({ q: params.q ?? '', limit: String(params.limit ?? 20) });
  if (params.cursor) search.set('cursor', params.cursor);
  return `/api/v1/programs/${encodeURIComponent(programId)}/assignment-clients?${search}`;
};

type Filters = Record<string, string | undefined | null>;
/**
 * List URL for one entity. archived=true means archived only (R0c); the cursor is dropped unless the caller passes
 * one, because a filter change must restart pagination. Clients drop the old status filter, which cannot combine
 * with archived. Forms keep their formKind and read templates unless a kind is given.
 */
export function listUrl(entity: ArchiveEntity, filters: Filters, archived: boolean, cursor?: string | null): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'archived' || key === 'cursor') continue;
    if (entity === 'clients' && key === 'status' && archived) continue;
    search.set(key, value);
  }
  if ((entity === 'programs' || entity === 'nutrition' || entity === 'forms') && !search.has('kind')) search.set('kind', 'template');
  search.set('archived', archived ? 'true' : 'false');
  if (cursor) search.set('cursor', cursor);
  return `/api/v1/${entity}?${search}`;
}
/** The archived-only URL: the common case, and the one R1b's Library links open. */
export const archivedListUrl = (entity: ArchiveEntity, filters: Filters = {}, cursor?: string | null) => listUrl(entity, filters, true, cursor);

export type Mutation = { path: string; key: string };
const defaultKey = () => crypto.randomUUID();
/** One intended mutation owns one idempotency key; resending the same object is a retry and keeps it. */
export const newMutation = (path: string, newKey: () => string = defaultKey): Mutation => ({ path, key: newKey() });

/** POST with no body and the mutation's own Idempotency-Key. Returns the parsed body. */
export async function sendMutation<T = unknown>(mutation: Mutation, fetchImpl: FetchLike = (input, init) => fetch(input, init)): Promise<T> {
  let response: Awaited<ReturnType<FetchLike>>;
  try {
    response = await fetchImpl(mutation.path, { method: 'POST', headers: { Accept: 'application/json', 'Idempotency-Key': mutation.key }, credentials: 'same-origin', cache: 'no-store' });
  } catch { throw new ControlRequestError(0, 'network'); }
  let body: unknown = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const envelope = (body && typeof body === 'object' && 'error' in body ? (body as { error?: { code?: unknown; details?: unknown } }).error : undefined) ?? {};
    throw new ControlRequestError(response.status, typeof envelope.code === 'string' ? envelope.code : 'request_failed', envelope.details);
  }
  return body as T;
}

export type ReversibleOptions = { fetchImpl?: FetchLike; newKey?: () => string };
/**
 * A forward call plus its inverse. commit may be called again after a failure and then resends the same key;
 * rollback is a different mutation with its own key, created once so a retried Undo resends it unchanged.
 */
export function reversible(forwardPath: string, inversePath: string, options: ReversibleOptions = {}) {
  const forward = newMutation(forwardPath, options.newKey);
  let inverse: Mutation | null = null;
  return {
    forward,
    get inverse() { return inverse; },
    commit: () => sendMutation(forward, options.fetchImpl),
    rollback: async (_receipt?: unknown): Promise<void> => { inverse ??= newMutation(inversePath, options.newKey); await sendMutation(inverse, options.fetchImpl); },
  };
}
/** Archive (or restore, when archived is true) with the opposite call as the Undo. */
export function archiveAction(entity: ArchiveEntity, id: string, archived: boolean, options: ReversibleOptions = {}) {
  return reversible(archivePath(entity, id, archived ? 'unarchive' : 'archive'), archivePath(entity, id, archived ? 'archive' : 'unarchive'), options);
}
/** Foods and system exercises keep Hide and Unhide; the Undo is the opposite. */
export function hideAction(kind: 'foods' | 'exercises', id: string, hidden: boolean, options: ReversibleOptions = {}) {
  return reversible(hidePath(kind, id, hidden ? 'unhide' : 'hide'), hidePath(kind, id, hidden ? 'hide' : 'unhide'), options);
}
/** Cancel a calendar event, or restore a cancelled one; restore is not reschedule. */
export function calendarAction(id: string, cancelled: boolean, options: ReversibleOptions = {}) {
  return reversible(calendarPath(id, cancelled ? 'restore' : 'cancel'), calendarPath(id, cancelled ? 'cancel' : 'restore'), options);
}
