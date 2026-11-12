# Builder brief

Paste or reference this at the top of every task given to Codex, a Sonnet builder, or a free model. It is the one place that carries what earlier sessions learned. A model starts cold every time; this file does not.

## Project
DAWLYY: pnpm 12 workspace, Next.js 16 web app with a Hono API at `/api/v1` (`apps/web`), pure TypeScript domain core (`packages/core`), Drizzle + Postgres with row-level security (`packages/db`). Contract: `docs/plans/2026-11-07-dawlyy-build-plan.md`. Security design: `docs/architecture/02-database-security-model.md` (read by section).

## Hard rules
1. Tests are read-only for a builder. Make the failing test pass by changing product code. If a test looks wrong, stop and report why with evidence; only the reviewer changes a test.
2. Never weaken a guard, an RLS policy, the secret scan or a check to get green.
3. Never commit, push, print or log secrets. No `.env*`, `.autopilot/`, `.work/`, `tools/.codex-answers/` in a commit. Explicit paths only.
4. One heavy job at a time (vitest, tsc, drizzle-kit, migrator, playwright, next build). Never `pnpm dev` or `next dev`.
5. No account action, deploy, migration to a remote database, or message to a real person.
6. Competitors: public information only, no decompiling or cloning.

## How to run things (laptop is slow; use the narrow form)
- One DB test file: `python tools/run_db_tests.py test/<file>.test.ts` (add `--reuse-db` when only test code changed). Web API suite: `--web`.
- One e2e screen: `python tools/run_e2e.py --only <name>`. A full run only before a commit.
- Local Postgres 127.0.0.1:54329: `powershell -File tools/local_pg.ps1 -Action status|start`. It is a throwaway cluster tuned for speed (fsync off); roles are cluster-wide, never change them outside a full migration run.
- After ONE failed job: read the cause (`job.py tail <id>`), then change something. Never relaunch the same job to see if it passes.

## Known pitfalls (copy the short form from `docs/plans/LESSONS.md`, newest last)
- drizzle's postgres-js `execute` returns timestamptz as TEXT, not Date.
- Next rewrites `apps/web/tsconfig.json` on every run; commit its own serialization, do not fight it.
- A run crossing midnight Cairo changes "today"; compute dates per step, not once at load.
- Astryx controls: exact accessible names fail; file fields render a button plus a hidden input, target the input by id.
- `run_checks` needs an untouched tree and HEAD for its whole run: write docs before starting it.
- A job killed with exit -9 and no error is an external kill, not a result: relaunch once.

## Report format
Return: files changed, the command you ran, its last decisive output lines, and anything you could not verify. "Should work" is not a result.

## Free models (freellmapi)
Text only: Arabic UI copy, glossaries, seed data, summaries. Ask for JSON when the output feeds code and parse it before use. Never for security code, RLS, migrations, or facts about real people.

## Keep this file alive
Every new lesson in `LESSONS.md` that would have saved a builder time gets one line here too. Remove a line when its cause is fixed.
