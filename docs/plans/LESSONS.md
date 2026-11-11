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

- 2026-11-11 | `next build` fails "uncached or runtime data during prerendering" at `/ar/login` with cacheComponents | `NextIntlClientProvider` reads request config and messages at request time, outside Suspense | wrap the provider tree in the locale layout in `<Suspense fallback={null}>`; do not use `--experimental-build-mode generate` to diagnose (it gave unrelated useContext errors)
- 2026-11-11 | a build took 37 min, the same build 1 min later | the machine was CPU-starved, not the code | before a long job look at `Get-Process | sort CPU`; rerun once CPU is free
- 2026-11-11 | e2e invitee step blocked: dev login refuses identities without a demo membership | dev login only listed active demo memberships | `isUnattachedIdentity` allows a membership-free uuid (dev only); existing members must stay on the demo list
- 2026-11-11 | `e2e-ar` was relaunched 8 times in 22 min and failed every time | each rerun came before the cause was known; the 422 body was never printed | after ONE failed e2e run, stop: make the failing assertion print the response body or trace, read it, fix, then run once. Same job name failed twice = change angle (read the evidence), failed three times = STATE.md note, OPEN_DECISIONS.md, move on
