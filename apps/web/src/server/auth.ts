import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { headers as nextHeaders } from 'next/headers';
import { connection } from 'next/server';
import { clientColumns, withUserTx, type AuthContext } from '@dawlyy/db';
import { memberships } from '@dawlyy/db/schema';
import { unauthorized } from '@/src/api/errors';
import { createSupabaseServerClient } from './supabase';

/**
 * Resolve the caller from a development session, Supabase cookie or `Authorization: Bearer` access token,
 * then load their active membership under RLS. Returns null when there is no session or no active membership.
 * doc §14: staff API permissions come from that same membership; owners and clients carry null.
 * Tokens never leave this function.
 */
export async function getAuthContext(headers?: Headers): Promise<AuthContext | null> {
  const user = await getSessionUser(headers);
  if (!user) return null;

  return membershipForUser(user.id);
}

/** doc §14 / P2B local testing: resolve a session identity before membership discovery; production uses Supabase only. */
export async function getSessionUser(headers?: Headers): Promise<{ id: string; email: string | null } | null> {
  // Server Components: mark the render as request-time before reading the clock in readDevSession (cacheComponents
  // rejects `new Date()` during prerender). API handlers pass their own headers and are always dynamic.
  if (!headers) await connection();
  const requestHeaders = headers ?? await nextHeaders();
  if (process.env.NODE_ENV !== 'production') {
    const dev = await import('./dev-login');
    if (dev.devLoginEnabled()) {
      const cookie = requestHeaders.get('cookie')?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${dev.DEV_SESSION_COOKIE}=`))
        ?.slice(dev.DEV_SESSION_COOKIE.length + 1);
      const id = dev.readDevSession(cookie);
      if (id && dev.devLoginEnabled()) return { id, email: null };
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
    }
  }

  const authorization = requestHeaders.get('authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = await createSupabaseServerClient();
  const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  const user = data.user;
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? null };
}

async function membershipForUser(userId: string): Promise<AuthContext | null> {
  const [membership] = await withUserTx(userId, (tx) =>
    tx
      .select(clientColumns.memberships)
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
      .orderBy(asc(memberships.createdAt))
      .limit(1),
  );
  if (!membership) return null;

  return {
    userId,
    tenantId: membership.tenantId,
    membershipId: membership.id,
    role: membership.role,
    permissions: membership.role === 'staff' ? membership.permissions : null,
    clientId: membership.clientId ?? undefined,
  };
}

/** doc §14: for API handlers and server code, the AuthContext or an ApiError 401. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorized();
  return ctx;
}

/** doc §14 / P2B local testing: redirect signed-out callers to login and unassigned users to onboarding. */
export async function requirePage(): Promise<AuthContext> {
  const user = await getSessionUser();
  const ctx = user ? await membershipForUser(user.id) : null;
  if (ctx) return ctx;
  // Loaded on demand so API-only code paths (and their tests) do not pull in next-intl's React navigation.
  const [{ getLocale }, { redirect }] = await Promise.all([import('next-intl/server'), import('@/i18n/navigation')]);
  redirect({ href: user ? '/onboarding' : '/login', locale: await getLocale() });
  throw new Error('unreachable: redirect() throws'); // redirect() is typed void by next-intl
}
