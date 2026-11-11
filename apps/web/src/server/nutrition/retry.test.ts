import { describe, expect, it } from 'vitest';
import { isRetryable } from '../../../components/nutrition/retry-queue';
import { NutritionRequestError } from '../../../components/nutrition/transport';

describe('Task 6 client write retry rule', () => {
  it('retries transport failures and 5xx, never a refusal the server already decided', () => {
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isRetryable(new SyntaxError('Unexpected token < in JSON'))).toBe(true);
    expect(isRetryable(new NutritionRequestError(503, 'request_failed'))).toBe(true);
    for (const status of [400, 403, 409, 422]) expect(isRetryable(new NutritionRequestError(status, 'x'))).toBe(false);
  });
});
