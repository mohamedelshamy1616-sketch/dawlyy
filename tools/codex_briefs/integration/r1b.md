# R1b merge integration

## Register the inbox namespace (required before rendering /coach)

File: `apps/web/i18n/request.ts` (left untouched under the turbo ownership rule).

In `loaders.ar`, directly after the anchor line:
```ts
    dashboard: () => import('../messages/ar/dashboard.json'),
```
add:
```ts
    inbox: () => import('../messages/ar/inbox.json'),
```

In `loaders.en`, directly after the anchor line:
```ts
    dashboard: () => import('../messages/en/dashboard.json'),
```
add:
```ts
    inbox: () => import('../messages/en/inbox.json'),
```

Keys remain exclusively in the new `inbox.json` namespace files as requested.

## Verification owed by integrator

Run the DB-backed `src/api/inbox.test.ts`, C15/security catalog scan, and normal merge checks.
The new non-DB tests are `src/server/inbox/logic.test.ts` and `src/components/shell/nav-reachability.test.ts`.
Browser RTL/360 px and desktop keyboard verification remain for Claude: this builder may not run a browser, dev server or build.

## Existing-route limits

There is no generic /coach/forms page: the Forms hub card opens /coach/checkins?tab=templates. Its archive link adds &archived=true to open the correct template tab. Assessments and Intake remain in the profile menu.
Archive links point to the existing lists with archived=true. Confirmed out-of-scope integration gaps:
- apps/web/app/[locale]/coach/exercises/page.tsx calls listExercises(tx, auth) without forwarding searchParams.
- apps/web/app/[locale]/coach/foods/page.tsx calls listFoods with only limit.
- apps/web/app/[locale]/coach/nutrition/page.tsx calls listNutrition with only kind and limit.
- apps/web/app/[locale]/coach/packages/page.tsx forwards archived=true to the service, but sets the component's archived boolean only for archived=1. The service understands true; the UI's restore mode needs the same interpretation.
Programs and check-in template pages already forward archived=true. These existing pages/components are outside R1b ownership and were left untouched.
No avatar column exists on clients. Inbox omits the optional avatarMediaId.
No workout calendar event type exists. Planned counts use the latest published client program's actual training-day schedule, starting at document.startDate, else client.started_on, subscription.starts_on or publication date.
A new actionHref field resolves the exact review/payment/conversation. A null href asks the UI to open/create a conversation through POST /api/v1/conversations; that action never sends a message.

## Navigation map (all current coach routes)

Phone bar and desktop rail: /coach (Inbox), /coach/clients, /coach/library, /coach/money. Wordmark remains in the desktop rail; profile and desktop search stay in the header.

| Route | Reachable from |
| --- | --- |
| /coach | Inbox bar/rail item |
| /coach/clients | Clients bar/rail item |
| /coach/clients/new | Profile: New client; existing client list |
| /coach/library | Library bar/rail item |
| /coach/programs | Library: Programs |
| /coach/programs/new | Library: New program |
| /coach/exercises | Library: Exercises |
| /coach/exercises/new | Library: New exercise |
| /coach/exercises/import | Library: Import exercises |
| /coach/foods | Library: Foods |
| /coach/foods/new | Library: New food |
| /coach/nutrition | Library: Nutrition |
| /coach/nutrition/new | Library: New nutrition plan |
| /coach/packages | Library: Packages |
| /coach/packages/new | Library: New package |
| /coach/checkins | Profile: Check-ins; Library: Forms (templates tab) |
| /coach/assessments | Profile: Assessments |
| /coach/intake | Profile: Intake |
| /coach/calendar | Profile: Calendar |
| /coach/tasks | Profile: Tasks |
| /coach/notifications | Profile: Notifications |
| /coach/messages | Profile: Messages |
| /coach/money | Money bar/rail item |
| /coach/billing | Money: Payments |
| /coach/billing/sell | Money: Sell a package |
| /coach/settings | Profile: Settings |
| /coach/settings/team | Profile: Team |
| /coach/settings/business | Profile: Business settings |
| /coach/settings/branding | Profile: Branding |
| /coach/settings/language | Profile: Language and numbers |
| /coach/settings/legal | Profile: Legal documents |

All six Library cards include an Archived link. Renewals opens /coach?queue=expiring_subscriptions, and the Money page also previews that queue with pagination. The profile includes the locale switch and sign out. The palette searches clients by name/code and all the links above.

