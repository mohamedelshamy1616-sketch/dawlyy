import { createMiddleware } from 'hono/factory';
import { createHash } from 'node:crypto';
import { clientColumns, withAuthTx, type AuthContext } from '@dawlyy/db';
import { idempotencyKeys } from '@dawlyy/db/schema';
import { and, eq, gt, lte } from 'drizzle-orm';
import { ApiError, validationError } from '../errors';
import type { AuthVariables } from './auth';
import { readLimitedBody } from './body-limit';

/** doc §12.1 / build-plan API: optional key extracted by the existing header middleware. */
export type IdempotencyVariables = { idempotencyKey?: string };

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reads the optional `Idempotency-Key` header on mutating requests and exposes it as `c.get('idempotencyKey')`.
 * Replay storage in `idempotency_keys` lands with Task 3; handlers can already pass the key through.
 */
export const idempotencyMiddleware = createMiddleware<{ Variables: IdempotencyVariables }>(async (c, next) => {
  if (MUTATING.has(c.req.method)) {
    await readLimitedBody(c);
    const key = c.req.header('Idempotency-Key')?.trim();
    if (key) c.set('idempotencyKey', key);
  }
  await next();
});

/** doc §12.1 / build-plan API: request fingerprint and the saved JSON response, scoped by the store to one caller. */
export type StoredReplay = { requestHash: string; status: number; body: unknown };

/** doc §12.1 / build-plan API: injectable caller-scoped storage with an exclusive 24-hour freshness cutoff. */
export interface IdempotencyStore {
  find(auth: AuthContext, key: string, newerThan: Date): Promise<(StoredReplay & { createdAt: Date }) | undefined>;
  /** Remove expired rows and insert a 102 placeholder; only the winner gets its creation timestamp. */
  reserve(auth: AuthContext, key: string, requestHash: string, newerThan: Date): Promise<Date | undefined>;
  /** Release only the matching placeholder, never a newer reservation or final response. */
  release(auth: AuthContext, key: string, requestHash: string, reservedAt: Date): Promise<void>;
  /** Replace this reservation with the final response in one transaction. */
  save(auth: AuthContext, key: string, record: StoredReplay, reservedAt: Date): Promise<void>;
}

/** doc §12.1 / build-plan API: SHA-256 of framed method/path and the exact body bytes; query strings are excluded. */
export function hashIdempotencyRequest(method: string, path: string, body: Uint8Array): string {
  return createHash('sha256').update(JSON.stringify([method, path]) + '\n').update(body).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function authorizationFingerprint(auth: AuthContext): string {
  // Client assignments live outside AuthContext; module grants and the pinned identity are covered here.
  return createHash('sha256').update(stableJson({
    role: auth.role, membershipId: auth.membershipId, clientId: auth.clientId ?? null,
    permissions: auth.role === 'staff' ? auth.permissions : null,
  })).digest('hex');
}

/** Shared fingerprint for middleware reservations and atomic handler receipts. */
export function idempotencyRequestHash(auth: AuthContext, method: string, path: string, body: Uint8Array): string {
  return createHash('sha256').update(
    `${hashIdempotencyRequest(method, path, body)}|${authorizationFingerprint(auth)}`,
  ).digest('hex');
}

const databaseStore: IdempotencyStore = {
  find: (auth, key, newerThan) => withAuthTx(auth, async (tx) => {
    const [row] = await tx.select({
      requestHash: clientColumns.idempotencyKeys.requestHash,
      status: clientColumns.idempotencyKeys.statusCode,
      body: clientColumns.idempotencyKeys.responseBody,
      createdAt: clientColumns.idempotencyKeys.createdAt,
    }).from(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId),
      eq(idempotencyKeys.key, key), gt(idempotencyKeys.createdAt, newerThan),
    )).limit(1);
    return row;
  }),
  reserve: (auth, key, requestHash, newerThan) => withAuthTx(auth, async (tx) => {
    // Expired rows still occupy the unique key. Delete only this caller's expired row before reusing it.
    await tx.delete(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId),
      eq(idempotencyKeys.key, key), lte(idempotencyKeys.createdAt, newerThan),
    ));
    const [row] = await tx.insert(idempotencyKeys).values({
      tenantId: auth.tenantId, userId: auth.userId, key,
      // Supply millisecond precision so the returned Date can identify this reservation exactly in later DELETEs.
      requestHash, statusCode: 102, responseBody: null, createdAt: new Date(),
    }).onConflictDoNothing({ target: [idempotencyKeys.tenantId, idempotencyKeys.userId, idempotencyKeys.key] })
      .returning({ createdAt: idempotencyKeys.createdAt });
    return row?.createdAt;
  }),
  release: (auth, key, requestHash, reservedAt) => withAuthTx(auth, async (tx) => {
    await tx.delete(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId),
      eq(idempotencyKeys.key, key), eq(idempotencyKeys.requestHash, requestHash),
      eq(idempotencyKeys.statusCode, 102), eq(idempotencyKeys.createdAt, reservedAt),
    ));
  }),
  save: (auth, key, record, reservedAt) => withAuthTx(auth, async (tx) => {
    const removed = await tx.delete(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId),
      eq(idempotencyKeys.key, key), eq(idempotencyKeys.requestHash, record.requestHash),
      eq(idempotencyKeys.statusCode, 102), eq(idempotencyKeys.createdAt, reservedAt),
    )).returning({ key: idempotencyKeys.key });
    if (removed.length === 0) return;
    await tx.insert(idempotencyKeys).values({
      tenantId: auth.tenantId, userId: auth.userId, key,
      requestHash: record.requestHash, statusCode: record.status, responseBody: record.body,
    });
  }),
};

