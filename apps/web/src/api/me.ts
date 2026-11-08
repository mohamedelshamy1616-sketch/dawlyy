import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware } from './middleware/auth';

// Task 5: client portal; preserve the foundation's authenticated caller endpoint.
/** doc §12.1 / build-plan API: client portal router, including the existing GET /me identity endpoint. */
export const router = new OpenAPIHono<ApiEnv>();

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
