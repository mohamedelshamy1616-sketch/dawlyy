# DAWLYY technical stack validation (read 2026-11-07)

Method note: prices and limits below were read from official pages on 2026-11-07 through a fetch tool that summarizes pages with a small model. Re-check any figure before it drives a contract or budget. Items without a primary source are in Gaps or Inferences, not Cited Findings.

## Next.js and Vercel: current version, App Router changes, plan limits, Middle East notes

### Takeaway
Next.js 16.4 (2026-10-06) is the latest stable line. Cache Components is now recommended for new apps and becomes the default in Next.js 17. Vercel Hobby is non-commercial only, so DAWLYY needs Pro ($20/month per developer seat) from the first paying customer. Next.js ships security releases roughly monthly, so pinning plus an upgrade routine is mandatory.

### Cited Findings
- Next.js 16.4 was published 2026-10-06. It includes React 19.3, lazy compilation, smaller Turbopack output and Cache Components improvements. — [Next.js blog index](https://nextjs.org/blog), [Next.js 16.4](https://nextjs.org/blog/next-16-4)
- Cache Components (`'use cache'`, `cacheComponents: true`, `partialPrefetching: true`) "will become the default in Next.js 17". From 16.4, new `create-next-app` projects have it enabled by default, and the team recommends it for every app. — [Next.js 16.4](https://nextjs.org/blog/next-16-4)
- Next.js 16.4 added `ensureStatic`, and the `navigation()` and `prefetch()` APIs for deferring work out of prefetches. — [Next.js 16.4](https://nextjs.org/blog/next-16-4)
- Next.js 16 (2025-10-21) made Turbopack stable and introduced Cache Components and React Compiler support. — [Next.js blog index](https://nextjs.org/blog)
- Security cadence: scheduled security releases on 2026-07-20, 08-25, 09-30 and 11-03, plus out-of-band updates on 2026-09-22 and 2026-10-14 (the October one covered two Critical and one High upstream vulnerabilities). Earlier, in December 2025, critical React Server Components vulnerabilities (CVE-2025-66478) required urgent upgrades. — [Next.js blog index](https://nextjs.org/blog)
- Next.js 16.2 (2026-03-25) shipped a stable Adapter API, with a working group for deployment on other platforms (OpenNext). — [Next.js blog index](https://nextjs.org/blog)
- Vercel Hobby is $0 and "for personal, non-commercial use only", with 1 developer seat and 100 GB fast data transfer. Pro is $20/month and includes a $20 usage credit, 1 TB bandwidth, and $20/month per extra developer seat. Cron jobs are on both. — [Vercel pricing](https://vercel.com/pricing)
- Function max duration is 300s on the first plan column and 800s on the second (up to 1800s in beta). The page's column order is not labeled in the extract, so Hobby = 300s and Pro = 800s is assumed. — [Vercel limits](https://vercel.com/docs/limits) (page last updated 2026-09-16)

### Inferences
- Budget Vercel Pro from launch because the Hobby plan forbids commercial use. A solo founder pays $20/month for one seat.
- Pin the Next.js minor, enable `experimental.agentUpgrade: 'security'` (default policy in 16.4), and schedule a monthly upgrade slot. The security-release rhythm is the main operational cost of this framework choice.
- Starting greenfield on Cache Components avoids a later migration to Next.js 17, but AI coding agents trained on older App Router patterns may emit the old implicit-caching style. Add the first-party Next.js agent skills and AGENTS.md to the repo.

### Gaps
- No Vercel Middle East edge/region note was found. Vercel's region list was not fetched. Which Vercel function region to pair with a Frankfurt Supabase database is unverified.
- Function bundle size limit (relevant for Chromium PDF) and request body limit were not extracted. They were in the saved limits page but not confirmed here.

## Supabase: pricing, regions, RLS, Auth, Storage, Realtime, background work, local dev, incidents

### Takeaway
Supabase Pro at $25/month is sufficient for MVP scale. There is no Middle East or Africa region, so Frankfurt (eu-central-1) is the nearest option. RLS multi-tenancy works if every policy column is indexed, auth calls are wrapped in `select`, and tenant membership goes through security definer helpers. Phone OTP costs come from a third-party SMS provider, not Supabase. 2026 incident volume is high enough to need a backup and degrade-gracefully plan.

### Cited Findings
- Plans: Free $0 (2 active projects, paused after 1 week of inactivity), Pro from $25/month, Team from $599/month. Pro and Team include $10/month compute credit covering one Micro instance. — [Supabase pricing](https://supabase.com/pricing)
- Pro quotas: 100,000 MAU (then $0.00325 per MAU), 8 GB database (then $0.125/GB), 100 GB storage (then $0.0213/GB), 250 GB egress (then $0.09/GB), 500 realtime concurrent connections (then $10 per 1,000), 5M realtime messages (then $2.50 per million), 3 MB max realtime message. Free: 50,000 MAU, 500 MB database, 1 GB storage, 5 GB egress, 200 realtime connections, 2M messages. — [Supabase pricing](https://supabase.com/pricing)
- Max upload size is 50 MB on Free. The page extract listed "500 GB" for Pro, which should be verified against the storage docs before relying on it. — [Supabase pricing](https://supabase.com/pricing)
- Compute add-ons per month: Micro $10 (1 GB, shared), Small $15 (2 GB, shared), Medium $60 (4 GB, shared), Large $110 (8 GB, 2 vCPU dedicated), XL $210, 2XL $410. — [Supabase pricing](https://supabase.com/pricing)
- Advanced MFA (Phone) costs $75/month for the first project. The pricing page lists no per-SMS rates, and a custom send-email/SMS auth hook is available on Free, Pro and Team. — [Supabase pricing](https://supabase.com/pricing)
- Regions: US (East N. Virginia, East Ohio, West N. California, West Oregon), Canada, Europe (Ireland, London, Paris, Frankfurt, Zurich, Stockholm), South Asia (Mumbai), Asia-Pacific (Singapore, Tokyo, Seoul, Sydney), South America (Sao Paulo). No Bahrain, UAE, Middle East or Africa region is listed. — [Supabase regions](https://supabase.com/docs/guides/platform/regions)
- RLS performance: index every column used in policies (a column counts only as the first column of a btree index); write `(select auth.uid())` so Postgres caches it as an initPlan; use `security definer` functions with `search_path = ''` in a non-exposed schema for cross-table lookups; always name the role with `to authenticated`; policies that read each other cause `42P17` recursion. — [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- JWT claims: keep authorization data in `raw_app_meta_data` (users cannot edit it, unlike `raw_user_meta_data`); claims refresh only when the token refreshes; keep claims small because cookie-based auth can hit the 4096-byte cookie limit. — [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Phone auth providers: MessageBird, Twilio, Vonage, TextLocal (community). WhatsApp OTP works only via Twilio and Twilio Verify. Default limits: one OTP per 60 seconds per user, 1-hour expiry. CAPTCHA is recommended to limit SMS abuse and cost. The page itself is inconsistent about the verification window (60 seconds in examples versus 1 hour). — [Supabase phone login](https://supabase.com/docs/guides/auth/phone-login)
- Resumable uploads use TUS at `https://{project-id}.storage.supabase.co/storage/v1/upload/resumable`, fixed 6 MB chunks, upload URL valid up to 24 hours, only one client can write to a given upload URL (others get 409), recommended for files over 6 MB. Libraries: tus-js-client, Uppy. Individual signed upload URLs cannot be revoked (rotate the signing key to revoke all). — [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- Image transformations need Pro or above. Width and height 1 to 2500 px, source up to 25 MB and 50 MP, 100 origin images included, then $5 per 1,000 origin images. WebP is served automatically; the docs conflict on AVIF output. HEIC is a supported source but not a supported result. — [Supabase image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations)
- Edge Functions: wall clock 150s Free / 400s paid, 2s CPU per request, 256 MB memory, 20 MB bundle (CLI bundling). — [Supabase Edge Function limits](https://supabase.com/docs/guides/functions/limits)
- Supabase Queues is a Postgres-native durable queue on pgmq with visibility windows, optional archive, and RLS-controlled access. The page states no GA/beta status and no limits. — [Supabase Queues](https://supabase.com/docs/guides/queues)
- Local development: `supabase start` needs a Docker-compatible container manager (Docker Desktop recommended on Windows). Experimental `supabase stack` runs without Docker only on Linux and Apple-silicon macOS. Only one local project per machine on default ports. — [Supabase local development](https://supabase.com/docs/guides/local-development)
- Incidents: 2026-02-12 us-east-2 outage of about 3h42m, with an official postmortem that admits slow announcement. Third-party trackers list further 2026 incidents (April 27 multi-region, May 8-9 us-east-1 AZ, July 17 project actions, September 3 about 8.1 hours of failed lifecycle operations, September 24 dashboard/database issues), most without postmortems. — [Supabase postmortem](https://supabase.com/blog/supabase-incident-on-february-12-2026), [IsDown tracker](https://isdown.app/status/supabase/incidents/649280-project-lifecycle-actions-creations-restarts-configuration-and-compute-size-updates-showing-increased-error-rates), [UptimeRobot](https://uptimerobot.com/is-it-down/supabase/2026-09-24/)

### Inferences
- Frankfurt is the likely best region for Egypt. The regions page names no distance; this rests on geography and not on any measured Cairo latency.
- Egyptian SMS delivery through Twilio, and its cost, is unverified. Plan for WhatsApp OTP via Twilio Verify and an email/magic-link fallback, and use the custom SMS hook if a local aggregator is cheaper.
- Pro $25 plus Micro is covered by the compute credit. Image transformations (Pro) and the 100-origin quota matter: with many client progress photos, pre-generate thumbnails client-side or in a job and avoid per-request transformation costs ($5 per 1,000 origin images beyond 100).
- Edge Function 2s CPU is too tight for PDF rendering or heavy AI work, so those belong in the Vercel/Node or a separate worker side.
- Third-party trackers show many incidents (lifecycle failures were the common type). Running data-plane traffic was less affected than project lifecycle actions, but the evidence is thin; treat availability as a risk and keep daily backups outside Supabase.
- Docker Desktop on the founder's Windows machine is required for local dev. Budget for it.

### Gaps
- Supabase branching status and pricing: not found in fetched pages.
- Realtime chat-specific limits (per-channel rates, presence): only plan-level quotas were read.
- pg_cron and pg_net limits: not retrieved.
- Magic link and MFA (TOTP) details: not fetched.
- Measured latency Cairo to Frankfurt: not found.
- Whether the SMS price per message to Egypt is acceptable: no source.

## Drizzle versus Prisma for Supabase with RLS

### Takeaway
Drizzle has first-class RLS declarations (`pgPolicy`, `pgRole`, `.withRLS()`), Supabase-specific role and helper exports, and a documented drizzle-kit path for existing Supabase roles. The Supabase request-scoped client wrapper is still in an external example repo. Prisma was not researched.

### Cited Findings
- Drizzle: `pgTable.withRLS()` enables RLS; adding a policy enables it automatically; `pgPolicy` takes `as`, `to`, `for`, `using`, `withCheck`; `.link(table)` attaches policies to existing tables; `pgRole(...).existing()` marks roles drizzle-kit must not manage. — [Drizzle RLS docs](https://orm.drizzle.team/docs/rls)
- `drizzle-orm/supabase` exports Supabase roles (`anon`, `authenticated`, `service_role`), `auth.users`, `realtime.messages`, and `authUid`, `realtimeTopic` helpers. drizzle-kit role management is off by default and enabled with `entities.roles` and `provider: 'supabase'`. — [Drizzle RLS docs](https://orm.drizzle.team/docs/rls)
- Caveats: TRUNCATE and REFERENCES bypass row security; provider role lists may lag; the `createDrizzle` Supabase wrapper "is currently in an external example repo" and is planned to move into `drizzle-orm/supabase`. The page links a v1.0 upgrade guide and v1.0 beta but does not say how RLS maps to versions. — [Drizzle RLS docs](https://orm.drizzle.team/docs/rls)

### Inferences
- Drizzle fits the plan: RLS policies live in TypeScript beside the schema and migrations, which suits AI coding agents. Test policies with pgTAP or SQL tests regardless, because an ORM definition is not proof of isolation.
- If the app connects with a service/owner role, RLS is bypassed; decide per code path whether it uses the user's JWT-scoped connection or an explicitly tenant-filtered server role.

### Gaps
- Prisma's 2026 RLS story, Supabase's own current ORM recommendation, and Drizzle's current stable version (v1.0 status) were not verified.

## Offline PWA: Serwist, IndexedDB, sync patterns, iOS limits

### Takeaway
Serwist supports Next.js through `@serwist/next` (webpack) and `@serwist/turbopack`, so it works with the Turbopack default. iOS has no Background Sync, so offline workout logging must flush from the foreground (on open, `online`, and visibility events). iOS storage eviction behavior for installed PWAs is disputed in the sources found.

### Cited Findings
- `@serwist/next` guide targets webpack; Turbopack uses a separate `@serwist/turbopack` package with `createSerwistRoute`, `SerwistProvider` and esbuild. Serwist 10 and newer supports only Next.js 15.0.0 and above. The docs make no mention of Next.js 16. — [Serwist Next.js getting started](https://serwist.pages.dev/docs/next/getting-started), [Serwist Turbopack](https://serwist.pages.dev/docs/next/turbo)
- iOS and iPadOS 16.4 added Web Push for Home Screen web apps. The site must be installed, have a manifest with `display: standalone` or `fullscreen`, and request permission in response to a direct user gesture. No Apple Developer Program membership is needed. — [WebKit blog, 2023-02-16](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- Secondary sources (developer blogs, forums, a March 2026 Reddit thread) report Safari's 7-day purge of script-writable storage for sites not installed, unsupported Background Sync on iOS, and iOS ending a backgrounded PWA's process quickly. Sources disagree on whether Home Screen installs are exempt from the 7-day eviction. — [MagicBell guide](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide), [Apple forum thread](https://developer.apple.com/forums/thread/710157), [Habr article](https://habr.com/en/articles/989862)

### Inferences
- Design the outbox so it never depends on background execution: every queued log carries a client-generated UUID idempotency key, the server upserts on it, and the client retries on app open, connectivity return, and a manual "sync now" button.
- Treat IndexedDB as a cache plus short-lived outbox, with the server as the source of truth. Ask clients to install the PWA (also required for iOS push). Show an unsynced-items indicator.
- Large video uploads from iOS should be foreground with TUS resume; do not promise background upload.

### Gaps
- No primary Apple/WebKit source was found for current iOS storage eviction or `storage.persist()` behavior. Dexie status and outbox pattern references were not fetched. Android Chrome push and Background Sync behavior in 2026 was not researched.

## Durable automations: Inngest vs Trigger.dev vs Supabase Queues

### Takeaway
Both Inngest and Trigger.dev support long waits and idempotency. Inngest's free tier is tight (5 concurrent steps, 50k executions, hard pause at quota); Trigger.dev's free tier is $5 of compute credits. Both paid entry tiers cost $10 to $99 per month.

### Cited Findings
- Inngest Free: 50k executions/month with no overage (execution pauses at quota), 5 concurrent steps, 24-hour trace history, 5 seats. Pro from $99/month: 1M executions, 100 concurrent steps, 7-day history. Business from $499/month. — [Inngest pricing](https://www.inngest.com/pricing)
- Inngest `step.waitForEvent` takes a timeout (for example "7d"), matches by `match` or a CEL `if`, and uses a stable step `id` to memoize state; a losing waitForEvent in a parallel race stays active until its timeout. — [Inngest waitForEvent docs](https://www.inngest.com/docs/reference/functions/step-wait-for-event)
- Trigger.dev Free: $5 compute credit/month, 20 concurrent runs, 10 schedules, 1-day logs. Hobby $10/month ($10 credit, 50 concurrent, 100 schedules, 7-day logs). Pro $50/month ($50 credit, 200+ concurrent, 1,000+ schedules, 30-day logs). Waits longer than 5 seconds are checkpointed and do not count toward compute. — [Trigger.dev pricing](https://trigger.dev/pricing)
- Trigger.dev wait tokens support human-in-the-loop approval, a `timeout` (never times out if omitted), and `idempotencyKey` with an optional TTL. — [Trigger.dev wait tokens](https://trigger.dev/docs/wait-for-token)
- Supabase Queues (pgmq) offers durable Postgres-native queues with visibility windows and RLS-controlled access; the page states no status or limits. — [Supabase Queues](https://supabase.com/docs/guides/queues)

### Inferences
- A free-tier hard stop at 50k Inngest executions would pause automations silently; Trigger.dev's Hobby at $10/month is the cheapest paid tier with real headroom. For DAWLYY's event-driven flows (client missed a check-in, wait for reply, nudge), either fits; Inngest's event model maps most directly to "wait for event with timeout".
- For the first months, pg_cron plus Supabase Queues can handle scheduled reminders at zero added vendor cost, but long multi-step flows with branching are easier to maintain in Inngest or Trigger.dev.

### Gaps
- Inngest Vercel integration details, Trigger.dev self-hosting and 2026 status, and the Trigger.dev run-duration limits were not verified. Inngest `step.sleep` maximum was not on the fetched page.

## Arabic PDF export

### Takeaway
Headless Chromium shapes Arabic correctly (it uses a real shaping engine) as long as an Arabic font is actually available to it. `@sparticuz/chromium` ships only Open Sans, so Arabic fonts must be added. The Vercel path is a known source of breakage and needs a deployed smoke test.

### Cited Findings
- `@sparticuz/chromium` bundles Open Sans (Latin, Greek, Cyrillic) and no Arabic. Fonts can be added from `.fonts`/`fonts` directories or a Lambda layer. — [Sparticuz/chromium README](https://github.com/Sparticuz/chromium)
- Supported runtimes are current AWS Lambda Node.js versions (the README lists nodejs20.x and nodejs22.x). It needs at least 512 MB RAM (1600 MB or more recommended), bundlers must treat the package as external, and the project does not follow semver (breaking changes can land in patch releases). The binary is over 50 MB (`-min` package for size-limited hosts). Playwright leaves the user-data directory in `/tmp` between warm invocations. — [Sparticuz/chromium README](https://github.com/Sparticuz/chromium)
- A 2024 tutorial for Puppeteer on Vercel says Chromium ships only Open Sans and fonts can be loaded with `chromium.font(...)`; a commenter reports it stopped working because the Chromium path was not found. — [DEV Community, travisbeck](https://dev.to/travisbeck/how-to-generate-pdfs-with-puppeteer-on-vercel-in-2024-1dm2)
- Vercel function max duration is 300s default (800s max on the higher column), enough for a few-page PDF. — [Vercel limits](https://vercel.com/docs/limits)

### Inferences
- Bundle Noto Naskh Arabic or Cairo as local font files, load them via `@font-face` in the HTML template and verify with a deployed Arabic test PDF that includes numerals, mixed English names and tables.
- If Vercel packaging proves flaky, move rendering to a small container (Gotenberg or a Playwright container) on a managed host; the API contract stays the same.

### Gaps
- Gotenberg, Browserless, react-pdf, Typst and Prince were not researched; no verified Arabic quality comparison. Exact Vercel bundle-size limit not confirmed. Font licensing for embedding was not checked (Noto and Cairo are commonly under the SIL Open Font License, but this was not verified here).

## i18n and RTL: next-intl, Tailwind, shadcn/ui

### Takeaway
Tailwind v4.3 has `rtl:` and `ltr:` variants, and shadcn/ui has a documented RTL path (`rtl: true` in `components.json`, logical-class conversion). Calendar, Pagination and Sidebar need manual fixes. next-intl status was not confirmed.

### Cited Findings
- Tailwind CSS docs header shows v4.3. The `rtl` and `ltr` variants compile to `:where(:dir(rtl), [dir="rtl"], [dir="rtl"] *)` and its LTR counterpart. — [Tailwind docs](https://tailwindcss.com/docs/hover-focus-and-other-states)
- shadcn/ui: `rtl: true` in `components.json` transforms components on add (left/right become start/end); `migrate rtl` updates existing `ui` components; Calendar, Pagination and Sidebar are not migrated automatically; icons may need `rtl:rotate-180`. Automatic transformation applies to projects made with `shadcn create` on newer styles (such as `base-nova`, `radix-nova`). — [shadcn/ui RTL](https://ui.shadcn.com/docs/rtl)
- next-intl supports a `[locale]` segment with locale-based routing and a cookie-based no-routing mode; the docs show v3 and v4 selectors without naming the current one. — [next-intl docs](https://next-intl.dev/docs/getting-started/app-router)

### Inferences
- Use logical utilities (`ms-*`, `ps-*`, `start-*`, `end-*`) from day one so only a handful of `rtl:` overrides are needed. Charts, calendars and number/date formatting need explicit Arabic review.

### Gaps
- next-intl vs Lingui vs Paraglide comparison, next-intl compatibility with Next.js 16 `proxy.ts`, and Arabic-Indic numeral policy were not researched.

## Notifications: Web Push, Resend, alternatives

### Takeaway
Web Push on iOS requires the PWA to be installed to the Home Screen (iOS 16.4+). Resend's free tier (100/day) is enough only for testing; Pro is $20/month for 50,000 emails.

### Cited Findings
- iOS Web Push conditions: see WebKit post above. — [WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- Resend Free: 3,000 emails/month, 100/day, 3 domains, 30-day retention. Pro $20/month (50,000) or $35/month (100,000), 10 domains. Scale from $90/month. — [Resend pricing](https://resend.com/pricing)

### Inferences
- Email is the reliable fallback for coach-to-client reminders, since iOS push needs installation plus a permission gesture.

### Gaps
- Resend deliverability in the Middle East, OneSignal and Firebase pricing, Android push behavior: not researched.

## AI: Claude models, pricing, Vercel AI SDK

### Takeaway
For coach-approved drafts, small and cheap models are enough: Claude Haiku 5.5 at $0.10 input / $0.50 output per million tokens (prompts up to 100k) and Sonnet 5.5 at $2 / $10. Batch gives a 50% discount.

### Cited Findings
- Anthropic's pricing page (read 2026-11-07), per million tokens (input / output): Fable 5.1 $10 / $50; Opus 5.5 $4 / $20; Opus 5 $5 / $25; Sonnet 5.5 $2 / $10; Sonnet 5 $2 / $10; Sonnet 4.6 $3 / $15; Haiku 5.5 $0.10 / $0.50 for prompts up to 100,000 tokens and $0.50 / $2.50 above that; Haiku 4.5 $1 / $5. Cache hits are cheaper (Sonnet 5.5 $0.10, Haiku 5.5 $0.01). Opus 4.1 and Opus 4 are retired. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- The Batch API gives a 50% discount on input and output tokens. — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### Inferences
- Pin model ids and route drafts to Haiku 5.5 first, escalating to Sonnet 5.5 for complex plans. Use prompt caching for the shared coach-style system prompt. Keep a human approval step before anything reaches a client.
- API model id strings were not on the fetched table (names only). The session's own id for Sonnet 5.5 is `claude-sonnet-5-5`, which comes from this session's configuration and not from a web source; confirm others in the models overview.

### Gaps
- Vercel AI SDK status and version, structured-output features: not researched. Arabic-language quality of Haiku vs Sonnet: no evidence gathered.

## Alternatives: Flutter + Firebase, Laravel, FastAPI + React, Expo universal

### Takeaway
No alternative was researched against sources; the verdicts below are reasoned judgments from the evidence above and general knowledge, labeled as inference.

### Cited Findings
- None. No sourced facts were gathered for these alternatives.

### Inferences
- Flutter + Firebase: strong native apps and offline sync (Firestore) but weak web/PWA SEO, RTL web desk-top coach workspace is less natural, Firestore does not give SQL or RLS-style tenant isolation, and it splits the codebase from the TypeScript packages. Poor fit for a desktop-first coach workspace plus web-first product.
- Laravel + Inertia/Livewire + Postgres: very productive for a solo founder with built-in queues, mail, and PDF packages, but the AI-agent-friendly TypeScript sharing with a later Expo app is lost, and the offline PWA is hand-built either way. A credible fallback if PHP is the founder's strength; not verified here.
- FastAPI + React: maximum flexibility, but the founder would own auth, storage, realtime, queues and ops, which contradicts "low-ops managed services".
- Expo universal app (web + native from one codebase): attractive for reaching native later, but Expo web is weaker for a dense desktop coach workspace, Arabic PDF/SEO and PWA offline control; best kept as the later native client over the shared API, as the leading plan already says.

### Gaps
- All claims here need sources: Expo SDK and Expo Router status, EAS pricing, Firebase pricing, Laravel version.

## Recommended stack with evidence

### Takeaway
Keep the leading candidate, with four evidence-driven adjustments: pay for Vercel Pro from launch, run Supabase Pro in Frankfurt, put offline sync on foreground flush with idempotency keys, and run Arabic PDF with bundled Arabic fonts behind a smoke test.

### Cited Findings
- Next.js 16.4 stable with Cache Components recommended for new apps — [Next.js 16.4](https://nextjs.org/blog/next-16-4)
- Vercel Pro $20/month required for commercial use — [Vercel pricing](https://vercel.com/pricing)
- Supabase Pro $25/month, Frankfurt as nearest region, TUS resumable uploads, RLS guidance — [pricing](https://supabase.com/pricing), [regions](https://supabase.com/docs/guides/platform/regions), [resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Drizzle RLS support with Supabase helpers — [Drizzle RLS](https://orm.drizzle.team/docs/rls)
- Serwist Turbopack package for the PWA — [Serwist](https://serwist.pages.dev/docs/next/turbo)
- Tailwind v4.3 RTL variants and shadcn/ui RTL CLI — [Tailwind](https://tailwindcss.com/docs/hover-focus-and-other-states), [shadcn](https://ui.shadcn.com/docs/rtl)
- Trigger.dev Hobby $10/month or Inngest free-then-$99; Resend Pro $20/month — [Trigger.dev](https://trigger.dev/pricing), [Inngest](https://www.inngest.com/pricing), [Resend](https://resend.com/pricing)
- Claude Haiku 5.5 and Sonnet 5.5 prices — [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### Inferences
- Estimated fixed monthly cost at launch: Vercel Pro $20 + Supabase Pro $25 + Resend $0 to $20 + Trigger.dev $0 to $10 (or pg_cron and Queues at $0) + SMS provider usage, roughly $45 to $80 before SMS and AI usage. This is arithmetic on the cited prices only.
- Table-stakes choices: Turborepo, Tailwind plus shadcn/ui, Web Push (VAPID) and Expo later were not independently verified in this pass.

### Gaps
- Final lock needs a one-day spike: Cairo to Frankfurt latency, Egyptian SMS OTP cost, Arabic PDF on Vercel, and iOS PWA offline test.

## Risks and mitigations

### Takeaway
Main risks: monthly Next.js security releases, Supabase availability, iOS offline limits, Arabic PDF packaging, SMS cost for Egypt, and Cache Components learning curve for AI agents.

### Cited Findings
- Next.js security releases monthly plus out-of-band fixes (2026-09-22, 10-14) — [Next.js blog](https://nextjs.org/blog)
- Supabase 2026 incidents including a postmortem on 2026-02-12 — [Supabase postmortem](https://supabase.com/blog/supabase-incident-on-february-12-2026)
- No iOS Background Sync (secondary sources only) — [MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- Chromium on serverless bundles only Open Sans — [Sparticuz/chromium](https://github.com/Sparticuz/chromium)
- Inngest free tier pauses at quota — [Inngest pricing](https://www.inngest.com/pricing)

### Inferences
- Upgrade routine: monthly Next.js patch, automated through `next upgrade --agent`.
- Availability: daily logical backups to separate storage; read-only offline mode in the PWA; status banner.
- iOS offline: foreground flush plus idempotency keys, unsynced indicator, install prompt.
- PDF: bundled Arabic fonts, deployed smoke test, fallback container renderer.
- SMS: WhatsApp OTP via Twilio Verify or email/magic link default; CAPTCHA plus rate limits.
- Automation vendor lock: start with pg_cron and Queues for simple reminders; adopt Trigger.dev or Inngest only for multi-step flows; keep job logic in plain TypeScript functions.
- Cache Components: load Next.js agent skills and AGENTS.md; set `ensureStatic` where pages must stay static.

### Gaps
- Costs for exceeding quotas (egress, realtime) at real usage were not modeled.

## Verdict per alternative

### Takeaway
Stay with the leading candidate; keep Laravel as the only credible plan B.

### Cited Findings
- None (see the alternatives section; no sourced evidence gathered).

### Inferences
- Flutter + Firebase: reject for this product. The web-first PWA plus desktop coach workspace and SQL/RLS tenant isolation point the other way, and offline sync strength does not offset that.
- Laravel + Inertia/Livewire + Postgres: viable plan B if the founder knows PHP well. It trades TypeScript sharing with a future Expo app for built-in queues, mail and conventions. Needs its own Arabic PDF and PWA offline work.
- FastAPI + React: reject for a solo founder who wants low-ops. It makes the founder own auth, storage, realtime and jobs.
- Expo universal app: do not use as the primary web codebase. Use Expo later as the native client over the shared API and TypeScript packages, as planned.

### Gaps
- These verdicts are unsourced judgments; validate with a short spike before any switch.
