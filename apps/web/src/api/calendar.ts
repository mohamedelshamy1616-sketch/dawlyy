import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { CalendarEventState, ScheduleEventType } from '@dawlyy/core/types';
import type { ApiEnv } from './env';
import { validationError } from './errors';
import { requireAuthMiddleware, requireStaffRole } from './middleware/auth';
import { idempotentReplay } from './middleware/idempotency';
import { withAuthTx } from '../server/db';
import { trackingErrorHandler } from '../server/tracking/http';
import { actOnCalendarEvent, createCalendarEvent, editCalendarEvent, listCalendar } from '../server/calendar/service';
import { errors, idParams, resultResponse, timezoneSchema } from '../server/tracking/contracts';

/** Task 8: authenticated OpenAPI calendar router, mounted at /calendar. */
export const router = new OpenAPIHono<ApiEnv>({ defaultHook: result => { if (!result.success) throw validationError(result.error.issues); } });
router.onError(trackingErrorHandler);
router.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
router.use('*', requireAuthMiddleware);
router.use('*', requireStaffRole);
router.use('*', idempotentReplay);
const query = z.object({ from: z.iso.datetime({ offset: true }).optional(), to: z.iso.datetime({ offset: true }).optional(), clientId: z.uuid().optional(), type: ScheduleEventType.optional(), state: CalendarEventState.optional(), cursor: z.string().optional(), limit: z.string().optional() });
const title = z.object({ ar: z.string().trim().max(200).optional(), en: z.string().trim().max(200).optional() }).strict();
const createInput = z.object({ clientId: z.uuid(), type: ScheduleEventType, dueAt: z.iso.datetime({ offset: true }), timezone: timezoneSchema, windowDays: z.number().int().min(0).max(365).default(1), title: title.optional() }).strict();
const editInput = z.object({ type: ScheduleEventType.optional(), title: title.optional(), windowDays: z.number().int().min(0).max(365).optional() }).strict().refine(value => Object.keys(value).length > 0, 'Empty patch');
router.openapi(createRoute({ method: 'get', path: '/', request: { query }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => listCalendar(tx, auth, c.req.valid('query'))), 200);
});
router.openapi(createRoute({ method: 'post', path: '/', request: { body: { required: true, content: { 'application/json': { schema: createInput } } } }, responses: { 201: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => createCalendarEvent(tx, auth, c.req.valid('json'))), 201);
});
router.openapi(createRoute({ method: 'patch', path: '/{id}', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: editInput } } } }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => editCalendarEvent(tx, auth, c.req.valid('param').id, c.req.valid('json'))), 200);
});
for (const action of ['skip', 'cancel', 'complete', 'restore'] as const) {
  router.openapi(createRoute({ method: 'post', path: `/{id}/${action}`, request: { params: idParams }, responses: { 200: resultResponse, ...errors } }), async c => {
    const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => actOnCalendarEvent(tx, auth, c.req.valid('param').id, action)), 200);
  });
}
router.openapi(createRoute({ method: 'post', path: '/{id}/reschedule', request: { params: idParams, body: { required: true, content: { 'application/json': { schema: z.object({ dueAt: z.iso.datetime({ offset: true }), timezone: timezoneSchema }).strict() } } } }, responses: { 200: resultResponse, ...errors } }), async c => {
  const auth = c.get('auth'); return c.json(await withAuthTx(auth, tx => actOnCalendarEvent(tx, auth, c.req.valid('param').id, 'reschedule', c.req.valid('json'))), 200);
});
