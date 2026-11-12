# DAWLYY staging on the free tiers: setup steps for Mohamed

ملخص بالمصري: ده دليل خطوة بخطوة تعمل بيه ٣ حسابات مجانية (Supabase للداتابيز واللوجين، Vercel للاستضافة، Resend للإيميل)
وتشغّل نسخة تجريبية (staging) على النت. أنت اللي بتعمل الحسابات وبتدخل الباسوردات بإيدك. مفيش حاجة هنا اتنفذت، والملف ده
تحضير بس. اقرأ التحذيرات اللي تحت الأول، خصوصًا موضوع الـcron في Vercel.

Written 12 Nov 2026 by the autopilot worker (Claude Sonnet 5.5). Scope: your yes of 12 Nov 2026 to the FREE plans of
Supabase, Vercel and Resend only (`APPROVALS.md`, item 3). No paid plan, no domain purchase, no Paymob, no real clients.
Nothing in this file has been done. The worker never creates accounts, logs in, deploys or touches a remote; every
step marked "You" is yours, and every step marked "Session" waits for your yes to that exact action.

This file is the short staging path. The production path with every gate is `docs/plans/LAUNCH_RUNBOOK.md`; step
numbers below point at it. Prices and limits change: each warning names where to check them.

## Read first: free-tier warnings

1. **Vercel Hobby and the hourly cron (will fail the deploy).** `vercel.json` declares
   `"schedule": "0 * * * *"` for `/api/cron/due-events`. Vercel's Cron Jobs page says Hobby accounts get one run per
   day, and an expression that runs more often fails the deployment. Vercel's newer Schedules page says Hobby may run
   every 15 minutes. The two pages disagree (checked 12 Nov 2026): read https://vercel.com/docs/cron-jobs/usage-and-pricing
   before the first deploy. Separately, the route needs `?tenantId=<uuid>` and answers 400 without it
   (`OPEN_DECISIONS.md` item 11), so the bare path does nothing today. Safe default for staging: a session removes the
   `crons` block from `vercel.json` before the first deploy (one small commit, after your yes to deploy), and reminders
   are processed only by a manual authorized call to the cron URL during tests. Production needs a proper decision.
2. **Supabase Free pauses a project after one week without activity** and restores it for about 90 days. The free
   database quota is 500 MB (the free disk is 2 GB; read-only mode starts at 95% disk use). A paused staging project
   makes every login fail. Open it once a week, or make one request a day. Source: https://supabase.com/pricing and
   https://supabase.com/docs/guides/platform/database-size.
3. **Supabase Free backups are not established here.** Do not put real client data on a free project. Take a
   `pg_dump` yourself before any change you cannot undo (step 6).
4. **Resend Free: 100 emails a day and 3,000 a month, 3 verified domains.** The daily window is a UTC day, and each
   To, CC or BCC recipient counts as one email. Sending to other people needs a verified domain, and buying a domain is
   NOT covered by your yes. Until you own a domain, leave `RESEND_API_KEY` and `EMAIL_FROM` unset: the app then only
   logs emails (it writes `local-log` and sends nothing). Check the sandbox sender rules in the Resend console.
   Supabase Auth sends its own confirmation and reset emails; that is separate from Resend (`LAUNCH_RUNBOOK.md` step 7).
5. **Vercel Hobby is for personal, non-commercial use.** A staging copy with no paying client fits. Moving to
   customers and Paymob needs Pro (about $20 per user per month, check before paying) and a new, specific yes.
6. **The hosted migration may stop at its first file.** `0000_app_schema.sql` grants the role `authenticated` to
   `dawlyy_app` unconditionally. On a hosted Supabase the `postgres` user may not be allowed to do that. Step 5 has the
   one query that tells you before anything changes. If it says no, stop: a reviewed fix (security model, section 11.2,
   H0) is needed first, and a session writes it.
7. **Never commit or paste secrets.** Names of variables are listed below; values live only in the Vercel settings, in
   your password manager, and in local `.env` files that git ignores.

## Step 1. GitHub (done)

You already have the private repo `origin`, and the watchdog pushes `main` to it hourly. Vercel imports it in step 8.
Check that the latest commit you want to test is on GitHub before step 8.

## Step 2. Supabase account and project (You)

1. Go to https://supabase.com, choose "Start your project", sign in with GitHub or email, and verify the email.
2. Create an organization if asked. Choose the Free plan. Do not add a card.
3. Click "New project". Name it `dawlyy-staging`. Region: EU, Frankfurt (`eu-central-1`), the same as Vercel's `fra1`.
4. Set a database password. Generate a long random one and store it in your password manager at once. You cannot read
   it again later, only reset it.
5. Wait until the project says it is ready. Write the project reference (the short id in the dashboard URL) in your
   password manager, not in git.

## Step 3. Collect the connection values (You)

