# DAWLYY: approvals waiting for Mohamed

Every action here needs Mohamed's specific yes naming it. The autopilot never does them by itself; it keeps this
list current and works around pending items until it gets an answer. Items 1 and 2 are done. Item 3 records the free-tier approval.

Last update: 2026-11-12 (Africa/Cairo).

Status 8 Nov 23:55: items 1 and 2 are done. After a restart and `powercfg /hibernate off` (his yes, run elevated),
C: has about 14 GB free. The private GitHub repo exists and the watchdog pushes `main` to it hourly. The full,
sourced budget from now to launch is in `docs/plans/BUDGET.md`; the table at the end of this file is its short form.

## 1. Free disk space on C: (done 8 Nov)

C: had 1.1 GB free on 8 Nov 06:18. Installs, builds and browser runs need at least 3 GB, and the commit charge
(memory) cannot grow while the disk is full. These are regenerable caches or backups, sizes measured 8 Nov 06:20:

| Option | Exact action | Frees | What is lost |
|---|---|---|---|
| a | `npm cache clean --force` | about 1.3 GB | nothing; npm downloads again on demand |
| b | delete `C:\Users\compuline\.cache\huggingface` | about 5.1 GB | downloaded AI models; re-downloaded when a tool needs them |
| c | `pnpm store prune` | part of 809 MB | nothing in use; only packages no project references |
| d | move the Apple MobileSync iPhone backups to an external drive | about 221 GB | nothing, if moved (not deleted) |

Recommended now: a and b (6.4 GB). Later: d.

Status 8 Nov 07:35: Mohamed said yes to a and b. a is done (`npm cache clean --force`; free space went from 0.15 GB
to 0.36 GB, because npm keeps its `_npx` folder). b was refused by Claude Code's auto-mode safety check
("irreversible local destruction"), so Mohamed runs it himself in PowerShell:
`Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\huggingface"`. Free space was falling about 1 GB an hour
this morning. At 08:01 `C:\pagefile.sys` was 19.7 GB and still growing (it grows when memory runs short),
`C:\hiberfil.sys` was 6.6 GB, and npm's `_npx` folder 1.0 GB. Two more options, each needs his yes:
e) `powercfg /hibernate off` in an admin PowerShell deletes hiberfil.sys (6.6 GB; turns off hibernate and fast
startup); f) delete `%LOCALAPPDATA%\npm-cache\_npx` (1.0 GB; npx downloads its tools again on next use).

## 2. GitHub private repository and push (done 8 Nov)

- Action: create a private repo `dawlyy` under your GitHub account and push `main`
  (`gh repo create dawlyy --private --source . --remote origin --push`).
- Why: an off-PC backup of the code, and Vercel deploys from GitHub.
- Cost: free.

## 3. Free tiers of Supabase, Vercel and Resend for the beta (yes 12 Nov 2026, free plans only)

- Mohamed said yes to the FREE plans of Supabase (database), Vercel (hosting) and Resend (email) for the beta.
- Covers: choosing the free tier of each service. Cost: $0/month.
- Does NOT cover: any paid plan, a domain purchase, Paymob, a lawyer, or anything that spends money. Moving to
  Supabase Pro (about $25/month) and Vercel Pro (about $20/user/month; check before paying for either) needs a new, specific yes before the first paying customer.
- Account creation and logins are Mohamed's act (browser, his email, his verification). The autopilot prepares
  everything else (`docs/plans/STAGING_SETUP.md`, env template, migration steps) and never handles his passwords.
- Free-tier limits to remember: Supabase Free pauses a project after one week of inactivity and holds 500 MB;
  Resend Free allows 3,000 emails a month and 100 a day; Vercel Hobby is for non-commercial use only.

## 4. Supabase project (database, auth, storage)

- Action: create a Supabase project in the EU (Frankfurt) region, then put its URL, anon key, service key and
  database password into `apps/web/.env.local` and `packages/db/.env` (never into git).
- Why: hosted database, login and storage. This unblocks hosted migration and Auth/Storage checks. Until then the app uses the local database and demo login.
- Status: the free-tier choice is approved in item 3. Mohamed creates the account and logs in. Credential actions still need his specific yes. Paid upgrades need a new yes.
- Cost: Free plan for a small private beta (small database; free projects pause after a week without traffic), or
  Pro about $25/month (check before paying).

## 5. Vercel project (hosting)

- Action: sign in to Vercel, import the GitHub repo, set the env vars from item 4, attach the domain after item 6.
- Why: this unblocks a hosted beta and phone testing.
- Status: the free-tier choice is approved in item 3. Mohamed creates the account and logs in. Import, configuration and deployment need his specific yes. A paid plan needs a new yes.
- Cost: Hobby is free but for non-commercial use only; Pro is about $20/user/month (check before paying).

## 6. Domain

- Action: buy the domain you choose for DAWLYY and point it at Vercel.
- Why: this unblocks a branded HTTPS address and sender-domain verification.
- Cost: about $10-15/year (check before paying).

## 7. Email sending (Resend)

- Action: create a Resend account, verify the domain, set `RESEND_API_KEY` and `EMAIL_FROM` in `apps/web/.env.local` for local use or the hosted server environment for deployment.
- Why: this unblocks application notification email, including reminders. Without sender settings the app records `local-log` and sends nothing. Supabase Auth mail needs separate configuration. Invitation links are returned by the API; prove their delivery separately.
- Status: the free-tier choice is approved in item 3. Mohamed creates the account and logs in. Domain verification, credentials and test messages need his specific yes. A paid plan needs a new yes.
- Cost: free up to 3,000 emails/month and 100/day; Pro about $20/month (check before paying).

## 8. Legal review before real clients

- Action: an Egyptian lawyer reviews the Arabic consent texts and privacy notice (Law 151/2020 on personal data;
  health data and progress photos are sensitive data).
- Why: this unblocks real-client use after counsel approves consent, privacy, hosting and any required compliance steps.
- Cost: quote needed (BUDGET.md / Legal; check before paying).

## 9. Optional: Fable credits for the final review

- Fable 5.1 now needs paid usage credits ("out of usage credits", 8 Nov 04:47). The autopilot uses Opus for the
  final security review instead.
- Action: buy optional Fable review credits only after a new yes naming the purchase.
- Why: this unblocks an optional additional review; it does not block the beta.
- Cost: no amount is established in BUDGET.md; check before paying.

## Budget total

Prices are estimates; check each before paying.

| Item | Monthly | One-off / yearly |
|---|---|---|
| Supabase | $0 (Free) or about $25 (Pro) | |
| Vercel | $0 (Hobby, non-commercial) or about $20 (Pro, 1 user) | |
| Resend | $0 up to 3,000 emails | |
| Domain | | about $10-15/year |
| Legal review | | quote needed |
| Fable credits (optional) | | no amount established in BUDGET.md |
| Approved free beta tiers (12 Nov) | $0 | domain and legal review need separate approval |
| **Total for a paid beta** | **about $45/month** | **about $10-15/year + legal** |
| Launch in Egypt (see BUDGET.md) | about $65-85 + usage; Paymob 2.75% + EGP 3 per card payment | domain, lawyer quote, PDPC licence |
