import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUndoStore } from '@/src/lib/control/undo-store';
import { runCorrection } from './correction-actions';
import { CorrectionError, entryVoid, mealCorrection, sendMutation } from './transport';
import type { MealWrite } from './types';
const body: MealWrite = { clientUuid: '11111111-1111-4111-8111-111111111111', localDate: '2026-11-17', status: 'eaten', freeEntry: { text: 'Edited rice' }, clientUpdatedAt: '2026-11-17T12:00:00Z' };
describe('saved corrections consume the real shared undo store', () => {
  beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
  it.each(['edit', 'remove'] as const)('%s defers every request and Undo restores captured display', async kind => {
    const store = createUndoStore(); let display = 'original'; const fetcher = vi.fn<typeof fetch>();
    const operation = kind === 'edit' ? mealCorrection('old', body, 'key') : entryVoid('meal', 'old', undefined, 'key');
    const result = runCorrection({ run: store.run, label: kind, commit: () => sendMutation(operation, { fetch: fetcher }), optimistic: () => { display = 'pending'; }, restore: () => { display = 'original'; } });
    expect(display).toBe('pending'); expect(store.getSnapshot()).toMatchObject({ mode: 'deferred', remainingMs: 6000 });
    await vi.advanceTimersByTimeAsync(5999); expect(fetcher).not.toHaveBeenCalled();
    await store.undo(); expect(await result).toEqual({ status: 'undone' }); expect(display).toBe('original'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('commits once at 6000ms and uses the actual returned replacement', async () => {
    const store = createUndoStore(); let display = 'original'; let refreshes = 0; const returned = { id: 'new', replacesId: 'old', ...body };
    const operation = mealCorrection('old', body, 'key'); const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(returned), { status: 201 }));
    const result = runCorrection({ run: store.run, label: 'Save', commit: () => sendMutation<typeof returned>(operation, { fetch: fetcher }), optimistic: () => { display = 'pending'; }, restore: () => { display = 'original'; }, onCommitted: row => { display = row.id; }, onChanged: () => { refreshes++; } });
    await vi.advanceTimersByTimeAsync(5999); expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(await result).toEqual({ status: 'committed', value: returned });
    expect(display).toBe('new'); expect(refreshes).toBe(1); await store.undo(); await store.flush(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('flushes the earlier pending action when the toast is replaced', async () => {
    const store = createUndoStore(); const order: string[] = [];
    const first = runCorrection({ run: store.run, label: 'first', commit: async () => { order.push('first'); return 1; }, optimistic: () => undefined, restore: () => undefined });
    const second = runCorrection({ run: store.run, label: 'second', commit: async () => { order.push('second'); return 2; }, optimistic: () => undefined, restore: () => undefined });
    await vi.advanceTimersByTimeAsync(0); expect(order).toEqual(['first']); expect(await first).toEqual({ status: 'committed', value: 1 });
    expect(store.getSnapshot()?.label).toBe('second'); await store.flush(); expect(await second).toEqual({ status: 'committed', value: 2 }); expect(order).toEqual(['first', 'second']);
  });
  it('late server expiry restores captured UI, preserves edited form data and refreshes history', async () => {
    const store = createUndoStore(); let display = 'original'; const draft = { text: 'Edited rice' }; let error: unknown; let refreshes = 0;
    const result = runCorrection({ run: store.run, label: 'Save', commit: async () => { throw new CorrectionError('void_not_allowed', 403); }, optimistic: () => { display = draft.text; }, restore: () => { display = 'original'; }, onError: value => { error = value; }, onChanged: () => { refreshes++; } });
    await vi.advanceTimersByTimeAsync(6000); expect((await result).status).toBe('failed'); expect(display).toBe('original'); expect(draft.text).toBe('Edited rice'); expect(error).toMatchObject({ code: 'void_not_allowed' }); expect(refreshes).toBe(1);
  });
  it('retains operation UUID, key and exact body on uncertain network retry', async () => {
    const store = createUndoStore(); const operation = mealCorrection('old', body, 'original-key');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Lost response')).mockResolvedValueOnce(new Response(JSON.stringify({ id: 'same-row' }), { status: 201 }));
    const retry = () => runCorrection({ run: store.run, label: 'Save', commit: () => sendMutation(operation, { fetch: fetcher }), optimistic: () => undefined, restore: () => undefined });
    const first = retry(); await store.flush(); expect((await first).status).toBe('failed'); const second = retry(); await store.flush(); expect((await second).status).toBe('committed');
    expect(fetcher.mock.calls[1]?.[1]).toEqual(fetcher.mock.calls[0]?.[1]);
  });
  it('survives SPA unmount without state callbacks on departed components', async () => {
    const store = createUndoStore(); let mounted = true; let writes = 0; const callbacks: string[] = [];
    const result = runCorrection({ run: store.run, label: 'Save', commit: async () => { writes++; return 'saved'; }, optimistic: () => { callbacks.push('pending'); }, restore: () => { callbacks.push('restore'); }, onCommitted: () => { callbacks.push('saved'); }, onChanged: () => { callbacks.push('refresh'); }, isMounted: () => mounted });
    mounted = false; await vi.advanceTimersByTimeAsync(6000); expect((await result).status).toBe('committed'); expect(writes).toBe(1); expect(callbacks).toEqual(['pending']);
  });
  it('full pagehide cancels without a final mutation request', async () => {
    const store = createUndoStore(); let display = 'original'; let writes = 0;
    const result = runCorrection({ run: store.run, label: 'Save', commit: async () => { writes++; return 1; }, optimistic: () => { display = 'pending'; }, restore: () => { display = 'original'; } });
    store.pagehide(); await vi.advanceTimersByTimeAsync(6000); expect(await result).toEqual({ status: 'undone' }); expect(display).toBe('original'); expect(writes).toBe(0);
  });
});
