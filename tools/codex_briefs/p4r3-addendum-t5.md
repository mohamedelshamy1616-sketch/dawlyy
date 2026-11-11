

---

# ADDENDUM (11 Nov 2026, resume round 3): what already exists and what is still missing for T5

Two earlier runs hit the Codex usage limit. The next files are on disk, typecheck-clean (web `tsc` exit 0 at 04:00), and
were reviewed only by the compiler. Read them, keep what is correct, do not rewrite them without a reason:

- API: `apps/web/src/api/me.ts` (`GET /me`, `GET /me/today`, `GET /me/program`) and `apps/web/src/api/workout-sessions.ts`.
- Services: `apps/web/src/server/workout/{contracts,logic,logic.test,portal,read,write}.ts`.
- Outbox: `apps/web/src/lib/outbox/{db,flush,queue,queue.test,store}.ts`.
- Components: `apps/web/components/client-portal/*` (client-runtime, workout-screen, set-row, rest-timer, today-cards,
  program-view, exercise-history, finish-summary, runtime-mount, display.ts).

STILL MISSING, deliver all of it this run:

1. Pages under `apps/web/app/[locale]/app/`, each with a `loading.tsx`: `today/page.tsx` (replace the empty state),
   `program/page.tsx`, `workout/start/page.tsx`, `workout/[sessionId]/page.tsx`, `history/page.tsx`,
   `history/[sessionId]/page.tsx`, `history/exercise/[exerciseId]/page.tsx`; and the mount of the runtime in
   `app/[locale]/app/layout.tsx`.
2. Messages: `apps/web/messages/{ar,en}/workout.json` (both are `{}` now) and the keys the components already
   reference. Grep `useTranslations(` in your components and pages to list the namespaces and keys you use; both locales
   must have identical key sets. `node apps/web/scripts/check-messages.mjs` is what Claude will run.
3. `apps/web/public/sw.js` (hand-written, versioned, no dependency) and its registration in `client-runtime.tsx`.
4. Tests: `apps/web/src/api/me.test.ts`, `apps/web/src/api/workout-sessions.test.ts` (the DB-backed cases listed in
   "Tests" above) and, if absent, a test for the summary mapper.
5. `apps/web/e2e/offline-workout.spec.ts` and `docs/qa/ios-pwa.md`.

Hard reminders: every new control uses Astryx (`@astryxdesign/core/<Component>`, in `"use client"` files; read
"Astryx in DAWLYY" in `apps/web/AGENTS.md`); no `<div>` soup where an Astryx layout component fits; logical Tailwind
utilities only; 360 px RTL without horizontal scroll; next-intl for every string. Budget your effort so item 1 to 5 are
all delivered in this run; compact code is fine.
