# Batch P4-T11: settings, team, permissions, branding, legal consent (build-plan Task 11)

Build business settings, team invitations with a per-user permission editor on the core authz matrix and role presets,
consent recording, and Arabic and English legal pages with placeholders flagged for counsel. Read build plan Task 11,
spec sections 44 (consent, Egypt Law 151/2020), the settings and team sections, doc section 12.1, section 5.2 rows for
`business_settings`, `memberships`, `invitations`, `consents`, `user_preferences`, and
`packages/db/src/schema/tenants.ts`. Read `packages/core/src/authz/index.ts` (`MODULES`, `ACTIONS`, `PRESETS`,
`permissionsFromPreset`, `isAllowed`, `describePermissions`, `diffPermissions`) and use it; do not duplicate the
matrix. Invitations already exist: read `apps/web/src/api/invitations.ts` and `apps/web/src/server/auth*`/`invitations*`
for how staff and client invitations are created and accepted; reuse their service, do not edit it.

## Files you may write (and nothing else)

- API: `apps/web/src/api/settings.ts` (business settings, branding, user preferences, consents) and
  `apps/web/src/api/team.ts` (stubs exist, mounted) and tests `settings.test.ts`, `team.test.ts`.
- Services: `apps/web/src/server/settings/*`, `apps/web/src/server/team/*` (+ `*.test.ts`).
- Components: `apps/web/components/settings/*`, `apps/web/components/legal/*`.
- Coach pages (each with `loading.tsx`): `apps/web/app/[locale]/coach/settings/page.tsx` (hub with links),
  `settings/business/page.tsx`, `settings/team/page.tsx`, `settings/team/[membershipId]/page.tsx` (permission
  editor), `settings/branding/page.tsx`, `settings/language/page.tsx`, `settings/legal/page.tsx` (consent records of
  the tenant for the owner).
- Public legal pages (no sign-in): `apps/web/app/[locale]/(legal)/{terms,privacy,consent}/page.tsx` with a small shared
  `layout.tsx` in that group, and `loading.tsx` where it makes sense.
- Client page: `apps/web/app/[locale]/app/consent/page.tsx` (a client reviews and records consents).
- Messages: `apps/web/messages/{ar,en}/settings.json` and `legal.json` (registered, currently `{}`; you own them).
  Legal text is long: keep it in `legal.json` as short clauses.

Other builders work at the same time on disjoint files: T8 (calendar, tracking, photos, media upload; it checks the
`photos` consent itself by reading `consents`) and T10 (dashboard, tasks). Do not edit their files.

## Routes (mutating routes use `idempotentReplay`)

`/settings`: `GET /business` (any member, read), `PUT /business` (owner only, module `settings:edit`; name, logo media
id, default language, timezone, units, exercise categories, measurement templates; validate with Zod; the stored shape
is `BusinessSettings` in `schema/tenants.ts`), `GET /preferences` and `PUT /preferences` (own user preferences),
`GET /consents` (own), `POST /consents` `{ kind, version, locale, accepted }` records a consent (append-only: a
withdrawal sets `withdrawn_at` on the newest accepted row of that kind and inserts nothing else; the client cannot
alter `accepted_at`, `ip_hash` or `user_agent`, the server fills them), `GET /consents/all` (owner: tenant records,
keyset pagination). `/team` (module `team`): `GET /` members with role, preset and effective permissions; `POST
/invite` `{ email, displayName, preset, overrides? }` creates a staff invitation through the existing invitation
service; staff cannot invite owner or staff (the database already forbids it: map the refusal to 403 `forbidden`);
`GET /{membershipId}`; `PUT /{membershipId}/permissions` `{ preset?, modules?, client_scope }` owner only, stores
`StaffPermissions`, returns `diffPermissions` of old vs new; `POST /{membershipId}/deactivate` and `/reactivate`
(owner only, never the last owner). Acceptance: a staff member without a granted module gets 403 from that module's
API; consent is required before uploading photos (T8 enforces; you provide the records and the client consent page).
Errors 400, 401, 403, 404, 409, 422. Clients get 403 on `/team` and owner-only routes.

## Screens (360 px first, RTL-safe, targets at least 44 px)

Astryx for every new control (rule in the common brief). Permission editor: preset picker plus a module by action
grid of toggles with a plain-language summary and a "changes" list before saving. Branding: logo upload through the
existing media API is T8's; here accept a media id field only if media upload for `business_logo` is not available, and
say so in your answer (default: leave the logo out and report it). Legal pages are public, readable, with a visible
"Draft for legal review (Egypt Law 151/2020)" banner on every page and `[PLACEHOLDER: ...]` markers where counsel must
fill in company name, address, retention periods and the data protection contact. Every route has loading and empty
states.

## Tests (Claude runs them)

DB-backed (pattern of `apps/web/src/api/programs.test.ts`, harness `apps/web/src/test/api-harness.ts`): staff without
`settings` gets 403 on `PUT /business`; owner updates business settings and a client can read but not write them; a
staff member granted a module reaches its API and one not granted gets 403 (use a module API that exists, such as
`/packages`); permission edit returns the diff and an unknown module key is 422; inviting with a preset stores the
preset's permissions; consent record then withdrawal keeps both facts and the newest state is withdrawn; a client cannot
read another user's consents; last owner cannot be deactivated; legal pages render in both locales (a pure test that
the message files hold the same keys is enough).

## Answer

Per the common rules. Also: which invitation service functions you reused, the permission shape stored, and every
message key group added.
