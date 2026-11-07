# DAWLYY — rules for every Codex build batch

You are building part of `@dawlyy/core`, the pure domain package of DAWLYY (an online coaching operating system for fitness coaches in Egypt: Arabic/English, multi-tenant). You work for Mohamed, the owner; Claude is the integrator who reviews and tests your output before anything is committed.

## Repository

- Root: the current working directory (`C:\Users\compuline\Desktop\dawlyy`). pnpm workspace: `apps/web`, `packages/core`, `packages/db`.
- You work ONLY in `packages/core/src/<module>/` and `packages/core/test/<module>.test.ts` for the modules named in your batch. Read anything you like; write nothing else.
- Read first: `packages/core/src/types/*.ts` (the shared contract: Zod schemas and TypeScript types), `docs/plans/2026-11-07-dawlyy-build-plan.md` (sections "Shared conventions" and "Codex tasks"), and `docs/spec/DAWLYY_v4_spec.md` for the sections your batch cites.

## Hard limits

- Do not run `pnpm`, `npm`, `npx`, `node`, `vitest`, `tsc` or any network command. The sandbox cannot spawn them; Claude runs typecheck and tests after you finish.
- Do not edit `package.json`, lockfiles, `tsconfig*.json`, `vitest.config.ts`, anything under `node_modules`, `apps/`, `packages/db/`, `docs/`, `.env*`, or any file outside your module folders and test files.
- Do not run `git` commands. Do not create branches, commits or stashes.
- Do not add dependencies. Allowed imports: `zod`, `date-fns`, `@date-fns/tz`, Node built-ins, and the package's own `../types` module.
- Do not change files in `packages/core/src/types/`. If the contract is missing something you need, define the extra type inside your module and say so in your final answer.

## Code conventions

- TypeScript strict with `noUncheckedIndexedAccess`; ESM; `import { x } from '../types'` (relative, no extension). Named exports only. Each module exposes a `src/<module>/index.ts` barrel.
- Pure functions, deterministic, no I/O, no `Date.now()` without an injected `now` parameter, no randomness.
- Validate external input with the Zod schemas from `../types` where a function accepts a document; otherwise trust typed inputs.
- Errors: throw `class <Module>Error extends Error { code: string }` with stable `code` strings listed in the brief; never throw plain strings.
- Every user-facing label you produce is a `LocalizedText` (`{ ar, en }`) with real Egyptian-Arabic coaching wording, not machine translation.
- Dates: `IsoDate` is `YYYY-MM-DD`; `IsoDateTime` carries an offset. Use `@date-fns/tz` (`TZDate`) for zone math; never assume the server zone.
- Tests: Vitest, in `packages/core/test/<module>.test.ts`, `import { describe, it, expect } from 'vitest'`, importing the module via `../src/<module>`. Cover every acceptance item in the brief plus the edge cases named there. Tests must be runnable without a database or network.
- Comments explain intent and spec references (e.g. `// spec §22: first check-in = Start Date + 7`), not restatements of the code.

## Finish

End with a short answer (plain prose) listing: files created or changed, every exported function with its one-line contract, test cases written, any contract gap you worked around, anything you could not do. Do not paste whole files into the answer.
