# R4b integration

Exact unified diffs against current `main` (after R0 to R4d and R2b/R2c). Each block passes `git apply --check --recount` from the repo root; save a block to a file and apply them serially in the order below (they touch disjoint files). No hot-spot file was changed by this batch. Next.js discovers the two new pages automatically.

Deviation from the brief, on purpose: the brief asked for `app.route('/', reviewRouter)` with middleware restricted to owned paths. The C15 scanner (`security.catalog.test.ts`) only accepts a router that registers `use('*', requireAuthMiddleware)` then `use('*', requireStaffRole)` at top level, and a `'*'` guard on a router mounted at `/` would also fence every client route mounted after it (`/me`, `/settings` client routes). `api/review.ts` therefore exports two staff-only routers, mounted at their own prefixes: `router` at `/clients` (before `clientsRouter`, so `/api/v1/clients/{clientId}/review...` is answered here) and `reviewPreferencesRouter` at `/settings/review-preferences`. Cost: every `/clients/*` request runs the auth and staff middleware twice (once here, once in `clientsRouter`); idempotency replay is route-level in `review.ts`, so it never runs twice.

## 1. API mount

Imports both routers after `clientsRouter` and mounts them at their prefixes.

```diff
--- a/apps/web/src/api/index.ts
+++ b/apps/web/src/api/index.ts
@@ -12,6 +12,7 @@
 import { router as invitationsClientRouter } from './invitations.client';
 import { router as invitationsRouter } from './invitations';
 import { router as clientsRouter } from './clients';
+import { router as reviewRouter, reviewPreferencesRouter } from './review';
 import { router as packagesRouter } from './packages';
 import { router as subscriptionsClientRouter } from './subscriptions.client';
 import { router as subscriptionsRouter } from './subscriptions';
@@ -85,6 +86,7 @@
 app.route('/auth', authRouter);
 app.route('/invitations', invitationsClientRouter);
 app.route('/invitations', invitationsRouter);
+app.route('/clients', reviewRouter);
 app.route('/clients', clientsRouter);
 app.route('/packages', packagesRouter);
 app.route('/subscriptions', subscriptionsClientRouter);
@@ -114,6 +116,7 @@
 app.route('/notifications', notificationsRouter);
 app.route('/dashboard', dashboardRouter);
 app.route('/tasks', tasksRouter);
+app.route('/settings/review-preferences', reviewPreferencesRouter);
 app.route('/settings', settingsClientRouter);
 app.route('/settings/client-modules', clientModulesRouter);
 app.route('/settings', settingsRouter);
```

## 2. Catalog loaders

Registers the `review` namespace for both locales after `legal`.

```diff
--- a/apps/web/i18n/request.ts
+++ b/apps/web/i18n/request.ts
@@ -32,6 +32,7 @@
     inbox: () => import('../messages/ar/inbox.json'),
     settings: () => import('../messages/ar/settings.json'),
     legal: () => import('../messages/ar/legal.json'),
+    review: () => import('../messages/ar/review.json'),
     clientAppComposer: () => import('../messages/ar/clientAppComposer.json'),
     aiProvider: () => import('../messages/ar/aiProvider.json'),
     archiveControls: () => import('../messages/ar/archiveControls.json'),
@@ -67,6 +68,7 @@
     inbox: () => import('../messages/en/inbox.json'),
     settings: () => import('../messages/en/settings.json'),
     legal: () => import('../messages/en/legal.json'),
+    review: () => import('../messages/en/review.json'),
     clientAppComposer: () => import('../messages/en/clientAppComposer.json'),
     aiProvider: () => import('../messages/en/aiProvider.json'),
     archiveControls: () => import('../messages/en/archiveControls.json'),
```

## 3. Client hub Week tab

