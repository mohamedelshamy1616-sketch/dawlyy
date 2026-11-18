import { describe, expect, it, vi } from 'vitest';
import { CorrectionError, correctionErrorKey, entryVoid, mealCorrection, mealCreate, measurementCorrection, sendMutation } from './transport';
import type { MealWrite, MeasurementWrite } from './types';
const meal: MealWrite = { clientUuid: '11111111-1111-4111-8111-111111111111', localDate: '2026-11-17', status: 'eaten', freeEntry: { text: 'Rice', macros: { kcal: 120, proteinG: 2, carbsG: 25, fatG: 1 } }, clientUpdatedAt: '2026-11-17T12:00:00Z' };
const measurements: MeasurementWrite = { clientUuid: '22222222-2222-4222-8222-222222222222', localDate: '2026-11-17', clientUpdatedAt: '2026-11-17T12:00:00Z', values: [{ type: 'waist', value: 80, unit: 'cm' }, { type: 'arm', side: 'left', value: 35, unit: 'cm' }] };
const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const fail = (code: string, status: number) => ok({ error: { code, message: 'Private ownership or window detail', details: { secret: true } } }, status);
describe('stable correction transport', () => {
  it.each([
    [mealCreate(meal, 'create-key'), '/api/v1/meal-logs', meal],
    [mealCorrection('old-meal', meal, 'correct-key'), '/api/v1/meal-logs/old-meal/correct', meal],
    [measurementCorrection('old-set', measurements, 'measure-key'), '/api/v1/measurements/old-set/correct', measurements],
    [entryVoid('meal', 'm', undefined, 'void-key'), '/api/v1/meal-logs/m/void', {}],
    [entryVoid('measurement', 's', 'Duplicate', 'void-key'), '/api/v1/measurements/s/void', { reason: 'Duplicate' }],
    [entryVoid('metric', 'w', undefined, 'void-key'), '/api/v1/metrics/w/void', {}],
    [entryVoid('workout', 'j', undefined, 'void-key'), '/api/v1/workout-sessions/j/void', {}],
  ] as const)('sends exactly the intended POST to %s', async (operation, path, body) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok({ id: 'new' }, 201));
    expect(await sendMutation(operation, { fetch: fetcher })).toEqual({ id: 'new' });
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe(path); expect(options?.method).toBe('POST'); expect(options?.credentials).toBe('same-origin');
    expect(JSON.parse(String(options?.body))).toEqual(body);
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json', 'Idempotency-Key': operation.idempotencyKey });
  });
  it('retains replacement UUID, key, timestamp and serialized body across uncertain retry', async () => {
    const edited = structuredClone(meal); const operation = mealCorrection('original', edited, 'same-key');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Lost response')).mockResolvedValueOnce(ok({ id: 'new', replacesId: 'original' }, 201));
    await expect(sendMutation(operation, { fetch: fetcher })).rejects.toMatchObject({ code: 'network_error', retryable: true });
    edited.freeEntry!.text = 'Not this intended request'; await sendMutation(operation, { fetch: fetcher });
    expect(fetcher.mock.calls[1]?.[1]).toEqual(fetcher.mock.calls[0]?.[1]);
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual(meal);
    expect(operation.body.clientUuid).toBe(meal.clientUuid);
    for (const field of ['replacesId', 'clientId', 'foodId']) expect(operation.body).not.toHaveProperty(field);
  });
  it.each(['already_voided', 'already_corrected'])('refreshes history on %s without retry', async code => {
    let refreshes = 0; const fetcher = vi.fn<typeof fetch>().mockResolvedValue(fail(code, 409));
    await expect(sendMutation(entryVoid('meal', 'm', undefined, 'k'), { fetch: fetcher, onRefresh: () => { refreshes++; } })).rejects.toMatchObject({ code, status: 409, retryable: false });
    expect(refreshes).toBe(1); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('uses generic refusal for foreign, missing, denied and expired originals', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(fail('void_not_allowed', 403));
    const error = await sendMutation(mealCorrection('missing-or-foreign', meal, 'k'), { fetch: fetcher }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(CorrectionError); expect(error).toMatchObject({ code: 'void_not_allowed', status: 403, retryable: false });
    expect(correctionErrorKey(error)).toBe('refusal'); expect(String(error)).not.toContain('Private');
    expect(correctionErrorKey(new CorrectionError('forbidden', 403))).toBe('refusal');
  });
  it('refreshes me/app and route after module_disabled without mutation retry', async () => {
    const app = { clientModules: { nutrition: false } }; let received: unknown; let refreshes = 0;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(fail('module_disabled', 403)).mockResolvedValueOnce(ok(app));
    await expect(sendMutation(mealCreate(meal, 'k'), { fetch: fetcher, onModuleDisabled: value => { received = value; }, onRefresh: () => { refreshes++; } })).rejects.toMatchObject({ code: 'module_disabled' });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/v1/meal-logs', '/api/v1/me/app']);
    expect(received).toEqual(app); expect(refreshes).toBe(1); expect(correctionErrorKey(new CorrectionError('module_disabled', 403))).toBe('moduleDisabled');
  });
  it('keeps module refusal when refreshing app context fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(fail('module_disabled', 403)).mockRejectedValueOnce(new TypeError('Offline')); let refreshes = 0;
    await expect(sendMutation(mealCreate(meal, 'k'), { fetch: fetcher, onRefresh: () => { refreshes++; } })).rejects.toMatchObject({ code: 'module_disabled' });
    expect(refreshes).toBe(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['network', 'http', 'malformed'] as const)('still notifies disabled modules once after a %s bootstrap failure', async failure => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(fail('module_disabled', 403));
    if (failure === 'network') fetcher.mockRejectedValueOnce(new TypeError('Offline'));
    else if (failure === 'http') fetcher.mockResolvedValueOnce(ok({ error: { code: 'unavailable' } }, 503));
    else fetcher.mockResolvedValueOnce(new Response('broken JSON', { status: 200 }));
    const notifications: unknown[] = []; let refreshes = 0;
    await expect(sendMutation(mealCreate(meal, 'k'), { fetch: fetcher, onModuleDisabled: app => { notifications.push(app); }, onRefresh: () => { refreshes++; } })).rejects.toMatchObject({ code: 'module_disabled', status: 403 });
    expect(notifications).toEqual([undefined]); expect(refreshes).toBe(1);
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['/api/v1/meal-logs', '/api/v1/me/app']);
    expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
  });
  it('preserves the module refusal and route refresh when the disabled callback throws', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(fail('module_disabled', 403)).mockRejectedValueOnce(new TypeError('Offline'));
    let notifications = 0; let refreshes = 0;
    await expect(sendMutation(mealCreate(meal, 'k'), { fetch: fetcher, onModuleDisabled: () => { notifications++; throw new Error('Callback failed'); }, onRefresh: () => { refreshes++; } })).rejects.toMatchObject({ code: 'module_disabled', status: 403 });
    expect(notifications).toBe(1); expect(refreshes).toBe(1); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([['meal_unknown', 422, 'mealUnknown'], ['not_found', 404, 'failed'], ['invalid_input', 422, 'failed']] as const)('maps %s without server detail', async (code, status, key) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(fail(code, status));
    const error = await sendMutation(mealCreate(meal, 'k'), { fetch: fetcher }).catch((value: unknown) => value);
    expect(correctionErrorKey(error)).toBe(key); expect(String(error)).not.toContain('Private');
  });
  it('bounds reasons and encodes route identifiers', () => {
    expect(() => entryVoid('meal', 'm', 'x'.repeat(501), 'k')).toThrow('invalid_reason');
    expect(entryVoid('meal', 'm', 'x'.repeat(500), 'k').body).toEqual({ reason: 'x'.repeat(500) });
    expect(entryVoid('metric', 'a/b', undefined, 'k').path).toBe('/api/v1/metrics/a%2Fb/void');
  });
});

// A disconnected correction never queues a request that could cross the seven-day limit.
describe('connectivity and uncertain responses', () => {
  it('refuses disconnected writes before touching the transport', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const fetcher = vi.fn<typeof fetch>();
    try {
      await expect(sendMutation(entryVoid('workout', 'id', undefined, 'key'), { fetch: fetcher })).rejects.toMatchObject({ code: 'offline', retryable: true });
      expect(fetcher).not.toHaveBeenCalled();
      expect(correctionErrorKey(new CorrectionError('offline', 0))).toBe('offline');
    } finally { vi.unstubAllGlobals(); }
  });
  it('treats an undecodable success as uncertain and retains operation identity', async () => {
    const operation = mealCorrection('old', meal, 'original-key');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('broken', { status: 201 })).mockResolvedValueOnce(ok({ id: 'same-row' }, 201));
    await expect(sendMutation(operation, { fetch: fetcher })).rejects.toMatchObject({ code: 'invalid_response', retryable: true });
    await sendMutation(operation, { fetch: fetcher });
    expect(fetcher.mock.calls[1]?.[1]).toEqual(fetcher.mock.calls[0]?.[1]);
  });
});
