# Batch P2B: development-only login, session helpers, per-namespace messages, API test harness

DAWLYY must run end to end on this PC without any Supabase project, Vercel login or API key. You build the
development-only login that signs in seeded demo users, the session helpers the wave-2 builders call, per-namespace
message files so parallel builders never edit the same JSON file, and the DB-backed API test harness.

Read first: `docs/plans/AUTOPILOT_MASTER_PROMPT.md` section "Local testing without his accounts" (binding),
`docs/architecture/02-database-security-model.md` section 14 (client library; read only that section),
`apps/web/src/server/auth.ts`, `apps/web/src/server/supabase.ts`, `apps/web/components/app/auth-gate.tsx`,
`apps/web/components/app/login-form.tsx`, `apps/web/app/[locale]/(auth)/login/page.tsx`, `apps/web/next.config.ts`,
`apps/web/i18n/request.ts`, `apps/web/messages/*`, `apps/web/scripts/check-messages.mjs`, `apps/web/vitest.config.ts`,
`apps/web/src/api/middleware/auth.ts`, `packages/db/src/client.ts`, `packages/db/test/fixtures.ts`.

## Files you may write

- `apps/web/src/server/auth.ts`
- `apps/web/src/server/dev-login.ts` (new) and `apps/web/src/server/dev-login.test.ts` (new)
- `apps/web/app/api/dev-login/route.dev.ts` (new; see the exclusion rule below)
- `apps/web/next.config.ts` (only the `pageExtensions` change below)
- `apps/web/components/app/dev-login-panel.tsx` (new) and `apps/web/app/[locale]/(auth)/login/page.tsx`
- `apps/web/src/api/middleware/auth.ts`
- `apps/web/i18n/request.ts`, `apps/web/messages/**`, `apps/web/scripts/check-messages.mjs`
- `apps/web/scripts/check-no-dev-login.mjs` (new)
- `apps/web/src/test/api-harness.ts` (new) and `apps/web/src/test/api-harness.test.ts` (new)

Write nothing else. Do not edit `packages/**`, `package.json` files or lockfiles.

## Work

1. **Dev login adapter** (`dev-login.ts`). `devLoginEnabled()` is true only when
   `process.env.NODE_ENV !== 'production'` and `process.env.DAWLYY_DEV_LOGIN === '1'` and
   `process.env.DAWLYY_DEV_LOGIN_SECRET` has at least 32 characters. The session is a cookie `dawlyy_dev_session`
   holding `<userId>.<expiry epoch seconds>.<HMAC-SHA256 hex over userId and expiry with the secret>`, httpOnly,
   sameSite lax, path `/`, 12 hours. Export `signDevSession(userId, now)`, `readDevSession(cookieValue, now)`
   (returns the user id or null; constant-time compare; expired or malformed is null) and `listDemoUsers()`, which
   reads the demo users through `withServiceTx(null, 'dev login: list demo users', ...)` as
   `{ userId, displayName, role, tenantName }` for active memberships of tenants whose `slug` starts with `demo`
   (check the real column names in `packages/db/src/schema/tenants.ts`; if there is no slug, use the tenant name
   prefix "Demo"). Every export returns null or an empty list when `devLoginEnabled()` is false, so the adapter can
   never return a session when `NODE_ENV=production`. Unit tests: sign and read round trip, tampered signature,
   expired, wrong secret, and `NODE_ENV=production` gives null even with a valid cookie and the flag set.
2. **Route** (`app/api/dev-login/route.dev.ts`). `POST` with form or JSON `{ userId, locale }`: refuses with 404 when
   the adapter is disabled; accepts only a user id that `listDemoUsers()` returns; sets the cookie and redirects (303)
   to `/<locale>/coach` for owner and staff, `/<locale>/app/today` for clients. `DELETE` clears the cookie.
   **Exclusion:** in `next.config.ts` set `pageExtensions` to `['tsx', 'ts', 'jsx', 'js']` when
   `process.env.NODE_ENV === 'production'` and to the same list plus `'dev.tsx', 'dev.ts'` otherwise, so
   `next build` never sees the route. Note that the existing `app/api/[[...route]]/route.ts` catch-all is an
   optional catch-all at the same level: make sure `/api/dev-login` reaches the dev route in development (a static
   segment wins over a catch-all in the App Router; say in your answer if you see a reason it would not).
