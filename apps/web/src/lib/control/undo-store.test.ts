import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_WINDOW_MS, createUndoStore, type UndoResult } from './undo-store';

const flushMicrotasks = () => vi.advanceTimersByTimeAsync(0);
function gate<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}

describe('undo store', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts the immediate window only after the commit succeeded', async () => {
    const store = createUndoStore(); const commit = gate<{ id: number }>();
    const result = store.run({ mode: 'immediate', label: 'a', commit: () => commit.promise, rollback: async () => undefined });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3);
    expect(store.getSnapshot()?.phase).toBe('executing');
    expect(store.getSnapshot()?.remainingMs).toBe(0);
    commit.resolve({ id: 1 }); await flushMicrotasks();
    expect(store.getSnapshot()).toMatchObject({ phase: 'undoable', remainingMs: UNDO_WINDOW_MS, label: 'a' });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
    expect(store.getSnapshot()?.phase).toBe('undoable');
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot()).toBeNull();
    expect(await result).toEqual({ status: 'committed', value: { id: 1 } });
  });

  it('undo calls rollback once with the exact committed value and then onUndone', async () => {
    const store = createUndoStore(); const value = { id: 7 };
    const rollback = vi.fn(async (_value: { id: number }) => undefined); const onUndone = vi.fn(); const onCommitted = vi.fn();
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => value, rollback, onUndone, onCommitted });
    await flushMicrotasks();
    expect(onCommitted).toHaveBeenCalledWith(value);
    await store.undo(); await store.undo();
    expect(rollback).toHaveBeenCalledTimes(1);
    expect(rollback.mock.calls[0]?.[0]).toBe(value);
    expect(onUndone).toHaveBeenCalledTimes(1);
    expect(await result).toEqual({ status: 'undone' });
    expect(store.getSnapshot()).toBeNull();
  });

  it('offers no undo after an initial failure and reports the error', async () => {
    const store = createUndoStore(); const error = new Error('boom'); const rollback = vi.fn(async () => undefined); const onError = vi.fn(); const onCommitted = vi.fn();
    const result = await store.run({ mode: 'immediate', label: 'a', commit: async () => { throw error; }, rollback, onError, onCommitted });
    expect(result).toEqual({ status: 'failed', error });
    expect(onError).toHaveBeenCalledWith(error); expect(onCommitted).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBeNull();
    await store.undo();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('honours the 5999/6000 ms boundary', async () => {
    const early = createUndoStore(); const rollbackEarly = vi.fn(async () => undefined);
    const first = early.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback: rollbackEarly });
    await flushMicrotasks(); await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
    await early.undo();
    expect(rollbackEarly).toHaveBeenCalledTimes(1); expect(await first).toEqual({ status: 'undone' });
    const late = createUndoStore(); const rollbackLate = vi.fn(async () => undefined);
    const second = late.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback: rollbackLate });
    await flushMicrotasks(); await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    await late.undo();
    expect(rollbackLate).not.toHaveBeenCalled(); expect(await second).toEqual({ status: 'committed', value: 1 });
  });

  it('lets exactly one of an expiring timer and an Undo click win', async () => {
    const store = createUndoStore(); const rollback = vi.fn(async () => undefined); const onUndone = vi.fn();
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback, onUndone });
    await flushMicrotasks(); await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1);
    const click = store.undo(); await vi.advanceTimersByTimeAsync(1); await click;
    expect(rollback).toHaveBeenCalledTimes(1); expect(onUndone).toHaveBeenCalledTimes(1);
    expect(await result).toEqual({ status: 'undone' });
  });

  it('treats repeated Undo clicks while rolling back as one rollback', async () => {
    const store = createUndoStore(); const pending = gate<void>(); const rollback = vi.fn(() => pending.promise);
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback });
    await flushMicrotasks();
    const first = store.undo(); const second = store.undo(); const third = store.undo();
    expect(store.getSnapshot()?.phase).toBe('undoing');
    pending.resolve(); await Promise.all([first, second, third]);
    expect(rollback).toHaveBeenCalledTimes(1); expect(await result).toEqual({ status: 'undone' });
  });

  it('flushes an earlier action before a new one takes the slot, never cancelling it', async () => {
    const store = createUndoStore(); const rollbackA = vi.fn(async () => undefined); const commitB = vi.fn(async () => 'b');
    const a = store.run({ mode: 'immediate', label: 'a', commit: async () => 'a', rollback: rollbackA });
    await flushMicrotasks();
    const b = store.run({ mode: 'immediate', label: 'b', commit: commitB, rollback: async () => undefined });
    expect(await a).toEqual({ status: 'committed', value: 'a' });
    await flushMicrotasks();
    expect(rollbackA).not.toHaveBeenCalled(); expect(commitB).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toMatchObject({ label: 'b', phase: 'undoable' });
    await store.undo(); expect(await b).toEqual({ status: 'undone' });
  });

  it('commits an earlier deferred action when a second action replaces it', async () => {
    const store = createUndoStore(); const commitA = vi.fn(async () => 'a');
    const a = store.run({ mode: 'deferred', label: 'a', commit: commitA });
    const b = store.run({ mode: 'deferred', label: 'b', commit: async () => 'b' });
    expect(await a).toEqual({ status: 'committed', value: 'a' });
    expect(commitA).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    await store.undo(); expect(await b).toEqual({ status: 'undone' });
  });

  it('makes zero requests when a deferred action is undone', async () => {
    const store = createUndoStore(); const commit = vi.fn(async () => 1); const onUndone = vi.fn();
    const result = store.run({ mode: 'deferred', label: 'void', commit, onUndone });
    expect(store.getSnapshot()).toMatchObject({ phase: 'undoable', mode: 'deferred' });
    await store.undo(); await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 5);
    expect(commit).not.toHaveBeenCalled(); expect(onUndone).toHaveBeenCalledTimes(1);
    expect(await result).toEqual({ status: 'undone' });
  });

  it('commits a deferred action exactly once on expiry', async () => {
    const store = createUndoStore(); const commit = vi.fn(async () => 'v'); const onCommitted = vi.fn();
    const result = store.run({ mode: 'deferred', label: 'void', commit, onCommitted });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1); expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledTimes(1); expect(onCommitted).toHaveBeenCalledWith('v');
    expect(await result).toEqual({ status: 'committed', value: 'v' });
    await store.flush(); await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('commits a deferred action exactly once on flush and the timer does not commit again', async () => {
    const store = createUndoStore(); const commit = vi.fn(async () => 'v');
    const result = store.run({ mode: 'deferred', label: 'void', commit });
    const first = store.flush(); const second = store.flush(); await Promise.all([first, second]);
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2);
    expect(commit).toHaveBeenCalledTimes(1); expect(await result).toEqual({ status: 'committed', value: 'v' });
  });

  it('reports a failed deferred commit and keeps it visible until dismissed', async () => {
    const store = createUndoStore(); const error = new Error('no'); const onError = vi.fn(); const onCommitted = vi.fn();
    const result = store.run({ mode: 'deferred', label: 'void', commit: async () => { throw error; }, onError, onCommitted });
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(onError).toHaveBeenCalledWith(error); expect(onCommitted).not.toHaveBeenCalled();
    expect(await result).toEqual({ status: 'failed', error });
    await store.flush();
    expect(store.getSnapshot()).toMatchObject({ phase: 'failed', mode: 'deferred', error });
    await store.dismiss(); expect(store.getSnapshot()).toBeNull();
  });

  it('keeps a failed rollback visible and retries it with the original committed result and the same closure', async () => {
    type Receipt = { receipt: string[] };
    const store = createUndoStore(); const value: Receipt = { receipt: ['a', 'b'] }; const error = new Error('offline'); const onError = vi.fn(); const onUndone = vi.fn();
    const rollback = vi.fn<(value: Receipt) => Promise<void>>().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined);
    let outcome: UndoResult<Receipt> | null = null;
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => value, rollback, onError, onUndone }).then(r => { outcome = r; });
    await flushMicrotasks(); await store.undo();
    expect(store.getSnapshot()).toMatchObject({ phase: 'failed', error }); expect(onError).toHaveBeenCalledWith(error); expect(onUndone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 10);
    expect(store.getSnapshot()?.phase).toBe('failed'); expect(outcome).toBeNull();
    await store.undo(); await result;
    expect(rollback).toHaveBeenCalledTimes(2);
    expect(rollback.mock.calls[0]?.[0]).toBe(value); expect(rollback.mock.calls[1]?.[0]).toBe(value);
    expect(onUndone).toHaveBeenCalledTimes(1); expect(outcome).toEqual({ status: 'undone' }); expect(store.getSnapshot()).toBeNull();
  });

  it('keeps the commit when a failed undo is dismissed', async () => {
    const store = createUndoStore(); const value = { id: 3 };
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => value, rollback: async () => { throw new Error('x'); } });
    await flushMicrotasks(); await store.undo();
    expect(store.getSnapshot()?.phase).toBe('failed');
    await store.dismiss();
    expect(await result).toEqual({ status: 'committed', value }); expect(store.getSnapshot()).toBeNull();
  });

  it('blocks replacement while a retry is executing', async () => {
    const store = createUndoStore(); const pending = gate<void>(); const commitB = vi.fn(async () => 'b');
    const rollback = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('x')).mockImplementationOnce(() => pending.promise);
    void store.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback });
    await flushMicrotasks(); await store.undo();
    void store.undo(); expect(store.getSnapshot()?.phase).toBe('undoing');
    const b = store.run({ mode: 'immediate', label: 'b', commit: commitB, rollback: async () => undefined });
    await flushMicrotasks(); expect(commitB).not.toHaveBeenCalled();
    pending.resolve(); await flushMicrotasks(); await flushMicrotasks();
    expect(commitB).toHaveBeenCalledTimes(1); await store.undo(); expect(await b).toEqual({ status: 'undone' });
  });

  it('keeps an action alive when every subscriber unmounts', async () => {
    const store = createUndoStore(); const seen = vi.fn(); const unsubscribe = store.subscribe(seen);
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback: async () => undefined });
    await flushMicrotasks(); unsubscribe(); const calls = seen.mock.calls.length;
    expect(store.getSnapshot()?.phase).toBe('undoable');
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS);
    expect(await result).toEqual({ status: 'committed', value: 1 }); expect(seen.mock.calls.length).toBe(calls);
  });

  it('cancels an uncommitted deferred action on pagehide without a request, and leaves immediate changes alone', async () => {
    const store = createUndoStore(); const commit = vi.fn(async () => 1); const onUndone = vi.fn();
    const deferred = store.run({ mode: 'deferred', label: 'void', commit, onUndone });
    store.pagehide();
    expect(await deferred).toEqual({ status: 'undone' }); expect(commit).not.toHaveBeenCalled(); expect(onUndone).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2); expect(commit).not.toHaveBeenCalled();
    const rollback = vi.fn(async () => undefined);
    const immediate = store.run({ mode: 'immediate', label: 'a', commit: async () => 9, rollback });
    await flushMicrotasks(); store.pagehide();
    expect(await immediate).toEqual({ status: 'committed', value: 9 }); expect(rollback).not.toHaveBeenCalled();
  });

  it('serves a stable null server snapshot and a client snapshot that changes only on transitions', async () => {
    const store = createUndoStore();
    expect(store.getServerSnapshot()).toBeNull();
    void store.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback: async () => undefined });
    await flushMicrotasks();
    expect(store.getServerSnapshot()).toBeNull();
    const first = store.getSnapshot(); await vi.advanceTimersByTimeAsync(3000);
    expect(store.getSnapshot()).toBe(first);
  });

  it('survives callbacks that throw', async () => {
    const store = createUndoStore();
    const result = store.run({ mode: 'immediate', label: 'a', commit: async () => 1, rollback: async () => undefined, onCommitted: () => { throw new Error('ui'); }, onUndone: () => { throw new Error('ui'); } });
    await flushMicrotasks(); await store.undo();
    expect(await result).toEqual({ status: 'undone' }); expect(store.getSnapshot()).toBeNull();
  });
});