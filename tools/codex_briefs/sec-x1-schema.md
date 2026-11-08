# Batch SEC-X1: RLS vocabulary and the Drizzle schema

## Files you may edit

- `packages/db/src/schema/_rls.ts`, `packages/db/src/schema/enums.ts`
- `packages/db/src/schema/tenants.ts`, `clients.ts`, `packages.ts`
- `packages/db/src/schema/programs.ts`, `nutrition.ts`, `forms.ts`
- `packages/db/src/schema/calendar.ts`, `tracking.ts`, `messaging.ts`, `ops.ts`
- a new schema file only if the doc names one; otherwise `tenant_hidden_items` goes in `programs.ts` and
  `message_revisions` in `messaging.ts`

Do not edit `packages/db/src/schema/index.ts` (it re-exports every schema file with `export *`).

## Read first

The whole contract doc, especially: section 3.3 (the table privilege matrix), section 5 (policy vocabulary 5.1 and
the policy matrix 5.2), section 8 (foreign keys, unique targets, CHECK constraints, child-side indexes 8.4), section 9
(schema additions: new tables and columns) and section 11 (migrations: the `DRIZZLE_NO_POLICIES` switch, the hand
edits list, and what each migration owns). Then the current schema files and `packages/db/migrations/0001_tables.sql`
for the real column names.

## Work, in this order

1. **Vocabulary (`_rls.ts`, `enums.ts`).** Implement the doc's policy vocabulary exactly (T, STAFF, CLIENT, OWN, ME,
   ACCESS and the rest, with the runtime role `dawlyy_rls` as the only policy target), the policy builder helpers the
   schema files use, and the `DRIZZLE_NO_POLICIES` switch with the exact behaviour section 11 gives it: while
   `DRIZZLE_NO_POLICIES=1` no helper emits a policy. Where the doc removes or renames an existing export, remove or
   rename it and migrate every caller in your schema files. Add any enum the schema additions need.
2. **Every table in the twelve schema files.** Implement on the Drizzle side everything the doc requires: the policies
   of the 5.2 matrix through the `_rls.ts` helpers (names exactly as 5.2 gives them); the composite and single-column
   foreign keys with the doc's names and ON DELETE actions; the unique targets the composite FKs need; the CHECK
   constraints; the child-side indexes of 8.4 and every other index the doc lists; the new tables and columns of
   section 9; and the defaults the doc states.
3. **Cross-file references.** Reference a table of another file only inside a lazy callback (the table's extra-config
   callback, or `.references(() => other.col)`), never at module top level, so import cycles such as tenants and
   clients stay safe. Type self-references with `AnyPgColumn`.
4. **What Drizzle cannot express** is not yours: triggers, functions, `on delete set null (col)` column lists,
   `SET DATA TYPE ... USING`, and every other hand edit section 11 lists. At each such spot add a one-line comment
   naming the migration that owns it (for example `// 0004 hand edit: on delete set null (client_id), doc §11.2`).

## Acceptance

- Every policy name, FK name, index name and CHECK name in the doc for these tables exists in the schema, spelled
  exactly as the doc spells it, at most 63 bytes.
- No policy targets any role but `dawlyy_rls`; with `DRIZZLE_NO_POLICIES=1` the helpers return no policies.
- No column name that does not exist in `0001_tables.sql` or in section 9.

In your final answer, also list every renamed or removed export of `_rls.ts` (old name, new name) and, per table, the
constraints and indexes you added.
