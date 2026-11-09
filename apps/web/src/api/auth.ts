import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { getSessionUser } from '@/src/server/auth';
import { bootstrapInputSchema, startCoachingBusiness } from '@/src/server/bootstrap';
import { ApiError, unauthorized, validationError } from './errors';
import type { ApiEnv } from './env';

// Task 2: authentication and tenant bootstrap.
/** doc §12.1 / build-plan API: module router mounted by the shared API entry point. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: (result) => {
  if (!result.success) throw validationError(result.error.issues);
} });

const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) });
const route = createRoute({
  method: 'post', path: '/bootstrap',
  request: { body: { required: true, content: { 'application/json': { schema: bootstrapInputSchema } } } },
  responses: {
    201: { description: 'Business and owner created', content: { 'application/json': { schema: z.object({ tenantId: z.uuid(), membershipId: z.uuid() }) } } },
    400: { description: 'Invalid request', content: { 'application/json': { schema: errorSchema } } },
    401: { description: 'No session', content: { 'application/json': { schema: errorSchema } } },
    409: { description: 'Already a member', content: { 'application/json': { schema: errorSchema } } },
  },
});

// Membership auth/replay cannot run before a membership exists. The service serializes identity writers.
router.use('/bootstrap', async (c, next) => {
  if (!await getSessionUser(c.req.raw.headers)) throw unauthorized();
  c.header('Cache-Control', 'no-store');
  await next();
});
router.openapi(route, async (c) => {
  const user = await getSessionUser(c.req.raw.headers);
  if (!user) throw unauthorized();
  try {
    return c.json(await startCoachingBusiness(user.id, c.req.valid('json')), 201);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'internal_error', 'Unable to create the business');
  }
});
