# Batch P5-T12a: the full demo tenant seed (build-plan Task 12, first part)

Extend the local demo seed so Mohamed can open the app on his PC and see a believable coaching business. The
three-client seed in `packages/db/seed/demo.ts` stays the base: its ids, the dev-login users and
`apps/web/e2e/screens.spec.ts` depend on the existing `DEMO_IDS`, so keep them and add new ids in the same
`d0250000-0000-4000-8000-0000000003xx` style. Read `docs/plans/2026-11-07-dawlyy-build-plan.md` (Task 12 and the
shared conventions), `packages/db/seed/demo.ts`, `index.ts`, `load.ts`, `validate.ts`, every schema file under
`packages/db/src/schema/`, and the guard and constraint SQL in `packages/db/sql/` (state machines, protected columns,
receipt counter, history triggers). The seed runs as the service role through `withServiceTx`; it must still satisfy
every CHECK, trigger and foreign key: never disable a trigger and never write a row the application could not create.

## What the demo tenant must hold

- 1 owner and 1 staff member (exist), and 8 clients in total: the 3 existing plus 5 new, each with a user, an
  `auth.users`-equivalent identity row the dev login lists (read `apps/web/src/server/dev-login.ts` for how users are
  discovered and keep that contract), a membership and a client row. Mix Egyptian Arabic names (mostly) with two
  English-first names. Spread their situation so every dashboard queue has something: active, expiring in 5 days,
  in grace, expired, frozen, new lead with a pending payment, one with no program yet, one at risk (missed
  check-ins).
- 3 packages in total (the existing one plus two): for example monthly online coaching, a three-month program, and
  nutrition only. Real entitlements, prices in EGP, durations, and one of them with a client-level override.
- 200 exercises and 300 foods: these come from the system seed (`seed/exercises/*.json`, `seed/foods/*.json`, loaded
  by `index.ts`). Do not duplicate them. Add a count assertion in a test that reads the JSON files and the validator.
- 2 programs published as versions and assigned to clients (one strength split, one fat-loss plan with cardio), and 2
  nutrition plans (diets) published and assigned, with real foods from the foods seed by slug.
- Forms: the default intake, weekly check-in and assessment templates (published versions), plus submissions for
  several clients in states `submitted` and `reviewed`, with a coach comment on at least two.
- Subscriptions with correct start, end, grace and schedule rows for each client situation above; calendar events
  generated the way the app does it (`@dawlyy/core` `generateSchedule`), some completed, some due, some overdue.
- Payments: verified with receipt numbers drawn through the receipt counter, one pending with a proof media row, one
  refunded, one rejected. Amounts and dates consistent with the subscriptions.
- Tracking: eight weeks of weight entries for four clients, two measurement sets, one progress photo set record
  without a real file (mark it clearly as a demo placeholder if the schema allows; otherwise skip photos).
- Workout history: for two clients, 6 to 10 completed sessions with set logs that show progression.
- Nutrition logs: a week of meal logs for one client.
- Messaging: one conversation per three clients with a handful of messages in Arabic, one unread each way.
- Tasks and notifications: a few open coach tasks (including system tasks the dashboard shows) and notifications.
- Consents: current terms and privacy consents for every client except one (so the consent screen has work to do).

All demo text is plain Egyptian Arabic where it is user-facing (names, messages, task titles), with English where a
field is English by design. Dates are relative to the day the seed runs (use one `now` captured at the start), so the
queues look alive whenever Mohamed loads it. Do not put real people's names, phone numbers or emails: phones use
the reserved Egyptian test pattern `+2010000000xx`, emails `@demo.dawlyy.test`.

## Behaviour

- Idempotent: running the seed twice leaves the same rows (deterministic ids and `onConflictDoNothing`, or an
  existence check, per table). It must not change rows an operator edited after the first run only where that is
  practical; at minimum it must not duplicate or throw.
- `pnpm --filter @dawlyy/db seed:demo` remains the entry point. Keep `demo.ts` readable: split by area into
  `packages/db/seed/demo/*.ts` modules called from `demo.ts` (people, catalog, programs-nutrition, forms, billing,
  tracking, activity). The existing `DEMO_IDS` export moves to `seed/demo/ids.ts` and `demo.ts` re-exports it.
- A reset helper `packages/db/seed/demo-reset.ts` that deletes only rows of the demo tenant id, in dependency order,
  for a scratch database (refuse to run unless `DATABASE_URL` points at 127.0.0.1 or localhost). History tables have
  delete-guard triggers: use the same service path the migrations allow (read how the erasure path
  `withErasureTx` works) and report if a table cannot be reset; do not weaken a trigger.

## Files you may write (and nothing else)

`packages/db/seed/demo.ts`, `packages/db/seed/demo-reset.ts`, `packages/db/seed/demo/*.ts`,
`packages/db/seed/demo.test.ts` (pure tests that need no database: the id list is unique and well formed, the
generated schedule and payment sums are consistent, counts match this brief; plus one DB-backed describe guarded by
`describe.runIf(process.env.DATABASE_URL)` that seeds twice and compares row counts per table).

## Acceptance checks you can run yourself (no pnpm, node or git)

Read-only: every table name and column you insert into exists in the schema files with that exact name; every enum
value exists in `enums.ts`; every trigger-protected column you write is allowed for the service role. List in your answer
any table you decided not to seed and why.

## The answer

Files written, the final `DEMO_IDS` list (names only), the demo logins (role, display name, locale), the situation of
each client in one line, ambiguities you resolved, and anything wrong in this brief.
