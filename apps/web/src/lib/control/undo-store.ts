/**
 * R3a: the one app-wide undo slot. A mutation is either committed first and undone with a rollback
 * ("immediate": archive, cancel, hide) or held for the undo window and committed afterwards ("deferred": R2b's
 * correction and void, which have no unvoid). The slot lives in module state, so a route change that unmounts the
 * list which started an action neither loses nor commits it early. No closure is persisted: a full-document
 * `pagehide` cancels an uncommitted deferred action without any network call.
 */

/** The length of the undo window. This is behaviour, not a visual value. */
export const UNDO_WINDOW_MS = 6000;

export type UndoState = {
  id: string;
  label: string;
  phase: 'executing' | 'undoable' | 'undoing' | 'committing' | 'failed';
  remainingMs: number;
  error: unknown | null;
};
export type UndoableAction<T> = {
  label: string;
  onCommitted?: (value: T) => void;
  onUndone?: () => void;
  onError?: (error: unknown) => void;
} & (
  | { mode: 'immediate'; commit: () => Promise<T>; rollback: (value: T) => Promise<void> }
  | { mode: 'deferred'; commit: () => Promise<T>; rollback?: never }
);
export type UndoResult<T> =
  | { status: 'committed'; value: T }
  | { status: 'undone' }
  | { status: 'failed'; error: unknown };

/**
 * What the toast sees. The extra field is internal to the control components; the public contract above
 * stays exact, and UndoSnapshot is assignable to UndoState.
 */
export type UndoSnapshot = UndoState & { mode: 'immediate' | 'deferred' };

type Slot = {
  id: string;
  action: UndoableAction<unknown>;
  phase: UndoState['phase'];
  value: unknown;
  error: unknown;
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  settled: boolean;
  settle: (result: UndoResult<unknown>) => void;
};

export type UndoStore = ReturnType<typeof createUndoStore>;

