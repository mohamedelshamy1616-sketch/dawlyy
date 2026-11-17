# R4d integration notes

These patches are unapplied. Apply serially after R1b, retaining the activity namespace/settings/profile integration already present in this worktree. Do not modify the reachability test or its assertion. Next.js discovers the page route automatically; the `aiProvider` namespace remains unregistered and the route remains unreachable from shared navigation until these patches land.

Order: (1) register both catalogs, (2) add the permission-filtered Settings hub link, (3) teach both shared navigation consumers to use the new namespace, (4) add the route to the actual `COACH_PROFILE_NAV` export. No edits to existing message catalogs are required.

## 1. Catalog loaders

File: `apps/web/i18n/request.ts`. Insert each locale's loader directly after its `legal` loader.

```diff
--- a/apps/web/i18n/request.ts
+++ b/apps/web/i18n/request.ts
@@ -30,6 +30,7 @@
     inbox: () => import('../messages/ar/inbox.json'),
     settings: () => import('../messages/ar/settings.json'),
     legal: () => import('../messages/ar/legal.json'),
+    aiProvider: () => import('../messages/ar/aiProvider.json'),
     archiveControls: () => import('../messages/ar/archiveControls.json'),
     controlUndo: () => import('../messages/ar/controlUndo.json'),
     activity: () => import('../messages/ar/activity.json'),
@@ -61,6 +62,7 @@
     inbox: () => import('../messages/en/inbox.json'),
     settings: () => import('../messages/en/settings.json'),
     legal: () => import('../messages/en/legal.json'),
+    aiProvider: () => import('../messages/en/aiProvider.json'),
     archiveControls: () => import('../messages/en/archiveControls.json'),
     controlUndo: () => import('../messages/en/controlUndo.json'),
     activity: () => import('../messages/en/activity.json'),
```

## 2. Existing Settings hub

File: `apps/web/app/[locale]/coach/settings/page.tsx`. Reuse its existing `isAllowed` import. Add the translator immediately after `t`, then insert the conditional link immediately before `legalPages`.

```diff
--- a/apps/web/app/[locale]/coach/settings/page.tsx
+++ b/apps/web/app/[locale]/coach/settings/page.tsx
@@ -12,6 +12,7 @@
   setRequestLocale(locale);
   const auth = await requirePage();
   const t = await getTranslations('settings.hub');
+  const ai = await getTranslations('aiProvider');
   const activity = await getTranslations('activity');
   const item = (key: 'business' | 'team' | 'branding' | 'language' | 'legal' | 'legalPages', href: string) => ({ href, title: t(`${key}.title`), body: t(`${key}.body`) });
   const items = [
@@ -22,6 +23,7 @@
     ...(auth.role === 'owner' ? [item('legal', '/coach/settings/legal')] : []),
     ...((auth.role === 'owner' || auth.role === 'staff') && isAllowed(auth, 'clients', 'view')
       ? [{ href: '/coach/settings/activity', title: activity('title'), body: activity('subtitle') }] : []),
+    ...(isAllowed(auth, 'settings', 'view') ? [{ href: '/coach/settings/ai', title: ai('hub.title'), body: ai('hub.body') }] : []),
     item('legalPages', '/terms'),
   ];
   return <div className="grid min-w-0 max-w-full gap-6 [overflow-wrap:anywhere]"><PageHeader title={t('title')} subtitle={t('subtitle')} /><SettingsHub items={items} /></div>;
```

## 3. Namespace-aware profile and command labels

The merged R1b reachability test checks only the exports from `nav-items.ts` and `hub-links.ts`; it does not discover Settings hub links. A `COACH_PROFILE_NAV` entry is therefore required. Its consumers otherwise assume every key is in `nav.coach`, except the already-integrated activity key. Adding a route alone would produce a missing translation. Extend the same namespace-aware pattern using `aiProvider.hub.title`; do not add keys to `nav.json` or `settings.json`.

File: `apps/web/src/components/shell/profile-menu.tsx`.

