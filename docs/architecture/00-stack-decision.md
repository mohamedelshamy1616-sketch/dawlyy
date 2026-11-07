# DAWLYY — Stack decision (PROPOSED, pending Owner approval)

Status: written 2026-11-07 by Claude after the competitor, market and stack research in `docs/research/`. Appendix B of the v4 spec requires the programmer to propose stack options with costs and trade-offs and obtain Owner approval before locking them in. This document is that proposal. Prices and limits were read from official pages on 2026-11-07 (see `docs/research/research_notes/DAWLYY competitor teardown 2026/technical_stack_validation.md`); re-check any figure before it drives a contract.

## What the spec forces

- Web app first, responsive. Client portal is mobile-first and must work during training on weak networks (offline logging, resumable uploads). Coach workspace is desktop-first with dense tables and builders.
- API-first: business rules (entitlements, expiry, approvals, versioning, schedule generation) run server-side and must be reusable by future native iOS/Android apps.
- Multi-tenant from day one, isolated server-side, with granular per-user permissions.
- Arabic/English, RTL/LTR everywhere, including PDF exports.
- Relational data with immutable published versions, audit log, event log and explicit state machines.
- Background work: reminders, stateful event-driven automations with idempotency, AI drafts, OCR, media processing, reports.
- Dev / staging / production, observability, backups, rate limiting, automated tests for isolation and entitlements.
- Built by a solo founder with AI coding agents; must launch fast and run cheaply in Egypt first.

## What the research changed

