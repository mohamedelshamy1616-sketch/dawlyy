"""Apply a Codex `*** Begin Patch` block (apply_patch format) found in a text file to the repo.

Why: on 22 Nov 2026 Codex's workspace-write sandbox failed on this PC ("cannot enforce split writable root sets"),
so Codex runs read-only and returns its edits as apply_patch blocks in its final answer. This script is the
integrator step: it applies them, refusing anything ambiguous.

Usage: python tools/apply_codex_patch.py <answer.md> [--check]
  --check   parse and match every hunk, write nothing.
Format per file: `*** Add File: p`, `*** Update File: p` (hunks of ' ', '-', '+' lines, optional `@@` headers),
`*** Delete File: p`. Paths are relative to the repo root and may not leave it.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def safe(rel: str) -> Path:
    p = (REPO / rel.strip()).resolve()
    if REPO not in p.parents and p != REPO:
        raise SystemExit(f"path escapes the repo: {rel}")
    parts = {x.lower() for x in p.relative_to(REPO).parts}
    if parts & {".git", ".autopilot", "node_modules", ".env"} or p.name.startswith(".env"):
        raise SystemExit(f"protected path: {rel}")
    return p


def blocks(text: str) -> list[list[str]]:
    out, cur = [], None
    for line in text.splitlines():
        if line.strip() == "*** Begin Patch":
            cur = []
        elif line.strip() == "*** End Patch":
            if cur is not None:
                out.append(cur)
            cur = None
        elif cur is not None:
            cur.append(line)
    return out


def find(hay: list[str], needle: list[str], start: int) -> int:
    n = len(needle)
    for exact in (True, False):
        hits = [i for i in range(start, len(hay) - n + 1)
                if all((hay[i + j] == needle[j]) if exact else (hay[i + j].rstrip() == needle[j].rstrip()) for j in range(n))]
        if len(hits) == 1:
            return hits[0]
        if len(hits) > 1:
            # Hunks are ordered: take the first match at or after the previous hunk end.
            return hits[0]
    return -1


def apply_update(path: Path, body: list[str]) -> str:
    src = path.read_text(encoding="utf-8")
    crlf = "\r\n" in src
    lines = src.replace("\r\n", "\n").split("\n")
    hunks, cur = [], None
    for line in body:
        if line.startswith("@@"):
            cur = []
            hunks.append(cur)
        elif line.startswith("*** End of File"):
            continue
        else:
            if cur is None:
                cur = []
                hunks.append(cur)
            cur.append(line)
    pos = 0
    for h in hunks:
        old = [l[1:] for l in h if l[:1] in (" ", "-")]
        new = [l[1:] for l in h if l[:1] in (" ", "+")]
        bad = [l for l in h if l[:1] not in (" ", "-", "+") and l != ""]
        if bad:
            raise SystemExit(f"{path}: unexpected hunk line {bad[0]!r}")
        if not old:
            lines[pos:pos] = new
            pos += len(new)
            continue
        i = find(lines, old, pos)
        if i < 0:
            raise SystemExit(f"{path}: hunk not found:\n" + "\n".join(old[:6]))
        lines[i:i + len(old)] = new
        pos = i + len(new)
    out = "\n".join(lines)
    return out.replace("\n", "\r\n") if crlf else out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("answer", type=Path)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    text = a.answer.read_text(encoding="utf-8", errors="replace")
    bl = blocks(text)
    if not bl:
        print("no patch block found")
        return 2
    writes: dict[Path, str | None] = {}
    for b in bl:
        i = 0
        while i < len(b):
            m = re.match(r"\*\*\* (Add|Update|Delete) File: (.+)", b[i])
            if not m:
                i += 1
                continue
            kind, rel = m.group(1), m.group(2)
            j = i + 1
            while j < len(b) and not b[j].startswith("*** ") or (j < len(b) and b[j].startswith("*** End of File")):
                j += 1
            body = b[i + 1:j]
            p = safe(rel)
            if kind == "Add":
                writes[p] = "\n".join(l[1:] if l.startswith("+") else l for l in body) + "\n"
            elif kind == "Delete":
                writes[p] = None
            else:
                if p in writes and writes[p] is not None:
                    raise SystemExit(f"{rel}: updated twice in one answer; merge the hunks")
                writes[p] = apply_update(p, body)
            i = j
    for p, content in writes.items():
        print(("DELETE " if content is None else "WRITE  ") + str(p.relative_to(REPO)))
        if a.check:
            continue
        if content is None:
            p.unlink()
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8", newline="")
    print(("checked " if a.check else "applied ") + f"{len(writes)} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
