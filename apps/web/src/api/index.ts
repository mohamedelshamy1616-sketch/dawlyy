import { swaggerUI } from '@hono/swagger-ui';
import { randomUUID } from 'node:crypto';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { ApiError, validationError, type ApiErrorBody, type ApiErrorStatus } from './errors';
import type { ApiEnv } from './env';
import { safeErrorMetadata } from './error-log';
import { idempotencyMiddleware } from './middleware/idempotency';
import { requireSameOrigin } from './middleware/origin';
import { router as authRouter } from './auth';
import { router as invitationsClientRouter } from './invitations.client';
import { router as invitationsRouter } from './invitations';
import { router as clientsRouter } from './clients';
import { router as packagesRouter } from './packages';
import { router as subscriptionsClientRouter } from './subscriptions.client';
import { router as subscriptionsRouter } from './subscriptions';
import { router as paymentsClientRouter } from './payments.client';
import { router as paymentsRouter } from './payments';
import { router as exercisesRouter } from './exercises';
import { router as programsRouter } from './programs';
import { router as meRouter } from './me';
import { router as workoutSessionsRouter } from './workout-sessions';
import { router as nutritionClientRouter } from './nutrition.client';
import { router as nutritionRouter } from './nutrition';
import { router as foodsClientRouter } from './foods.client';
import { router as foodsRouter } from './foods';
import { router as mealLogsRouter } from './meal-logs';
import { router as formsClientRouter } from './forms.client';
import { router as formsRouter } from './forms';
import { router as submissionsClientRouter } from './submissions.client';
import { router as submissionsRouter } from './submissions';
import { router as calendarClientRouter } from './calendar.client';
import { router as calendarRouter } from './calendar';
import { router as metricsClientRouter } from './metrics.client';
import { router as metricsRouter } from './metrics';
import { router as measurementsRouter } from './measurements';
import { router as photosRouter } from './photos';
import { router as conversationsRouter } from './conversations';
import { router as notificationsRouter } from './notifications';
import { router as dashboardRouter } from './dashboard';
import { router as tasksRouter } from './tasks';
import { router as settingsClientRouter } from './settings.client';
import { router as settingsRouter } from './settings';
import { router as teamRouter } from './team';
import { router as mediaRouter } from './media';

/** doc §12.1 / build-plan API: preserve the shared environment type's original import location. */
export type { ApiEnv } from './env';

/** doc §12.1 / build-plan API: versioned API with module routers, OpenAPI, and standard error envelopes. */
export const app = new OpenAPIHono<ApiEnv>({
  // Request validation failures use the standard error envelope (400).
  defaultHook: (result) => {
    if (!result.success) throw validationError(result.error.issues);
  },
}).basePath('/api/v1');

app.use('*', async (c, next) => {
  const requestId = randomUUID();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
});
app.use('*', requireSameOrigin);
app.use('*', idempotencyMiddleware);

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      description: 'Service is up',
      content: { 'application/json': { schema: z.object({ ok: z.literal(true), time: z.string() }) } },
    },
  },
});

app.openapi(healthRoute, (c) => c.json({ ok: true as const, time: new Date().toISOString() }, 200));

app.route('/auth', authRouter);
app.route('/invitations', invitationsClientRouter);
app.route('/invitations', invitationsRouter);
app.route('/clients', clientsRouter);
app.route('/packages', packagesRouter);
app.route('/subscriptions', subscriptionsClientRouter);
app.route('/subscriptions', subscriptionsRouter);
app.route('/payments', paymentsClientRouter);
app.route('/payments', paymentsRouter);
app.route('/exercises', exercisesRouter);
app.route('/programs', programsRouter);
app.route('/me', meRouter);
app.route('/workout-sessions', workoutSessionsRouter);
app.route('/nutrition', nutritionClientRouter);
app.route('/nutrition', nutritionRouter);
app.route('/foods', foodsClientRouter);
app.route('/foods', foodsRouter);
app.route('/meal-logs', mealLogsRouter);
app.route('/forms', formsClientRouter);
app.route('/forms', formsRouter);
app.route('/submissions', submissionsClientRouter);
app.route('/submissions', submissionsRouter);
app.route('/calendar', calendarClientRouter);
app.route('/calendar', calendarRouter);
app.route('/metrics', metricsClientRouter);
app.route('/metrics', metricsRouter);
app.route('/measurements', measurementsRouter);
app.route('/photos', photosRouter);
app.route('/conversations', conversationsRouter);
app.route('/notifications', notificationsRouter);
app.route('/dashboard', dashboardRouter);
app.route('/tasks', tasksRouter);
app.route('/settings', settingsClientRouter);
app.route('/settings', settingsRouter);
app.route('/team', teamRouter);
app.route('/media', mediaRouter);

app.doc('/openapi.json', { openapi: '3.1.0', info: { title: 'DAWLYY API', version: '1' } });
app.get('/docs', swaggerUI({ url: '/api/v1/openapi.json' }));

function envelope(status: ApiErrorStatus, code: string, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return { status, body };
}

app.notFound((c) => {
  const { status, body } = envelope(404, 'not_found', `No route for ${c.req.method} ${c.req.path}`);
  return c.json(body, status);
});

app.onError((err, c) => {
  let result: ReturnType<typeof envelope>;
  if (err instanceof ApiError) {
    result = envelope(err.status, err.code, err.message, err.details);
  } else if (err instanceof ZodError) {
    result = envelope(400, 'validation_error', 'Request validation failed', err.issues);
  } else if (err instanceof HTTPException) {
    const map: Record<number, [ApiErrorStatus, string]> = {
      400: [400, 'validation_error'],
      401: [401, 'unauthenticated'],
      403: [403, 'forbidden'],
      404: [404, 'not_found'],
      409: [409, 'conflict'],
      422: [422, 'unprocessable'],
    };
    const [status, code] = map[err.status] ?? [500, 'internal_error'];
    result = envelope(status, code, err.message || 'Request failed');
  } else {
    console.error('Unhandled API error', safeErrorMetadata(err, c.get('requestId') ?? randomUUID(), c.req.routePath, 500));
    result = envelope(500, 'internal_error', 'Internal server error');
  }
  return c.json(result.body, result.status);
});
