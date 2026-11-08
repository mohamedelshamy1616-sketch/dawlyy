# DAWLYY: approvals waiting for Mohamed

Every action here needs Mohamed's specific yes naming it. The autopilot never does them by itself; it keeps this
list current and works around each item until it gets an answer. Item 1 blocks the most work.

Last update: 2026-11-08 06:40 (Africa/Cairo), by the setup session (Claude Opus 5.5).

## 1. Free disk space on C: (blocks installs, Playwright and the final test phase)

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

## 2. GitHub private repository and push

- Action: create a private repo `dawlyy` under your GitHub account and push `main`
  (`gh repo create dawlyy --private --source . --remote origin --push`).
- Why: an off-PC backup of the code, and Vercel deploys from GitHub.
- Cost: free.

## 3. Supabase project (database, auth, storage)

- Action: create a Supabase project in the EU (Frankfurt) region, then put its URL, anon key, service key and
  database password into `apps/web/.env.local` and `packages/db/.env` (never into git).
- Why: the hosted database and login for the beta. Until then the app runs on the local database with the
  development-only demo login.
- Cost: Free plan for a small private beta (500 MB database; free projects pause after a week without traffic), or
  Pro about $25/month (check before paying).

## 4. Vercel project (hosting)

- Action: sign in to Vercel, import the GitHub repo, set the env vars from item 3, attach the domain.
- Cost: Hobby is free but for non-commercial use only; Pro is about $20/user/month (check before paying).

## 5. Domain

- Action: buy the domain you choose for DAWLYY and point it at Vercel.
- Cost: about $10-15/year (check before paying).

## 6. Email sending (Resend)

- Action: create a Resend account, verify the domain, put the API key into `apps/web/.env.local`.
- Why: invitations, password reset and reminders by email. Without it the app logs emails instead of sending.
- Cost: free up to 3,000 emails/month; Pro about $20/month (check before paying).

## 7. Legal review before real clients

- Action: an Egyptian lawyer reviews the Arabic consent texts and privacy notice (Law 151/2020 on personal data;
  health data and progress photos are sensitive data).
- Cost: a quote is needed.

## 8. Optional: Fable credits for the final review

- Fable 5.1 now needs paid usage credits ("out of usage credits", 8 Nov 04:47). The autopilot uses Opus for the
  final security review instead. Buying credits is optional; price on Anthropic's usage page.

## Budget total

Prices are estimates; check each before paying.

| Item | Monthly | One-off / yearly |
|---|---|---|
| Supabase | $0 (Free) or about $25 (Pro) | |
| Vercel | $0 (Hobby, non-commercial) or about $20 (Pro, 1 user) | |
| Resend | $0 up to 3,000 emails | |
| Domain | | about $10-15/year |
| Legal review | | quote needed |
| Fable credits (optional) | | Anthropic usage page |
| **Total for a paid beta** | **about $45/month** | **about $10-15/year + legal** |
