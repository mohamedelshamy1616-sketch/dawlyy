import { NextResponse } from 'next/server';
import { isLocale } from '@/i18n/routing';

/** doc §14 / P2B local testing: issue a development cookie only for a listed demo identity. */
export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 });
  const dev = await import('@/src/server/dev-login');
  if (!dev.devLoginEnabled()) return new Response(null, { status: 404 });

  let userId: unknown;
  let locale: unknown;
  try {
    if (request.headers.get('content-type')?.split(';')[0]?.trim() === 'application/json') {
      const body: unknown = await request.json();
      if (!body || typeof body !== 'object' || Array.isArray(body)) return new Response(null, { status: 400 });
      ({ userId, locale } = body as Record<string, unknown>);
    } else {
      const body = await request.formData();
      userId = body.get('userId');
      locale = body.get('locale');
    }
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof userId !== 'string' || typeof locale !== 'string' || !isLocale(locale)) {
    return new Response(null, { status: 400 });
  }

  const user = (await dev.listDemoUsers()).find((candidate) => candidate.userId === userId);
  // An identity with no membership anywhere is allowed so the invitation flow can be tested; it lands on the root page.
  const unattached = user ? false : await dev.isUnattachedIdentity(userId);
  if (!user && !unattached) return new Response(null, { status: 403 });
  const session = dev.signDevSession(user ? user.userId : userId);
  if (!session) return new Response(null, { status: 404 });

  const destination = !user ? '' : user.role === 'client' ? '/app/today' : '/coach';
  const response = NextResponse.redirect(new URL(`/${locale}${destination}`, request.url), 303);
  response.headers.set('cache-control', 'no-store');
  response.cookies.set(dev.DEV_SESSION_COOKIE, session, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 12 * 60 * 60,
    secure: new URL(request.url).protocol === 'https:',
  });
  return response;
}

/** doc §14 / P2B local testing: clear the development cookie; the disabled adapter has no route behavior. */
export async function DELETE(): Promise<Response> {
  if (process.env.NODE_ENV === 'production') return new Response(null, { status: 404 });
  const dev = await import('@/src/server/dev-login');
  if (!dev.devLoginEnabled()) return new Response(null, { status: 404 });
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('cache-control', 'no-store');
  response.cookies.set(dev.DEV_SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
