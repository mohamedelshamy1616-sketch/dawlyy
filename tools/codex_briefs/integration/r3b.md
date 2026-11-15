# R3b integration handoff

These complete unified patches are intentionally UNAPPLIED. Existing repository files remain read-only in this worktree. Claude applies them serially at merge and regenerates context where other tasks added imports, hub props or Settings items. Preserve every existing prop, including R4b reviewCard additions. Do not run this document as a script.

The actual R1b reachability test reads `COACH_PROFILE_NAV` in `nav-items.ts` alongside the existing Library/Money hub arrays. It has no separate Settings metadata export. Add the static activity route to that export; the two consumers use the owned `activity` namespace for its label. Dynamic version pages are reached from log actions. The Settings entry is gated by staff role and `clients view`; the new page and API independently enforce their permissions.

## Exact patches against the merged worktree base

Each hunk below contains the real base anchor lines and line numbers. The client slot adds only the `activityLog` prop to the existing `ClientDetail` invocation.

### `apps/web/src/api/index.ts`

```diff
--- a/apps/web/src/api/index.ts
+++ b/apps/web/src/api/index.ts
@@ -46,8 +46,9 @@
 import { router as mediaRouter } from './media';
 import { router as clientModulesRouter } from './client-modules';
 import { router as redFlagsRouter } from './red-flags';
 import { router as inboxRouter } from './inbox';
+import { router as activityRouter } from './activity';
 
 /** doc §12.1 / build-plan API: preserve the shared environment type's original import location. */
 export type { ApiEnv } from './env';
 
@@ -119,8 +120,9 @@
 app.route('/team', teamRouter);
 app.route('/media', mediaRouter);
 app.route('/red-flags', redFlagsRouter);
 app.route('/inbox', inboxRouter);
+app.route('/activity', activityRouter);
 
 app.doc('/openapi.json', { openapi: '3.1.0', info: { title: 'DAWLYY API', version: '1' } });
 app.get('/docs', swaggerUI({ url: '/api/v1/openapi.json' }));
 
```

### `apps/web/i18n/request.ts`

```diff
--- a/apps/web/i18n/request.ts
+++ b/apps/web/i18n/request.ts
@@ -28,8 +28,9 @@
     dashboard: () => import('../messages/ar/dashboard.json'),
     inbox: () => import('../messages/ar/inbox.json'),
     settings: () => import('../messages/ar/settings.json'),
     legal: () => import('../messages/ar/legal.json'),
+    activity: () => import('../messages/ar/activity.json'),
   },
   en: {
     common: () => import('../messages/en/common.json'),
     nav: () => import('../messages/en/nav.json'),
@@ -55,8 +56,9 @@
     dashboard: () => import('../messages/en/dashboard.json'),
     inbox: () => import('../messages/en/inbox.json'),
     settings: () => import('../messages/en/settings.json'),
     legal: () => import('../messages/en/legal.json'),
+    activity: () => import('../messages/en/activity.json'),
   },
 } satisfies Record<(typeof routing.locales)[number], Record<string, () => Promise<{ default: AbstractIntlMessages }>>>;
 
 /** doc §14 / P2B namespaces: assemble the selected locale's independent namespace files. */
```

### `apps/web/app/[locale]/coach/clients/[clientId]/page.tsx`

```diff
--- a/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
+++ b/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
@@ -13,8 +13,9 @@
 import { listPrograms } from '@/src/server/programs/read';
 import { PageHeader } from '@/src/components/shell/page-header';
 import { ClientDetail, HUB_TABS, type HubAccess, type PlanSummary } from '@/components/clients/client-detail';
 import type { TimelinePage } from '@/components/dashboard/types';
+import { ActivityLog } from '@/components/activity/activity-log';
 
 /** R1c: RLS-scoped client hub; the plan and timeline reads run only for callers who hold the matching module grant. */
 export default async function ClientPage({ params, searchParams }: { params: Promise<{ locale: string; clientId: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
   await connection();
@@ -50,7 +51,7 @@
   });
   const { client } = data;
   const requested = HUB_TABS.find(value => value === (Array.isArray(tab) ? tab[0] : tab));
   return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} subtitle={client.code} />
-    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link><ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} />
+    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link><ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} activityLog={<ActivityLog clientId={client.id} />} />
   </div>;
 }
```

### `apps/web/app/[locale]/coach/settings/page.tsx`

