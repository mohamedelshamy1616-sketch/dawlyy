# Batch P3-T3b: subscriptions, manual payments, extensions, calendar generation, storage (build-plan Task 3, second half)

Build the flow that sells a package, records a manual payment, verifies it, activates the subscription, generates the
calendar, and handles freezes, extensions and cancellation. This is the money path of the product: read carefully.
Read the build plan Task 3 and "Calendar and jobs", spec sections 22, 24, 30, 35 and 60 (grep), doc section 12.1
(items 5-8, 13, 18), section 5.2 rows for `subscriptions`, `subscription_events`, `payments`, `calendar_events`,
`media`, section 6.1 guard rows for those tables and the "Payments" and "Media" paragraphs after them (line ~1243,
rules CV-01, CV-05, FL-05, FL-09), section 7.7 (receipt numbers), and `docs/product/COMPETITOR_GAPS.md` row G1.
Core already holds the logic: read `packages/core/src/subscription`, `schedule`, `state` (machines `subscription`,
`payment`) and `entitlements` before writing anything. Do not reimplement what core exposes.

## Files you may write (and nothing else)

- `apps/web/src/api/subscriptions.ts`, `apps/web/src/api/payments.ts`, `apps/web/src/api/media.ts` (routers; stubs exist
  and are mounted; `media.ts` later grows for photos in T8, keep it small and well sectioned)
- `apps/web/src/server/subscriptions/*.ts`, `apps/web/src/server/payments/*.ts`, `apps/web/src/server/storage/*.ts`
  (services, storage interface and local implementation, tests as `*.test.ts`)
- `apps/web/src/api/subscriptions.test.ts`, `apps/web/src/api/payments.test.ts`, `apps/web/src/api/media.test.ts`
- pages: `apps/web/app/[locale]/coach/billing/page.tsx`, `.../billing/loading.tsx`, `.../billing/sell/page.tsx`,
  `.../billing/payments/[paymentId]/page.tsx`, `apps/web/app/[locale]/coach/clients/[clientId]/subscription/page.tsx`
  (+ `loading.tsx` beside each), `apps/web/app/[locale]/app/subscription/page.tsx` (+ `loading.tsx`: the client's own
  countdown)
- `apps/web/components/billing/*` (new client components)
- `apps/web/messages/ar/billing.json`, `apps/web/messages/en/billing.json` (currently `{}`)

Builder T3a owns clients and packages (`coach/clients/**` except the `subscription` folder, `coach/packages/**`). Its
client detail page links to `/coach/billing/sell?clientId=<id>` and `/coach/clients/<id>/subscription`: build exactly
those routes. Do not create or edit any other file there.

## Interfaces you consume

Core: `buildSubscriptionSchedule`, `reconcileSchedule`, `accessStatus`, `dueTransition`, `endsOnFor`, `graceEndsOnFor`
(`@dawlyy/core/subscription`), `generateSchedule` (`@dawlyy/core/schedule`), `transition`, `machines`
(`@dawlyy/core/state`), `resolveEntitlements` (`@dawlyy/core/entitlements`). Tables `subscriptions`,
`subscriptionEvents`, `payments`, `calendarEvents`, `media`, `packages`, `clients`, `tenants` (time zone, receipt
counter owned by the trigger). `clientColumns.subscriptions`, `.payments`, `.subscriptionEvents`, `.calendarEvents`
for every client-visible response. `requireActiveAccess` and `decideAccess` exist in `middleware/access.ts` (read-only
for you; T5 uses them).

## Design

### The sell flow (one transaction, G1)

