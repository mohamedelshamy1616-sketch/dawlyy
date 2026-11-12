import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getSessionUser } from '@/src/server/auth';
import { acceptInvitationForUser, previewInvitation } from '@/src/server/invitations/client-read';
import { ApiError, forbidden, unauthorized, unprocessable, validationError } from './errors';
import type { ApiEnv } from './env';
import { rateLimit } from './middleware/rate-limit';

// Task 2: invitations and acceptance.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => {
  if (!result.success) throw validationError(result.error.issues);
} });

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
const errors = {
  400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
  401: { description: 'No session', content: { 'application/json': { schema: errorSchema } } },
  403: { description: 'Permission or row scope denied', content: { 'application/json': { schema: errorSchema } } },
  404: { description: 'Invitation not found or expired', content: { 'application/json': { schema: errorSchema } } },
  409: { description: 'Already used or already a member', content: { 'application/json': { schema: errorSchema } } },
  422: { description: 'Invitation is not pending', content: { 'application/json': { schema: errorSchema } } },
};
const tokenBody = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const jsonBody = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });

function databaseCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if ('code' in error && typeof error.code === 'string') return error.code;
  return 'cause' in error ? databaseCode(error.cause) : undefined;
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = databaseCode(error);
    if (code === '42501') throw forbidden();
    if (code === '23503' || code === '23514') throw validationError();
    if (code === '23505') throw new ApiError(409, 'conflict', 'Invitation conflicts with an existing account');
    if (code === 'P0001') throw unprocessable();
    // Never pass query parameters (including token hashes) to the shared error logger.
    throw new ApiError(500, 'internal_error', 'Unable to process the invitation');
  }
}

// Register the two membership-free endpoints before the protected wildcard middleware.
router.use('/preview', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});
router.use('/accept', async (c, next) => {
  if (!await getSessionUser(c.req.raw.headers)) throw unauthorized();
  c.header('Cache-Control', 'no-store');
  await next();
});

router.openapi(createRoute({
  method: 'post', path: '/preview', request: { body: jsonBody(tokenBody) },
  middleware: [rateLimit({ windowMs: 60_000, max: 30 })] as const,
  responses: { ...errors,
    429: {
      description: 'Preview rate limit exceeded',
      headers: { 'Retry-After': { schema: { type: 'string' }, description: 'Seconds until this window expires' } },
      content: { 'application/json': { schema: errorSchema } },
    },
    200: { description: 'Public invitation preview', content: { 'application/json': { schema: z.object({
    businessName: z.string(), role: z.enum(['owner', 'staff', 'client']), displayName: z.string().nullable(), expired: z.boolean(),
    status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  }) } } } },
}), async (c) => c.json(await guarded(() => previewInvitation(c.req.valid('json').token)), 200));

router.openapi(createRoute({
  method: 'post', path: '/accept', request: { body: jsonBody(tokenBody) },
  responses: { ...errors, 200: { description: 'Membership activated', content: { 'application/json': { schema: z.object({
    role: z.enum(['staff', 'client']), redirectTo: z.enum(['/app/today', '/coach']),
  }) } } } },
}), async (c) => {
  const user = await getSessionUser(c.req.raw.headers);
  if (!user) throw unauthorized();
  return c.json(await guarded(() => acceptInvitationForUser(user.id, c.req.valid('json').token)), 200);
});
