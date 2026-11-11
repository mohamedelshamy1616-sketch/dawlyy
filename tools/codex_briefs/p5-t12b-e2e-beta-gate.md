# Batch P5-T12b: Playwright beta-gate suites in Arabic and English (build-plan Task 12, second part)

Write the end-to-end smoke suite that proves the beta gate on the local stack. Read build plan Task 12 (acceptance
paragraph), `apps/web/playwright.config.ts` and `e2e/screens.spec.ts` (how the dev server is started with the
development-only login, `POST /api/dev-login`, and the demo ids), `e2e/offline-workout.spec.ts` (an existing spec: reuse
its helpers and conventions, do not edit it), `packages/db/seed/demo/ids.ts` and `packages/db/seed/demo.ts` (the demo tenant
and its ten logins), the API routers in `apps/web/src/api/*.ts` and the screens under `apps/web/app/[locale]/**` and
`apps/web/components/**` for the real labels (message catalogs in `apps/web/messages/{ar,en}/*.json`). Select elements by role
and accessible name taken from the catalogs (read the catalog value for the locale at run time through a small helper that
imports the JSON), never by CSS class or position, so a later visual restyle does not break the suite.

## The flow (one serial `test.describe` per locale, `ar` and `en`; each test step is a `test.step`)

1. Owner (dev login) opens Packages and creates a new package with a price in EGP and a duration.
2. Owner creates a new client through the invite flow (new name unique per run, e.g. with a timestamp), then the invitation
   is accepted as that client through the development path the app offers (read `app/[locale]/(auth)/invite/[token]` and
   `src/server/dev-login.ts`; if acceptance needs a token, read it from the API response or the database through the
   harness, and say so in your answer).
3. Owner sells the package to the client with a manual payment: the client (or the owner on the client's behalf, as the
   screens allow) uploads a payment proof (a tiny generated PNG, local storage), the payment is pending.
4. Owner verifies the payment: receipt number appears, subscription becomes active, the client's Today screen shows access.
5. Owner creates a program with one workout day and one exercise from the library, publishes it and assigns it to the
   client; owner creates a small nutrition plan from two foods, publishes and assigns it.
6. Client opens the program, starts a workout, logs a set, finishes. Client logs one meal. (The offline path has its own
   spec; here stay online.)
7. Client submits the weekly check-in form; owner opens the review queue, comments, marks reviewed.
8. Owner records a refund on a second small payment (sell, verify, refund) and sees the state change.
9. Owner freezes the client's subscription for 7 days, then extends it by 7 days, and the end date moves by the expected
   amount (assert the dates shown); owner renews it for another period.
10. At every step assert no horizontal overflow at the current viewport, `html` has the right `lang` and `dir`, and the
    browser console shows no error (collect `page.on('console')` errors and `pageerror`, fail on any; ignore only the known
    dev-only hydration warning about `caret-color` that Playwright injects while taking screenshots).

Run each locale at a 390 px wide viewport and the owner screens at 1366 px for steps 1, 3, 4, 5, 7.

## Files you may write (and nothing else)

- `apps/web/playwright.e2e.config.ts`: its own config, port 3220, `DAWLYY_DIST_DIR='.next-e2e'`, dev login env as in the screens
  config, `workers: 1`, `retries: 0`, `testDir: './e2e/beta'`, projects `e2e-ar` and `e2e-en` selected by `--project`, a
  `webServer` with `reuseExistingServer: false` and a 600 s start timeout, `timeout` per test 300 s.
- `apps/web/e2e/beta/*.spec.ts` and `apps/web/e2e/beta/helpers.ts`.
- `apps/web/.gitignore`-free: do not touch ignore files (`.next-e2e` is added by Claude).

Package scripts are Claude's job; do not edit `package.json`. The suite is run as
`pnpm --filter @dawlyy/web exec playwright test -c playwright.e2e.config.ts --project e2e-ar` with `DATABASE_URL` and
`DATABASE_URL_SERVICE` set to a seeded local database (system seed and demo seed already loaded).

## Rules

Never weaken an assertion to make a step pass: if a screen does not offer a step the flow needs, do not stub it silently;
write the step with the best available path (UI first, then the documented API through the signed-in page context), mark
it with `// GAP:` and a one-line reason, and list every gap in your answer. Do not edit any application file. The tests
cannot be run by you; read the components twice instead. Keep LF endings, strict TypeScript, no `any`.

## The answer

Files written; for each of the ten steps whether it is UI-driven or has a GAP; the exact command lines; every selector
assumption that depends on a label you could not confirm in the catalogs.
