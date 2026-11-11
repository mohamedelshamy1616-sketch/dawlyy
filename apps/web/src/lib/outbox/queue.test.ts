import { describe, expect, it } from 'vitest';
import { backoffMs, canFlush, mergeRecord, pendingBatch, settleRecord, type OutboxRecord } from './queue';

const row = (clientUuid: string, at = '2026-11-10T10:00:00Z'): OutboxRecord => ({ clientUuid, clientUpdatedAt: at,
  payload: { clientUuid, clientUpdatedAt: at }, syncState: 'pending', attempts: 0 });
describe('Task 5 foreground outbox', () => {
  it('never opens another user outbox or flushes with an unknown identity', () => {
    expect(canFlush('a', 'a')).toBe(true); expect(canFlush('a', 'b')).toBe(false); expect(canFlush('a', null)).toBe(false);
  });
  it('keeps newer local edits and orders pending rows deterministically', () => {
    const newer = row('a', '2026-11-10T11:00:00Z');
    expect(mergeRecord(newer, row('a'))).toBe(newer);
    expect(pendingBatch([row('b'), newer, { ...row('c'), syncState: 'rejected' }], 0).map(r => r.clientUuid)).toEqual(['b', 'a']);
  });
  it('caps backoff and does not acknowledge edits made during a network request', () => {
    expect(backoffMs(1)).toBe(1000); expect(backoffMs(20)).toBe(300000);
    const sent = row('a'); const edited = row('a', '2026-11-10T11:00:00Z');
    expect(settleRecord(edited, sent, 'synced')).toBe(edited);
    expect(settleRecord(sent, sent, 'rejected', 'illegal_transition').reason).toBe('illegal_transition');
    expect(pendingBatch([{ ...sent, nextAttemptAt: 2000 }], 1000)).toEqual([]);
  });

  it('merges and acknowledges an in-memory store without losing edits during an offline retry', () => {
    const memory = new Map<string, OutboxRecord>();
    const put = (record: OutboxRecord) => memory.set(record.clientUuid, mergeRecord(memory.get(record.clientUuid), record));
    const first = row('set'); put(first);
    const sent = pendingBatch([...memory.values()], 0);
    put(row('set', '2026-11-10T12:00:00Z'));
    const edited = memory.get('set')!;
    memory.set('set', settleRecord(edited, sent[0]!, 'synced'));
    expect(memory.size).toBe(1); expect(memory.get('set')?.syncState).toBe('pending');
    put(first); expect(memory.get('set')).toBe(edited);
    const retried = pendingBatch([...memory.values()], 0);
    memory.set('set', settleRecord(memory.get('set')!, retried[0]!, 'synced'));
    expect(pendingBatch([...memory.values()], 0)).toEqual([]);
  });

  it('retains rejected records, honors batch bounds, and never admits an empty owner', () => {
    const rejected = { ...row('rejected'), syncState: 'rejected' as const, reason: 'illegal_transition' };
    const memory = new Map<string, OutboxRecord>([['rejected', rejected], ['b', row('b')], ['a', row('a')]]);
    expect(pendingBatch([...memory.values()], 0, 1).map(r => r.clientUuid)).toEqual(['a']);
    expect(memory.get('rejected')?.reason).toBe('illegal_transition');
    expect(canFlush('', '')).toBe(false);
    expect(mergeRecord(row('a'), row('a')).clientUpdatedAt).toBe(row('a').clientUpdatedAt);
  });
});
