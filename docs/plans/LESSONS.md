# Lessons: what went wrong and the fix that worked

The worker reads this file at every run start and adds to it. One entry per solved problem or better method.
Format: `- DATE | symptom | root cause | fix or rule`. Newest at the bottom. Keep entries to one or two lines.
Never record secrets, tokens or personal data here.

- 2026-11-10 | `next build` or screens run panics in Turbopack | an env file or `.next` changed while another run used it | give each run its own `DAWLYY_DIST_DIR`; no apps/web edits while a build or screens job runs
- 2026-11-10 | `tsc` takes 20 min, process-list timeouts in the watchdog | laptop CPU starved by other processes | run one heavy job at a time through `job.py`; check CPU by process before blaming code
- 2026-11-11 | background Agent runs die when a session ends | the agent process belongs to the session | use `job.py` jobs or run in the foreground
- 2026-11-11 | three high-effort Codex jobs at once exhaust the ChatGPT plan in ~14 min | shared plan limit | one Codex job at a time; extra tasks go to Sonnet builders
- 2026-11-11 | worker stopped overnight with the autopilot left paused | an attended session paused it and never resumed | resume before ending any attended turn; a paused autopilot never resumes by itself
- 2026-11-11 | `git commit` swept in another task's staged file | the worker had staged a file earlier | commit with `git commit --only <paths>` and check `git diff --cached --name-only` first

