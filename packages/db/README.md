# @dawlyy/db

Drizzle schema, SQL migrations, row-level security (RLS) and the only allowed database access path (`src/client.ts`:
`withAuthTx`, `withUserTx`, `withServiceTx`).

## Local database and RLS tests (Windows)

```powershell
copy .env.example .env                                  # then keep the local values (see below)
pnpm --filter @dawlyy/db db:local:reset                  # first time: creates the cluster; later: wipes it
pnpm --filter @dawlyy/db migrate                         # applies the 3 migrations
pnpm --filter @dawlyy/db test:rls                        # 12 RLS tests against the real database
pnpm --filter @dawlyy/db db:local:down                   # stop the cluster when done
```

- The cluster is Postgres 18 under `C:\Users\compuline\.pg0\instances\dawlyy-test`, port **54329**, database
  `dawlyy_test`, managed by `tools/local_pg.ps1` (`init|start|stop|status|reset|prepare|psql`, see `tools/local_pg.md`).
- `packages/db/.env` (gitignored) for the local cluster:
  `DATABASE_URL_SERVICE=postgresql://postgres@127.0.0.1:54329/dawlyy_test` (migrations, `withServiceTx`) and
  `DATABASE_URL=postgresql://dawlyy_app:dawlyy_app@127.0.0.1:54329/dawlyy_test` (runtime role, RLS enforced).
- `init`/`reset` create the `dawlyy_app` role and set its local password; the migrations never set a password.
  `db:local:prepare` re-applies it.
- There is deliberately **no** `test` script: CI must not run RLS tests without a database. Run `test:rls` explicitly.
- The suite truncates `tenants` and `audit_log` (cascading) before and after it runs, so it needs a dedicated test database.

## How the SQL files map to migrations

Order matters. Drizzle's generated `CREATE POLICY` statements call `app.tenant_id()` and friends, and `app.membership()`
reads `public.memberships`, which only exists after the tables. So the hand-written SQL is split around the generated tables:

| Migration | Kind | Content |
|---|---|---|
| `migrations/0000_app_schema.sql` | custom | `check_function_bodies = off`, roles `authenticated` and `dawlyy_app`, schema `app`, helper functions |
| `migrations/0001_tables.sql` | generated from `src/schema` | tables, enums, indexes, `ENABLE ROW LEVEL SECURITY`, policies |
| `migrations/0002_app_post_tables.sql` | custom | table and sequence grants, default privileges, published-version triggers, `app.next_client_code`, audit triggers |

The files in `migrations/` are the only source of truth (an earlier `sql/` copy was removed on 2026-11-07 so the two
could not drift). New hand-written SQL goes into a new custom migration:
`pnpm --filter @dawlyy/db exec drizzle-kit generate --custom --name <name>`. Once a migration has run anywhere that
matters (staging, production), never edit it; add a new one. Schema changes: edit `src/schema/*`, run
`pnpm --filter @dawlyy/db generate`. Keep the `--> statement-breakpoint` markers.

## Supabase deployment

1. Run the migrations with the **postgres** connection (direct, port 5432): set `DATABASE_URL_SERVICE` to
   `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres` and run `pnpm --filter @dawlyy/db migrate`.
   `authenticated` already exists on Supabase; the migration only creates `dawlyy_app` (login, NOINHERIT, NOBYPASSRLS, no password).
2. Set the runtime password once, in the SQL editor: `alter role dawlyy_app password '<long random secret>';`
3. Build `DATABASE_URL` for the transaction pooler on **port 6543**, with the project-qualified user:
   `postgresql://dawlyy_app.<ref>:<secret>@aws-0-<region>.pooler.supabase.com:6543/postgres`.
   `client.ts` already sets `prepare: false`, which the pooler requires.
4. Grant `dawlyy_app` to Supabase's pooler only if the pooler reports a missing role. The app role can do nothing until
   `withAuthTx` runs `SET LOCAL ROLE authenticated`, which is the point of the design.
