# DAWLYY

Online coaching operating system: pnpm 12 workspace, Next.js 16 web app with a Hono API at `/api/v1`
(`apps/web`), pure-TypeScript domain core (`packages/core`), Drizzle + Postgres with row-level security
(`packages/db`). Branch `main`; remote `origin` is Mohamed's private GitHub repo (created 8 Nov 2026 with his
yes). Sessions never push: the autopilot watchdog pushes new commits hourly, fast-forward only, after a secret
scan (`C:/Users/compuline/.claude/autopilot/git_sync.py`).

## Read first

1. `docs/plans/STATE.md`: the state record. Do not re-plan what it settles.
2. `docs/plans/2026-11-07-dawlyy-build-plan.md`: the contract between builders.
3. `docs/architecture/02-database-security-model.md`: binding database security design (428 KB; read by section).

## Autopilot

This repo runs under the Claude autopilot (`C:/Users/compuline/.claude/autopilot`, task "Claude Autopilot -
DAWLYY"). A session with `AUTOPILOT=1` in its environment is the worker: it follows
`docs/plans/AUTOPILOT_MASTER_PROMPT.md`, which overrides skills and global defaults for unattended work. The design
and plan are approved; skills that wait for a human approval gate do not apply to the worker.

An attended session (Mohamed watching) must not edit this repo while the worker runs: pause it first with
`python C:/Users/compuline/.claude/autopilot/watchdog.py pause --project C:/Users/compuline/Desktop/dawlyy`
(or the Desktop shortcut "DAWLYY autopilot - PAUSE"), and resume it the same way with `resume`.

## Rules that bind every session here

- Never weaken a test, guard, RLS policy or check to get green.
- Needs Mohamed's specific yes naming the action: `git push` or any remote, Supabase/Vercel/any account action,
  spending money, deleting or moving his data, credential changes, messages to real people.
- `git add` explicit paths only. Never commit `.env*`, `.autopilot/`, `.work/`, `tools/.codex-answers/`.
- At most 3 heavy node processes at once (vitest, tsc, drizzle-kit, migrator, playwright, next build).
  Never start `pnpm dev` or `next dev` from an agent.
- Local Postgres 18.1 on 127.0.0.1:54329 (`tools/local_pg.ps1`). Roles are cluster-wide: never change roles
  outside a full migration run.
- Codex builds: `python tools/codex_build.py <brief>`; Codex never commits, Claude reviews first.
