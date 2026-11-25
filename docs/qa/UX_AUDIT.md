# Client and coach route audit

Source baseline `b5d810f` on 25 November 2026. Ranking is workflow-based. Daily execution, time-sensitive review and communications take priority. No usage counts or runtime viewport evidence were used.

| Rank | Mounted route | Source finding | After status |
| --- | --- | --- | --- |
| 1 | [`/app/today`](../../apps/web/app/%5Blocale%5D/app/today/page.tsx) | The subscription banner precedes the workout action, pushing Start farther down the phone screen when a subscription notice is present. [Component](../../apps/web/components/client-today/today-view.tsx) | Baseline only |
| 2 | [`/app/workout/[sessionId]`](../../apps/web/app/%5Blocale%5D/app/workout/%5BsessionId%5D/page.tsx) | Finish follows every exercise, the session notes and the outcome selector. A client logging an early set must scroll through the remaining sets to finish. [Component](../../apps/web/components/client-portal/workout-screen.tsx) | Baseline only |
| 3 | [`/coach`](../../apps/web/app/%5Blocale%5D/coach/page.tsx) | Queue count cards appear on the selected queue branch. The default branch renders the inbox and puts links to other queues below it. [Component](../../apps/web/components/inbox/page-view.tsx) | Baseline only |
| 4 | [`/coach/checkins`](../../apps/web/app/%5Blocale%5D/coach/checkins/page.tsx) | The review tab already opens by default. HubTabs receives the active tab and form kind, with no queue count. The cursor-paginated rows alone cannot establish a total. [Component](../../apps/web/components/form-builder/hub-page.tsx) | Baseline only |
| 5 | [`/coach/clients`](../../apps/web/app/%5Blocale%5D/coach/clients/page.tsx) | The row schema supplies package and days left, with no seven-day adherence or attention reason. The paginated roster cannot support the requested global ranking from these fields. [Component](../../apps/web/components/clients/client-list.tsx) | Baseline only |
| 6 | [`/coach/checkins/review/[submissionId]`](../../apps/web/app/%5Blocale%5D/coach/checkins/review/%5BsubmissionId%5D/page.tsx) | The detail panel receives one pinned submission and its review permission. It has no next queue item for continuing a review session. [Component](../../apps/web/components/form-builder/review-page.tsx) | Baseline only |
| 7 | [`/app/messages`](../../apps/web/app/%5Blocale%5D/app/messages/page.tsx) | The composer sticks to bottom-0 while the mobile shell fixes its tabs to the same edge. Composer positioning lacks explicit tab clearance. Overlap needs viewport verification. [Component](../../apps/web/components/messaging/thread.tsx) | Baseline only |
| 8 | [`/coach/messages`](../../apps/web/app/%5Blocale%5D/coach/messages/page.tsx) | Unread rows use a fixed blue badge. The verified per-conversation count has no theme-aware accent treatment. [Component](../../apps/web/components/messaging/inbox.tsx) | Baseline only |
| 9 | [`/app/plan`](../../apps/web/app/%5Blocale%5D/app/plan/page.tsx) | Destination hints use text-sm, below the requested 16 px phone body size. [Component](../../apps/web/components/client-today/client-hubs.tsx) | Baseline only |
| 10 | [`/app/progress`](../../apps/web/app/%5Blocale%5D/app/progress/page.tsx) | Each measurement concatenates its name, side, value, unit and both deltas into one text run. Long Arabic labels share the same line hierarchy as the result. [Component](../../apps/web/components/tracking/progress-panel.tsx) | Baseline only |
| 11 | [`/app/me`](../../apps/web/app/%5Blocale%5D/app/me/page.tsx) | Progress, tracking, histories, forms, billing, notifications and consent occupy one destination list. With all modules enabled, account links follow the tracking and form links. [Component](../../apps/web/components/client-today/client-destinations.ts) | Baseline only |
| 12 | [`/app/coach`](../../apps/web/app/%5Blocale%5D/app/coach/page.tsx) | The Coach tab renders an icon and translated label. Its module context has no unread count, so the tab cannot signal a waiting message. [Component](../../apps/web/components/app/client-tab-bar.tsx) | Baseline only |

## Mounted navigation and data

