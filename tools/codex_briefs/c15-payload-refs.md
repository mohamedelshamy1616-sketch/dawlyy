# Brief: C15 last violation, the form references in calendar_events.payload

## Goal

Test C15 (`packages/db/test/security.catalog.test.ts`) must pass. After the previous C15 job the only violation left
is `apps/web/src/server/forms/client-read.ts`, function `clientFormForEvent`: it selects
`calendarEvents.payload->>'formId'` and `->>'formVersionId'` (raw table column) in a client-facing path and strips the
two values before returning. Security model line 4061 forbids returning `calendar_events.payload` to clients; it does
not forbid the two form ids the client needs to open the form it was sent (the client receives that form anyway).

## Decision (follow it; see docs/plans/OPEN_DECISIONS.md item 17)

Put the two extracted ids in `packages/db/src/client-columns.ts`, in `clientColumns.calendarEvents`, as two derived
SQL entries with exactly these keys: `attachedFormId` and `pinnedVersionId`
(`sql<string | null>\`${schema.calendarEvents.payload}->>'formId'\`` and `->>'formVersionId'`). The `payload` key itself must stay
absent from the map. Then change `clientFormForEvent` to select `clientColumns.calendarEvents` and keep the rest of
the function unchanged (it already destructures those two names out of the returned event). Check every other place
that spreads `clientColumns.calendarEvents` (grep `calendarEvents` under `apps/web/src`) and make sure the two new keys
are removed from any response that returns the event to the client (they are internal ids, not for the response
body); if a response would now carry them, strip them in that function the same way `clientFormForEvent` does.

Strengthen the test, do not weaken it: in the C15 block add an assertion that the source of
`packages/db/src/client-columns.ts` mentions `payload` only inside those two derived entries (for example: every
occurrence of `.payload` in the file sits on a line that contains `'formId'` or `'formVersionId'`), and that
`Object.keys(clientColumns.calendarEvents)` contains `attachedFormId` and `pinnedVersionId` and does not contain
`payload`. Leave every existing assertion as it is.

## Files you may write

`packages/db/src/client-columns.ts`, `apps/web/src/server/forms/client-read.ts`, other `apps/web/src/server/**` and
`apps/web/src/api/**` non-test files only where the grep above shows an event response needs the strip, and the C15
block of `packages/db/test/security.catalog.test.ts`. Nothing else.

## Limits

You cannot run pnpm, node, vitest, tsc, psql, git or network; never run git, never commit, never add dependencies,
never print env values. Check by reading. Claude runs typecheck and the suites.

## Answer

Files written, every place that returns calendar events to a client and how the two ids are kept out of the body,
anything wrong in this brief. Under 30 lines.
