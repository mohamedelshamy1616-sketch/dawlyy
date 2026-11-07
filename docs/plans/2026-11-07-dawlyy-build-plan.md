# DAWLYY Build Plan (beta scope)

> **For agentic workers:** this plan is the contract between parallel builders (Claude main thread, Sonnet subagents, Codex in its own worktree, free-model sessions). Each task names its files, the interfaces it consumes and produces, and its acceptance check. Work only inside your task's files. Never change a shared interface without updating this document first.

**Goal:** A production-grade private beta of DAWLYY, the Online Coaching Operating System: a coach sells a package, activates a client, publishes a program and a nutrition plan, the client logs workouts (offline-safe) and check-ins, the coach reviews and renews, all in Arabic and English.

**Architecture:** One Next.js 16 app on Vercel serves the coach workspace, the client PWA and a Hono REST API under `/api/v1`. Supabase Postgres holds every tenant-owned row with Row Level Security; all reads and writes run through one authenticated transaction helper, so server components and API handlers share the same permission boundary. Pure domain logic (schedules, entitlements, state machines, versioning, comparisons, macro math) lives in `packages/core` with no database dependency.

**Tech Stack:** pnpm workspaces · Next.js 16.4 (App Router, Cache Components) · React 19 · TypeScript 5 · Hono + `@hono/zod-openapi` · Zod · Supabase (Postgres, Auth, Storage, Realtime) · Drizzle ORM + drizzle-kit SQL migrations · Tailwind CSS v4 + shadcn/ui (`rtl: true`) · next-intl · Serwist + Dexie (offline outbox) · Resend + React Email · Vitest · Playwright.

**Spec:** `docs/spec/DAWLYY_v4_spec.md` (authoritative), `docs/architecture/00-stack-decision.md`, `docs/architecture/01-codex-review-of-stack.md`, `docs/research/reports/DAWLYY competitor teardown 2026.md`.

## Global Constraints

- Spec §1: web app first; no physical PT booking, gym classes, POS or inventory.
- Spec §2 and §40: solo Owner runs everything without a team; every step is skippable; overrides never mutate master templates.
- Spec §3: every tenant-owned row carries `tenant_id`; isolation is enforced in Postgres (RLS) and in the API, never only in the UI.
- Spec §22: Start Date = Day 0; Tracking Day 1 = next calendar day; first weekly check-in = Start Date + 7 days unless overridden; four check-ins per four-week cycle when configured; VIP never creates daily check-ins.
- Spec §29: Draft → Review → Publish; published versions are immutable; edits create a new version.
- Spec §30: access state and payment state are separate; expiry restricts access but never deletes history.
- Spec §32: AI output is draft until a coach approves it (AI is out of beta scope; keep the `ai_requests` table and the draft/approve states).
- Spec §35 and §60: payments are manual records with proof in beta; a `PaymentProvider` abstraction exists; gateways come after beta.
- Spec §45: Arabic and English, RTL and LTR, in every screen; no direction or language assumption in business logic; kg/lb, cm/in, household measures.
- Spec §48: tests cover isolation (client A cannot read client B; staff cannot read unassigned clients), entitlement enforcement, immutable versions, offline sync without duplicates.
- Research: iOS has no background sync; outbox flushes in the foreground with client UUID idempotency keys. Egypt law 151/2020 needs Arabic consent texts before real clients.
- Codex review: Server Components must read through the same authenticated boundary; the runtime database role must not bypass RLS; tenant-only RLS does not protect client A from client B inside one tenant, so client-scoped tables also check `app.can_access_client`.
- Repo root: `C:\Users\compuline\Desktop\dawlyy`. Package manager: pnpm 12. Node 24. Windows paths; scripts must run in PowerShell 5.1 and Git Bash.

---

## Repository layout

