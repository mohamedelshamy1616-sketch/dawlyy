/**
 * R3a: bulk selection, bulk archive and restore, and one-template-to-many-clients assignment. There is no bulk API:
 * every row is its own existing per-id call, run one after another. The receipt is the truth about what changed, so
 * Undo reverses only the rows that really changed and a retry resends only the rows that failed, with their keys.
 */
import { ControlRequestError, archivePath, assignPath, errorKind, sendMutation, type ArchiveEntity, type ControlErrorKind, type FetchLike } from './archive-transport';

export type BulkOp = 'archive' | 'restore';
/** One loaded row. archived is its state when it was loaded; canEdit is the server-computed grant for that row. */
export type BulkItem = { id: string; name: string; archived: boolean; canEdit?: boolean };
export type BulkSender = (item: BulkItem, key: string) => Promise<unknown>;

/** ---- selection (pure, on the rows that are currently loaded) ---- */
export const emptySelection = (): ReadonlySet<string> => new Set<string>();
export function toggleSelected(selected: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}
/** The header checkbox: only rows that are loaded now and eligible. Never "everything on every page". */
export function selectVisible(items: readonly BulkItem[]): ReadonlySet<string> {
  return new Set(items.filter(item => item.canEdit !== false).map(item => item.id));
}
/** After a reload or a pagination merge, forget ids that are no longer loaded. */
export function pruneSelection(selected: ReadonlySet<string>, items: readonly BulkItem[]): ReadonlySet<string> {
  const loaded = new Set(items.map(item => item.id));
  return new Set([...selected].filter(id => loaded.has(id)));
}
export function allVisibleSelected(selected: ReadonlySet<string>, items: readonly BulkItem[]): boolean {
  const eligible = items.filter(item => item.canEdit !== false);
  return eligible.length > 0 && eligible.every(item => selected.has(item.id));
}
/** A filter, search or kind change throws the selection away. */
export const resetSelection = emptySelection;