Dynamic routes are reached through their unchanged owning lists/detail screens:
- /coach/clients/[clientId], plus /subscription, /timeline, /tracking and /overrides: Clients list and existing client detail links; Inbox also links directly to client detail and subscription.
- /coach/programs/[programId], plus /assign and /history: Library Programs list and existing editor links.
- /coach/nutrition/[planId], plus /assign and /history: Library Nutrition list and existing editor links.
- /coach/exercises/[exerciseId], /coach/foods/[foodId], /coach/packages/[packageId]: the respective Library list.
- /coach/checkins/[formId], /coach/intake/[formId], /coach/assessments/[formId]: their existing template lists.
- /coach/checkins/review/[submissionId], /coach/assessments/review/[submissionId]: the existing review lists; Inbox also links directly to check-in reviews.
- /coach/messages/[conversationId]: Messages list and Inbox reply/nudge.
- /coach/billing/payments/[paymentId]: Payments list and Inbox confirmation action.
- /coach/settings/team/[membershipId]: Team list.
- /coach/[...rest]: existing branded catch-all, deliberately excluded from reachability enumeration.

## Inbox query plan

Five queries independent of client count, all in withAuthTx and explicitly tenant-filtered:
1. tenants: tenant timezone and today as an ISO date string.
2. clients: RLS-accessible, status active, archived_at IS NULL; only display identity and stored goal.
3. Grouped CTEs over form_submissions, calendar_events, workout_sessions, meal_logs, metric_entries, nutrition_plans/versions, payments, subscriptions, conversations and messages. Reuses dashboard queueParts waiting_review/pending_payments SQL. All source timestamps are converted to tenant-local date strings inside SQL before ranking; stored activity local_date values define the rolling windows. Done sessions use state='completed' (the same definition as the dashboard); voided_at IS NULL on sessions, meal logs and weights. Weight pounds are converted to kg.
4. programs/program_versions with clients/subscriptions for the latest published assigned schedule. Pure logic counts actual training days in the rolling 7/14-day windows.
5. red_flags: one GROUP BY client_id read counting open flags and collecting their categories (no private matched text or sources returned).

rankAttention receives one input per visible active client. The response is sliced only after ranking; default 50, maximum 200. Money renewals reuse dashboardQueue's existing expiring_subscriptions query.

## Builder verification results

The first standard Vitest invocation was blocked before tests loaded: Vite's config bundler failed with spawn EPERM. A single attempt with --configLoader runner failed during dependency loading (picomatch: require is not defined). No Vitest passing claim is made; both new non-DB files need the integrator's run. The builder did not run inbox.test.ts, DB suites, a dev server, build or browser.

Final permitted check: pnpm --filter @dawlyy/web exec tsc --noEmit -p tsconfig.json exited 0 after the final code changes.

## API and shared exports

GET /api/v1/inbox: requireAuthMiddleware, requireStaffRole, then clients/view in the service before its first read. Errors: 400 invalid limit, 401 signed out, 403 client or missing grant. Responses are private/no-store. GET /api/v1/me and GET /api/v1/me/app were untouched.

Shared names: listInbox/readInboxInputs (server/inbox/service), plannedWorkouts/attentionGoal/actionHref (server/inbox/logic), InboxData/InboxItem (components/inbox/types), COACH_NAV/COACH_PROFILE_NAV/isActive (shell/nav-items), and LIBRARY_LINKS/LIBRARY_TOOL_LINKS/MONEY_LINKS (shell/hub-links, re-exported by components/inbox/hubs).

## Files written (31)

```text
apps/web/src/server/inbox/logic.ts
apps/web/src/server/inbox/logic.test.ts
apps/web/src/server/inbox/service.ts
apps/web/src/api/inbox.ts
apps/web/src/api/inbox.test.ts
apps/web/src/api/index.ts (inbox import and mount only)
apps/web/src/components/shell/nav-items.ts
apps/web/src/components/shell/nav-links.tsx
apps/web/src/components/shell/coach-shell.tsx
apps/web/src/components/shell/coach-bottom-bar.tsx
apps/web/src/components/shell/profile-menu.tsx
apps/web/src/components/shell/command-palette.tsx
apps/web/src/components/shell/hub-links.ts
apps/web/src/components/shell/nav-reachability.test.ts
apps/web/app/[locale]/coach/page.tsx
apps/web/app/[locale]/coach/library/page.tsx
apps/web/app/[locale]/coach/library/loading.tsx
apps/web/app/[locale]/coach/money/page.tsx
apps/web/app/[locale]/coach/money/loading.tsx
apps/web/components/inbox/types.ts
apps/web/components/inbox/action-button.tsx
apps/web/components/inbox/inbox-list.tsx
apps/web/components/inbox/hubs.tsx
apps/web/components/inbox/page-view.tsx
apps/web/messages/ar/nav.json
apps/web/messages/en/nav.json
apps/web/messages/ar/inbox.json
apps/web/messages/en/inbox.json
apps/web/messages/ar/dashboard.json
apps/web/messages/en/dashboard.json
tools/codex_briefs/integration/r1b.md
```

No commit, remote/account action, dependency, migration, guard/scanner change, dev server or database suite was performed by this builder.
