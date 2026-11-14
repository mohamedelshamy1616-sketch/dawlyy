# Task R3a: archive, restore, bulk actions and one shared undo control

## Goal and contract

Implement `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R3, item R3a:

> Every coach-owned list gets Archive in its row menu. A toast offers undo (the restore call) for 6 seconds. An
> Archived filter offers Restore.
> Bulk select on Clients and Library supports archive, restore, and assigning one program to many clients.
> Cancelling a calendar event works the same way.

Read the plan's Hard limits, `apps/web/AGENTS.md` (including **Astryx in DAWLYY**), the R0c and R1b briefs,
`docs/architecture/02-database-security-model.md` section 12.1, and the existing components named below.
R0a/R0b/R0c/R1b/R1c must be integrated first. This is UI and transport work; do not rebuild archive, restore,
calendar, module, permission, audit or assignment endpoints. R2b consumes this task's shared hook.

All five Hard limits bind this task: no paid API or hosted LLM calls; no meal-photo calorie feature; no payment
void/correct; keep Astryx with one token source and no decorative restyling; preserve history, RLS, guards,
`clientColumns` and audit evidence. Never weaken a test or policy. No migrations, database writes from the builder,
credentials, dependency additions, account actions, commits or pushes.

The current library has **six archive entities**: clients, programs, nutrition plans, forms, packages and
tenant-owned exercises. Foods have existing Hide/Unhide, including custom foods; retain that wording and endpoint,
but give the action the same undo control. System exercises keep their existing per-tenant Hide/Unhide. Do not
invent food archive columns or archive a system exercise. This is the concrete interpretation of “every list”
against R0c's available interfaces.

## Files the builder may write

Create exactly:

- `apps/web/src/hooks/use-undoable-action.ts`
- `apps/web/src/lib/control/undo-store.ts`
- `apps/web/src/lib/control/archive-transport.ts`
- `apps/web/src/lib/control/bulk-actions.ts`
- `apps/web/components/control/undo-toast.tsx`
- `apps/web/components/control/archive-controls.tsx`
- `apps/web/components/control/bulk-actions.tsx`
- `apps/web/src/lib/control/undo-store.test.ts`
- `apps/web/src/lib/control/archive-transport.test.ts`
- `apps/web/src/lib/control/bulk-actions.test.ts`
- `apps/web/src/lib/control/control-components.test.ts`
- `apps/web/messages/ar/archiveControls.json`
- `apps/web/messages/en/archiveControls.json`
- `apps/web/messages/ar/controlUndo.json`
- `apps/web/messages/en/controlUndo.json`
- `apps/web/e2e/beta/r3a-archive-undo.spec.ts`
- `tools/codex_briefs/integration/r3a.md`

Modify exactly:

- `apps/web/components/clients/client-list.tsx`
- `apps/web/components/program-builder/program-list.tsx`
- `apps/web/components/nutrition/plans.tsx`
- `apps/web/components/nutrition/foods.tsx`
- `apps/web/components/form-builder/template-list.tsx`
- `apps/web/components/packages/package-list.tsx`
- `apps/web/components/packages/package-actions.tsx`
- `apps/web/components/exercises/library.tsx`
- `apps/web/components/calendar/calendar-screen.tsx`
- `apps/web/app/[locale]/coach/clients/page.tsx`
- `apps/web/app/[locale]/coach/packages/page.tsx`
- `apps/web/app/[locale]/coach/nutrition/page.tsx`
- `apps/web/app/[locale]/coach/exercises/page.tsx`

Nothing else. In particular, API files, existing message catalogs, `i18n/request.ts`, shell/navigation files,
client hub files, token files, core barrels and package files are read-only. Put exact integration patches in
`integration/r3a.md`; Claude applies them after reviewing the worktree. Do not apply those patches yourself.

## Interfaces consumed

R0c's existing authenticated routes below use the normal `{ error: { code, message, details? } }` envelope.
Send no JSON body for archive/restore/hide calls; generate an `Idempotency-Key` per intended mutation and preserve
it for a retry of that same request. A rollback is a distinct mutation with a distinct key.

| Entity | Archive / restore paths | Read filter |
|---|---|---|
| Client | `POST /api/v1/clients/{id}/archive`, `/unarchive` | `GET /api/v1/clients?archived=true` |
| Program | `POST /api/v1/programs/{id}/archive`, `/unarchive` | `GET /api/v1/programs?archived=true&kind=template` (retain the selected kind) |
| Nutrition plan | `POST /api/v1/nutrition/{id}/archive`, `/unarchive` | `GET /api/v1/nutrition?archived=true&kind=template` (retain the selected kind) |
| Form | `POST /api/v1/forms/{id}/archive`, `/unarchive` | `GET /api/v1/forms?archived=true&formKind={kind}&kind=template` |
| Package | `POST /api/v1/packages/{id}/archive`, `/unarchive` | `GET /api/v1/packages?archived=true` |
| Tenant exercise | `POST /api/v1/exercises/{id}/archive`, `/unarchive` | `GET /api/v1/exercises?archived=true` |

Both mutation calls return the updated row, status 200, and are idempotent. Default/`archived=false` reads exclude
archived rows; `archived=true` means archived **only**, not active plus archived. Lists retain their existing
`{items, nextCursor}` keyset shape, search, kind, client, status and other filters. The packages UI currently uses
`archived=1` and treats it as “include”; convert it to the R0c boolean-string contract and archived-only wording.
Clients currently expose archived through a status selector; make the Archived control set `archived=true` and
clear incompatible `status`, resetting the cursor. Do not alter the API schema to match an old UI convention.

Archive and restore require staff `<entity module> edit`, with modules `clients`, `programs`, `nutrition`,
`forms`, `packages`, `exercises`. Permission checks and scoping stay server-side. A system exercise returns
422 `system_exercise_use_hide`; render the existing Hide action instead. Its existing paths are
`POST /api/v1/exercises/{id}/hide` and `/unhide`. Foods use `POST /api/v1/foods/{id}/hide` and `/unhide`, 200,
no body, and `GET /api/v1/foods?includeHidden=true`; preserve its existing Hidden filter semantics.

Calendar consumes `POST /api/v1/calendar/{id}/cancel` and `/restore`, no body, 200 with the updated event.
`restore` returns a cancellation to `scheduled` and clears cancellation stamps; it is not the reschedule endpoint.
`GET /api/v1/calendar?...&state=cancelled` lists cancellations. Do not PATCH cancelled stamps or delete events.
The current router/service already implement `restore`; permission is `calendar edit`. Other illegal transitions
remain 422 `illegal_transition`. R0c/0008 own archive/restore audit records; do not add duplicate audit calls.

Program assignment consumes `POST /api/v1/programs/{programId}/assign` with
`{clientId: string, subscriptionId?: string, startDate?: IsoDate, publish?: boolean, replace?: boolean}`,
201 returning the existing assignment result including `{head: {id}}`. The schema defaults `publish` and
`replace` to false. Search eligible clients with
`GET /api/v1/programs/{programId}/assignment-clients?q=&limit=20&cursor=`, returning `{items, nextCursor}`.
Use published, active templates from the existing program list; do not assign archived templates. Reuse the
existing `client_has_program` conflict response to request explicit replacement consent for that client.
Match the existing AssignProgram permission checks; do not infer permission from `clients edit` alone.

R1b produces `GET /api/v1/inbox?limit=50` (maximum 200), staff-only, returning
`{items: [{client: {id, displayName, code, avatarMediaId?}, score, reasons, primaryAction}], today}` for the
caller's scope. This task does not write or re-rank the Inbox. A refresh after archiving must allow its next
server read to remove that client. R1b's Library links already use `?archived=true`; honor those links.

Read-only core interfaces are
`isAllowed(m: MembershipLike, module: Module, action: Action, opts?: {clientId?: string; assignedClientIds?: readonly string[]}): boolean`
from `@dawlyy/core/authz`, and `localize(text: LocalizedText | undefined | null, locale: Locale): string` from
`@dawlyy/core/types`. Reuse them for grants/localized entity names; no new core function or export is needed.
R0b's `src/lib/numbers.ts` exports `formatNumber(value, {locale, numerals?, maximumFractionDigits?})`,
`formatKcal(value, {locale, numerals?})`, `formatMacro(value, {locale, numerals?})` and
`numeralPolicy(preferences: unknown): 'latn' | 'arab'`. Pass the user's policy to every count; Arabic defaults
to Western numerals. Do not introduce a second formatter.

## Shared undo interface produced for R2b and every list

Export these names from `apps/web/src/hooks/use-undoable-action.ts` (types may be defined in `undo-store.ts`
and re-exported here). Keep this public contract exact:

```ts
export type UndoState = {
  id: string;
  label: string;
  phase: 'executing' | 'undoable' | 'undoing' | 'committing' | 'failed';
  remainingMs: number;
  error: unknown | null;
};
export type UndoableAction<T> = {
  label: string;
  onCommitted?: (value: T) => void;
  onUndone?: () => void;
  onError?: (error: unknown) => void;
} & (
  | { mode: 'immediate'; commit: () => Promise<T>; rollback: (value: T) => Promise<void> }
  | { mode: 'deferred'; commit: () => Promise<T>; rollback?: never }
);
export type UndoResult<T> =
  | { status: 'committed'; value: T }
  | { status: 'undone' }
  | { status: 'failed'; error: unknown };
