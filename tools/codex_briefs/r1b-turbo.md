# R1b in turbo mode: run notes for `r1b-inbox-nav.md`

You work in the git worktree `C:/Users/compuline/Desktop/dawlyy-wt-r1b` (branch `wt/r1b`, from `main` at the R0
commits). It is your whole repository for this job. Do not write anywhere else, and do not commit.

The brief is below, unchanged. Follow it, plus these five notes about what landed after it was written:

1. R0c is merged. The red-flag reads live in `apps/web/src/server/red-flags-inbox.ts` (`listRedFlags`). For the
   inbox, count open flags per client with one set-based query of your own in `server/inbox/`. Do not import
   `red-flags-inbox.ts` into a client-facing module.
2. C15 (`packages/db/test/security.catalog.test.ts`) scans every router mounted in `api/index.ts`. The inbox router
   is staff-only, so it must carry the same fail-closed `requireStaffRole` marker that
   `apps/web/src/api/client-modules.ts` and `apps/web/src/api/red-flags.ts` use. Without it, the scan treats the
   router as client-facing and fails on its column objects. Do not change the scanner.
3. Do not change `GET /api/v1/me`; two suites pin its exact response. The client app settings live at
   `GET /api/v1/me/app`.
4. Postgres returns `timestamptz` and `date` as text inside raw `sql` fragments (LESSONS 2026-11-12). Convert
   before you compare, and give DB-backed test assertions the type the code really returns.
5. Hot spots: this brief alone may edit `apps/web/src/api/index.ts` (the inbox mount only) and
   `apps/web/src/components/shell/**`. If registering the `inbox` namespace needs `apps/web/i18n/request.ts`, do
   not edit it. Write the exact patch (file, anchor line, lines to add) to
   `tools/codex_briefs/integration/r1b.md`, and keep the keys in `inbox.json` so Claude applies the loader patch
   at merge. That is the turbo-mode rule and it replaces the brief's "put them in nav" fallback.

Checks you may run yourself, one at a time: `pnpm --filter @dawlyy/web exec tsc --noEmit -p tsconfig.json`, and
vitest only on your new non-DB test files (`pnpm --filter @dawlyy/web exec vitest run <file>`). The DB-backed
`inbox.test.ts` needs the local database: write it, but Claude runs it. Never run a dev server, a build,
Playwright or the database suites.

---

