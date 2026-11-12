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

## Added 12 Nov (measured, then proposed)
- Measured: of the last 12 h, about 2 h were network outage (laptop on the iPhone hotspot) and about 2 h were three failing `screens` runs of 33 to 48 min. Gap between a job ending and the worker waking is only 1 to 3 min, so tick lag is not a problem.
- UNPROVEN, test it: `apps/web/playwright.config.ts` starts `next dev --port 3210`, which compiles every route on first visit (10 to 15 s each, minutes on a loaded laptop) and caused the first-visit timeouts in LESSONS. Try `next build` once per source hash, then `next start --port 3210` for e2e and screens. Build cost is paid once, every route is then instant and timings stop depending on a cold compile. Keep a separate `DAWLYY_DIST_DIR`. Time one full e2e run both ways and write both numbers in LESSONS.md before switching for good. Do not start `next dev` for this.
- Needs Mohamed's yes (not started): a GitHub Actions e2e job on a fast Linux runner (likely 3 to 5 times faster than this 15 W laptop, and immune to local network drops).

