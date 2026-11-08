import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { StaffPermissions } from '@dawlyy/core/authz';
import * as schema from './schema';

/** doc §3: the role of the pinned membership. */
export type Role = 'owner' | 'staff' | 'client';

/** doc §14: identity and API permissions from the Supabase session and pinned membership. */
export type AuthContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: Role;
  /** Staff module grants for the API only; owners and clients use null. Never sent as a database setting. */
  permissions: StaffPermissions | null;
  /** Present when role is `client`. */
  clientId?: string;
};

/** doc §14: the schema-bound database handle used by the transaction wrappers. */
export type Db = PostgresJsDatabase<typeof schema>;
/** doc §14: a transaction passed to runtime and service callbacks. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

type Pool = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __dawlyyRuntimePool?: Pool; __dawlyyServicePool?: Pool };

function connect(url: string): Pool {
  // doc §14: read lazily so closeDb() lets tests change the size before the next pool is created.
  const raw = process.env.DAWLYY_DB_POOL_MAX ?? '';
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  const max = Number.isSafeInteger(n) && n > 0 ? n : 10;
  // prepare:false is required behind the Supabase transaction pooler (PgBouncer transaction mode).
  return postgres(url, { max, prepare: false, idle_timeout: 20, connect_timeout: 10 });
}

/**
 * Runtime pool: restricted login `dawlyy_app` (NOINHERIT, member of `dawlyy_rls`, doc §3).
 * Outside `withAuthTx`/`withUserTx` this login has no table privileges.
 */
function runtimePool(): Pool {
  return (g.__dawlyyRuntimePool ??= connect(requireEnv('DATABASE_URL')));
}

/** Privileged pool for migrations, seeds and jobs. Bypasses RLS: only `withServiceTx` may use it. */
function servicePool(): Pool {
  return (g.__dawlyyServicePool ??= connect(process.env.DATABASE_URL_SERVICE ?? requireEnv('DATABASE_URL')));
}

let runtimeDb: Db | undefined;
let serviceDb: Db | undefined;

async function limitRuntimeTx(tx: Tx): Promise<void> {
  // doc §14: SET ROLE does not apply the target role's ALTER ROLE defaults.
  await tx.execute(sql`set local statement_timeout = '15s'`);
  await tx.execute(sql`set local lock_timeout = '5s'`);
  await tx.execute(sql`set local idle_in_transaction_session_timeout = '30s'`);
}

/**
 * doc §14: run `fn` with transaction-local JWT claims, a membership pin and runtime limits.
 * Switch to `dawlyy_rls`
 * so every RLS policy sees `app.uid()`, `app.tenant_id()`, `app.role()` and `app.can_access_client()`.
 *
 * This is the ONLY way application code (API handlers and Server Components alike) reaches the database.
 */
export async function withAuthTx<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  runtimeDb ??= drizzle(runtimePool(), { schema });
  return runtimeDb.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: auth.userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${auth.userId}, true)`);
    await tx.execute(sql`select set_config('app.membership_id', ${auth.membershipId}, true)`);
    await tx.execute(sql`set local role dawlyy_rls`);
    await limitRuntimeTx(tx);
    return fn(tx);
  });
}

/**
 * doc §14, §4: identity-only transaction for membership discovery, with no tenant membership pin.
 * Runs as `dawlyy_rls` with runtime limits; only self memberships and shared system libraries are readable.
 */
export async function withUserTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  runtimeDb ??= drizzle(runtimePool(), { schema });
  return runtimeDb.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
    await tx.execute(sql`select set_config('app.membership_id', '', true)`);
    await tx.execute(sql`set local role dawlyy_rls`);
    await limitRuntimeTx(tx);
    return fn(tx);
  });
}

/**
 * doc §14: privileged, identity-free transaction for background jobs, seeds and migrations.
 * No role switch or runtime timeouts are applied. RLS is NOT enforced here, so:
 *  - every query must filter by `tenantId` explicitly;
 *  - `reason` is recorded as `app.service_reason` for the audit trigger and logs.
 */
export async function withServiceTx<T>(tenantId: string | null, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!reason || reason.trim().length < 3) throw new Error('withServiceTx needs a reason');
  serviceDb ??= drizzle(servicePool(), { schema });
  return serviceDb.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.service_reason', ${reason}, true)`);
    await tx.execute(sql`select set_config('app.service_tenant_id', ${tenantId ?? ''}, true)`);
    return fn(tx);
  });
}

/** doc §14, §7.9: service erasure transaction with a reason and transaction-local erasure flag. */
export async function withErasureTx<T>(tenantId: string, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!reason || reason.trim().length < 3) throw new Error('withErasureTx needs a reason');
  return withServiceTx(tenantId, `erasure: ${reason}`, async (tx) => {
    await tx.execute(sql`select set_config('app.erasure', 'on', true)`);
    return fn(tx);
  });
}

/** doc §14: drop cached handles and close pools; the next connection re-reads DAWLYY_DB_POOL_MAX. */
export async function closeDb(): Promise<void> {
  const runtime = g.__dawlyyRuntimePool;
  const service = g.__dawlyyServicePool;
  g.__dawlyyRuntimePool = undefined;
  g.__dawlyyServicePool = undefined;
  runtimeDb = undefined;
  serviceDb = undefined;
  await Promise.all([runtime?.end({ timeout: 5 }), service?.end({ timeout: 5 })]);
}
