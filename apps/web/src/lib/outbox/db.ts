'use client';
import Dexie, { type Table } from 'dexie';
import type { MetricOutbox, SessionOutbox, SetOutbox } from './queue';

/** Task 5: one Dexie database per authenticated user; T8 owns the metrics flusher. */
export class OutboxDatabase extends Dexie {
  sessions!: Table<SessionOutbox, string>;
  setLogs!: Table<SetOutbox, string>;
  metrics!: Table<MetricOutbox, string>;
  constructor(readonly owner: string) {
    super(`dawlyy-outbox-${owner}`);
    this.version(1).stores({ sessions: '&clientUuid,syncState', setLogs: '&clientUuid,syncState', metrics: '&clientUuid,syncState' });
  }
}
const databases = new Map<string, OutboxDatabase>();
/** Task 5: no database is shared between identities. */
export function outboxFor(userId: string): OutboxDatabase {
  let db = databases.get(userId);
  if (!db) { db = new OutboxDatabase(userId); databases.set(userId, db); }
  return db;
}
