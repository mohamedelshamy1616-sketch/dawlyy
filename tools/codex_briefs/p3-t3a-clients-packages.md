# Batch P3-T3a: clients, packages and entitlement overrides (build-plan Task 3, first half)

Build client CRUD with search, the package builder, and per-client entitlement overrides. Read the build plan Task 3,
doc section 12.1 (items 2, 13, 14 matter most), section 5.2 rows for `clients`, `packages`,
`client_entitlement_overrides`, `staff_client_assignments`, section 6.1/6.3 guard rows for `clients` and `packages`,
section 7.7 and 7.10.4 (client codes, creator assignment), and `packages/core/src/entitlements` and `src/text`.
`docs/product/COMPETITOR_GAPS.md` rows G6 and G7 apply (Arabic RTL at 360 px; flat plans, no add-on screens).

## Files you may write (and nothing else)

- `apps/web/src/api/clients.ts`, `apps/web/src/api/packages.ts` (routers; stubs exist and are mounted)
- `apps/web/src/server/clients/*.ts` and `apps/web/src/server/packages/*.ts` (services, projections, tests as
  `*.test.ts`)
- `apps/web/src/api/clients.test.ts`, `apps/web/src/api/packages.test.ts`
- pages: `apps/web/app/[locale]/coach/clients/page.tsx`, `.../clients/loading.tsx`, `.../clients/new/page.tsx`,
  `.../clients/[clientId]/page.tsx`, `.../clients/[clientId]/loading.tsx`, `.../clients/[clientId]/overrides/page.tsx`,
  `apps/web/app/[locale]/coach/packages/page.tsx`, `.../packages/loading.tsx`, `.../packages/new/page.tsx`,
  `.../packages/[packageId]/page.tsx`
- `apps/web/components/clients/*`, `apps/web/components/packages/*` (new; client components for forms and the
  entitlement editor)
- `apps/web/messages/ar/clients.json`, `.../en/clients.json`, `.../ar/packages.json`, `.../en/packages.json`
  (currently `{}`)

Another builder (T3b) owns subscriptions, payments and `coach/billing/**` and
`coach/clients/[clientId]/subscription/**`. Do not create files there. Your client detail page links to these fixed
routes: `/coach/billing/sell?clientId=<id>` (sell a package) and `/coach/clients/<id>/subscription` (subscription
status). Render those links as plain `Link` hrefs; they resolve once T3b lands.

## Interfaces you consume

`packages/core`: `searchKey` (`@dawlyy/core/text`), `resolveEntitlements`, `can`, `periodFor`, `entitlementId`
(`@dawlyy/core/entitlements`), the `Package`/entitlement Zod types (`@dawlyy/core/types`), `isAllowed`
(`@dawlyy/core/authz`). Tables `clients`, `packages`, `clientEntitlementOverrides`, `staffClientAssignments`,
`subscriptions` (read-only, for the status filter and the active package column). `clientColumns.clients`,
`clientColumns.packages`, `clientColumns.clientEntitlementOverrides` for any client-visible projection.

## Routes

All under the existing routers; mutating routes use `idempotentReplay`; lists use cursor pagination.

