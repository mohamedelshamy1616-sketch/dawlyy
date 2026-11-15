# R3a integration patches

Claude applies these after reviewing the worktree and before R2b builds. Every diff below was produced mechanically with
`git diff --no-index` from the merged base, then checked with `git apply --ignore-whitespace --check` against this worktree
(all six passed). `--ignore-whitespace` is needed only because the Windows checkout holds CRLF while the index holds LF;
save each block to a file and run `git apply --ignore-whitespace <file>`. No target file was changed by the builder.

## 1. Required by the brief

### 1.1 Message namespaces (both locale loader objects, directly after `legal`)

```diff
diff --git a/apps/web/i18n/request.ts b/apps/web/i18n/request.ts
--- a/apps/web/i18n/request.ts
+++ b/apps/web/i18n/request.ts
@@ -29,6 +29,8 @@ const loaders = {
     inbox: () => import('../messages/ar/inbox.json'),
     settings: () => import('../messages/ar/settings.json'),
     legal: () => import('../messages/ar/legal.json'),
+    archiveControls: () => import('../messages/ar/archiveControls.json'),
+    controlUndo: () => import('../messages/ar/controlUndo.json'),
   },
   en: {
     common: () => import('../messages/en/common.json'),
@@ -56,6 +58,8 @@ const loaders = {
     inbox: () => import('../messages/en/inbox.json'),
     settings: () => import('../messages/en/settings.json'),
     legal: () => import('../messages/en/legal.json'),
+    archiveControls: () => import('../messages/en/archiveControls.json'),
+    controlUndo: () => import('../messages/en/controlUndo.json'),
   },
 } satisfies Record<(typeof routing.locales)[number], Record<string, () => Promise<{ default: AbstractIntlMessages }>>>;
 
```

Until this is applied, `useTranslations('archiveControls')` and `useTranslations('controlUndo')` have no messages at runtime.

### 1.2 Mount the one UndoToast

```diff
diff --git a/apps/web/app/[locale]/layout.tsx b/apps/web/app/[locale]/layout.tsx
--- a/apps/web/app/[locale]/layout.tsx
+++ b/apps/web/app/[locale]/layout.tsx
@@ -9,6 +9,7 @@ import { NextIntlClientProvider } from "next-intl";
 import { getTranslations, setRequestLocale } from "next-intl/server";
 import { AstryxProvider } from "@/components/astryx-provider";
 import { Toaster } from "@/components/ui/sonner";
+import { UndoToast } from "@/components/control/undo-toast";
 import { TooltipProvider } from "@/components/ui/tooltip";
 import { isLocale, locales } from "@/i18n/routing";
 
@@ -60,6 +61,7 @@ export default async function LocaleLayout({ children, params }: Props) {
             <AstryxProvider locale={locale}>
               <TooltipProvider>{children}</TooltipProvider>
               <Toaster />
+              <UndoToast />
             </AstryxProvider>
           </NextIntlClientProvider>
         </Suspense>
```

Exactly one mount. No list renders a toast.

### 1.3 Client hub: replace the inline archive button with the shared control

