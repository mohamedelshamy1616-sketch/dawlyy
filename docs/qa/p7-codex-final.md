# P7 final review by Codex (read-only), HEAD bd8d0dd, 12 Nov 2026

Raw answer from the bridge thread p7-final. Claude verified N1 to N4 against the code before acting (12 Nov): all four are real.

I would **hold sign-off** at `bd8d0dd`. Four new findings, excluding R1–R4/S1–S4:

- **N1 — high: subscription access guard is unused.** `rg` finds `requireActiveAccess` only at its definition. An active membership with a suspended, expired, or absent subscription can still start/sync workouts and retrieve current nutrition. RLS checks identity and ownership, without subscription eligibility. **Fix:** enforce eligibility before replay on live routes and in shared services used by pages; preserve history access.

- **N2 — medium: push registration permits cross-tenant deletion.** `app.register_push` runs as SECURITY DEFINER and deletes matching endpoints belonging to other users **without a tenant predicate**. A tenant-A account knowing tenant B’s endpoint—such as from a previously shared browser—can register it with arbitrary nonempty keys and remove B’s subscription. **Fix:** restrict deletion to authorized ownership; require verified device handover for reassignment.

- **N3 — medium: database failures expose private parameters in logs.** The shared error handler logs entire exceptions. A failed client-note insert therefore logs its health text; Drizzle embeds parameters in both the error message and properties. An offline probe confirmed `rawErrorLogContainsPrivateParameter=true`. **Fix:** log allowlisted error codes and request identifiers, excluding messages, parameters, and causes.

- **N4 — medium: idempotency buffers unbounded bodies before validation.** Any authenticated caller can supply an `Idempotency-Key` and oversized streamed body; middleware reads everything before schema or upload limits execute. Without an upstream cap, concurrent requests can exhaust memory. **Fix:** enforce a streaming byte ceiling before cloning/parsing bodies.

Other checks: all 287 final policies across 47 tables reviewed; earlier policies are removed. Transaction callers derive identity from sessions; service callers use authenticated results, token digests, or cron authorization. No additional tenant-data disclosure demonstrated.

Authentication production guards, same-origin checks, invitation locking, and push-provider allowlisting yielded no additional findings. The tracked-text scan found no credential tokens. The recent concurrency-test change retains one-insert and settled-replay assertions.

Limitations: no database tests or live requests performed. Production-artifact verification failed on a `.next/dev` symlink; fresh isolated build evidence and deployed ingress limits remain needed.

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| N1 | high | Unmounted subscription guard | `apps/web/src/api/middleware/access.ts:41`; `apps/web/src/api/workout-sessions.ts:15` |
| N2 | medium | Cross-tenant push deletion | `packages/db/migrations/0006_guards_and_grants.sql:1722` |
| N3 | medium | Private SQL parameters logged | `apps/web/src/api/index.ts:142`; `apps/web/src/server/clients/service.ts:105` |
| N4 | medium | Unbounded request buffering | `apps/web/src/api/middleware/idempotency.ts:127`; `apps/web/src/api/media.ts:102` |
