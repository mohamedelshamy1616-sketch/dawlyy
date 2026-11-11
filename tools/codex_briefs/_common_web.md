# DAWLYY: rules for every Codex build batch of the wave-2 web and API tasks

You are building part of DAWLYY, an online coaching operating system for fitness coaches in Egypt (Arabic and English,
RTL and LTR, multi-tenant). You work for Mohamed, the owner. Claude is the integrator: it reviews your diff, runs
typecheck, lint and tests, and only then commits. Other Codex builders work on other tasks at the same time, on
disjoint files.

## Repository

- Root: the current working directory (`C:\Users\compuline\Desktop\dawlyy`). pnpm workspace: `apps/web` (Next.js 16.4
  with a Hono API at `/api/v1`), `packages/core` (pure TypeScript domain, already built), `packages/db` (Drizzle schema,
  migrations, client library; frozen).
- Contract: `docs/plans/2026-11-07-dawlyy-build-plan.md` (Global Constraints, Shared conventions, your task) and
  `docs/spec/DAWLYY_v4_spec.md` (read only the sections your brief names). The database security design
  `docs/architecture/02-database-security-model.md` is 428 KB: never read it whole. Run `grep -n '^#'` and read only
  the sections named in your brief; section 12.1 (API obligations) applies to every task.
- This Next.js (16.4) differs from older versions. Before you write a page, layout or route, read the matching guide in
  `apps/web/node_modules/next/dist/docs/` (App Router, Cache Components, `connection()`, `params` as a Promise).

## Hard limits

- Do not run `pnpm`, `npm`, `npx`, `node`, `vitest`, `tsc`, `psql`, `git` or any network command. The sandbox cannot run
  them. Claude runs typecheck, lint and the tests after you finish, so write code that compiles the first time: read
  the types you import before using them.
- Edit ONLY the files your brief lists. Do not touch `packages/db/**`, `packages/core/**` (read-only contract; if a
  core function lacks something, write a small helper inside your own files and report the gap), migrations,
  `docs/**`, `package.json`, lockfiles, `tsconfig*.json`, `vitest.config.ts`, `.env*`, `apps/web/i18n/request.ts`,
  `apps/web/src/components/shell/**`, `apps/web/src/api/index.ts`, `apps/web/src/api/middleware/**`,
  `apps/web/src/server/auth.ts`, `apps/web/src/server/dev-login*`, `apps/web/src/test/**`, or any file of another task.
- Do not add dependencies. Allowed imports: what `apps/web/package.json` and `packages/core/package.json` already list,
  Node built-ins, `@dawlyy/core/<module>` subpath exports, `@dawlyy/db` and `@dawlyy/db/schema`.
- Do not create branches, commits or stashes. Never print or write secrets, keys or env values.

## Binding rules (security design, section 12.1, and the build plan)

1. Every route is a `createRoute` + `router.openapi(...)` on the module's `router` (`OpenAPIHono<ApiEnv>`, see
   `apps/web/src/api/me.ts` for the pattern). Mount auth with `router.use('<path>', requireAuthMiddleware)` for each
   path pattern the router serves (Hono `use` needs the pattern; `'/'` alone does not cover sub-paths: use `'*'` inside
   the module router). Request bodies, params and queries are Zod schemas (Zod 4). Errors are `ApiError` helpers from
   `apps/web/src/api/errors.ts`; codes and statuses follow the plan (400 validation, 401, 403, 404, 409, 422).
2. Database access: only through `withAuthTx(auth, fn)` (exported by `apps/web/src/server/db.ts`). Services take the
   transaction as a parameter. `withServiceTx` is allowed only where your brief says so, with a reason string, and every
   query inside it filters by tenant explicitly. Never use `sql.raw`. Build SQL with the `sql` tag or Drizzle operators.
3. `requirePermission(auth, module, action)` from `apps/web/src/server/require-permission.ts` runs before the first
   write of every mutating route and before the read of staff-only data. Owners pass; clients never pass a coach module.
4. Client-facing endpoints select through the `clientColumns` maps (`@dawlyy/db`), never `select *` and never a table
   object, so coach-internal columns (`tags`, `source`, `notes`, `change_note`, `created_by`, `payload`) cannot leak.
