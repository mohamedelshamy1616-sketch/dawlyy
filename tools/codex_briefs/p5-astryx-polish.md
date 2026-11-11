# P5 Astryx step 2: move one group of shadcn screens to Astryx

You are a Sonnet builder. Read `apps/web/AGENTS.md` ("Astryx in DAWLYY" and the managed Astryx block) and
`tools/codex_briefs/_common_web.md` (conventions: next-intl for every label, logical Tailwind utilities, 44 px targets,
RTL). The local teal theme is already in place (`components/astryx-provider.tsx`). Use `pnpm exec astryx component <Name>`
to read a component's props before using it and `pnpm exec astryx search "<idea>"` to find one.

## Task

For the files of your group (the list is appended below), replace every use of `apps/web/components/ui/*` (shadcn) by the
Astryx equivalent, keeping behaviour, props of your own components, translations and test ids exactly as they are. Layout
with Astryx `VStack`, `HStack`, `Layout`, `Card`, `Table`, `Tabs`, `Dialog`, `TextInput`, `Select`, `Switch`, `Badge`,
`Heading`, `Text` and so on. Keep data tables as Astryx `Table`, not Card lists. A shadcn primitive may stay only where
Astryx has no equivalent; list each such case in your answer. Never import Astryx `tailwind-theme.css`. Do not edit any
file outside your group, any API, service or test file, or message catalogs (if a label is missing, report it).

Server pages stay server components: Astryx components are client components, so import them from the existing
`"use client"` component files, or from a thin client wrapper you create next to the page.

## Gates (run yourself, one heavy process at a time)

1. `pnpm --filter @dawlyy/web exec tsc --noEmit` exit 0.
2. `pnpm --filter @dawlyy/web exec eslint <your files>` clean.
3. `node apps/web/scripts/check-messages.mjs` still in parity.
4. Existing tests of your area still pass: `python .work/tmp/run_with_db.py dawlyy_p1gate pnpm --filter @dawlyy/web exec vitest run <test files>`.
5. Never start `pnpm dev` or `next dev` (denied). The screens job renders the app afterwards; say which routes of your
   group it must look at.

Do not commit. Files outside your group belong to other builders working at the same time.

## Answer

Files changed, the shadcn components that remain and why, each gate with its exit code, and anything that looks wrong in
the old screens that you chose not to touch.