Fills the existing `reviewCard` slot (R3b's `activityLog` slot is untouched). The card only performs `GET /clients/{id}/review` when opened.

```diff
--- a/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
+++ b/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
@@ -15,6 +15,7 @@
 import { ClientDetail, HUB_TABS, type HubAccess, type PlanSummary } from '@/components/clients/client-detail';
 import type { TimelinePage } from '@/components/dashboard/types';
 import { ActivityLog } from '@/components/activity/activity-log';
+import { WeeklyReviewCard } from '@/components/review/weekly-review-card';
 
 /** R1c: RLS-scoped client hub; the plan and timeline reads run only for callers who hold the matching module grant. */
 export default async function ClientPage({ params, searchParams }: { params: Promise<{ locale: string; clientId: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
@@ -56,6 +57,6 @@
     <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link>
     {isAllowed(auth, 'settings', 'view') && isAllowed(auth, 'clients', 'view') && isAllowed(auth, 'clients', 'edit')
       ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${client.id}/client-app`}>{clientApp('hub.clientLink')}</Link> : null}
-    <ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} activityLog={<ActivityLog clientId={client.id} />} />
+    <ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} activityLog={<ActivityLog clientId={client.id} />} reviewCard={(auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'clients', 'view') && isAllowed(auth, 'checkins', 'review') ? <WeeklyReviewCard clientId={client.id} initial={null} /> : null} />
   </div>;
 }
```

## 4. Inbox review action

The `review` action now opens the weekly review. Patches 9 and 10 update the two existing exact-href assertions that this contract change makes obsolete; apply them together with this one.

```diff
--- a/apps/web/src/server/inbox/logic.ts
+++ b/apps/web/src/server/inbox/logic.ts
@@ -34,7 +34,7 @@
 /** R1b: resolve an inline action; null asks the UI to open/create a conversation first. */
 export function actionHref(action: AttentionAction, clientId: string, refs: { reviewId?: string | null; paymentId?: string | null; conversationId?: string | null }): string | null {
   switch (action) {
-    case 'review': return refs.reviewId ? `/coach/checkins/review/${refs.reviewId}` : `/coach/clients/${clientId}`;
+    case 'review': return `/coach/clients/${clientId}/review`;
     case 'confirm_payment': return refs.paymentId ? `/coach/billing/payments/${refs.paymentId}` : '/coach/billing';
     case 'renew': return `/coach/clients/${clientId}/subscription`;
     case 'handle_flag': return `/coach/clients/${clientId}`;
```

## 5. Settings hub link

Uses `review('hub.title')` and `review('hub.body')` from the owned `review` catalog.

```diff
--- a/apps/web/app/[locale]/coach/settings/page.tsx
+++ b/apps/web/app/[locale]/coach/settings/page.tsx
@@ -12,6 +12,7 @@
   setRequestLocale(locale);
   const auth = await requirePage();
   const t = await getTranslations('settings.hub');
+  const review = await getTranslations('review');
   const clientApp = await getTranslations('clientAppComposer');
   const ai = await getTranslations('aiProvider');
   const activity = await getTranslations('activity');
@@ -26,6 +27,8 @@
       ? [{ href: '/coach/settings/activity', title: activity('title'), body: activity('subtitle') }] : []),
     ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/ai', title: ai('hub.title'), body: ai('hub.body') }] : []),
     ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/client-app', title: clientApp('hub.title'), body: clientApp('hub.body') }] : []),
+    ...((auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'checkins', 'review')
+      ? [{ href: '/coach/settings/review', title: review('hub.title'), body: review('hub.body') }] : []),
     item('legalPages', '/terms'),
   ];
   return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} /><SettingsHub items={items} /></div>;
```

## 6. Profile menu and command palette entry

`COACH_PROFILE_NAV` item; both consumers already resolve unknown keys with `t('coach.<key>')`, so they need no code change. Required by `nav-reachability.test.ts`.

```diff
--- a/apps/web/src/components/shell/nav-items.ts
+++ b/apps/web/src/components/shell/nav-items.ts
@@ -34,6 +34,7 @@
   { key: 'activity', href: '/coach/settings/activity', Icon: Settings },
   { key: 'aiProvider', href: '/coach/settings/ai', Icon: Settings },
   { key: 'clientApp', href: '/coach/settings/client-app', Icon: Settings },
