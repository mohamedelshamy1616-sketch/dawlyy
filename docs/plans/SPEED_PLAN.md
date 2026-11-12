# Speed plan (12 Nov 2026)

Why runs are slow: i5-1345U (15 W), little free RAM, Defender scanning, and database tests that wait on disk. Ordered by gain.

## Done by Claude (12 Nov)
- Defender exclusion for `Desktop\dawlyy` and the pnpm store (Mohamed ran it, verified in the exclusion list).
- ChatGPT desktop closed: free RAM 2.3 to 3.7 GB.
- Power: turbo boost Aggressive, EPP 0, active cooling (read back with `powercfg /qh`).
- Local test cluster `dawlyy-test` (port 54329): `fsync=off`, `synchronous_commit=off`, `full_page_writes=off`, `max_wal_size=4GB` live after a reload. `shared_buffers=512MB` waits for the next restart. Backup: `postgresql.conf.bak-speed-20261112`. Throwaway cluster only; never copy these settings to Supabase or any real database.

## For the worker (in order)
1. **Template database.** Migrate once into `dawlyy_template`, then make `dawlyy_sec` and `dawlyy_web` with `CREATE DATABASE ... TEMPLATE dawlyy_template`. Rebuild the template only when a migration file or the seed changes (hash the migrations folder). Do this in `tools/run_db_tests.py`. Roles stay cluster-wide: never change them outside a full migration run.
2. **Filtered runs only.** Run one failing test file with vitest `-t` or the file path and `--reuse-db`. A full suite runs once before a commit, never to find one failure.
3. **No `next build` for tests.** The e2e job reuses an existing build when the source hash has not changed.
4. **One heavy job at a time** on this laptop. Parallel jobs fight for 15 W and RAM and finish later than running in turn.
5. **Cloud for the heavy suite (needs no secrets).** `.github/workflows/ci.yml` already has a `database` job with Postgres 17. A draft e2e job is allowed only with `workflow_dispatch` (manual) or once a day, because a private repo has about 2000 free minutes a month. Do not make it run on every push: the watchdog pushes hourly.

## Not now
- GitHub Codespaces or a paid runner: costs money, needs a new yes from Mohamed.
- Deleting data to free the disk (Apple MobileSync 221 GB): his decision.

## Measure
Time `dbtests` before and after item 1 and write both numbers in `docs/plans/LESSONS.md`. A claim of "faster" needs those two numbers.
