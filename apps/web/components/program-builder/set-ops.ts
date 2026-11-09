import { PlannedSet } from '@dawlyy/core/types';
import type { ProgramOp } from '@dawlyy/core/program-edit';

/** Task 4: core set.update cannot clear optional fields; rebuild prescriptions with typed core add/update/remove ops. */
export function replaceSetOps(dayId: string, itemId: string, originalCount: number, prescriptions: PlannedSet[]): ProgramOp[] {
  if (!Number.isSafeInteger(originalCount) || originalCount < 1 || prescriptions.length < 1) throw new Error('At least one set is required');
  const patches = prescriptions.map(set => PlannedSet.omit({ setNo: true }).parse(set));
  const operations: ProgramOp[] = [];
  for (const [index, patch] of patches.entries()) {
    operations.push({ type: 'set.add', dayId, itemId, copyLast: false }, { type: 'set.update', dayId, itemId, setNo: originalCount + index + 1, patch });
  }
  for (let setNo = originalCount; setNo >= 1; setNo--) operations.push({ type: 'set.remove', dayId, itemId, setNo });
  return operations;
}
