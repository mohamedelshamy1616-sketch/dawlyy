# Batch P5-T12c: deploy config and the launch runbook (build-plan Task 12, third part)

Nothing here touches an account: you write files that a later session, after Mohamed's explicit yes, uses to publish.
Read `docs/plans/2026-11-07-dawlyy-build-plan.md` (Global Constraints, Task 12), `docs/plans/APPROVALS.md`,
`docs/plans/BUDGET.md`, `docs/plans/OPEN_DECISIONS.md`, `docs/architecture/02-database-security-model.md` by section
(grep `^#` first; it is 428 KB, never read it whole) for backups, roles, migrations, the Data API exposure rules and the
restore requirements, `packages/db/package.json` scripts, `packages/db/sql/` and `packages/db/drizzle.config.ts` for how
migrations run, `apps/web/next.config.ts`, `apps/web/package.json`, `apps/web/src/server/` (grep every `process.env.` in
`apps/web` and `packages/db` to build the exact variable list), `apps/web/src/server/storage/index.ts` (buckets), the cron
route `apps/web/app/api/cron/due-events/route.ts` and `apps/web/public/sw.js`.

## Files you may write (and nothing else)

1. `vercel.json` at the repository root: framework `nextjs`, install and build commands for the pnpm workspace
   (`pnpm install --frozen-lockfile`, `pnpm --filter @dawlyy/web build`), output directory for the `apps/web` root, the
   `crons` entry calling `/api/cron/due-events` (it needs a tenant id: if one cron per tenant is not workable, say so in
   OPEN notes in the runbook and propose the smallest change; do not edit the route), security headers (HSTS,
   `X-Content-Type-Options`, `Referrer-Policy`, a conservative `Permissions-Policy`, `X-Frame-Options: DENY`; no CSP unless
   you can prove the Next.js and Astryx inline needs; if you add one, list what you checked), region closest to Egypt.
   Valid JSON only, no comments.
2. `apps/web/.env.example` and `packages/db/.env.example`: every variable by name with a one-line comment, no values, grouped
   as required for production, optional (Resend, Web Push VAPID, CRON_SECRET), and local-only (dev login; state that
   `DAWLYY_DEV_LOGIN` must never be set in production). If these files already exist, extend them.
3. `docs/plans/LAUNCH_RUNBOOK.md`: numbered steps a later session follows, each saying who does it (Mohamed or a session
   after his yes), the exact command or console path, the expected result and how to verify it, and the rollback:
   hosted Supabase project (region, the Data API settings the security model requires: public schema not exposed, RLS on,
   roles), database password and connection strings (pooler versus direct, which one the migrator uses), running the
   migrations 0000 to the last one in order and what must be true after (the checks from the security model), buckets
   (`client-media`, `tenant-assets`) with the 8 MiB limit and MIME allowlist the storage code expects and their policies,
   Supabase Auth settings (email templates, redirect URLs for `/ar` and `/en`, disable open signups if the build plan says
   so), the Vercel project (root directory, env vars from the example file, the production-build check that proves the
   dev-login route is absent), the domain and DNS, Resend sender domain (SPF, DKIM), Web Push VAPID keys, cron secret,
   first owner bootstrap, backups (daily plus point-in-time recovery if the plan allows) and a **restore drill**: restore
   into a scratch project, run a verification query set, record the time taken. End with a go-live checklist and a
   post-launch watch list (first 48 hours). Put every price-bearing step next to the matching line of `BUDGET.md` and mark
   it "check before paying". Plain English, short sentences.
4. `docs/qa/RESTORE_DRILL.md`: the restore drill alone as a checklist with a table to record date, backup id, restore
   duration, row counts before and after, and who signed it off.

## Rules

Never invent a price, limit or console label you cannot read in this repository; write "verify in the console" instead.
Never include secrets or realistic-looking keys. Do not edit any file not listed. Keep LF line endings.

## The answer

Files written, every environment variable found and where it is read, the decisions and open points you left in the
runbook (cron per tenant, CSP), and anything in the repository that blocks a production deploy.
