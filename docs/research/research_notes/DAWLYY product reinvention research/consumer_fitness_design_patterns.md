# Consumer fitness app design patterns (as of 13 Nov 2026)

Scope note: Hevy/Strong logging basics were covered 7 Nov 2026 and are not repeated. Exa was down (timeouts) for the whole run, so sources are WebSearch/WebFetch, Apple's iTunes review feed and Arctic Shift. Several primary pages (WHOOP Locker 403, Exa fetch timeout) could not be read; claims from them are marked secondary. No Google Play data was collected (gap). Review excerpts are paraphrased or trimmed; verify before quoting.

## 1. Navigation architecture (tabs, Today screen, session screen, gestures, widgets, watch)

### Takeaway
The strongest trend is fewer, differently-purposed tabs: Oura collapsed 5 tabs into 3 (Today / Vitals / My Health), organised by time horizon and "news-feed" priority rather than by metric. WHOOP moved from swipe-between-tabs to a denser scrollable Home with three dials plus a persistent Coach button in the bottom bar. Quiet logging apps (Hevy, Strong) win on speed, not novelty.

### Cited Findings
- Oura (Oct 2024) merged Home, Readiness, Sleep, Activity, Resilience into three tabs: Today, Vitals, My Health. Today shows the three scores on top, a time-of-day "daily highlight", a day timeline with tagging, and "Discoveries" linking tagged habits to data changes; Vitals shows personal baseline ranges; My Health holds slow metrics (cardiovascular age, resilience) and weekly/quarterly/yearly reports. PM Laura Furman said Today was designed "like the 'Top Stories' page of a news app." Rationale: too many data points to sort through. — [Oura blog](https://ouraring.com/blog/new-oura-app-experience/)
- Oura said insights on Today would reorder dynamically by the member's goals and metrics from Oct 16 (2024). — [Oura blog](https://ouraring.com/blog/new-oura-app-experience/)
- WHOOP (2025) replaced a multi-tab layout users swiped between with a denser scrollable Home page; Coach moved to the right corner of the bottom menu bar and the Action button became more central. Coach stays reachable when looking at previous days. — [The5KRunner, 15 Oct 2025](https://the5krunner.com/2025/10/15/whoop-homescreen-gets-a-revamp/)
- WHOOP Home reportedly shows three separate dials (Sleep, Recovery, Strain), each with a dedicated deep-dive page, plus a Health tab (Healthspan, Health Monitor, Stress Monitor, women's hormonal insights by tier). Secondary summary of WHOOP's Locker post; the primary page returned 403. — [WHOOP Locker](https://www.whoop.com/thelocker/the-all-new-whoop-home-screen/), [WHOOP 2025 recap](https://www.whoop.com/thelocker/everything-whoop-launched-in-2025)
- WHOOP Coach reportedly now remembers user interests and adapts. — [The5KRunner](https://the5krunner.com/2025/10/15/whoop-homescreen-gets-a-revamp/)
- Strava's Maps / You / Home layout dates from a 2021 redesign that cleaned up a "crowded" interface; Maps replaced Explore, You holds personal activity and stats; tested with a subset of subscribers first. — [Android Police 2021](https://www.androidpolice.com/2021/05/12/stravas-latest-update-cleans-up-its-messy-maps/?amp), [BikeRadar](https://www.bikeradar.com/news/strava-beta-test-layout/)
- Strava 2025: July update focused on showing map plus stats together during live recording; iOS lock-screen widgets give direct access to Home/Maps/You. — search summary of [The5KRunner Strava redesign](https://the5krunner.com/2025/07/16/strava-app-redesign/) (page not read directly)
- Peloton iOS (observed 29 Jun 2026): top-level tabs now stay visible while filtering within Classes. Peloton Strength+ launched Dec 2024 as a separate audio-focused strength app (iOS, US, $9.99/mo). — [The Clip Out](https://theclipout.com/peloton-ios-app-navigation-update/), [Engadget](https://engadget.com/apps/peloton-is-introducing-a-new-audio-focused-strength-training-app-222145376.html)
- Gentler Streak: top of the Streak tab (illustration plus daily status) is "a love letter from your heart" via mascot Yorhart; stats are translated to everyday-language status; surface stays glanceable even as depth grows ("our Northern Star... is simplicity"). — [Sketch interview](https://www.sketch.com/blog/gentler-streak/), [Apptisan](https://apptisan.substack.com/p/apptisan-025-gentler-streak)
- Gentler Streak principle: stick to common validated iOS practices so users "naturally know what to do", then add illustration, transitions and occasional "cute surprises" for warmth; some designers' overt marks produce poor UX and deletion. — [Sketch interview](https://www.sketch.com/blog/gentler-streak/)
- Hevy: reviewers describe an automatic rest timer after each logged set and a "clean" interface; Hevy lists Apple Watch support; I found no evidence of a Hevy Live Activity; a competitor claim that Hevy has no Watch app conflicts with Hevy's listing. — [WhistleOut review](https://www.whistleout.com/CellPhones/Apps/hevy-app-review), [App Store](https://apps.apple.com/is/app/id1458862350?l=en-gb)
- Alpha Progression has no dedicated Apple Watch or Wear OS workout app per its own maker (via review). — [FitnessDrum review](https://fitnessdrum.com/alpha-progression-app-review/)
- Fitbod user (Reddit, 26 Jul 2026) calls the in-workout screen "the weakest part of this otherwise great app" though it is the screen used most. — [r/fitbod](https://reddit.com/r/fitbod/comments/1v750z9/ongoing_workoutscreen_is_the_weakest_part_of_this/)
- Fitbod 2026 plate calculator redesign praised for "design and clarity" by one user but a feature (bar weights) was removed. — [r/fitbod](https://reddit.com/r/fitbod/comments/1swl14q/plate_calculator_bar_weights/)
- Strong user (App Store, 21 Sep 2026): simple keystrokes, "not messing with it mid workout"; has tried apps with more visuals and animations that "work fine" but prefers basic. — [Strong RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=464254577/sortby=mostrecent/json)
- Centr iPad landscape layout blocks progressing through a workout (3*, 2 Nov 2025). — [Centr RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1382530817/sortby=mostrecent/json)
- Ladder user: loves a phone calendar widget highlighting gym days (5*, 4 Nov 2026) and uses a whole home screen of Ladder widgets (10 Nov 2026). — [Ladder RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1502936453/sortby=mostrecent/json)
- Oura/Bevel users ask for more widget options (Oura 22 Oct, 10 Oct 2026); a Bevel user praises "astonishing amount of widgets" (12 Oct 2026). — [Oura RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1043837948/sortby=mostrecent/json), [Bevel RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=6456176249/sortby=mostrecent/json)

### Inferences
- "Today" as a prioritised feed (not a dashboard of equal tiles) is the pattern the best readiness apps converged on; for a coach app it maps to "what my coach wants from me today".
- Session screen quality decides loyalty in logging apps (Fitbod's complaint, Strong's praise). Nothing in the evidence shows any app has a standout one-handed gesture system; I found no sourced gesture data (gap).
- Lock-screen/widget presence is a repeated user wish, which suggests glanceable "next action" widgets drive habit.

### Gaps
- Tab counts for Hevy, Strong, Fitbod, Ladder, Future, Zing, Centr, NTC, Caliber, JuggernautAI not verified from primary sources. Mobbin/Screenlane were not reachable in this run.
- No verified Live Activity or Watch UX detail for Fitbod, Ladder, Caliber, Bevel, Peloton Strength+.

## 2. Visual language (type, colour, data-viz, density, dark mode, illustration, motion, haptics)

### Takeaway
Distinctiveness comes from a warm, personified layer over data (Gentler Streak's mascot and everyday-language status), from calm score-first hierarchy (Oura, WHOOP dials), and from polish users notice but rarely name. Heavy animation can backfire when it hurts reliability (Strava).

### Cited Findings
- Gentler Streak: designed for a "soft", cozy, welcoming atmosphere with illustrations, transitions, animations; copy is "supportive but not cheesy, motivating but not fake-hyped"; fitness apps usually look "cold", focused on stats, not atmosphere; stats translated to words. Apple Design Award 2024, Social Impact. — [Sketch](https://www.sketch.com/blog/gentler-streak/), [Apple Developer](https://developer.apple.com/news/?id=3m0ht22s)
- Gentler Streak uses a custom mascot illustration (Yorhart) built with illustrator Soren Selleslagh, abstract, not tied to gender/age/body shape. — [Sketch](https://www.sketch.com/blog/gentler-streak/)
- Gentler Streak's Monthly Summary frames history as progress rather than comparison. — [Apple Developer](https://developer.apple.com/news/?id=3m0ht22s)
- Bevel user: "GORGEOUS design, insightful AI-driven interactions" (5*, 12 Oct 2026); another "Best UX I've used" preferring it to Garmin's layout (31 Aug 2026). — [Bevel RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=6456176249/sortby=mostrecent/json)
- Bevel backlash: long-time user says a recent change abandoned the "clean, intuitive interface" (1*, 4 Nov 2026). — same RSS
- WHOOP: Reddit requests for light mode (1 Jun 2026) and says the app design is outdated (5 May 2025). A user asked where "Insights" went after the 2025 redesign (9 May 2025). — [r/whoop light mode](https://reddit.com/r/whoop/comments/1ttluy2/light_mode/), [r/whoop outdated](https://reddit.com/r/whoop/comments/1kfbjxg/new_app_design_or_updated_version_of_the_current/), [r/whoop insights](https://reddit.com/r/whoop/comments/1khv3sm/new_app_design_removed_features_where_are_insights/)
- Centr rebrand disliked; too bright at night (4*, 23 May 2026). — [Centr RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1382530817/sortby=mostrecent/json)
- Strava: after the update "that added animation" a user reports syncing issues (3*, 8 Nov 2026). — [Strava RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=426826309/sortby=mostrecent/json)
- Strava user: statistical data in "clean, easy to use" interface (5*, 12 Oct 2026). — same RSS
- Oura user: interface "confusing, hard to find things", overwhelming with information even after the 3-tab redesign (4*, 2 Nov 2026). — [Oura RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1043837948/sortby=mostrecent/json)
- Alpha Progression user compares trophies/badges to a video game ("as rewarding as playing a video game") (5*, 11 Feb 2025). — [Alpha Progression RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1462277793/sortby=mostrecent/json)
- Zero credible sourced facts found on typography choices, haptics, 3D, or Apple Fitness+/NTC visual systems. Not claimed.

### Inferences
- A friendly guide character plus plain-language status is a transferable "premium and different" move for non-expert users; Arabic copy tone could do the same.
- Redesign backlash (WHOOP, Bevel, Centr) is about moved features and lost clarity, so ship new nav alongside a clear "where did X go" path.
- Dark-mode and light-mode both being asked for suggests theme parity is an expectation.

### Gaps
- Type, colour palettes, data-viz style and haptics: no primary design write-ups retrieved. Needs Mobbin, ScreensDesign, app-by-app teardown or direct inspection.
- Nothing retrieved on Arabic/RTL treatment in any of these apps.

## 3. Motivation and retention (streaks, rings, PRs, social, challenges, readiness)

### Takeaway
Streaks and rings work through loss aversion but generate anxiety; the best-regarded response (Gentler Streak) builds rest into the mechanic and personal ranges. Readiness scores are the headline of WHOOP/Oura, but users complain about paywalls around the data more than the scores themselves.

### Cited Findings
- Commentators credit streaks with loss aversion plus animation reward; the "dopamine" claim is single-opinion; one ex-user says the rings turned into anxiety about breaking the streak. — [Digitec/Galaxus](https://www.digitec.ch/en/page/why-am-i-so-obsessed-with-closing-my-rings-37588), [Theflyy](https://www.theflyy.com/blog/apple-fitness-and-the-power-of-gamification), [Macworld](https://www.macworld.com/article/3179972/i-closed-my-rings-for-500-days-by-cracking-the-apple-watch-code.html)
- "Stand for 1 minute" cited as an example of near-zero-willpower goal design. — [LAVX article](https://news.lavx.hu/article/the-psychology-and-engineering-behind-effective-streak-systems)
- Apple Watch rings: can't take a rest day without breaking a streak (complaint); a pause of up to 90 days in watchOS 11 is a secondary, unverified claim. — [iMore](https://imore.com/apps/health-fitness-apps/want-to-hit-your-2023-fitness-goals-drop-apples-rings-and-try-gentler-streak-instead), [LAVX](https://news.lavx.hu/article/the-psychology-and-engineering-behind-effective-streak-systems)
- Gentler Streak: Activity Path shows optimal range from readiness plus a 10-day log; "Go Gentler" suggests rest, indoor walk or active recovery; "world is hungry for someone to tell you it's OK to rest". — [iMore](https://imore.com/apps/health-fitness-apps/want-to-hit-your-2023-fitness-goals-drop-apples-rings-and-try-gentler-streak-instead), [9to5Mac](https://9to5mac.com/2022/06/25/gentler-streak-interview-watchos-9/)
- Gentler Streak reviewer: "NOT data crunchers" audience praise (4*, 1 Oct 2026); Activity Path flexibility and rest days helped avoid all-or-nothing (5*, 10 Jul 2026); "advice is on point; gentle and a motivator" (19 Oct 2026). — [Gentler Streak RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1576857102/sortby=mostrecent/json)
- Gentler Streak negatives: free-trial offer complaint (1*, 29 Oct 2026); menstruation data behind paywall "pink tax" (2*, 29 Jul 2026). — same RSS
- WHOOP: a 1,200-day data streak user cancelled after 3 years (3*, 10 Nov 2026), showing streak length does not guarantee retention. — [WHOOP RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=933944389/sortby=mostrecent/json)
- NTC: gamification with achievements and a streak, 80+ workouts (5*, 20 Apr 2026). — [NTC RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=301521403/sortby=mostrecent/json)
- Alpha Progression trophies and badges praised (see above). — [AP RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1462277793/sortby=mostrecent/json)
- Ladder: users cite community and feeling "like a virtual training" (5*, 8 Nov 2026); coach-led team programming is the product. — [Ladder RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1502936453/sortby=mostrecent/json), [Sensai review](https://www.sensai.fit/blog/ladder-app-review-2026)
- Future: reviewers praise UI and coach choice; onboarding begins with a trainer call; a coach-app case study found onboarding workload about 90% trainer / 10% client, settling toward 70/30. — [Sypnotix](https://www.sypnotix.com/reviews/future-app-review), [TechCrunch](https://techcrunch.com/?p=1831570)
- Hevy: users praise PR logging and say the social stuff is "easy to toggle off" (5*, 9 Nov 2026). Strong users ask for Strava/Hevy-style social (4*, 8 Nov 2026). — [Hevy RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1458862350/sortby=mostrecent/json), [Strong RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=464254577/sortby=mostrecent/json)
- Strava: "no other app is this social, in my circle" (3*, 31 Oct 2026); multiple 1* paywall complaints about own data (14 and 20 Oct 2026). — [Strava RSS](https://itunes.apple.com/us/rss/customerreviews/page=1/id=426826309/sortby=mostrecent/json)

### Inferences
- Rest-aware streaks and "enough for today" framing differentiate more than another badge system.
- Social is valued when optional.
- Paywalling the user's own history is a dependable source of 1-star reviews.

### Gaps
- No Reddit evidence on PR celebration animations or readiness-score trust beyond WHOOP/Oura reviews. Readiness accuracy debates not researched. Peloton/Zing/Centr/Caliber retention mechanics not verified.

## 4. Reviews: what users praise and hate (data points, collected via Apple iTunes RSS 13 Nov 2026, plus Reddit via Arctic Shift)

### Takeaway
About 57 relevant data points collected (52 App Store, 5-6 Reddit; Google Play not collected). Praise clusters on "simple, clean, intuitive, not littered with spam". Hate clusters on paywalls, redesigns that hide features, cluttered/overwhelming dashboards, and sync reliability.

### Cited Findings
(Format: app, stars, date, gist. Feed per app: `https://itunes.apple.com/us/rss/customerreviews/page=1/id=<ID>/sortby=mostrecent/json`; IDs: Hevy 1458862350, Strong 464254577, Fitbod 1041517543, Gentler Streak 1576857102, WHOOP 933944389, Oura 1043837948, Strava 426826309, Ladder 1502936453, Alpha Progression 1462277793, Bevel 6456176249, NTC 301521403, Centr 1382530817, Caliber 1482405410.)
- Hevy 5*, 11 Nov 2026: "Simple", user friendly. — [Hevy feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1458862350/sortby=mostrecent/json)
- Hevy 5*, 10 Nov 2026: logging "fast and intuitive, with no clutter"; huge free exercise database.
- Hevy 5*, 9 Nov 2026: "not littered w/ spam"; only negative is social, easy to toggle off.
- Hevy 5*, 8 Nov 2026: simple, great API, wants more graphs/analytics.
- Hevy 5*, 7 Nov 2026: clean interface, effortless PR and volume tracking; 5*, 7 Nov: "a tool, not a chore".
- Strong 4*, 8 Nov 2026: "near perfection"; wants weekly muscle-volume widget on home and social.
- Strong 3*, 30 Sep 2026: plan is intuitive but "huge shortcomings".
- Strong 5*, 21 Sep 2026: basic, "all you need", simple keystrokes.
- Strong 4*, 20 Sep 2026: intuitive since 2018; Apple Watch sync needs improvement.
- Strong 5*, 24 Aug 2026: fears an eventual paywall. Strong 5*, 19 Aug 2026: free and "just works". — [Strong feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=464254577/sortby=mostrecent/json)
- Fitbod 1*, 17 Oct 2026: trial one week too short; later "buggy and very confusing interface".
- Fitbod 1*, 9 Oct 2026: "can't use without paying"; $15/month to open the app. — [Fitbod feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1041517543/sortby=mostrecent/json)
- Reddit r/fitbod 26 Jul 2026: workout screen weakest part (above). r/fitbod 21 Jul 2026 "Worth it to stay?": long-time user ignores recommended exercises, uses own splits. — [thread](https://reddit.com/r/fitbod/comments/1v203ws/worth_it_to_stay/). r/fitbod 27 Apr 2026: plate calculator redesign better but bar weights removed. r/fitbod 21 Dec 2025: wants more/custom splits. — [thread](https://reddit.com/r/fitbod/comments/1prs708/add_more_splits_or_allow_for_custom_ones/)
- Gentler Streak six reviews, 10 Jul to 29 Oct 2026 (see section 3). — [feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1576857102/sortby=mostrecent/json)
- WHOOP 3*, 10 Nov 2026: cancelled after 3 years / 1,200-day streak. Reddit r/whoop 25 May 2026: renewal feels worse value than new membership (20 upvotes). — [thread](https://reddit.com/r/whoop/comments/1tn84y5/wouldnt_it_be_cheaped_to_buy_a_new_membership_than_renew/) (URL slug approximate; use the `1tn84y5` id)
- WHOOP Reddit 8 May 2025 (340 upvotes): users want a screenless band, i.e. less hardware clutter. — [thread](https://reddit.com/r/whoop/comments/1ki5wtp/)
- Oura 4*, 2 Nov 2026: confusing/overwhelming; Oura 4*, 22 Oct: needs better widgets; Oura 2*, 10 Oct: more widgets, edit activities; Oura 1*, 16 Oct: Apple Health sync is paywalled, app crashes; Oura 1*, 23 Oct: find-my-ring feature useless. — [Oura feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1043837948/sortby=mostrecent/json)
- Strava 3*, 8 Nov; 3*, 31 Oct; 1*, 20 Oct; 1*, 14 Oct; 5*, 12 Oct 2026 (above). — [Strava feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=426826309/sortby=mostrecent/json)
- Ladder 5*, 10 Nov / 8 Nov / 4 Nov 2026 (above; "very intuitive interface", calendar widget, community). — [Ladder feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1502936453/sortby=mostrecent/json)
- Alpha Progression 5*, 26 May 2026 ("intuitive, progressive flow"), 5*, 27 Apr 2026 (clean, practical), 5*, 27 Mar 2026 (responsive developer), 4*, 27 Feb 2025 (missing supersets/rest lengths), 5*, 11 Feb 2025 (trophies), 5*, 3 Jan 2025 (simplify acronyms). — [AP feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1462277793/sortby=mostrecent/json)
- Bevel 1*, 4 Nov 2026 (direction change alienates); 5*, 22 Oct (intuitive); 5*, 12 Oct (gorgeous design, widgets); 5*, 28 Sep (wants watch hydration widget); 5*, 31 Aug 2026 (best UX). — [Bevel feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=6456176249/sortby=mostrecent/json)
- NTC 5*, 20 Apr 2026 (streak and achievements). — [NTC feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=301521403/sortby=mostrecent/json)
- Centr 4*, 23 May 2026; 3*, 2 Nov 2025 (above). — [Centr feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1382530817/sortby=mostrecent/json)
- Caliber 1*, 28 Apr 2026 (15+ onboarding questions and account before browsing exercises); 4*, 19 Mar 2026 (complete button and timer placement); 1*, 30 Jan 2026 (paywall prompts everywhere); 5*, 30 Dec 2025 (coaching praised); 4*, 5 Dec 2025 (stingy free tier). — [Caliber feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1482405410/sortby=mostrecent/json)

Rating baseline (iTunes search, 13 Nov 2026): Hevy 4.92 (103k), Ladder 4.95 (221k), Alpha Progression 4.92 (2.3k), Strong 4.86 (109k), Oura 4.86 (324k), Fitbod 4.81 (290k), Strava 4.81 (381k), WHOOP 4.81 (95k), NTC 4.85 (283k), Bevel 4.85 (18k), Caliber 4.84 (6k), Centr 4.76 (21k), Gentler Streak 4.71 (8.8k). — [iTunes lookup](https://itunes.apple.com/search?term=Hevy&entity=software&limit=2&country=us)

### Inferences
- Selected via keyword filter (design/clean/paywall etc.) on the 3 most recent pages per app, so the sample is not representative; it shows themes, not frequencies.
- Premium feel in reviews = speed, no spam, and calm; not decoration.

### Gaps
- No Google Play data. Reddit searches via Arctic Shift returned nothing usable for r/hevy, r/strava, r/AppleWatchFitness (empty or errors), so Reddit coverage is r/fitbod and r/whoop only.

## 5. Transferable pattern library (25 patterns) for a coached-client Arabic RTL app

Evidence tags: [E] sourced above; [I] inference, no direct evidence it "works". Arabic/RTL application is my proposal in every case; no source tested these in Arabic.

1. Three tabs by time horizon (Today / Progress / Plan) — Oura. [E: Oura blog] Apply: Today, My Journey, Coach chat; mirror order in RTL.
2. Today as a news-style prioritised feed, top story first — Oura. [E] Apply: lead card = "today's session from your coach", then nutrition, check-in due.
3. Scores row on top, tap to deep-dive — Oura, WHOOP dials. [E] Apply: three coach-relevant rings: training, nutrition, check-in (not clones of sleep/recovery).
4. Time-of-day-aware highlight — Oura. [E] Apply: morning "start session", evening "log meals", Friday "weekly check-in" for Gulf week.
5. Persistent Coach button in the bottom bar — WHOOP. [E: The5KRunner] Apply: always-on "message my coach" entry in the bar.
6. Coach memory — WHOOP Coach. [E, secondary] Apply: coach notes shown to client as continuity ("you told Sara your knee hurts").
7. Personal baseline ranges, not absolute targets — Oura Vitals, Gentler Streak. [E] Apply: weights and weight trend shown against the client's own 4-week range.
8. Slow-metrics tab with weekly/quarterly reports — Oura My Health. [E] Apply: monthly recap report the client can share.
9. Plain-language daily status — Gentler Streak. [E] Apply: one Arabic sentence ("today: gentle push") replacing numbers. Needs native Arabic copywriting.
10. Personified guide/mascot tied to the user's data — Gentler Streak Yorhart. [E] Apply: a branded character per coach brand (coach white-label) rather than generic. Risk: cultural fit; test.
11. Rest-aware streak with pause and "go gentler" — Gentler Streak vs Apple rings. [E] Apply: streak counts planned rest days as kept; Ramadan/travel pause.
12. Warm, not hyped, copy — Gentler Streak. [E] Apply: Arabic tone guide: encouraging but not exaggerated; avoid translated-from-English hype.
13. Familiar OS conventions plus a few "cute surprises" — Gentler Streak. [E] Apply: standard sheet/back behaviour mirrored for RTL, with one delightful moment per milestone.
14. Instant, spam-free logging with automatic rest timer — Hevy. [E] Apply: set row = one tap to confirm; timer starts automatically.
15. Keep the in-workout screen the best screen — Fitbod complaint. [E] Apply: spend design budget on session view first.
16. Large, one-handed primary action, correct placement of "complete" vs timer — Caliber complaint. [E] Apply: bottom-anchored complete button; keep timer separate from it; in RTL mirror thumbs-reach zones.
17. Optional social, toggle-able — Hevy, Strava. [E] Apply: coach-group feed and kudos on/off per client; women-only privacy options common in the region [I].
18. PR / trophy collection with a video-game feel — Alpha Progression. [E: one review] Apply: coach-defined milestones as trophies; Arabic-numeral choice (Eastern vs Western digits) configurable.
19. Widgets as habit anchors (calendar-of-gym-days) — Ladder users. [E] Apply: calendar widget and "next session" widget; lock-screen access.
20. Do not hide the user's own data behind a paywall — Strava, Oura, Fitbod complaints. [E] Apply: history always visible to the client; the coach's plan carries the paywall, not the client's data.
21. Short, honest onboarding with value before commitment — Caliber complaint, Future's onboarding call. [E] Apply: coach-led intro call/video replaces 15 questions; ask at most a few before first workout.
22. Trainer-heavy onboarding that tapers (90/10 to 70/30) — coach-app case study. [E: secondary] Apply: coach fills most profile at start, client takes over gradually.
23. Don't ship an animation that harms reliability — Strava review. [E: one review] Apply: motion budget; test low-end Android devices in the region [I].
24. Redesign carefully: keep features findable — WHOOP Insights, Bevel backlash. [E] Apply: "what's new / where did it go" and search.
25. Light and dark theme parity — WHOOP, Centr feedback. [E] Apply: both themes first-class; night use common during Ramadan [I].
26. Glanceable home with depth behind it — Gentler Streak "surface stays glanceable". [E] Apply: home shows 3 things max.
27. Per-metric baselines presented as insights ("Discoveries": tag a habit, see its effect) — Oura. [E] Apply: client tags "late dinner", app shows effect on next-day energy check-in.
28. Hardware-free "readiness" via check-in — adaptation of WHOOP/Oura/Gentler Streak. [I; no source tested a self-report readiness input in a coach app] Apply: 3-question morning check-in drives suggested intensity.
29. Quiet audio-first/strength-only focused sibling app — Peloton Strength+. [E: launch] Apply: [I] a stripped "gym mode" for the client.
30. Visible progress toward a goal in a widget — Oura/Strong user requests. [E] Apply: activity-goal and weekly-volume widget.

### Gaps
- None of the 30 patterns was tested for Arabic RTL in any source. Gesture patterns (swipe to complete, long-press reorder), haptics and Live Activities are not backed by retrieved evidence and are deliberately absent from the list. Zing Coach, JuggernautAI, Future (beyond reviews), Peloton Guide, Nike Training Club and Apple Fitness+ visual/navigation details remain unresearched and should be a second pass once Exa recovers; also check Mobbin/ScreensDesign and Google Play.
