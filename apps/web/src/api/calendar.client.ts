import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { CalendarEventState, ScheduleEventType } from '@dawlyy/core/types';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { listCalendar } from '../server/calendar/client-read';
import { errors, resultResponse } from '../server/tracking/contracts';

/** Task 8: authenticated OpenAPI calendar router, mounted at /calendar. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
const query = z.object({ from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), clientId: z.uuid().optional(), type: ScheduleEventType.optional(), state: CalendarEventState.optional(), cursor: z.string().optional(), limit: z.string().optional() });
router.openapi(createRoute({ middleware: [requireAuthMiddleware, idempotentReplay] as const, method: 'get', path: '/mine', request: { query: query.omit({ clientId: true }) }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listCalendar(tx, auth, c.req.valid('query'), true)), 200);
});