```diff
--- a/apps/web/app/[locale]/coach/settings/page.tsx
+++ b/apps/web/app/[locale]/coach/settings/page.tsx
@@ -11,15 +11,18 @@
   const { locale } = await params;
   setRequestLocale(locale);
   const auth = await requirePage();
   const t = await getTranslations('settings.hub');
+  const activity = await getTranslations('activity');
   const item = (key: 'business' | 'team' | 'branding' | 'language' | 'legal' | 'legalPages', href: string) => ({ href, title: t(`${key}.title`), body: t(`${key}.body`) });
   const items = [
     item('business', '/coach/settings/business'),
     ...(isAllowed(auth, 'team', 'view') ? [item('team', '/coach/settings/team')] : []),
     item('branding', '/coach/settings/branding'),
     item('language', '/coach/settings/language'),
     ...(auth.role === 'owner' ? [item('legal', '/coach/settings/legal')] : []),
+    ...((auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'clients', 'view')
+      ? [{ href: '/coach/settings/activity', title: activity('title'), body: activity('subtitle') }] : []),
     item('legalPages', '/terms'),
   ];
   return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} /><SettingsHub items={items} /></div>;
 }
```

### `apps/web/src/components/shell/nav-items.ts`

```diff
--- a/apps/web/src/components/shell/nav-items.ts
+++ b/apps/web/src/components/shell/nav-items.ts
@@ -30,8 +30,9 @@
   { key: 'business', href: '/coach/settings/business', Icon: Settings },
   { key: 'branding', href: '/coach/settings/branding', Icon: Settings },
   { key: 'language', href: '/coach/settings/language', Icon: Settings },
   { key: 'legal', href: '/coach/settings/legal', Icon: Settings },
+  { key: 'activity', href: '/coach/settings/activity', Icon: Settings },
 ];
 
 export const CLIENT_NAV: readonly NavItem[] = [
   { key: 'today', href: '/app/today', Icon: House },
```

### `apps/web/src/components/shell/profile-menu.tsx`

```diff
--- a/apps/web/src/components/shell/profile-menu.tsx
+++ b/apps/web/src/components/shell/profile-menu.tsx
@@ -14,9 +14,9 @@
 import { SignOutButton } from './sign-out-button';
 
 /** R1b: profile tools share one accessible drawer on phone and desktop. */
 export function ProfileMenu() {
-  const t = useTranslations('nav'); const common = useTranslations('common');
+  const t = useTranslations('nav'); const common = useTranslations('common'); const activity = useTranslations('activity');
   const pathname = usePathname(); const [open, setOpen] = useState(false); const id = useId();
   return <>
     <Button label={t('profile')} variant="ghost" icon={<UserRound className="size-5" aria-hidden />}
       className="min-h-11 min-w-11" aria-haspopup="dialog" aria-controls={id} aria-expanded={open} onClick={() => setOpen(true)} />
@@ -31,9 +31,9 @@
           <ul className="m-0 list-none p-0">
             {COACH_PROFILE_NAV.map(item => <li key={item.href}>
               <Link href={item.href} prefetch={false} onClick={() => setOpen(false)} aria-current={isActive(pathname, item) ? 'page' : undefined}
                 className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 hover:bg-muted aria-[current=page]:bg-brand-soft">
-                <item.Icon className="size-4 shrink-0" aria-hidden /><Text>{t(`coach.${item.key}`)}</Text>
+                <item.Icon className="size-4 shrink-0" aria-hidden /><Text>{item.key === 'activity' ? activity('title') : t(`coach.${item.key}`)}</Text>
               </Link>
             </li>)}
           </ul>
         </nav>
```

### `apps/web/src/components/shell/command-palette.tsx`

```diff
--- a/apps/web/src/components/shell/command-palette.tsx
+++ b/apps/web/src/components/shell/command-palette.tsx
@@ -22,9 +22,9 @@
 ).values()];
 
 /** R1b: desktop client/action search with abortable requests, arrow keys, Enter and native dialog focus handling. */
 export function CommandPalette() {
-  const t = useTranslations('nav'); const common = useTranslations('common'); const router = useRouter(); const id = useId();
+  const t = useTranslations('nav'); const common = useTranslations('common'); const activity = useTranslations('activity'); const router = useRouter(); const id = useId();
   const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [active, setActive] = useState(0);
   const [clients, setClients] = useState<{ label: string; href: string }[]>([]);
   const [loading, setLoading] = useState(false); const [failed, setFailed] = useState(false);
   useEffect(() => {
@@ -53,9 +53,9 @@
     }, 200);
     return () => { controller.abort(); clearTimeout(timeout); };
   }, [query, open]);
   const folded = searchKey(query);
-  const results = [...(query.trim() ? clients : []), ...actions.map(item => ({ label: item.archived ? t('archivedFor', { name: t(`coach.${item.key}`) }) : t(`coach.${item.key}`), href: item.href })).filter(item => !folded || searchKey(item.label).includes(folded))];
+  const results = [...(query.trim() ? clients : []), ...actions.map(item => ({ label: item.key === 'activity' ? activity('title') : item.archived ? t('archivedFor', { name: t(`coach.${item.key}`) }) : t(`coach.${item.key}`), href: item.href })).filter(item => !folded || searchKey(item.label).includes(folded))];
   const selected = Math.min(active, Math.max(0, results.length - 1));
   useEffect(() => {
     if (open) document.getElementById(`${id}-result-${selected}`)?.scrollIntoView({ block: 'nearest' });
   }, [open, selected, id]);
```

