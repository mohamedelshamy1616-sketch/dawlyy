

---

# ADDENDUM (11 Nov 2026, resume round 3): what already exists and what is still missing for T6

Earlier runs hit the Codex usage limit. These files are on disk and the web `tsc` was exit 0 at 04:00; read them, keep
what is correct:

- API: `apps/web/src/api/{nutrition,foods,meal-logs}.ts` and their tests `nutrition.test.ts`, `foods.test.ts`,
  `meal-logs.test.ts` (check each against the "Tests" list of the brief and add the missing cases).
- Services: `apps/web/src/server/nutrition/{client,errors,foods,helpers,helpers.test,logs,read,schemas,service}.ts`.
- Components (partial, small): `apps/web/components/nutrition/{builder,food-picker,foods,meal-editor,measure-selector,plans,shared,supplement-list,transport,types}.ts(x)`.

STILL MISSING:

1. All pages, each with a `loading.tsx`. Coach (`apps/web/app/[locale]/coach/`): `nutrition/page.tsx`,
   `nutrition/new/page.tsx`, `nutrition/[planId]/page.tsx`, `nutrition/[planId]/history/page.tsx`,
   `nutrition/[planId]/assign/page.tsx`, `foods/page.tsx`, `foods/new/page.tsx`, `foods/[foodId]/page.tsx`.
   Client (`apps/web/app/[locale]/app/`): `nutrition/page.tsx`, `nutrition/log/page.tsx`, `nutrition/history/page.tsx`.
2. The client components the screens need that do not exist yet: client meal card, water counter, macro bar, conflict
   list, the in-page retry queue (`transport.ts` may already hold part of it).
3. Messages: `apps/web/messages/{ar,en}/nutrition.json` (both `{}` now). Grep `useTranslations(` across your components
   and pages to list every key; both locales identical key sets (`node apps/web/scripts/check-messages.mjs`).
4. Any missing test case from the brief's "Tests" section.

Hard reminders: every new control uses Astryx (`@astryxdesign/core/<Component>` inside `"use client"` files; read
"Astryx in DAWLYY" in `apps/web/AGENTS.md`); logical Tailwind utilities only; 360 px RTL without horizontal scroll;
next-intl for every string. Totals on screen come from the core nutrition functions.
