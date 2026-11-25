# Polish report

Branch `polish/ui-ux`. Gates per batch: `pnpm -r typecheck` and `pnpm --filter @dawlyy/web build`, both exit 0 at the final commit. Lint, unit tests, e2e and screenshots were not run; they belong to the single final round Mohamed decided on 25 Nov 2026. Console results: not collected (no dev server was started). Before/after screenshots: none yet, for the same reason.

| Area | Routes | Change | Commit |
| --- | --- | --- | --- |
| 1 Tokens and navigation | all | Dark lime tokens (OKLCH to semantic to component), calmer tab active state, coach unread count on the client Coach tab | c2d5475 |
| 2 Today and workout | /app/today, /app/workout/[sessionId] | Primary action above the subscription banner, avatar to Me, fixed Finish footer | c2d5475 |
| 3 Coach landing and clients | /coach, /coach/clients | Queue pills, numerals. Adherence and attention sort omitted (approved) | c2d5475 |
| 4 Review and messages | /coach/checkins, /app/messages, /coach/messages | Inline feedback with Send and open next, composer tab clearance, themed unread pill | c2d5475 |
| 5 Route transitions | /app/*, /coach/* | React 19.3 `ViewTransition` in `template.tsx`, directional tab slides via `transitionTypes`, mirrored in RTL, at most 190 ms, none under reduced motion. No flag or dependency needed. Shared list/detail elements only on the review queue name | c2d5475 |
| 6 Plan, Progress, Me | /app/plan, /app/progress, /app/me | 16 px hints, split measurement rows and weight sparkline, Account and Activity groups, appearance toggle | c2d5475 |

Open: before/after visuals, 320 px to desktop visual sweep, contrast and focus checks, and all tests run in the final round. The per-audit-screen after-status is in `UX_AUDIT.md`.
