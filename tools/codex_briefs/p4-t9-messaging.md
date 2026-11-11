# Batch P4-T9: messaging and notification center (build-plan Task 9)

Build 1:1 coach-client conversations (text, images, video, files, voice notes; transcription deferred), an in-app
notification center, notification deliveries (in-app, Web Push, email) with quiet hours and language from user
preferences, Web Push subscription storage, and the Resend sender. Read build plan Task 9, spec sections on messaging
and notifications, doc section 12.1, section 5.2 rows for `conversations`, `messages`, `notifications`,
`notification_deliveries`, `push_subscriptions`, `message_revisions`, section 9.2 (audit and event allow-lists: use only
listed names), and `packages/db/src/schema/messaging.ts`.

Nothing is ever sent from this PC. The Resend sender and Web Push are built behind interfaces and stay OFF without
keys: with no `RESEND_API_KEY` the email channel is a log-only fake that records a delivery row with status `sent` and
`provider_ref = 'local-log'`; with no VAPID keys Web Push marks deliveries `cancelled`. `resend`, `web-push` and
`@react-email/components` are already dependencies. Supabase Realtime is not available locally: the client polls
(every 15 s while visible, backing off when hidden) behind a small hook so Realtime can replace it later.

## Files you may write (and nothing else)

- API: `apps/web/src/api/conversations.ts`, `apps/web/src/api/notifications.ts` (stubs exist, mounted) and tests.
- Services: `apps/web/src/server/notify/*` (channels `inapp`, `webpush`, `email`; a `notify(tx, {...})` function other
  modules can call later; idempotency key per `(notification, channel)`) and `apps/web/src/server/messaging/*`
  (+ `*.test.ts`).
- Email: `apps/web/emails/*` (React Email templates, RTL for Arabic, plain layout; a pure `renderEmail` helper tested
  without sending).
- Components: `apps/web/components/messaging/*`, `apps/web/components/notifications/*`.
- Pages (each with `loading.tsx`): `apps/web/app/[locale]/coach/messages/page.tsx` (inbox) and
  `coach/messages/[conversationId]/page.tsx`, `apps/web/app/[locale]/app/messages/page.tsx` (client thread with their
  coach) and `app/notifications/page.tsx`, `coach/notifications/page.tsx`.
- Messages: `apps/web/messages/{ar,en}/messaging.json` (registered, currently `{}`; you own it).

Other builders work at the same time on disjoint files (T8 calendar and media, T10 dashboard, T11 settings). Media for
attachments uses the existing upload API in `apps/web/src/api/media.ts`; read it, do not edit it (T8 adds the
`message_attachment` purpose later; for now attach by media id of an existing client media row and say so).

## Routes (mutating routes use `idempotentReplay`; lists use keyset pagination)

`/conversations` (module `messages`): `GET /` inbox (coach: by last message, filters unread, clientId; client: own
thread only), `POST /` open (or return) the 1:1 conversation with a client, `GET /{id}/messages` newest first,
`POST /{id}/messages` `{ body?, mediaIds?, clientUuid }` (client UUID idempotency; at least a body or a media id;
creates the in-app notification for the other party and queues an email delivery row in the same transaction;
retry with the same `clientUuid` does not duplicate: the plan's acceptance), `PATCH /{id}/messages/{messageId}`
(edit own message within 15 minutes; keeps a `message_revisions` row), `DELETE /{id}/messages/{messageId}` (soft),
`POST /{id}/read` (read marker). `/notifications`: `GET /` own list with unread count, `POST /{id}/read`,
`POST /read-all`, `GET /preferences` and `PUT /preferences` (quiet hours, channels, language: stored in
`user_preferences`), `POST /push-subscriptions` `{ endpoint, keys }` and `DELETE /push-subscriptions/{id}`
(own only; https endpoints only). Errors 400, 401, 403, 404, 409, 422. A client reaches only their own conversation; a
staff member only conversations of clients in their scope (RLS decides; do not add your own scope code).

## Delivery rules

Sending a message creates exactly one in-app notification and one email delivery row for the recipient (acceptance).
Quiet hours defer the email and push rows (`queued` with a `send_after` in the payload) but never the in-app row.
Language of the notification text follows the recipient's preference, then the tenant default. A delivery processor
function `processDeliveries(...)` (called by the cron route that T8 owns later; export it, do not add a route) sends
queued rows through the channel, increments `attempts`, and never double-sends (status guard).

## Screens (360 px first, RTL-safe, targets at least 44 px)

Astryx for every new control (rule in the common brief). Thread: bubbles aligned to start/end by sender, timestamps,
attachment previews, composer pinned above the keyboard, "sending / sent / failed, retry" states for the outbox-style
optimistic send. Inbox: unread badge, last message preview. Notification center: grouped by day, mark all read.
Every route has loading and empty states.

## Tests (Claude runs them)

Pure: `renderEmail` in ar and en (RTL attribute present), quiet-hours window math, preference merge. DB-backed (pattern
of `apps/web/src/api/programs.test.ts`): sending a message creates one notification and one email delivery row;
the same `clientUuid` twice creates one message; client A cannot read client B's conversation; a client cannot open
conversations with another client; assigned-scope staff see only assigned clients' threads; edit after 15 minutes is
422; read markers; push subscription with a non-https endpoint is 422 and another user's subscription cannot be
deleted; processing deliveries without keys leaves email `sent` with the local-log ref and push `cancelled`, and a
second run changes nothing.

## Answer

Per the common rules. Also: the audit and event names used (from section 9.2), the delivery statuses by channel, and
every message key group added.