```
dawlyy/
  package.json                 workspaces, root scripts (dev, build, test, lint, typecheck, db:*)
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example                 every variable documented
  apps/web/                    Next.js app: coach workspace, client PWA, API
    app/[locale]/(auth)/...    login, invite, reset
    app/[locale]/coach/...     coach workspace routes
    app/[locale]/app/...       client portal routes
    app/api/[[...route]]/route.ts   Hono entry
    src/api/                   Hono routers, one file per module
    src/server/                auth context, db access (withAuthTx), services glue
    src/components/            UI (shadcn primitives in src/components/ui)
    src/lib/                   client helpers, offline outbox, i18n helpers
    messages/ar.json, messages/en.json
    public/manifest.webmanifest, icons
  packages/core/               pure domain (no DB, no React)
    src/types/                 Zod schemas + TS types for documents and inputs
    src/schedule/              schedule generator
    src/entitlements/          resolver
    src/state/                 state machines
    src/versioning/            publish + diff helpers
    src/workout/               comparison, 1RM estimate, volume
    src/nutrition/             macro math, household measures, substitution
    src/forms/                 conditional-logic evaluator
    src/authz/                 permission matrix, role presets
    test/                      Vitest
  packages/db/                 Drizzle schema, migrations, RLS SQL, seeds, client factory
    src/schema/*.ts
    src/client.ts              withAuthTx / withServiceTx
    migrations/*.sql
    sql/0001_app_helpers.sql   app.* security-definer helpers
    seed/                      seed scripts and JSON data
    test/                      RLS isolation tests (run against a Postgres)
  tools/                       codex_build.py, free-model runbooks, scripts
  docs/                        spec, research, architecture, plans
```

## Shared conventions (every task obeys these)

### Identity and tenancy

- Primary keys are `uuid` with `gen_random_uuid()`. Every tenant-owned table has `tenant_id uuid not null references tenants(id)`, `created_at timestamptz not null default now()`, `updated_at timestamptz`, and where rows are user-authored `created_by uuid`.
- `memberships` links an auth user to a tenant with `role in ('owner','staff','client')`, `status in ('invited','active','disabled')`, `permissions jsonb` for staff, and `client_id` for clients. One active membership per user in beta.
- Staff client scope: `permissions.client_scope` is `'all'` or `'assigned'`; assignments live in `staff_client_assignments(membership_id, client_id)`.
- Postgres helpers in schema `app` (security definer, `search_path = ''`, all wrapped in `select` inside policies):
  - `app.membership()` → the caller's active membership row (`membership_id, tenant_id, role, client_id, permissions`).
  - `app.tenant_id()`, `app.role()`, `app.client_id()`.
  - `app.can_access_client(cid uuid) boolean` → owner: true; client: `cid = own client_id`; staff: `client_scope = 'all'` or assignment exists.
- Policy templates:
  - Tenant-only table (packages, exercises, foods, templates): `using (tenant_id = (select app.tenant_id()))`, `with check (tenant_id = (select app.tenant_id()) and (select app.role()) in ('owner','staff'))`.
  - Client-scoped table (subscriptions, sessions, logs, check-ins, messages, media): `using (tenant_id = (select app.tenant_id()) and (select app.can_access_client(client_id)))`.
  - Coach-private table (coach_notes, risk_flags, internal tasks): add `and (select app.role()) in ('owner','staff')`.
  - Index every column a policy reads: `(tenant_id)`, `(tenant_id, client_id)`.
- Runtime access (`packages/db/src/client.ts`):

```ts
export type AuthContext = {
  userId: string; tenantId: string; membershipId: string;
  role: 'owner' | 'staff' | 'client'; clientId?: string;
};
export function withAuthTx<T>(auth: AuthContext, fn: (tx: Tx) => Promise<T>): Promise<T>;
// BEGIN; select set_config('request.jwt.claims', <json with sub=userId>, true);
// select set_config('request.jwt.claim.sub', userId, true); SET LOCAL ROLE authenticated; fn; RESET ROLE; COMMIT
export function withServiceTx<T>(tenantId: string, reason: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
// service role (bypasses RLS) for jobs and seeds only; every query must filter by tenantId; logs reason to job_runs
```

- Server Components call services only through `withAuthTx(await requireAuth())`. There is no other way to get a database handle in `apps/web`.

