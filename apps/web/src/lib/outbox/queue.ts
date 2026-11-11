import type { SessionDetail, SessionWrite, SetWrite } from '@/src/server/workout/contracts';

/** Task 5 / T8 contract: portable envelope, scoped by the owning database name. */
export type OutboxRecord<P = SessionWrite | SetWrite | Record<string, unknown>> = {
  clientUuid: string; clientUpdatedAt: string; payload: P; syncState: 'pending' | 'synced' | 'rejected';
  attempts: number; nextAttemptAt?: number; reason?: string;
};
/** Task 5: the complete immutable prescription and metadata survive an offline reopen. */
export type SessionOutbox = OutboxRecord<SessionWrite> & { cached: SessionDetail };
/** Task 5: set UUIDs remain stable across edits, retries, and repeated flushes. */
export type SetOutbox = OutboxRecord<SetWrite>;
/** Task 8 extension point: metrics have their own queue; workout flush never acknowledges them. */
export type MetricOutbox = OutboxRecord<Record<string, unknown>>;
/** Task 5: identity must be freshly established before sending personal data. */
export const canFlush = (owner: string, signedIn: string | null): boolean => owner.length > 0 && owner === signedIn;
/** Task 5: deterministic capped foreground retry delay. */
export const backoffMs = (attempts: number): number => Math.min(300000, 1000 * 2 ** Math.max(0, Math.min(20, attempts - 1)));
/** Task 5: older writes cannot replace newer edits. */
export function mergeRecord<T extends OutboxRecord>(stored: T | undefined, incoming: T): T {
  return stored && Date.parse(stored.clientUpdatedAt) >= Date.parse(incoming.clientUpdatedAt) ? stored : incoming;
}
/** Task 5: callers send sessions before sets; within a table order is chronological and stable. */
export function pendingBatch<T extends OutboxRecord>(rows: T[], now: number, limit = 1000): T[] {
  return rows.filter(r => r.syncState === 'pending' && (r.nextAttemptAt ?? 0) <= now)
    .sort((a, b) => Date.parse(a.clientUpdatedAt) - Date.parse(b.clientUpdatedAt) || a.clientUuid.localeCompare(b.clientUuid)).slice(0, limit);
}
/** Task 5: compare-and-ack prevents a response from marking unsent edits as synchronized. */
export function settleRecord<T extends OutboxRecord>(current: T, sent: T, state: 'synced' | 'rejected', reason?: string): T {
  return current.clientUpdatedAt !== sent.clientUpdatedAt ? current : { ...current, syncState: state, reason, attempts: 0, nextAttemptAt: undefined };
}