Both locale layouts mount the shared shell. Coach navigation uses nav-items.ts, NavLinks and CoachBottomBar. Inbox, Clients, Library and Money are the four primary destinations. The client tab bar derives Today, Plan, Coach and Me from resolved modules. Bootstrap loading and failure expose Today and Me, with retry on failure.

The submission review route opens FormReviewPage for a pinned form. The separate coach/clients/[clientId]/review route opens ReviewWorkspace with the latest client review draft and independent permissions for sending and nutrition proposals. Coach messages opens a conversation list, coach/messages/[conversationId] opens a thread, and app/messages opens the client thread.

## Theme baseline

globals.css imports both the built Astryx theme and tokens.css. The theme source reads the shared accent variables, while AstryxProvider sets light mode explicitly. The reference board uses a near-black stage, two green-neutral surfaces, dark lettering on lime buttons, lit card edges, Inter 800 metric figures and a blurred tab bar. Theme work must coordinate the provider mode and CSS semantic tokens.

## Page inventory

All paths are relative to /[locale]. Each link opens the page module.

### app (26 pages)

| Route | Entry type |
| --- | --- |
| [`/app/[...rest]`](../../apps/web/app/%5Blocale%5D/app/%5B...rest%5D/page.tsx) | Catch-all 404 |
| [`/app/assessment/[eventId]`](../../apps/web/app/%5Blocale%5D/app/assessment/%5BeventId%5D/page.tsx) | Dynamic detail |
| [`/app/assessment`](../../apps/web/app/%5Blocale%5D/app/assessment/page.tsx) | Page |
| [`/app/checkins/[eventId]`](../../apps/web/app/%5Blocale%5D/app/checkins/%5BeventId%5D/page.tsx) | Dynamic detail |
| [`/app/checkins`](../../apps/web/app/%5Blocale%5D/app/checkins/page.tsx) | Page |
| [`/app/coach`](../../apps/web/app/%5Blocale%5D/app/coach/page.tsx) | Page |
| [`/app/consent`](../../apps/web/app/%5Blocale%5D/app/consent/page.tsx) | Page |
| [`/app/history/[sessionId]`](../../apps/web/app/%5Blocale%5D/app/history/%5BsessionId%5D/page.tsx) | Dynamic detail |
| [`/app/history/exercise/[exerciseId]`](../../apps/web/app/%5Blocale%5D/app/history/exercise/%5BexerciseId%5D/page.tsx) | Dynamic detail |
| [`/app/history`](../../apps/web/app/%5Blocale%5D/app/history/page.tsx) | Page |
| [`/app/intake`](../../apps/web/app/%5Blocale%5D/app/intake/page.tsx) | Page |
| [`/app/me`](../../apps/web/app/%5Blocale%5D/app/me/page.tsx) | Page |
| [`/app/messages`](../../apps/web/app/%5Blocale%5D/app/messages/page.tsx) | Page |
| [`/app/notifications`](../../apps/web/app/%5Blocale%5D/app/notifications/page.tsx) | Page |
| [`/app/nutrition/history`](../../apps/web/app/%5Blocale%5D/app/nutrition/history/page.tsx) | Page |
| [`/app/nutrition/log`](../../apps/web/app/%5Blocale%5D/app/nutrition/log/page.tsx) | Page |
| [`/app/nutrition`](../../apps/web/app/%5Blocale%5D/app/nutrition/page.tsx) | Page |
| [`/app`](../../apps/web/app/%5Blocale%5D/app/page.tsx) | Redirect to /app/today |
| [`/app/plan`](../../apps/web/app/%5Blocale%5D/app/plan/page.tsx) | Page |
| [`/app/program`](../../apps/web/app/%5Blocale%5D/app/program/page.tsx) | Page |
| [`/app/progress`](../../apps/web/app/%5Blocale%5D/app/progress/page.tsx) | Page |
| [`/app/subscription`](../../apps/web/app/%5Blocale%5D/app/subscription/page.tsx) | Page |
| [`/app/today`](../../apps/web/app/%5Blocale%5D/app/today/page.tsx) | Page |
| [`/app/tracking`](../../apps/web/app/%5Blocale%5D/app/tracking/page.tsx) | Page |
| [`/app/workout/[sessionId]`](../../apps/web/app/%5Blocale%5D/app/workout/%5BsessionId%5D/page.tsx) | Dynamic detail |
| [`/app/workout/start`](../../apps/web/app/%5Blocale%5D/app/workout/start/page.tsx) | Workout start and navigation after session creation |