### API

- Base path `/api/v1`. JSON only. Errors: `{ "error": { "code": "string", "message": "string", "details"?: unknown } }` with HTTP 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 422 state-transition refused.
- Lists: `?cursor=<opaque>&limit=<1..100>` → `{ "items": [...], "nextCursor": string | null }`.
- Every mutating route accepts an optional `Idempotency-Key` header; keys are stored in `idempotency_keys(tenant_id, key, response_hash, created_at)` for 24 hours.
- Auth: Supabase session cookie (`@supabase/ssr`) or `Authorization: Bearer <supabase access token>`. Middleware builds `AuthContext` from the session plus `memberships`.
- OpenAPI document at `/api/v1/openapi.json`, UI at `/api/v1/docs`.
- Routers export `const router = new OpenAPIHono<{ Variables: { auth: AuthContext } }>()` and are mounted in `src/api/index.ts`.

### Versioned documents

- Pattern for programs, nutrition plans, forms (intake), check-in templates and assessments: a head table plus a versions table.
  - `programs(id, tenant_id, name, kind 'template'|'client', template_id, client_id, current_version_id, archived_at)`
  - `program_versions(id, program_id, tenant_id, version_no int, status 'draft'|'in_review'|'approved'|'published'|'superseded'|'archived', document jsonb, change_note, published_at, published_by)`
- Publishing inserts a new version row with `status = 'published'` and sets the previous published row to `'superseded'`; it never updates a published document. Assigning a template to a client inserts a new head row with `kind = 'client'` and a copied document.
- Document shapes are Zod schemas in `packages/core/src/types` and are the only contract between builders and consumers:

```ts
// ProgramDocument
{ phases: [{ id, name, weeks: [{ id, index, days: [{ id, index, kind: 'training'|'rest', workout?: {
    id, name, blocks: [{ id, kind: 'warmup'|'main'|'superset'|'circuit'|'cardio'|'mobility'|'corrective'|'cooldown',
      items: [{ id, exerciseId, order, sets: [{ setNo, reps?: string, load?: { value, unit: 'kg'|'lb'|'%1rm'|'rpe-target' }, tempo?, restSec?, rpe?, rir?, durationSec?, distanceM?, note? }],
      progressionRule?: { type: 'reps'|'load'|'rpe', threshold, step }, coachNote? }] }] } }] }] }],
  startDate?: string, endDate?: string, reviewDate?: string, notes?: string }

// NutritionDocument
{ targets: { kcal, proteinG, carbsG, fatG, waterMl?, steps? }, dayTypes?: { training: targets, rest: targets },
  meals: [{ id, name, timeHint?, options: [{ id, items: [{ foodId, quantity, measure: { kind: 'g'|'ml'|'piece'|'cup'|'tbsp'|'tsp'|'slice'|'can'|'loaf'|'custom', label? }, rawOrCooked?: 'raw'|'cooked', approx: boolean }], macros: { kcal, proteinG, carbsG, fatG } }] }],
  supplements: [{ id, name, dose, unit, timing: 'with-meal'|'before-sleep'|'during-training'|'custom', mealId?, note? }],
  freeMealRule?: { perWeek, note }, instructions?: string }

// FormDocument (intake, check-in, assessment share this)
{ sections: [{ id, title, questions: [{ id, type: 'text'|'long_text'|'number'|'date'|'time'|'yes_no'|'single'|'multi'|'scale'|'photo'|'video'|'file',
    label, help?, required: boolean, options?: [{ value, label }], scale?: { min, max }, visibleIf?: { questionId, op: 'eq'|'neq'|'gt'|'lt'|'in', value } }] }] }
```

- Every `label`, `name`, `note` that a client sees is a `LocalizedText = { ar?: string; en?: string }`; UI falls back to the other language.

### States (spec §56) — implemented as transition tables in `packages/core/src/state`

