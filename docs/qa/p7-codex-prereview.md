# P7 pre-review by Codex (read-only), 12 Nov 2026, thread 2026-11-12-075106

Code review of the riskiest areas on HEAD 54831a6, run through the agent bridge at no Claude usage. Evidence to weigh, not an approval. The P7 reviewer re-verifies each row against the code and carries it into `docs/qa/FINAL_REVIEW.md`.

The main boundaries look sound, but I would resolve these before final sign-off. Probes used in-memory stores and stubbed senders; no live requests or database writes.

| ID | Severity | file:line | Finding | How to prove it |
|---|---|---|---|---|
| R1 | high | `apps/web/src/api/middleware/idempotency.ts:79` | Lookup, business mutation, and replay save are separate transactions. Concurrent retries can both commit financial changes; the unique replay key only deduplicates the later cache insert. | Send two simultaneous `POST /api/v1/payments/{id}/refund`, identical key and `{"amount":"10"}`, against a verified payment with sufficient balance. Both can increment the refund. Actual middleware probe produced **two handler executions, both 201**. Reserve/serialize the key before mutation and commit its result atomically. |
| R2 | medium | `apps/web/src/api/middleware/idempotency.ts:85`; `apps/web/src/api/forms.ts:16` | Replay skips handler-level permissions and target-row visibility. A still-active staff member can retrieve cached responses after losing module grants or client assignments. | Create a form with key K; remove that staff member’s forms permissions; repeat identical `POST /api/v1/forms` with K. Cached 201 bypasses the permission check. Reauthorize before replay. |
| R3 | medium | `apps/web/src/server/notify/process.ts:58` | Missing active membership does not stop Web Push dispatch. Service reads still load that user’s subscriptions and send queued notifications after deactivation. | Queue a push, then `POST /api/v1/team/{membershipId}/deactivate`; invoke authorized cron. Stubbed processor probe returned **activeMemberships=0, pushSends=1**. Cancel delivery without a currently authorized recipient. |
| R4 | low | `apps/web/next.config.ts:9` | Production exclusion is incomplete at deployment-trace level, although the executable route is absent. Existing production traces include the dev module and route source. | Inspect `apps/web/.next/server/app/api/[[...route]]/route.js.nft.json:1`: dependencies include `src/server/dev-login.ts` and `app/api/dev-login/route.dev.ts`. Verify packaging exclusions separately. |

Checked and found sound:

- Dev login: production guards in both route and session resolver; exact opt-in; HMAC-SHA256, fixed-length `timingSafeEqual`, expiry checks. Role, tenant and permissions come from active DB membership through `withUserTx`; application queries use `withAuthTx`.
- All ten router pairs: client middleware is method-specific; unmatched requests reach staff authentication and role denial before staff validation/replay/query. Invitation preview intentionally permits bearer-token access; acceptance and bootstrap require verified session identity.
- Replay lookup, uniqueness and RLS scope by **tenant + user + key**. No demonstrated cross-user replay.
- Outside `/api/v1`: dev route fails closed in production; cron requires a constant-time secret check and UUID tenant. Local storage transport additionally checks signed capabilities and RLS visibility.

Every `withServiceTx` caller checked (`S = apps/web/src/server/`):

- `S/dev-login.ts:59,81`: gated demo discovery/unattached lookup.
- `S/bootstrap.ts:67`: session identity, serialized membership creation.
- `S/invitations/client-read.ts:42,51,106`: token-digest discovery/preview; locked acceptance using DB tenant.
- `S/workout/write.ts:184`: authenticated client summaries; tenant/client predicates.
- `S/subscriptions/calendar.ts:13`: follows successful RLS-authorized writes.
- `S/subscriptions/sweep.ts:11`; `S/calendar/processor.ts:38,44`: secret-authorized cron tenant.
- `S/messaging/service.ts:222`: recipients derived after authenticated message persistence.
- `S/notify/process.ts:33,54,93,124`: delivery-derived IDs; R3 applies.
- `packages/db/src/client.ts:124`: erasure wrapper.
- `apps/web/src/test/api-harness.ts:52`: test fixtures only.

No unchecked request identity reaching a service transaction was demonstrated.

## Round 2 (thread 2026-11-12-085118, HEAD b306b28): web layer, uploads, payments, invitations

Reviewed clean HEAD `b306b28`. Findings below are code-backed; probes used only in-memory framework/SDK calls, without network or database writes.

| ID | severity | file:line | finding | how to prove it (a request or SQL) |
|---|---|---|---|---|
| S1 | medium | `apps/web/src/api/index.ts:56`; `apps/web/src/api/payments.ts:53` | **Conditional CSRF:** no Origin/Fetch Metadata guard. SameSite=Lax blocks ordinary cross-site POSTs, but permits cookies from a hostile same-site sibling origin. Optional-body refunds accept an empty POST; absent amount means full remaining refund (`payments/service.ts:114`). | From `https://evil.example.test`, use `fetch('https://app.example.test/api/v1/payments/KNOWN_ID/refund',{method:'POST',mode:'no-cors',credentials:'include'})`. Framework probe with this Origin and no body reached the handler, returning 200. Add an Origin check. |
| S2 | medium | `apps/web/src/server/storage/index.ts:154` | Hosted upload signatures bind neither declared size nor MIME. Validation covers supplied metadata; shared bucket limits cannot enforce purpose-specific types or each declared size. | Request a `progress_photo` upload declaring JPEG, size 1; PUT a larger PDF to the signed URL where the bucket permits PDFs. SDK probe confirmed signing sends `{}`, without type/size constraints. Validate uploaded objects before making them available. |
| S3 | low | `apps/web/src/api/invitations.client.ts:55`; `apps/web/src/server/invitations/client-read.ts:51` | Anonymous invitation preview has no application throttle; every correctly shaped guess opens a privileged database transaction. Token entropy prevents practical guessing, but not request-driven database load. | Repeat `POST /api/v1/invitations/preview` with distinct 43-character tokens. Each reaches the lookup; no application 429 path exists. Add throttling. |
| S4 | medium | `apps/web/src/server/notify/center.ts:78`; `apps/web/src/server/notify/channels.ts:63` | Additional injection surface: push registration accepts arbitrary HTTPS hosts, then dispatch uses them directly—a blind SSRF primitive when VAPID is configured. | Register an endpoint such as `https://internal.example.test:8443/admin` with valid subscription keys; subsequent delivery targets it. Offline request generation confirmed POST to the supplied endpoint. Allowlist push providers. |

Checked and found sound:

- Payments/subscriptions deny client mutations; strict inputs exclude status/receipt overrides; sale prices come from stored packages.
- Receipt allocation uses an atomic counter update; verification and lifecycle operations lock rows.
- Invitations use 256-bit randomness, SHA-256 storage, expiry/status checks, locked acceptance, database-derived role/tenant, and membership serialization.
- Media uses generated paths, traversal checks, RLS visibility, and authenticated local capabilities. Local downloads set `nosniff`.
- Messages, answers and exercise cues render as text; exercise URLs enforce HTTPS/hosts; login redirects use fixed destinations. CSV output is a static template.
- Installed JSON validation rejects form content types. Hosted authentication throttling and live bucket settings require deployment evidence.
