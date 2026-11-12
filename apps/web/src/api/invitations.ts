import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { isAllowed } from '@dawlyy/core/authz';
import { withAuthTx } from '@/src/server/db';
import { requirePermission } from '@/src/server/require-permission';
import {
  createInvitation, invitationInputSchema, listInvitations,
  regenerateInvitation, revokeInvitation,
} from '@/src/server/invitations';
import { ApiError, forbidden, unprocessable, validationError } from './errors';
import { pageSchema, parseListQuery } from './lib/pagination';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import type { ApiEnv } from './env';

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
const idParams = z.object({ id: z.uuid() });
const invitationResult = z.object({ id: z.uuid(), role: z.enum(['staff', 'client']), expiresAt: z.string(), token: z.string(), link: z.string() });
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

function linkFor(origin: string, locale: string, token: string) {
  const base = (process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/g, '');
  return `${base}/${locale === 'en' ? 'en' : 'ar'}/invite/${token}`;
}

// The wildcard covers the root and every protected subpath served by this module.
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', async (c, next) => {
  const auth = c.get('auth');
  if (c.req.method === 'GET') {
    if (isAllowed(auth, 'team', 'view')) requirePermission(auth, 'team', 'view');
    else requirePermission(auth, 'clients', 'view');
  } else if (isAllowed(auth, 'team', 'manage')) requirePermission(auth, 'team', 'manage');
  else requirePermission(auth, 'clients', 'edit');
  const path = c.req.path.replace(/\/$/, '');
  const producesToken = c.req.method === 'POST' && (path === '/api/v1/invitations' || path.endsWith('/regenerate'));
  if (producesToken) {
    c.header('Cache-Control', 'no-store');
  }
  await next();
});
router.use('*', async (c, next) => {
  const path = c.req.path.replace(/\/$/, '');
  const producesToken = c.req.method === 'POST' && (path === '/api/v1/invitations' || path.endsWith('/regenerate'));
  if (!producesToken) { await idempotentReplay(c, next); return; }
  let firstResponse: Response | undefined;
  await idempotentReplay(c, async () => {
    await next();
    if (c.res.status === 201) {
      firstResponse = c.res;
      // The shared store sees only this secret-free retry result; the first caller receives the original below.
      c.res = c.json({ error: {
        code: 'invitation_link_already_issued', message: 'This invitation link was already issued. Regenerate it for a new link.',
      } }, 409);
    }
  });
  if (firstResponse) c.res = firstResponse;
});

router.openapi(createRoute({
  method: 'post', path: '/', request: { body: jsonBody(invitationInputSchema) },
  responses: { ...errors, 201: { description: 'Copy this invitation link; its secret is returned only once', content: { 'application/json': { schema: invitationResult } } } },
}), async (c) => {
  const auth = c.get('auth');
  const input = c.req.valid('json');
  requirePermission(auth, input.role === 'staff' ? 'team' : 'clients', input.role === 'staff' ? 'manage' : 'edit');
  const result = await guarded(() => withAuthTx(auth, (tx) => createInvitation(tx, auth, input)));
  const locale = c.req.header('Accept-Language')?.startsWith('en') ? 'en' : 'ar';
  return c.json({ ...result, link: linkFor(new URL(c.req.url).origin, locale, result.token) }, 201);
});

router.openapi(createRoute({
  method: 'get', path: '/', request: { query: z.object({ limit: z.string().optional(), cursor: z.string().optional() }) },
  responses: { ...errors, 200: { description: 'Visible invitations, without secrets', content: { 'application/json': { schema: pageSchema(z.object({
    id: z.uuid(), role: z.enum(['owner', 'staff', 'client']), displayName: z.string().nullable(),
    email: z.string().nullable(), phone: z.string().nullable(), clientId: z.uuid().nullable(),
    status: z.enum(['pending', 'accepted', 'revoked', 'expired']), expiresAt: z.string(), createdAt: z.string(),
  })) } } } },
}), async (c) => {
  const auth = c.get('auth');
  const query = parseListQuery(c.req.valid('query'));
  return c.json(await guarded(() => withAuthTx(auth, (tx) => listInvitations(tx, auth, query))), 200);
});

router.openapi(createRoute({
  method: 'post', path: '/{id}/revoke', request: { params: idParams },
  responses: { ...errors, 200: { description: 'Invitation revoked', content: { 'application/json': { schema: z.object({ id: z.uuid(), status: z.literal('revoked') }) } } } },
}), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => revokeInvitation(tx, auth, c.req.valid('param').id))), 200);
});

router.openapi(createRoute({
  method: 'post', path: '/{id}/regenerate', request: { params: idParams },
  responses: { ...errors, 201: { description: 'Old invitation revoked and replaced', content: { 'application/json': { schema: invitationResult } } } },
}), async (c) => {
  const auth = c.get('auth');
  const result = await guarded(() => withAuthTx(auth, (tx) => regenerateInvitation(tx, auth, c.req.valid('param').id)));
  const locale = c.req.header('Accept-Language')?.startsWith('en') ? 'en' : 'ar';
  return c.json({ ...result, link: linkFor(new URL(c.req.url).origin, locale, result.token) }, 201);
});

