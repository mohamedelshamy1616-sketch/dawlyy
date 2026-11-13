# DAWLYY UI and navigation audit against the best coaching and fitness apps, with three design directions (as of 13 Nov 2026)

Method and limits, stated once. Sources are repo files (paths relative to `C:/Users/compuline/Desktop/dawlyy`), screenshots in `docs/qa/screens/` (read as images; names cited), the five sibling notes in this folder, and the installed skills (`impeccable` SKILL.md plus `reference/craft-floor.md`; `ui-ux-pro-max` SKILL.md plus `references/pro-rules.md`; `design-md-library` DESIGN.md files under `C:/Users/compuline/.claude/design-references/awesome-design-md/design-md/`). No app was run, no web search was done, no competitor app was opened. Competitor evidence is only what the sibling notes already hold, and those notes themselves flag that Exa failed and no Google Play data exists. Screenshot facts:

- Only two widths were captured: 390 and 1366. There are no 360 or 430 captures, so the 360/430 requirement is not verifiable from screenshots (code can only be reasoned about).
- The live workout screen (`/app/workout/<id>`) and `history/<id>` were not captured. Only `/app/workout/start`, which is a transition page, exists. So the core "log a set" UI is judged from code (`set-row.tsx`, `workout-screen.tsx`) only.
- Screenshots are full-page captures. The fixed bottom tab bar therefore floats mid-image in `client-app-today-ar-390.png`, `client-app-nutrition-ar-390.png`, `client-app-program-ar-390.png`. That is a capture artefact, not a bug (client shell has `pb-28`, `client-shell.tsx:32`).
- Arabic copy is Egyptian dialect throughout. I judged layout, not translation quality.

## 1. Information architecture: every top-level destination, and taps for the top 10 jobs

