"""Run one beta-gate Playwright project against a fresh local database.

Usage: python tools/run_e2e.py e2e-ar|e2e-en

Steps (all on the local cluster, 127.0.0.1:54329, never anything else): drop and create the scratch database
`dawlyy_e2e`, apply every migration, re-set the dawlyy_app password, load the system seed and the demo seed, then run
`playwright test -c playwright.e2e.config.ts --project <name>` with DATABASE_URL and DATABASE_URL_SERVICE pointing at it.
Credentials are read from packages/db/.env and never printed.
"""
import os
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
DB = 'dawlyy_e2e'
PSQL = pathlib.Path.home() / '.pg0/installation/18.1.0/bin/psql.exe'


def read_env() -> dict[str, str]:
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
        print(f'run_e2e: step failed ({cmd[0]} {" ".join(cmd[1:4])}) exit {code}', flush=True)
        sys.exit(code)


def ensure_cluster() -> None:
    """The local cluster has died twice on 11 Nov (postgres child exit 0xC000026B); start it when it is not ready."""
    ready = PSQL.with_name('pg_isready.exe')
    if subprocess.run([str(ready), '-h', '127.0.0.1', '-p', '54329', '-q']).returncode == 0:
        return
    print('run_e2e: local Postgres is down, starting it with tools/local_pg.ps1', flush=True)
    code = subprocess.run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
                           str(ROOT / 'tools/local_pg.ps1'), '-Action', 'start']).returncode
    if code != 0:
        sys.exit(code)


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ('e2e-ar', 'e2e-en', 'screens'):
        sys.exit('usage: python tools/run_e2e.py e2e-ar|e2e-en|screens')
    project = sys.argv[1]
    ensure_cluster()
    urls = read_env()
    for key in ('DATABASE_URL', 'DATABASE_URL_SERVICE'):
        if key not in urls or not re.search(r'//[^/@]*@?(127\.0\.0\.1|localhost)[:/]', urls[key]):
            sys.exit(f'run_e2e: {key} must point at the local cluster')
    env = dict(os.environ)
    env['DATABASE_URL'] = with_db(urls['DATABASE_URL'])
    env['DATABASE_URL_SERVICE'] = with_db(urls['DATABASE_URL_SERVICE'])
    env.pop('DRIZZLE_NO_POLICIES', None)
    env.setdefault('DAWLYY_DEV_LOGIN_SECRET', '0123456789abcdef0123456789abcdef0123456789abcdef')

    extra = sys.argv[2:]
    # --reuse-db: debugging only. Keeps the existing dawlyy_e2e (migrating it takes ~10 min on this disk).
    reuse = '--reuse-db' in extra
    extra = [a for a in extra if a != '--reuse-db']
    # --only <parts> (screens target): rerun only the screens whose image name contains one of the comma-separated parts.
    if '--only' in extra:
        at = extra.index('--only')
        env['SCREENS_ONLY'] = extra[at + 1]
        del extra[at:at + 2]
    if not reuse:
        # A full run starts from a clean Turbopack cache. A cache left by earlier runs over edited sources made the dev
        # server panic ("task is missing in memory or persistent storage", run_checks at ecf0de2: 500s on one route,
        # then rebuild loops and timeouts in the next project). `--reuse-db` runs keep it for speed.
        # Fonts are self-hosted (apps/web/app/fonts), so a cold cache needs no network.
        shutil.rmtree(ROOT / 'apps/web/.next-e2e', ignore_errors=True)
        admin = re.sub(r'(//[^/]+/)[^/?]+', r'\g<1>postgres', urls['DATABASE_URL_SERVICE'], count=1)
        for sql in (f'drop database if exists {DB} with (force)', f'create database {DB}'):
            run([str(PSQL), admin, '-v', 'ON_ERROR_STOP=1', '-c', sql], env)
        run(['pnpm', '--filter', '@dawlyy/db', 'migrate'], env)
        run(['powershell', '-NoProfile', '-File', str(ROOT / 'tools/local_pg.ps1'), '-Action', 'prepare'], env)
        db_dir = ROOT / 'packages/db'
        for seed in ('seed/index.ts', 'seed/demo.ts'):
            run(['node', '--env-file=.env', '--import', 'tsx', f'./{seed}'], env, db_dir)
    if project == 'screens':  # docs/qa/screens/*.png through playwright.config.ts (its own dev server on 3210)
        run(['pnpm', '--filter', '@dawlyy/web', 'exec', 'playwright', 'test', 'e2e/screens.spec.ts', '--reporter=line', *extra], env)
        return
    run(['pnpm', '--filter', '@dawlyy/web', 'exec', 'playwright', 'test', '-c', 'playwright.e2e.config.ts',
         '--project', project, '--reporter=line', *extra], env)


if __name__ == '__main__':
    main()
