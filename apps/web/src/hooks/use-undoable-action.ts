'use client';

import { useSyncExternalStore } from 'react';
import { undoStore, type UndoableAction, type UndoResult, type UndoSnapshot, type UndoState } from '@/src/lib/control/undo-store';

export type { UndoState, UndoableAction, UndoResult } from '@/src/lib/control/undo-store';

/** R3a: the active action's snapshot, with the server snapshot fixed at null. Used by the one UndoToast. */
export function useUndoSnapshot(): UndoSnapshot | null {
  return useSyncExternalStore(undoStore.subscribe, undoStore.getSnapshot, undoStore.getServerSnapshot);
}

/**
 * R3a: the shared undo control for archive, restore, hide, cancel and R2b's void and correction. Lists never mount
 * their own toast or timer; they call run and the single UndoToast shows the window.
 */
export function useUndoableAction(): {
  run<T>(action: UndoableAction<T>): Promise<UndoResult<T>>;
  undo(): Promise<void>;
  flush(): Promise<void>;
  state: UndoState | null;
} {
  const state = useUndoSnapshot();
  return { run: undoStore.run, undo: undoStore.undo, flush: undoStore.flush, state };
}