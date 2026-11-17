# R2c integration patches

Unapplied. Apply serially after the second batch, against the current main. `git apply --check` was run on all blocks together.

Why the nav entry is needed: creating `/coach/settings/client-app` makes `nav-reachability.test.ts` fail until the `nav-items.ts` entry lands (expected red until then). `profile-menu.tsx` and `command-palette.tsx` label any other key with `t('coach.<key>')`, so the `nav.json` key in patch 5 is all they need: no change to those two files and no namespace ternary. `apps/web/src/api/index.ts`, `command-palette.tsx`, `profile-menu.tsx`, `hub-links.ts`, core index and every `package.json` need no change.

Order: 1, 2, 3, 4, 5a, 5b.

## 1. Catalog loaders

File: `apps/web/i18n/request.ts`.

```diff
diff --git a/apps/web/i18n/request.ts b/apps/web/i18n/request.ts
--- a/apps/web/i18n/request.ts
+++ b/apps/web/i18n/request.ts
@@ -30,6 +30,7 @@ const loaders = {
     inbox: () => import('../messages/ar/inbox.json'),
     settings: () => import('../messages/ar/settings.json'),
     legal: () => import('../messages/ar/legal.json'),
+    clientAppComposer: () => import('../messages/ar/clientAppComposer.json'),
     aiProvider: () => import('../messages/ar/aiProvider.json'),
     archiveControls: () => import('../messages/ar/archiveControls.json'),
     controlUndo: () => import('../messages/ar/controlUndo.json'),
@@ -62,6 +63,7 @@ const loaders = {
     inbox: () => import('../messages/en/inbox.json'),
     settings: () => import('../messages/en/settings.json'),
     legal: () => import('../messages/en/legal.json'),
+    clientAppComposer: () => import('../messages/en/clientAppComposer.json'),
     aiProvider: () => import('../messages/en/aiProvider.json'),
     archiveControls: () => import('../messages/en/archiveControls.json'),
     controlUndo: () => import('../messages/en/controlUndo.json'),
```

## 2. Settings hub link

File: `apps/web/app/[locale]/coach/settings/page.tsx`.

```diff
diff --git a/apps/web/app/[locale]/coach/settings/page.tsx b/apps/web/app/[locale]/coach/settings/page.tsx
--- a/apps/web/app/[locale]/coach/settings/page.tsx
+++ b/apps/web/app/[locale]/coach/settings/page.tsx
@@ -12,6 +12,7 @@ export default async function SettingsPage({ params }: { params: Promise<{ local
   setRequestLocale(locale);
   const auth = await requirePage();
   const t = await getTranslations('settings.hub');
+  const clientApp = await getTranslations('clientAppComposer');
   const ai = await getTranslations('aiProvider');
   const activity = await getTranslations('activity');
   const item = (key: 'business' | 'team' | 'branding' | 'language' | 'legal' | 'legalPages', href: string) => ({ href, title: t(`${key}.title`), body: t(`${key}.body`) });
@@ -24,6 +25,7 @@ export default async function SettingsPage({ params }: { params: Promise<{ local
     ...((auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'clients', 'view')
       ? [{ href: '/coach/settings/activity', title: activity('title'), body: activity('subtitle') }] : []),
     ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/ai', title: ai('hub.title'), body: ai('hub.body') }] : []),
+    ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/client-app', title: clientApp('hub.title'), body: clientApp('hub.body') }] : []),
     item('legalPages', '/terms'),
   ];
   return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} /><SettingsHub items={items} /></div>;
```

## 3. Client hub link

File: `apps/web/app/[locale]/coach/clients/[clientId]/page.tsx`.

