import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next.js 16 renamed middleware.ts to proxy.ts; next-intl's handler is used unchanged.
const proxy = createMiddleware(routing);
export default proxy;

export const config = {
  // Skip API routes, Next internals, files with an extension, the manifest and the service worker.
  matcher: ['/((?!api|_next|_vercel|manifest.webmanifest|sw.js|.*\\..*).*)'],
};
