# Batch QA-1: find and remove the Next.js dev error shown on every screen

You work for Mohamed through Claude, who reviews and tests everything you write. Repo: `C:\Users\compuline\Desktop\dawlyy`
(pnpm 12 workspace, Next.js 16 app in `apps/web`). Read `AGENTS.md` first.

## Problem

Every image in `docs/qa/screens/` (made by `apps/web/e2e/screens.spec.ts`) shows the red Next.js dev overlay badge
"1 Issue" in a corner. So each page logs at least one error in development (a hydration mismatch, a React key
warning, a failed request, or similar). The spec does not record console errors, so nobody knows which.

## Files you may write

- `apps/web/e2e/screens.spec.ts`
- The source file or files under `apps/web/src/` that cause the error, with the smallest fix.
- A unit or component test beside a fixed source file when the fix is testable there.

Write nothing else. Do not start `pnpm dev` or `next dev` yourself (Playwright's own `webServer` in
`apps/web/playwright.config.ts` is the only allowed way to run the app). Do not use git. Do not change
`playwright.config.ts`, any RLS policy, migration, or `packages/db`.

## Required behaviour

1. In `screens.spec.ts`, for every screen visit, collect `page.on('console')` messages of type `error` and
   `page.on('pageerror')` errors, from navigation start until the screenshot is saved. Add to the `Screen` type:
   `consoleErrors: string[]` (each entry trimmed to 300 characters, duplicates removed).
2. Write them into `docs/qa/screens/index.md`: one new column `Console errors` with the count per screen, and a
   section `## Console errors` at the end listing each distinct message once with the screens it appeared on.
3. After all screens are saved and the index is written, the run fails (`expect`) if any screen has a console
   error. The images and the index must still be written before the failure, so the evidence survives.
4. Run the spec, read the collected messages, and fix the cause in the app source. Do not hide the error: no
   `suppressHydrationWarning` unless the mismatch is a known browser-extension attribute case and you say so, no
   filtering of messages in the spec, no disabling of the dev overlay (`devIndicators`), no CSS that hides the badge.
5. If an error comes from a 404 for a missing static asset (favicon, font), add the asset or remove the reference.

## Proof

- `pnpm --filter web exec playwright test e2e/screens.spec.ts` exits 0.
- `docs/qa/screens/index.md` shows 0 in `Console errors` for all screens.
- The images no longer show the "1 Issue" badge.
- `pnpm --filter web typecheck` and `pnpm --filter web lint` pass.

If your sandbox cannot run Playwright or reach the local Postgres on 127.0.0.1:54329, do step 1 to 3 only, say so
clearly, and list the most likely causes you found by reading the layout and provider code, with file and line.

## Answer format

Files written; the exact error messages found and the cause of each; what you changed and why it is the root cause;
commands you ran and their results; anything you could not run.
