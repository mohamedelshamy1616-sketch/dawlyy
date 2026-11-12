import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';
import { requireActiveAccess } from './middleware/access';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { getPortalProgram, getToday, requireClient } from '../server/workout/portal';

// Task 5: client portal; preserve the foundation's authenticated caller endpoint.
/** doc §12.1 / build-plan API: client portal router, including the existing GET /me identity endpoint. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => { if (!result.success) throw validationError(result.error.issues); } });

const meRoute = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'The authenticated caller',
      content: {
        'application/json': {
          schema: z.object({
            userId: z.string(),
            tenantId: z.string(),
            membershipId: z.string(),
            role: z.enum(['owner', 'staff', 'client']),
            clientId: z.string().optional(),
          }),
        },
      },
    },
    401: {
      description: 'Not signed in',
      content: {
        'application/json': {
          schema: z.object({
            error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
          }),
        },
      },
    },
  },
});

router.use('/', requireAuthMiddleware);
router.openapi(meRoute, (c) => {
  const { userId, tenantId, membershipId, role, clientId } = c.get('auth');
  return c.json({ userId, tenantId, membershipId, role, clientId }, 200);
});

// Keep the foundation identity endpoint above unchanged. Hono's '/' middleware does not cover these paths.
router.use('/today', requireAuthMiddleware);
router.use('/program', requireAuthMiddleware);
const portalResponse = { description: 'Own client portal data', content: { 'application/json': { schema: z.unknown() } } };
const portalError = { description: 'Standard API error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
router.openapi(createRoute({ method: 'get', path: '/today', request: { query: z.object({ date: z.iso.date().optional() }) },
  responses: { 200: portalResponse, 400: portalError, 401: portalError, 403: portalError, 404: portalError } }), async c => {
  const auth = c.get('auth'); requireClient(auth);
  return c.json(await withAuthTx(auth, tx => getToday(tx, auth, c.req.valid('query').date)), 200);
});
router.openapi(createRoute({ middleware: [requireActiveAccess] as const, method: 'get', path: '/program', responses: { 200: portalResponse, 401: portalError, 403: portalError, 404: portalError } }), async c => {
  const auth = c.get('auth'); requireClient(auth);
  return c.json(await withAuthTx(auth, tx => getPortalProgram(tx, auth)), 200);
});