- Subscription: `pending → active → grace → expired`, `active ↔ paused`, `active|grace|paused → cancelled`, `any → suspended → active`.
- Check-in event: `scheduled → due → submitted → waiting_for_coach → reviewed`, `scheduled|due → skipped|rescheduled|cancelled`, `due → overdue → submitted`.
- Workout session: `not_started → active ↔ paused`, `active|paused → completed|partially_completed|abandoned`, `not_started → skipped`.
- Media review: `requested → uploaded → processing → queued_for_review → approved|needs_resubmission|rejected → archived`.
- Publishing: `draft → in_review → approved → published → superseded|archived`, `draft → published` allowed for solo owner.
- Automation run: `pending → running → completed|failed|cancelled`, `failed → retrying → running`.

Transition helper signature: `transition(machine, from, event) → { ok: true, to } | { ok: false, reason }`.

### Tracking

- Scalar metrics in one table `metric_entries(id, tenant_id, client_id, metric 'weight'|'water'|'steps'|'sleep_hours'|'habit'|'cardio_minutes'|'custom', value numeric, unit, habit_id?, source 'manual'|'imported'|'device'|'ai_estimate', recorded_at timestamptz, tz text, client_uuid uuid unique per tenant, correction_of uuid, note)`.
- Specialized: `measurement_sets(document jsonb of {type, value, unit, side})`, `progress_photo_sets(poses jsonb of {pose, mediaId})`, `inbody_records(raw_media_id, fields jsonb, normalized jsonb)`.

### Calendar and jobs

- `calendar_events(id, tenant_id, client_id, type, status, due_at timestamptz, tz, window_days, source 'package_rule'|'manual'|'automation', rule_key, payload jsonb, completed_at, skipped_at, rescheduled_from)`.
- `generateSchedule` (core) produces events on package assignment; manual edits only touch one client's rows.
- `/api/cron/due-events` runs every 5 minutes (Vercel Cron, `CRON_SECRET` header), marks `scheduled → due → overdue`, and inserts `notifications` and `tasks` idempotently (`rule_key + event id + state` as the idempotency key). Reminders stop when the event is completed, skipped, rescheduled or cancelled.

### Offline outbox (client PWA)

- Dexie DB `dawlyy-outbox` keyed by `userId`; tables `sessions`, `setLogs`, `metrics`. Each record carries `client_uuid`, `client_updated_at`, `payload`.
- Flush on app open, `online`, `visibilitychange`, and a manual "Sync now" button; only when the signed-in user matches the outbox owner. Server routes upsert on `(tenant_id, client_uuid)`; set logs are last-write-wins by `client_updated_at`; session status is server-authoritative.
- UI shows an "unsynced" badge with the count.

### i18n and UI

- `next-intl` with `app/[locale]` (`ar`, `en`), `dir` from locale. Keys are namespaced by screen (`coach.clients.title`). Numbers and dates via `Intl` with the active locale; Arabic numerals policy: Western digits by default (coach-configurable later).
- Tailwind logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). No `left`/`right` classes without an `rtl:` counterpart.
- shadcn/ui installed with `rtl: true`. Design tokens live in `apps/web/app/globals.css`; Mohamed restyles there.
- Status words are fixed across the app (spec §61): Complete, Due, Overdue, Waiting for Coach, Waiting for Client, Needs Review, Expired, and their Arabic equivalents in `messages/ar.json` under `status.*`.

---

## Task list

Owner legend: **C** = Claude main thread, **S** = Sonnet subagent/workflow, **X** = Codex (pure TypeScript in its worktree, no DB, no network, no package changes), **F** = free-model session (data and catalogs only, validated by Zod).

### Task 0: Foundation scaffold — owner C

