# Batch P3-T2: auth pages, tenant bootstrap, invitations (build-plan Task 2)

Build the sign-up, invite-accept, password-reset and onboarding screens and the API behind them. Read the build plan
Task 2, spec sections on onboarding and roles (grep the spec for "invit", "onboarding", "Owner"), doc section 12.1,
doc section 5.2 (policies of `tenants`, `memberships`, `business_settings`, `invitations`) and section 6.1 and 6.3 rows
for those tables (guard triggers: `invitations_50_guard`, `memberships`, `keep_one_owner`).

## Files you may write (and nothing else)

- `apps/web/app/[locale]/(auth)/signup/page.tsx`, `.../signup/loading.tsx`
- `apps/web/app/[locale]/(auth)/invite/[token]/page.tsx`, `.../invite/[token]/loading.tsx`
- `apps/web/app/[locale]/(auth)/reset/page.tsx`, `.../reset/loading.tsx`
- `apps/web/app/[locale]/(auth)/onboarding/page.tsx`, `.../onboarding/loading.tsx` (the route `/onboarding` that
  `requirePage()` redirects a signed-in user without a membership to)
- `apps/web/components/auth/*` (new client components: sign-up form, accept-invitation form, reset forms, onboarding form)
- You may edit `apps/web/components/app/login-form.tsx` and `apps/web/app/[locale]/(auth)/login/page.tsx` only to add
  links to sign-up and reset. Keep the dev-login panel and the RTL layout exactly as they are.
- `apps/web/src/api/auth.ts`, `apps/web/src/api/invitations.ts` (routers; the stubs exist and are already mounted)
- `apps/web/src/server/bootstrap.ts` (tenant bootstrap), `apps/web/src/server/invitations.ts` (token hashing, create,
  preview, accept, revoke) and their tests `apps/web/src/server/bootstrap.test.ts`, `apps/web/src/server/invitations.test.ts`
- `apps/web/src/api/auth.test.ts`, `apps/web/src/api/invitations.test.ts`
- `apps/web/messages/ar/auth.json`, `apps/web/messages/en/auth.json` (extend; keep every existing key) and
  `apps/web/messages/ar/onboarding.json`, `apps/web/messages/en/onboarding.json` (currently `{}`)

## Interfaces you consume

`getSessionUser(headers)`, `getAuthContext(headers)`, `requirePage()` (`apps/web/src/server/auth.ts`, read-only);
`requireAuthMiddleware`; `withAuthTx`, `withServiceTx`; tables `tenants`, `memberships`, `businessSettings`,
`invitations`, `clients`, `staffClientAssignments`, `consents` from `@dawlyy/db/schema`; `permissionsFromPreset`,
`PRESETS` from `@dawlyy/core/authz`; `createSupabaseBrowserClient` from `apps/web/src/lib/supabase-browser.ts`
(read it); `Wordmark`, `LocaleSwitch`, `PageHeader` from the shell components.

## Design (settled; do not reopen)

Supabase owns identity. The browser creates the Supabase user (`signUp`, `signInWithPassword`, magic link,
`resetPasswordForEmail`, `updateUser`); the API never sees a password. Everything after that is the API, keyed by the
session user id from `getSessionUser`.

1. `POST /api/v1/auth/bootstrap` `{ businessName, displayName, locale: 'ar'|'en', timezone }`. Caller is a signed-in
   user with NO active membership (use `getSessionUser`, not `requireAuthMiddleware`, because the caller has no
   membership yet). In ONE `withServiceTx(null or new tenantId, 'auth bootstrap', ...)`: insert `tenants` (unique slug
   derived from the business name, ASCII-safe, with a numeric suffix on collision; `receipt_counter` stays 0), the owner
   `memberships` row (`role owner`, `status active`, `display_name`), `business_settings` (defaults from the
   `BusinessSettings` type: kg/cm, `numerals 'western'`, `weekStartsOn` per locale, empty categories) and
   `user_preferences` (locale). Existing active membership gives 409 `already_member`. Return `{ tenantId, membershipId }`.
   The service transaction is allowed here because no membership exists to authorize against; it must filter and insert
   only for the session user and the new tenant. Validate `timezone` against `Intl.supportedValuesOf('timeZone')`.
