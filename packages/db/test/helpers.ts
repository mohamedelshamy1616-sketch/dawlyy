import { expect } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { withAuthTx, withServiceTx, type AuthContext, type Tx } from '../src/client';
import { pgCode, rows } from './fixtures';

/** Run `fn` as a member: runtime role, RLS and guard triggers apply (the production path). */
export function as<T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withAuthTx(ctx, fn);
}

/** Run `fn` as the service: RLS bypassed, guards skipped. Use it to arrange data and to re-read rows after a refused write. */
export function svc<T>(fn: (tx: Tx) => Promise<T>, tenantId: string | null = null): Promise<T> {
  return withServiceTx(tenantId, 'security test', fn);
}

/** Execute one statement and return its rows. */
export async function q<T = Record<string, unknown>>(tx: Tx, query: SQL): Promise<T[]> {
  return rows<T>(await tx.execute(query));
}

/** The single row of a statement; throws unless there is exactly one. */
export async function one<T = Record<string, unknown>>(tx: Tx, query: SQL): Promise<T> {
  const found = await q<T>(tx, query);
  if (found.length !== 1) throw new Error(`expected exactly one row, got ${found.length}`);
  return found[0]!;
}

/**
 * Assert that `work` fails with SQLSTATE `code`: 42501 privilege, policy or guard column rule; P0001 state rule;
 * 23503 reference; 23505 unique; 23514 check.
 */
export async function expectCode(work: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await work;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) throw new Error(`expected SQLSTATE ${code}, but the statement succeeded`);
  expect(pgCode(caught), String((caught as { message?: unknown }).message ?? caught)).toBe(code);
}

/** A row read through the service (RLS bypassed), for "the row is unchanged" assertions. */
export function serviceRow<T = Record<string, unknown>>(table: string, id: string): Promise<T | undefined> {
  return svc(async (tx) => (await q<T>(tx, sql`select * from ${sql.identifier(table)} where id = ${id}`))[0]);
}

/** Number from a `select count(*) ... as n` run as a member. */
export async function countAs(ctx: AuthContext, query: SQL): Promise<number> {
  return as(ctx, async (tx) => Number((await one<{ n: number | string }>(tx, query)).n));
}
