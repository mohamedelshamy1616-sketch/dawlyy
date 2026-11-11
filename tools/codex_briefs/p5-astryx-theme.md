# P5 Astryx step 1: the local DAWLYY teal theme

You are a Sonnet builder. Read `apps/web/AGENTS.md` (the section "Astryx in DAWLYY" and the managed Astryx block),
`apps/web/components/astryx-provider.tsx`, `apps/web/app/globals.css` (the `--brand*` tokens, the Astryx imports and the
font override at the end) and `apps/web/app/layers.css`. Run `pnpm exec astryx docs theme` and `pnpm exec astryx docs tokens`
inside `apps/web` before writing anything.

## Goal

Replace the black and grey neutral theme with a local theme whose accent is the DAWLYY teal (`--brand` family in
`globals.css`: light `oklch(0.45 0.09 185)`, soft `oklch(0.955 0.03 185)`). Every Astryx component then shows teal
buttons, focus rings, selected states and links, in light mode (the app has no dark switch yet; still define a dark
mode if the theme API requires it, and keep it consistent).

## Do

1. Create the theme source with `defineTheme({ extends: neutralTheme, ... })` in `apps/web/theme/dawlyy.theme.ts` (or the
   location `astryx docs theme` prescribes), accent from the teal tokens, everything else inherited. Build it with
   `pnpm exec astryx theme build` and import the built CSS and the built theme object exactly the way the neutral theme is
   imported today. Never override `--color-*` on `:root`.
2. Swap `neutralTheme` for the new theme in `components/astryx-provider.tsx`; update its doc comment.
3. Keep the `--brand*` tokens as they are: the shadcn screens still use them.
4. Prove it: write a throwaway server page is NOT allowed. Instead run `pnpm exec astryx doctor --built <dir>` if it
   applies, run `pnpm --filter @dawlyy/web exec tsc --noEmit` (exit 0), and `pnpm --filter @dawlyy/web exec eslint` on the
   files you touched. Never start `pnpm dev` or `next dev` (the guard denies them; the screens job renders the app later).
5. If the build output must be committed, say where it is; if it is generated in a postinstall or a script, add the
   script to `apps/web/package.json` (`"theme:build"`) and say so.

## Files you may write

`apps/web/theme/**`, `apps/web/components/astryx-provider.tsx`, `apps/web/app/globals.css` (the Astryx import lines only),
`apps/web/package.json` (scripts only). Nothing else. Do not commit.

## Answer

What you built, the exact commands you ran with their exit codes, the built-theme import path, the contrast ratio of the
primary button text on the teal (compute it), and anything that did not work.