### coach (61 pages)

| Route | Entry type |
| --- | --- |
| [`/coach/[...rest]`](../../apps/web/app/%5Blocale%5D/coach/%5B...rest%5D/page.tsx) | Catch-all 404 |
| [`/coach/assessments/[formId]`](../../apps/web/app/%5Blocale%5D/coach/assessments/%5BformId%5D/page.tsx) | Dynamic detail |
| [`/coach/assessments`](../../apps/web/app/%5Blocale%5D/coach/assessments/page.tsx) | Page |
| [`/coach/assessments/review/[submissionId]`](../../apps/web/app/%5Blocale%5D/coach/assessments/review/%5BsubmissionId%5D/page.tsx) | Dynamic detail |
| [`/coach/billing`](../../apps/web/app/%5Blocale%5D/coach/billing/page.tsx) | Page |
| [`/coach/billing/payments/[paymentId]`](../../apps/web/app/%5Blocale%5D/coach/billing/payments/%5BpaymentId%5D/page.tsx) | Dynamic detail |
| [`/coach/billing/sell`](../../apps/web/app/%5Blocale%5D/coach/billing/sell/page.tsx) | Page |
| [`/coach/calendar`](../../apps/web/app/%5Blocale%5D/coach/calendar/page.tsx) | Page |
| [`/coach/checkins/[formId]`](../../apps/web/app/%5Blocale%5D/coach/checkins/%5BformId%5D/page.tsx) | Dynamic detail |
| [`/coach/checkins`](../../apps/web/app/%5Blocale%5D/coach/checkins/page.tsx) | Page |
| [`/coach/checkins/review/[submissionId]`](../../apps/web/app/%5Blocale%5D/coach/checkins/review/%5BsubmissionId%5D/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]/client-app`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/client-app/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]/overrides`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/overrides/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]/review`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/review/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]/subscription`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/subscription/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]/timeline`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/timeline/page.tsx) | Dynamic detail |
| [`/coach/clients/[clientId]/tracking`](../../apps/web/app/%5Blocale%5D/coach/clients/%5BclientId%5D/tracking/page.tsx) | Dynamic detail |
| [`/coach/clients/new`](../../apps/web/app/%5Blocale%5D/coach/clients/new/page.tsx) | Page |
| [`/coach/clients`](../../apps/web/app/%5Blocale%5D/coach/clients/page.tsx) | Page |
| [`/coach/exercises/[exerciseId]`](../../apps/web/app/%5Blocale%5D/coach/exercises/%5BexerciseId%5D/page.tsx) | Dynamic detail |
| [`/coach/exercises/import`](../../apps/web/app/%5Blocale%5D/coach/exercises/import/page.tsx) | Page |
| [`/coach/exercises/new`](../../apps/web/app/%5Blocale%5D/coach/exercises/new/page.tsx) | Page |
| [`/coach/exercises`](../../apps/web/app/%5Blocale%5D/coach/exercises/page.tsx) | Page |
| [`/coach/foods/[foodId]`](../../apps/web/app/%5Blocale%5D/coach/foods/%5BfoodId%5D/page.tsx) | Dynamic detail |
| [`/coach/foods/new`](../../apps/web/app/%5Blocale%5D/coach/foods/new/page.tsx) | Page |
| [`/coach/foods`](../../apps/web/app/%5Blocale%5D/coach/foods/page.tsx) | Page |
| [`/coach/intake/[formId]`](../../apps/web/app/%5Blocale%5D/coach/intake/%5BformId%5D/page.tsx) | Dynamic detail |
| [`/coach/intake`](../../apps/web/app/%5Blocale%5D/coach/intake/page.tsx) | Page |
| [`/coach/library`](../../apps/web/app/%5Blocale%5D/coach/library/page.tsx) | Page |
| [`/coach/messages/[conversationId]`](../../apps/web/app/%5Blocale%5D/coach/messages/%5BconversationId%5D/page.tsx) | Dynamic detail |
| [`/coach/messages`](../../apps/web/app/%5Blocale%5D/coach/messages/page.tsx) | Page |
| [`/coach/money`](../../apps/web/app/%5Blocale%5D/coach/money/page.tsx) | Page |
| [`/coach/notifications`](../../apps/web/app/%5Blocale%5D/coach/notifications/page.tsx) | Page |
| [`/coach/nutrition/[planId]/assign`](../../apps/web/app/%5Blocale%5D/coach/nutrition/%5BplanId%5D/assign/page.tsx) | Dynamic detail |
| [`/coach/nutrition/[planId]/history`](../../apps/web/app/%5Blocale%5D/coach/nutrition/%5BplanId%5D/history/page.tsx) | Dynamic detail |
| [`/coach/nutrition/[planId]`](../../apps/web/app/%5Blocale%5D/coach/nutrition/%5BplanId%5D/page.tsx) | Dynamic detail |
| [`/coach/nutrition/new`](../../apps/web/app/%5Blocale%5D/coach/nutrition/new/page.tsx) | Page |
| [`/coach/nutrition`](../../apps/web/app/%5Blocale%5D/coach/nutrition/page.tsx) | Page |
| [`/coach/packages/[packageId]`](../../apps/web/app/%5Blocale%5D/coach/packages/%5BpackageId%5D/page.tsx) | Dynamic detail |
| [`/coach/packages/new`](../../apps/web/app/%5Blocale%5D/coach/packages/new/page.tsx) | Page |
| [`/coach/packages`](../../apps/web/app/%5Blocale%5D/coach/packages/page.tsx) | Page |
| [`/coach`](../../apps/web/app/%5Blocale%5D/coach/page.tsx) | Page |
| [`/coach/programs/[programId]/assign`](../../apps/web/app/%5Blocale%5D/coach/programs/%5BprogramId%5D/assign/page.tsx) | Dynamic detail |
| [`/coach/programs/[programId]/history`](../../apps/web/app/%5Blocale%5D/coach/programs/%5BprogramId%5D/history/page.tsx) | Dynamic detail |
| [`/coach/programs/[programId]`](../../apps/web/app/%5Blocale%5D/coach/programs/%5BprogramId%5D/page.tsx) | Dynamic detail |
| [`/coach/programs/new`](../../apps/web/app/%5Blocale%5D/coach/programs/new/page.tsx) | Page |
| [`/coach/programs`](../../apps/web/app/%5Blocale%5D/coach/programs/page.tsx) | Page |
| [`/coach/settings/activity`](../../apps/web/app/%5Blocale%5D/coach/settings/activity/page.tsx) | Page |
| [`/coach/settings/activity/version/[kind]/[headId]/[versionNo]`](../../apps/web/app/%5Blocale%5D/coach/settings/activity/version/%5Bkind%5D/%5BheadId%5D/%5BversionNo%5D/page.tsx) | Dynamic detail |
| [`/coach/settings/ai`](../../apps/web/app/%5Blocale%5D/coach/settings/ai/page.tsx) | Page |
| [`/coach/settings/branding`](../../apps/web/app/%5Blocale%5D/coach/settings/branding/page.tsx) | Page |
| [`/coach/settings/business`](../../apps/web/app/%5Blocale%5D/coach/settings/business/page.tsx) | Page |
| [`/coach/settings/client-app`](../../apps/web/app/%5Blocale%5D/coach/settings/client-app/page.tsx) | Page |
| [`/coach/settings/language`](../../apps/web/app/%5Blocale%5D/coach/settings/language/page.tsx) | Page |
| [`/coach/settings/legal`](../../apps/web/app/%5Blocale%5D/coach/settings/legal/page.tsx) | Page |
| [`/coach/settings`](../../apps/web/app/%5Blocale%5D/coach/settings/page.tsx) | Page |
| [`/coach/settings/review`](../../apps/web/app/%5Blocale%5D/coach/settings/review/page.tsx) | Page |
| [`/coach/settings/team/[membershipId]`](../../apps/web/app/%5Blocale%5D/coach/settings/team/%5BmembershipId%5D/page.tsx) | Dynamic detail |
| [`/coach/settings/team`](../../apps/web/app/%5Blocale%5D/coach/settings/team/page.tsx) | Page |
| [`/coach/tasks`](../../apps/web/app/%5Blocale%5D/coach/tasks/page.tsx) | Page |
