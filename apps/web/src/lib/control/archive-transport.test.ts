import { describe, expect, it, vi } from 'vitest';
import { ARCHIVE_ENTITIES, ControlRequestError, archiveAction, archivePath, archivedListUrl, calendarAction, calendarPath, errorKind, hideAction, hidePath, listUrl, newMutation, reversible, sendMutation, type FetchLike } from './archive-transport';

function reply(status: number, body: unknown): ReturnType<FetchLike> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}
const ID = '11111111-1111-4111-8111-111111111111';
const counter = () => { let n = 0; return () => `key-${++n}`; };

describe('archive transport paths', () => {
  it('maps the six entities to their exact archive and restore routes', () => {
    expect(ARCHIVE_ENTITIES).toEqual(['clients', 'programs', 'nutrition', 'forms', 'packages', 'exercises']);
    const expected: Record<string, string> = { clients: 'clients', programs: 'programs', nutrition: 'nutrition', forms: 'forms', packages: 'packages', exercises: 'exercises' };
    for (const entity of ARCHIVE_ENTITIES) {
      expect(archivePath(entity, ID, 'archive')).toBe(`/api/v1/${expected[entity]}/${ID}/archive`);
      expect(archivePath(entity, ID, 'unarchive')).toBe(`/api/v1/${expected[entity]}/${ID}/unarchive`);
    }
  });

  it('builds archived-only list URLs that retain kind and other filters', () => {
    expect(archivedListUrl('clients', { q: 'sara', status: 'active', packageId: 'p1', cursor: 'old' })).toBe('/api/v1/clients?q=sara&packageId=p1&archived=true');
    expect(archivedListUrl('programs', { kind: 'client', clientId: 'c1' })).toBe('/api/v1/programs?kind=client&clientId=c1&archived=true');
    expect(archivedListUrl('programs')).toBe('/api/v1/programs?kind=template&archived=true');
    expect(archivedListUrl('nutrition', { kind: 'client' })).toBe('/api/v1/nutrition?kind=client&archived=true');
    expect(archivedListUrl('forms', { formKind: 'intake' })).toBe('/api/v1/forms?formKind=intake&kind=template&archived=true');
    expect(archivedListUrl('packages')).toBe('/api/v1/packages?archived=true');
    expect(archivedListUrl('exercises', { q: 'squat' })).toBe('/api/v1/exercises?q=squat&archived=true');
    expect(archivedListUrl('packages', {}, 'next')).toBe('/api/v1/packages?archived=true&cursor=next');
  });

  it('uses the R0c boolean strings, never the old packages archived=1 convention', () => {
    expect(listUrl('packages', {}, false)).toBe('/api/v1/packages?archived=false');
    expect(listUrl('packages', { archived: '1' }, true)).toBe('/api/v1/packages?archived=true');
    expect(listUrl('clients', { status: 'active' }, false)).toBe('/api/v1/clients?status=active&archived=false');
  });

  it('keeps hide and unhide for foods and system exercises, and cancel and restore for the calendar', () => {
    expect(hidePath('foods', ID, 'hide')).toBe(`/api/v1/foods/${ID}/hide`);
    expect(hidePath('foods', ID, 'unhide')).toBe(`/api/v1/foods/${ID}/unhide`);
    expect(hidePath('exercises', ID, 'hide')).toBe(`/api/v1/exercises/${ID}/hide`);
    expect(hidePath('exercises', ID, 'unhide')).toBe(`/api/v1/exercises/${ID}/unhide`);
    expect(calendarPath(ID, 'cancel')).toBe(`/api/v1/calendar/${ID}/cancel`);
    expect(calendarPath(ID, 'restore')).toBe(`/api/v1/calendar/${ID}/restore`);
    expect(archiveAction('exercises', ID, false).forward.path).toBe(`/api/v1/exercises/${ID}/archive`);
    expect(hideAction('exercises', ID, false).forward.path).toBe(`/api/v1/exercises/${ID}/hide`);
    expect(hideAction('foods', ID, true).forward.path).toBe(`/api/v1/foods/${ID}/unhide`);
    expect(calendarAction(ID, false).forward.path).toBe(`/api/v1/calendar/${ID}/cancel`);
    expect(calendarAction(ID, true).forward.path).toBe(`/api/v1/calendar/${ID}/restore`);
  });
});

