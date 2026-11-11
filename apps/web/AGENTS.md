<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- ASTRYX:START -->
Astryx v0.7.11 · 174 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — start every page from a template, never from scratch:
1. `astryx build "<idea>"` — names the template to scaffold from and the parts it lacks.
2. `astryx template <name> <path>` — scaffold it; keep its frame, gap and padding; replace the content.
3. `astryx template <Block>` for parts it lacks; `astryx component <Name>` to read props before using one.
Changing an existing page? Keep it: skip step 2 and add blocks/components inside its sections.
Before you deliver a build, run `astryx doctor --built <dir>`; don't deliver it if it fails.

RULES:
- No <div> — components handle all layout and spacing.
- Read `astryx docs layout` before changing a template's frame.
- Dense data = rows (Table, List/Item), not Card-wrapped lists. Badge = counts only.
- Style with component props first, then Tailwind utilities backed by tokens. No raw hex/px.
- Palettes and custom colors go through the theme, never :root overrides. Run `astryx theme add <slug>` to import; `theme eject <slug>` only forks source. See `astryx docs theme`.
- SELF-CHECK: re-read the file; replace any style={{…}}, raw <div>/<span>, imported .css/@apply, or hardcoded/arbitrary value (bg-[#fff], p-[13px]) with the component or a token-backed utility.

`astryx help` lists every command. Key ones beyond the workflow:
  search "<query>"   find any component / hook / doc / template
  discover <words>   integrations you could add
  docs <topic>       getting-started, principles, tokens, theme … (`astryx docs` lists all)
  docs cli           commands and API reference
  docs authoring     build an integration package, and every field it holds
  upgrade --from <old version> --apply   run after a dependency bump
<!-- ASTRYX:END -->

## Astryx in DAWLYY (read with the block above)

Adopted 10 Nov 2026 at Mohamed's request: Astryx is the design system for every new screen and for the polish
of existing ones. The old shadcn components in `components/ui` stay until a screen is migrated; do not add new ones.

- Wiring is done, do not repeat it: `app/layers.css` (cascade-layer order, imported first), the three Astryx
  stylesheets in `app/globals.css`, and `components/astryx-provider.tsx` (Theme, RTL and Arabic strings from the
  page locale, links through the next-intl `Link`) mounted in `app/[locale]/layout.tsx`.
- Import per component: `import { Button } from "@astryxdesign/core/Button"`. Astryx components are client
  components: use them from a `"use client"` file or a client child of a server page.
- The Astryx Tailwind bridge (`tailwind-theme.css`) is not imported: it redefines `text-primary`, `border-border`
  and `rounded-lg`, which the shadcn screens use with other meanings. Import it only in the commit that migrates
  the last shadcn screen. Until then, lay out with Astryx components (`VStack`, `HStack`, `Layout`, `AppShell`)
  or the existing Tailwind utilities.
- Headings: use the Astryx `Heading`/`Text` components. A bare `<h1>` keeps the Tailwind preflight size.
- Fonts come from the app (`--font-inter`, `--font-plex-arabic`) through the override at the end of `globals.css`.
- Product copy stays in next-intl (`messages/ar.json`, `messages/en.json`); never hardcode a label.
- Brand color: the neutral theme is black/grey. Before the polish wave, make a local theme with
  `defineTheme({ extends: neutralTheme, ... })` whose accent is the DAWLYY teal (`--brand` in `globals.css`), build
  it with `pnpm exec astryx theme build`, and swap it in `astryx-provider.tsx`. Never override `--color-*` on `:root`.
- Versions are pinned to 0.7.11. pnpm's release-age policy refuses anything published in the last day; do not add
  a `minimumReleaseAgeExclude` to get a newer one.
- Proof for every Astryx screen: it renders in `/ar` (RTL) and `/en`, at 375 px and 1440 px, with no console error.
