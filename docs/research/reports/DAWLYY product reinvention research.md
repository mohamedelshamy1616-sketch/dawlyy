# DAWLYY product reinvention report

*13 November 2026. Research synthesis and proposals; no implementation, spending, recruitment or external action is approved by this report.*

## Recommended differentiation thesis

**[I] Serve independent Arabic-speaking online strength and body-composition coaches managing roughly 20–100 active clients, starting in Egypt and testing the same segment in Saudi Arabia and the UAE.** The client-count range is a recruitment hypothesis.

**The promise to validate: complete a client’s weekly review at least 30% faster, while the coach controls every message and plan change.**

Build that promise around three capabilities:

1. **One review inbox:** a ranked list of clients needing attention, linked to the evidence and a complete client-week view.
2. **An Arabic review copilot:** summaries, reply drafts and proposed changes that the coach can inspect, edit, reject and approve.
3. **A coach-composed client experience:** relevant modules, quick daily logging and consistent recovery from mistakes.

Meal-photo calories should be a separate experiment supporting the third capability. Its accuracy and review workload remain unproven.

**[I] DAWLYY can become demonstrably better for this segment and workflow. The evidence cannot establish superiority over every similar app worldwide.** Arabic, AI drafting and photo logging already exist elsewhere. The opportunity is their execution together: less review work, useful local nutrition, visible human attention and dependable control.

This builds on the [Codex review, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/plans/REINVENT_CODEX_PROMPT.md>), which identifies daily coaching workflow as the strongest opportunity and treats the proposed advantages as hypotheses.

## Evidence and its limits

**[E]** identifies evidence recorded in the supplied research: repository observations, published documentation or user reports. A user report establishes that somebody reported an experience; it does not independently verify the underlying allegation. **[VENDOR]** identifies supplier-authored claims. **[I]** identifies interpretation, proposals, scoring or calculated scenarios.

The source codes used below refer to these complete notes:

| Code | Research record |
|---|---|
| G | [Global coaching platforms and reviews, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/global_coach_platforms_ux_reviews.md>) |
| C | [Consumer fitness design patterns, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/consumer_fitness_design_patterns.md>) |
| N | [AI nutrition and photo apps, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/ai_nutrition_photo_apps.md>) |
| M | [MENA Arabic apps and user voice, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/mena_arabic_apps_user_voice.md>) |
| A | [AI coach-copilot frontier, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/ai_coach_copilot_frontier.md>) |
| P | [Free and cheap AI APIs, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/free_ai_apis_vision_arabic.md>) |
| U | [DAWLYY UI and navigation audit, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/dawlyy_ui_audit_vs_best.md>) |
| R | [DAWLYY edit, delete and undo audit, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/research_notes/DAWLYY product reinvention research/dawlyy_edit_delete_undo_audit.md>) |
| B | [Competitor teardown, 7 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/research/reports/DAWLYY competitor teardown 2026.md>) |
| X | [Codex review, 13 Nov 2026](<C:/Users/compuline/Desktop/dawlyy/docs/plans/REINVENT_CODEX_PROMPT.md>) |

The following gaps materially limit the recommendation:

- **[E] No Google Play review data was collected for the reinvention research.** The older teardown contains some listing figures, which do not substitute for Android user research.
- **[E] Almost no Egyptian or Gulf coach voice was obtained.** Most coach sentiment comes from English-language trainer communities; MENA evidence is predominantly client reviews.
- **[E] No accuracy tests cover the candidate systems on Egyptian or Gulf dishes.**
- **[E] Ramadan, prayer-time and women-only feature demand is inference only.** Existing vendor features and adjacent complaints do not establish demand among DAWLYY’s intended coaches.
- **[E] No retrieved benchmark compares the candidate models on Egyptian-dialect coaching.**
- **[E] Competitor navigation was rarely inspected directly.** DAWLYY’s UI audit uses repository code and historical screenshots, not a live comparative task test.
- **[E] App Store feeds rotate.** Dates, app identity and storefront are retained below, but the research’s recent-review samples are not representative market surveys. Some stored Arabic excerpts are unreadable; this report does not reconstruct them.

Sources: G–P, their methodology and gaps; U, methodology.

## What competitors’ users praise, hate and lack

### Global coaching platforms

