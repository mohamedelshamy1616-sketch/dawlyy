# Brief: fix pre-review round 2 findings S1, S3 and S4

Findings: `docs/qa/p7-codex-prereview.md`, section "Round 2". No migration; `packages/db/migrations` and
`packages/db/src/schema` are frozen. Never weaken a test; add tests. S2 (hosted upload constraints) is NOT in this
brief: it needs bucket settings and is recorded for the final review.

## S1 (medium): no Origin or Fetch Metadata guard on mutating API routes

Add a Hono middleware `requireSameOrigin` in `apps/web/src/api/middleware/origin.ts` and mount it first in
`apps/web/src/api/index.ts` for every `/api/v1` route. Rules, for methods other than GET, HEAD, OPTIONS:
1. If an `Origin` header is present, its origin must equal the request's own origin (take it from
   `new URL(c.req.url).origin`) or be listed in the comma-separated variable `DAWLYY_ALLOWED_ORIGINS` or equal to
   `NEXT_PUBLIC_APP_URL` when those are set. Otherwise answer 403 through the existing `forbidden()` error with the
   message `cross_origin`.
2. If there is no `Origin`, look at `Sec-Fetch-Site`: `same-origin` and `none` pass, `same-site` and `cross-site`
   are 403, a missing header passes (non-browser clients, the test harness).
3. Run before auth and before validation, so a refused request does no work. The cron routes under `/api/cron` and the
   storage transport route are outside `/api/v1`; do not touch them.
Tests in `apps/web/src/api/middleware/origin.test.ts` (Hono app with a stub route): same origin passes; foreign
Origin 403; foreign Origin on GET passes; no Origin with `Sec-Fetch-Site: cross-site` 403; same-site 403; none and
same-origin pass; no headers pass; an allowed origin from `DAWLYY_ALLOWED_ORIGINS` passes. Check that the existing API
test harness (`apps/web/src/test/api-harness.ts`, do not edit it) sends no Origin or Sec-Fetch-Site; if any existing
test does, say so in the answer. Also grep `fetch(` under `apps/web/components` and `apps/web/app` for requests that set
an explicit `Origin`; none should (same-origin browser fetches send the right one automatically).

## S3 (low): no throttle on the anonymous invitation preview

`POST /api/v1/invitations/preview` (`apps/web/src/api/invitations.client.ts`) opens a service transaction per guess.
Add a small in-memory fixed-window limiter `apps/web/src/api/middleware/rate-limit.ts` (factory
`rateLimit({ windowMs, max, key })`, a `Map` that prunes expired windows, key from the first address of
`x-forwarded-for`, else `x-real-ip`, else `'local'`) and mount it on the preview route only: 30 requests per minute per
key, then 429 with the existing error body shape, code `rate_limited`, header `Retry-After`. Test it with an injected
clock. State in the answer that an in-memory limiter is per instance and is a partial control on a serverless host.

## S4 (medium): push endpoints accept arbitrary HTTPS hosts (blind SSRF)

Files: `apps/web/src/server/notify/center.ts` (registration, around line 78) and
`apps/web/src/server/notify/channels.ts` (dispatch, around line 63). Add one shared function
`isAllowedPushEndpoint(url: string): boolean` (in a new `push-endpoints.ts` in the same folder): the URL must parse,
protocol `https:`, no credentials, port empty or 443, and the hostname must equal or end with one of:
`fcm.googleapis.com`, `push.services.mozilla.com`, `notify.windows.com`, `push.apple.com`, `web.push.apple.com`
(suffix matches need a leading dot, so `evilfcm.googleapis.com` fails). Registration of a refused endpoint answers 422
with code `invalid_endpoint` through the existing error helpers; dispatch of a stored refused endpoint skips it and
counts it as a failed subscription the way an expired one is handled today (read what the code does for a 404 or 410
response and mirror it, without any network call). Tests: allowed hosts pass; `evilfcm.googleapis.com`,
`fcm.googleapis.com.evil.test`, `http://`, `https://user@fcm.googleapis.com`, `https://fcm.googleapis.com:8443`, an IP
literal and a `localhost` URL are refused; a registration test and a dispatch test through the existing notify test
files or a new `push-endpoints.test.ts`.

## Files you may write

`apps/web/src/api/index.ts`, `apps/web/src/api/middleware/origin.ts`, `origin.test.ts`, `rate-limit.ts`,
`rate-limit.test.ts`, `apps/web/src/api/invitations.client.ts`, `apps/web/src/server/notify/center.ts`,
`apps/web/src/server/notify/channels.ts`, `apps/web/src/server/notify/push-endpoints.ts` and tests beside them.
Nothing else.

## Limits

No pnpm, node, vitest, tsc, psql, git or network; never run git, never commit, never add dependencies, never print
secrets. Check by reading; Claude runs typecheck and the suites. This brief replaces the common brief.

## Answer

Files written, what each fix does, residual risks, anything wrong in this brief. Under 40 lines.
