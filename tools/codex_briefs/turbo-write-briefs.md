# Codex brief: write the remaining build briefs for the reinvention build (docs only)

You write build briefs. You do not write app code. Use `collaboration.spawn_agent` to write the briefs in
parallel, one sub-agent per brief, then check that their file sets do not overlap and fix any that do.

## Read first

1. `docs/plans/2026-11-13-reinvent-build-plan.md`. This is the contract. Its "Hard limits" bind every brief.
2. `apps/web/AGENTS.md`, the "Astryx in DAWLYY" section. Every UI brief carries this rule.
3. The existing briefs, which show the house format and how much detail they carry:
   - `tools/codex_briefs/r1b-inbox-nav.md` (already written; leave it unchanged);
   - `tools/codex_briefs/r0c-app-controls.md`;
   - `tools/codex_briefs/r4a-week-review.md`.
4. The current code these tasks build on:
   - `apps/web/src/api/index.ts`;
   - `apps/web/src/components/shell/`;
   - `apps/web/components/`;
   - `apps/web/app/[locale]/`;
   - `packages/core/src/attention/`, `review/`, `safety/`;
   - `packages/db/src/schema/`.

   Read the R0c brief to learn which endpoints R0c adds: archive, restore, void, `client_modules`. Your briefs
   consume those endpoints and must not re-create them.

## Files you may write (and nothing else)

- `tools/codex_briefs/r2a-client-nav-today.md`
- `tools/codex_briefs/r2b-client-corrections-quicklog.md`
- `tools/codex_briefs/r2c-client-app-composer.md`
- `tools/codex_briefs/r3a-archive-undo-bulk.md`
- `tools/codex_briefs/r3b-activity-log.md`
- `tools/codex_briefs/r4b-review-api-ui.md`
- `tools/codex_briefs/r4d-ai-provider.md`
- `tools/codex_briefs/r5-polish-proof.md`
- `tools/codex_briefs/turbo-file-map.md`

## Each brief must contain

1. **Goal.** Quote the plan section the brief implements.
2. **Files.** List exactly the files the task may create or modify. Do not use a broad glob unless the folder is
   new.

   Some files are shared hot spots:
   - `apps/web/src/api/index.ts`;
   - `apps/web/messages/{ar,en}.json` and any per-namespace message files;
   - `apps/web/src/components/shell/nav-items.ts`;
   - `packages/core/src/index.ts`;
   - `packages/core/package.json`.

   Do not put a hot spot in a brief's file list. The brief must instead write its additions to its own file
   `tools/codex_briefs/integration/<task>.md` as an exact patch for Claude to apply: the lines to add and where.
   For messages, the task creates its own namespace file, if the repo uses per-namespace files; check how
   `apps/web/messages` is organised.
3. **Interfaces.**
   - Consumed: the exact endpoint paths and payloads from R0c and R1b, and the core function signatures.
   - Produced: what later tasks use.
4. **Acceptance checks the builder runs itself.** It works in its own git worktree with `node_modules`
   installed. It may run at most these:
   - `pnpm --filter @dawlyy/web typecheck` or `pnpm --filter @dawlyy/core typecheck`;
   - vitest on its own new test files only, one process at a time.

   It never runs `next dev`, `next build`, Playwright, or the database suites. Name the exact commands and the
   expected result.
5. **UI rules.**
   - ar (RTL) and en.
   - 44 px touch targets.
   - No horizontal overflow at 360, 390 and 430 px.
   - Every visual value comes from the token file.
   - Numbers use the shared numeral formatter from R0b.
   - Empty and loading states.
   - No skeleton as a settled state.
6. **Tests.** Unit and component tests to write, and the e2e flow from plan section P9 that the task owns. The
   e2e spec is written but runs only in P9.
7. **The answer wanted.** Files written, decisions taken, anything wrong in the brief.

## Requirements per task, beyond the plan

- **R2a** owns the client tab bar and Today. Check whether `apps/web/components/app/client-tab-bar.tsx` is the
  mounted one. Keep exactly one.
- **R3a** puts the undo toast in one shared component and hook (`useUndoableAction`). Every list uses it. R2b
  consumes the same hook, so R3a's brief defines the hook's interface. R2b imports it and does not write it.
- **R4b** binds approval to `ai_drafts.input_hash` server-side. It carries a test that a stale hash returns 409.
- **R4d** has no network in tests and no keys in the repo. The OpenRouter adapter always sends
  `provider: {data_collection: "deny", allow_fallbacks: false}`, and a test asserts it.

## `turbo-file-map.md`

A table with one row per brief: task, files, hot-spot patches, depends on (which tasks must be merged first), and
the merge order.

Group the tasks into at most 3 batches that can build at the same time in separate worktrees. Tasks in the same
batch must have no file in common.