5. Mutating routes mount `idempotentReplay` after auth (from `apps/web/src/api/middleware/idempotency.ts`).
   Lists use `parseListQuery`, `page`, `encodeCursor` from `apps/web/src/api/lib/pagination.ts`: keyset pagination
   with a stable `(sort key, id)` tie-breaker, fetching `limit + 1` rows.
6. No `ON CONFLICT` and no `MERGE` on `payments` or `clients` (section 12.1 item 13). Assigned-scope staff cannot read
   back a client they just created in the same statement: insert without `RETURNING`, then select (item 14).
7. Server-owned columns (`id` when generated, `tenant_id`, `created_by`, `created_at`, `updated_at`, `published_at`,
   `published_by`, `current_version_id`, `published_version_id`, `receipt_no`, `code`, state columns that a trigger
   owns) are never taken from the request body. The guard triggers reject them and RLS cannot be bypassed from here;
   do not try to work around a refusal, report it.
8. Audit and events: call `app.audit(...)` and `app.emit_event(...)` (through `tx.execute(sql\`select app.audit(...)\`)`)
   only with names from the allow-lists in doc section 9.2 (`app.audit_actions`, `app.event_types`). Read the section
   before using a name; an unlisted name fails with 42501.
9. UI: Server Components read through the same boundary: `requirePage()` from `apps/web/src/server/auth.ts` then
   `withAuthTx`. Use `PageHeader`, `EmptyState`, `PageSkeleton` from `apps/web/src/components/shell/`. For every new
   control and layout piece (buttons, inputs, selects, dialogs, tabs, tables, cards, badges, headings, text) use the
   Astryx design system (`@astryxdesign/core`, pinned 0.7.11, already wired in the root layout): read the section
   "Astryx in DAWLYY" and the managed Astryx block in `apps/web/AGENTS.md` first; import per component
   (`@astryxdesign/core/Button`), inside a `"use client"` file. Use a shadcn primitive from `apps/web/components/ui/`
   only when Astryx has no equivalent, and say so in your answer. Do not rewrite existing shadcn screens in this
   batch. Do not import `tailwind-theme.css` from Astryx. Product copy stays in next-intl. Tailwind logical utilities only (`ms-`, `me-`, `ps-`, `pe-`, `start-`,
   `end-`, `text-start`); no `left`/`right` classes. Every screen works at 360 px in RTL with no horizontal scroll
   (`min-w-0`, `max-w-full`, wrap long text). Touch targets are at least 44 px. Every route has a loading state
   (`loading.tsx`) and an empty state; no blank page.
10. i18n: every visible string comes from next-intl. Add keys to BOTH `apps/web/messages/ar/<ns>.json` and
    `apps/web/messages/en/<ns>.json`, identical key sets, for the namespace files your brief owns (already registered
    in `apps/web/i18n/request.ts`; do not edit that file). Arabic is Egyptian coaching register, not literal translation.
    Status words are fixed (spec section 61): reuse `status.*`. Numbers and dates through `Intl` with the active locale.
11. Tests: Vitest in `apps/web/src/**/*.test.ts` (the vitest config includes only `src/**/*.test.ts`; React component
    tests are out of scope). Pure logic gets pure unit tests. Routes get DB-backed tests with the harness in
    `apps/web/src/test/api-harness.ts` (read it and `apps/web/src/server/dev-login.test.ts`; `call(app, method, path,
    { as, body })`, `setupApiFixture()`, `setupApiData()`); they need `DATABASE_URL` and `DATABASE_URL_SERVICE` and Claude
    runs them. A test asserts behavior from the spec or plan. Never write a test that passes by weakening a check.
12. Code: TypeScript strict with `noUncheckedIndexedAccess`; ESM; named exports; no `any`; match the neighbouring files.
    A short doc comment on each new export names the plan task or doc section it implements. LF line endings.

## Finish

End with a short plain-prose answer: files created or changed; each route (method, path, permission, error codes);
exported names other builders use; deviations from the brief or doc, each with the reason; ambiguities you resolved and
how; anything in the brief that is wrong against the real code; anything you could not do. Do not paste whole files.