```diff
diff --git a/apps/web/components/clients/client-detail.tsx b/apps/web/components/clients/client-detail.tsx
--- a/apps/web/components/clients/client-detail.tsx
+++ b/apps/web/components/clients/client-detail.tsx
@@ -17,8 +17,7 @@ import { EmptyState } from '@/src/components/shell/empty-state';
 import { AssignPlanButton } from './assign-plan-dialog';
 import { ClientForm } from './client-form';
 import { ClientStatus } from './client-list';
-import { useMutation } from './use-mutation';
-import { useRouter } from '@/i18n/navigation';
+import { ArchiveRowControl } from '@/components/control/archive-controls';
 
 export const HUB_TABS = ['week', 'plan', 'money', 'notes'] as const;
 export type HubTab = (typeof HUB_TABS)[number];
@@ -57,17 +56,11 @@ type ClientDetailProps = {
 export function ClientDetail({ client, access, initialTab = 'week', timeline, program, nutrition, reviewCard, activityLog }: ClientDetailProps) {
   const t = useTranslations('clients');
   const locale = useLocale() === 'ar' ? 'ar' : 'en';
-  const router = useRouter();
-  const mutation = useMutation();
   const id = useId();
   const tabs = HUB_TABS.filter(value => value !== 'money' || access.viewMoney);
   const [tab, setTab] = useState<HubTab>(tabs.includes(initialTab) ? initialTab : 'week');
   const canAssignProgram = access.assignProgram && client.status !== 'archived';
   const canAssignNutrition = access.assignNutrition && client.status !== 'archived';
-  async function archive() {
-    const result = await mutation.send(`/api/v1/clients/${client.id}/${client.status === 'archived' ? 'unarchive' : 'archive'}`, 'POST');
-    if (result !== undefined) router.refresh();
-  }
   const programAction = <AssignPlanButton kind="program" clientId={client.id} hasCurrent={program !== null} canPublish={access.publishProgram} variant="primary" />;
   const nutritionAction = <AssignPlanButton kind="nutrition" clientId={client.id} hasCurrent={nutrition !== null} canPublish={access.publishNutrition} />;
   const panel = (value: HubTab, children: React.ReactNode) => tab === value
@@ -78,9 +71,9 @@ export function ClientDetail({ client, access, initialTab = 'week', timeline, pr
       <ClientStatus value={client.status} />
       {canAssignProgram && !(tab === 'plan' && access.viewProgram) ? programAction : null}
       {canAssignNutrition && !(tab === 'plan' && access.viewNutrition) ? nutritionAction : null}
-      {access.edit ? <Button variant="secondary" className="min-h-11" isDisabled={mutation.pending} onClick={archive} label={t(client.status === 'archived' ? 'unarchive' : 'archive')} /> : null}
+      <ArchiveRowControl entity="clients" id={client.id} archived={client.status === 'archived'} canEdit={access.edit}
+        itemLabel={client.displayName || [client.firstName, client.lastName].filter(Boolean).join(' ')} />
     </HStack>
-    {mutation.error ? <Text type="supporting" as="p" display="block" role="alert" className="!text-destructive">{t(`errors.${mutation.error}`)}</Text> : null}
     <VStack gap={4} className="min-w-0">
       <TabList role="tablist" value={tab} onChange={value => setTab(value as HubTab)} className="min-w-0 max-w-full" hasDivider>
         {tabs.map(value => <Tab key={value} id={`${id}-${value}-tab`} value={value} panelId={`${id}-${value}-panel`} className="min-h-11 whitespace-normal" onFocus={() => setTab(value)} label={t(`tabs.${value}`)} />)}
```

The `Text` import stays (used elsewhere in the file). `reviewCard`, `activityLog` and all tabs are untouched.

### 1.4 Nutrition builder: replace only the archive/unarchive PATCH button

```diff
diff --git a/apps/web/components/nutrition/builder.tsx b/apps/web/components/nutrition/builder.tsx
--- a/apps/web/components/nutrition/builder.tsx
+++ b/apps/web/components/nutrition/builder.tsx
@@ -23,6 +23,7 @@ import { MealEditor } from './meal-editor';
 import { SupplementList } from './supplement-list';
 import { NutritionRequestError, nutritionRequest } from './transport';
 import type { NutritionDetail, NutritionGrants } from './types';
+import { ArchiveRowControl } from '@/components/control/archive-controls';
 
 /** Task 6: atomic document editing with serial debounced saves and explicit immutable-version drafts. */
 export function NutritionBuilder({ initial, grants }: { initial: NutritionDetail; grants: NutritionGrants }) {
@@ -68,7 +69,7 @@ export function NutritionBuilder({ initial, grants }: { initial: NutritionDetail
   return <VStack gap={5} className="min-w-0 max-w-full pb-28 [overflow-wrap:anywhere]"><HStack gap={3} wrap="wrap"><Link className="inline-flex min-h-11 items-center underline" href={`/coach/nutrition/${id}/history`}>{t('history.title')}</Link><Link className="inline-flex min-h-11 items-center underline" href={`/coach/nutrition/${id}/assign`}>{t('assign.title')}</Link><Button className="min-h-11" variant="secondary" isDisabled={!grants.create || busy || dirty} onClick={async () => { try { const copy = await nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}/duplicate`, { method: 'POST' }); router.push(`/coach/nutrition/${copy.head.id}`); } catch (e) { fail(e); } }} label={t('builder.duplicate')} /></HStack>
     {readOnly && <Card padding={4}><VStack gap={0}><Text as="p">{t('builder.readOnly')}</Text>{grants.edit && !stale && <Button variant="primary" className="mt-2 min-h-11" isDisabled={busy} onClick={() => void createDraft()} label={t('builder.newDraft')} />}</VStack></Card>}
     {error && <Text as="p" role="alert" className="rounded-xl border border-destructive p-3">{error}</Text>}
