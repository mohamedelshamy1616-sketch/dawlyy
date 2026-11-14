import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { historyError } from './history-controls';

describe('R0c database history refusals', () => {
  it.each([
    ['42501', false, 403, 'void_not_allowed'],
    ['42501', true, 403, 'void_not_allowed'],
    ['P0001', false, 409, 'already_voided'],
    ['P0001', true, 409, 'already_corrected'],
    ['23505', true, 409, 'already_corrected'],
    ['23503', true, 404, 'not_found'],
  ] as const)('maps wrapped SQLSTATE %s (correction=%s) without exposing details', (code, correcting, status, apiCode) => {
    const mapped = historyError({ cause: { code, detail: 'private database detail' } }, correcting);
    expect(mapped).toBeInstanceOf(ApiError);
    expect(mapped).toMatchObject({ status, code: apiCode });
    expect((mapped as ApiError).toBody()).not.toHaveProperty('error.details');
  });

  it('preserves module gates and unexpected database errors', () => {
    const disabled = new ApiError(403, 'module_disabled', 'Disabled');
    const unexpected = { cause: { code: '08006' } };
    expect(historyError(disabled, true)).toBe(disabled);
    expect(historyError(unexpected)).toBe(unexpected);
  });
});