1. The confirmed competitive gap is operational trust, not feature count: Beprime and FitXpert both confirm client payments by hand over WhatsApp, ship thin trust signals, and FitXpert shipped a regression that removed decimal weight entry. DAWLYY wins by making selling a package, receiving money, activating the client and renewing automatic and reliable. The spec defers payment gateways from MVP; this proposal keeps manual payment records in P0 but moves Paymob (tokenised recurring, Fawry cash codes) to the first post-beta slice. That is a scope change for the Owner to approve (spec §60).
2. Egypt's Personal Data Protection Law 151/2020 has executive regulations (issued 1 Nov 2025, compliance window of one year, so enforcement is plausibly live now). They require a controller licence, a cross-border transfer permit (cloud hosting abroad counts), written Arabic consent for sensitive data, a data protection officer and 72-hour breach notice. Body photos, weight and injuries are plausibly sensitive data. A Frankfurt database is a transfer. Egyptian counsel must decide between a transfer permit and in-Egypt hosting before launch; the architecture below keeps the database portable so either answer works.
3. Supabase has no Middle East or Africa region; Frankfurt is the nearest. Supabase had several 2026 incidents, so daily logical backups are stored outside Supabase.
4. iOS has no background sync for web apps. Offline logging flushes in the foreground with idempotency keys, shows an unsynced indicator and a manual sync button, and asks clients to install the PWA (also required for iOS push).
5. SMS to Egypt costs about $0.40 per message via Twilio (vendor guide) versus about $0.004 for a WhatsApp authentication message. Default login is email + password / magic link; WhatsApp OTP via Twilio Verify is the phone path; plain SMS is the fallback.
6. Vercel Hobby is non-commercial only, so Vercel Pro ($20/month) applies from the first paying customer. Next.js 16.4 is the stable line; it ships security releases about monthly, so the minor is pinned and a monthly upgrade slot is reserved.
7. Arabic PDF through headless Chromium works only with bundled Arabic fonts; a deployed smoke test is required and a container renderer (Gotenberg) is the fallback.
8. Nutrition is the weakest layer at every competitor and no global platform evidences Arabic or RTL. Egyptian food data must be curated by hand (the National Nutrition Institute tables are not open data; Open Food Facts is ODbL share-alike and needs counsel's view).

## Recommended stack (Option A)

| Layer | Choice | Why |
|---|---|---|
| Repo | pnpm workspaces + Turborepo monorepo | One repo, shared TypeScript packages, future `apps/mobile` (Expo) reuses domain code and the API client |
| Web app | Next.js 16.4 (App Router, Cache Components on, pinned minor) on Vercel Pro | Coach workspace + client portal (installable PWA) in one deployable; React Server Components for fast dashboards; mature i18n and RTL ecosystem |
| API | Hono mounted inside Next.js at `/api/v1/*`, Zod schemas, OpenAPI generated with `@hono/zod-openapi`, typed client via `hono/client` | Documented REST contract from day one (spec §53); Hono is framework-independent, so the same API can move to a standalone server when native apps need it |
| Domain | `packages/core`: pure TypeScript services, state machines, schedule generator, entitlement engine, versioning, authz | Testable without a database; one implementation called by the API (and by server components for reads) |
| Database | Supabase Postgres (Pro, Frankfurt), Drizzle ORM, SQL migrations, Row Level Security on every tenant-owned table | Relational constraints the spec demands; RLS gives defense in depth for tenant isolation; Drizzle declares policies in TypeScript beside the schema. Plain Postgres underneath keeps the data portable if counsel requires in-Egypt hosting |
| Tenancy model | `tenant_id` on every row; RLS policies keyed on JWT claims stored in `raw_app_meta_data`; every policy column indexed; `(select auth.uid())` wrapping; security-definer helpers; API runs each request in a transaction with the caller's claims set; application-level permission checks (module × action × client assignment) on top; service-role connections only in jobs that are explicitly tenant-filtered | Passes the two-tenant and staff-assignment acceptance tests even if a service forgets a WHERE clause |
| Auth | Supabase Auth: email + password, magic link, password reset, TOTP MFA for coaches; WhatsApp OTP via Twilio Verify behind a flag; CAPTCHA and rate limits on OTP | Spec §4 covered; avoids $0.40 SMS |
| Storage | Supabase Storage private buckets, TUS resumable uploads (6 MB chunks, foreground on iOS), signed expiring URLs, thumbnails generated in a job (image transforms cost beyond 100 origin images); video transcoding later via Cloudflare Stream or Mux behind a flag | Spec §38 and §43 reliability and privacy without building an upload service |
| Realtime | Supabase Realtime channels for messaging and live dashboard updates (500 concurrent connections on Pro) | Chat and "clients training now" updates without a separate websocket server |
| Jobs & automation | Inngest (durable functions: events, steps, sleepUntil, waitForEvent, idempotency keys, retries, cron) running inside the Next.js deployment; event bus abstracted in `packages/core/events`; simple cron reminders may run on pg_cron | Maps onto spec §31 Trigger → Conditions → Action → Notification → Escalation → Completion with job status for the UI (§46). Free tier pauses at 50k step executions/month, so usage is monitored and the abstraction allows a switch to Trigger.dev Hobby ($10) or Inngest Pro ($99) when volume grows |
| Notifications | In-app table + Realtime; Web Push (VAPID) for installed PWA; Resend for email with React Email RTL templates (Pro $20 when volume needs it); WhatsApp utility templates via a BSP after Meta verification; SMS adapter as fallback | Spec §25 delivery states tracked in a `notification_deliveries` table |
| i18n | next-intl with `/ar` and `/en` routing, ICU messages, `dir` switching; Tailwind logical utilities (`ms-*`, `ps-*`, `start-*`, `end-*`) from day one | Arabic and English first-class; no direction assumptions in business logic (§45) |
| UI | Tailwind CSS v4 + shadcn/ui with `rtl: true` in `components.json`, inside `packages/ui`; DAWLYY tokens, type and screens owned by Mohamed | Accessible primitives; Calendar, Pagination and Sidebar need manual RTL fixes; the visual language is the Owner's design, not a template |
| Offline | Serwist (Turbopack package) service worker + Dexie (IndexedDB) outbox; client-generated UUIDs as idempotency keys; server upsert on (tenant_id, client_uuid); foreground flush on open, online and visibility events; unsynced indicator and manual sync | Spec §13 and §48: no lost or duplicated set logs; no reliance on iOS background sync |
| PDF | HTML → PDF with headless Chromium (Playwright + `@sparticuz/chromium`) in a Node function with bundled Arabic fonts (Noto Naskh Arabic or Cairo); Gotenberg container as fallback | Only path that shapes Arabic and RTL reliably (§44). P1, smoke-tested on a deployed Arabic PDF with numerals, mixed names and tables |
| Payments | P0: manual records with proof upload (Vodafone Cash, InstaPay, cash, bank) behind a `PaymentProvider` abstraction. First post-beta slice: Paymob tokenised subscriptions + Fawry cash codes; Stripe only via a foreign entity later | The confirmed competitive gap; spec §35 abstraction honoured |
| AI | Vercel AI SDK with the Anthropic provider: Haiku 5.5 ($0.10 in / $0.50 out per million tokens) for drafts and classification, Sonnet 5.5 ($2 / $10) for complex plans; Zod-validated structured outputs; `ai_requests` audit table; draft → review → approve → publish | Spec §32 governance; provider abstraction for fallbacks. P1/P2 |
| Observability | Sentry (errors), Vercel logs, Inngest dashboard (jobs), Supabase logs, PostHog (product analytics §36); status banner in the app | Free tiers at launch |
| Backups | Supabase daily backups plus a nightly `pg_dump` to a separate bucket (Cloudflare R2 or Backblaze B2); restore drill before launch; PITR add-on when revenue allows | Spec §46; 2026 Supabase incidents |
| Testing | Vitest for `packages/core`; Playwright e2e including Arabic RTL runs; SQL (pgTAP) tests for RLS isolation; CI on GitHub Actions with a Postgres service container; regression test per shipped bug | Spec §48 scenarios become executable tests |
| Environments | dev (local Next.js against a hosted dev Supabase project; Docker Desktop only if local Supabase is wanted later), staging (Vercel preview + staging Supabase), production | Separate secrets and data (§46) |

### Estimated running cost at launch

Vercel Pro $20/month, Supabase Pro $25/month, Resend $0 to $20, Inngest $0 (free tier) and Sentry / PostHog free tiers, domain about $15/year. About $45–75 per month before WhatsApp/SMS and AI usage. WhatsApp authentication and utility messages cost roughly $0.004 each to Egypt; AI drafts on Haiku cost cents per client per month.

### Proposed answers to Appendix B open decisions

1. Stack, hosting, database, storage: as above. Database region Frankfurt unless counsel requires in-Egypt hosting.
2. Auth provider: Supabase Auth. Email via Resend. Phone via WhatsApp OTP (Twilio Verify) behind a flag; SMS fallback.
3. Media pipeline: Supabase Storage + job-generated thumbnails now; video transcoding behind a flag later; egress watched in the usage dashboard.
4. AI providers: Anthropic Claude via Vercel AI SDK, usage metered per tenant in `ai_requests`; model ids pinned; cost per active client estimated once drafts are live.
5. Notification channels in release 1: in-app, web push, email. WhatsApp utility templates once BSP verification completes; SMS later.
6. Payments: manual records in P0; Paymob + Fawry in the first post-beta slice (Owner approval needed for the scope change).
7. Design system: Mohamed owns tokens, type and screens; engineering supplies the component primitives and RTL behaviour.
8. Retention and backups: daily Supabase backups plus nightly external dump, restore drill before launch, media retention configurable per tenant, RPO 24h / RTO 4h as initial targets.
9. Launch languages: Arabic and English from day one.
10. Legal: Egyptian counsel engaged before launch for Law 151/2020 licence, transfer permit or hosting decision, Arabic consent texts, DPO and breach procedure.
11. Milestones: see the launch plan below.

### Spike before locking (one day, runs in parallel with slice 1)

- Cairo to Frankfurt latency from a real Egyptian connection against a test Supabase project.
- WhatsApp OTP via Twilio Verify to an Egyptian number: delivery and cost.
- Arabic PDF rendered from a deployed Vercel function with bundled fonts.
- iOS Safari PWA: offline set logging, foreground flush, push after Home Screen install.

## Alternatives considered

- Expo universal app (web + native from one codebase): tempting because competitors live in the App Store, but Expo web is weak for a dense desktop coach workspace, drag-and-drop builders, RTL web and PDF. Plan instead: Expo later for the client app, sharing `packages/core` and the API.
- Flutter + Firebase: Firestore is document-oriented; the spec's constraints, versioning, audit and reporting need relational SQL and RLS-style isolation. Flutter web is a poor fit for the coach workspace. Agent tooling is thinner.
- Laravel + Inertia + Postgres: the credible plan B. Excellent batteries (queues, notifications, PDF), but no PHP toolchain on this machine, a second language once native apps arrive, and slower agent velocity than TypeScript end to end.
- FastAPI + React: matches the owner's other Python tools, but needs separate hosting for API, worker and Redis, and auth/storage/realtime are do-it-yourself. Slower to a production launch for one person.

## Build team and method

- Claude (main thread): architecture, schema, implementation plans, review gates, verification before anything is called done.
- Sonnet subagents and workflows: implement well-specified modules; a few in parallel.
- Codex: self-contained modules in its own worktree, reviewed before merge.
- TDD on `packages/core` (schedule generation, state machines, entitlements, versioning). Playwright and RLS tests before each staging release. Every shipped bug gets a regression test (FitXpert's decimal-weight regression is the cautionary tale).

## Launch plan (vertical slices, each deployable to staging)

0. Now: stack approval, brand tokens from Mohamed, accounts (GitHub repo, Supabase, Vercel, Resend, Inngest), repo scaffold, CI, the one-day spike.
1. Tenant + Owner + Auth, clients, packages and entitlements, subscription state machine, audit log.
2. Exercise library (Arabic/English, categories, video), program builder, draft → publish versioning.
3. Client portal: Today, My Program, workout session with offline logging, per-exercise history, last-session comparison, rest timer.
4. Nutrition builder, food database with Egyptian seed and household measures, supplements.
5. Check-ins, calendar and reminders (Inngest), tracking (weight, water, steps, sleep, habits).
6. Messaging and notification center.
7. Coach dashboard / Action Queue and Client 360.
8. Intake builder (forms with conditional logic), optional assessment basics.
9. Arabic/English polish, PDF export (P1), seed demo tenant, isolation and entitlement test suite, legal texts and consents, staging → production.
10. First post-beta slice: Paymob + Fawry payments and automatic activation/renewal.

Private beta with DAWLYY's own coach and first clients is possible after slices 1–3, 5 and 6. Full P0 follows. Native apps (Expo) come after the web MVP is stable.

## Decisions the Owner must make now

1. Approve Option A (default: yes).
2. Approve moving Paymob/Fawry to the first post-beta slice (default: yes; spec said deferred).
3. Engage Egyptian counsel on Law 151/2020 before launch (default: yes; hosting stays Frankfurt until counsel says otherwise).
4. Who is the first coach and what are the first packages, so seed data is real.
5. Brand assets: logo, palette, Arabic and Latin typefaces. Domain name.
6. Which email owns the GitHub, Supabase, Vercel, Resend and Inngest accounts.
7. Confirm which product the spec means by "FitStation / FitSTN" (Fitstn, the Egyptian per-coach app, or the unrelated US FitStation).
