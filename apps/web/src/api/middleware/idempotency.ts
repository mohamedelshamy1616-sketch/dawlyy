import { createMiddleware } from 'hono/factory';

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