```diff
--- a/apps/web/src/components/shell/profile-menu.tsx
+++ b/apps/web/src/components/shell/profile-menu.tsx
@@ -17,4 +17,5 @@
 export function ProfileMenu() {
   const t = useTranslations('nav'); const common = useTranslations('common'); const activity = useTranslations('activity');
+  const aiProvider = useTranslations('aiProvider');
   const pathname = usePathname(); const [open, setOpen] = useState(false); const id = useId();
   return <>
@@ -34,3 +35,3 @@
                 className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 hover:bg-muted aria-[current=page]:bg-brand-soft">
-                <item.Icon className="size-4 shrink-0" aria-hidden /><Text>{item.key === 'activity' ? activity('title') : t(`coach.${item.key}`)}</Text>
+                <item.Icon className="size-4 shrink-0" aria-hidden /><Text>{item.key === 'activity' ? activity('title') : item.key === 'aiProvider' ? aiProvider('hub.title') : t(`coach.${item.key}`)}</Text>
               </Link>
```

File: `apps/web/src/components/shell/command-palette.tsx`.

```diff
--- a/apps/web/src/components/shell/command-palette.tsx
+++ b/apps/web/src/components/shell/command-palette.tsx
@@ -25,4 +25,5 @@
 export function CommandPalette() {
   const t = useTranslations('nav'); const common = useTranslations('common'); const activity = useTranslations('activity'); const router = useRouter(); const id = useId();
+  const aiProvider = useTranslations('aiProvider');
   const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [active, setActive] = useState(0);
   const [clients, setClients] = useState<{ label: string; href: string }[]>([]);
@@ -56,3 +57,3 @@
   const folded = searchKey(query);
-  const results = [...(query.trim() ? clients : []), ...actions.map(item => ({ label: item.key === 'activity' ? activity('title') : item.archived ? t('archivedFor', { name: t(`coach.${item.key}`) }) : t(`coach.${item.key}`), href: item.href })).filter(item => !folded || searchKey(item.label).includes(folded))];
+  const results = [...(query.trim() ? clients : []), ...actions.map(item => ({ label: item.key === 'activity' ? activity('title') : item.key === 'aiProvider' ? aiProvider('hub.title') : item.archived ? t('archivedFor', { name: t(`coach.${item.key}`) }) : t(`coach.${item.key}`), href: item.href })).filter(item => !folded || searchKey(item.label).includes(folded))];
   const selected = Math.min(active, Math.max(0, results.length - 1));
```

## 4. Actual R1b route-reachability export

File: `apps/web/src/components/shell/nav-items.ts`, `COACH_PROFILE_NAV`. Add the translated AI settings entry after the existing activity link. The primary four-destination navigation stays intact.

```diff
--- a/apps/web/src/components/shell/nav-items.ts
+++ b/apps/web/src/components/shell/nav-items.ts
@@ -32,5 +32,6 @@
   { key: 'language', href: '/coach/settings/language', Icon: Settings },
   { key: 'legal', href: '/coach/settings/legal', Icon: Settings },
   { key: 'activity', href: '/coach/settings/activity', Icon: Settings },
+  { key: 'aiProvider', href: '/coach/settings/ai', Icon: Settings },
 ];
 
```

## Contracts and decisions

