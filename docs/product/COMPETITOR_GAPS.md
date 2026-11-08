# Competitor gaps DAWLYY must close

Source: `docs/research/reports/DAWLYY competitor teardown 2026.md` and the notes in `docs/research/research_notes/`
(Hevy, Strong, Beprime, FitXpert, Trainerize, Everfit, Kahunas). Mohamed, 8 Nov 2026: "look at every mistake and
weakness of the other apps and do it better in ours." Each row is a requirement for the build, with the build
task that owns it and the check that proves it. A row is done only when its check passes.

| # | Weakness seen in rivals | DAWLYY requirement | Owner task | Proof |
|---|---|---|---|---|
| G1 | Beprime and FitXpert coaches confirm payments by hand from WhatsApp receipts | Selling a package, recording or receiving payment, activating the client and showing the renewal date is one flow with no manual matching; every payment has a receipt number from the tenant counter | T3b | e2e: coach sells a package, client is active, renewal date shown, receipt number present |
| G2 | Duplicate and lost workouts after sync (Hevy, Strong) | Client-generated UUID per workout and per set; the server treats a repeated id as the same write (idempotent replay); the outbox flushes in the foreground | T5, T8 | test: the same set posted twice gives one row; offline log then reconnect gives no duplicates |
| G3 | Logging basics behind paywalls (routine caps, 3-month history, plate calculator on Pro) | Coached clients get unlimited routines and full history, rest timer with live plus or minus 15 s, previous values prefilled, set tags, optional RPE/RIR, pinned notes, per-exercise history | T5 | e2e: a client logs a workout with the previous values prefilled and edits the rest timer |
| G4 | No coach feedback on single sets anywhere | A coach can comment on one set; the client sees it on that set | T5, T9 | e2e: coach comment appears on the client's set |
| G5 | Nutrition is the weakest layer: no regional foods, no household measures, unreliable MyFitnessPal sync | Built-in Egyptian and Gulf food table (the 300-food seed at minimum) with household measures (cup, spoon, piece, loaf) next to grams; no third-party sync needed | T6 | test: the foods seed loads with Arabic names and household measures; diet total matches per-measure sums |
| G6 | Global tools are English-first; RTL requests ignored for years | Arabic is the default locale, RTL is correct on every screen at 360 px width with no horizontal scroll, numerals and dates follow the locale, every string is translated in `ar` and `en` | every UI task | e2e at 360 px in `ar`: `document.documentElement.scrollWidth <= innerWidth` on every route; no missing-message warnings |
| G7 | Per-client pricing and paid add-ons (nutrition, payments, branded app) frustrate coaches | Plans in the app are flat per tenant tier with nutrition, payments, check-ins and forms included; no add-on screens | T2, T11 | review of the pricing and settings screens |
| G8 | Regressions after updates (Trainerize after acquisition, Strong sign-in and freezing fixes) | Every task ships with tests; e2e smoke in `ar` and `en` runs before every commit that touches the UI in P6; large histories paginate with cursors | all, P6 | `tools/checks.json` green on the final HEAD; a client with 2,000 logged sets loads history in pages |
| G9 | Check-ins, forms and nutrition missing from Hevy Coach | Check-ins with photos and measurements, custom forms and nutrition plans in the same coach app | T7, T9, T10 | e2e: client submits a check-in, coach sees it in the inbox |
| G10 | Trust: data safety and privacy (Egypt Law 151/2020) | Tenant isolation by RLS, audit log, consent records, export and delete-my-data flows; legal pages flagged for counsel | P1, T11 | security suites and red team in P6 |

## Already seen in the running app (8 Nov 2026, dev server screenshots at 420 px)

- `/ar/login`: the login card is clipped on the right at 420 px width (RTL overflow). Fix under G6.
- `/ar` streams an empty body and redirects on the client; show a branded loading state instead of a blank page.
- `/ar/app/today` and `/ar/coach` render only a grey skeleton without a session. Expected until the dev login
  exists (P2), but the skeleton should carry the app shell (header, navigation) so the page never looks broken.
