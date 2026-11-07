# Local Postgres for DB tests

A throwaway Postgres 18 cluster for the RLS tests. Port 54329, database `dawlyy_test`, trust auth on 127.0.0.1.

1. `powershell -File tools/local_pg.ps1 -Action init` creates the cluster, starts it, creates the database and the `dawlyy_app` role.
2. `-Action start` / `-Action stop` start and stop it. Log: `C:\Users\compuline\.pg0\instances\dawlyy-test\postgres.log`.
3. `-Action status` prints pg_ctl status and both connection URLs.
4. `-Action reset` stops, deletes the data directory and runs init again (migrate afterwards).
5. `-Action prepare` re-sets the `dawlyy_app` password (`dawlyy_app`) after migrations.
6. `-Action psql [-Sql "select 1"]` opens psql as `postgres` on the test database.
7. Then run `pnpm --filter @dawlyy/db migrate` and `pnpm --filter @dawlyy/db test:rls`.
8. Shortcuts in packages/db: `db:local:up`, `db:local:down`, `db:local:reset`, `db:local:prepare`.
9. It only touches `.pg0\instances\dawlyy-test`; other instances there belong to other projects.
10. Credentials live in packages/db/.env (gitignored); see packages/db/.env.example.