**Files:** root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.env.example`, `.gitignore`, `apps/web/*` (create-next-app output + Tailwind + shadcn init + next-intl + Hono entry), `packages/core/{package.json,tsconfig.json,src/index.ts}`, `packages/db/{package.json,drizzle.config.ts,src/client.ts}`, `.github/workflows/ci.yml`.

**Produces:** `withAuthTx`, `withServiceTx`, `requireAuth(): Promise<AuthContext>` (reads Supabase session, loads membership), Hono app at `/api/v1` with `/health`, `/openapi.json`, `/docs`; `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`.

**Acceptance:** `pnpm typecheck && pnpm build` pass; `GET /api/v1/health` returns `{ ok: true }`; `/ar` renders RTL and `/en` LTR shells; CI runs typecheck, lint, vitest.

### Task 1: Database schema v1 and RLS — owner C (S for boilerplate)

**Files:** `packages/db/src/schema/{tenants,memberships,clients,packages,subscriptions,payments,programs,exercises,nutrition,foods,forms,checkins,assessments,calendar,tracking,messaging,notifications,tasks,media,audit}.ts`, `packages/db/sql/0001_app_helpers.sql`, `packages/db/migrations/*`, `packages/db/test/rls.test.ts`.

**Produces:** every table named in this plan with `tenant_id`, RLS enabled and policies from the templates above; `app.*` helpers; `audit_log(id, tenant_id, actor_user_id, action, entity, entity_id, before jsonb, after jsonb, reason, created_at)`; `events(id, tenant_id, type, payload jsonb, created_at, processed_at)`.

**Acceptance:** RLS test creates tenants T1, T2, owner O1, staff S1 (assigned to client A only), clients A, B, C(T2); asserts through `withAuthTx`: A reads only A's rows; B cannot read A; S1 reads A not B; O1 reads A and B; nothing in T1 reads T2; `withServiceTx` filtered by tenant returns only that tenant. The test fails if the runtime role has `BYPASSRLS`.

### Task 2: Auth, tenant bootstrap, invitations — owner S

**Files:** `apps/web/app/[locale]/(auth)/{login,signup,invite/[token],reset}/page.tsx`, `apps/web/src/server/auth.ts`, `apps/web/src/api/auth.ts`, `packages/db/src/schema/invitations.ts`.

**Consumes:** `requireAuth`, `withAuthTx`, `memberships`.
**Produces:** sign-up creates `tenants` + owner `memberships` + `business_settings`; `POST /api/v1/invitations` (coach invites client or staff by email or phone) → `invitations(token, role, client_id?, expires_at)`; accept flow creates the user and membership; password reset and magic link via Supabase.

**Acceptance:** Playwright: owner signs up, invites a client, the client accepts and lands on `/app/today`; a staff invite with `client_scope = 'assigned'` sees only assigned clients.

### Task 3: Clients, packages, entitlements, subscriptions, manual payments — owner S

**Files:** `apps/web/app/[locale]/coach/{clients,clients/[clientId],packages,billing}/*`, `apps/web/src/api/{clients,packages,subscriptions,payments}.ts`, `packages/core/src/entitlements/*` (from Task X1), `packages/db/src/schema/{clients,packages,subscriptions,payments}.ts` (Task 1).

**Produces:** client CRUD with persistent Client ID (`clients.code` like `DW-000123`), search by name/code/phone/email/package/status/tag; package builder with `entitlements jsonb` (`{ key, enabled, frequency?, limit?, durationDays?, turnaroundHours?, mediaTypes?, note }`); `client_entitlement_overrides`; assigning a package creates a `subscriptions` row (`starts_on`, `ends_on`, state `pending`), calls `generateSchedule`, inserts `calendar_events`; manual `payments(amount, currency, method 'vodafone_cash'|'instapay'|'cash'|'bank'|'card_manual', proof_media_id, status 'pending'|'verified'|'rejected'|'refunded', verified_by, receipt_no)`; verifying a payment activates the subscription (`pending → active`); extension records `subscription_events(kind 'extension'|'freeze'|'resume'|'cancel', actor, reason, old_ends_on, new_ends_on)` and recalculates dependent events; countdown on the client subscription page.

**Acceptance:** API tests: override on client A leaves the package and client B unchanged; expired subscription blocks `/api/v1/me/program` with 403 `access_expired` but history endpoints still return data; extension restores access and shifts future calendar events.

### Task 4: Exercise library and program builder — owner S

**Files:** `apps/web/app/[locale]/coach/{exercises,programs,programs/[programId]}/*`, `apps/web/src/api/{exercises,programs}.ts`, `apps/web/src/components/program-builder/*`, `packages/db/seed/exercises.json` (Task F1), `packages/core/src/versioning/*` (Task X4).

**Produces:** exercises table with `name LocalizedText`, aliases, primary/secondary muscles, movement pattern, equipment, difficulty, unilateral flag, plane, compound flag, cues, mistakes, contraindications, progressions/regressions, alternatives, tags, `video_url`, `thumbnail_media_id`, `source 'system'|'coach'`, `hidden`; category tabs configurable in `business_settings.exercise_categories`; CSV import with column mapping, preview, duplicate detection, URL validation, row errors; program builder editing `ProgramDocument` (phases/weeks/days/blocks/items), save draft, publish (new version), assign template to client (client copy), version history list with diff summary.

**Acceptance:** assign one template to clients A and B, edit A's copy, assert the template and B unchanged (API test); a published version is rejected on PATCH with 409.

### Task 5: Client portal — Today, My Program, workout session (offline), history — owner S

**Files:** `apps/web/app/[locale]/app/{today,program,workout/[sessionId],history}/*`, `apps/web/src/lib/outbox/*`, `apps/web/app/sw.ts` (Serwist), `apps/web/src/api/{me,workout-sessions}.ts`, `packages/core/src/workout/*` (Task X5).

**Produces:** Today card list (workout, meals, water, steps, check-in, messages, due items); program view by phase/week; workout screen with exercise video, cues, planned sets, logging of actual reps/load/RPE/RIR, set tags (warmup/drop/failure), pain/difficulty note, skipped/modified status, rest timer with ±15 s, session timer with pause/resume, per-exercise history drawer (last 5 sessions), last comparable session shown before logging, finish summary with volume/reps/load/completion deltas and a "not comparable" flag; outbox sync as specified.

**Acceptance:** Playwright offline test: start session, go offline, log 3 sets, go online, assert 3 rows, no duplicates after a forced double flush; iOS Safari manual check recorded in `docs/qa/ios-pwa.md`.

### Task 6: Nutrition builder, foods, supplements, client nutrition — owner S (seeds by F)

**Files:** `apps/web/app/[locale]/coach/{nutrition,nutrition/[planId],foods}/*`, `apps/web/app/[locale]/app/nutrition/*`, `apps/web/src/api/{nutrition,foods,meal-logs}.ts`, `packages/db/seed/foods.json` (Task F2), `packages/core/src/nutrition/*` (Task X6).

**Produces:** foods table (`name LocalizedText`, aliases, `serving jsonb`, per-100 g macros, fiber, micronutrients jsonb, `raw_cooked`, `source 'db'|'label'|'estimate'|'coach'`, brand, `tenant_id` nullable for system rows), diet builder editing `NutritionDocument` with macro totals computed live, multiple options per meal, household measures with "approximate" badges, supplements grouped by timing, reuse of a prior client's plan with conflict flags (allergies, schedule, macro mismatch), publish versions; client view with option choice, meal log (`meal_logs`), water, supplements taken/skipped.

**Acceptance:** macro totals equal `packages/core` computations (unit tests), substitution returns equivalent grams within tolerance; a client can only read own plan.

### Task 7: Forms engine — intake, check-ins, assessments — owner S

**Files:** `apps/web/src/components/form-builder/*`, `apps/web/src/components/form-runner/*`, `apps/web/app/[locale]/coach/{intake,checkins,assessments}/*`, `apps/web/app/[locale]/app/{checkins,intake,assessment}/*`, `apps/web/src/api/{forms,submissions}.ts`, `packages/core/src/forms/*` (Task X7).

**Produces:** one builder/runner for `FormDocument` used by intake templates, check-in templates and assessment templates; conditional visibility via `evaluateVisibility`; submissions store `form_version_id` and answers jsonb; coach actions send/skip/mark-known/customize-for-client; completion status and missing required fields; check-in review queue with states from the check-in machine; assessment results per test with media and coach review states.

**Acceptance:** editing a template after a submission leaves the submission's version intact; a hidden-by-logic required question is not required.

### Task 8: Calendar, reminders, tracking, measurements, photos — owner S

**Files:** `apps/web/app/[locale]/coach/calendar/*`, `apps/web/app/[locale]/app/{tracking,progress}/*`, `apps/web/app/api/cron/due-events/route.ts`, `apps/web/src/api/{calendar,metrics,measurements,photos}.ts`, `packages/core/src/schedule/*` (Task X2).

**Produces:** coach calendar (day/week/month, filters) with add/edit/skip/reschedule/cancel; cron processor; tracking entry screens with coach-configured cadence (weigh-in days), missing-entry indicators; measurement sets and progress photo sets with private media, side-by-side compare and timeline; reminders via notifications (Task 9).

**Acceptance:** weekly weigh-in config generates no daily reminders; completing an event stops its reminders; Start Date + 7 and four-per-cycle generation asserted in core tests.

### Task 9: Messaging and notification center — owner S

**Files:** `apps/web/app/[locale]/{coach,app}/messages/*`, `apps/web/src/api/{conversations,notifications}.ts`, `apps/web/src/server/notify/*` (channels: inapp, webpush, email), `apps/web/emails/*` (React Email, RTL).

**Produces:** 1:1 conversations with text, images, video, files, voice notes (transcription deferred); Supabase Realtime subscription for new messages; `notifications(id, tenant_id, user_id, type, title, body, link, read_at)` and `notification_deliveries(channel, status 'queued'|'sent'|'delivered'|'failed'|'read'|'cancelled', provider_ref, attempts)`; quiet hours and language from user preferences; Web Push subscription storage; Resend sender.

**Acceptance:** sending a message creates one in-app notification and one email delivery row; retry does not duplicate (idempotency key).

### Task 10: Coach dashboard, action queue, Client 360, tasks — owner S

**Files:** `apps/web/app/[locale]/coach/{page.tsx,clients/[clientId]/timeline}/*`, `apps/web/src/api/{dashboard,tasks}.ts`, `packages/db/src/sql/dashboard_views.sql`.

**Produces:** counts (who needs attention, overdue check-ins, missing data, expiring subscriptions, pending payments, adherence decline) clickable into filtered queues; `tasks(id, tenant_id, client_id?, title, priority, due_at, assignee_membership_id, status, snoozed_until, source_event_id)`; Client 360 timeline merging subscriptions, submissions, versions, sessions, metrics, messages, payments; private coach notes visually distinct.

**Acceptance:** counts match SQL on seed data; staff see only assigned clients' counts.

### Task 11: Settings, team, permissions, branding, legal consent — owner S

**Files:** `apps/web/app/[locale]/coach/settings/{business,team,branding,language,legal}/*`, `apps/web/src/api/{settings,team}.ts`, `apps/web/app/[locale]/(legal)/{terms,privacy,consent}/*`, `packages/core/src/authz/*` (Task X8).

**Produces:** business settings (name, logo, default language, timezone, units, exercise categories, measurement templates), team invites with per-user permission editor built on the authz matrix and role presets, consent records (`consents(user_id, kind 'terms'|'privacy'|'health_data'|'photos'|'videos'|'communications', version, accepted_at, withdrawn_at, locale)`), Arabic and English legal pages with placeholders flagged for counsel.

**Acceptance:** API returns 403 for a staff member on a module not granted; consent is required before uploading photos.

### Task 12: Seed demo tenant, QA pass, staging — owner C (with S for Playwright)

**Files:** `packages/db/seed/demo.ts`, `apps/web/e2e/*`, `docs/qa/*`, `vercel.json`.

**Produces:** demo tenant with owner, one staff, 8 clients, 3 packages, 200 exercises, 300 foods, 2 programs, 2 diets, check-ins, payments; Playwright smoke suite (login, assign package, publish program, log workout offline, submit check-in, review, renew) in `ar` and `en`; staging deploy; restore drill documented.

**Acceptance (beta gate, from the Codex review):** invite/recovery → package assignment → proof upload → verification/receipt/refund → activation → published workout and nutrition → check-in review → renewal/freeze/extension with schedule recalculation all pass in Arabic and English; RLS suite green; restore from backup verified.

### Codex tasks (pure TypeScript in `packages/core`, worktree `dawlyy-wt-core`)

- **X1 entitlements:** `resolveEntitlements(packageEntitlements, overrides) → EffectiveEntitlement[]`, `can(effective, key, { now, usedThisPeriod }) → { allowed, reason, remaining }`. Tests: override wins, disabled key denies, limits per period, duration windows.
- **X2 schedule:** `generateSchedule({ startDate, timezone, endDate, rules }) → ScheduleEvent[]` honoring Day 0, +7 first check-in, four per four-week cycle, weigh-in cadences (`daily_fasted`, `days_of_week`, `weekly`, `custom`), technique window (first N weeks, cap per week), relative-to-end renewal reminders; DST-safe via date-fns-tz. Tests include a DST transition and a 29-day month.
- **X3 state machines:** the six transition tables with `transition()` and `canTransition()`; property tests that every state is reachable and terminal states accept no events.
- **X4 versioning:** `publish(versions, draftDocument) → { newVersion, supersededId }`, `diffDocuments(a, b) → DiffEntry[]` (added/removed/changed paths with labels for programs and nutrition).
- **X5 workout:** `compareSessions(current, previous) → Comparison` (volume, reps, load, completion %, deltas, `comparable: boolean` with reasons), `estimate1RM(load, reps)` (Epley), `sessionVolume`.
- **X6 nutrition:** `sumMacros(document)`, `convertMeasure(food, quantity, measure) → { grams, approx, assumption }`, `equivalentQuantity(fromFood, toFood, grams, rule: 'protein'|'carbs'|'kcal', tolerancePct)`.
- **X7 forms:** `evaluateVisibility(document, answers) → { visible: Set<questionId>, missingRequired: questionId[] }`, `validateAnswers(document, answers) → issues[]`.
- **X8 authz:** permission matrix (modules × actions), role presets (Coach, Assistant, Nutrition Coach, Assessment/Rehab Specialist, Business Manager) as editable templates, `isAllowed(membership, module, action, clientId?)`.

Rules for Codex: no `node_modules` changes, no package.json edits, no network, no database; return a diff plus a note on tests written; Claude runs Vitest and reviews before merge.

### Free-model tasks (data only, each validated by a Zod schema and reviewed)

- **F1 exercises seed:** 200 exercises as `packages/db/seed/exercises.json` matching `ExerciseSeed` schema: Arabic and English names, aliases, muscles, pattern, equipment, difficulty, cues (ar/en), common mistakes, contraindications, alternatives by name. No video URLs (coach adds).
- **F2 foods seed:** 300 Egyptian and common foods as `packages/db/seed/foods.json` matching `FoodSeed`: ar/en names, aliases, per-100 g macros flagged `source: 'estimate'`, household measures (ملعقة كبيرة، كوب، رغيف، قطعة) with gram assumptions, raw/cooked variants for rice, pasta, chicken, beef, potatoes, lentils, beans.
- **F3 message catalogs:** `messages/ar.json` and `messages/en.json` for every key listed in `apps/web/messages/keys.md`, Egyptian coaching register, plus `docs/glossary.md` of training and nutrition terms (ar, en, Franco as used by coaches).

---

## Execution order

1. Task 0 and Task 1 (Claude, now). Codex X1–X8 and free-model F1–F3 start in parallel immediately; they depend only on this document.
2. Tasks 2, 3, 4 (Sonnet, parallel once Task 1 lands).
3. Tasks 5, 6, 7 (parallel; 5 needs 4's program API, 6 needs F2, 7 is independent).
4. Tasks 8, 9, 10, 11 (parallel).
5. Task 12, then private beta.

Every task ends with: typecheck green, its acceptance check run with output pasted into the PR or the handoff note, and a Claude review before merge.
