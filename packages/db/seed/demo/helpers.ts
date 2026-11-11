import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { Tx } from '../../src/client';
import { DEMO_IDS } from './ids';

/** doc §14 / §12.1(13): check before INSERT, avoiding counter burns and retaining operator changes. */
export async function exists(tx: Tx, table: PgTable, id: string): Promise<boolean> {
  const rows = await tx.execute(sql`select 1 from ${table} where tenant_id = ${DEMO_IDS.tenant}::uuid and id = ${id}::uuid limit 1`);
  return rows.length !== 0;
}

/** doc §8.3 / Task 12: validate every configured connection before local seed/reset uses a service pool. */
export function assertLocalDatabase(): void {
  const runtime = process.env.DATABASE_URL;
  if (!runtime) throw new Error('DATABASE_URL must point to a local scratch database.');
  for (const raw of [runtime, process.env.DATABASE_URL_SERVICE].filter((v): v is string => !!v)) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error('Invalid local database URL.'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('Demo seed/reset requires localhost or 127.0.0.1 for DATABASE_URL and DATABASE_URL_SERVICE.');
    }
    if (!url.pathname || url.pathname === '/') throw new Error('A named local scratch database is required.');
  }
}
