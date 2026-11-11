import type { ErrorHandler } from 'hono';
import type { ApiEnv } from '../../api/env';
import { conflict, forbidden, unprocessable, validationError } from '../../api/errors';
import { billingErrorHandler } from '../subscriptions/http';

/** Task 8: preserve standard errors and map database refusals without exposing health data or SQL details. */
export const trackingErrorHandler: ErrorHandler<ApiEnv> = (error, c) => {
  let cause: unknown = error;
  for (let depth = 0; depth < 5 && typeof cause === 'object' && cause !== null; depth++) {
    if ('code' in cause && typeof cause.code === 'string') {
      const mapped = cause.code === '42501' ? forbidden() : cause.code === '23505' ? conflict() : cause.code === '23503' ? unprocessable('invalid_reference', 'Referenced data is unavailable') : cause.code === '23514' || cause.code === '22P02' ? validationError() : cause.code === 'P0001' ? unprocessable('illegal_transition') : null;
      if (mapped) return c.json(mapped.toBody(), mapped.status);
    }
    cause = 'cause' in cause ? cause.cause : null;
  }
  return billingErrorHandler(error, c);
};
