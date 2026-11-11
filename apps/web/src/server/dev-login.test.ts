import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { devLoginEnabled, isUnattachedIdentity, listDemoUsers, readDevSession, signDevSession } from './dev-login';
import { withServiceTx } from '@dawlyy/db';
import { getSessionUser } from './auth';
import { createSupabaseServerClient } from './supabase';

vi.mock('@dawlyy/db', () => ({ withServiceTx: vi.fn(), withUserTx: vi.fn() }));
vi.mock('./supabase', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
  })),
}));

const userId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-11-09T12:00:00Z');

describe('development sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DAWLYY_DEV_LOGIN', '1');
    vi.stubEnv('DAWLYY_DEV_LOGIN_SECRET', 'a'.repeat(32));
  });
  afterEach(() => vi.unstubAllEnvs());

  it('round trips a signed session for twelve hours', () => {
    const cookie = signDevSession(userId, now);
    expect(cookie).toMatch(/^[\da-f-]+\.\d+\.[\da-f]{64}$/);
    expect(readDevSession(cookie, now)).toBe(userId);
    expect(readDevSession(cookie, new Date(now.getTime() + 43_199_000))).toBe(userId);
    expect(readDevSession(cookie, new Date(now.getTime() + 43_200_000))).toBeNull();
  });

  it('rejects a tampered signature or identity', () => {
    const cookie = signDevSession(userId, now)!;
    const replacement = cookie.endsWith('0') ? '1' : '0';
    expect(readDevSession(cookie.slice(0, -1) + replacement, now)).toBeNull();
    expect(readDevSession(cookie.replace(userId, '22222222-2222-4222-8222-222222222222'), now)).toBeNull();
  });

  it('rejects an expired session', () => {
    const cookie = signDevSession(userId, new Date(now.getTime() - 43_201_000));
    expect(readDevSession(cookie, now)).toBeNull();
  });

  it('rejects a session signed with another secret', () => {
    const cookie = signDevSession(userId, now);
    vi.stubEnv('DAWLYY_DEV_LOGIN_SECRET', 'b'.repeat(32));
    expect(readDevSession(cookie, now)).toBeNull();
  });

  it('never returns a production session even with a valid cookie and flag', async () => {
    const cookie = signDevSession(userId, now);
    vi.stubEnv('NODE_ENV', 'production');
    expect(devLoginEnabled()).toBe(false);
    expect(signDevSession(userId, now)).toBeNull();
    expect(readDevSession(cookie, now)).toBeNull();
    expect(await listDemoUsers()).toEqual([]);
  });

  it('resolves a development identity without calling Supabase', async () => {
    const cookie = signDevSession(userId);
    expect(await getSessionUser(new Headers({ cookie: `dawlyy_dev_session=${cookie}` }))).toEqual({
      id: userId, email: null,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('ignores a valid development cookie in production and uses Supabase', async () => {
    const cookie = signDevSession(userId);
    vi.stubEnv('NODE_ENV', 'production');
    expect(await getSessionUser(new Headers({ cookie: `dawlyy_dev_session=${cookie}` }))).toBeNull();
    expect(createSupabaseServerClient).toHaveBeenCalledOnce();
  });

  it('does not call Supabase without its keys when development login is enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', undefined);
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', undefined);
    expect(await getSessionUser(new Headers())).toBeNull();
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it.each(['', '0', 'true'])('requires the exact flag, got %s', (flag) => {
    vi.stubEnv('DAWLYY_DEV_LOGIN', flag);
    expect(devLoginEnabled()).toBe(false);
    expect(signDevSession(userId, now)).toBeNull();
  });

  it('requires a secret of at least 32 characters', async () => {
    vi.stubEnv('DAWLYY_DEV_LOGIN_SECRET', 'a'.repeat(31));
    expect(devLoginEnabled()).toBe(false);
    expect(readDevSession(signDevSession(userId, now), now)).toBeNull();
    expect(await listDemoUsers()).toEqual([]);
  });

  it.each([null, undefined, '', 'bad', `${userId}.NaN.abc`, `${userId}.1.00`, `${userId}.1.${'g'.repeat(64)}`])(
    'rejects malformed input %s', (value) => expect(readDevSession(value, now)).toBeNull(),
  );

  it('rejects malformed identities and clocks when signing', () => {
    expect(signDevSession('bad', now)).toBeNull();
    expect(signDevSession(userId, new Date(NaN))).toBeNull();
  });

  it('accepts a membership-free identity for invitation tests, and nothing else', async () => {
    vi.mocked(withServiceTx).mockResolvedValueOnce([]);
    expect(await isUnattachedIdentity(userId)).toBe(true);
    vi.mocked(withServiceTx).mockResolvedValueOnce([{ id: 'membership-1' }]);
    expect(await isUnattachedIdentity(userId)).toBe(false);
    expect(await isUnattachedIdentity('not-a-uuid')).toBe(false);
    vi.stubEnv('NODE_ENV', 'production');
    expect(await isUnattachedIdentity(userId)).toBe(false);
    expect(withServiceTx).toHaveBeenCalledTimes(2);
  });
});
