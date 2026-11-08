# DAWLYY — rules for every Codex batch of the database security build

You are building part of the database security layer of DAWLYY (an online coaching operating system for fitness
coaches in Egypt: Arabic/English, multi-tenant SaaS). You work for Mohamed, the owner. Claude is the integrator: it
reviews your diff, runs typecheck, migrations and tests, and only then commits.

## Repository and contract

- Root: the current working directory (`C:\Users\compuline\Desktop\dawlyy`). pnpm workspace: `apps/web` (Next.js 16
  with a Hono API at `/api/v1`), `packages/core` (pure TypeScript domain), `packages/db` (Drizzle ORM 0.45.4 and
  drizzle-kit 0.31.11 on Supabase Postgres; Vitest 5; Zod 4).
- The binding contract is `docs/architecture/02-database-security-model.md`. It is frozen for this build: implement it
  exactly and never edit it. `docs/architecture/02-database-security-triage.md` records why each rule exists; read the
  entries the doc's rules point to when a rule is unclear.
- Other builders (Codex and Claude agents) edit other files at the same time. Edit ONLY the files your brief lists.
  Read anything you like.

## Hard limits

- Do not run `pnpm`, `npm`, `npx`, `node`, `vitest`, `tsc`, `drizzle-kit`, `psql`, `git` or any network command. The
  sandbox cannot run them; Claude's integrators run typecheck, migrations and tests after you finish.
- Do not edit `package.json`, lockfiles, `tsconfig*.json`, `vitest.config.ts`, `node_modules`, `docs/`, `.env*`,
  migrations, or any file your brief does not list.
- Do not add dependencies. Do not create branches, commits or stashes.

## Code conventions

- TypeScript strict with `noUncheckedIndexedAccess`; ESM; named exports; no `any`. Follow the conventions of the
  neighbouring files (read two or three siblings first).
- Keep LF line endings.
- Put a short doc comment on each new export naming the doc section it implements (for example `// doc §6.3`).
- Never weaken a test, guard, policy, CHECK or check to make something fit. If the doc is ambiguous or does not fit the
  real code, take the reading that is safer for tenant and client isolation and report it as a deviation. Never invent
  product rules.
- Names of database objects are at most 63 bytes.

## Finish

End with a short plain-prose answer listing: files created or changed; every exported name with its signature and a
one-line contract (other builders code against this list); deviations from the doc, each with the reason; what other
builders must provide for your files to compile or work; anything you could not do. Do not paste whole files.
