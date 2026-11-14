import { describe, expect, it, vi } from 'vitest';
import { ControlRequestError, type FetchLike } from './archive-transport';
import { allVisibleSelected, archiveSender, assignSender, canAssign, createBulkUndo, emptySelection, planBulk, pruneSelection, resetSelection, retryFailures, runAssignments, runBulk, selectVisible, summarize, toggleSelected, type BulkItem, type BulkSender } from './bulk-actions';

const rows = (count: number, patch: Partial<BulkItem> = {}): BulkItem[] => Array.from({ length: count }, (_, index) => ({ id: `c${index + 1}`, name: `Client ${index + 1}`, archived: false, ...patch }));
const counter = () => { let n = 0; return () => `key-${++n}`; };
const denied = () => new ControlRequestError(403, 'forbidden');

describe('bulk selection', () => {
  it('selects only the rows that are loaded and eligible, never other pages', () => {
    const loaded = [...rows(3), { id: 'locked', name: 'Locked', archived: false, canEdit: false }];
    const selected = selectVisible(loaded);
    expect([...selected]).toEqual(['c1', 'c2', 'c3']);
    expect(allVisibleSelected(selected, loaded)).toBe(true);
    expect(allVisibleSelected(emptySelection(), loaded)).toBe(false);
    expect(allVisibleSelected(emptySelection(), [])).toBe(false);
  });

  it('toggles, prunes to the loaded rows and resets', () => {
    let selected = toggleSelected(emptySelection(), 'c1'); selected = toggleSelected(selected, 'c2');
    expect([...toggleSelected(selected, 'c1')]).toEqual(['c2']);
    expect([...pruneSelection(selected, rows(1))]).toEqual(['c1']);
    expect(resetSelection().size).toBe(0);
  });

  it('does nothing for an empty selection', async () => {
    const send = vi.fn<BulkSender>(async () => ({}));
    const receipt = await runBulk({ op: 'archive', items: rows(3), selected: emptySelection(), send });
    expect(send).not.toHaveBeenCalled();
    expect(summarize(receipt)).toEqual({ changed: 0, failed: 0, skipped: 0, blocked: 0, outcome: 'nothing' });
  });

  it('separates rows that are not editable, already in the destination state, or not loaded', () => {
    const loaded: BulkItem[] = [{ id: 'a', name: 'A', archived: false }, { id: 'b', name: 'B', archived: true }, { id: 'c', name: 'C', archived: false, canEdit: false }];
    const plan = planBulk('archive', loaded, new Set(['a', 'b', 'c', 'ghost', 'a']));
    expect(plan.actionable.map(item => item.id)).toEqual(['a']);
    expect(plan.skipped.map(item => item.id)).toEqual(['b']);
    expect(plan.blocked.map(item => item.id)).toEqual(['c']);
    expect(plan.unloaded).toEqual(['ghost']);
    expect(planBulk('restore', loaded, new Set(['a', 'b'])).actionable.map(item => item.id)).toEqual(['b']);
  });
});