3. **Session helpers** (`auth.ts`). Keep `getAuthContext`, `requireAuth` and `requirePage` working for their callers.
   Add `getSessionUser(headers?: Headers): Promise<{ id: string; email: string | null } | null>`: when the dev
   adapter is enabled and a valid dev cookie is present, that user; otherwise the Supabase user from the cookie or a
   `Bearer` token (from the given headers, else `next/headers`). Load the dev adapter only inside a branch guarded by
   `process.env.NODE_ENV !== 'production'` with a dynamic `import('./dev-login')`, so the production bundle does not
   contain the module (Next inlines `NODE_ENV` at build time and removes the dead branch). When the dev adapter is
   enabled and Supabase env vars are missing, do not call Supabase at all. `getAuthContext(headers?: Headers)` uses
   `getSessionUser` and then the same membership lookup through `withUserTx` as today: the dev path goes through the
   same `withAuthTx`/`withUserTx` boundary and RLS as a real session. `requirePage()` sends a signed-in user with no
   active membership to `/onboarding` (Task 2 builds that page) and a signed-out one to `/login`.
   `apps/web/src/api/middleware/auth.ts` passes `c.req.raw.headers` to `getAuthContext`.
4. **Login page.** When `devLoginEnabled()` is true, the login page renders `DevLoginPanel` under the normal form: a
   clearly labelled "Development login" box listing the demo users as buttons (each a small form posting to
   `/api/dev-login` with the user id and locale). Strings in the messages files (namespace `auth`), Egyptian Arabic.
5. **Per-namespace messages.** Split `messages/ar.json` and `messages/en.json` into `messages/<locale>/<namespace>.json`
   (one file per top-level key, same content) and change `i18n/request.ts` to merge them (a static import map per
   locale is fine; keep it type-safe). Keep `messages/keys.md` accurate. Update `scripts/check-messages.mjs` so it
   checks that both locales have the same namespaces and the same key sets. Delete nothing else.
6. **Production check** (`scripts/check-no-dev-login.mjs`): after `next build`, exit 1 if any file under `.next/`
   contains the string `dawlyy_dev_session` or a route manifest lists `/api/dev-login`; exit 0 otherwise; print what
   it found. Put a unique marker comment-proof string in `dev-login.ts` (the cookie name constant is enough).
7. **API test harness** (`src/test/api-harness.ts`). For Hono API tests against the local database: `vi.mock` of
   `@/src/server/supabase` so `auth.getUser(token)` returns the user whose id is the bearer token, a helper
   `call(app, method, path, { as?: userId, body?, headers? })` returning `{ status, json }`, and data setup through
   `withServiceTx`. It reads `DATABASE_URL` and `DATABASE_URL_SERVICE` from the environment and fails with a clear
   message when they are missing. `api-harness.test.ts` exercises `/api/v1/me` for an owner and a signed-out caller;
   mark it so it runs only when `DATABASE_URL` is set (`describe.runIf`), since unit runs have no database.

## Acceptance you can check without running anything

- No path makes `readDevSession` or `getSessionUser` return a dev user when `NODE_ENV === 'production'`.
- The dev adapter is imported only through the guarded dynamic import.
- Both locales have identical namespace files and key sets.

## Answer

Files written; every export with its signature; how the route exclusion works and how to prove it; the env vars the
preview script must set (`DAWLYY_DEV_LOGIN`, `DAWLYY_DEV_LOGIN_SECRET`, database URLs); anything wrong or ambiguous in
this brief.
