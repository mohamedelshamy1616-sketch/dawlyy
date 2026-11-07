"""Run one Codex build task inside this repository.

Usage:
    python tools/codex_build.py tools/codex_briefs/core-batch-a.md [--timeout 5400] [--effort high]

What it does:
  * prepends tools/codex_briefs/_common.md (shared rules) to the brief;
  * runs `codex exec` non-interactively with a workspace-write sandbox, the clean
    CODEX_HOME from agent-bridge (no MCP servers, no plugins) and every paid-provider
    environment variable stripped;
  * writes Codex's final answer to tools/.codex-answers/<stamp>-<brief>.md and the raw
    stdout/stderr next to it;
  * prints the exit code, the answer path and `git status --porcelain` so the reviewer
    sees exactly which files changed.

Codex never runs tests here (its sandbox cannot spawn vitest). Claude runs
`pnpm --filter @dawlyy/core typecheck` and `pnpm --filter @dawlyy/core test`, reviews the
diff and only then commits.
"""

from __future__ import annotations

import argparse
import datetime as dt
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BRIDGE_DIR = Path(r"C:\Users\compuline\agent-bridge")
sys.path.insert(0, str(BRIDGE_DIR))
import bridge  # noqa: E402  (agent-bridge: CODEX_EXE, CODEX_HOME, child_env)

COMMON = REPO / "tools" / "codex_briefs" / "_common.md"
ANSWERS = REPO / "tools" / ".codex-answers"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("brief", type=Path, help="markdown brief for this batch")
    ap.add_argument("--timeout", type=int, default=5400, help="seconds before the Codex process is killed")
    ap.add_argument("--effort", default="high", choices=["low", "medium", "high", "xhigh"], help="model_reasoning_effort")
    ap.add_argument("--cwd", type=Path, default=REPO, help="repository root Codex works in")
    args = ap.parse_args()

    brief_path: Path = args.brief if args.brief.is_absolute() else (REPO / args.brief)
    if not brief_path.exists():
        print(f"brief not found: {brief_path}", file=sys.stderr)
        return 2
    prompt = COMMON.read_text(encoding="utf-8") + "\n\n---\n\n" + brief_path.read_text(encoding="utf-8")

    ANSWERS.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    answer = ANSWERS / f"{stamp}-{brief_path.stem}.md"
    log = ANSWERS / f"{stamp}-{brief_path.stem}.log"

    cmd = [
        str(bridge.CODEX_EXE),
        "exec",
        "--skip-git-repo-check",
        "-s",
        "workspace-write",
        "-c",
        'windows.sandbox="unelevated"',
        "-c",
        f'model_reasoning_effort="{args.effort}"',
        "-C",
        str(args.cwd),
        "-o",
        str(answer),
        "-",
    ]
    env = bridge.child_env(CODEX_HOME=str(bridge.CODEX_HOME))

    started = dt.datetime.now()
    print(f"[codex_build] {brief_path.name} started {started:%H:%M:%S}, answer -> {answer}")
    try:
        proc = subprocess.run(
            cmd,
            input=prompt,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=str(args.cwd),
            env=env,
            capture_output=True,
            timeout=args.timeout,
        )
        code = proc.returncode
        log.write_text((proc.stdout or "") + "\n--- stderr ---\n" + (proc.stderr or ""), encoding="utf-8")
    except subprocess.TimeoutExpired as exc:
        code = 124
        log.write_text(
            (exc.stdout or "") if isinstance(exc.stdout, str) else "" + "\n--- stderr ---\n" + ((exc.stderr or "") if isinstance(exc.stderr, str) else ""),
            encoding="utf-8",
        )
        print(f"[codex_build] TIMEOUT after {args.timeout}s", file=sys.stderr)

    elapsed = dt.datetime.now() - started
    status = subprocess.run(["git", "status", "--porcelain"], cwd=str(args.cwd), capture_output=True, text=True, encoding="utf-8")
    print(f"[codex_build] exit={code} elapsed={elapsed} log={log}")
    print("[codex_build] changed files:")
    print(status.stdout or "  (none)")
    if answer.exists():
        text = answer.read_text(encoding="utf-8", errors="replace")
        print("[codex_build] answer (last 40 lines):")
        print("\n".join(text.splitlines()[-40:]))
    return code


if __name__ == "__main__":
    raise SystemExit(main())
