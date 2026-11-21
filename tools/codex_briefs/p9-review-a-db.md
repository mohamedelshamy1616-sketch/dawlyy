## Your slice: A, database (ID prefix `RA-`)
Report file: `docs/qa/review-parts/A-db.md` (create the folder if needed).

Scope: `packages/db/migrations/0008_reinvent_control.sql` and its journal entry, `packages/db/src/schema/**` changes since `96ada68`, `packages/db/src/client-columns.ts`, and how 0008 interacts with the earlier RLS policies (0005), guards and grants (0006, 0007). Also `packages/db/test/**` additions: do they actually prove the RLS and guard behaviour 0008 introduces (new `test-db` coverage is a hard limit)?

Questions to answer with evidence:
1. Every new table: is RLS enabled and forced, with policies for every command, tenant-scoped, and are `anon`/`authenticated` Data-API grants correct? Any new table or column missing from the matrix tests?
2. The correction window and corrections history: can a client edit or delete a log outside the window, can history rows be updated or deleted by anyone, does a correction keep the old value?
3. Archive and restore, review drafts with `input_hash` (stale-draft binding enforced in SQL or only in app code?), red flags, activity log, client module toggles (a hidden module must also block writes, not only reads).
4. Guard triggers: server-only columns writable by a client? SECURITY DEFINER functions: search_path pinned, owner, EXECUTE grants?
5. Is 0008 additive only (the rollback plan says it only adds columns and tables)?
