import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from '@hono/zod-openapi';
import type { ApiEnv } from '../../api/env';
import { ApiError, validationError } from '../../api/errors';

/** T3b: normalise Hono's media-type rejection to the build plan's 400 validation envelope. */
export const billingErrorHandler: ErrorHandler<ApiEnv> = (error, c) => {
  if (error instanceof ApiError) return c.json(error.toBody(), error.status);
  if (error instanceof z.ZodError) return c.json(validationError(error.issues).toBody(), 400);
  if (error instanceof HTTPException) {
    if (error.status === 400 || error.status === 415) return c.json(validationError().toBody(), 400);
    const mapped = { 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'unprocessable' } as const;
    const status = error.status;
    if (status === 401 || status === 403 || status === 404 || status === 409 || status === 422)
      return c.json(new ApiError(status, mapped[status], error.message).toBody(), status);
  }
  return c.json(new ApiError(500, 'internal_error', 'Internal server error').toBody(), 500);
};
