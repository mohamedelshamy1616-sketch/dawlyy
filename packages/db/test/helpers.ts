import { expect } from 'vitest';
import { sql, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { withAuthTx, withServiceTx, withErasureTx, type AuthContext, type Tx } from '../src/client';
import { rows } from './fixtures';

/** doc §13.3: PostgreSQL fields read from the same unwrapped postgres-js error. */
export type PgError = Error & {
  code: string;
  detail?: string;
  table_name?: string;
  column_name?: string;
  constraint_name?: string;
};

type Work = PromiseLike<unknown> | (() => PromiseLike<unknown>);

/** doc §13.3: Run as a pinned member through the production runtime transaction. */
export function as<T>(ctx: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withAuthTx(ctx, fn);
}

/** doc §13.3: Arrange or independently re-read data through a reasoned service transaction. */
export function svc<T>(fn: (tx: Tx) => Promise<T>, tenantId: string | null = null): Promise<T> {
  return withServiceTx(tenantId, 'security test', fn);
}

/** doc §13.3, §14: Run identity-free erasure through the production erasure wrapper. */
export function erasure<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withErasureTx(tenantId, 'security test', fn);
}

/** doc §13.3: Execute parameterised Drizzle SQL and return its postgres-js row array. */
export async function q<T = Record<string, unknown>>(tx: Tx, query: SQL): Promise<T[]> {
  const result = await tx.execute(query);
  const stamped = new Set(((result as unknown as { columns?: { name: string; type: number }[] }).columns ?? [])
    .filter((column) => column.type === TIMESTAMPTZ_OID).map((column) => column.name));
  return rows<Record<string, unknown>>(result).map((row) => {
    if (stamped.size === 0) return row as T;
    const out: Record<string, unknown> = { ...row };
    for (const name of stamped) if (typeof out[name] === 'string') out[name] = parseTimestamptz(out[name] as string);
    return out as T;
  });
}

/**
 * The Drizzle postgres-js driver hands timestamptz columns back as the raw text Postgres sends ('2026-01-01 00:00:00+00'),
 * but the suites compare instants as Date objects. Convert exactly the columns whose result type is timestamptz (OID 1184);
 * an explicit ::text cast, date, timestamp without zone and jsonb contents are left untouched.
 */
const TIMESTAMPTZ_OID = 1184;
function parseTimestamptz(text: string): Date {
  return new Date(text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}

/** doc §13.3: Return exactly one row, failing setup on zero or multiple rows. */
export async function one<T = Record<string, unknown>>(tx: Tx, query: SQL): Promise<T> {
  const found = await q<T>(tx, query);
  if (found.length !== 1) throw new Error(`expected exactly one row, got ${found.length}`);
  return found[0]!;
}

/** doc §13.3: Require a rejection and retain the deepest driver error, never wrapper metadata. */
async function rejected(work: Work): Promise<PgError> {
  let caught: unknown;
  let didReject = false;
  try {
    await (typeof work === 'function' ? work() : work);
  } catch (error) {
    didReject = true;
    caught = error;
  }
  if (!didReject) throw new Error('expected PostgreSQL refusal, but the statement succeeded');
  const seen = new Set<object>();
  let current = caught;
  let driverError: PgError | undefined;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code) && typeof candidate.message === 'string') {
      driverError = current as PgError;
    }
    current = candidate.cause;
  }
  if (driverError) return driverError;
  throw new Error('expected a PostgreSQL error with a five-character SQLSTATE', { cause: caught });
}

/** doc §13.3: Require rejection with the exact SQLSTATE and return the unwrapped driver error. */
export async function expectCode(work: Work, code: string): Promise<PgError> {
  if (!/^[0-9A-Z]{5}$/.test(code)) throw new Error('expected SQLSTATE must contain exactly five uppercase letters/digits');
  const error = await rejected(work);
  expect(error.code, error.message).toBe(code);
  return error;
}

const guardCodes: Readonly<Record<string, string>> = {
  no_membership: '42501', require_perm: '42501', perm_transitions: '42501',
  insert_eq: '42501', client_insert_eq: '42501', immutable: '42501', set_once: '42501',
  update_allow: '42501', client_update: '42501', staff_update: '42501', update_to: '42501', on_clear: '42501',
  transitions: 'P0001', client_transitions: 'P0001', editable_in: 'P0001', delete_when: 'P0001', monotonic: 'P0001', stamp: 'P0001',
};
const privilegeMessage = /permission denied (?:for|to)\b/i;