export function useUndoableAction(): {
  run<T>(action: UndoableAction<T>): Promise<UndoResult<T>>;
  undo(): Promise<void>;
  flush(): Promise<void>;
  state: UndoState | null;
};
```

Use one app-wide external store and `useSyncExternalStore`, with a stable server snapshot of null. There is
exactly one `UndoToast`, mounted once by Claude's locale-layout patch. A list must never mount another toast,
implement another timer, or call Sonner directly for an undoable action. Every list calls this hook via the
shared controls. The store contains no user data beyond the active action and clears it when settled.

- **Immediate mode**, for archive/cancel/hide: await `commit` first. Only after success invoke `onCommitted`,
  show Undo and start a 6000 ms window. Undo calls `rollback` with that exact successful value; success invokes
  `onUndone`. An initial failure offers no Undo. Refresh the list on committed and undone outcomes.
- **Deferred mode**, for R2b's history-preserving correction/void: the caller updates its optimistic view and
  calls `run`. Show Undo immediately; invoke `commit` exactly once when 6000 ms expires or `flush` is requested.
  Undo cancels the pending action, calls `onUndone`, resolves `{status:'undone'}` and makes **zero requests**.
  R0c has no unvoid; never promise restoration of a voided row. Do not add an unvoid API or mutate an old row.
- `run` first awaits `flush` of any previous action, then owns the single slot. Immediate `flush` merely closes
  its window; deferred `flush` commits it. Never silently cancel an earlier intended mutation when another starts.
- Disable repeated clicks during `executing`, `committing` or `undoing`. A timer, Undo click and flush racing
  must choose exactly one transition. A repeated Undo is harmless. Settle each `run` promise once.
- A rollback failure keeps a visible failed state with a Retry Undo action, preserving the successful commit
  result and rollback idempotency key; it does not display “restored.” Keep the failed action until retried or
  explicitly dismissed; prevent replacement while retry is executing. Dismissing retains the committed server
  state. Refresh after any failure and invoke `onError`. Do not falsely restore an optimistic row.
- SPA component unmount must not discard the app-wide pending action. Keep callback usage safe after unmount.
  Full-document `pagehide` cancels an uncommitted deferred action, clears its optimistic state by the next load,
  and makes no last-second network call. Immediate mutations remain on the server. Do not persist closures,
  create a background queue, or rely on a window timer surviving reload.
- `UndoToast` renders a localized live status, a 44 px Undo/Retry button, and an accessible close action where
  dismissal is safe. Do not announce a countdown every animation frame. The 6000 ms duration is behavior, not a
  new visual spacing or color value.

Export `ArchiveRowControl({entity, id, archived, canEdit, itemLabel, onChanged?})` from
`components/control/archive-controls.tsx`, with `entity` restricted to the six archive entity names above,
`id/itemLabel` strings and `onChanged?: () => void`. It owns the hook and mutation transport; use it from all six
lists and the integration-only hub/builder patches. `onChanged` runs after commit/undo; refresh the route when
omitted. A Restore action uses immediate mode with the inverse archive rollback. Export `UndoToast()` from
`components/control/undo-toast.tsx`. R2b imports the hook; it never edits any of these files.

## List and bulk behavior

Add a row menu with Archive/Restore to all six lists; use token-backed Astryx rows/menus and keep existing
duplicate, assign, default and version-history actions. Grant booleans passed from Server Components must match
each existing module's edit permission. In particular, the exercise page currently passes only `owner` and
`canCreate`, and nutrition only `create`: pass the edit grant explicitly. No permission checks live only in UI.
All filter changes reset pagination and selection. Revalidate active/archived listings after each outcome;
do not append a restored row to an archived-only list. Empty archived listings explain that nothing is archived.

Bulk selection is explicit, limited to currently loaded eligible rows, with a selected count and Clear. A header
checkbox selects only those visible rows; never claim “all clients” when more pages exist. Archive/Restore use
existing per-id endpoints, sequentially or with a small bounded transport queue. There is no new bulk API.
Store original states, successful changed IDs, per-row keys and failures. The shared hook's commit result is
that receipt; Undo reverses **only the successful changed subset**, never rows that failed or were already in
the destination state. Show success/failure counts and failed item names; retry only failures, keeping their
idempotency keys. A partial result must not read as all-success. Do not continue into another tenant or bypass
a 403 by calling a different endpoint.

Clients has Assign program for selected clients. Library entity lists have bulk Archive/Restore; the Programs
list also offers selection of **one** published template followed by multiple eligible clients. Run the existing
assign endpoint once per client, preserve `replace:false` until explicit consent, and show copied-program links
for successes. This operation has no undoable deletion of assigned copies: it is a confirmed assignment with
per-client results, not a fake restore call. Never publish unless the coach selected publish and has its grant.
Keep the client hub's separate three-tap assignment flow unchanged.

Calendar cancellation uses immediate undo and `/restore`; the Cancelled filter has Restore. Reuse the shared
hook for food/exercise hide/unhide, preserving their existing list semantics and distinct wording.

## Integration patch artifact

`tools/codex_briefs/integration/r3a.md` must contain exact unified diffs, with real context from the merged base,
for these operations only. Include every import and prop; no prose such as “mount this somewhere.”

1. `apps/web/i18n/request.ts`: in **both** locale loader objects, immediately after the `legal` loader, add
   `archiveControls: () => import('../messages/ar/archiveControls.json'),` and
   `controlUndo: () => import('../messages/ar/controlUndo.json'),` for ar; the exact en lines use `../messages/en/`.
2. `apps/web/app/[locale]/layout.tsx`: after the existing `Toaster` import add
   `import { UndoToast } from "@/components/control/undo-toast";`. Immediately after `<Toaster />`, inside
   `AstryxProvider` and `NextIntlClientProvider`, add `<UndoToast />`. There must be exactly one mount.
3. `apps/web/components/clients/client-detail.tsx`: add the ArchiveRowControl import; remove the now-unused
   `useMutation`/`useRouter` imports, `router`/`mutation` declarations and `archive` function. Replace the current
   archive Button and its mutation-error block with
   `<ArchiveRowControl entity="clients" id={client.id} archived={client.status === 'archived'} canEdit={access.edit}
   itemLabel={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} />`.
   Leave reviewCard/activityLog slots and all tabs intact.
4. `apps/web/components/nutrition/builder.tsx`: add the ArchiveRowControl import. Replace only its inline
   archive/unarchive PATCH Button with
   `<ArchiveRowControl entity="nutrition" id={id} archived={Boolean(saved.head.archivedAt)} canEdit={grants.edit}
   itemLabel={foodText(saved.head.name, locale)} />`. `NutritionDetail.head.name` and the existing `foodText`
   import are the current contracts; include their actual surrounding source context in the patch.
   Preserve the neighboring Save metadata button and all version controls.

The artifact also records any real shared-token gaps for R5, with the affected component and intended semantic
token. It does not modify tokens, a message file owned by another task, or core exports. Claude applies the
mount/namespace/hub patches serially after merging this task, before R2b builds.

## UI rules

Carry all **Astryx in DAWLYY** rules: per-component imports, client children for Astryx, reuse existing frames,
`Heading`/`Text` and layout components, no new shadcn components, no Tailwind bridge import, no raw layout
`div`/`span`, inline styles or arbitrary visual values. Product copy comes from the two new namespaces, with
identical ar/en keys; Arabic is plain Egyptian Arabic. Reuse existing status translations for status words.
Every visual value comes from the existing canonical token/theme source (`app/globals.css` and its existing
`theme/dawlyy.theme.ts` Astryx bridge); R5 owns consolidation. Use existing tokens now and document missing tokens.
Preserve RTL with logical layout properties. Targets are at least 44 px. No horizontal overflow at 360, 390 or
430 px, including long names, menu labels, bulk failure lists and the toast. Counts use R0b's shared numeral
formatter with the saved preference. Supply loading, settled-empty, error/retry and partial-failure states;
a skeleton is never a settled state. Runtime proof in ar/en at phone/desktop sizes belongs to P9.

## Tests and acceptance the builder runs

Work in your own git worktree with `node_modules` already installed. These permissions override the old command
ban and old test/component exclusions in `_common_web.md`; they do **not** authorize other commands. Run only,
sequentially from the worktree root:

```text
pnpm --filter @dawlyy/web typecheck
pnpm --filter @dawlyy/web exec vitest run src/lib/control/undo-store.test.ts src/lib/control/archive-transport.test.ts src/lib/control/bulk-actions.test.ts src/lib/control/control-components.test.ts
```

Expected: typecheck exits 0; the single Vitest process discovers exactly these four new files, every test passes,
and no database or network is used. Never run lint, Astryx CLI/doctor, any full test command, database suite,
`next dev`, `next build`, `next start`, `pnpm dev`, Playwright or screenshots. Claude owns integration checks and
P9 runtime proof; do not claim you ran those. Do not change package/config files or existing tests to get green.

Write the following meaningful tests with fake timers and fake transport:

- `undo-store.test.ts`: immediate success starts its timer after commit; Undo restores once; initial failure has
  no Undo; 5999/6000 ms boundary; expiry and Undo race; repeated click; replacing an action flushes the first;
  deferred Undo makes zero calls; deferred expiry/flush calls commit once; failed commit refresh callback;
  rollback retry uses the original successful result; failed rollback remains visible; subscriber unmount does
  not lose an action; pagehide cancels deferred work without network; stable null server snapshot.
- `archive-transport.test.ts`: the six exact endpoint pairs and archived-only URLs; no JSON body on archive;
  system exercise routes use hide/unhide; food keeps hide/unhide; calendar cancel/restore pair; 403/404/422
  surfaces without false success; mutation retry preserves its key and rollback uses a different key.
- `bulk-actions.test.ts`: loaded-only selection, empty selection, mixed permissions, reset on filters,
  partial success, undo only successfully changed rows, retry only failed rows, no duplicate commits,
  one-template/many-client assignment, `client_has_program` consent and no accidental publish.
- `control-components.test.ts`: use `React.createElement` and `react-dom/server` `renderToStaticMarkup` with
  locale/navigation context mocks. The existing config discovers only `src/**/*.test.ts`, environment `node`;
  no jsdom, Testing Library, new dependency or config edit. Render both locales, active/archive menu states,
  no-edit permission, empty/failed toast, bulk counts and long labels. Assert correct accessible labels,
  Undo/Restore state and token-backed 44 px control classes. Timer/interaction logic is exercised through the
  actual store, not by inspecting implementation source. Rendering alone does not prove browser overflow.

Write `apps/web/e2e/beta/r3a-archive-undo.spec.ts` for P9's exact owned flow: **coach: archive, then undo, then
archived filter, then restore**. Use the existing demo auth/fixtures and each locale project's configuration;
give each locale's case its matching `@ar` or `@en` title tag (the existing `playwright.e2e.config.ts` discovers
`e2e/beta` and filters by those tags). Archive a disposable seeded client, assert removal, Undo inside the window, archive again, open archived-only,
Restore, then assert it is back in active and absent from archived. Add scoped library/calendar cases and bulk
partial-result behavior in this same owned spec. Assert that history survives, one toast is present, no settled
skeleton remains, and 360/390/430 px have no horizontal overflow. Write it now; **run it only in P9**. P9's
separate client-hub assignment flow belongs to R5's proof coverage, not a second R3a spec.

## The answer wanted

Files written; the exact hook and component exports; endpoint mappings and retry/undo semantics; the six-list
archive and food/system-hide coverage; which integration patches Claude must apply; commands actually run with
results; any mismatch in the contract or current API (especially archived filters); decisions taken and anything
wrong or impossible in this brief. Do not report browser, database or e2e proof that you did not run.

## Errata (Claude, 14 Nov, checked against main after R0c; these override the text above)

- Archive and restore of every form kind are gated by `forms edit` (`server/archive.ts`), not by the kind's own module; derive the UI grant from `forms edit`.
- Restoring a client always lands on status `inactive` (`server/clients/service.ts` `setClientArchived`), not the prior status. Undo of a client archive therefore returns an inactive client; say so in the toast copy, do not try to restore the old status.