Open Project Settings. All labels below are as of 12 Nov 2026: **verify in the console**.

1. API settings: copy the Project URL (for `NEXT_PUBLIC_SUPABASE_URL`), the `anon` public key
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) and the `service_role` secret key (`SUPABASE_SERVICE_ROLE_KEY`). The service key
   is server-only: it never gets a `NEXT_PUBLIC_` prefix and never goes into browser code.
2. Database settings, "Connection string": copy the direct connection (user `postgres`) and the pooler connection
   strings. If your home network has no IPv6, the direct host will not connect: use the **session-mode** pooler for
   migrations (never the transaction pooler for migrations). Percent-encode special characters in the password.
3. Plan which string goes where:
   - migrations and bootstrap, from your PC: `DATABASE_URL_SERVICE` = privileged `postgres` direct (or session pooler);
   - the hosted app: `DATABASE_URL` = restricted `dawlyy_app` through the transaction pooler (port 6543), and
     `DATABASE_URL_SERVICE` = privileged connection for bootstrap and jobs (`LAUNCH_RUNBOOK.md` step 3).

## Step 4. Lock the Data API before any traffic (You)

Database access in DAWLYY goes through the app's own SQL role, not through Supabase's REST API.

1. In Project Settings, API, "Exposed schemas": remove `public`. Do not expose `app`.
2. In Database, Replication (Realtime): make sure no DAWLYY table is in the `supabase_realtime` publication.
3. Do not grant anything to `anon`, `authenticated` or `service_role` to "fix" a later error. Tell a session instead.

## Step 5. Preflight and migration (Session, after your yes to "migrate staging")

Run from the repo root in PowerShell. The migration needs the privileged URL in the shell only; the worker never prints it.

1. Preflight query on the privileged connection. It must return `true`:
   ```sql
   select exists (select 1 from pg_auth_members
     where roleid = 'authenticated'::regrole and member = 'postgres'::regrole and admin_option);
   ```
   `false` means stop (warning 6).
2. Confirm `DRIZZLE_NO_POLICIES` is unset, then `pnpm install --frozen-lockfile`.
3. `pnpm --filter @dawlyy/db migrate` (the script is `drizzle-kit migrate`; it reads environment variables and prefers
   `DATABASE_URL_SERVICE`). The journal order must be `0000_app_schema` to `0006_guards_and_grants`; check
   `packages/db/migrations/meta/_journal.json` first. Never use `db push` or run single SQL files.
4. Set the restricted login password once, interactively: connect with `psql` on the privileged URL and run
   `\password dawlyy_app`. Store it in your password manager and build the `DATABASE_URL` string from it
   (`LAUNCH_RUNBOOK.md` step 5; migration 0000 deliberately sets no password).
5. Load the shared libraries: `pnpm --filter @dawlyy/db seed` (exercises and foods only).
6. Optional, staging only: `pnpm --filter @dawlyy/db seed:demo` loads the demo coach, staff, 8 clients, packages and
   programs so you can click around. Never run it against a production database.

## Step 6. After the migration: prove RLS is on (Session)

Run the read-only audit from `docs/qa/RESTORE_DRILL.md` (Q1 to Q8 and C06, C09, C14) and save the output in the
private release record, not in git. Then check that the Supabase REST API cannot read DAWLYY tables: call
`<project url>/rest/v1/clients?select=*` with the anon key, and again with a signed-in user's token; both must be denied
or empty. Expected facts: row-level security is enabled without FORCE on the DAWLYY tables, policies target
`dawlyy_rls`, `dawlyy_app` is LOGIN NOINHERIT NOBYPASSRLS, `dawlyy_rls` is NOLOGIN. Any difference is a stop, not a
workaround. Before any change you cannot undo: `pg_dump --dbname="$env:DATABASE_URL_SERVICE" --format=custom
--file=<private path>`, then `pg_restore --list <file>`.

## Step 7. Storage and Auth settings (You)

1. Storage: create two **private** buckets, `client-media` and `tenant-assets`, each with a maximum object size of
   8 MiB (8388608 bytes). `client-media` allows `image/jpeg`, `image/png`, `image/webp`, `application/pdf`,
   `text/plain`, `video/mp4`, `video/webm`, `video/quicktime`. `tenant-assets` allows only the three image types. Add no
   storage policies for `anon` or `authenticated` (`LAUNCH_RUNBOOK.md` step 6).
2. Authentication, URL configuration: set the Site URL to the staging origin from step 8 (a `*.vercel.app` address is
   fine for staging). Add redirect URLs for `/ar/onboarding`, `/en/onboarding`, `/ar/reset?recovery=1`,
   `/en/reset?recovery=1`, and the invitation paths `/ar/invite/*` and `/en/invite/*`. Keep email confirmation ON.
   Do not allow arbitrary preview domains. Supabase's built-in mail sender has a low hourly cap on Free: expect
   throttling during tests.