| Products | What users praise | What users report disliking or lacking |
|---|---|---|
| **Trainerize** | **[E]** Organization and keeping nutrition and exercise together: US App Store, 6–7 Nov 2026. | **[E]** Manual step updates despite a health connection, account switching and regressions: US, 6–8 Nov 2026. [Trainerize US feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=516851502/sortby=mostrecent/json), collected 13 Nov 2026. |
| **TrueCoach** | **[E]** A coach running 70 clients praised the programming interface, 13 May 2026. [Coach discussion](https://reddit.com/r/personaltraining/comments/1tc0k99/after_the_truecoach_outage_looking_at/). | **[E]** Lengthy weight/repetition entry, GB, 4 Oct 2026; inability to record off-program exercises, GB, 22 Sep 2026. [TrueCoach GB client feed](https://itunes.apple.com/gb/rss/customerreviews/page=1/id=1439127794/sortby=mostrecent/json). Its separate coach app also has historical chat-crash complaints: GB, 1 Sep 2025. [Connect GB feed](https://itunes.apple.com/gb/rss/customerreviews/page=1/id=1445214677/sortby=mostrecent/json). |
| **Everfit** | **[E]** Programming flexibility and responsiveness to feedback: coach app, US, 19–20 Jan 2026. | **[E]** Lost work during editing, US, 22 Apr 2026; inadequate exercise preview, US, 8 Nov 2026. [Everfit Coach US feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1485827117/sortby=mostrecent/json). A coach also requested hiding irrelevant macros, 8 Aug 2026. [Discussion](https://reddit.com/r/personaltraining/comments/1vieuas/everfit_why_macros_and_how_to_hide_them/). |
| **Kahunas** | **[E]** Strong overall preference from one returning user, GB, 24 Sep 2026. | **[E]** Incorrect food information, 2 Jun 2026, and maintenance without warning, 10 Nov 2026, both GB. [Kahunas GB feed](https://itunes.apple.com/gb/rss/customerreviews/page=1/id=1638377758/sortby=mostrecent/json). |
| **My PT Hub, PT Distinction, CoachRx** | **[E]** CoachRx programming speed, US, 9 Aug 2026; PT Distinction consolidated progress tracking in a coach discussion, 17 Jul 2026. | **[E]** My PT Hub freezes after updates, US, 5 Nov 2026; PT Distinction cancellation-charge allegations, US, 5 and 26 Sep 2026; CoachRx difficult access to features, US, 24 Sep 2026. [My PT Hub feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1473947709/sortby=mostrecent/json), [PT Distinction feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=973466681/sortby=mostrecent/json), [CoachRx feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1544150077/sortby=mostrecent/json). |
| **TrainHeroic, Hevy Coach** | **[E]** Hevy Coach simplicity, US, 18 Jul 2026. | **[E]** TrainHeroic bulk-update request, US, 26 Oct 2026; Hevy Coach dependence on the web interface, US, 17 Jun 2026. [TrainHeroic feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=955074569/sortby=mostrecent/json), [Hevy Coach feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=6502961756/sortby=mostrecent/json). |

**[E]** Coaches repeatedly describe difficulty reviewing information across a roster. An 8 Aug 2026 discussion criticizes adding AI workout builders while coaches still need their own tools to use client data. Some participants promote competing products, so their proposed solutions deserve less weight than the operational problem. [r/personaltraining discussion](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/), G Q2–Q4 and A §3.

**[I]** The strongest opening is a complete review task: identify the client, understand the week, decide, respond and finish. A summary alone leaves much of that work untouched.

### Consumer fitness apps

**[E]** Hevy users praise fast, uncluttered logging and optional social features, US App Store, 7–10 Nov 2026. Strong users praise simple entry, US, 21 Sep 2026. These are useful standards for DAWLYY’s workout screen. [Hevy feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1458862350/sortby=mostrecent/json), [Strong feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=464254577/sortby=mostrecent/json), collected 13 Nov 2026.

**[E][VENDOR]** Oura’s October 2024 redesign grouped navigation into Today, Vitals and My Health, with different time horizons. **[E]** That structure still overwhelmed one reviewer, US, 2 Nov 2026. Fewer tabs therefore do not establish clarity by themselves. [Oura design explanation](https://ouraring.com/blog/new-oura-app-experience/), [Oura US feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1043837948/sortby=mostrecent/json).

**[E]** Gentler Streak reviewers praise accommodating rest and avoiding an all-or-nothing routine, US, 10 Jul 2026. Future reviewers praise personalization and accountability, US, 23 Oct and 2 Nov 2026. [Gentler Streak feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1576857102/sortby=mostrecent/json), [Future feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1288178982/sortby=mostrecent/json).

**[I]** Transfer the useful principles: fast session entry, a clear next action, personal progress and visible coaching. Mascots, rings and social feeds remain optional hypotheses.

### AI nutrition and photo apps

**[E]** Reviewers value convenient logging and easy correction. Foodvisor users describe photo-plus-text entry and editable results, US, 8–9 Nov 2026. A Lifesum reviewer reports inaccurate results without a discoverable edit path, US, 16 Oct 2026. A YAZIO reviewer says replacing manual Quick Add with AI made entry slower, US, 24 Jul 2026. [Foodvisor feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1064020872/sortby=mostrecent/json), [Lifesum feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=286906691/sortby=mostrecent/json), [YAZIO feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=946099227/sortby=mostrecent/json).

**[E][VENDOR]** MacroFactor describes breaking a recognized meal into editable food entries and preferring verified database items. Its superiority and speed comparisons are internal vendor tests. [MacroFactor comparison](https://macrofactor.com/macrofactor-vs-cal-ai/), accessed 13 Nov 2026.

**[I]** Correction quality is a more credible advantage than promising a precise calorie number from a photograph.

### MENA Arabic apps

**[E]** ElCoach users praise proactive human follow-up, Egypt, 2 Jul 2025, and familiar Egyptian meals, Egypt, 16 Jul 2025. Other reviewers report unstable meal substitutions, Egypt, 28 Aug 2026, and limited or formulaic food options, Saudi Arabia, 20 Jul 2026. [ElCoach Egypt feed](https://itunes.apple.com/eg/rss/customerreviews/page=2/id=1431776088/sortby=mostrecent/json), [ElCoach Saudi feed](https://itunes.apple.com/sa/rss/customerreviews/page=1/id=1431776088/sortby=mostrecent/json), collected 13 Nov 2026.

**[E]** Fitstn reviewers report intake answers being ignored, Egypt, 19 Feb 2026, and delayed delivery without a welcome call, UAE, 28 Oct 2026. These are complaints about the delivered coaching service, not proof that particular software features are absent. [Fitstn Egypt feed](https://itunes.apple.com/eg/rss/customerreviews/page=1/id=6739849951/sortby=mostrecent/json), [Fitstn UAE feed](https://itunes.apple.com/ae/rss/customerreviews/page=1/id=6739849951/sortby=mostrecent/json).

**[E]** Local details matter: FITXPERT lost convenient decimal weight entry in an update, Egypt, 2 Jun 2025; GymNation reviewers request complete Arabic menus, Saudi Arabia, 5 Oct 2026, and a clock-format choice, 11 Oct 2026. Maran receives both praise for local barcodes, 10 Nov 2026, and complaints about duplicate foods with conflicting macros, 5 Aug 2026. [FITXPERT Egypt feed](https://itunes.apple.com/eg/rss/customerreviews/page=1/id=6673904408/sortby=mostrecent/json), [GymNation Saudi feed](https://itunes.apple.com/sa/rss/customerreviews/page=1/id=6759922886/sortby=mostrecent/json), [Maran Saudi feed](https://itunes.apple.com/sa/rss/customerreviews/page=1/id=1396961211/sortby=mostrecent/json).

**[I]** Arabic localization should extend through food, units, terminology, scheduling and support. A translated interface is insufficient evidence of a differentiated coaching product.

### Corrections to earlier positioning

- **[E]** The 7 Nov teardown’s limited description of Everfit nutrition is superseded by the newer vendor pages describing MacroSnap and an AI nutrition suite. [Everfit AI suite](https://everfit.io/ai-suite/), accessed 13 Nov 2026.
- **[E]** Arabic logging is already offered elsewhere, including Hevy’s Egyptian listing. Arabic alone cannot support a first-or-only claim. [Hevy Egypt listing](https://apps.apple.com/eg/app/hevy-gym-tracker-workout-log/id1458862350), B.
- **[E]** Coach approval is already an advertised AI pattern. It remains necessary, but is not exclusive to DAWLYY.
- **[I]** The newer research strengthens workflow and trust as the central thesis. It does not invalidate the older payment research, but automated gateways remain outside the current beta contract.

## The AI coach-copilot frontier

### What is already offered

| Product | Published capability | Evidence limitation |
|---|---|---|
| **Trainerize / FitMetrics** | **[E][VENDOR]** Workout drafting and coach-reviewed replies; approval is the stated default for drafted communication. | No independent outcome evidence establishes equivalent Arabic-dialect quality. [Trainerize AI explanation](https://www.trainerize.com/blog/?p=24310), 11 Sep 2026; [FitMetrics](https://www.trainerize.com/features/fitmetrics/), accessed 13 Nov 2026. |
| **Everfit** | **[E][VENDOR]** Smart Response drafts, client-data assistance and voice features. Program Copilot proposes natural-language program editing. | The reviewed Program Copilot article does not establish whether every edit receives a preview before application. [AI suite](https://everfit.io/ai-suite/), [Program Copilot help](https://help.everfit.io/en/articles/15376459-program-copilot-beta), accessed 13 Nov 2026. |
| **MacroActive** | **[E][VENDOR]** Source-tagged check-in analysis, expiring client context and versioned drafts requiring the coach to send. | A useful interaction precedent; public usage and outcome evidence are thin. [Check-In Agent](https://www.macroactive.com/1-1-check-in-agent), accessed 13 Nov 2026. |
| **Kahunas** | **[E][VENDOR]** Client triage and AI summaries. | Sources disagree about delivered depth; one linked help page was unavailable. Treat detailed capability claims as unverified. A §1; G Q1. |

**[E]** Trainer sentiment distinguishes acceptable assistance from relationship replacement. September–October 2026 comments accept summarization and drafting while objecting to unsupervised client messaging. Trainerize feature requests also describe AI changing exercises beyond the requested edit. [Trainer discussion](https://www.reddit.com/comments/1wt3c3x), [Trainerize ideas thread](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/50986720-help-shape-what-we-build-next-for-the-ai-workout-b), A §3.

### What DAWLYY should do differently

**[I]** Make the review a finite, inspectable workflow:

1. **Observe:** show dated facts, missing data and changes from the client’s own baseline.
2. **Explain:** link every material observation to the underlying check-in, session or measurement.
3. **Draft:** propose a short reply or a narrowly scoped plan change.
4. **Review:** show the exact message and changed fields; preserve unrelated content.
5. **Approve and finish:** record who approved what, against which input and plan version.

The coach should be able to reject the suggestion, complete the review manually, or disable AI for a client.

**[E]** DAWLYY’s security design already defines `ai_requests` as draft initially, restricts approval, stamps the approver and prevents runtime deletion. The build contract explicitly excludes AI from beta. [Security model §6.3](<C:/Users/compuline/Desktop/dawlyy/docs/architecture/02-database-security-model.md:1213>), [build contract](<C:/Users/compuline/Desktop/dawlyy/docs/plans/2026-11-07-dawlyy-build-plan.md>).

**[I]** Reuse that foundation. Bind approval to the exact output and relevant input versions; changed inputs, regeneration or edits must invalidate approval. Models should receive scoped data and return validated drafts without unrestricted database, publishing or messaging tools.

**[I]** Start triage with explainable rules—overdue review, missing entries, unanswered messages—before presenting a predictive churn score. Missing logging must remain distinguishable from poor adherence.

## Meal photos: useful assistance, unresolved accuracy

### What the accuracy evidence supports

**[E]** A 2025 study tested ChatGPT-4o, Claude 3.5 Sonnet and Gemini 1.5 Pro on 52 standardized photos. Energy mean absolute percentage errors were 35.8%, 35.8% and 64.2%. Larger portions increased underestimation, although aggregate mean biases differed between models. These results do not rank today’s candidate models. [Fridolfsson et al., 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/).

**[E]** A second exploratory study found strong food identification relative to portion estimation: food-identification F1 was 88.6%, and meal weight was underestimated in 76.3% of photographs. It used 38 meal photographs. [O’Hara et al., February 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11858203/).

**[E]** The research also records reporting on a 2026 conference abstract finding approximately one-third energy underestimation across four commercial apps. This is secondary reporting of preliminary research, not equivalent to a completed peer-reviewed comparison. [Healio, 4 Aug 2026](https://www.healio.com/news/primary-care/20260804/ai-photobased-calorietracking-tools-underestimate-them-by-33), N §2.

**[I]** A photo cannot establish hidden oil, recipe composition or a person’s share of a shared dish. Do not apply a blanket upward calorie adjustment to compensate.

### Proposed DAWLYY flow

**[I]**

1. Accept a photograph plus optional description.
2. Propose identifiable foods and explicitly uncertain portions.
3. Ask only useful follow-up questions: serving size, oil or ghee, sauce, and how much was eaten.
4. Calculate nutrition from traceable recipe or ingredient records.
5. Allow ingredient and portion correction, with manual entry always available.
6. Preserve provenance: photo-assisted, database, coach recipe or manual.
7. Save a corrected repeat meal so later entry can be faster.

A dish library should distinguish recipe, preparation, portion and source. One supposedly universal macro value for every koshari or kabsa would create false confidence.

**[E]** Egyptian-food coverage complaints exist, but their scale is unknown: a MyFitnessPal reviewer requested better Egyptian coverage, Egypt, 23 Aug 2024. [MyFitnessPal Egypt feed](https://itunes.apple.com/eg/rss/customerreviews/page=1/id=341232718/sortby=mostrecent/json), N §3.

**[E]** Commercial food-API pricing, caching rights, retention and local-dish coverage remain insufficiently verified. Passio, LogMeal, FatSecret, Edamam, Nutritionix and Calorie Mama are candidates for investigation, not selected suppliers. Any paid evaluation or subscription **needs the founder’s approval**. N §4; P §6.

### Resolve approval workload before launch

**[I]** Under the present contract, begin with coach-only photo drafts. Client-visible unreviewed estimates require an explicit product and security decision separating a provisional food log from advice. Nutrition targets and prescriptive changes always require coach approval.

The workload can dominate inference cost. At 1,000 clients and three photos daily, five seconds of review per photo would consume **125 hours monthly across the coaching operation**. This is an illustrative calculation, not an observed review time.

Meal photos should advance only if corrected logging is faster, local accuracy is acceptable and review work remains tolerable.

## Undo and control

### What exists, and what the audit does not establish

**[E]** R finds version restoration for programs, nutrition plans and forms, food hide/unhide, and team deactivation/reactivation. It finds no consistent application-wide undo or user-facing recovery center.

**[E]** R is an API-route audit at commit `f9d2781`. Its stronger statements need qualification: a missing dedicated archive route does not prove that an existing PATCH route cannot expose an archive field.

The binding security design already includes:

- Staff-controlled client `archived_at`.
- Exercise and food hiding.
- Append-only metric correction using `correction_of`.
- Existing audit infrastructure.
- Restricted payment edits and immutable published history.

Sources: [security model §3.3](<C:/Users/compuline/Desktop/dawlyy/docs/architecture/02-database-security-model.md:157>) and [§6.3](<C:/Users/compuline/Desktop/dawlyy/docs/architecture/02-database-security-model.md:1193>).

**[I]** Complete a permission–API–UI matrix before estimating new backend work. Separate absent behavior from existing behavior that is inaccessible or poorly wired.

### A coherent control model

| Action | Proposed recovery behavior [I] |
|---|---|
| Editing an unpublished plan | Undo/redo, autosave and recoverable drafts. |
| Retiring clients, templates or library items | Archive or hide; show dependencies; restore where permitted. |
| Changing a published plan | Create a new version, compare it and restore by creating another version. |
| Correcting weight or other append-only metrics | Add a linked correction; preserve the original. |
| Correcting meal logs or measurements | Expose supported correction paths with appropriate history and permissions. |
| Correcting money | Use permitted pending edits or documented compensating actions. A refund is a separate financial action. |
| Editing or removing messages | Preserve revision history and explain that content already seen cannot be unseen. |
| Changing client modules | Preview, apply to a defined client/package scope, and reset to defaults. |

**[I]** Interpret “add, remove or undo anything” as broad control over the coaching experience within defined permissions and history rules. It must not become arbitrary editing of financial records, consent, audit history or another client’s data.

A consistent recovery interface should explain what changed, who changed it, the effect on clients, and the available reversal.

## DAWLYY’s UI and navigation audit

### Findings supported by the repository snapshot

| Finding [E] | Consequence [I] | Evidence recorded in U |
|---|---|---|
| Eleven equal coach destinations. | Coaches must cross modules to review one person. | `apps/web/src/components/shell/nav-items.ts:31` |
| Seven similarly weighted dashboard counters; filtered queues already exist. | Counts obscure people, urgency and next actions. | `src/server/dashboard/logic.ts:2`; `count-cards.tsx:14`; coach dashboard captures. |
| Client History says “coming soon” while a separate timeline exists. | Useful implementation is difficult to discover. | `components/clients/client-detail.tsx:40`; `owner-coach-clients-client-timeline-ar-390.png`. |
| Mobile program editor capture is 390 × 11,030 px. | Repeated set forms make editing laborious. | `owner-coach-programs-program-ar-390.png`. |
| Nutrition capture is 2,117 px tall with decimal-heavy macros. | Arithmetic competes with logging and meal choices. | `client-app-nutrition-ar-390.png`. |
| Workout-start capture marked PASS contains a skeleton. | Screenshot success does not establish completed workout readiness. | `docs/qa/screens/index.md:213`; workout-start capture. |
| Zero-pending sync status occupies prominent space. | Rarely actionable status displaces the main task. | Client Today and nutrition captures. |
| Generic muscle fallbacks and English unit leaks remain. | Translation-key completeness does not ensure meaningful Arabic content. | `program-view.tsx:43`; progress and timeline captures. |

**[E]** The existing client navigation has five tabs, and starting today’s workout is already one deliberate tap before the network request. Do not claim that a new central Start button reduces a demonstrated multi-tap problem. The unresolved issues are readiness, offline startup and workout-screen usability. U §1–§2.

**[E]** Captures cover 390 px and 1366 px. They do not establish behavior at 360 or 430 px. The live workout screen was not captured; contrast, timing and control sizes were not measured comprehensively. U, methodology and gaps.

### Three design directions

All three are proposals **[I]**. Precedents below are the references documented in U, rather than newly observed competitor screens. Effort uses U’s estimates for one builder: **S under one week; M one–three weeks; L over three weeks**. These are not delivery commitments.

| | A — Coach command inbox | B — Calm daily companion | C — Sport editorial |
|---|---|---|---|
| Main emphasis | Efficient professional review. | A clear, personal client day. | Distinctive training identity and an immersive session screen. |
| Coach navigation | Inbox, Clients, Library, Money; secondary destinations grouped. | Today, Clients, Plans, Inbox, More. | Six desktop destinations; four phone destinations plus More. |
| Client navigation | Today, Plan, Coach, Me. | Today, Journey, Coach. | Today, Plan, Start, Progress, Chat. |
| Main layouts | Ranked rows, contextual actions, client-week hub. | One lead task, at most two secondary priorities, plain-language status. | Exercise imagery, strong type scale, compact editor and dark workout mode. |
| Precedents in U | Linear’s restrained tool density; Wise’s money/status discipline. | Oura and Gentler Streak hierarchy; Claude/Airbnb reference principles for warmth and primary actions. | Nike’s scale contrast and imagery; Spotify’s dark surfaces and central controls. |
| Trade-off | Strong operational clarity; may feel visually restrained. | Strong client clarity; needs a separate substantial coach-workflow specification. | Strong visible change; media and Arabic display typography add work. |
| Main dependency | Correct grouping and review workflow. | Sustained native Arabic copywriting. | Exercise media, performance discipline and founder-led typography. |
| Estimated effort | Coach L; client S–M. | Client M; coach S–M for limited changes. | L. |
| Main risk | Library becomes an unstructured collection. | Calm becomes sparse or hides useful depth. | Media harms weak-network use; visual ambition overwhelms logging. |

**[I]** A addresses the selected operational promise most directly; B and C can support it if their coach workflows receive equivalent attention. This does not select the visual direction. Mohamed should choose after reviewing the same populated tasks in each direction.

**[E]** U records Astryx as the incumbent system, with a temporary mixed shell. Its directions retain the existing stack and prescribe an Astryx theme rather than introducing another component system. U §1 and §5.

Paid media, a licensed display face or commissioned assets **need the founder’s approval**.

### Fixes worth doing whichever direction is chosen

**[I]**

1. Link the existing timeline and contextual plan actions into the client workspace.
2. Surface a ranked queue using existing dashboard data.
3. Show prominent sync status when something needs attention; retain visible unsent counts.
4. Simplify macro presentation and establish one coherent numeral, date and unit policy.
5. Correct semantic translation fallbacks and broken-image behavior.
6. Make check-ins, history and notifications discoverable.
7. Reduce repeated program/set controls through focused editing and progressive disclosure.
8. Capture real workout states and test completed tasks, interruption and recovery.

Freeze measurable targets from X: workout start/resume within two deliberate actions; no horizontal page overflow at 360/390/430 px; 44 × 44 CSS-pixel touch targets; normal-text contrast at least 4.5:1; and critical tasks usable without color or animation. The proposed weak-network readiness target is three seconds median over five documented cold runs.

## AI APIs, costs and data policies

### Free access is useful for evaluation, with limits

**[E]** These are the 13 Nov research snapshot, supplemented by targeted official-document checks. They are not account-specific capacity guarantees.

| Provider | Free/cheap access recorded in P | Limit or unresolved issue |
|---|---|---|
| **OpenRouter** | Free image models; 20 requests/minute and 50/day without the qualifying purchase history. | The 1,000/day tier requires at least $10 purchased credits: **needs the founder’s approval**. Upstream policy varies. [Limits](https://openrouter.ai/docs/api-reference/limits), [model catalog](https://openrouter.ai/api/v1/models). |
| **Gemini** | Free Flash/Flash-Lite access. | **Unusable for DAWLYY client data under unpaid-service terms.** Numeric free quotas were not established in the notes. [Pricing](https://aistudio.google.com/docs/pricing), [terms](https://aistudio.google.com/docs/terms). |
| **Cloudflare Workers AI** | 10,000 neurons/day at no charge; paid usage thereafter. | Shared allowance across workloads; endpoint terms, processing locations and health-data suitability still require review. [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Paid usage **needs the founder’s approval**. |
| **Groq** | Vision and transcription candidates. | The captured quota table describes Developer-plan limits; the research does not establish corresponding free-plan access. [Vision](https://console.groq.com/docs/vision), [limits](https://console.groq.com/docs/rate-limits). |
| **Cerebras** | Qwen vision trial: five requests/minute, two images/request and a 10 MiB request limit. | Trial capacity is not a production commitment; data policy remains unresolved. [Limits](https://inference-docs.cerebras.ai/support/rate-limits). |
| **Mistral** | Experiment tier. | Training-use accounts conflict; current numeric limits were not verified. P §1–§2. |
| **NVIDIA** | Trial access discussed in community sources. | Quotas and production rights were not established from official terms. P §1. |
| **Hugging Face** | The captured pricing page gives free users no monthly inference credits. | Provider and endpoint terms vary. Paid credits **need the founder’s approval**. [Pricing](https://huggingface.co/docs/inference-providers/pricing). |
| **Together** | Paid vision and transcription candidates; no verified free entitlement. | Data terms remain unresolved. Paid use **needs the founder’s approval**. [Pricing](https://www.together.ai/pricing). |
| **GitHub Models** | **Retired on 30 July 2026.** | Remove it from the candidate list. [Official retirement notice](https://docs.github.com/en/github-models), checked 13 Nov 2026. |

**[I]** Use synthetic, non-personal fixtures for free-tier exploration. Do not treat consent as permission to disregard a provider’s prohibition on sensitive uploads.

### Required data-policy controls

- **[E] Gemini unpaid services:** Google permits product-improvement use and human review, and instructs users not to submit sensitive, confidential or personal information. Paid standard service has different terms; paid status alone should not be assumed sufficient for every offering. [Gemini terms](https://aistudio.google.com/docs/terms), checked 13 Nov 2026.
- **[E] OpenRouter:** routing supports `data_collection: "deny"`, `allow_fallbacks: false`, provider allowlists and a separate `zdr` restriction. These are distinct controls. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), checked 13 Nov 2026.
- **[I] DAWLYY’s OpenRouter minimum:** require `data_collection: "deny"` and `allow_fallbacks: false`; pin approved providers and require ZDR where the agreed policy demands it. If none qualifies, fail into the manual workflow.
- **[E] Cloudflare:** states no model training on customer content and limited retention for ordinary stateless inference, with stateful-feature and security/legal exceptions. [Workers AI data policy](https://developers.cloudflare.com/workers-ai/platform/data-usage/), checked 13 Nov 2026.
- **[E] Groq:** documents default non-retention and a ZDR control, with exceptions described in its policy. This does not establish suitability for DAWLYY’s processing chain. [Your data](https://console.groq.com/docs/your-data), P §2.
- **[E]** The supplied research did not complete Anthropic/OpenAI retention, regional availability and contractual review. A low token price does not close those gaps. P §2 and §6.

### Inference costs per 1,000 items

**[I] Assumptions:** each photo request uses 1,700 input and 400 output tokens; each weekly summary uses 6,000 input and 800 output tokens. The photo allowance comes from the notes’ 1,000 × 1,000 image example plus a prompt. Equivalent image tokenization across providers is unverified.

Prices are USD, without cache/batch discounts, retries, additional reasoning, gateway funding fees, tax or infrastructure. Published rates are **[E][VENDOR]**; calculated request costs are **[I]**.

| Model/endpoint | Input/output per million tokens | 1,000 photos | 1,000 summaries | Approval |
|---|---:|---:|---:|---|
| Claude Haiku 5.5, prompts ≤100k | $0.10 / $0.50 | $0.37 | $1.00 | **needs the founder’s approval** |
| GPT-6 Luna, standard short context | $0.10 / $0.50 | $0.37 | $1.00 | **needs the founder’s approval** |
| Gemma 4 26B-A4B, OpenRouter paid | $0.09 / $0.30 | $0.27 | $0.78 | **needs the founder’s approval** |
| Gemma 4 31B, OpenRouter paid | $0.20 / $0.40 | $0.50 | $1.52 | **needs the founder’s approval** |
| Mistral Small 2603, OpenRouter paid | $0.15 / $0.60 | $0.50 | $1.38 | **needs the founder’s approval** |
| Gemini 3.5 Flash-Lite, paid standard | $0.30 / $2.50 | $1.51 | $3.80 | **needs the founder’s approval** |
| Gemini 3.8 Flash, through Dec 2026 | $0.75 / $3.75 | $2.78 | $7.50 | **needs the founder’s approval** |
| Gemini 3.8 Flash, from Jan 2027 | $1.50 / $7.50 | $5.55 | $15.00 | **needs the founder’s approval** |
| Cloudflare Gemma 4 26B-A4B | Neuron-based | $0.29 | $0.84 | **needs the founder’s approval** |

Sources, read 13 Nov 2026: [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), [official OpenAI pricing](https://developers.openai.com/api/docs/pricing), [OpenRouter catalog](https://openrouter.ai/api/v1/models), [Gemini pricing](https://aistudio.google.com/docs/pricing), [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/). Cloudflare calculations use P’s documented neuron rates and exclude the free allowance.

### Monthly scale scenarios

**[I]** Assume 30 days, three photos per client daily and 52/12 weekly summaries monthly. Calculations use unrounded request costs; these are workloads, not forecasts.

| Clients | Photos/month | Summaries/month, approximately | Haiku 5.5 or GPT-6 Luna | Gemini 3.5 Flash-Lite | Gemini 3.8 Flash, Jan 2027 rates |
|---:|---:|---:|---:|---:|---:|
| 100 | 9,000 | 433 | $3.76 | $15.24 | $56.45 |
| 1,000 | 90,000 | 4,333 | $37.63 | $152.37 | $564.50 |
| 10,000 | 900,000 | 43,333 | $376.33 | $1,523.67 | $5,645.00 |

**Every paid scenario needs the founder’s approval.** These figures exclude storage, egress, hosting, observability, support and human review.

**[I]** The notes’ “few hundred dollars” conclusion applies to the cheapest modeled path, not every candidate. Measure cost per accepted result, including corrections and review time.

### Arabic speech

**[E][VENDOR]** Cohere’s own July 2026 evaluation reports Egyptian word error rates of 16.24% for Transcribe Arabic and 30.60% for Whisper large-v3. These are vendor results on its test set, not DAWLYY coaching measurements. [Cohere Arabic release](https://huggingface.co/blog/CohereLabs/cohere-transcribe-arabic-07-2026-release).

| Candidate | Estimated cost per 1,000 audio minutes | Qualification |
|---|---:|---|
| Cloudflare Whisper large-v3-turbo | About $0.51 | **[I]** Calculated from neuron pricing; paid use **needs the founder’s approval**. |
| Together Whisper large-v3 | $1.50 | **[E][VENDOR]** Listed rate in P; paid use **needs the founder’s approval**. |
| Groq Whisper | Unsettled | Free-plan entitlement and paid pricing were not established. |
| Cohere Transcribe Arabic | Unsettled | Hosting/API cost and terms require verification; any paid use **needs the founder’s approval**. |

Sources: [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Together pricing](https://www.together.ai/pricing), P §5, accessed 13 Nov 2026.

**[I]** Voice-to-edit should show the transcript first, then a structured diff. Confirm names, units, quantities and negation before applying changes.

### Provider recommendation

**[I]** Shortlist Haiku 5.5 and GPT-6 Luna as low-cost baselines, with Cloudflare Gemma and paid-standard Gemini as alternatives. No production winner is established.

Select by dialect quality, local-food correction effort, latency, permitted processing and accepted-result cost. The local `freellmapi` router remains a synthetic-data development facility, not a production dependency. X; P §6.

## Scored idea bank

**[I] All scores are judgments, not measured demand.** Each criterion is 1–5; higher is better.

\[
\text{Total}=0.25P+0.20B+0.15L+0.15W+0.10C+0.10F+0.05D
\]

P = pain; B = benefit; L = local relevance; W = willingness to pay; C = confidence; F = feasibility; D = defensibility.

Willingness-to-pay scores are capped at **2** because local coach purchasing evidence is absent. A 1 means no useful evidence; 2 means adjacent spending or demand signals. Confidence concerns the documented problem, not proven Egyptian/Gulf demand. **[E/I]** means an evidenced problem with a proposed solution.

| ID | Idea | P | B | L | W | C | F | D | Total /5 | Evidence basis |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Ranked coach review inbox | 5 | 5 | 4 | 2 | 4 | 4 | 3 | **4.10** | [E/I] G Q4; A §3; U §1 |
| 2 | **Founder:** AI client analysis and editable tips/replies | 5 | 5 | 5 | 2 | 3 | 3 | 3 | **4.05** | [E/I] A §1–§3; X |
| 3 | Client hub with linked timeline | 5 | 4 | 4 | 2 | 5 | 5 | 2 | **4.05** | [E/I] U §1; X |
| 9 | Fast offline workouts and set logging | 5 | 5 | 4 | 2 | 4 | 4 | 2 | **4.05** | [E/I] G Q4; C §1; X |
| 11 | Intake constraints visibly shape plans | 5 | 5 | 5 | 2 | 3 | 3 | 3 | **4.05** | [E/I] M §1 and §6 |
| 12 | Activation and reply-time tracking | 5 | 4 | 5 | 2 | 4 | 4 | 3 | **4.05** | [E/I] M §5–§6 |
| 13 | Clear billing, dates, pause and cancellation | 5 | 4 | 5 | 2 | 4 | 4 | 2 | **4.00** | [E/I] G Q2; M §4 |
| 8 | Correct meals, weight and measurements | 5 | 4 | 4 | 2 | 5 | 4 | 2 | **3.95** | [E/I] R; security model §3.3 |
| 21 | Visible named coach and reliable chat | 5 | 4 | 5 | 2 | 4 | 3 | 2 | **3.90** | [E/I] M §1 and §5 |
| 4 | Local recipes and household measures | 4 | 5 | 5 | 2 | 3 | 3 | 4 | **3.85** | [E/I] N §3–§5; M §3 |
| 7 | **Founder:** undo, archive, restore and activity history | 5 | 4 | 4 | 2 | 4 | 3 | 3 | **3.80** | [E/I] R; X |
| 10 | Compact program editor and draft recovery | 5 | 4 | 4 | 2 | 4 | 3 | 2 | **3.75** | [E/I] U §2; G Q2 |
| 19 | Three-priority Today and plain Arabic | 4 | 4 | 5 | 2 | 4 | 4 | 2 | **3.75** | [E/I] C §5; U §5 |
| 20 | Complete Arabic, clock and digit preferences | 4 | 4 | 5 | 2 | 4 | 4 | 2 | **3.75** | [E/I] M §3; digit preference [I] |
| 24 | Consent, approved processors and manual alternative | 5 | 4 | 5 | 1 | 4 | 3 | 2 | **3.75** | [E/I] P §2; A §4; X |
| 14 | Stable approved meal/equipment swaps | 4 | 4 | 5 | 2 | 4 | 3 | 3 | **3.70** | [E/I] M §1; G Q4 |
| 6 | **Founder:** configurable client modules and reset | 4 | 4 | 4 | 2 | 4 | 4 | 3 | **3.65** | [E/I] Everfit request, G Q2; R |
| 16 | Check-in-driven plan changes with a diff | 4 | 5 | 4 | 2 | 3 | 3 | 3 | **3.65** | [E/I] A §3, items 35–38 |
| 31 | Payment-proof and renewal exceptions | 4 | 4 | 5 | 2 | 3 | 4 | 2 | **3.65** | [E/I] B; M §4; existing beta scope |
| 15 | Previewable imports with rollback | 4 | 5 | 4 | 2 | 3 | 2 | 3 | **3.55** | [E/I] A §3; X |
| 32 | Adherence flags and renewal brief | 4 | 4 | 4 | 2 | 3 | 4 | 3 | **3.55** | [E/I] A §2–§3; outcome claims thin |
| 38 | Local AI evaluation and release checks | 4 | 4 | 5 | 1 | 3 | 3 | 4 | **3.50** | [I] P §4; X |
| 26 | Own-history access and progress recap | 4 | 4 | 4 | 1 | 4 | 4 | 2 | **3.45** | [E/I] C §3; M §5; X |
| 34 | Consolidate external messaging | 4 | 5 | 4 | 2 | 3 | 1 | 2 | **3.40** | [E/I] M §2; connector feasibility unknown |
| 5 | **Founder:** correctable meal-photo calories | 4 | 4 | 5 | 2 | 2 | 2 | 3 | **3.40** | [E/I] N §2–§5 |
| 23 | AI sources, approval binding and usage budget | 4 | 4 | 4 | 1 | 4 | 3 | 3 | **3.40** | [E/I] A §1; P §2; X |
| 37 | Honest starter tier and trial notices | 4 | 3 | 5 | 1 | 4 | 4 | 1 | **3.35** | [E/I] M §4; N §3 |
| 25 | Red-flag escalation and abstention | 4 | 5 | 4 | 1 | 2 | 2 | 2 | **3.25** | [I] A §4; reliability unproven |
| 22 | Quiet hours and notification digest | 4 | 3 | 4 | 1 | 4 | 4 | 2 | **3.25** | [E/I] M §3 |
| 17 | Arabic voice → transcript → plan diff | 3 | 4 | 5 | 2 | 2 | 2 | 3 | **3.15** | [E/I] A §1; P §5 |
| 18 | Rest-aware progress streak | 3 | 3 | 4 | 1 | 3 | 4 | 2 | **2.90** | [E/I] C §3; Arabic application untested |
| 28 | Optional Ramadan scheduling | 3 | 3 | 5 | 1 | 1 | 4 | 2 | **2.85** | [I] M §3; vendor precedent ≠ demand |
| 33 | Wearable context and native widgets | 3 | 4 | 3 | 2 | 3 | 1 | 2 | **2.80** | [E/I] C §1; M §3; platform dependencies |
| 35 | Read-only coach data assistant | 3 | 3 | 4 | 1 | 2 | 3 | 2 | **2.70** | [E/I] A §1 and §6 |
| 27 | Self-report readiness | 3 | 3 | 4 | 1 | 1 | 3 | 2 | **2.60** | [I] C §5, pattern 28 |
| 30 | Women-only routing and private groups | 3 | 3 | 4 | 1 | 1 | 2 | 2 | **2.50** | [I] M §3; no retrieved demand evidence |
| 36 | AI video form feedback | 3 | 3 | 3 | 1 | 1 | 1 | 2 | **2.25** | [E/I] A §3; request evidence, weak delivery evidence |
| 29 | Optional prayer-time quiet windows | 2 | 2 | 4 | 1 | 1 | 3 | 1 | **2.10** | [I] M §3; adjacent timing complaint only |

**[I]** The first ten rows are the highest-scoring opportunities, with ties retained. They are not a ten-feature release commitment.

Consent, permission enforcement, reliable approval and appropriate safety boundaries are prerequisites. Their scores cannot make them optional.

**[I]** The potential defensibility lies in permitted local recipe knowledge, validated Arabic workflows and consistent execution. Tenant-private messages and corrections must not silently become shared training or library data.

## Risks and legal position

### Health data and cross-border processing

**[E]** The legal sources collected in A and B describe Egypt’s Law 151/2020 as treating physical and psychological health information as sensitive and restricting cross-border transfer. They identify written-consent and regulatory requirements, but disagree on details of the Executive Regulations and transfer route. [CMS legal update](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins), [Chambers analysis](https://chambers.com/articles/a-first-look-at-egypt-s-personal-data-protection-executive-regulations), accessed in the research on 13 Nov 2026.

**[I]** Treat client injury histories, body photographs and linked coaching records as requiring sensitive-data handling pending counsel’s assessment. Removing a name does not necessarily anonymize a photograph or detailed history.

Before real records reach an AI provider, obtain advice covering:

- Controller/processor roles, licences or permits and applicable current deadlines.
- Each processing country and subprocessor, including gateways and monitoring.
- Consent, Arabic notices, withdrawal and a usable manual alternative.
- Retention, deletion, security exceptions and incident handling.
- The specific Saudi or UAE launch arrangements; neither market’s rules were sufficiently researched here.

**Legal review needs the founder’s approval.** No fee is established. Consent and a no-training statement alone do not resolve cross-border obligations.

### Advice, reliability and access

**[I]** Coach approval is a control, not proof that advice is safe. Escalation should withhold automated recommendations for out-of-scope cases such as concerning pain, medication, pregnancy, eating-disorder language and minors. A classifier must not be represented as a reliable clinical safety screen.

**[E]** The existing build contract blocks current-program access after expiry while preserving history. The MENA note’s proposal to keep plans readable after expiry would change that settled entitlement boundary. It needs an explicit product decision; it is not an ordinary UI fix. Build contract, Task 3; M §6; X.

**[I]** Other release risks include stale approvals, duplicate jobs, leaked health data in logs, offline corrections overwriting newer data, and a redesigned navigation hiding existing functions. Required mitigations belong in the selected specification, with manual fallbacks and explicit recovery.

## Customer-validation plan

This is preparation only. **Nobody is contacted.** Recruitment, recording, access to real records and any compensation need specific authorization; paid compensation **needs the founder’s approval**.

### Eight coach interviews

**[I]** Recruit four Egyptian, two Saudi and two UAE coaches in the proposed segment. Include solo coaches using messaging/spreadsheets and coaches paying for software. Record client count, service model and actual purchasing responsibility. This small purposive sample will not represent all three countries.

Use these questions before presenting the solution:

| # | Arabic question | English question |
|---:|---|---|
| 1 | عندك كام عميل أونلاين نشط دلوقتي، ومين بيقرر ويدفع مقابل أدوات الشغل؟ | How many active online clients do you have, and who chooses and pays for your tools? |
| 2 | ورّيني، بمثال مجهول الهوية، آخر مرة راجعت فيها أسبوع عميل. بدأت منين وخلصت إمتى؟ | Using an anonymized example, show your last weekly client review. Where did you start, and when did you finish? |
| 3 | فتحت كام تطبيق أو ملف؟ وإيه المعلومة اللي دورت عليها أكتر؟ | How many apps or files did you open? Which information took most effort to find? |
| 4 | إزاي بتعرف مين محتاج تدخلك النهارده؟ احكي عن آخر مرة فاتك فيها عميل محتاج متابعة. | How do you identify who needs you today? Describe the last time you missed someone needing attention. |
| 5 | آخر خطة تجاهلت تفضيل أكل أو إصابة أو مواعيد عميل، حصل فيها إيه؟ | What happened the last time a plan missed a food preference, injury or scheduling constraint? |
| 6 | آخر غلطة عملتها في خطة أو وزن أو دفعة، صلحتها إزاي؟ وإيه اللي ما قدرتش ترجعه؟ | How did you correct your last plan, weight or payment mistake? What could you not reverse? |
| 7 | هل جرّبت الذكاء الاصطناعي في المتابعة؟ ورّيني إيه اللي عدّلته، وإيه اللي ترفض إنه يتبعت للعميل. | Have you used AI in reviews? Show what you changed and what you would refuse to send. |
| 8 | لو العميل بعت صورة أكله، مين لازم يصحح المكونات والكمية؟ وقد إيه تقدر تراجع صور كل يوم؟ | If a client sends a meal photo, who should correct ingredients and portions? How much photo review can you handle daily? |
| 9 | بتدفع كام دلوقتي وبأي عملة؟ إيه اللي لازم يتحسن عشان تبدّل أداتك، وإيه أصعب حاجة في نقل العملاء؟ | What do you pay now, in which currency? What would justify switching, and what makes migration difficult? |
| 10 | بعد التجربة، هل تختار تجربة محددة المدة؟ بميزانية شهرية كام، وعلى حساب أنهي أداة؟ وإيه اللي يمنعك؟ | After testing, would you choose a time-limited pilot? At what monthly budget, replacing which tool, and what would stop you? |

**[I]** Ask about Ramadan, prayer timing and women-only requirements only after the open workflow questions. Record spontaneous mentions separately from prompted interest.

### Five timed coach task sessions

**[I]** Invite five interviewees into a later, separately authorized task study. Each completes matched baseline and prototype tasks using synthetic records:

- Identify the highest-priority client and explain why.
- Review one client’s week and produce a correct response.
- Apply one permitted plan change without changing unrelated content.
- Correct a mistaken entry and restore an archived item.
- Find a pending payment or renewal exception.

Counterbalance which interface comes first. Include reading, verification and draft correction in the measured time. A static prototype tests the interaction; it does not establish model quality.

### Five client task tests

**[I]** Recruit five Arabic-speaking clients across Egypt and the intended Gulf markets, including Android and iPhone users. **Every participant performs all five tasks.**

| Task | Exact Arabic instruction | English instruction |
|---|---|---|
| Start and log offline | افتح تمرين النهارده وسجّل أول مجموعة. بعد فصل الإنترنت سجّل مجموعتين، وبعد رجوعه تأكد إنهم اتحفظوا مرة واحدة. | Open today’s workout and log the first set. Offline, log two more; reconnect and confirm each saved once. |
| Correct a meal estimate | سجّل الوجبة التجريبية. صحّح كمية الرز، وضيف الزيت الناقص، وبعدها احفظها. | Log the sample meal. Correct the rice portion, add the missing oil and save. |
| Submit a check-in | اعرف هل عندك متابعة مستحقة، وكمّلها، وورّيني دليل إنها وصلت. | Find your due check-in, complete it and show confirmation of submission. |
| Recover from a mistake | الوزن اتسجّل غلط. صحّحه وورّيني الفرق بين القيمة القديمة والتصحيح. | Correct the mistaken weight and show the original value and its correction. |
| Find the coach and history | ابعت سؤال للكوتش، واعرف إمتى متوقع يرد، وبعدها افتح سجل تقدمك. | Message the coach, find the expected reply timing and open your progress history. |

Ask after each task:

- **Arabic:** إيه اللي توقعت يحصل؟ إيه اللي لخبطك؟ إيه اللي وثقت فيه وإيه اللي حبيت تتأكد منه؟
- **English:** What did you expect? What confused you? What did you trust, and what did you want to verify?

### Pass thresholds

**[I]** Following X’s master prompt:

- **At least four of five coaches and four of five clients complete each critical task without assistance**, with correct final data.
- **At least 30% improvement in median coach review time**, against the measured baseline: `1 − new median / baseline median`.
- No silent loss, duplication, wrong-client changes or exposure of unapproved advice.
- Workout startup, accessibility and weak-network checks meet the frozen targets.
- Treat completion and timing separately from preference or visual appeal.

**[I]** Abandon or narrow the thesis if review work is not a substantial observed problem, savings disappear after verification/editing, or coaches reject the switching burden. Positive interview language without a concrete budget or pilot commitment is insufficient.

### AI and food evaluation

**[I]** Before any paid benchmark, prepare fixtures and a spending ceiling. Paid calls **need the founder’s approval**.

Use:

- At least **100 held-out meal images**, with weighed portions or recipe references, spanning local dishes, large portions, hidden ingredients and ambiguous shared plates.
- At least **50 coaching cases**, covering Egyptian/Gulf language, Arabizi, missing or conflicting information, stale plans and unsafe requests.
- **30 speech clips** covering both dialect groups, quantities, units and negation.

Measure factual/source correctness, unsupported claims, abstention, correction time, latency and cost per accepted result. For food, report identification and calorie/portion error separately, including underestimation and error distribution.

Freeze acceptable food-error thresholds with a qualified nutrition reviewer before comparing models. Until then, meal-photo accuracy is an unresolved gate. A finite benchmark does not establish clinical safety.

## Decisions for Mohamed

1. **Design direction:** choose A, B or C, including its navigation. Select any deliberate combination explicitly.
2. **Segment and thesis:** accept or revise the proposed coach segment, the 30% faster-review target and the three core capabilities.
3. **AI scope:** decide whether to amend the beta’s AI exclusion. Confirm that replies and plan changes require approval, and decide whether provisional meal estimates may ever be client-visible before review.
4. **AI provider spend:** approve or reject a concrete benchmark proposal. Suggested ceiling: **$10, needs the founder’s approval**. Production provider selection and recurring spending remain separate decisions.
5. **Legal review:** authorize a scoped Egyptian health-data/transfer review and the selected Gulf-country review. Any legal fee **needs the founder’s approval** after a quote.
6. **Interviews and task tests:** authorize or defer recruitment of eight coaches, five coach task participants and five clients. Define approved contact channels, recording and any compensation.
7. **First fixes:** choose the first bounded batch: client timeline/contextual actions; ranked review queue; lighter sync/nutrition presentation; semantic Arabic fixes; or compact editing and recovery.
8. **Meal photos and later ideas:** approve preparation of the local accuracy experiment or defer it. Ramadan, prayer-time, women-only features, external inbox connectors and video analysis remain hypotheses outside the initial commitment.
9. **Access and control:** confirm archive/restore and history-preserving corrections; decide separately whether any read-only plan access after expiry should change the current entitlement contract.