`POST /api/v1/subscriptions` `{ clientId, packageId, startsOn, payment?: { amount, currency, method, proofMediaId?,
reference?, markVerified?: boolean } }`, permission `billing:create`. In ONE `withAuthTx`: load package and client
(RLS decides visibility), insert the `subscriptions` row (state `pending`; copy `duration_days`, `grace_days`,
`price`, `currency`, the package id and the resolved schedule rules from the package at sale time; `ends_on` and
`grace_ends_on` from core; `price` and `currency` are immutable afterwards), insert the payment when given
(state `pending`), and when `markVerified` is true and the caller has `billing:verify`, verify it in the same request
by a separate UPDATE (the guard allows only the verify transition; never insert a payment as `verified`). Verifying
moves the subscription `pending -> active` (core `transition('subscription', 'pending', ...)`). Returns the subscription,
the payment with its `receipt_no` (assigned by the trigger at insert; no `ON CONFLICT`, doc item 13; insert and, if
`23505` appears, handle it inside a savepoint), and the renewal date. The caller sees: renewal date, days left, receipt
number. No manual matching step exists.

### Calendar events need a service transaction

The guard on `calendar_events` lets runtime inserts be `source = manual` only (doc line ~1237). Package-rule events
(`source = 'package_rule'`, `rule_key` set) are written by the service. So after the sale commits its checks, run
`generateSchedule` / `buildSubscriptionSchedule` and insert the events inside `withServiceTx(tenantId, 'calendar
generation', ...)`, filtering every statement by `tenant_id`, in the SAME request, idempotent on `(subscription_id,
rule_key)` (check what unique index the schema gives; use `INSERT ... ON CONFLICT DO NOTHING` there, which is allowed
for `calendar_events`). Put this in `apps/web/src/server/subscriptions/calendar.ts` as a function
`syncSubscriptionCalendar(tenantId, subscriptionId, reason)` that other tasks (T8's cron) can call: it loads the
subscription, its freezes/extensions from `subscription_events`, builds the timeline, runs core `reconcileSchedule`
against the existing events, and applies insert, cancel, update and reopen. A client's manual edit of one event only
changes that client's rows.

### Lifecycle endpoints (permission `billing:edit`; each writes a `subscription_events` row with actor, reason, old and new `ends_on`)

- `POST /subscriptions/{id}/extend` `{ days, reason }`: extension; recalculates `ends_on`, shifts dependent events.
  Restores access when the subscription was `grace` or `expired` (core machine edges decide; refuse with 422
  `transition_refused` carrying `details: { from, event }` when the machine refuses).
- `POST /subscriptions/{id}/freeze` `{ fromDate, days, reason }` and `POST /subscriptions/{id}/resume`.
  Freeze answers settled by Mohamed's defaults (OPEN_DECISIONS rows 3 and 4): a freeze that is not a multiple of 7
  days keeps weekday cadences on their weekday and shifts day-count cadences by the freeze length (core already does
  this: use it); a retroactive freeze cancels open (not completed) rows inside the frozen window.
- `POST /subscriptions/{id}/cancel` `{ reason }`: from `pending`, `active`, `grace`, `paused`, `suspended` per the core
  machine; open future events are cancelled; history stays.
- `GET /subscriptions` (cursor list, filters `clientId`, `state`), `GET /subscriptions/{id}` (with its events ledger and
  `accessStatus` for today in the tenant time zone). Client callers (`role 'client'`) may `GET /subscriptions/mine`:
  their own subscription through `clientColumns`, with the countdown fields from `accessStatus`; they never see
  `notes` or `subscription_events.reason` if the projection hides them.
- The expiry sweep (`dueTransition` to grace and expired) belongs to T8's cron; expose
  `sweepSubscriptions(tenantId, today)` in `apps/web/src/server/subscriptions/sweep.ts` for it (service transaction,
  tenant-filtered, idempotent) and test it.

### Payments (`/api/v1/payments`)

- `GET /` cursor list (filters `state`, `clientId`, `method`), `GET /{id}`, `POST /` (a payment without a sale, for a
  renewal instalment: needs an existing subscription), `POST /{id}/verify` (permission `billing:verify`; moves
  `pending -> verified`; if the linked subscription is `pending`, activates it in the same transaction),
  `POST /{id}/reject` `{ reason }` (`billing:verify`; sets `rejected_reason`), `POST /{id}/refund` `{ amount? }`
  (`billing:refund` if the module action exists, else the permission doc section 6 names; a partial refund keeps the
  payment `verified`, per the table constraints). A client can never change `state` (payment self-verification is a
  red-team lens): test that a client-role caller gets 403 on every payments mutation and that a client's `GET
  /payments/mine` shows only their own rows through `clientColumns.payments` (`rejected_reason` is client-facing by
  design; `notes` are not).
- Money values are strings or integers in minor units exactly as the schema types them: read the column types; do not
  use floating point for arithmetic.

### Storage and payment proof (`/api/v1/media`, doc 12.1 item 18)

- `apps/web/src/server/storage/index.ts`: an interface `StorageProvider { createUpload(path, contentType, maxBytes):
  Promise<{ url, method, headers? }>; createDownload(path, ttlSec): Promise<{ url }>; remove(path): Promise<void> }`, a
  `LocalFsStorage` implementation that keeps files under `.work/storage/` inside the repo (path-safe: reject `..`,
  absolute paths and anything outside `<tenant>/clients/<client>/` or `<tenant>/assets/`), and a
  `SupabaseStorage` implementation behind the same interface that is selected only when
  `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are set (write it against the documented
  `createSignedUploadUrl` API of `@supabase/supabase-js`; it is untested here and must say so in a comment). `getStorage()`
  picks one. The local provider needs a tiny route to receive the upload: add `PUT /api/v1/media/local-upload/{token}`
  only active when the local provider is selected and `NODE_ENV !== 'production'`.
- `POST /media/uploads` `{ clientId, purpose: 'payment_proof', contentType, sizeBytes, filename }` (permission
  `billing:create`; allow only `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, max 8 MB): inserts the
  `media` row under RLS with the path `<tenant>/clients/<client>/payments/<uuid>.<ext>` (the CHECK of doc section 8.3
  validates the shape), returns the upload instruction and the media id. `GET /media/{id}/url` returns a short-lived
  download URL after an RLS read of the row (so a foreign id resolves to 404).

### Pages

- `/coach/billing`: tabs Payments (pending first, with a pending count badge), Subscriptions, and a "Sell a package"
  button. Payment cards show client, amount, method, status (use `status.*` words), receipt number.
- `/coach/billing/sell?clientId=`: a short form (client picker when no `clientId`, package picker with price and
  duration shown, start date defaulting to today, payment method, amount defaulting to the package price, optional
  proof upload, "mark as paid" switch shown only if the caller may verify). After success a confirmation card shows
  renewal date, days left and receipt number with a link to the payment.
- `/coach/billing/payments/[paymentId]`: detail with proof preview, verify / reject (reason required) / refund actions.
- `/coach/clients/[clientId]/subscription`: current subscription, countdown, ledger of events, extend / freeze /
  resume / cancel actions with reason, upcoming calendar events (read-only list).
- `/app/subscription` (client portal): the client's own countdown (days left, ends on, grace notice, expired notice
  with "contact your coach") through the `mine` endpoints; no coach-internal fields.

## Tests (Claude runs them)

Pure: weekday-keeping freeze arithmetic via the core functions as wired (not re-testing core), storage path safety
(`..`, absolute, wrong tenant prefix), upload type/size validation, money parsing. DB-backed (harness): the whole sell
flow gives a pending-then-active subscription, a receipt number `like` the tenant counter format and strictly
increasing across two payments (no gaps after a forced failed insert), generated events exist with
`source = 'package_rule'`; sync twice produces no duplicates; extension shifts future events and restores access;
freeze then resume; cancel cancels open events and keeps completed ones; a client-role caller cannot verify, reject,
refund or create payments (403) and sees only own rows; expired subscription: `requireActiveAccess` blocks a client route
with 403 `access_expired` while `GET /subscriptions/mine` and payment history still answer (the plan's acceptance;
mount `requireActiveAccess` on a throwaway test route inside the test, not in production code); staff without
`billing:verify` get 403 on verify; two concurrent verifies activate once; `sweepSubscriptions` moves
active -> grace -> expired on the right dates and is idempotent.

## Answer

Per the common rules. Also: the exact unique index used for calendar idempotency, the money column types, every
`app.audit`/`app.emit_event` name you used and the doc line allowing it, and anything in `packages/core` that did not
fit this flow.