+  { key: 'reviewPreferences', href: '/coach/settings/review', Icon: Settings },
 ];
 
 export const CLIENT_NAV: readonly NavItem[] = [
```

## 7. Arabic nav label

`coach.reviewPreferences` for the new nav item.

```diff
--- a/apps/web/messages/ar/nav.json
+++ b/apps/web/messages/ar/nav.json
@@ -25,6 +25,7 @@
     "language": "اللغة والأرقام",
     "legal": "المستندات القانونية",
     "clientApp": "تطبيق العميل",
+    "reviewPreferences": "تفضيلات المراجعة",
     "foods": "الأكلات",
     "forms": "الاستمارات",
     "payments": "المدفوعات",
```

## 8. English nav label

`coach.reviewPreferences` for the new nav item.

```diff
--- a/apps/web/messages/en/nav.json
+++ b/apps/web/messages/en/nav.json
@@ -25,6 +25,7 @@
     "language": "Language and numbers",
     "legal": "Legal documents",
     "clientApp": "Client app",
+    "reviewPreferences": "Review preferences",
     "foods": "Foods",
     "forms": "Forms",
     "payments": "Payments",
```

## 9. Obsolete assertion in `inbox/logic.test.ts`

The destination stays an exact string; only the approved destination changed.

```diff
--- a/apps/web/src/server/inbox/logic.test.ts
+++ b/apps/web/src/server/inbox/logic.test.ts
@@ -20,7 +20,7 @@
   });
   it('resolves the exact review, payment and conversation instead of opening a generic list', () => {
     const refs = { reviewId: 'review', paymentId: 'payment', conversationId: 'thread' };
-    expect(actionHref('review', 'client', refs)).toBe('/coach/checkins/review/review');
+    expect(actionHref('review', 'client', refs)).toBe('/coach/clients/client/review');
     expect(actionHref('confirm_payment', 'client', refs)).toBe('/coach/billing/payments/payment');
     expect(actionHref('reply', 'client', refs)).toBe('/coach/messages/thread');
     expect(actionHref('renew', 'client', refs)).toBe('/coach/clients/client/subscription');
```

## 10. Obsolete assertion in `api/inbox.test.ts`

Same: still an exact destination (`f.clientId` is the seeded client with the waiting check-in).

```diff
--- a/apps/web/src/api/inbox.test.ts
+++ b/apps/web/src/api/inbox.test.ts
@@ -40,7 +40,7 @@
   it('ranks a waiting review above only no_contact and resolves its review action', async () => {
     const result = await inbox();
     expect(result.items.map(row => row.client.id)).toEqual([f.clientId, f.otherClientId]);
-    expect(result.items[0]).toMatchObject({ primaryAction: 'review', actionHref: `/coach/checkins/review/${reviewId}` });
+    expect(result.items[0]).toMatchObject({ primaryAction: 'review', actionHref: `/coach/clients/${f.clientId}/review` });
     expect(result.items[0]!.score).toBeGreaterThan(result.items[1]!.score);
     expect(result.items[1]!.reasons.map(reason => reason.code)).toEqual(['no_contact']);
   });
```

## P9 ownership

`src/api/review.db.test.ts`, `packages/db/test/security.review-api.test.ts` and `e2e/beta/r4b-review-approve.spec.ts` are written for existing test-web, test-db and e2e discovery; none was run here. Real RLS, the row lock, concurrent duplicate approval, stale commit and rollback, browser actions, 360/375/390/430/1440 overflow and the Astryx doctor are P9 evidence. No ninth `checks.json` entry. The e2e spec records review versus manual milliseconds and the ratio on one seeded client and asserts the 30% target (ratio <= 0.7) only from that measured baseline; a single sample per locale is thin evidence.
