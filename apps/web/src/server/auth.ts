import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { withUserTx, type AuthContext } from '@dawlyy/db';
import { memberships } from '@dawlyy/db/schema';
import { unauthorized } from '@/src/api/errors';
import { createSupabaseServerClient } from './supabase';

/**
 * Resolve the caller from the Supabase session (cookie) or an `Authorization: Bearer` access token,
 * then load their active membership under RLS. Returns null when there is no session or no active membership.
 * Tokens never leave this function.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createSupabaseServerClient();

  const authorization = (await headers()).get('authorization');
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const { data, error } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  const user = data.user;
  if (error || !user) return null;

  const [membership] = await withUserTx(user.id, (tx) =>
    tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, 'active')))
      .orderBy(asc(memberships.createdAt))
      .limit(1),
  );
  if (!membership) return null;

  return {
    userId: user.id,
    tenantId: membership.tenantId,
    membershipId: membership.id,
    role: membership.role,
    clientId: membership.clientId ?? undefined,
  };
}

/** For API handlers and server code: the AuthContext, or an ApiError 401. */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) throw unauthorized();
  return ctx;
}

/** For Server Components: the AuthContext, or a redirect to the localized login page. */
export async function requirePage(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (ctx) return ctx;
  // Loaded on demand so API-only code paths (and their tests) do not pull in next-intl's React navigation.
  const [{ getLocale }, { redirect }] = await Promise.all([import('next-intl/server'), import('@/i18n/navigation')]);
  redirect({ href: '/login', locale: await getLocale() });
  throw new Error('unreachable: redirect() throws'); // redirect() is typed void by next-intl
}
