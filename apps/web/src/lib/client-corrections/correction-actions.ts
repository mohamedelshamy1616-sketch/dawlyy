import type { UndoableAction, UndoResult } from '@/src/hooks/use-undoable-action';

type DeferredOptions<T> = {
  run: <Value>(action: UndoableAction<Value>) => Promise<UndoResult<Value>>;
  label: string; commit: () => Promise<T>;
  optimistic: () => void; restore: () => void;
  onCommitted?: (value: T) => void; onError?: (error: unknown) => void; onChanged?: () => void;
  /** A route may leave while R3a continues the intended commit; its old component must not receive state. */
  isMounted?: () => boolean;
};

/**
 * Apply only a local pending view, then hand ownership to R3a's one deferred slot. The immutable operation and
 * edited form remain in the caller for retry. There is no private timer, toast, unvoid or compensating write.
 */
export function runCorrection<T>(options: DeferredOptions<T>): Promise<UndoResult<T>> {
  const active = () => options.isMounted?.() ?? true;
  if (active()) options.optimistic();
  const action: UndoableAction<T> = {
    mode: 'deferred', label: options.label, commit: options.commit,
    onCommitted: value => { if (active()) options.onCommitted?.(value); options.onChanged?.(); },
    onUndone: () => { if (active()) options.restore(); },
    onError: error => { if (active()) { options.restore(); options.onError?.(error); } options.onChanged?.(); },
  };
  return options.run(action);
}
