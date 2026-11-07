# Hevy and Strong: workout-logging benchmark teardown (state as of 7 Nov 2026)

Scope note: about 20 tool calls. Official help-centre pages for set logging, history charts and sync were mostly not reachable, so several answers rest on App Store listings (primary) and third-party reviews (several are written by competing apps, flagged below). Reddit threads were not directly retrievable; the complaint evidence is thin and labelled as such.

## Set-logging flow (previous values, set types, RPE/RIR, rest timer, supersets, plate calc, notes, 1RM)

### Takeaway
Both apps cover the full in-gym feature set. Hevy shows last-session values and has per-exercise rest timers, RPE with a colour scale and free supersets. Strong tags warm-up/failure/drop sets, has RPE on a 6-10 scale and Brzycki 1RM, but puts the plate and warm-up calculators behind Pro.

### Cited Findings
- Hevy logs weight, reps, duration and RPE, supports supersets, drop sets, warm-ups and failure sets, shows the last session's weights and reps per exercise, and has automatic rest timers — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Hevy rest timer is set per exercise under a "Rest Timer" label below the exercise name; changing the default only affects exercises never manually set; it can be turned off per exercise; +15 / -15 second buttons adjust the running countdown — [Hevy help centre via search result](https://help.hevyapp.com/hc/en-us/articles/35385404949143-Rest-Timer-Default-Rest-Timer-How-to-Add-Adjust-Volume-and-Sound)
- Hevy plate calculator is toggled in Settings > Workouts, works for barbell, short bar and EZ bar, and uses target weight, available plates and bar weight; the same help article covers warm-up calculator and "Smart Superset Scrolling" settings — [Hevy help centre](https://help.hevyapp.com/hc/en-us/articles/33882110558743-Workout-Settings-Preferences-Timer-Warm-up-calculator-Plate-Calculator-Smart-Superset-Scrolling)
- Hevy 3.1.11 (28 Aug 2026) redesigned the set row UI with an RPE colour scale and added progressive overload for reps-only exercises; 3.2.5 added a warning for sets logged with zero reps/time/distance — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Hevy 3.2.1-3.2.3 (Oct 2026) rebuilt Notes: notes can be pinned to exercises, routines or single workouts — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Hevy supersets are available on the free plan as a set label — [SensAI Hevy vs Caliber](https://www.sensai.fit/blog/hevy-vs-caliber-2026) (competitor-authored)
- Strong set tags: warm-up, failure, drop sets; supersets and grouped exercises; assisted bodyweight and duration exercises; rest timer; warm-up and plate calculators; notes and progress pictures on workouts — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- Strong RPE is optional per set on a 6-10 scale; plate calculator and warm-up calculator are Pro-only; 1RM uses the Brzycki formula and Strong's help centre says estimates "break down significantly" above 12 reps — [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026) (competitor-authored, says it checked Strong's help centre on 4 Oct 2026)
- Strong 6.5.0 (12 Aug 2026) added Live Activity and Dynamic Island rest timers — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- Strong shows previous-session weight and reps when you start a set (review claim); rest timer auto-starts after completing a set, plate calc sits in the 3-dot exercise menu (unofficial GitHub description) — [RepReturn](https://repreturn.com/strong-app-review/); [unofficial GitHub project](https://github.com/bjorns163/strongest)

### Inferences
- Hevy's per-exercise timer with live +/-15s and Strong's lock-screen/Dynamic Island timer are the two rest-timer behaviours worth matching; DAWLYY needs both an exercise-level default and a live adjust.
- RPE is optional in both and only a colour or number on the set row, so it is cheap to add. RIR is not explicitly documented by either (Strong only equates RPE 8 with about 2 reps in reserve).
- Hevy's 2026 changes (RPE colours, zero-rep warning, pinned notes) show where users hit friction: fast scanning of set rows and note persistence.

### Gaps
- Whether Hevy auto-starts the rest timer on set completion is not stated in an official source I reached (the SensAI page says it starts automatically; no official confirmation).
- Hevy's own set-type list and 1RM display during logging were not confirmed from official pages.
- Exact on-screen layout of previous values (inline vs separate column) was not verified; no screenshots were inspected.

## Exercise history and progression charts

### Takeaway
Strong documents volume and estimated-1RM charts plus PR, progression and total-weight stats. Hevy documents per-exercise progress graphs and PR tracking, with a free-tier history cap of 3 months.

### Cited Findings
- Strong statistics: personal records, progression, estimated 1RM, total weight lifted; volume and 1RM progress charts — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- Strong free users get "some" charts; Pro unlocks all — [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026)
- Hevy: progress graphs and PR tracking per exercise; calendar views and streak tracking — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Hevy free tier shows 3 months of graph history; Pro shows all-time — [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026); [SensAI Hevy vs Caliber](https://www.sensai.fit/blog/hevy-vs-caliber-2026)

### Inferences
- Both gate long-range history behind payment (Hevy by time window, Strong by chart set); DAWLYY keeping full history free for clients is a differentiator.

### Gaps
- Hevy's exact charted metrics (best set, 1RM, volume toggles) and granularity not confirmed from official sources.
- Where history surfaces mid-workout (tap exercise name for history) not verified for either app.

## Workout summary, PR detection, share cards

### Takeaway
Little verified detail on the post-workout screen. PR tracking exists in both; Hevy ties PR and workout sharing to its social feed.

### Cited Findings
- Hevy PR tracking is on both tiers; PR sharing is part of the optional social feed — [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026)
- Hevy 3.2.0 (13 Oct 2026) can send a workout to ChatGPT and Claude; 3.2.1-3.2.3 added Snapchat sharing; 3.2.5 added double-tap to like — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Strong advertises notes and progress pictures on workouts and CSV export — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)

### Inferences
- Strong keeps logging private (see comparisons); Hevy's differentiator is social sharing. A coach-visible summary (not a public feed) is an open lane.

### Gaps
- What is compared against the previous session on the summary screen, and the share-card design, were not verified for either app.

## Offline behaviour and sync

### Takeaway
Evidence is weak and partly contradictory. No official offline statement was found for either app; Hevy's App Store listing claims offline use with sync.

### Cited Findings
- Hevy App Store lists "Offline use with sync across devices" — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- A competitor page says Hevy can log offline once set up but needs an account and internet to start; another review calls it offline-first; these conflict — [IronStack vs Hevy](https://workout-log-site.pages.dev/vs-hevy) (competitor); [Android Authority review](https://cellphoneplans.androidauthority.com/CellPhones/Guides/hevy-app-review)
- Hevy duplicate feed entries: a Hevy developer on r/Hevy said phone and watch likely both saved a workout to Apple Health after a communication issue when ending the workout; users can swipe to delete the duplicate without losing Hevy data — [r/Hevy mirror](https://axebps-redlib.hf.space/r/Hevy/comments/1jjh1ab/duplicate_posts_in_activity_app)
- Hevy help centre: workouts logged while Apple Health sync was broken are not retroactively written to Apple Health — [Hevy help](https://help.hevyapp.com/hc/en-us/articles/36957445562775-Hevy-Not-Syncing-to-Apple-Health-Step-by-Step-Troubleshooting)
- Strong has Cloud backup; Android Health Connect was in public beta; exported CSV cannot be re-imported into Strong — [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026)
- Strong 6.4.2 fixed sync/authentication messaging and an RPE saving bug; 6.4.0 fixed freezing with large histories; 6.5.1 (8 Oct 2026) fixed sign-in session and sync issues — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- Review-site claims (weak): lost workouts after an update on Android (a March 2025 Google Play review) and "sync has been a repeated issue" for Android; an archived r/strongapp post says "Sync is bugged" — [third-party review, via search](https://dr-muscle.com/strong-app-review-alternative/amp); [Reddit snapshot](https://reddit.sentinel-team.org/posts/1toahvs/snapshots/2026-05-26T19%3A24%3A03.884976Z)
- Strong can be used without an account (review claim) — [RepReturn](https://repreturn.com/strong-app-review/)

### Inferences
- Both ship repeated sync/sign-in fixes in 2026, so sync is a real recurring weak spot. Duplicate prevention in DAWLYY should rely on client-generated IDs per set and workout (an engineering inference, not a documented Hevy/Strong method).

### Gaps
- No official description of conflict resolution or duplicate prevention for either app.
- No confirmed r/hevy or r/strongapp thread on offline data loss; Reddit access was limited.

## Routines, programs, folders, templates, library, custom exercises, videos

### Takeaway
Free tiers are tightly capped on routines (Hevy 4, Strong 3). Both offer exercise videos and custom exercises; library sizes are not confirmed.

### Cited Findings
- Hevy free: 4 routines, 7 custom exercises; Pro unlimited — [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026)
- Hevy library 400+ exercises (competitor-authored, unverified; likely an undercount) — [SensAI Hevy vs Caliber](https://www.sensai.fit/blog/hevy-vs-caliber-2026)
- Hevy has a large free exercise library with instructional videos; 3.1.12-3.1.16 added split templates (Full Body, Upper/Lower, PPL) — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Strong free: unlimited saved workouts, 3 routines; animated exercise videos; custom exercises; 6.5.0 sped loading of large template libraries — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- Hevy Trainer (Pro): six inputs (experience, goal, equipment, frequency, session duration, muscle focus); double-progression rule; Hevy calls it an algorithm, not AI; no recovery inputs — [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026)
- Hevy 3.1.8-3.1.10 added injury management for Trainer and a program variety setting — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Hevy can import Strong CSV files — [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026)

### Inferences
- Folder structure was not confirmed; do not assume parity claims about folders.

### Gaps
- Official library counts for both; folder behaviour for both.

## Coach-side features

### Takeaway
Hevy Coach is a separate product at about $25/month entry, with clients using the normal Hevy app. Strong has no coach product found.

### Cited Findings
- Hevy Coach: Training Plan Builder to "create detailed workout plans and assign them at scale", unlimited programs and custom exercises, client management to "track client activity, assign programs, and monitor progress", clients chat and log in the Hevy app; $25/month entry plan, 30-day free trial with no card, clients do not pay, tiers scale 1-10 up to 501-1,000 clients — [hevycoach.com](http://hevycoach.com/)
- Directories list $25 (1-10 clients), $50 (11-25), $90 (26-50), $160 (51-100); higher tiers ($250 to about $700) come from one competitor-run site only — [Capterra](https://www.capterra.com/p/10015732/Hevy-Coach/pricing/); [Coachway](https://coachway.io/articles/hevy-coach-pricing/)
- Coachway claims clients get Hevy Pro free (single, competitor-run source) — [Coachway](https://coachway.io/articles/hevy-coach-review)
- Strong has no coach or program-generation features — [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026)

### Inferences
- Hevy Coach homepage does not mention check-ins, forms, nutrition or payments, so DAWLYY's all-in-one coaching bundle is a plausible gap (absence on one marketing page, not proof).

### Gaps
- Coach dashboard depth, comment/feedback on sets, and in-app chat details unverified.

## Pricing, ratings, platforms, wearables

### Takeaway
Hevy Pro $2.99/mo, $23.99/yr, $74.99 lifetime; Strong Pro $4.99/mo, $29.99/yr, lifetime $79.99 or $99.99. Both rate 4.9 on US App Store. Both have Apple Watch; only Hevy has Wear OS.

### Cited Findings
- Hevy US: 4.9 from 102K ratings; Pro $2.99 monthly (a $3.99 SKU also listed), $23.99 yearly, $74.99 lifetime — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Strong US: 4.9 from 109K ratings; $4.99/month or $29.99/year; other IAPs $3.99, $19.99 (6 months), $23.99 (1 year), $79.99 and $99.99 Forever, unexplained — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)
- Egypt storefront: Hevy 4.9 from 1.4K ratings; Pro EGP 47.99 monthly, 389.99 yearly, 3,999.99 lifetime; 16 languages including Arabic — [Hevy EG App Store](https://apps.apple.com/eg/app/hevy-gym-tracker-workout-log/id1458862350)
- Egypt storefront: Strong 4.9 from 467 ratings; Pro 1 month EGP 97.99/104.99, 1 year EGP 479.99-619.99, 6 months EGP 399.99, Forever EGP 3,999.99/4,999.99 — [Strong EG App Store](https://apps.apple.com/eg/app/strong-workout-tracker-gym-log/id464254577)
- Hevy Google Play 4.9 from about 269-274K reviews, 5M+ installs, Wear OS app, web app at hevy.com; Hevy claims 594K+ ratings across stores — [SensAI Hevy vs Caliber](https://www.sensai.fit/blog/hevy-vs-caliber-2026); [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026)
- Strong Google Play 4.3 from 42.7K reviews, 1M+ downloads, no Wear OS; help centre says not all features are on Apple Watch — [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026)
- Hevy Apple Watch: logging, rest timers, heart rate, complications, Ultra Action Button — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Strong Apple Watch works with or without iPhone, watchOS 10+, Live Sync — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577); [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026)
- Conflict: low-quality sites list Hevy at $5.99/month or $99.99 lifetime; discounted — [subger.com](https://subger.com/en/service/hevy-pro)

### Inferences
- Egypt rating counts are about 1.3% (Hevy) and 0.4% (Strong) of US counts, so Hevy leads there. Lifetime for Hevy costs about 4,000 EGP, a large share of local income, which is room for a locally priced option.

### Gaps
- Hevy and Strong own pricing pages were not retrieved; App Store listings are the primary source.
- Egypt ratings are star averages without review text.

## Top praised features and top complaints

### Takeaway
Praise is inferable from store metadata and 2026 comparisons; user-voiced complaint evidence is thin, and I could not read Reddit directly. Lists below are partial and marked by evidence strength.

### Cited Findings
- Praised (comparisons): Hevy generous free tier, social feed, cross-platform; Strong minimalist and private; Strong Watch seen as more polished by some — [Boostcamp](https://www.boostcamp.app/best/workout-apps); [AitoolsBakery](https://aitoolsbakery.com/blog/hevy-vs-strong-app/); [Setgraph](https://setgraph.app/articles/hevy-vs-strong-app-comparison-2026) (several competitor-authored)
- Complaints, Strong: Android rating 4.3 vs iOS 4.9; Android updates lag; freezing with large histories (fixed 6.4.0/6.3.3); Pro unlock bugs (fixed 6.3.2/6.3.3); sync and sign-in bugs; no autosave claim — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577); [review via search](https://dr-muscle.com/strong-app-review-alternative/amp)
- Complaints, Hevy: duplicate Apple Health or feed entries; Apple Health sync gaps; free caps (4 routines, 7 custom, 3 months graphs) — [r/Hevy mirror](https://axebps-redlib.hf.space/r/Hevy/comments/1jjh1ab/duplicate_posts_in_activity_app); [Hevy help](https://help.hevyapp.com/hc/en-us/articles/36957445562775-Hevy-Not-Syncing-to-Apple-Health-Step-by-Step-Troubleshooting)
- Strong's free 3-routine cap and Pro-gated calculators/charts are structural complaints — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577); [SensAI Strong review](https://www.sensai.fit/blog/strong-app-review-2026)

### Inferences
- Reconstructed top themes (not a ranked top 10): praise for speed and previous-value autofill, free tier generosity, Watch support, social motivation, clean UI; complaints about paywalled caps, sync/duplicates, Android quality (Strong), and limited coaching or recovery intelligence in logging.

### Gaps
- No verified top-10 lists. Reddit (r/hevy, r/strongapp, r/weightroom) and review text were not retrievable; a browser-based pass is needed for quotes.

## Notable 2025-2026 updates

### Takeaway
Hevy ships fast on AI, social and Trainer; Strong ships stability, widgets and Live Activity.

### Cited Findings
- Hevy 2026: Liquid Glass UI (3.1.0-3.1.7, Jun-Aug), Trainer program view and injury management, gym tagging (Sep), RPE colour set rows (28 Aug), send workout to ChatGPT/Claude (3.2.0, 13 Oct), rebuilt Notes (3.2.1-3.2.3), Gym Profiles with feeds and leaderboards (3.2.4, 28 Oct), double-tap like and zero-rep warning (3.2.5) — [Hevy US App Store](https://apps.apple.com/us/app/hevy-gym-tracker-workout-log/id1458862350)
- Hevy ChatGPT app: tag @hevy to analyse history, generate a program and save routines back (free) — [SensAI Hevy review](https://www.sensai.fit/blog/hevy-review-2026)
- Strong 2026: calendar and activity widgets (6.4.1), Apple Watch button repeat (6.4.0), Live Activity and Dynamic Island rest timers (6.5.0), exercise search improvements (6.3.3) — [Strong US App Store](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577)

### Inferences
- Strong shows no AI features in 2026 release notes; Hevy treats workout data as exportable to external LLMs.

### Gaps
- No Hevy Coach changelog or Strong redesign details found.

## Public UX patterns worth adopting in DAWLYY's client workout screen

- Previous-session weight and reps prefilled on every set row, one tap to accept.
- Per-exercise rest timer with default, off switch, live +/-15s, and lock-screen/Dynamic Island presence.
- Set-type tags (warm-up, drop, failure) and supersets in the free core, not paywalled.
- Optional RPE (and RIR) on the set row with a colour scale; fast scanning layout.
- Pinned notes at exercise, routine and workout level.
- Inline plate calculator for barbell lifts, and warm-up ramp calculator, free.
- Warning on sets logged with zero values; quick-confirm checkmark.
- Per-exercise history/PR/1RM/volume charts reachable from the logging screen; keep Brzycki-style 1RM with a caveat above about 12 reps.
- Watch and Live Activity support; full Arabic and RTL (Hevy already lists Arabic).

## Gaps DAWLYY can exploit

- Both cap free routines (4 and 3) and history (Hevy 3 months): coached clients receive programs from the coach, with no caps.
- Strong has no coach channel; Hevy Coach is a separate paid product and its public page lacks check-ins or forms (page absence only).
- Neither documents coach feedback on individual sets, auto-adjusting loads from RPE, or readiness input; Hevy Trainer has no recovery inputs.
- Sync/duplicate and Android-quality complaints: ship offline-first with client-generated IDs and a visible sync state, equal quality on Android.
- Egypt and MENA: prices in EGP are steep (Hevy lifetime EGP 3,999.99); few local ratings (1.4K and 467); local pricing and Arabic-first logging are open.
- Unverified: real offline behaviour of both; test both apps hands-on before claiming parity.