describe('sending a mutation', () => {
  it('posts with no body, no content type and only the idempotency key', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => reply(200, { id: ID }));
    const body = await sendMutation(newMutation(archivePath('clients', ID, 'archive'), () => 'k1'), fetchImpl);
    expect(body).toEqual({ id: ID });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`/api/v1/clients/${ID}/archive`);
    expect(init.method).toBe('POST'); expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({ Accept: 'application/json', 'Idempotency-Key': 'k1' });
  });

  it('surfaces 403, 404 and 422 as errors with their kinds and never as success', async () => {
    const cases: Array<[number, unknown, string]> = [
      [403, { error: { code: 'forbidden', message: 'x' } }, 'forbidden'],
      [404, { error: { code: 'not_found', message: 'x' } }, 'not_found'],
      [422, { error: { code: 'system_exercise_use_hide', message: 'x', details: { path: '/api/v1/exercises/a/hide' } } }, 'system_exercise'],
      [422, { error: { code: 'illegal_transition', message: 'x' } }, 'illegal_transition'],
      [500, { nonsense: true }, 'failed'],
    ];
    for (const [status, body, kind] of cases) {
      const error = await sendMutation(newMutation('/x'), () => reply(status, body)).then(() => null, (cause: unknown) => cause);
      expect(error).toBeInstanceOf(ControlRequestError);
      expect(errorKind(error)).toBe(kind);
      expect((error as ControlRequestError).status).toBe(status);
    }
  });

  it('turns a dropped connection and an unreadable body into typed errors', async () => {
    const offline = await sendMutation(newMutation('/x'), () => Promise.reject(new TypeError('Failed to fetch'))).then(() => null, (cause: unknown) => cause);
    expect(errorKind(offline)).toBe('network');
    const unreadable = await sendMutation(newMutation('/x'), () => Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error('html')) })).then(() => null, (cause: unknown) => cause);
    expect(errorKind(unreadable)).toBe('failed');
    expect(await sendMutation(newMutation('/x'), () => Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error('empty')) }))).toBeNull();
    expect(errorKind(new Error('plain'))).toBe('failed');
  });

  it('preserves the key on a retry of the same request and gives the rollback a different key', async () => {
    const fetchImpl = vi.fn<FetchLike>()
      .mockImplementationOnce(() => reply(500, { error: { code: 'boom' } }))
      .mockImplementation(() => reply(200, { id: ID }));
    const action = archiveAction('programs', ID, false, { fetchImpl, newKey: counter() });
    await expect(action.commit()).rejects.toBeInstanceOf(ControlRequestError);
    await action.commit();
    await action.rollback({ id: ID });
    const keys = fetchImpl.mock.calls.map(([, init]) => (init.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([`/api/v1/programs/${ID}/archive`, `/api/v1/programs/${ID}/archive`, `/api/v1/programs/${ID}/unarchive`]);
  });

  it('resends the same rollback key when Undo is retried', async () => {
    const fetchImpl = vi.fn<FetchLike>()
      .mockImplementationOnce(() => reply(200, {}))
      .mockImplementationOnce(() => reply(503, { error: { code: 'unavailable' } }))
      .mockImplementation(() => reply(200, {}));
    const action = reversible('/a', '/b', { fetchImpl, newKey: counter() });
    await action.commit();
    await expect(action.rollback()).rejects.toBeInstanceOf(ControlRequestError);
    await action.rollback();
    const keys = fetchImpl.mock.calls.map(([, init]) => (init.headers as Record<string, string>)['Idempotency-Key']);
    expect(keys[1]).toBe(keys[2]); expect(keys[0]).not.toBe(keys[1]);
  });

  it('restoring inverts to an archive call', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => reply(200, {}));
    const action = archiveAction('clients', ID, true, { fetchImpl, newKey: counter() });
    await action.commit(); await action.rollback();
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([`/api/v1/clients/${ID}/unarchive`, `/api/v1/clients/${ID}/archive`]);
  });
});