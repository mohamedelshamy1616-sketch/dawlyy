# Astryx polish: rules for every group (Codex)

You move existing shadcn screens of the DAWLYY web app to the Astryx design system. Read `apps/web/AGENTS.md` (the section
"Astryx in DAWLYY" and the managed Astryx block) and `tools/codex_briefs/_common_web.md` first (conventions: next-intl for
every label, Tailwind logical utilities only, 44 px touch targets, RTL-safe). The local teal theme is already wired in
`components/astryx-provider.tsx`. Read each component's props in `node_modules/@astryxdesign/core/` (type definitions and the
component folders) before using it; the CLI `astryx` cannot be run by you.

## Task

For the files of your group (listed in your brief), replace every use of `apps/web/components/ui/*` (shadcn) by the Astryx
equivalent: layout with `VStack`, `HStack`, `Layout`, `Card`, `Table`, `Tabs`, `Dialog`, `TextInput`, `Select`, `Switch`,
`Badge`, `Heading`, `Text`, `Button`, `Skeleton` and so on (import per component: `@astryxdesign/core/<Name>`).
Keep behaviour, exported names and props of your own components, translations, test ids, accessible names and form
semantics exactly as they are: existing tests and the beta-gate Playwright suite select by role and accessible name.
Data tables stay tables (Astryx `Table`), not Card lists. A shadcn primitive may stay only where Astryx has no equivalent
(for example the sonner toaster); list each such case in your answer. Never import Astryx `tailwind-theme.css`. Server pages
stay server components: Astryx components are client components, so use them from the existing `"use client"` files or
create a thin client wrapper next to the page.

## Hard limits

- Edit ONLY the files in your group. Do not edit APIs, services, tests, message catalogs, `components/ui/*`, `package.json`,
  `app/globals.css`, or any file outside the list. If a label is missing from a catalog, keep the existing text key and report it.
- Do not run pnpm, node, tsc, eslint, vitest, git or any network command (the sandbox cannot). Claude runs typecheck, lint and
  tests after you finish. Read your result twice for type errors: unknown props, missing imports, `any`.
- Keep LF line endings. No new dependencies.

## The answer

Files changed; the shadcn components that remain and why; any prop you were unsure of; anything that looks wrong in the old
screens that you chose not to touch.