- R4b imports `AiProviderName`, `AiDraftRequest`, `AiDraftResult`, `AiProvider`, `AiProviderEnv`, `AiProviderStatus`, `AiProviderError`, `getAiProvider` and `getAiProviderStatus` from `apps/web/src/server/ai/index.ts`. Provider selection is synchronous and does not fetch. None returns R4a's template byte for byte, including flags and empty weeks. External generation remains a coach-owned untrusted draft.
- Prompt projection excludes identities, every check-in answer (including numerical answers), dates, raw input, template text, exercise names/IDs, measurement keys, flag details/categories, attention reasons and proposals. Only precomputed adherence metrics, weight/anonymous measurement deltas, PR/stall counts and quoted locale/dialect/signature phrases are sent. Signatures retain R4a's maximum of five 200-character phrases; measurement deltas are bounded to 30.
- No environment file, credentials, model ID default, database object, endpoint, account or dependency is added. Fixed provider endpoints cannot be overridden. Possession of a key establishes neither consent nor legal approval: Mohamed's later explicit activation, legal review and approved data processing remain prerequisites. The page reports the unresolved Egypt Law 151/2020 decision; it makes no legal determination.
- The cost table is copied historical report evidence read **13 Nov 2026**, not a current price quote or validated API model IDs. All nine weekly-summary rows are retained. Assumption: **6,000 input / 800 output tokens per summary; USD per 1,000 summaries**, before retries, tax, gateway funding fees and infrastructure. No meal-photo feature or price columns are added. Only the Anthropic/OpenRouter adapters are implemented; all paid use still requires Mohamed's approval.
- The erratum correctly names `apps/web/src/lib/env.ts`; it remains untouched. The brief's loader/settings patches alone cannot satisfy the actual R1b reachability assertion. The additional profile/palette namespace patches above are required to expose the new entry without modifying existing catalogs.
- All visual choices use existing shared tokens/Astryx props; no private token source is introduced. R5 owns any token changes discovered during its browser review.

## Checks and P9 ownership

The parent session runs the two permitted acceptance commands sequentially: web typecheck, then only the four new non-DB AI test files with one Vitest worker. This note does not claim browser, database, full-security-suite or Astryx-doctor proof.

### Parent verification, 17 Nov 2026

- `pnpm --filter @dawlyy/web typecheck`: final exit **0**, no TypeScript errors. The first run found two required-`children` overload errors in the new SSR test setup; passing children in the `NextIntlClientProvider` props fixed them without changing assertions.
- `pnpm --filter @dawlyy/web exec vitest run src/server/ai/config.test.ts src/server/ai/providers.test.ts src/server/ai/prompt.test.ts src/server/ai/settings-component.test.ts --maxWorkers=1`: exit **1 before discovery**, because Vite's Windows config-bundling path resolver attempts `net use` and the sandbox rejects its child spawn with `EPERM`. This is the same startup limitation recorded by R1b; it is not a test failure or a passing acceptance result.
- Supported loader/pool alternative, with the same four files and one worker: `pnpm --filter @dawlyy/web exec vitest run src/server/ai/config.test.ts src/server/ai/providers.test.ts src/server/ai/prompt.test.ts src/server/ai/settings-component.test.ts --maxWorkers=1 --configLoader native --pool threads`: exit **0**, **4 files passed, 93 tests passed, none skipped**, 13.60 seconds. Node printed a `MODULE_TYPELESS_PACKAGE_JSON` warning while natively loading the existing config. No manifest, dependency, config, scanner, guard or assertion was changed to obtain this result.
- The passing tests cover all three groups: provider/config selection and fake transport; numeric prompt privacy and flagged-request rejection; actual Astryx/next-intl server-rendered settings, locale/numeral output and historical cost rows. Every new test file blocks global `fetch` and asserts it remained uncalled; only injected fake transports return provider `Response` fixtures. No hosted request was made.
- All **five** unified patch blocks above passed a read-only `git apply --check --whitespace=error` against the actual worktree. None was applied. The final worktree contains only the **19 allowed new files**; no existing tracked file was edited and no commit was made.

The parent also fixed OpenRouter generation at `max_tokens: 1000`, matching Anthropic's limit in addition to the shared 15-second deadline and 8,000-character accepted-output limit. The shared transport helper lives in the allowed `types.ts` file, is server-only, and additionally caps the received JSON envelope at 65,536 bytes. No new helper path or package export is required.

P9 still owes: apply these patches; run the new `r4d-provider-off.spec.ts` `@ar` and `@en` cases as the seeded owner; prove the off/default configuration has no hosted/paid request; run the unchanged route-reachability check and permission tests (client and unauthorized staff cannot receive AI settings data); run Astryx doctor and Arabic/English screens at 360/390/430 and 375/1440 px, keyboard/focus/touch-target checks and console/overflow checks; run the full security gates. R4b owns inbox → review → approve and its timing evidence. This spec covers only the provider-off settings prerequisite.