```diff
diff --git a/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx b/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
--- a/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
+++ b/apps/web/app/[locale]/coach/clients/[clientId]/page.tsx
@@ -25,6 +25,7 @@ export default async function ClientPage({ params, searchParams }: { params: Pro
   const auth = await requirePage();
   if (!z.string().uuid().safeParse(clientId).success) notFound();
   const t = await getTranslations('clients');
+  const clientApp = await getTranslations('clientAppComposer');
   const access: HubAccess = {
     edit: isAllowed(auth, 'clients', 'edit'),
     viewTimeline: isAllowed(auth, 'dashboard', 'view'),
@@ -52,6 +53,9 @@ export default async function ClientPage({ params, searchParams }: { params: Pro
   const { client } = data;
   const requested = HUB_TABS.find(value => value === (Array.isArray(tab) ? tab[0] : tab));
   return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} subtitle={client.code} />
-    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link><ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} activityLog={<ActivityLog clientId={client.id} />} />
+    <Link className="inline-flex min-h-11 items-center underline" href="/coach/clients">{t('back')}</Link>
+    {isAllowed(auth, 'settings', 'view') && isAllowed(auth, 'clients', 'view') && isAllowed(auth, 'clients', 'edit')
+      ? <Link className="inline-flex min-h-11 items-center underline" href={`/coach/clients/${client.id}/client-app`}>{clientApp('hub.clientLink')}</Link> : null}
+    <ClientDetail client={client} access={access} initialTab={requested} timeline={data.timeline} program={data.program} nutrition={data.nutrition} activityLog={<ActivityLog clientId={client.id} />} />
   </div>;
 }
```

## 4. Route reachability (nav-items.ts)

File: `apps/web/src/components/shell/nav-items.ts`.

```diff
diff --git a/apps/web/src/components/shell/nav-items.ts b/apps/web/src/components/shell/nav-items.ts
--- a/apps/web/src/components/shell/nav-items.ts
+++ b/apps/web/src/components/shell/nav-items.ts
@@ -33,6 +33,7 @@ export const COACH_PROFILE_NAV: readonly NavItem[] = [
   { key: 'legal', href: '/coach/settings/legal', Icon: Settings },
   { key: 'activity', href: '/coach/settings/activity', Icon: Settings },
   { key: 'aiProvider', href: '/coach/settings/ai', Icon: Settings },
+  { key: 'clientApp', href: '/coach/settings/client-app', Icon: Settings },
 ];
 
 export const CLIENT_NAV: readonly NavItem[] = [
```

## 5a. nav.json (en)

File: `apps/web/messages/en/nav.json`.

```diff
diff --git a/apps/web/messages/en/nav.json b/apps/web/messages/en/nav.json
--- a/apps/web/messages/en/nav.json
+++ b/apps/web/messages/en/nav.json
@@ -24,6 +24,7 @@
     "branding": "Branding",
     "language": "Language and numbers",
     "legal": "Legal documents",
+    "clientApp": "Client app",
     "foods": "Foods",
     "forms": "Forms",
     "payments": "Payments",
```

## 5b. nav.json (ar)

File: `apps/web/messages/ar/nav.json`.

```diff
diff --git a/apps/web/messages/ar/nav.json b/apps/web/messages/ar/nav.json
--- a/apps/web/messages/ar/nav.json
+++ b/apps/web/messages/ar/nav.json
@@ -24,6 +24,7 @@
     "branding": "الهوية",
     "language": "اللغة والأرقام",
     "legal": "المستندات القانونية",
+    "clientApp": "تطبيق العميل",
     "foods": "الأكلات",
     "forms": "الاستمارات",
     "payments": "المدفوعات",
```

## Optional, not depended on

`components/client-today/today-view.tsx` hardcodes `Heading level={1}`. The composer keeps one h1 by exposing the preview frame as a labelled `role="img"` (children presentational). A cleaner fix would be an optional `headingLevel` prop on `ClientTodayView` (default 1) passed to that Heading; the composer does not need it.

## Notes

- Token requests for R5: none. Layout uses Astryx components and existing Tailwind scale utilities (`max-w-sm`, `basis-80`, `rounded-3xl`).
- The composer calls only existing endpoints: GET/PUT /settings/client-modules and GET/PUT/DELETE /clients/{id}/overrides/custom%3Aclient_app.