Clients (`/api/v1/clients`):
- `GET /` list with `q` (matches `clients.search_key` by `searchKey(q)` prefix/contains over name, code, phone, email;
  Arabic folding is `searchKey`'s job), `status` (client status enum; read the schema), `packageId` and `tag` filters,
  `limit`, `cursor`. Sort by `(created_at desc, id desc)`. Staff with `client_scope 'assigned'` see only assigned
  clients: that is RLS, do not re-implement it, but test it. Permission `clients:view`.
- `POST /` create. Body: `fullName` (or the name columns the schema has), `phone`, `email`, `locale`, `tags`,
  `source`, `notes`, optional `packageId` (no subscription is created here; selling is T3b). The API writes
  `search_key = searchKey([name, phone, email].join(' '))` on every create and update; `code` is assigned by the
  trigger (leave it out, `default ''`). No `RETURNING` for assigned-scope staff: insert, then select by a client-chosen
  `id` you generate with `crypto.randomUUID()` (doc item 14). Duplicate phone or email in the tenant returns 409
  `duplicate_client` with the existing client id in `details` (check by a SELECT first; never `ON CONFLICT` on clients).
  Permission `clients:create`.
- `GET /{clientId}`: full coach view (all coach columns). 404 when RLS hides it.
- `PATCH /{clientId}`: partial update, recomputes `search_key`. Permission `clients:edit`. Never accepts `code`,
  `tenant_id`, `created_by`.
- `POST /{clientId}/archive` and `/unarchive`: sets and clears the archive/status field the schema defines. History is
  never deleted (spec section 30).
- `GET /{clientId}/overrides`, `PUT /{clientId}/overrides/{key}` `{ enabled, frequency?, limit?, durationDays?,
  turnaroundHours?, mediaTypes?, note? }`, `DELETE /{clientId}/overrides/{key}`: rows of
  `client_entitlement_overrides`; an override on client A changes nothing for the package or client B. Response of
  `GET` also returns the resolved entitlement list (`resolveEntitlements(package.entitlements, overrides)`) with the
  source of each value (`package` or `override`). Permission `clients:edit`.

Packages (`/api/v1/packages`):
- `GET /` list (active first, then archived with `?archived=1`), `POST /` create, `GET /{id}`, `PATCH /{id}`,
  `POST /{id}/archive`, `POST /{id}/duplicate`. Body per build plan: `name` (LocalizedText), `description`,
  `priceAmount`, `currency` (default EGP), `durationDays`, `graceDays`, `entitlements` (validated by the core Zod
  schema, with `key, enabled, frequency?, limit?, durationDays?, turnaroundHours?, mediaTypes?, note`), `scheduleRules`
  (core `ScheduleRules`; default `ScheduleRules.parse({})`). Editing a package never rewrites existing subscriptions
  (they copy what they need at sale time, T3b). Permission `packages:*`. A package that has subscriptions cannot be
  hard-deleted (there is no delete route); only archive.
- Flat plans, no add-on screens (G7): the package form has no per-feature price field.

## Pages (coach area, inside the existing coach shell; read `app/[locale]/coach/page.tsx` for the pattern)

- Clients list: search box (debounced, submits through the URL `?q=`), filter chips (status, package, tag), cards on
  phones and a table from `md` up, empty state with an "add client" action, pagination via "load more".
  Each row: name, code (`DW-000123`), status badge using `status.*` words, active package, days left (leave blank when
  T3b data is absent).
- New client form; client detail with tabs: Profile (edit), Package and overrides, Subscription (link to T3b route),
  History (placeholder card "coming with Client 360" using `clients.history.soon`).
- Override editor: a switch per entitlement of the package, limit and frequency inputs, a note, a visible badge
  "overridden" where it differs from the package, and a reset button.
- Packages list, package builder (entitlement matrix: one row per `EntitlementKey` from core, with enabled switch,
  frequency, limit, turnaround), archive and duplicate actions.
- Server components fetch through `withAuthTx` services directly (not through HTTP); client components call the API.

## Tests (Claude runs them)

Pure: search-key building for Arabic names with diacritics and Alef variants; entitlement merge display model. API
(DB-backed through the harness): create then list then search by Arabic and English name, phone and code; `code` is
assigned and increments per tenant; a second client with the same phone is 409; update recomputes `search_key`;
assigned-scope staff creates a client and can then read it (no RETURNING failure), and cannot read another client;
a client-role caller gets 403 on `GET /clients`; override on client A leaves the package and client B unchanged
(the plan's acceptance); package create/duplicate/archive; entitlement payload validation errors are 400.

## Answer

Per the common rules. Also list message keys added, and any column in `clients`/`packages` the brief named wrongly.
