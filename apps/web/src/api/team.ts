import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { isAllowed } from '@dawlyy/core/authz';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { forbidden, validationError } from './errors';
import { withAuthTx } from '../server/db';
import { guarded } from '../server/settings/guarded';
import {
  deactivateMember, getTeamMember, inviteTeamMember, listTeam, reactivateMember, setMemberPermissions,
} from '../server/team/service';

// Task 11: team, invitations of staff and the per-user permission editor.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => {
  if (!result.success) throw validationError(result.error.issues);
} });

router.use('*', requireAuthMiddleware);
// Clients never reach /team; staff need the `team` module (view to read, manage to change). Owners pass.
router.use('*', async (c, next) => {
  const auth = c.get('auth');
  if (auth.role === 'client') throw forbidden();
  if (!isAllowed(auth, 'team', c.req.method === 'GET' ? 'view' : 'manage')) throw forbidden();
  await next();
});

function invitePath(path: string): boolean {
  return path.replace(/\/$/, '').endsWith('/team/invite');
}

// The invite response carries a one-time secret link. The idempotency store must never keep it, so a replay answers 409,
// the same way the invitations module does; the first caller still receives the original response.
router.use('*', async (c, next) => {
  if (c.req.method !== 'POST' || !invitePath(c.req.path)) { await idempotentReplay(c, next); return; }
  c.header('Cache-Control', 'no-store');
  let first: Response | undefined;
  await idempotentReplay(c, async () => {
    await next();
    if (c.res.status === 201) {
      first = c.res;
      c.res = c.json({ error: { code: 'invitation_link_already_issued', message: 'This invitation link was already issued. Revoke it and invite again for a new link.' } }, 409);
    }
  });
  if (first) c.res = first;
});

const jsonResponse = { description: 'Team data', content: { 'application/json': { schema: z.unknown() } } };
const errorResponse = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) }) } } };
const errors = { 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse };
const body = <T extends z.ZodType>(schema: T) => ({ required: true as const, content: { 'application/json': { schema } } });
const params = z.object({ membershipId: z.uuid() });

// Module and action names are checked by the service so an unknown key answers 422, not 400.
const moduleMap = z.record(z.string().max(40), z.array(z.string().max(40)).max(20)).refine((value) => Object.keys(value).length <= 40);
const inviteSchema = z.object({
  email: z.email().max(254),
  displayName: z.string().trim().min(1).max(160),
  preset: z.string().min(1).max(40),
  overrides: z.object({ client_scope: z.enum(['all', 'assigned']).optional(), modules: moduleMap.optional() }).strict().optional(),
}).strict();
const permissionsSchema = z.object({
  preset: z.string().min(1).max(40).optional(),
  modules: moduleMap.optional(),
  client_scope: z.string().min(1).max(20),
}).strict();

router.openapi(createRoute({ method: 'get', path: '/', tags: ['Team'], responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => listTeam(tx, auth))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/invite', tags: ['Team'], request: { body: body(inviteSchema) }, responses: { 201: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const input = c.req.valid('json');
  const result = await guarded(() => withAuthTx(auth, (tx) => inviteTeamMember(tx, auth, input)));
  const locale = c.req.header('Accept-Language')?.startsWith('en') ? 'en' : 'ar';
  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(c.req.url).origin).replace(/\/+$/g, '');
  return c.json({ ...result, link: `${base}/${locale}/invite/${result.token}` }, 201);
});

router.openapi(createRoute({ method: 'get', path: '/{membershipId}', tags: ['Team'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => getTeamMember(tx, auth, c.req.valid('param').membershipId))), 200);
});

router.openapi(createRoute({ method: 'put', path: '/{membershipId}/permissions', tags: ['Team'], request: { params, body: body(permissionsSchema) }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  const input = c.req.valid('json');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => setMemberPermissions(tx, auth, c.req.valid('param').membershipId, input))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/{membershipId}/deactivate', tags: ['Team'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => deactivateMember(tx, auth, c.req.valid('param').membershipId))), 200);
});

router.openapi(createRoute({ method: 'post', path: '/{membershipId}/reactivate', tags: ['Team'], request: { params }, responses: { 200: jsonResponse, ...errors } }), async (c) => {
  const auth = c.get('auth');
  return c.json(await guarded(() => withAuthTx(auth, (tx) => reactivateMember(tx, auth, c.req.valid('param').membershipId))), 200);
});