export type Plan = { actionable: BulkItem[]; skipped: BulkItem[]; blocked: BulkItem[]; unloaded: string[] };
/** Split the selection by what each row needs: already in the destination state, not editable, or ready. */
export function planBulk(op: BulkOp, items: readonly BulkItem[], selected: ReadonlySet<string>): Plan {
  const seen = new Set<string>(); const plan: Plan = { actionable: [], skipped: [], blocked: [], unloaded: [] };
  for (const item of items) {
    if (!selected.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    if (item.canEdit === false) plan.blocked.push(item);
    else if (item.archived === (op === 'archive')) plan.skipped.push(item);
    else plan.actionable.push(item);
  }
  plan.unloaded = [...selected].filter(id => !seen.has(id));
  return plan;
}

export type BulkFailure = { item: BulkItem; error: unknown; kind: ControlErrorKind };
export type BulkReceipt = {
  op: BulkOp;
  changed: BulkItem[];
  skipped: BulkItem[];
  blocked: BulkItem[];
  failures: BulkFailure[];
  /** One idempotency key per row for this operation, kept for retries. */
  keys: Record<string, string>;
};
export type BulkSummary = { changed: number; failed: number; skipped: number; blocked: number; outcome: 'nothing' | 'success' | 'partial' | 'failed' };

const defaultKey = () => crypto.randomUUID();
const fail = (item: BulkItem, error: unknown): BulkFailure => ({ item, error, kind: errorKind(error) });

async function runRows(op: BulkOp, rows: BulkItem[], send: BulkSender, keys: Record<string, string>, newKey: () => string): Promise<{ changed: BulkItem[]; failures: BulkFailure[] }> {
  const changed: BulkItem[] = []; const failures: BulkFailure[] = [];
  for (const item of rows) {
    keys[item.id] ??= newKey();
    try { await send(item, keys[item.id]!); changed.push(item); } catch (error) { failures.push(fail(item, error)); }
  }
  return { changed, failures };
}

/** Run one bulk archive or restore over the selected loaded rows, one request at a time. */
export async function runBulk(params: { op: BulkOp; items: readonly BulkItem[]; selected: ReadonlySet<string>; send: BulkSender; newKey?: () => string }): Promise<BulkReceipt> {
  const plan = planBulk(params.op, params.items, params.selected); const keys: Record<string, string> = {};
  const { changed, failures } = await runRows(params.op, plan.actionable, params.send, keys, params.newKey ?? defaultKey);
  return { op: params.op, changed, skipped: plan.skipped, blocked: plan.blocked, failures, keys };
}
/** Resend only the failed rows, each with the key it already used. Rows that changed stay changed and are not touched. */
export async function retryFailures(receipt: BulkReceipt, send: BulkSender, newKey: () => string = defaultKey): Promise<BulkReceipt> {
  const again = await runRows(receipt.op, receipt.failures.map(failure => failure.item), send, receipt.keys, newKey);
  return { ...receipt, changed: [...receipt.changed, ...again.changed], failures: again.failures };
}
/**
 * Undo for a receipt: reverses only the rows that changed, never failed, skipped or blocked ones. The returned function
 * remembers which rows it already reversed and the keys it used, so a retried Undo resends only what is left.
 * It throws when any row could not be reversed, which keeps the shared Undo control in its failed state.
 */
export function createBulkUndo(receipt: BulkReceipt, send: BulkSender, newKey: () => string = defaultKey): () => Promise<{ reversed: BulkItem[]; remaining: BulkFailure[] }> {
  const keys: Record<string, string> = {}; const reversed: BulkItem[] = []; let pending = [...receipt.changed];
  return async () => {
    const { changed, failures } = await runRows(receipt.op === 'archive' ? 'restore' : 'archive', pending, send, keys, newKey);
    reversed.push(...changed); pending = failures.map(failure => failure.item);
    if (failures.length) throw failures[0]!.error;
    return { reversed, remaining: failures };
  };
}
export function summarize(receipt: BulkReceipt): BulkSummary {
  const changed = receipt.changed.length; const failed = receipt.failures.length;
  const outcome = changed === 0 && failed === 0 ? 'nothing' : failed === 0 ? 'success' : changed === 0 ? 'failed' : 'partial';
  return { changed, failed, skipped: receipt.skipped.length, blocked: receipt.blocked.length, outcome };
}

/** The production sender: the existing per-id archive or unarchive route for one entity. */
export function archiveSender(entity: ArchiveEntity, op: BulkOp, fetchImpl?: FetchLike): BulkSender {
  return (item, key) => sendMutation({ path: archivePath(entity, item.id, op === 'archive' ? 'archive' : 'unarchive'), key }, fetchImpl);
}
/** The sender for a reversal; same routes, opposite direction. */
export const reverseSender = (entity: ArchiveEntity, op: BulkOp, fetchImpl?: FetchLike): BulkSender => archiveSender(entity, op === 'archive' ? 'restore' : 'archive', fetchImpl);

/** ---- assigning one published template to many clients ---- */
export type AssignClient = { id: string; name: string };
export type AssignResult =
  | { clientId: string; name: string; status: 'assigned'; copyId: string | null }
  | { clientId: string; name: string; status: 'needs_replace' }
  | { clientId: string; name: string; status: 'failed'; kind: ControlErrorKind; code: string };
export type AssignRun = { results: AssignResult[]; keys: Record<string, { fingerprint: string; key: string }> };
export type AssignSender = (path: string, body: Record<string, unknown>, key: string) => Promise<unknown>;

/** Grants for assigning: publish needs programs publish, anything else needs programs edit (the route checks the same). */
export const canAssign = (grants: { edit: boolean; publish: boolean }, publish: boolean) => publish ? grants.publish : grants.edit;

/**
 * One assign call per client. replace stays false until a client is in replaceIds, which only the coach's explicit consent
 * fills. publish is sent only when the coach asked for it and holds the grant; otherwise it is an explicit false.
 * A client who already has a program answers client_has_program and is reported as needing consent, not retried.
 */
export async function runAssignments(params: { programId: string; clients: readonly AssignClient[]; publish: boolean; canPublish: boolean; replaceIds?: ReadonlySet<string>; startDate?: string; previous?: AssignRun; send: AssignSender; newKey?: () => string }): Promise<AssignRun> {
  const keys: AssignRun['keys'] = { ...(params.previous?.keys ?? {}) }; const results: AssignResult[] = []; const newKey = params.newKey ?? defaultKey;
  const publish = Boolean(params.publish && params.canPublish);
  for (const client of dedupe(params.clients)) {
    const body: Record<string, unknown> = { clientId: client.id, publish, replace: params.replaceIds?.has(client.id) === true, ...(params.startDate ? { startDate: params.startDate } : {}) };
    const fingerprint = JSON.stringify(body);
    // The same request keeps its key on a retry; a request with different content (for example replace) is a new mutation.
    if (keys[client.id]?.fingerprint !== fingerprint) keys[client.id] = { fingerprint, key: newKey() };
    try {
      const response = await params.send(assignPath(params.programId), body, keys[client.id]!.key);
      const head = response && typeof response === 'object' && 'head' in response ? (response as { head?: { id?: unknown } }).head : undefined;
      results.push({ clientId: client.id, name: client.name, status: 'assigned', copyId: typeof head?.id === 'string' ? head.id : null });
    } catch (error) {
      if (error instanceof ControlRequestError && error.code === 'client_has_program') results.push({ clientId: client.id, name: client.name, status: 'needs_replace' });
      else results.push({ clientId: client.id, name: client.name, status: 'failed', kind: errorKind(error), code: error instanceof ControlRequestError ? error.code : 'request_failed' });
    }
  }
  return { results, keys };
}
function dedupe(clients: readonly AssignClient[]): AssignClient[] {
  const seen = new Set<string>();
  return clients.filter(client => !seen.has(client.id) && !!seen.add(client.id));
}
/** The production assign sender: a JSON POST with the key. */
export function assignSender(fetchImpl: FetchLike = (input, init) => fetch(input, init)): AssignSender {
  return async (path, body, key) => {
    let response: Awaited<ReturnType<FetchLike>>;
    try { response = await fetchImpl(path, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store' }); }
    catch { throw new ControlRequestError(0, 'network'); }
    let data: unknown = null;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) {
      const envelope = (data && typeof data === 'object' && 'error' in data ? (data as { error?: { code?: unknown; details?: unknown } }).error : undefined) ?? {};
      throw new ControlRequestError(response.status, typeof envelope.code === 'string' ? envelope.code : 'request_failed', envelope.details);
    }
    return data;
  };
}
