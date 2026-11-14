import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { ApiEnv } from './env';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { validationError } from './errors';
import { withAuthTx } from '../server/db';
import { listInbox } from '../server/inbox/service';

/** R1b / C15: fail-closed staff-only coach inbox; service checks clients/view before any read. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
const error = { description: 'Standard error', content: { 'application/json': { schema: z.object({ error: z.object({ code: z.string(), message: z.string() }) }) } } };
router.openapi(createRoute({
  method: 'get', path: '/',
  request: { query: z.object({ limit: z.string().regex(/^[1-9]\d*$/).refine(value => Number(value) <= 200).optional() }) },
  responses: {
    200: { description: 'Ranked accessible active clients', content: { 'application/json': { schema: z.object({
      today: z.iso.date(), items: z.array(z.object({
        client: z.object({ id: z.uuid(), displayName: z.string(), code: z.string(), avatarMediaId: z.uuid().optional() }),
        score: z.number(), reasons: z.array(z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])) })),
        primaryAction: z.enum(['review', 'reply', 'nudge', 'confirm_payment', 'renew', 'handle_flag']), actionHref: z.string().nullable(),
      })),
    }) } } }, 400: error, 401: error, 403: error,
  },
}), async c => {
  const auth = c.get('auth');
  return c.json(await withAuthTx(auth, tx => listInbox(tx, auth, c.req.valid('query').limit === undefined ? 50 : Number(c.req.valid('query').limit))), 200);
});
