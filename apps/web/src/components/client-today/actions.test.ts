import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CLIENT_MODULES } from '@dawlyy/core/types';
import { NutritionRequestError, nutritionRequest } from '@/components/nutrition/transport';
import { applyMealResult, createMealLogger } from '@/components/client-today/today-actions';
import { fetchClientBootstrap } from '@/components/client-today/client-module-provider';
import type { TodayLog } from '@/components/client-today/types';

vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/app/today', useRouter: () => ({ refresh: () => {} }) }));

const NOW = new Date('2026-11-14T09:30:00.000Z');
const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; };
type Request = typeof nutritionRequest;
const logger = (request: Request, uuid = ids()) => createMealLogger({ localDate: '2026-11-14', request, uuid, now: () => NOW });
const row = { id: 'r1', mealId: 'm1', optionId: 'o1', status: 'eaten', voidedAt: null, clientUuid: 'x' };

afterEach(() => { vi.unstubAllGlobals(); });

describe('createMealLogger payload', () => {
  it('sends the planned-meal subset as eaten with a key equal to the action UUID', async () => {
    const request = vi.fn().mockResolvedValue(row);
    const result = await logger(request as unknown as Request).log('m1', 'o1');
    expect(request).toHaveBeenCalledTimes(1);
    const [path, options] = request.mock.calls[0]!;
    expect(path).toBe('/api/v1/meal-logs');
    expect(options.method).toBe('POST');
    expect(options.body).toEqual({
      clientUuid: '00000000-0000-4000-8000-000000000001', localDate: '2026-11-14', mealId: 'm1', optionId: 'o1',
      status: 'eaten', clientUpdatedAt: '2026-11-14T09:30:00.000Z',
    });
    expect(options.key).toBe(options.body.clientUuid);
    expect(Object.keys(options.body)).not.toEqual(expect.arrayContaining(['tenantId', 'clientId', 'id', 'planVersionId']));
    expect(result).toEqual({ ok: true, log: { mealId: 'm1', optionId: 'o1', status: 'eaten', voidedAt: null } });
  });

  it('sends the real headers and strict body through the existing transport', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(row), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await logger(nutritionRequest).log('m1', 'o2');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('/api/v1/meal-logs');
    expect((init.headers as Headers).get('Idempotency-Key')).toBe('00000000-0000-4000-8000-000000000001');
    expect(JSON.parse(init.body as string)).toMatchObject({ mealId: 'm1', optionId: 'o2', status: 'eaten' });
  });
});

describe('createMealLogger repeat safety', () => {
  it('shares one request between a double submit', async () => {
    let release: (value: unknown) => void = () => {};
    const request = vi.fn().mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const log = logger(request as unknown as Request);
    const first = log.log('m1', 'o1');
    const second = log.log('m1', 'o1');
    release(row);
    expect(await first).toEqual(await second);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reuses the same UUID, body and key when retrying after a failure, then starts fresh after success', async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new NutritionRequestError(500, 'request_failed'))
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(row);
    const log = logger(request as unknown as Request);
    expect(await log.log('m1', 'o1')).toEqual({ ok: false, reason: 'failed' });
    expect(await log.log('m1', 'o1')).toEqual({ ok: false, reason: 'failed' });
    expect((await log.log('m1', 'o1')).ok).toBe(true);
    const sent = request.mock.calls.map(call => call[1]);
    expect(new Set(sent.slice(0, 3).map(options => options.key)).size).toBe(1);
    expect(sent[0]!.body).toEqual(sent[2]!.body);
    await log.log('m1', 'o1');
    expect(request.mock.calls[3]![1].key).not.toBe(sent[0]!.key);
  });

  it('uses a different UUID for a different meal', async () => {
    const request = vi.fn().mockResolvedValue(row);
    const log = logger(request as unknown as Request);
    await log.log('m1', 'o1');
    await log.log('m2', 'p1');
    expect(request.mock.calls[0]![1].key).not.toBe(request.mock.calls[1]![1].key);
  });
});

describe('failed writes and module refusals', () => {
  it('reports a failed write without producing a log, so the screen keeps its prior state', async () => {
    const request = vi.fn().mockRejectedValue(new NutritionRequestError(422, 'meal_unknown'));
    const result = await logger(request as unknown as Request).log('m1', 'o1');
    expect(result).toEqual({ ok: false, reason: 'failed' });
    const logged: TodayLog[] = [];
    applyMealResult(result, { onLogged: log => logged.push(log), onModuleDisabled: () => { throw new Error('unexpected'); }, onFailed: () => {} });
    expect(logged).toEqual([]);
  });

  it('turns 403 module_disabled into a refresh request and never retries the rejected write', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'module_disabled', message: 'off' } }), { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    const result = await logger(nutritionRequest).log('m1', 'o1');
    expect(result).toEqual({ ok: false, reason: 'module_disabled' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const calls = { logged: 0, disabled: 0, failed: 0 };
    applyMealResult(result, { onLogged: () => { calls.logged += 1; }, onModuleDisabled: () => { calls.disabled += 1; }, onFailed: () => { calls.failed += 1; } });
    expect(calls).toEqual({ logged: 0, disabled: 1, failed: 0 });
  });

  it('treats other 403 codes as an ordinary failure', async () => {
    const request = vi.fn().mockRejectedValue(new NutritionRequestError(403, 'forbidden'));
    expect(await logger(request as unknown as Request).log('m1', 'o1')).toEqual({ ok: false, reason: 'failed' });
  });

  it('hands a successful write to the screen', () => {
    const logged: TodayLog[] = [];
    applyMealResult({ ok: true, log: { mealId: 'm1', optionId: 'o1', status: 'eaten', voidedAt: null } }, { onLogged: log => logged.push(log), onModuleDisabled: () => {}, onFailed: () => {} });
    expect(logged).toHaveLength(1);
  });
});

describe('fetchClientBootstrap', () => {
  const answer = (body: unknown, status = 200) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('reads the validated modules and numerals from /api/v1/me/app without caching', async () => {
    const fetcher = answer({ preferences: {}, numerals: 'arab', clientModules: { ...DEFAULT_CLIENT_MODULES, workouts: false } });
    expect(await fetchClientBootstrap(fetcher as unknown as typeof fetch)).toEqual({ modules: { ...DEFAULT_CLIENT_MODULES, workouts: false }, numerals: 'arab' });
    expect(fetcher.mock.calls[0]![0]).toBe('/api/v1/me/app');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', credentials: 'same-origin' });
  });

  it.each([
    ['a missing clientModules', { numerals: 'latn' }],
    ['a partial clientModules', { numerals: 'latn', clientModules: { workouts: true } }],
    ['an unknown key', { numerals: 'latn', clientModules: { ...DEFAULT_CLIENT_MODULES, extra: true } }],
    ['a non-object body', 'oops'],
  ])('is a failure, never all-on, for %s', async (_name, body) => {
    expect(await fetchClientBootstrap(answer(body) as unknown as typeof fetch)).toBeNull();
  });

  it('is a failure for an error status and for a transport error', async () => {
    expect(await fetchClientBootstrap(answer({ error: { code: 'unauthorized' } }, 401) as unknown as typeof fetch)).toBeNull();
    expect(await fetchClientBootstrap(vi.fn().mockRejectedValue(new TypeError('offline')) as unknown as typeof fetch)).toBeNull();
  });

  it('defaults numerals to Western digits', async () => {
    const fetcher = answer({ numerals: 'weird', clientModules: DEFAULT_CLIENT_MODULES });
    expect((await fetchClientBootstrap(fetcher as unknown as typeof fetch))?.numerals).toBe('latn');
  });
});