-    <details><summary className="min-h-11 cursor-pointer py-3">{t('builder.metadata')}</summary><VStack gap={3}><BilingualField label={t('common.name')} value={name} disabled={!grants.edit} onChange={setName} /><TextInput label={t('builder.tags')} containerClassName="min-w-0" controlClassName="min-h-11" isDisabled={!grants.edit} value={tags} onChange={(_, e) => setTags(e.target.value)} /><Button variant="primary" className="min-h-11" isDisabled={!grants.edit || busy} onClick={async () => { try { await nutritionRequest(`/api/v1/nutrition/${id}`, { method: 'PATCH', body: { name, tags: tags.split(',').map(s => s.trim()).filter(Boolean) } }); } catch (e) { fail(e); } }} label={t('common.save')} /><Button className="min-h-11" variant="secondary" isDisabled={!grants.edit || busy} onClick={async () => { try { const response = await nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}`, { method: 'PATCH', body: { archived: !saved.head.archivedAt } }); setSaved(response); savedRef.current = response; } catch (e) { fail(e); } }} label={saved.head.archivedAt ? t('builder.unarchive') : t('builder.archive')} /></VStack></details>
+    <details><summary className="min-h-11 cursor-pointer py-3">{t('builder.metadata')}</summary><VStack gap={3}><BilingualField label={t('common.name')} value={name} disabled={!grants.edit} onChange={setName} /><TextInput label={t('builder.tags')} containerClassName="min-w-0" controlClassName="min-h-11" isDisabled={!grants.edit} value={tags} onChange={(_, e) => setTags(e.target.value)} /><Button variant="primary" className="min-h-11" isDisabled={!grants.edit || busy} onClick={async () => { try { await nutritionRequest(`/api/v1/nutrition/${id}`, { method: 'PATCH', body: { name, tags: tags.split(',').map(s => s.trim()).filter(Boolean) } }); } catch (e) { fail(e); } }} label={t('common.save')} /><ArchiveRowControl entity="nutrition" id={id} archived={Boolean(saved.head.archivedAt)} canEdit={grants.edit} itemLabel={foodText(saved.head.name, locale)} onChanged={() => { void nutritionRequest<NutritionDetail>(`/api/v1/nutrition/${id}`).then(response => { setSaved(response); savedRef.current = response; }).catch(fail); }} /></VStack></details>
     <Targets value={document.targets} disabled={readOnly} onChange={targets => edit(copy => { copy.targets = targets; })} />
     <details><summary className="min-h-11 cursor-pointer py-3">{t('builder.dayTargets')}</summary><CheckboxInput ref={input => { if (input) input.disabled = readOnly; }} className="min-h-11" label={t('builder.dayTargets')} isDisabled={readOnly} value={!!document.dayTypes} onChange={checked => edit(copy => { if (checked) copy.dayTypes = { training: { ...copy.targets }, rest: { ...copy.targets } }; else delete copy.dayTypes; })} />{document.dayTypes && (['training', 'rest'] as const).map(kind => <VStack gap={0} key={kind}><Heading level={3}>{t(`client.${kind}`)}</Heading><Targets value={document.dayTypes![kind]} disabled={readOnly} onChange={targets => edit(copy => { if (copy.dayTypes) copy.dayTypes[kind] = targets; })} /></VStack>)}</details>
     {!document.meals.length && <NutritionEmpty action={<Button variant="primary" className="min-h-11" isDisabled={readOnly} onClick={() => setPicker({})} label={t('builder.addMeal')} />} />}
```

One addition beyond the brief's literal replacement: `onChanged` refetches the plan detail and calls `setSaved`/`savedRef`, because the
builder keeps `saved` in local state and `router.refresh()` alone would leave the label stale. The neighbouring Save metadata button and every
version control are unchanged.

## 2. Gaps in the brief's file map (needed for the explicit permission and hub-link contracts)

The brief's "Files the builder may write" does not include these two files, but two of its own rules cannot be met without them.

- Forms: `FormHubPage` passes only the kind-specific `grants.edit`. Archive and restore of every form kind are gated by `forms edit`
  (`server/archive.ts`, Errata). Also R1b's Library link `?archived=true` opens the review tab, because the tab only switches on `tab=templates`.
  `TemplateList` takes an optional `archiveCanEdit`; until this patch is applied it falls back to `grants.edit`, so the button still appears (and the
  server still decides).
- Calendar: `CalendarPage` passes no edit grant. `CalendarScreen` takes an optional `canEdit` that defaults to `true` (the previous behaviour, with the server
  enforcing `calendar edit`); this patch passes the exact grant.

```diff
diff --git a/apps/web/components/form-builder/hub-page.tsx b/apps/web/components/form-builder/hub-page.tsx
--- a/apps/web/components/form-builder/hub-page.tsx
+++ b/apps/web/components/form-builder/hub-page.tsx
@@ -1,4 +1,5 @@
 import { getTranslations } from 'next-intl/server';
+import { isAllowed } from '@dawlyy/core/authz';
 import { requirePage } from '@/src/server/auth';
 import { withAuthTx } from '@/src/server/db';
 import { listForms, listSubmissions } from '@/src/server/forms/read';
@@ -15,7 +16,7 @@ export async function FormHubPage({ formKind, search }: { formKind: FormKind; se
   const auth = await requirePage();
   const t = await getTranslations('forms');
   const grants = formPageGrants(auth, formKind);
-  const tab = firstParam(search.tab) === 'templates' ? 'templates' : 'review';
+  const tab = firstParam(search.tab) === 'templates' || firstParam(search.archived) === 'true' ? 'templates' : 'review';
   const kind = firstParam(search.kind) === 'client' ? 'client' : 'template';
   const archived = firstParam(search.archived) === 'true';
   const q = firstParam(search.q)?.slice(0, 200) ?? '';
@@ -32,7 +33,7 @@ export async function FormHubPage({ formKind, search }: { formKind: FormKind; se
     <div className="flex flex-wrap gap-2">{grants.create ? <SendFormButton formKind={formKind} templates={toJson(data.sendable)} label={t(`hub.send.${formKind}`)} /> : null}</div>
     <HubTabs formKind={formKind} active={tab} />
     {tab === 'templates' && data.page
-      ? <TemplateList key={JSON.stringify([kind, archived, q])} initial={toJson<FormPage>(data.page)} formKind={formKind} grants={grants} filters={{ kind, archived, q }} />
+      ? <TemplateList key={JSON.stringify([kind, archived, q])} initial={toJson<FormPage>(data.page)} formKind={formKind} grants={grants} archiveCanEdit={isAllowed(auth, 'forms', 'edit')} filters={{ kind, archived, q }} />
       : data.queue ? <ReviewQueue initial={toJson<Queue>(data.queue)} formKind={formKind} /> : null}
   </div>;
 }
```

```diff
diff --git a/apps/web/app/[locale]/coach/calendar/page.tsx b/apps/web/app/[locale]/coach/calendar/page.tsx
--- a/apps/web/app/[locale]/coach/calendar/page.tsx
+++ b/apps/web/app/[locale]/coach/calendar/page.tsx
@@ -2,6 +2,7 @@ import { and, asc, eq, isNull } from 'drizzle-orm';
 import { clientColumns } from '@dawlyy/db';
 import { clients, tenants } from '@dawlyy/db/schema';
 import { localDateOf, zonedDueAt } from '@dawlyy/core/schedule';
+import { isAllowed } from '@dawlyy/core/authz';
 import { requirePage } from '@/src/server/auth';
 import { withAuthTx } from '@/src/server/db';
 import { requirePermission } from '@/src/server/require-permission';
@@ -22,5 +23,5 @@ export default async function CalendarPage() {
     const rows = await tx.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, displayName: clients.displayName }).from(clients).where(and(eq(clients.tenantId, auth.tenantId), isNull(clients.archivedAt))).orderBy(asc(clients.firstName), asc(clients.id));
     return { today, timezone, clients: rows.map(row => ({ id: row.id, name: row.displayName ?? [row.firstName, row.lastName].filter(Boolean).join(' ') })), initial: { ...events, items: events.items.map(({ id, clientId, type, state, dueAt, localDate, timezone: eventZone, windowDays, title }) => ({ id, clientId, type, state, dueAt: dueAt.toISOString(), localDate, timezone: eventZone, windowDays, title })) } };
   });
-  return <CalendarScreen {...data} />;
+  return <CalendarScreen {...data} canEdit={isAllowed(auth, 'calendar', 'edit')} />;
 }
```

## 3. Contract notes for the reviewer

- Client unarchive always returns `inactive` (`setClientArchived`). The toast copy says so (`toast.archivedClient`, `toast.restoredClient`); no old status is replayed.
- Foods have no archive column and `foodListSchema` has no `archived`. `/coach/foods?archived=true` is mapped to the existing `includeHidden=true`
  (visible and hidden foods, Hidden wording kept). Food Hide/Unhide uses `POST /api/v1/foods/{id}/hide|unhide` through the shared undo control.
- System exercises: the library shows Hide/Unhide (`POST /api/v1/exercises/{id}/hide|unhide`, needs `exercises edit`); only tenant-owned exercises (`editable`) show
  Archive/Restore. The archived-only list can hold only tenant exercises. `ExerciseListItem` has no `archivedAt`, so the archived state is taken from the active filter.
- Packages: `archived=1` meant "include archived" on the server. The page now reads `archived=true` (and the legacy `1`) as the archived-only view and
  always passes `true` or `false` to `listPackages`. The package list no longer keys on its data, so a refetch does not reset selection.
- Clients: the Archived status button became the Active/Archived switch (`archived=true`, status cleared, cursor restarted). An old `?status=archived` link is
  mapped to `archived=true` by the page. The list refetches page one after each outcome and also calls `router.refresh()`; its page key no longer includes the data.
- Programs: the list refetches page one locally (no `router.refresh()`), because `programs/page.tsx` (not in this task) keys on its data and a refresh would remount the
  list and drop the bulk result panel.
- Nutrition plans: cards no longer sit inside one big `Link` (a checkbox and buttons cannot nest in a link); the plan name is the link.
- Row action placement: Archive/Restore is an inline `Button` in each row's existing action area, not a `MoreMenu`. Astryx `MoreMenu`/`DropdownMenu` render a popover that could not be
  exercised without a browser; a visible 44 px button is the safer reading until P9 proves a menu.
- Bulk assignment uses `GET /programs?kind=template&archived=false&limit=50` filtered to `publishedVersionNo != null` for the Clients list, and
  `GET /programs/{id}/assignment-clients` for the Programs list. `publish` is sent as an explicit `false` unless the coach switched it on and holds `programs publish`;
  assigning needs `programs edit` (or `publish` when publishing), the same check the route makes.

- Stale lists after Undo: the undo slot is app-wide, so each list calls `useReloadOnUndoSettle(reload)` (exported from `archive-controls.tsx`), which reloads the mounted list whenever any
  action leaves executing, undoing or committing. A list that started the action also reloads from the row's own callback, so the originating list may fetch page one twice; both reads are identical.
- The archived Active/Archived switch is a link (`aria-current="page"`) when the list is URL-backed (clients, programs, packages) and a button (`aria-pressed`) when it is in-page state.

## 4. R5 shared-token gaps (no token file was edited)

| Component | Value used now | Intended semantic token |
|---|---|---|
| `components/control/undo-toast.tsx` | `fixed inset-x-4 bottom-20 md:bottom-4 z-50 max-w-md` on an Astryx `Card` (`bottom-20` clears the fixed coach bottom bar, which is `fixed bottom-0 z-40` below `md`) | floating-surface edge offset, bottom-bar clearance, toast layer, toast max width |
| `components/control/undo-toast.tsx` | `sr-only` live region | shared visually-hidden utility |
| `components/control/archive-controls.tsx` | `!text-destructive` for the inline error | danger text colour |
| all new controls | `min-h-11 min-w-11` | minimum touch target (44 px) |
| `components/clients/client-list.tsx` | `w-14` (header checkbox column of the clients table) | table selection column width |
