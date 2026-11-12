import { createMiddleware } from 'hono/factory';
import { createHash } from 'node:crypto';
import { clientColumns, withAuthTx, type AuthContext } from '@dawlyy/db';
import { idempotencyKeys } from '@dawlyy/db/schema';
import { and, eq, gt, lte } from 'drizzle-orm';
import { ApiError, validationError } from '../errors';
import type { AuthVariables } from './auth';

/** doc §12.1 / build-plan API: optional key extracted by the existing header middleware. */
export type IdempotencyVariables = { idempotencyKey?: string };

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reads the optional `Idempotency-Key` header on mutating requests and exposes it as `c.get('idempotencyKey')`.
 * Replay storage in `idempotency_keys` lands with Task 3; handlers can already pass the key through.
 */
export const idempotencyMiddleware = createMiddleware<{ Variables: IdempotencyVariables }>(async (c, next) => {
  if (MUTATING.has(c.req.method)) {
    const key = c.req.header('Idempotency-Key')?.trim();
    if (key) c.set('idempotencyKey', key);
  }
  await next();
});

/** doc §12.1 / build-plan API: request fingerprint and the saved JSON response, scoped by the store to one caller. */
export type StoredReplay = { requestHash: string; status: number; body: unknown };

/** doc §12.1 / build-plan API: injectable caller-scoped storage with an exclusive 24-hour freshness cutoff. */
export interface IdempotencyStore {
  find(auth: AuthContext, key: string, newerThan: Date): Promise<StoredReplay | undefined>;
  /** Remove only expired matching rows, then insert without replacing a concurrent winner. */
  save(auth: AuthContext, key: string, record: StoredReplay, newerThan: Date): Promise<void>;
}

/** doc §12.1 / build-plan API: SHA-256 of framed method/path and the exact body bytes; query strings are excluded. */
export function hashIdempotencyRequest(method: string, path: string, body: Uint8Array): string {
  return createHash('sha256').update(JSON.stringify([method, path]) + '\n').update(body).digest('hex');
}

const databaseStore: IdempotencyStore = {
  find: (auth, key, newerThan) => withAuthTx(auth, async (tx) => {
    const [row] = await tx.select({
      requestHash: clientColumns.idempotencyKeys.requestHash,
      status: clientColumns.idempotencyKeys.statusCode,
      body: clientColumns.idempotencyKeys.responseBody,
    }).from(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId),
      eq(idempotencyKeys.key, key), gt(idempotencyKeys.createdAt, newerThan),
    )).limit(1);
    return row;
  }),
  save: (auth, key, record, newerThan) => withAuthTx(auth, async (tx) => {
    // Expired rows still occupy the unique key. Delete only this caller's expired row before reusing it.
    await tx.delete(idempotencyKeys).where(and(
      eq(idempotencyKeys.tenantId, auth.tenantId), eq(idempotencyKeys.userId, auth.userId),
      eq(idempotencyKeys.key, key), lte(idempotencyKeys.createdAt, newerThan),
    ));
    await tx.insert(idempotencyKeys).values({
      tenantId: auth.tenantId, userId: auth.userId, key,
      requestHash: record.requestHash, statusCode: record.status, responseBody: record.body,
    }).onConflictDoNothing({ target: [idempotencyKeys.tenantId, idempotencyKeys.userId, idempotencyKeys.key] });
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
    const body = new Uint8Array(await c.req.raw.clone().arrayBuffer());
    const requestHash = hashIdempotencyRequest(c.req.method, c.req.path, body);
    const cutoff = () => new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stored = await store.find(auth, key, cutoff());
    if (stored) {
      if (stored.requestHash !== requestHash) {
        throw new ApiError(409, 'idempotency_key_reused', 'Idempotency-Key was already used for a different request');
      }
      const noBody = stored.status === 204 || stored.status === 205 || stored.status === 304;
      c.res = new Response(noBody ? null : JSON.stringify(stored.body), {
        status: stored.status,
        headers: { 'Content-Type': 'application/json', 'Idempotent-Replayed': 'true' },
      });
      return;
    }

    await next();
    if (c.res.status >= 500) return;
    let responseBody: unknown = null;
    if (c.res.body !== null) {
      try {
        responseBody = await c.res.clone().json();
      } catch {
        // API responses are JSON; leave an unexpected non-JSON response intact and uncached.
        return;
      }
    }
    await store.save(auth, key, { requestHash, status: c.res.status, body: responseBody }, cutoff());
  });
}

/** doc §12.1 / build-plan API: replay mutating requests through withAuthTx and the idempotency_keys_self RLS policy. */
export const idempotentReplay = createIdempotentReplay(databaseStore);
