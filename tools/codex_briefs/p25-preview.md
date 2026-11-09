# Batch P2.5: a preview Mohamed can open and click (demo seed, start script, screenshots, how-to-test)

Mohamed, 8 Nov 2026: "I want to start seeing what the app looks like, so everything is clear and I can test
everything." You build the pieces that let him start the app on his PC with one command and sign in as seeded demo
users through the development-only login, plus a Playwright spec that screenshots every route.

Read first: `docs/plans/AUTOPILOT_MASTER_PROMPT.md` sections "P2.5" and "Local testing without his accounts"
(binding), `tools/local_pg.ps1`, `tools/local_pg.md`, `packages/db/seed/index.ts`, `packages/db/seed/load.ts`,
`packages/db/src/client.ts`, `packages/db/src/schema/*.ts` (tenants, memberships, clients, packages, programs),
`packages/db/test/fixtures.ts` (how valid tenants, memberships, clients and staff permissions are built; copy its
shapes), `packages/db/.env.example`, `apps/web/src/server/dev-login.ts`, `apps/web/app/api/dev-login/route.dev.ts`,
`apps/web/components/app/dev-login-panel.tsx`, `apps/web/next.config.ts`, every `apps/web/app/[locale]/**/page.tsx`,
`apps/web/i18n/routing.ts`, `docs/product/COMPETITOR_GAPS.md` (section "Already seen").

## Files you may write

- `packages/db/seed/demo.ts` (new)
- `tools/start_preview.ps1` (new)
- `apps/web/playwright.config.ts` (new) and `apps/web/e2e/screens.spec.ts` (new)
- `docs/qa/HOW_TO_TEST.md` (new) and `docs/qa/screens/index.md` (new; a placeholder the spec regenerates)

Write nothing else. Do not edit any `package.json`, lockfile, schema file, migration, or anything under
`packages/db/test/`. Other builders are editing those right now. If you need a package script, write the exact line
in your answer instead and the integrator adds it.

## Work

1. **Demo seed** (`packages/db/seed/demo.ts`), run as `node --env-file=.env --import tsx ./seed/demo.ts` from
   `packages/db`. It first loads the system library by importing and calling the same functions as `seed/index.ts`
   would (if `index.ts` only exposes a `main()` that runs at import, do not import it; instead say in the answer that
   the start script runs both files in order). Then, inside `withServiceTx(null, 'seed:demo', ...)`, it upserts one
   demo tenant with slug `demo-coach` (name "Demo Coaching" / Arabic display where the schema has a field for it), and
   fixed, hard-coded UUIDs (constants at the top of the file) for: one owner, one staff member (preset `coach`, client
   scope `all`, permissions built with `permissionsFromPreset` as in the fixtures), 3 clients each with an active
   client membership, 1 package, and 1 program (a draft head is fine if a published version needs objects the schema
   makes hard to build; say which you chose). Display names in Egyptian Arabic where the column is a display name.
   Idempotent: re-running changes nothing (select by fixed id first, insert only when missing). It never deletes
   anything. Print one summary line. Use only columns that exist in the schema files; check each one.
2. **Start script** (`tools/start_preview.ps1`, Windows PowerShell 5.1: no `&&`, `||`, `?:`, `??`). Mohamed runs it
   himself; agents never run it. Steps: start Postgres through `tools/local_pg.ps1 -Action start` (init it if the
   cluster does not exist); run the migrations (`pnpm --filter @dawlyy/db migrate`); run
   `tools/local_pg.ps1 -Action prepare`; run the system seed and the demo seed; set, for the dev server process only,
   `DAWLYY_DEV_LOGIN=1`, a `DAWLYY_DEV_LOGIN_SECRET` of 48 random characters generated per run (never written to
   disk, never printed), and `DATABASE_URL` / `DATABASE_URL_SERVICE` read from `packages/db/.env` (never printed);
   then run `pnpm --filter @dawlyy/web exec next dev --port 3200` in the foreground and print
   `http://localhost:3200/ar/login` before it starts. Stop with a clear Arabic message on the first failing step.
3. **Playwright** (`apps/web/playwright.config.ts`, `apps/web/e2e/screens.spec.ts`). The production build has no dev
   login by design, so signed-in screens are only reachable on the dev server. The config's `webServer` runs
   `pnpm exec next dev --port 3210` with `DAWLYY_DEV_LOGIN=1`, a secret from `process.env.DAWLYY_DEV_LOGIN_SECRET`
   or a fixed 48-character test secret, and the database URLs passed through from the environment;
   `reuseExistingServer: false`, timeout 180 s, `workers: 1`, Chromium only, `testDir: './e2e'`, `outputDir` under
   `test-results/`. The spec signs in by POSTing to `/api/dev-login` with `{ userId, locale }` (JSON) for the owner
   and for one client (the fixed UUIDs from `demo.ts`; import them from a small shared constant, or duplicate them
   with a comment pointing at `demo.ts`), then visits every route that has a `page.tsx` under `app/[locale]`
   (landing, login, `/coach`, `/app`, `/app/today`, and one unknown path for each catch-all to show the not-found
   state), in `ar` and `en`, at viewport widths 390 and 1366 (height 900 and 844 are fine), and saves full-page
   PNGs to `docs/qa/screens/<role>-<route-slug>-<locale>-<width>.png` (resolve the path from the config file's
   directory). For each screenshot also assert that the page has no horizontal overflow
   (`document.documentElement.scrollWidth <= window.innerWidth + 1`), and record the result. In `test.afterAll`,
   write `docs/qa/screens/index.md`: a table of every image with role, route, locale, width and the overflow result,
   in plain English, with a one-line Egyptian Arabic note at the top saying what the folder is.
4. **How to test** (`docs/qa/HOW_TO_TEST.md`), in plain Egyptian Arabic, short steps for a non-developer: what to
   install once (nothing beyond what is on this PC; name Node and pnpm as already there), the one command
   (`powershell -NoProfile -File tools\start_preview.ps1` from the repo folder), which link to open, the demo
   logins (owner, staff, the three clients, by display name), what already works today (sign-in through the
   development login, the coach and client shells, the locale switch, branded loading and empty states, the
   `/ar/login` RTL fix), what does not work yet (everything from Task 2 onwards: say plainly that the screens are
   mostly empty shells at this stage), how to stop it (Ctrl+C), and where the screenshots are
   (`docs/qa/screens/index.md`). No secrets, no passwords other than the local `dawlyy_app` one already in
   `tools/local_pg.md`.

## Acceptance you can check without running anything

- `demo.ts` uses only columns that exist in the schema files and fixed UUIDs that the spec reuses.
- `start_preview.ps1` has no PowerShell 7-only syntax and never prints an env value.
- The spec's route list matches the `page.tsx` files you found.

## Answer

Files written; the demo users (role, display name, fixed id); the package script lines the integrator should add;
how to run the spec (`pnpm --filter @dawlyy/web exec playwright test e2e/screens.spec.ts` with the env it needs);
anything wrong or ambiguous in this brief.