/** doc §13.3: Keep policy and privilege assertions separate from guard/special-rule refusals. */
function expectNoRuleDetail(error: PgError): void {
  expect(error.detail ?? '', 'guard/special-rule refusals require expectGuard').not.toMatch(/(?:guard|rule):/);
}

/** doc §13.3: Require the exact guard/rule detail, its SQLSTATE class and optional column/table metadata. */
export async function expectGuard(work: Work, rule: string, column?: string): Promise<PgError> {
  const special = rule.startsWith('rule:');
  const code = special ? undefined : guardCodes[rule];
  if (!special && !Object.hasOwn(guardCodes, rule)) throw new Error(`unknown guard refusal key: ${rule}`);
  const error = await rejected(work);
  expect(error.detail, error.message).toBe(special ? rule : 'guard:' + rule);
  if (special) expect(['42501', 'P0001'], error.message).toContain(error.code);
  else expect(error.code, error.message).toBe(code);
  expect(error.message).not.toMatch(/row-level security/i);
  expect(error.message).not.toMatch(privilegeMessage);
  if (column !== undefined) {
    expect(error.column_name).toBe(column);
    expect(error.table_name).toEqual(expect.any(String));
    expect(error.table_name?.trim().length).toBeGreaterThan(0);
  }
  return error;
}

/** doc §13.3: Require 42501 from row-level security, with no guard/rule or privilege refusal. */
export async function expectRls(work: Work): Promise<PgError> {
  const error = await expectCode(work, '42501');
  expect(error.message).toMatch(/row-level security/i);
  expect(error.message).not.toMatch(privilegeMessage);
  expectNoRuleDetail(error);
  return error;
}

/** doc §13.3: Require 42501 naming a table/function/schema/parameter privilege target. */
export async function expectPrivilege(work: Work): Promise<PgError> {
  const error = await expectCode(work, '42501');
  expect(error.message).toMatch(/^permission denied for (?:table|function|schema|parameter)\s+\S+/i);
  expect(error.message).not.toMatch(/row-level security/i);
  expectNoRuleDetail(error);
  return error;
}

/** doc §13.3: Quote a table/schema identifier independently from all parameterised data. */
function relation(table: string): { name: string; identifier: SQL } {
  const parts = table.split('.');
  if (parts.length < 1 || parts.length > 2 || parts.some((part) => !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(part))) {
    throw new Error('expected a table name or schema.table, with identifiers of at most 63 bytes');
  }
  const name = parts[parts.length - 1]!;
  const schema = parts.length === 2 ? parts[0]! : 'public';
  return { name, identifier: sql`${sql.identifier(schema)}.${sql.identifier(name)}` };
}

/** doc §13.3: Service-read one whole row by UUID id; undefined means the row is absent. */
export async function serviceRow<T = Record<string, unknown>>(table: string, id: string): Promise<T | undefined> {
  const target = relation(table);
  return svc(async (tx) => (await q<T>(tx, sql`select * from ${target.identifier} where id = ${id}::uuid`))[0]);
}

/** doc §13.3: Service-read deterministically ordered whole rows without coercing bigint keys to Number. */
export function serviceRowWhere<T = Record<string, unknown>>(table: string, whereSql: SQL): Promise<T[]> {
  const target = relation(table);
  return svc((tx) => q<T>(tx, sql`select * from ${target.identifier}
    where ${whereSql} order by to_jsonb(${sql.identifier(target.name)})::text collate "C"`));
}

const compositeKeys: Readonly<Record<string, readonly string[]>> = {
  staff_client_assignments: ['tenant_id', 'membership_id', 'client_id'],
  business_settings: ['tenant_id'],
  user_preferences: ['tenant_id', 'user_id'],
  tenant_hidden_items: ['tenant_id', 'kind', 'item_id'],
  idempotency_keys: ['tenant_id', 'user_id', 'key'],
};

