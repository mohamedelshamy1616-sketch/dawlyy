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
    ap.add_argument("--common", default=str(COMMON), help="shared rules file prepended to the brief, or 'none'")
    args = ap.parse_args()

    brief_path: Path = args.brief if args.brief.is_absolute() else (REPO / args.brief)
    if not brief_path.exists():
        print(f"brief not found: {brief_path}", file=sys.stderr)
        return 2
    common = "" if args.common == "none" else Path(args.common).read_text(encoding="utf-8") + "\n\n---\n\n"
    prompt = common + brief_path.read_text(encoding="utf-8")

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
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        cwd=str(args.cwd),
        env=env,
        creationflags=flags,
    )
    try:
        out, err = proc.communicate(input=prompt, timeout=args.timeout)
        code = proc.returncode
    except subprocess.TimeoutExpired:
        code = 124
        # Kill the whole tree: codex.exe starts shells and node processes of its own.
        subprocess.run(["taskkill.exe", "/PID", str(proc.pid), "/T", "/F"],
                       capture_output=True, timeout=30, creationflags=flags)
        try:
            out, err = proc.communicate(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
            out, err = "", "(could not collect output after the timeout kill)"
        print(f"[codex_build] TIMEOUT after {args.timeout}s; process tree killed", file=sys.stderr)
    log.write_text((out or "") + "\n--- stderr ---\n" + (err or ""), encoding="utf-8", newline="\n")

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