/** A factory so tests get an isolated store; the app uses the single undoStore below. */
export function createUndoStore() {
  let slot: Slot | null = null;
  let snapshot: UndoSnapshot | null = null;
  let counter = 0;
  const listeners = new Set<() => void>();

  function publish() {
    // The snapshot is rebuilt only on a transition, never from the clock, so useSyncExternalStore sees a stable value.
    snapshot = slot ? { id: slot.id, label: slot.action.label, phase: slot.phase, mode: slot.action.mode,
      remainingMs: slot.phase === 'undoable' ? UNDO_WINDOW_MS : 0, error: slot.phase === 'failed' ? slot.error : null } : null;
    for (const listener of [...listeners]) listener();
  }
  const safe = (call: () => void) => { try { call(); } catch { /* a faulty caller callback must not wedge the slot */ } };
  function finish(target: Slot, result: UndoResult<unknown>) {
    if (target.timer !== null) { clearTimeout(target.timer); target.timer = null; }
    if (slot === target) slot = null;
    if (!target.settled) { target.settled = true; target.settle(result); }
    publish();
  }
  function arm(target: Slot, expire: (slot: Slot) => void) {
    target.timer = setTimeout(() => { target.timer = null; if (slot === target && target.phase === 'undoable') expire(target); }, UNDO_WINDOW_MS);
  }

  /** Immediate mode: the window simply closes; the server already holds the change. */
  function closeWindow(target: Slot): Promise<void> {
    if (slot !== target || target.phase !== 'undoable') return target.inflight ?? Promise.resolve();
    finish(target, { status: 'committed', value: target.value });
    return Promise.resolve();
  }
  /** Deferred mode: the one and only commit call happens here. */
  function commitDeferred(target: Slot): Promise<void> {
    if (slot !== target || target.phase !== 'undoable') return target.inflight ?? Promise.resolve();
    if (target.timer !== null) { clearTimeout(target.timer); target.timer = null; }
    target.phase = 'committing'; publish();
    target.inflight = (async () => {
      let value: unknown;
      try { value = await target.action.commit(); } catch (error) {
        safe(() => target.action.onError?.(error)); finish(target, { status: 'failed', error }); return;
      }
      safe(() => target.action.onCommitted?.(value)); finish(target, { status: 'committed', value });
    })();
    return target.inflight;
  }
  function cancelDeferred(target: Slot) {
    safe(() => target.action.onUndone?.()); finish(target, { status: 'undone' });
  }
  function rollbackNow(target: Slot): Promise<void> {
    if (target.timer !== null) { clearTimeout(target.timer); target.timer = null; }
    target.phase = 'undoing'; target.error = null; publish();
    target.inflight = (async () => {
      try { await target.action.rollback?.(target.value); } catch (error) {
        // The commit stands on the server. Keep the slot so the same rollback can be retried with its original result.
        target.error = error; target.phase = 'failed'; publish(); safe(() => target.action.onError?.(error)); return;
      }
      safe(() => target.action.onUndone?.()); finish(target, { status: 'undone' });
    })();
    return target.inflight;
  }

  function startImmediate(target: Slot) {
    target.phase = 'executing'; publish();
    target.inflight = (async () => {
      let value: unknown;
      try { value = await target.action.commit(); } catch (error) {
        safe(() => target.action.onError?.(error)); finish(target, { status: 'failed', error }); return;
      }
      target.value = value;
      safe(() => target.action.onCommitted?.(value));
      target.phase = 'undoable'; arm(target, closeWindow); publish();
    })();
  }
  function startDeferred(target: Slot) {
    target.phase = 'undoable'; arm(target, commitDeferred); publish();
  }

  /** Resolve once the slot that was current at the call has settled. Immediate flush closes its window; deferred flush commits. */
  async function flush(): Promise<void> {
    const target = slot;
    while (target && slot === target) {
      if (target.phase === 'undoable') await (target.action.mode === 'deferred' ? commitDeferred(target) : closeWindow(target));
      else if (target.phase === 'failed') finish(target, { status: 'committed', value: target.value });
      else await target.inflight;
    }
  }

  async function run<T>(action: UndoableAction<T>): Promise<UndoResult<T>> {
    // Never silently drop an earlier intended mutation: settle it first, then take the single slot.
    while (slot) await flush();
    let settle!: (result: UndoResult<unknown>) => void;
    const done = new Promise<UndoResult<unknown>>(resolve => { settle = resolve; });
    const target: Slot = { id: `undo-${++counter}`, action: action as UndoableAction<unknown>, phase: 'executing', value: undefined, error: null,
      timer: null, inflight: null, settled: false, settle };
    slot = target;
    if (action.mode === 'deferred') startDeferred(target); else startImmediate(target);
    return done as Promise<UndoResult<T>>;
  }

  /** Undo while undoable; Retry Undo while failed; harmless at any other time, including a repeated click. */
  function undo(): Promise<void> {
    const target = slot;
    if (!target) return Promise.resolve();
    if (target.phase === 'undoable') {
      if (target.action.mode === 'deferred') { cancelDeferred(target); return Promise.resolve(); }
      return rollbackNow(target);
    }
    if (target.phase === 'failed') return rollbackNow(target);
    return target.phase === 'undoing' ? target.inflight ?? Promise.resolve() : Promise.resolve();
  }

  /** Close the toast where that is safe: an immediate window closes, a failed undo is acknowledged (the commit stands), a deferred action is committed now. */
  function dismiss(): Promise<void> {
    const target = slot;
    if (!target) return Promise.resolve();
    if (target.phase === 'undoable' || target.phase === 'failed') return flush();
    return Promise.resolve();
  }

  /** pagehide: an uncommitted deferred action is cancelled, with no request. Immediate changes already live on the server. */
  function pagehide() {
    const target = slot;
    if (target && target.action.mode === 'deferred' && target.phase === 'undoable') cancelDeferred(target);
    else if (target && target.phase === 'undoable') finish(target, { status: 'committed', value: target.value });
  }

  return {
    run, undo, flush, dismiss, pagehide,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: (): UndoSnapshot | null => snapshot,
    getServerSnapshot: (): UndoSnapshot | null => null,
  };
}

export const undoStore = createUndoStore();
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => undoStore.pagehide());