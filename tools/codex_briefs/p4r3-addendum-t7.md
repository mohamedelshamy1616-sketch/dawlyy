

---

# ADDENDUM (11 Nov 2026, resume round 3): what already exists and what is still missing for T7

Earlier runs hit the Codex usage limit. These files are on disk and the web `tsc` was exit 0 at 04:00; read them, keep
what is correct:

- API: `apps/web/src/api/{forms,submissions}.ts` and tests `forms.test.ts`, `submissions.test.ts` (check each against the
  brief's "Tests" section and add the missing cases).
- Services: `apps/web/src/server/forms/{api-fixture,helpers,helpers.test,presentation,read,schemas,service,submissions}.ts`.
- Components (partial): `apps/web/components/form-builder/{contracts,question-editor}`, 
  `apps/web/components/form-runner/{answer-view,contracts,http,question-input,runner}`.

STILL MISSING:

1. The form builder UI proper (sections, question list, question editor for every question type, visibility rules
   editor, preview) in `apps/web/components/form-builder/`.
2. All pages, each with a `loading.tsx`. Coach (`apps/web/app/[locale]/coach/`): `intake/page.tsx`,
   `intake/[formId]/page.tsx`, `checkins/page.tsx`, `checkins/[formId]/page.tsx`,
   `checkins/review/[submissionId]/page.tsx`, `assessments/page.tsx`, `assessments/[formId]/page.tsx`,
   `assessments/review/[submissionId]/page.tsx`. Client (`apps/web/app/[locale]/app/`): `intake/page.tsx`,
   `checkins/page.tsx`, `checkins/[eventId]/page.tsx`, `assessment/page.tsx`, `assessment/[eventId]/page.tsx`.
3. Messages: `apps/web/messages/{ar,en}/forms.json` (both `{}` now). Grep `useTranslations(` across your components and
   pages to list every key; both locales identical key sets (`node apps/web/scripts/check-messages.mjs`).
4. Any missing test case from the brief's "Tests" section.

Hard reminders: every new control uses Astryx (`@astryxdesign/core/<Component>` inside `"use client"` files; read
"Astryx in DAWLYY" in `apps/web/AGENTS.md`); logical Tailwind utilities only; 360 px RTL without horizontal scroll;
next-intl for every string.
