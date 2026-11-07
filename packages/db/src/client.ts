import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Role = 'owner' | 'staff' | 'client';

/** Who is acting. Built by the web app from the Supabase session plus the `memberships` row. */
export type AuthContext = {
  userId: string;
  tenantId: string;
  membershipId: string;
  role: Role;
  /** Present when role is `client`. */
  clientId?: string;
};

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

type Pool = ReturnType<typeof postgres>;
const g = globalThis as unknown as { __dawlyyRuntimePool?: Pool; __dawlyyServicePool?: Pool };

function connect(url: string): Pool {
  // prepare:false is required behind the Supabase transaction pooler (PgBouncer transaction mode).
  return postgres(url, { max: 10, prepare: false, idle_timeout: 20, connect_timeout: 10 });
}

/**
 * Runtime pool: restricted role `dawlyy_app` (NOINHERIT, member of `authenticated`).
 * Outside `withAuthTx` this role has no table privileges, so forgetting the helper fails loudly.
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

/**
 * Run `fn` inside one transaction with the caller's identity applied at the database level:
 * JWT claims and membership id as transaction-local settings, then `SET LOCAL ROLE authenticated`
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
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

/**
 * Identity-only transaction used by requireAuth() to find the caller's memberships before a tenant context
 * exists: JWT claims + SET LOCAL ROLE authenticated, no membership pin. RLS still applies — the
 * `memberships_self_select` policy lets a user read only their own membership rows.
 */
export async function withUserTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  runtimeDb ??= drizzle(runtimePool(), { schema });
  return runtimeDb.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}

/**
 * Privileged transaction for background jobs, seeds and migrations. RLS is NOT enforced here, so:
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

/** Close pools (tests, scripts). */
export async function closeDb(): Promise<void> {
  await Promise.all([g.__dawlyyRuntimePool?.end({ timeout: 5 }), g.__dawlyyServicePool?.end({ timeout: 5 })]);
  g.__dawlyyRuntimePool = undefined;
  g.__dawlyyServicePool = undefined;
  runtimeDb = undefined;
  serviceDb = undefined;
}
