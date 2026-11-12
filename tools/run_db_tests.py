"""Run the database test suites (rls.test.ts and every security.*.test.ts) against a fresh, fully migrated database.

Usage: python tools/run_db_tests.py [--web] [--reuse-db] [vitest args, for example test/security.payments.test.ts]

`--web` runs the web app's database-backed vitest suite (apps/web, the API harness) on its own scratch database
`dawlyy_web` built the same way, instead of the packages/db suites.

Steps (all on the local cluster, 127.0.0.1:54329, never anything else): start Postgres when it is down, drop and create the
scratch database `dawlyy_sec`, apply every migration in one migrator run, re-set the dawlyy_app password, load the system
seed, then run `vitest run` in packages/db with DATABASE_URL and DATABASE_URL_SERVICE pointing at the scratch database.
`--reuse-db` skips the rebuild (debugging only). Credentials come from packages/db/.env and are never printed.
Why not dawlyy_test: the suites write fixtures there and a stale row from an earlier run breaks counts (rls R12).
"""
import os
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DB = 'dawlyy_sec'
PSQL = pathlib.Path.home() / '.pg0/installation/18.1.0/bin/psql.exe'


def read_urls() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / 'packages/db/.env').read_text(encoding='utf-8').splitlines():
        m = re.match(r'^\s*(DATABASE_URL(?:_SERVICE)?)\s*=\s*(.*?)\s*$', line)
        if m:
            values[m.group(1)] = m.group(2).strip('"\'')
    return values


def with_db(url: str) -> str:
    return re.sub(r'(//[^/]+/)[^/?]+', r'\g<1>' + DB, url, count=1)


def run(cmd: list[str], env: dict[str, str], cwd: pathlib.Path = ROOT) -> None:
    code = subprocess.run(cmd, env=env, cwd=cwd, shell=(os.name == 'nt')).returncode
    if code != 0:
        print(f'run_db_tests: step failed ({cmd[0]} {" ".join(cmd[1:4])}) exit {code}', flush=True)
        sys.exit(code)


def ensure_cluster() -> None:
    ready = PSQL.with_name('pg_isready.exe')
    if subprocess.run([str(ready), '-h', '127.0.0.1', '-p', '54329', '-q']).returncode == 0:
        return
    print('run_db_tests: local Postgres is down, starting it with tools/local_pg.ps1', flush=True)
    code = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                           str(ROOT / 'tools/local_pg.ps1'), '-Action', 'start']).returncode
    if code != 0:
        sys.exit(code)


def main() -> None:
    global DB
    extra = sys.argv[1:]
    reuse = '--reuse-db' in extra
    web = '--web' in extra
    extra = [a for a in extra if a not in ('--reuse-db', '--web')]
    if web:
        DB = 'dawlyy_web'
    ensure_cluster()
    urls = read_urls()
    for key in ('DATABASE_URL', 'DATABASE_URL_SERVICE'):
        if key not in urls or not re.search(r'//[^/@]*@?(127\.0\.0\.1|localhost)[:/]', urls[key]):
            sys.exit(f'run_db_tests: {key} must point at the local cluster')
    scratch = dict(os.environ)
    scratch['DATABASE_URL'] = with_db(urls['DATABASE_URL'])
    scratch['DATABASE_URL_SERVICE'] = with_db(urls['DATABASE_URL_SERVICE'])
    scratch.pop('DRIZZLE_NO_POLICIES', None)
    admin = re.sub(r'(//[^/]+/)[^/?]+', r'\g<1>postgres', urls['DATABASE_URL_SERVICE'], count=1)
    if not reuse:
        # Supabase runs every database in UTC; this machine's cluster defaults to Africa/Cairo, which the suites' timestamp
        # expectations (written for UTC) rightly reject. Pin the scratch database to the hosted default.
        for statement in (f'drop database if exists {DB} with (force)', f'create database {DB}',
                          f"alter database {DB} set timezone to 'UTC'"):
            run([str(PSQL), admin, '-v', 'ON_ERROR_STOP=1', '-c', statement], scratch)
        run(['pnpm', '--filter', '@dawlyy/db', 'migrate'], scratch)
        run(['powershell', '-NoProfile', '-File', str(ROOT / 'tools/local_pg.ps1'), '-Action', 'prepare'], scratch)
        run(['node', '--env-file=.env', '--import', 'tsx', './seed/index.ts'], scratch, ROOT / 'packages/db')
    package = '@dawlyy/web' if web else '@dawlyy/db'
    if not web and not extra:
        # seed/demo.test.ts needs the freshly loaded system library, which the security suites truncate: run it first, alone.
        run(['pnpm', '--filter', package, 'exec', 'vitest', 'run', '--reporter=default', 'seed'], scratch)
        run(['pnpm', '--filter', package, 'exec', 'vitest', 'run', '--reporter=default', 'test/'], scratch)
        return
    run(['pnpm', '--filter', package, 'exec', 'vitest', 'run', '--reporter=default', *extra], scratch)


if __name__ == '__main__':
    main()
