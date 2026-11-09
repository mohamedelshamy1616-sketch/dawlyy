# DAWLYY: open product decisions

Questions for Mohamed. For each one the build took the default shown, so nothing waits on him. He can change any of
them later; the entry says what a change would touch.

Last update: 2026-11-08 06:40 (Africa/Cairo), by the setup session (Claude Opus 5.5).

| # | Question | Default taken | Source | A change would touch |
|---|---|---|---|---|
| 1 | Does the universal `update_allow` column rule bind owners too, or only staff and clients? | Keep the stricter existing behaviour (it binds owners). The triage item N20 does not mention this key. | Codex fix of the security doc, 8 Nov 04:28 (`tools/.codex-answers/20261108-042819-codex_fix_brief.log`, CX-2) | the guard trigger config and its tests |
| 2 | When a client asks to erase their data, are payment records kept (tax and accounting) or deleted? | Delete, until Egyptian counsel decides (APPROVALS.md item 7). | same Codex fix | the erasure routine and the payments retention test |
| 3 | A freeze that is not a multiple of 7 days: do weekday weigh-ins keep their weekday? (S14) | Yes: weekday cadences keep their weekday; day-count cadences shift by the freeze length. | D review, 7 Nov (STATE.md) | `packages/core` subscription and schedule |
| 4 | A retroactive freeze: what happens to an overdue check-in inside the frozen window? (S32) | The freeze endpoint cancels open rows inside the frozen window. | D review, 7 Nov (STATE.md) | the freeze endpoint |
| 5 | Can staff publish programs, verify payments, approve AI output and create clients? | Only with the matching module permission, enforced in the database (`app.has_perm`); assigned-scope staff are auto-assigned the clients they create. | security triage, 7 Nov | permission presets |
| 6 | Preview screenshots: production build or development server? | The development server under Playwright `webServer` (port 3210), because the development-only login, which the signed-in screens need, is left out of production builds by design. Production builds are still checked by `build-web` and by the test that no production build contains the dev-login route. | autopilot P2.5, 9 Nov | `apps/web/playwright.config.ts` |