describe('bulk archive, undo and retry', () => {
  it('reports a partial result and never calls a blocked row', async () => {
    const loaded: BulkItem[] = [...rows(3), { id: 'locked', name: 'Locked', archived: false, canEdit: false }];
    const send = vi.fn<BulkSender>(async item => { if (item.id === 'c2') throw denied(); return {}; });
    const receipt = await runBulk({ op: 'archive', items: loaded, selected: new Set(['c1', 'c2', 'c3', 'locked']), send, newKey: counter() });
    expect(send.mock.calls.map(([item]) => item.id)).toEqual(['c1', 'c2', 'c3']);
    expect(receipt.changed.map(item => item.id)).toEqual(['c1', 'c3']);
    expect(receipt.failures.map(failure => [failure.item.name, failure.kind])).toEqual([['Client 2', 'forbidden']]);
    expect(receipt.blocked.map(item => item.id)).toEqual(['locked']);
    expect(summarize(receipt)).toEqual({ changed: 2, failed: 1, skipped: 0, blocked: 1, outcome: 'partial' });
  });

  it('runs rows one at a time', async () => {
    let open = 0; let maxOpen = 0;
    const send: BulkSender = async () => { open += 1; maxOpen = Math.max(maxOpen, open); await Promise.resolve(); open -= 1; return {}; };
    await runBulk({ op: 'archive', items: rows(4), selected: new Set(['c1', 'c2', 'c3', 'c4']), send });
    expect(maxOpen).toBe(1);
  });

  it('undoes only the rows that really changed', async () => {
    const loaded: BulkItem[] = [...rows(3), { id: 'done', name: 'Already archived', archived: true }];
    const forward = vi.fn<BulkSender>(async item => { if (item.id === 'c2') throw denied(); return {}; });
    const receipt = await runBulk({ op: 'archive', items: loaded, selected: new Set(['c1', 'c2', 'c3', 'done']), send: forward, newKey: counter() });
    const back = vi.fn<BulkSender>(async () => ({}));
    await createBulkUndo(receipt, back)();
    expect(back.mock.calls.map(([item]) => item.id)).toEqual(['c1', 'c3']);
  });

  it('retries only the failed rows with their original keys and commits no row twice', async () => {
    let attempts = 0;
    const send = vi.fn<BulkSender>(async item => { if (item.id === 'c2' && ++attempts === 1) throw new ControlRequestError(500, 'boom'); return {}; });
    const first = await runBulk({ op: 'archive', items: rows(3), selected: new Set(['c1', 'c2', 'c3']), send, newKey: counter() });
    expect(summarize(first).outcome).toBe('partial');
    const second = await retryFailures(first, send);
    const calls = send.mock.calls.map(([item, key]) => `${item.id}:${key}`);
    expect(calls).toEqual(['c1:key-1', 'c2:key-2', 'c3:key-3', 'c2:key-2']);
    expect(second.changed.map(item => item.id)).toEqual(['c1', 'c3', 'c2']);
    expect(second.failures).toEqual([]); expect(summarize(second).outcome).toBe('success');
  });

  it('keeps a failing row failing on retry without touching the others', async () => {
    const send = vi.fn<BulkSender>(async item => { if (item.id === 'c1') throw denied(); return {}; });
    const first = await runBulk({ op: 'restore', items: rows(2, { archived: true }), selected: new Set(['c1', 'c2']), send });
    const second = await retryFailures(first, send);
    expect(second.failures.map(failure => failure.item.id)).toEqual(['c1']);
    expect(send.mock.calls.filter(([item]) => item.id === 'c2')).toHaveLength(1);
    expect(summarize({ ...first, changed: [] }).outcome).toBe('failed');
  });

  it('a retried Undo reverses only what is left and reuses its keys', async () => {
    const receipt = await runBulk({ op: 'archive', items: rows(3), selected: new Set(['c1', 'c2', 'c3']), send: async () => ({}), newKey: counter() });
    let fail = true;
    const back = vi.fn<BulkSender>(async item => { if (item.id === 'c2' && fail) { fail = false; throw new ControlRequestError(503, 'unavailable'); } return {}; });
    const undo = createBulkUndo(receipt, back, counter());
    await expect(undo()).rejects.toBeInstanceOf(ControlRequestError);
    const result = await undo();
    expect(result.reversed.map(item => item.id)).toEqual(['c1', 'c3', 'c2']);
    expect(back.mock.calls.map(([item, key]) => `${item.id}:${key}`)).toEqual(['c1:key-1', 'c2:key-2', 'c3:key-3', 'c2:key-2']);
  });

  it('sends the existing per-id archive and unarchive routes with distinct keys', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const receipt = await runBulk({ op: 'archive', items: rows(2), selected: new Set(['c1', 'c2']), send: archiveSender('packages', 'archive', fetchImpl), newKey: counter() });
    await createBulkUndo(receipt, archiveSender('packages', 'restore', fetchImpl), counter())();
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/v1/packages/c1/archive', '/api/v1/packages/c2/archive', '/api/v1/packages/c1/unarchive', '/api/v1/packages/c2/unarchive']);
    expect(fetchImpl.mock.calls.every(([, init]) => init.body === undefined)).toBe(true);
  });
});