## Scope and integration review notes

- This is a read-only audit projection. It creates no audit writer, revert service, schema, migration, policy, guard, dependency or package/barrel export. Navigation to a version performs reads only; an explicit confirmation calls the existing source revert endpoint.
- Owner activity may include tenant/null-client rows. Staff activity means their accessible client activity: even all-client staff do not receive null-client/template audit rows. Source module view grants further narrow both views. AI draft review evidence additionally needs check-ins review; red-flag metadata follows its existing clients view grant.
- The supported registry covers clients, client_notes, exercises, programs, program_versions, nutrition_plans, nutrition_plan_versions, forms, form_versions, form_submissions, packages, subscriptions, subscription_events, payments, calendar_events, meal_logs, measurement_sets, metric_entries, workout_sessions, messages, ai_drafts and red_flags. Forms use their stored intake/checkin/assessment kind; missing form discriminators cannot grant a partial-permission caller access.
- Existing producers excluded pending a safe supported projection: `client_entitlement_overrides` (private entitlement override data without an exact activity destination), `staff_client_assignments` (team assignment internals), `business_settings` (settings snapshots), `memberships` (team/user lifecycle, including team.permissions and team.disable), `invitations` (invitation and token metadata), `consents` (consent evidence), `ai_requests` (legacy request/input/output records), `client_flags` (legacy private flags), `media` (asset metadata and signed/file routes), and `tenants` (tenant/account lifecycle). No excluded payload is selected to fill an activity row. Unknown producers remain excluded until explicitly registered.
- Known rows without a surviving RLS-visible supported destination keep their metadata and a null link. Actor names use only visible safe membership profiles; deleted/inaccessible actors use translated role/system fallbacks. No service transaction fills missing data.
- Exact version destinations are `/coach/settings/activity/version/{program|nutrition|form}/{headId}/{versionNo}`. Source reads and revert operations keep their independent view/edit checks. Form kinds choose forms, check-ins or assessments and their existing builder route. Reverts use strict `{toVersionNo, changeNote?}` with the existing note caps (2000 program/form; 4000 nutrition), creating a fresh draft without publishing.

- The existing form kind `custom` has no supported builder/history route in the merged tree. Its exact version remains readable under `forms view`, but its activity `canRevert` is false and the version page offers no draft action because success could not navigate to a real builder. Intake, checkin and assessment forms retain the supported existing revert flow.
- This task uses the imported Astryx theme and existing token-backed layout utilities. It adds no design tokens or CSS. No missing visual token was identified by source inspection; P9 owes rendered token/overflow evidence and R5 owns any resulting token gaps.
- Navigation metadata currently has no standalone secondary reachability export. Adding the static route to the actual `COACH_PROFILE_NAV` export also requires the two owned-namespace label patches above. Profile-menu and command-palette already expose other protected Settings routes; the gated Settings hub item, destination page and activity API retain their independent authorization checks.

- Under partial form-module grants, deleted form/form-version/submission records cannot reveal their former kind through a surviving RLS-visible row. These unresolved form audit rows are excluded before pagination to fail closed; callers with view on every possible form module retain orphan rows with unavailable actions. This is a deliberate scope/history tradeoff in the current safe projection; no schema or payload exposure is added to recover the discriminator.
- Message links resolve only through surviving client conversations. Existing `internal` conversations have no supported coach detail route, so their history remains available to eligible owners with `href: null`.
- Independent read-only integration validation: all seven diff blocks passed `git apply --check -` separately against the unchanged merged worktree base (exit 0 each). No shared-file patch was applied.

## P9 evidence owed

The two new DB-backed files and beta spec are authored for P9 and are not executed by this builder. P9 runs real API/RLS tenant and assignment tests, audit append-only guard checks, all-eight-check integration, the coach archive/undo/Archived/restore flow with ordered client Notes and Settings history, all three exact-version links and explicit fresh-draft reverts with unchanged frozen versions, staff isolation, and the composed R4b approval audit row. P9 also owns browser/screenshot evidence, Astryx doctor, no console errors, ar/en RTL/LTR, 360/390/430 px overflow checks and Astryx 375/1440 px proof. Mocked tests establish application decisions only and do not prove policies. No ninth check is added.
