---
name: dawlyy-dashboard
description: "Update Mohamed's private DAWLYY status dashboard (https://claude.ai/artifact/JkbMzpKAkRbVpN4zKFdwVT): edit the rows in tools/dashboard/build.py in plain Egyptian Arabic, rebuild the JSON, and leave a publish request for the autopilot publisher. Use at every phase change, after about 2 hours of work, or when Mohamed asks to update the dashboard (7adis el dashboard)."
---

# DAWLYY dashboard

The dashboard is a private claude.ai artifact with three datasets: `steps` (the whole plan), `now` (what runs
right now) and `needs` (what waits for Mohamed). Their source of truth is `tools/dashboard/build.py`.

1. Edit the lists in `tools/dashboard/build.py`:
   - STEPS: `(phase, step, state, low hours, high hours, note)`, state is `done`, `now`, `next` or `later`, and
     exactly one row is `now`.
   - NOW: `(what, state code, detail)`, state code `running`, `done`, `failed` or `waiting`.
   - NEEDS: `(item, why, what happens without an answer, when, urgency code)`, urgency `now`, `soon` or `later`.
     Keep it the same in substance as `docs/plans/APPROVALS.md`.
   - Short plain Egyptian Arabic, the way Mohamed talks; no jargon, no file paths unless he needs one.
   - Never env values, keys, tokens, passwords or personal data.
2. Run `python tools/dashboard/build.py`. It writes `steps.json`, `now.json`, `needs.json` and
   `tools/dashboard/publish_request.json`.
3. Upload:
   - Autopilot worker (no Artifact tool): nothing more. The watchdog sees the new request and starts a short
     Haiku background session that uploads the files and updates the datasets, at most every 90 minutes.
     `.autopilot/publisher.json` records the last launch.
   - Attended session with the Artifact tools: upload each JSON with Artifact `publish` (`url` the dashboard,
     `file_path` the JSON, `asset: true`), then ArtifactData `get` on `datasets/<doc_id>` for the version, then one
     ArtifactData `batch` with an `update` per doc: `{"source": {"kind": "file", "url": "<asset url>", "name":
     "<file>", "format": "json"}, "updated": {"at": "<UTC ISO Z>", "by": "claude"}, "edit": {"via": "claude",
     "at": "<same>"}}` and `if_version`.