describe('assigning one template to many clients', () => {
  const clients = [{ id: 'a', name: 'Alia' }, { id: 'b', name: 'Bassem' }, { id: 'c', name: 'Chadia' }];

  it('calls the assign route once per client and returns the copy for each success', async () => {
    const send = vi.fn(async (_path: string, body: Record<string, unknown>) => ({ head: { id: `copy-${String(body.clientId)}` } }));
    const run = await runAssignments({ programId: 'p1', clients: [...clients, clients[0]!], publish: false, canPublish: true, send, newKey: counter() });
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0]?.[0]).toBe('/api/v1/programs/p1/assign');
    expect(run.results).toEqual([
      { clientId: 'a', name: 'Alia', status: 'assigned', copyId: 'copy-a' }, { clientId: 'b', name: 'Bassem', status: 'assigned', copyId: 'copy-b' }, { clientId: 'c', name: 'Chadia', status: 'assigned', copyId: 'copy-c' }]);
  });

  it('never publishes unless the coach asked and holds the grant, and sends explicit false otherwise', async () => {
    const body = async (publish: boolean, canPublish: boolean) => {
      const send = vi.fn(async (_path: string, _body: Record<string, unknown>) => ({ head: { id: 'x' } }));
      await runAssignments({ programId: 'p', clients: [clients[0]!], publish, canPublish, send });
      return send.mock.calls[0]![1];
    };
    expect(await body(false, true)).toMatchObject({ publish: false, replace: false });
    expect(await body(true, false)).toMatchObject({ publish: false, replace: false });
    expect(await body(true, true)).toMatchObject({ publish: true, replace: false });
    expect(canAssign({ edit: true, publish: false }, true)).toBe(false);
    expect(canAssign({ edit: false, publish: true }, false)).toBe(false);
    expect(canAssign({ edit: true, publish: false }, false)).toBe(true);
  });

  it('asks for consent on client_has_program and replaces only with explicit consent and a new key', async () => {
    const send = vi.fn(async (_path: string, body: Record<string, unknown>) => {
      if (body.clientId === 'b' && body.replace !== true) throw new ControlRequestError(409, 'client_has_program');
      return { head: { id: `copy-${String(body.clientId)}` } };
    });
    const next = counter();
    const first = await runAssignments({ programId: 'p', clients, publish: false, canPublish: false, send, newKey: next });
    expect(first.results.map(result => result.status)).toEqual(['assigned', 'needs_replace', 'assigned']);
    expect(send.mock.calls.every(([, body]) => body.replace === false)).toBe(true);
    const second = await runAssignments({ programId: 'p', clients: [clients[1]!], publish: false, canPublish: false, replaceIds: new Set(['b']), previous: first, send, newKey: next });
    expect(second.results).toEqual([{ clientId: 'b', name: 'Bassem', status: 'assigned', copyId: 'copy-b' }]);
    expect(send.mock.calls.at(-1)?.[1]).toMatchObject({ clientId: 'b', replace: true });
    expect(second.keys.b?.key).not.toBe(first.keys.b?.key);
  });

  it('keeps a client key when the identical request is retried after a failure', async () => {
    let calls = 0;
    const send = vi.fn(async (_path: string, _body: Record<string, unknown>, _key: string) => { if (++calls === 1) throw new ControlRequestError(500, 'boom'); return { head: { id: 'copy' } }; });
    const first = await runAssignments({ programId: 'p', clients: [clients[0]!], publish: false, canPublish: false, send, newKey: counter() });
    expect(first.results[0]).toMatchObject({ status: 'failed', kind: 'failed', code: 'boom' });
    await runAssignments({ programId: 'p', clients: [clients[0]!], publish: false, canPublish: false, previous: first, send, newKey: counter() });
    expect(send.mock.calls[0]![2]).toBe(send.mock.calls[1]![2]);
  });

  it('posts JSON through the production sender and surfaces the error code', async () => {
    const fetchImpl = vi.fn<FetchLike>()
      .mockImplementationOnce(async () => ({ ok: true, status: 201, json: async () => ({ head: { id: 'h1' } }) }))
      .mockImplementationOnce(async () => ({ ok: false, status: 409, json: async () => ({ error: { code: 'client_has_program', message: 'x' } }) }));
    const run = await runAssignments({ programId: 'p', clients: [clients[0]!, clients[1]!], publish: false, canPublish: false, send: assignSender(fetchImpl), startDate: '2026-12-01' });
    expect(run.results.map(result => result.status)).toEqual(['assigned', 'needs_replace']);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.method).toBe('POST'); expect(JSON.parse(String(init.body))).toEqual({ clientId: 'a', publish: false, replace: false, startDate: '2026-12-01' });
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });
});