2. `POST /api/v1/invitations` (coach). Owner may invite `client` or `staff`; staff may invite `client` only, and only
   for a client they can access (RLS policies `invitations_owner`/`invitations_staff` decide; the database also rejects
   a staff invite with permissions). Body: `{ role, clientId?, displayName, email?, phone?, preset?, permissions?,
   clientScope?: 'all'|'assigned', assignedClientIds? }`. At least one of email or phone. Staff permissions come from
   `permissionsFromPreset(preset, overrides)`; unknown presets are 400. Generate a 32-byte random token
   (`crypto.randomBytes`), store only `sha256` hex as `token_hash`, `expires_at` = now + 7 days, `status 'pending'`,
   `invited_by` is stamped by the guard (do not send it if the guard stamps it; read §6.3). Response `201`:
   `{ id, role, expiresAt, token, link }` where `link` is `<APP_URL>/<locale>/invite/<token>` where `APP_URL` is
   `process.env.NEXT_PUBLIC_APP_URL` or, if unset, the request origin (do NOT call `env()` from `src/lib/env.ts`: it
   throws when the Supabase variables are missing, as on this PC). The raw token appears in this response only and is never stored or logged. Requires
   `requirePermission(auth, 'team', 'manage')` for staff invites and `'clients', 'edit'` for client invites.
   Sending the email or message is out of scope (no provider is wired): the coach copies the link.
3. `GET /api/v1/invitations` (cursor list of the caller's visible invitations, newest first; never returns the hash),
   `POST /api/v1/invitations/{id}/revoke` (pending to revoked), `POST /api/v1/invitations/{id}/regenerate` (revoke the
   old row, create a new pending row with a new token, same fields; return as in item 2).
4. `POST /api/v1/invitations/preview` `{ token }`, unauthenticated. `withServiceTx(null, 'invitation preview', ...)`
   looks up by `sha256(token)`; returns only `{ businessName, role, displayName, expired, status }`. An unknown token is
   404 `invalid_invitation` with the same body and timing class as an expired one (no tenant enumeration). Never return
   email, phone, ids or permissions. Keep a constant-time comparison out of it: the lookup is by hash, so there is
   nothing to compare.
5. `POST /api/v1/invitations/accept` `{ token }`. Caller is a signed-in user with no active membership. Inside one
   `withServiceTx(tenantId, 'invitation accept', ...)`: re-read the invitation `FOR UPDATE`, require `pending` and not
   expired, create the `memberships` row (role, permissions, `client_id` for clients, `status active`), for staff with
   `clientScope 'assigned'` insert the `staff_client_assignments` rows (only for clients of the same tenant), mark the
   invitation `accepted` with `accepted_at` and `accepted_user_id`. Two concurrent accepts of one token produce exactly
   one membership (the second gets 409 `invitation_used`). A user who already has an active membership gets 409
   `already_member`. Return `{ role, redirectTo: '/app/today' | '/coach' }`.
6. The server never trusts the invitation's `role` from the client; it comes from the row.

## Pages

- `/signup`: business name, your name, email, password; calls Supabase `signUp` in the browser, then
  `POST /auth/bootstrap`. If Supabase is not configured (no `NEXT_PUBLIC_SUPABASE_URL`), show the branded
  "sign-up is not available in this local build; use the demo logins" state (`onboarding.signupUnavailable`), not an error.
- `/invite/[token]`: server component calls the preview service; shows "<businessName> invites you as <role>"; if the
  visitor is signed in without membership it offers Accept; otherwise it shows the sign-up/sign-in form that returns to
  this page. Expired, used or unknown tokens each show a clear branded state (no stack traces).
- `/reset`: email form (`resetPasswordForEmail`) and, when the URL carries a recovery session, the new-password form.
- `/onboarding`: a signed-in user with no membership who did not come through an invite: shows two choices, "start your
  coaching business" (the bootstrap form) and "I have an invitation link".
- All four are full-screen auth layouts like the login page (read it): Wordmark, LocaleSwitch, a Card, 44 px targets,
  no horizontal scroll at 360 px in RTL.

## Tests (Claude runs them)

Unit: token generation and hashing (hash differs from token, 32 bytes, base64url), slug derivation, expiry logic.
DB-backed through the harness: bootstrap creates tenant + owner + settings and rejects a second call (409); invite
create/list/revoke/regenerate; preview of unknown vs expired gives the same shape; accept creates the membership and a
second accept fails; staff cannot invite staff (RLS) and cannot invite for an inaccessible client; a client invitation
carries `client_id` and the accepted membership has it; assigned-scope staff acceptance inserts assignments; raw token
and hash are absent from list responses; an expired invitation cannot be accepted.

## Answer

Per the common rules. Also list every message key you added, and say how the invite link is built.