## Step 8. Vercel project (You, then Session)

1. Go to https://vercel.com, sign up with GitHub (Hobby plan), and allow access to the `dawlyy` repo only.
2. "Add New", Project, import `dawlyy`. Framework preset: Next.js. Keep the root directory at the repo root; the
   checked-in `vercel.json` sets the install command (`pnpm install --frozen-lockfile`), the build command
   (`pnpm --filter @dawlyy/web build`), the output directory (`apps/web/.next`) and region `fra1`. Node 24.
3. **Do not press Deploy yet.** First decide the cron (warning 1) and set the environment variables below.
4. Settings, Environment Variables. Add these names for Production and Preview (values from steps 3 and 5):

   | Name | Value comes from | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | step 3.1 | public |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | step 3.1 | public, grants no DAWLYY data access |
   | `NEXT_PUBLIC_APP_URL` | the staging https origin | used in invitation and reminder links |
   | `DATABASE_URL` | `dawlyy_app` via the transaction pooler | never the `postgres` user |
   | `DATABASE_URL_SERVICE` | privileged connection | server only |
   | `SUPABASE_SERVICE_ROLE_KEY` | step 3.1 | server only, no `NEXT_PUBLIC_` |
   | `DAWLYY_DB_POOL_MAX` | a small number, for example 3 | free tiers allow few connections; the code default is 10 per pool |
   | `CRON_SECRET` | a long random value you generate | needed only when a cron or manual call is enabled |
   | `RESEND_API_KEY`, `EMAIL_FROM` | step 9 | leave both unset until a domain is verified |
   | `NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | optional | all three or none; skip for staging |

   Leave these **unset** in every hosted environment: `DAWLYY_DEV_LOGIN`, `DAWLYY_DEV_LOGIN_SECRET`,
   `DAWLYY_DIST_DIR`, `NEXT_PUBLIC_ENABLE_SW`, `NODE_ENV`, `DRIZZLE_NO_POLICIES`. The template with a comment for each
   name is `apps/web/.env.example` (and `packages/db/.env.example` for the CLI); values never go into either file.
5. Deploy. If the build fails on the cron entry, that is warning 1: tell a session.
6. Check the deployment (Session or You): both `GET` and `POST /api/dev-login` must answer 404;
   `/api/v1/me` without a login must be refused; `curl.exe -I <origin>/ar` must show HSTS, `nosniff`,
   `strict-origin-when-cross-origin`, `DENY` framing and the restrictive Permissions-Policy; `/sw.js` must say
   no-cache. Then set the Supabase Site URL (step 7.2) to this origin.

## Step 9. Resend (You, optional for staging)

1. Go to https://resend.com, sign up, stay on Free.
2. Without a domain: do nothing more; the app logs emails only. With a domain you already own: Domains, Add Domain,
   copy the SPF and DKIM records exactly into your DNS, wait for "Verified", create an API key, then set
   `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain) in Vercel. Do not buy a domain for this: that needs
   its own yes.
3. Send one test email to yourself and read the headers for SPF and DKIM pass.

## Step 10. First owner and smoke test (You, with a Session for any fix)

1. Open `<origin>/ar/signup` (or `/en/signup`), sign up with your own email, confirm it, finish onboarding. The page
   creates the business with timezone `Africa/Cairo`. Repeating bootstrap must answer 409, not create a second owner.
2. Note the tenant id privately; it is needed only for a cron or manual due-events call (warning 1).
3. Smoke list, in both `ar` and `en`, on a phone and on a PC:
   - sign out and in again; the language switch keeps you on the same page;
   - create a package in EGP with a duration; create a client; send an invitation (the API returns the link: open it in
     a private window and accept it as the client);
   - sell the package, upload a small PNG as payment proof, verify the payment, check the receipt number and that the
     client now sees the subscription;
   - publish a workout program and a nutrition plan and assign both; the client opens Today and starts the workout,
     logs a set, finishes it, logs a meal;
   - the client submits a weekly check-in; the owner comments and reviews it;
   - freeze 7 days, extend 7 days, renew; the calendar dates move and nothing is duplicated;
   - turn the phone to airplane mode in the middle of a workout, log a set, reconnect, open the app once in the
     foreground: the set appears once (iOS has no background sync);
   - a second client cannot open the first client's pages or media;
   - the browser console shows no red errors.
4. Anything that fails: write what you did, the page and the time, and give it to a session. Do not edit the database by hand.

## What this file does not cover

Production go-live, a domain, Paymob, Pro plans, push keys, the legal review (Law 151/2020), backups beyond a manual
`pg_dump`, and the restore drill. Those stay in `docs/plans/LAUNCH_RUNBOOK.md`, `docs/plans/BUDGET.md` and
`docs/plans/APPROVALS.md`, and each needs its own yes.