/** doc §12.1 / build-plan API: build replay middleware using a caller-scoped store; mount after auth. */
export function createIdempotentReplay(store: IdempotencyStore) {
  return createMiddleware<{ Variables: AuthVariables & IdempotencyVariables }>(async (c, next) => {
    const key = c.get('idempotencyKey');
    if (!key || !MUTATING.has(c.req.method)) {
      await next();
      return;
    }
    if (key.length > 200) throw validationError(undefined, 'Idempotency-Key must be at most 200 characters');
    const auth = c.get('auth');
    const body = await readLimitedBody(c);
    const requestHash = idempotencyRequestHash(auth, c.req.method, c.req.path, body);
    const cutoff = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
    let reservedAt: Date | undefined;
    // Retry reservation once when a stale placeholder is removed or a failed handler has just released its key.
    for (let attempt = 0; attempt < 2; attempt++) {
      reservedAt = await store.reserve(auth, key, requestHash, cutoff());
      if (reservedAt) break;
      const stored = await store.find(auth, key, cutoff());
      if (!stored) continue;
      if (stored.requestHash !== requestHash) {
        throw new ApiError(409, 'idempotency_key_reused', 'Idempotency-Key was already used for a different request');
      }
      if (stored.status === 102) {
        if (attempt === 0 && stored.createdAt.getTime() < Date.now() - 120_000) {
          await store.release(auth, key, requestHash, stored.createdAt);
          continue;
        }
        break;
      }
      const noBody = stored.status === 204 || stored.status === 205 || stored.status === 304;
      c.res = new Response(noBody ? null : JSON.stringify(stored.body), {
        status: stored.status,
        headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
      });
      return;
    }
    if (!reservedAt) {
      const error = new ApiError(409, 'idempotency_in_progress', 'A request with this Idempotency-Key is still in progress');
      return c.json(error.toBody(), 409, { 'Retry-After': '1' });
    }

    let saved = false;
    try {
      await next();
      // Hono may turn a thrown handler error into a response before next() resolves.
      if (c.error || c.res.status >= 500) return;
      let responseBody: unknown = null;
      if (c.res.body !== null) {
        try {
          responseBody = await c.res.clone().json();
        } catch {
          // API responses are JSON; leave an unexpected non-JSON response intact and uncached.
          return;
        }
      }
      await store.save(auth, key, { requestHash, status: c.res.status, body: responseBody }, reservedAt);
      saved = true;
    } finally {
      // On a throw, 5xx or non-JSON response the key becomes retryable.
      if (!saved) await store.release(auth, key, requestHash, reservedAt);
    }
  });
}

/** doc §12.1 / build-plan API: replay mutating requests through withAuthTx and the idempotency_keys_self RLS policy. */
export const idempotentReplay = createIdempotentReplay(databaseStore);
