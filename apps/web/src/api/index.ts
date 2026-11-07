import { swaggerUI } from '@hono/swagger-ui';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { ApiError, validationError, type ApiErrorBody, type ApiErrorStatus } from './errors';
import { requireAuthMiddleware, type AuthVariables } from './middleware/auth';
import { idempotencyMiddleware, type IdempotencyVariables } from './middleware/idempotency';

export type ApiEnv = { Variables: AuthVariables & IdempotencyVariables };

export const app = new OpenAPIHono<ApiEnv>({
  // Request validation failures use the standard error envelope (400).
  defaultHook: (result) => {
    if (!result.success) throw validationError(result.error.issues);
  },
}).basePath('/api/v1');

app.use('*', idempotencyMiddleware);

const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
});

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

const meRoute = createRoute({
  method: 'get',
  path: '/me',
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
    401: { description: 'Not signed in', content: { 'application/json': { schema: errorSchema } } },
  },
});

app.use('/me', requireAuthMiddleware);
app.openapi(meRoute, (c) => {
  const { userId, tenantId, membershipId, role, clientId } = c.get('auth');
  return c.json({ userId, tenantId, membershipId, role, clientId }, 200);
});

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
    console.error('Unhandled API error', err);
    result = envelope(500, 'internal_error', 'Internal server error');
  }
  return c.json(result.body, result.status);
});