/** doc §13.3: Require zero UPDATE/DELETE RETURNING rows and unchanged whole rows under their original keys. */
export async function expectNoEffect(ctx: AuthContext, statement: SQL, table: string, whereSql: SQL): Promise<void> {
  const rendered = new PgDialect().sqlToQuery(statement).sql;
  if (!/^\s*(?:update\b|delete\s+from\b)/i.test(rendered)) {
    throw new Error('expectNoEffect requires one UPDATE or DELETE without a trailing semicolon or RETURNING');
  }
  const before = await serviceRowWhere<Record<string, unknown>>(table, whereSql);
  expect(before.length, 'expectNoEffect needs an existing service-visible target set').toBeGreaterThan(0);
  const keys = compositeKeys[relation(table).name] ?? ['id'];
  const originalKeys = before.map((row) => sql`(${sql.join(keys.map((key) => {
    const value = row[key];
    if (value === undefined || value === null || !['string', 'bigint', 'number'].includes(typeof value)) {
      throw new Error(`missing or unsupported original key ${key} on ${table}`);
    }
    if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('unsafe numeric original key');
    return sql`${sql.identifier(key)} is not distinct from ${value}`;
  }), sql` and `)})`);
  await as(ctx, async (tx) => {
    const affected = await q(tx, sql`${statement} returning 1`);
    expect(affected).toEqual([]);
  });
  const after = await serviceRowWhere(table, sql.join(originalKeys, sql` or `));
  expect(after).toEqual(before);
}

/** doc §13.3: Run count(*) AS n as an actor and return a safe, nonnegative numeric count. */
export async function countAs(ctx: AuthContext, query: SQL): Promise<number> {
  const count = await as(ctx, async (tx) => Number((await one<{ n: number | string }>(tx, query)).n));
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('count is not a safe nonnegative integer');
  return count;
}

/** doc §13.3: Install only the case's test-owned guard JSON as a safely escaped trigger argument. */
async function installProbeGuard(tx: Tx, config: Readonly<Record<string, unknown>>): Promise<void> {
  // Trigger arguments are SQL literals, not bind parameters; escape the test-owned JSON literal.
  const literal = sql.raw("E'" + JSON.stringify(config).replace(/\\/g, '\\\\').replace(/'/g, "''") + "'");
  await tx.execute(sql`drop trigger if exists t_50_guard on dawlyy_probe.t`);
  await tx.execute(sql`create trigger t_50_guard before insert or update or delete on dawlyy_probe.t
    for each row execute function app.guard_row(${literal})`);
}

/** doc §13.3/N11: Drop only the test-owned probe schema, including stale setup from an earlier failure. */
export async function dropProbe(): Promise<void> {
  await svc(async (tx) => {
    await tx.execute(sql`drop schema if exists dawlyy_probe cascade`);
  });
}

/** doc §13.3/N11: Recreate the postgres-owned RLS probe and guard; clean up on setup failure. */
export async function createProbe(config: Readonly<Record<string, unknown>> = {}): Promise<void> {
  try {
    await svc(async (tx) => {
      await tx.execute(sql`drop schema if exists dawlyy_probe cascade`);
      await tx.execute(sql`create schema dawlyy_probe authorization postgres`);
      await tx.execute(sql`create table dawlyy_probe.t (
        id uuid primary key default gen_random_uuid(), tenant_id uuid not null, client_id uuid,
        created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz,
        state text default 'pending', notes text, amount numeric default 100,
        verified_at timestamptz, verified_by uuid, refund_amount numeric,
        client_updated_at timestamptz, deleted_at timestamptz, completed_at timestamptz,
        completed_by uuid, unread_for_client integer not null default 0
      )`);
      await tx.execute(sql`alter table dawlyy_probe.t owner to postgres`);
      await tx.execute(sql`grant usage on schema dawlyy_probe to dawlyy_rls`);
      await tx.execute(sql`grant select, insert, update, delete on dawlyy_probe.t to dawlyy_rls`);
      await tx.execute(sql`alter table dawlyy_probe.t enable row level security`);
      await tx.execute(sql`create policy t_tenant_guard on dawlyy_probe.t as restrictive for all to dawlyy_rls
        using (tenant_id = (select app.tenant_id())) with check (tenant_id = (select app.tenant_id()))`);
      await tx.execute(sql`create policy t_permissive on dawlyy_probe.t as permissive for all to dawlyy_rls
        using (true) with check (true)`);
      await installProbeGuard(tx, config);
    });
  } catch (error) {
    await dropProbe();
    throw error;
  }
}

/** doc §13.3: Replace only the probe trigger JSON, preserving each case's private rows and policies. */
export async function setProbeGuard(config: Readonly<Record<string, unknown>>): Promise<void> {
  await svc((tx) => installProbeGuard(tx, config));
}

/** doc §13.3/N11: Own probe setup and teardown in finally, including setup and callback failures. */
export async function withProbe<T>(config: Readonly<Record<string, unknown>>, fn: () => Promise<T>): Promise<T> {
  try {
    await createProbe(config);
    return await fn();
  } finally {
    await dropProbe();
  }
}
