# Task R0b: the shared fixes from the UI audit (Sonnet builder)

You are a builder on DAWLYY, an online coaching app for Arabic-speaking fitness coaches (pnpm workspace; Next.js 16
web app in `apps/web` with next-intl messages in `apps/web/messages/{ar,en}/*.json`; Astryx design system). Claude is
the integrator: it reviews your diff and commits. You never commit, push, stash or branch.

## Contract

- `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R0, item R0b (six fixes), and Hard limit 4 (Design: no
  decorative restyling; every design value in one token file).
- The evidence for each fix, with file and line references:
  `docs/research/research_notes/DAWLYY product reinvention research/dawlyy_ui_audit_vs_best.md` (lines ~20 to 80,
  ~222 to 225, ~305 to 307). Read those parts first.
- UI rules: "Astryx in DAWLYY" in `apps/web/AGENTS.md`. Read it before any UI edit. Product copy stays in next-intl;
  never hardcode a label. Every new key exists in both `ar` and `en`. Arabic copy is plain Egyptian Arabic.

## Files you may edit

Anything under `apps/web/app/`, `apps/web/components/`, `apps/web/src/lib/`, `apps/web/messages/`, and
`apps/web/e2e/screens.spec.ts`. New unit tests beside the code they test.

You must NOT edit: anything in `packages/` (another builder is changing `packages/db` and `packages/core/src/types`
right now), `apps/web/src/api/`, `apps/web/src/server/`, `package.json`, lockfiles, `tsconfig*.json`, config files,
`docs/`, `.env*`. If a fix seems to need one of those, stop that fix and report it.

## The six fixes

1. **History tab.** `components/clients/client-detail.tsx` (~line 40) renders `t('history.soon')` ("coming soon").
   A full timeline page exists at `app/[locale]/coach/clients/[clientId]/timeline/page.tsx`. Remove the "coming
   soon" tab content and link the timeline from the client page (the tab becomes a link to the timeline, or renders
   it; pick the smaller change that keeps the page fast). Remove the now-unused `history.soon` keys from both
   catalogs only if nothing else uses them (grep).
2. **Numbers.** Create one formatter module `apps/web/src/lib/numbers.ts`:
   - `formatKcal(value, opts)` rounds to the nearest 5; `formatMacro(value, opts)` (grams) rounds to a whole number;
     `formatNumber(value, opts)` for other counts. `opts` carries `locale: 'ar' | 'en'` and
     `numerals: 'latn' | 'arab'`. Default numerals are Western (`latn`) in both locales (the plan: "default Western
     digits in Arabic UI"). Use `Intl.NumberFormat` with `numberingSystem`.
   - `numeralPolicy(preferences: unknown): 'latn' | 'arab'` reads an optional `numerals` field from a user
     preferences object defensively (a Zod `safeParse` or a type guard) and falls back to `latn`. Storing the
     per-user choice and the settings toggle come in a later task; do not add them.
   - Replace every place that shows kcal or macros (grep `kcal`, `protein`, `carbs`, `fat`, `toFixed`,
     `toLocaleString`, `Intl.NumberFormat` under `components/` and `app/`) with the formatter. Include the client
     nutrition screen (decimals like "2,084.9" and "615.3 سعر" in the audit), the coach nutrition editor totals,
     and the timeline.
   - A vitest unit test `apps/web/src/lib/numbers.test.ts`, table-driven, at least 15 cases: rounding edges (2.5,
     2082.4 to 2080, 2083 to 2085), negatives and zero, `arab` digits in `ar`, `latn` in `ar`, `en`, NaN and null
     input (return an empty string or a dash; choose one and document it).
3. **Sync status.** The offline outbox "not synced: 0 / sync now" card sits above the greeting on every client
   screen (`components/client-portal/client-runtime.tsx` and its neighbours). Show a small status dot in the client
   header instead (accessible label from messages, for example "everything is synced" / "N not synced"), and show
   the card only when pending is above 0. Keep the sync-now action reachable when pending is above 0. Do not change
   the outbox logic.
4. **English left on Arabic screens.** Write a small script-free check: compare the key sets of every
   `messages/ar/*.json` with `messages/en/*.json` and list keys missing in `ar` or whose `ar` value equals the `en`
   value and contains Latin letters. Fix each real one (units "kg", "cm", measurement names such as "hips", and any
   other). Also find strings built in code from raw keys or enum values, such as `hips: 99` in the progress screen
   and the timeline (`${type}: ${value}`): render the translated label and the translated unit. Fix the broken
   progress-photo image in the gallery (the audit shows a broken image icon with alt "صورة تقدم من"): find why the
   `src` fails (likely a media URL helper or a missing local-storage path) and fix it in `components/` or
   `src/lib/` only; if the cause is in `src/server/`, do not change it and report the cause exactly.
   Put the parity check in a vitest test `apps/web/src/lib/messages-parity.test.ts` that fails when an `ar` key is
   missing or when an `ar` value is identical to a Latin-letter `en` value, with an explicit, commented allow-list
   for genuine brand terms (for example "DAWLYY", "RPE", "InBody"). Keep the allow-list short.
5. **Screens spec.** `apps/web/e2e/screens.spec.ts`:
   - After each navigation settles, fail the shot when the settled page is still a skeleton (for example the page
     has an element with `aria-busy="true"` or the PageSkeleton marker and no main heading), printing the URL and
     the offending element's HTML, so a "PASS" never shows only a skeleton. Read the LESSONS lines about the screens
     job in `docs/plans/LESSONS.md` first: `/app/workout/start` is a transient redirect into
     `/app/workout/<id>`; wait for that redirect and shoot the live workout screen instead.
   - Capture phone widths 360, 390 and 430 px (and keep the existing desktop width), in `ar` and `en`.
   - Do not run Playwright; Claude runs it later. Keep the existing timeouts.
6. **Target muscle.** `components/.../program-view.tsx` (~line 43) falls back to `t('targetMuscles')` when a
   muscle key has no translation, which shows "العضلة المستهدفة · العضلة المستهدفة". Show the real muscle: add the
   missing muscle translations to the catalogs (find the full list of muscle keys used by the exercise seed and
   library: grep `packages/db/seed` read-only), and when a key still has no translation, hide the line instead of
   showing the generic label. Check other screens that render muscles (exercise library, workout screen) for the
   same fallback.

## Design rules

- No decorative restyling. Use existing Astryx components and existing tokens. No raw hex, px or arbitrary values;
  no `style={{}}`. If you need a new design value (the dot colour or size), add it as a token in the existing token
  or theme file the app already uses (`apps/web/app/globals.css` theme block or `apps/web/theme/`), and say which.
- RTL must keep working: check `dir` handling for the new dot and the links.
- 44 px minimum touch targets for anything tappable.

## Gates you run (one at a time, never in parallel; never start `next dev`, `pnpm dev` or `next start`)

1. `pnpm --filter @dawlyy/web typecheck`
2. `pnpm --filter @dawlyy/web lint`
3. `pnpm --filter @dawlyy/web exec vitest run src/lib/numbers.test.ts src/lib/messages-parity.test.ts`
Fix what fails in your files. Do not run the database-backed web tests, Playwright or `next build`.

## Your answer

Under 400 words: files changed, per fix what you did and the evidence (grep result or test output line), the gate
results (exact final lines), anything you could not do and why, and anything outside your file set that needs a
change (with the exact place).