### Takeaway
Coach nav is an 11-item flat list of system nouns (`nav-items.ts:31-43`); the client nav is a sound 5 tabs but hides check-ins, history, tracking, notifications and subscription behind Today cards or deep links. Several top coach jobs (assign a program to a client, see a client's week) have no entry from the place a coach naturally starts (the client page).

### Cited Findings
Destinations.
- Coach top level, 11 equal entries: dashboard, clients, programs, exercises, packages, nutrition, checkins, calendar, messages, billing, settings. Same list in the desktop sidebar (`coach-shell.tsx:16-19`, `owner-coach-ar-1366.png`) and the mobile hamburger menu (`coach-shell.tsx:22-25`, `owner-coach-ar-390.png`). The file comment itself says some routes "do not exist yet" (`nav-items.ts:30`).
- Coach routes that exist but have no nav entry: `foods`, `tasks`, `notifications`, `assessments`, `intake` (route folders in `apps/web/app/[locale]/coach/`; screenshots `owner-coach-tasks-ar-390.png`, `owner-coach-notifications-ar-390.png` exist). Grep found links only to `/coach/tasks` (dashboard `tasks-preview.tsx:21`) and from the Check-ins sub-tabs and nutrition screen (`owner-coach-checkins-ar-390.png` shows two stacked tab rows: "review queue / templates" and "start forms / assessments"). Nothing found linking to `/coach/notifications`.
- Client top level, 5 tabs: today, program, nutrition, progress, messages (`nav-items.ts:45-51`; rendered as a bottom bar on phones, `nav-links.tsx:33`, `client-shell.tsx:36-38`; header links on desktop).
- Client routes with no tab: `history`, `tracking`, `checkins`, `intake`, `assessment`, `notifications`, `subscription`, `consent` (`docs/qa/screens/index.md:213-223`). History and tracking are reached only through underlined text links at the bottom of Today (`today-cards.tsx:35,37-38`). Check-ins appear only when a check-in is due (`today-cards.tsx:33`). No link to `/app/notifications` was found by grep. A second, unused-looking client tab bar exists with a different item (tracking) at `apps/web/components/app/client-tab-bar.tsx:12`; I did not verify whether it is mounted.
- Two shell stacks coexist: coach shell, nav and EmptyState are shadcn-token Tailwind (`coach-shell.tsx`, `nav-links.tsx`), while dashboard cards, forms and portal use Astryx (`count-cards.tsx`, `program-view.tsx`). AGENTS.md says this is intentional and temporary (`apps/web/AGENTS.md`, "Astryx in DAWLYY").

Tap counts (a tap = a link/button press; "menu" = the extra tap to open the hamburger on a phone; coach routes read from code and screenshots, none walked live).

| # | Job | Path found | Taps on phone (desktop) | Evidence |
|---|---|---|---|---|
| C1 | Review this week's check-ins | menu, Check-ins (queue is default tab), "راجع" on a row | 3 (2) | `owner-coach-checkins-ar-390.png`. Alternative from Dashboard: tile "متابعات تستنى مراجعتك" then row = 2 from home, if the row links to the review (row `href` is generated server-side, not read). |
| C2 | Find who needs attention | Dashboard is the landing page; tiles give counts; tapping a tile lists rows (`?queue=<kind>`, `page.tsx:45-52`); row opens the client | 0 to see counts, 2 to reach a client | `owner-coach-ar-390.png`. Seven separate counts, no single ranked list. |
| C3 | Build or edit a program for one client | menu, Programs, program (or New), edit, then "assign" route, pick client. The client page has no programme entry: tabs are profile, package, subscription, history (`client-detail.tsx:35`) | 5 or more (4) | `client-detail.tsx:35`, `owner-coach-programs-program-assign-ar-390.png` exists. The editor page is 11,030 px tall (below). |
| C4 | Adjust a nutrition plan | menu, Nutrition, plan, edit, assign (separate route `nutrition/[planId]/assign`) | 4 or more (3) | route list; not walked. |
| C5 | Record a payment or renewal | Client page, Package tab, "sell package" button = 3 taps from client; or menu, Billing, "بيع باقة" = 3. Confirming a transfer: Billing, payment row, verify (`billing/payments/[paymentId]/page.tsx:26` `canVerify`) | 3 to 4 (2 to 3) | `owner-coach-billing-ar-390.png`: the first row is "pending confirmation" but all rows look identical, so pending is not distinguishable by sight. |
| K1 | Start today's workout | Today tab is the landing screen; one tap on "كمّل التمرين"/start (`today-cards.tsx:29`) | 1, then an automatic redirect through `/app/workout/start` | Within target (2 actions). But `start-workout.tsx:25-31` makes a network POST before the first exercise can show; the interim screen is a skeleton (`client-app-workout-start-ar-390.png`). So offline or weak-network start is not instant (see Q6). |
| K2 | Log a meal | Nutrition tab, per-meal button "كلتها" (ate it all) or "سجّل وجبة بره الخطة" | 2 | `client-app-nutrition-ar-390.png`. |
| K3 | Submit a check-in | Only if due: Today card, tap (`today-cards.tsx:33`). Otherwise no path found | 1 when due; no path when not due | Overdue/due state is text only. |
| K4 | See progress | Progress tab | 1 | `client-app-progress-ar-390.png`: one 2,910 px page mixing a weight form, measurements form, photo upload, date compare, photo gallery and log. |
| K5 | Message the coach | Messages tab, type, send | 1 + typing | `client-app-messages-ar-390.png`. |

Other facts.
- Coach dashboard has 7 equal-weight tiles from `QUEUE_KINDS` = attention, overdue_checkins, waiting_review, missing_data, expiring_subscriptions, pending_payments, adherence_decline (`apps/web/src/server/dashboard/logic.ts:2-4`), rendered by one `Grid` of identical `ClickableCard`s with a `display-2` number (`count-cards.tsx:14-23`, called from `coach/page.tsx:44`). Known defect confirmed. At 1366 the seventh tile sits alone on a second row (`owner-coach-ar-1366.png`).
- Client "History" tab says "coming soon": `client-detail.tsx:40` renders `t('history.soon')`. But a fully built timeline page exists (`owner-coach-clients-client-timeline-ar-390.png`: subscription, private coach note, messages, weights, workouts, check-in, all in one feed). No link to `timeline` or `tracking` exists anywhere in `components/clients` (grep, no matches). The best coach screen is orphaned behind a "soon" label. This extends Codex's finding.
- Program editor: `owner-coach-programs-program-ar-390.png` is 390x11,030 px and `owner-coach-programs-program-ar-1366.png` is 1366x8,282 px, so it is long on desktop too. Every set is a card with about eight labelled fields in a vertical stack (reps, load, unit, RPE/RIR, rest, tempo, note, delete) repeated per set per exercise; no grid or table.
- Today screen: a "not synced: 0 / sync now" card (offline outbox status) sits above the greeting on every client screen (`client-app-today-ar-390.png`, nutrition, program, progress, messages). About 125 of 844 px of the first viewport on every client page is spent on a status that is "0" almost always.

### Inferences
- The coach IA mirrors database entities, not coach jobs. A coach who thinks "Sara" must hop between Clients, Programs, Nutrition, Check-ins and Billing; the client page (which should be the hub) offers an edit form plus 3 near-empty tabs.
- The client IA is nearly right. It needs one tab changed (Progress absorbs history and tracking) and a permanent "check-in" and "coach" entry.

### Gaps
- Coach nav tap counts were not walked live (no running app); counts come from route code and screenshots. Whether queue rows link straight to a review page is unread (`row.href` is server-built).
- The live workout screen, history detail and mounted-ness of `client-tab-bar.tsx` were not verified.

## 2. Blunt visual audit and skill checklists

### Takeaway
The product looks like a safe default (neutral shadcn greys, one teal, rounded white cards, bordered boxes) with a good Arabic font choice and correct RTL mirroring, but with no hierarchy: seven identical metric cards, every form as a vertical stack of labelled boxes, and long pages with decimals and English leaks. The founder's "no different" comment is accurate. The Astryx theme in use is still the neutral black/grey (`apps/web/AGENTS.md`, "Brand color" bullet says the DAWLYY teal theme is not yet built).

### Cited Findings
Hierarchy and density.
- Dashboard: 7 equal tiles, each "label / huge number / hint" (`owner-coach-ar-390.png`). This is exactly the "hero-metric template" and "same-size cards of heading plus text" that impeccable's `craft-floor.md` Refuse list names. There is no sort by urgency, no names, no action; the number is the loudest thing and it is the least actionable.
- Client list (`owner-coach-clients-ar-390.png`, 1,889 px): each client is a ~170 px card with three label/value rows (code, package, days left), no photo, no last-activity, no risk. Label and value columns do not align (value sits left under a right label). Eight clients need three screens of scroll.
- Billing list (`owner-coach-billing-ar-390.png`): 10 identical rows; payment status is tiny grey text on the far edge, so "pending", "confirmed", "refunded", "rejected" look the same.
- Nutrition (`client-app-nutrition-ar-390.png`, 390x2117): the section title "خطة الأكل بتاعتك" is bigger than the page title "الوجبات" (inverted heading order); macros show decimals "2,084.9", "147.8", "245.9", "57.3" and per-meal "615.3 سعر"; the day progress is four thin grey bars with no completed state; four meals each repeat three identical chips.
- Program view (client): every exercise is a collapsible that, when expanded, prints coach note, muscles "العضلة المستهدفة · العضلة المستهدفة" (two identical generic labels, from `program-view.tsx:43` fallback `t('targetMuscles')`), and set lines in grey boxes (`client-app-program-ar-390.png`, 2,239 px). Confirmed Codex finding. There is no exercise image or video thumbnail, only a text "video" button (`program-view.tsx:41`).
- Progress (`client-app-progress-ar-390.png`): a broken image icon with alt text "صورة تقدم من" sits in the gallery; English leak "hips: 99 سم"; disabled primary buttons "احفظ المقاسات" and "احفظ الصور" shown full-width in pale teal before any input.
- Coach program editor: see Q1; at 1366 px (`owner-coach-programs-program-ar-1366.png`) the form still uses one column about 700 px wide with the week navigator left and ~40 percent of the width empty.
- Workout set row (code only, `set-row.tsx:52-66`): per set a fieldset holding prescription text, "last time" text, a 2-column grid of up to four number inputs (reps, load, RPE, RIR), a tag selector, a pain checkbox, a note field, a substitute selector, and two buttons. A 4-set exercise shows about 40 controls. Compare Q3: logging apps win on one-tap set confirmation with values prefilled.
- Workout-start screenshot marked PASS: `client-app-workout-start-ar-390.png` shows only a skeleton ("ابدأ تمرينك" heading and four pale blocks). The page is a transient redirect (`start-workout.tsx:38`). The index lists PASS for it (`docs/qa/screens/index.md:213`) and the spec loads `workout/start` in its route list (`apps/web/e2e/screens.spec.ts:38`); "completed loading" evidently accepts a skeleton. The page checks are therefore weaker than "PASS" implies. Confirmed.

Typography and Arabic.
- Fonts: IBM Plex Sans Arabic first in Arabic, Inter first in English (`apps/web/app/globals.css:194-199`). Good, legible, modern; the Arabic weight range works for headings. Weakness: the headings are the same family at heavy weight with little scale change; there is no display face with character. All text is one voice.
- Small text: hints use Astryx `supporting` and `xsm` (`count-cards.tsx:20`); in `owner-coach-ar-390.png` they render about 11-12 px, below the skill's 12px floor and the "Base 16px, Line-height 1.5" rule. Not measured from computed CSS.
- Numerals: three policies on one screen set. Western with slash dates "2026/11/12" (Today, tasks), Arabic-Indic in labels "١٤ يوم" (`owner-coach-ar-390.png` tile hints) and "١٢ نوفمبر ٢٠٢٦" (`client-app-progress-ar-390.png`), and Western prices "1,500.00 ج.م." (`owner-coach-billing-ar-390.png`). `2026/11/12` is a bidi hazard in RTL text. No user-level numeral switch exists (the MENA note asks for one, `mena_arabic_apps_user_voice.md` §6 item 14).
- Mixed direction: Latin client names "Emily Sami", "Adam Nour" next to Arabic rows align correctly (good); `hips: 99` and `kg 81` in the timeline (`owner-coach-clients-client-timeline-ar-390.png`) leak English units.

Colour, icons, spacing, empty and loading.
- Colour: neutral greys plus one teal `oklch(0.45 0.09 185)` (`globals.css:168`); status chips use stock orange, blue and yellow (task priority pills in `owner-coach-ar-390.png`, yellow "في انتظار الكوتش" in `owner-coach-checkins-ar-390.png`). There is no secondary or warm tone and no imagery. Light canvas is pure white, which is harsh and generic. The founder's "disgusting" is probably this blandness plus the form-heavy layout; I cannot verify his reasons.
- Muted text `oklch(0.556 0 0)` on white is about 4.7:1 by my estimate (not measured); on the `--muted` panel fill it will be under 4.5:1. Needs a real contrast run.
- Icons: Lucide, one stroke, consistent (`nav-items.ts`). Good. Tab icons are generic (house, dumbbell, fork, trend, chat). Brand mark is a dumbbell, the same glyph as the "Programs" icon.
- Spacing: mostly uniform 12-16 px gaps; no rhythm between groups; every page header is title plus grey subtitle.
- Empty states: shared `EmptyState` (icon, title, description). Fine but identical everywhere; "coming soon" empty state (`client-detail.tsx:40`) is the worst case.
- Loading: per-route `loading.tsx` with `PageSkeleton` exists for ~40 routes (glob). Good coverage; skeletons are flat pale-teal blocks.
- RTL: sidebar flips to the right (`owner-coach-ar-1366.png`), tab order mirrors (Today rightmost, `client-app-today-ar-390.png`), chevrons sit left in selects, logical Tailwind utilities used (`globals.css` header comment). RTL structure is sound. Not verifiable from the images: whether the logout glyph is mirrored.
- Mobile: 390 PASS on overflow for all 284 captures (`docs/qa/screens/index.md:12-298`). Not tested: 360 and 430.

Checklist, impeccable (`reference/craft-floor.md`, "Verify" then "Refuse"). Pass or fail on the shipped screens.

| Item | Result | Evidence |
|---|---|---|
| Contrast 4.5:1 body | UNKNOWN, likely marginal for muted text on panels | estimate above |
| Depth carries offset and soft blur | PASS (flat, borders only) | all screens |
| Spacing tight groups, generous separation | FAIL: uniform gaps | client list, billing |
| Type: obvious scale and weight steps | FAIL: Today and nutrition heading order inverted; one family at similar sizes | `client-app-nutrition-ar-390.png` |
| Motion: one authored moment | NOT EVIDENT (no motion in static captures; none found in code reviewed) | gap |
| States: hover, disabled, loading, error, empty | PARTIAL: loading and empty exist; disabled buttons look broken (pale full-width) | `client-app-progress-ar-390.png` |
| Browser surfaces themed (selection, caret, scrollbars) | NOT CHECKED (CSS reviewed only to line 200) | gap |
| Copy in the product's own language | PASS (dialect copy is a strength); FAIL for English leaks | timeline, progress |
| Coverage: requirements findable within seconds | FAIL for check-in, history, notifications | Q1 |
| Refuse: same-size icon/heading/text cards as structure | FAIL | dashboard |
| Refuse: hero-metric template | FAIL | dashboard |
| Refuse: kicker above heading | PASS | none seen |
| Refuse: nested cards | PARTIAL: program view puts a collapsible inside a bordered block inside a page card (`program-view.tsx:27-28`) | `client-app-program-ar-390.png` |
| Refuse: ghost card (border plus soft shadow) | PASS | flat borders |
| Refuse: system display face as display voice | PARTIAL: no display face at all | globals.css |
| Refuse: modal for non-interrupting task | NOT CHECKED | gap |
| Refuse: emoji as icons | PASS | Lucide |

Checklist, ui-ux-pro-max (priority table in SKILL.md plus `pro-rules.md`).

| Category and key check | Result | Evidence |
|---|---|---|
| 1 Accessibility: contrast 4.5:1 | UNKNOWN (see above) | |
| 1 Alt text | FAIL: gallery image shows broken icon with alt text | `client-app-progress-ar-390.png` |
| 1 Keyboard nav and focus rings | PASS in code (`.focus-ring`, 2px brand outline, `globals.css:184`, skip link `skip-link.tsx`) | |
| 1 Icon buttons have labels | PARTIAL: header sign-out is icon-only; label not checked | `owner-coach-ar-390.png` |
| 2 Touch targets 44x44 | PARTIAL: most controls use `min-h-11` (44 px) or `min-h-12`; nutrition meal chips "كلتها / كلت جزء / فوّتها" appear about 30 px high in the image (no `min-h` seen; not measured); underlined text links use `min-h-11` | `client-app-nutrition-ar-390.png`, `today-cards.tsx:37-38` |
| 2 Loading feedback | PASS (skeletons) but start page is only a skeleton | |
| 3 Reserve space, CLS | NOT MEASURED | |
| 4 Style consistent, SVG icons | PASS icons; FAIL consistency (shadcn plus Astryx mix, AGENTS.md) | |
| 5 No horizontal scroll | PASS at 390 and 1366; NOT TESTED at 360 and 430 | `index.md` |
| 6 Base 16px, line height 1.5 | UNKNOWN; hints look under 12 px | |
| 6 No gray-on-gray | PARTIAL: muted on `--muted` | |
| 7 Reduced motion | NOT CHECKED | |
| 8 Visible labels, error near field | PASS in code (labelled `NumberInput`, `role="alert"`); progressive disclosure FAIL (all fields visible at once) | `set-row.tsx`, program editor |
| 9 Bottom nav at most 5 | PASS (5) | `nav-links.tsx:33` |
| 9 Overloaded nav | FAIL (coach 11) | `nav-items.ts` |
| 9 Deep links, predictable back | PASS (real routes) | |
| pro-rules: safe-area for fixed bars | PASS (`pb-[env(safe-area-inset-bottom)]`, `client-shell.tsx:36`) | |
| pro-rules: dark-mode border and text parity | NOT CHECKED (dark tokens exist, `globals.css:107-137`; dark `--sidebar-primary` is a stock blue `oklch(0.488 0.243 264)` unrelated to the teal brand, a leftover) | |

### Inferences
- The visual problem is structural, not a font or colour problem: replacing teal with another colour would not change the verdict. The fixes that matter are hierarchy, one-job-per-screen, and a real display voice.
- Dark-mode tokens still carry shadcn defaults (blue sidebar primary), so a dark workout mode would currently look unbranded.

### Gaps
- Computed CSS (sizes, line-height, contrast) was not measured; no browser was allowed.
- Motion, reduced-motion and browser-surface theming were not audited beyond the first 200 lines of `globals.css`.
- 360 and 430 behaviour is unverified.

## 3. The 10 jobs against 2 to 3 leading apps (patterns only)

### Takeaway
Competitors that win do three things DAWLYY does not: a single prioritised "today" feed with one primary action (Oura, WHOOP), one-tap set logging with an automatic rest timer (Hevy, Strong), and a flag-only coach triage ("who needs attention") that the global coach tools do not deliver either (Reddit evidence). The coach opening is real because no evidenced platform is praised for it.

### Cited Findings
Evidence is from the sibling notes; I did not re-open the apps.
- C1, C2 (review check-ins, who needs attention): coach threads ask for "what happened with this client this week and what do I need to do next" and a flag of "two or three trend changes (missed check-ins, adherence dropping)" rather than re-reading everything weekly (`global_coach_platforms_ux_reviews.md` Q3 and Q4, Reddit 15 and 19 Aug 2026). TrueCoach ships automated compliance-risk alerts and a client list filtered by program due date (VENDOR, same note Q1). Kahunas has an AI triage and a "who needs a reply" view (VENDOR). Pattern: a ranked list with the reason for each row, not seven counters. DAWLYY has the data (`dashboardQueue`) but exposes it as counters.
- C3 (program for one client): CoachRx is praised for the fastest program build, TrueCoach for a clean programming UI, drag-and-drop, templates (`global_coach_platforms_ux_reviews.md` Q1). Coaches complain about Everfit's tiny exercise thumbnail and lost unsaved work. Pattern: dense row-per-exercise grid with sets as columns, exercise preview, and autosave. DAWLYY's editor is the opposite (one form card per set; see Q2).
- C4 (adjust a nutrition plan): ElCoach and Calo users complain the meal swap reshuffles or has no room to swap (`mena_arabic_apps_user_voice.md` §1, §6 item 3); MacroFactor splits meals into editable ingredient rows (`ai_nutrition_photo_apps.md` §1). Pattern: stable per-meal rows with coach-approved substitutes.
- C5 (payment or renewal): billing opacity is the top 1-star driver (`mena_arabic_apps_user_voice.md` §4). Pattern: one money panel per client: price, next charge, pause/cancel, one-tap confirm. DAWLYY has the pieces (subscription route per client) but scatters them across Billing, client tabs and a separate subscription route.
- K1 (start workout): Hevy is praised as "fast and intuitive, with no clutter", automatic rest timer after each logged set (`consumer_fitness_design_patterns.md` §1, §4); Strong reviewers like "simple keystrokes". Fitbod's in-workout screen is called its weakest and Caliber's complete-button/timer placement is a complaint. Pattern: pre-filled set row, one tap to confirm, rest timer starts by itself, "Start" always bottom-anchored.
- K2 (log a meal): photo-first logging is table stakes, with AI estimating and the human confirming, and independent studies show photo AI under-estimates energy by about a third (`ai_nutrition_photo_apps.md` §2). Pattern: for a coached client, "ate it all" one tap against the coach's plan plus a swap, with photo optional. DAWLYY already has "كلتها" (all), "كلت جزء" (part), "فوّتها" (skipped), which is a sound pattern wrapped in a heavy page.
- K3 (check-in): WHOOP/Oura/Gentler Streak turn a short daily self-report into a plain-language status; a hardware-free readiness check-in is a proposed adaptation with no source tested (`consumer_fitness_design_patterns.md` §5 item 28, tagged inference). Pattern: due check-in as a lead card on Today with a 3-question flow.
- K4 (progress): Oura's three tabs by time horizon, Gentler Streak's progress-as-story monthly summary. Pattern: one headline trend with the client's own baseline, forms behind an "add" sheet.
- K5 (message the coach): WHOOP keeps Coach as a persistent button in the bottom bar (The5KRunner, `consumer_fitness_design_patterns.md` §1). Arabic coach apps praise "a named human noticed me", and chat crashes are a churn reason (`mena_arabic_apps_user_voice.md` §1, §5). Pattern: coach name, photo and reply promise always visible.

### Inferences
- DAWLYY's client side already matches Hevy-class speed on tap count (K1 is 1 tap; K2 2 taps); what loses is screen weight and prominence, not step count.
- The coach side loses on steps (C3 needs 5, no hub) and on hierarchy (C2).

### Gaps
- No competitor app screen was viewed in this run; tab counts for Trainerize, Everfit, TrueCoach, Kahunas are undocumented in the sibling notes (their own gap).
- No Arabic or RTL competitor navigation evidence exists in any sibling note.

## 4. The 30 consumer patterns checked for RTL fit

### Takeaway
The note's 30 patterns were not tested in Arabic (stated by the note itself). By reasoning, 22 transfer unchanged, 6 need an RTL or Arabic adaptation, and 2 carry real risk. Reading direction, thumb zones, Arabic-Indic digits and the absence of Arabic casing are the recurring issues. This is analysis by reasoning from layout principles, not user testing.

### Cited Findings
Pattern numbers refer to `consumer_fitness_design_patterns.md` §5. Verdict key: OK = direction-neutral; ADAPT = needs a specific RTL or Arabic rule; RISK = weak or harmful without redesign.

| # | Pattern | RTL verdict | Rule |
|---|---|---|---|
| 1 | Three tabs by time horizon | ADAPT | Order mirrors: first tab sits on the right; keep "Today" rightmost as DAWLYY does today (`client-app-today-ar-390.png`). |
| 2 | Today as prioritised feed | OK | Vertical; text aligns right. |
| 3 | Scores row, tap to deep-dive | ADAPT | Row order mirrors; rings fill clockwise in LTR, so decide and keep one direction for fills and sweep animations in RTL (progress bars fill right to left). |
| 4 | Time-of-day highlight | ADAPT | Use Gulf week (Friday weekly check-in) and 12 or 24 hour as a user setting (`mena_arabic_apps_user_voice.md` §6 item 14). |
| 5 | Persistent Coach button in bar | OK | Position in the bar mirrors with the bar. |
| 6 | Coach memory | OK | |
| 7 | Personal baseline ranges | ADAPT | Range bars and sparklines: time runs right to left in an Arabic chart; do not mirror charts blindly, label axes, and keep numerals consistent. |
| 8 | Slow-metrics tab | OK | |
| 9 | Plain-language daily status | OK, strong | Plain Arabic status is a differentiator; needs native copywriting. |
| 10 | Mascot or guide | RISK | Cultural fit and gendered/modesty norms unverified; the note itself flags test. |
| 11 | Rest-aware streak | OK | Add Ramadan and travel pause [I, no user evidence]. |
| 12 | Warm, not hyped copy | OK | Dialect choice (Egyptian vs Gulf) per coach. |
| 13 | Familiar OS conventions | ADAPT | Swipe-back and sheets mirror (back is a right-edge swipe in RTL). |
| 14 | One-tap set logging, auto rest timer | OK | Numeric inputs stay LTR (digits); use `dir="ltr"` or `inputmode` fields; the weight half-kilo entry bug in FITXPERT shows decimal input is a real Arabic-locale issue (`mena_arabic_apps_user_voice.md` §1). |
| 15 | In-workout screen best screen | OK | |
| 16 | Large one-handed primary action | ADAPT | Thumb reach zones mirror for right and left hand equally; bottom-centre is the safe zone. |
| 17 | Optional social | OK, with RISK for women-only privacy [I] | |
| 18 | PR and trophies | ADAPT | Configurable Western or Arabic-Indic digits. |
| 19 | Widgets as habit anchors | ADAPT | PWA cannot ship widgets or Live Activities; platform limit [I]. |
| 20 | No paywall on own data | OK | |
| 21 | Short onboarding | OK | |
| 22 | Trainer-heavy onboarding tapers | OK | |
| 23 | Motion budget | OK | Mirror slide directions in RTL. |
| 24 | Redesign carefully | OK | |
| 25 | Light and dark parity | OK | |
| 26 | Glanceable home, max 3 | OK | |
| 27 | Discoveries (tag a habit, see effect) | OK | |
| 28 | Self-report readiness check-in | OK | |
| 29 | Quiet gym mode | OK | |
| 30 | Goal widget | ADAPT | As 19. |

Two further RTL points not in the note. (a) Arabic has no uppercase, so Nike-style uppercase display lockups do not carry over (see direction C). (b) Mixed Latin in Arabic lines (names, units, brand terms like "RPE", "kg") needs an explicit unit and direction policy; DAWLYY currently leaks "hips" and "kg" (Q2).

### Inferences
- The patterns that depend on time-direction (charts, rings, sliders, streak calendars) are where RTL mistakes will happen; nav and feeds are safe.

### Gaps
- No source tested any pattern in Arabic (the note's own gap). This table is reasoning only. A short usability test with 5 Arabic-speaking clients would settle patterns 3, 7 and 10.

## 5. Three design directions (founder decides; trade-offs only)

All three keep the existing stack (Next.js 16, Astryx, next-intl RTL), keep real routes and deep links, and keep dialect Arabic copy. Each direction needs the Astryx brand theme built through `defineTheme({ extends: neutralTheme })` as AGENTS.md prescribes, not `:root` overrides. Effort scale: S under 1 week, M 1 to 3 weeks, L over 3 weeks, for one builder; these are estimates, not measurements.

Precedents come from `design-md-library`. For each token decision I state which brand file it comes from and what reasoning I took (not the palette wholesale, as the skill requires).

Shared fixes in every direction (cheap, do regardless; this is the direction-free list):
1. Replace the 7-tile dashboard with one ranked list and reasons.
2. Link the existing timeline page into the client hub; delete the "coming soon" tab.
3. Round macros to integers, kcal to 5; one numeral policy with a per-user switch.
4. Move the sync status into the header as a dot; show a card only when pending is greater than 0.
5. Real exercise images or video thumbnails; replace "target muscle" fallback with the actual muscle or hide the line.
6. Screenshot spec: fail the PASS when a skeleton is the settled state; capture 360 and 430 and the live workout screen.

### Direction A: "Coach command inbox" (operational, dense, quiet)

- Idea: the coach app is a triage tool; the client app is the lightest possible logger. This answers the most repeated unmet coach need (who needs me, what happened this week, what next).
- Coach navigation (phone, bottom bar, 4 tabs): Inbox (ranked needs-attention list and messages and check-ins merged), Clients, Library (programs, exercises, foods, forms, packages), Money (payments, renewals). Settings and Calendar go under a profile menu. Desktop: same four in a slim rail plus a command palette (search any client or action). 11 destinations become 4.
- Coach home: Inbox. Rows are people, each with the single reason (check-in waiting 2 days, weight flat 14 days, payment pending, subscription ends in 3), a status chip and one inline action (review, nudge, confirm). Sorted by urgency. The client page becomes the hub with tabs Week (timeline), Plan (program and nutrition with an "assign" button), Money, Notes. Programs assign from here: C3 drops from 5 taps to about 3.
- Client navigation (4 tabs): Today, Plan, Coach (chat with coach name, photo, reply promise), Me (progress, history, check-ins, subscription). Check-in is a pinned Today card and also under Me.
- Client home: Today shows one lead card "today's session" with Start, then meals as three rows with one-tap "ate it", then due check-in. No tiles.
- Type and colour: Linear (`linear.app/DESIGN.md`) for the reasoning of a quiet, dense tool: single chromatic accent used only for focus and the primary action (`primary #5e6ad2`), hairline borders instead of shadows (`hairline #23252a` on dark, equivalent light values to be derived), card radius small, display weights 500-600 with measured negative tracking. DAWLYY keeps its teal as that one accent (replacing lavender), an Arabic-appropriate tracking of 0 (negative tracking harms Arabic joins; this is my inference, no source tested it). Wise (`wise/DESIGN.md`) for money rows and status colour discipline: positive `#2ead4b`, negative `#d03238`, warning `#ffd11a` used only for status, never decoration; this fixes the identical billing rows. Keep IBM Plex Sans Arabic for UI (already shipped, `globals.css:194`); add tabular numerals for money and counts.
- Motion: minimal. 120-200 ms row-resolve (a handled row collapses with an undo toast, which also closes the undo-pattern gap in `dawlyy_edit_delete_undo_audit.md`). Respect reduced motion.
- What it fixes from the audit: seven equal tiles, 11-item nav, no client hub, orphaned timeline, invisible payment status, program-assign reachability, long client list.
- Risks: looks like a tool, not a brand; the founder's "design is disgusting" may not be solved by tidiness alone; clients still see a plain app unless direction B or C ideas are added on the client side; four tabs force hard grouping choices (Library is a junk drawer if not curated).
- Effort: L for the coach side (new IA, new hub, ranking logic exists server-side so partly reuse), S to M for the client side.

### Direction B: "Calm daily-first client" (warm, personal, plain-language)

- Idea: treat the client app as a daily companion with one clear thing to do, and the coach as a visible person. Oura's and Gentler Streak's evidence: calm score-first surface, plain-language status, rest-aware streaks (`consumer_fitness_design_patterns.md` §1, §3).
- Client navigation (3 tabs): Today, Journey (program, nutrition history, progress, history), Coach. A persistent "message coach" affordance on Today, following the WHOOP bottom-bar Coach pattern.
- Client home: a single sentence of status in dialect Arabic ("النهارده تمرين خفيف، وبعده كل كويس"), then one lead card: today's session (Start), then at most two secondary cards (meals, check-in). Maximum three things (pattern 26). Streak counts planned rest days as kept; Ramadan and travel pause [I].
- Coach navigation (5 tabs): Today (ranked list, as A but gentler), Clients, Plans, Inbox, More. Coach side gets the same warm surface but stays dense in tables.
- Type and colour: Claude (`claude/DESIGN.md`): warm tinted canvas instead of pure white (`canvas #faf9f5`, `surface-soft #f5f0e8`, `ink #141413`, `muted #6c6a64`, `hairline #e6dfd8`), taking the reasoning that warmth and one accent make an interface feel authored. Its coral accent `#cc785c` is not borrowed; the DAWLYY teal stays as the one voltage. Airbnb (`airbnb/DESIGN.md`) for generous rounded cards and a single high-chroma accent carrying every primary CTA (`primary #ff385c`), `ink #222222`, `hairline #dddddd`, `surface-soft #f7f7f7`, and its modest weights; I take the "one accent carries all primary actions" rule. Type: keep IBM Plex Sans Arabic; add a display weight/size ladder (large 28 to 36 px headlines, 16 px body, 1.6 line-height for Arabic). An optional coach-branded character or illustration is risky (pattern 10); start without it.
- Motion: one authored moment per milestone (a completed week), 250-400 ms ease-out; none elsewhere; test on low-end Android because Strava users blame animation for sync trouble (`consumer_fitness_design_patterns.md` §2).
- What it fixes from the audit: Today overload and the sync card, inverted heading hierarchy, decimals (plain-language status replaces numbers), orphan check-in and history routes, "no personality".
- Risks: the weakest on the coach pain points (coach side only lightly changed); copywriting load is high and needs a native writer; "calm" can read as sparse to clients who want data; warm canvas needs dark-mode redesign; mascot risk (pattern 10).
- Effort: M for the client app (tokens, Today, nav); coach side S to M if limited to the shared theme.

### Direction C: "Bold sport editorial" (high-energy, image-led)

- Idea: make the app look like the gym brand the coach sells: large exercise imagery and video, big numerals, black and soft grey, and a dark immersive workout mode. This answers "nothing different" directly, and is the most visible change.
- Client navigation (4 tabs plus a raised centre action): Today, Plan, [Start], Progress, Chat — five slots with Start as the circular centre button (Spotify's circular play control precedent). Start is the first-class action: the "start within 2 actions" target becomes 1.
- Client home: full-bleed exercise image or short loop with the day's session name set large; below, two compact rows (meals, check-in). Workout mode is dark with one huge primary button for "set done" and a rest ring.
- Coach navigation: desktop left rail with 6 destinations (Home, Clients, Programs, Nutrition, Money, Inbox); phone bar with 4 plus More. Program editor becomes a grid (exercises as rows, sets as columns, video thumbnail left), which fixes the 11,030 px page.
- Type and colour: Nike (`nike/DESIGN.md`): `primary #111111`, `canvas #ffffff`, `soft-cloud #f5f5f5`, `hairline #cacacb`, one signal colour only for alerts (`sale #d30005`), extreme scale contrast between display and chrome; reasoning taken: chrome stays near-monochrome and all colour comes from imagery. Its uppercase Futura display lockups cannot be copied because Arabic has no uppercase (a hard limit); the substitute is weight and scale contrast in Arabic display type, which needs a licensed heavy Arabic display face chosen with the founder (a designer, so this is his domain; not selected here). Spotify (`spotify/DESIGN.md`): dark surfaces `#121212`, `#181818`, `#1f1f1f` for workout mode, pill buttons (500 to 9999 px radius) and circular controls, 50 percent radius; its single green accent maps to the DAWLYY teal as the only chromatic accent.
- Motion: the most of the three: exercise loop video, rest-ring sweep, set-complete press feedback within 80-150 ms (ui-ux-pro-max pro-rules), transitions between plan and workout. Budget for low-end Android; video must be lazy and poster-first to hold the 3 s target.
- What it fixes from the audit: bland look, no imagery, program view text wall, heavy set rows (one big confirm button), "start within 2 actions", broken-image state (poster fallback).
- Risks: depends on a real exercise media library (the coach note shows text-only cues and optional video URLs only, `program-view.tsx:41-42`), so images do not exist yet; heavy media risks the weak-network target; the founder's note (`feedback_dont_out_design_mohamed`) says he is a pro designer and AI-made editorial concepts read amateur, so this direction depends most on his hand; dark workout mode must pass contrast and outdoor glare; Arabic editorial typography is the hardest part.
- Effort: L (media pipeline, new workout mode, editor grid).

### Direction comparison (trade-offs only; no pick)

| | A Command inbox | B Calm daily | C Sport editorial |
|---|---|---|---|
| Biggest win | Coach efficiency, nav 11 to 4 | Client calm and clarity | Visible brand change, workout screen |
| Coach side change | Large | Small | Medium (editor, rail) |
| Client side change | Small to medium | Large | Large |
| Depends on assets | No | Copywriter | Exercise media, display face |
| Weak-network risk | Low | Low | Highest (media) |
| Effort | L | M | L |
| Main risk | Looks like a tool | Coach pain barely touched | Founder's hand required; media |

A and B combine well (A on the coach, B on the client); C overlaps with both on the client and conflicts with B's warm canvas. That is a note, not a recommendation.

### Targets each direction must meet (how to verify)

| Target | Current status | How each direction meets it |
|---|---|---|
| 44 px touch targets | Mostly met in code (`min-h-11`); meal chips under (not measured) | Enforce `min-h-11` as a theme default in Astryx Button and chip; add a Playwright check that fails below 44 px (spec change, not run here). |
| 4.5:1 contrast | Unknown, muted-on-panel likely under | Pick tokens by computed ratio; B's `muted #6c6a64` on `#faf9f5` and A's hairline-only separation must be measured; none measured in this run. |
| No horizontal overflow at 360, 390, 430 | 390 and 1366 pass; 360 and 430 untested | Add 360 and 430 to `screens.spec.ts`; A and B reduce risk by dropping wide tables on phones; C's grid editor needs a stacked phone layout. |
| Start a workout within 2 actions | Met (1 tap) but start page needs a network write first | A and B: keep Today lead card. C: centre Start. All: create the session optimistically from the cached program (outbox already exists, `start-workout.tsx:30`, `client-runtime.tsx`) so the workout screen opens offline. |
| Primary action visible within 3 s on a weak network | Not measured; Today data is server-fetched, then client components hydrate | All: render the lead card and Start from the server first; defer images, charts and the sync card; C must poster-first video. Must be measured on throttled network in a later run (not allowed here). |

### Inferences
- Because the same pain points hold across all three (hierarchy, orphaned screens, heavy set row, numerals), the shared-fixes list is worth doing first and is independent of the founder's pick.
- None of the three removes the shadcn/Astryx duplication; the direction should be chosen before the next Astryx migration wave, since the theme tokens are the shared dependency.

### Gaps
- No user testing; directions are proposals. No contrast, size or timing was measured. Arabic display face for C is unselected.

## 6. Verification of the Codex review items

### Takeaway
All seven Codex items reproduce, with one nuance on the PASS screenshot and one nuance on the history tab (a built timeline exists, unlinked).

### Cited Findings
- 7 equal tiles: confirmed. `QUEUE_KINDS` has 7 (`logic.ts:2-4`); `CountCards` renders them in one `Grid` of identical `ClickableCard`s (`count-cards.tsx:14-23`); `coach/page.tsx:44` calls it. Screenshots: `owner-coach-ar-390.png`, `owner-coach-ar-1366.png` (orphan seventh tile).
- 11 top-level nav: confirmed, 11 entries at `nav-items.ts:31-43`.
- Program editor tall: confirmed, 390x11,030 (`owner-coach-programs-program-ar-390.png`); also 1366x8,282 on desktop.
- Client nutrition: confirmed, 390x2,117 (`client-app-nutrition-ar-390.png`) with decimals (2,084.9; 147.8; 245.9; 57.3; 615.3).
- History tab "coming soon": confirmed at `client-detail.tsx:40`; nuance: `owner-coach-clients-client-timeline-ar-390.png` shows a built timeline that no component links to.
- Generic "target muscle": confirmed at `program-view.tsx:43` (fallback `t('targetMuscles')` when a muscle key has no translation), visible as "العضلة المستهدفة · العضلة المستهدفة" in `client-app-program-ar-390.png`.
- Workout-start marked PASS shows a skeleton: confirmed (`client-app-workout-start-ar-390.png`, `index.md:213`, `screens.spec.ts:38`); nuance: the page is a transient redirect by design (`start-workout.tsx:35-43`), so the defect is the test's "loaded" criterion plus the lack of a captured live workout screen, plus a network round trip before the first set.

### Gaps
- Line numbers for `screens.spec.ts` loading logic were not read beyond the route list at line 38; the "completed loading" check at line 95 is only a description string.
