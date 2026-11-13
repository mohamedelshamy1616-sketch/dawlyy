# Global online-coaching platforms: product, UX, navigation and real user reviews (as of 13 Nov 2026)

Method notes. App Store reviews come from Apple's public customer-review RSS/JSON feed (pages 1-3 of mostrecent, countries us/gb/ae), pulled 13 Nov 2026. Feed URL pattern: `https://itunes.apple.com/{cc}/rss/customerreviews/page=N/id={APPID}/sortby=mostrecent/json`. Rows pulled: Trainerize 313, TrueCoach client 309, TrueCoach Connect (coach app) 63, Everfit client 213, Everfit Coach 47, PT Distinction 55, Kahunas 76, My PT Hub 327, CoachRx 43, TrainHeroic 182, Harbiz 7, Hevy Coach 9, Coachify 117, Future 150, Caliber 214. The recent-sorted pages are not a random sample: they over-represent people who just updated or just hit a bug. Reddit posts and comments come from the Arctic Shift archive (`arctic-shift.photon-reddit.com`), r/personaltraining and r/OnlineCoaching only. Exa timed out or errored on 4 of 4 attempts, so Google Play, G2, Capterra and the vendors' feature-request boards were NOT reached (G2 returned 403). Vendor feature pages are marked VENDOR. Several Reddit comments are competitor or founder promotion (flagged as such below) and must not be read as neutral opinion.

App IDs (Apple): Trainerize/ABC Trainerize 516851502; TrueCoach client 1439127794 and TrueCoach Connect coach app 1445214677; Everfit client 1438926364 and Everfit for Coach 1485827117; PT Distinction 973466681; Kahunas 1638377758; My PT Hub 1473947709; CoachRx 1544150077; TrainHeroic 955074569; Harbiz 1396095665; Hevy Coach 6502961756; Coachify AI 6449539939; Future 1288178982; Caliber 1482405410. Store ratings at lookup time (iTunes search API): Trainerize 4.90 (69,485), TrueCoach 4.86 (35,942), TrueCoach Connect 1.80 (84), Everfit client 4.71 (2,718), Everfit Coach 4.53 (180), PT Distinction 4.16 (121), Kahunas 3.31 (77), My PT Hub 4.14 (1,863), CoachRx 3.65 (82), TrainHeroic 4.24 (1,847), Harbiz 4.90 (604), Hevy Coach 4.33 (6), Future 4.87 (10,807), Caliber 4.84 (6,375), Coachify AI 4.62 (2,018). Source: `https://itunes.apple.com/search?term=<name>&entity=software`. Exercise.com has no coach-facing app under its own name in the results (only "Daxko Exercise", 3.30, 23 ratings); no reviews were gathered for it.

## Q1. Per platform: core flows, navigation structure, standout interactions

### Takeaway
Only vendor-page feature lists were obtainable; I could not log in or reach help-center walkthroughs, so tab-by-tab navigation is mostly NOT documented here. What is evidenced: the market splits into "programming-first" tools (TrueCoach, TrainHeroic, CoachRx, Hevy Coach) and "all-in-one business" tools (Everfit, Kahunas, Trainerize, PT Distinction); the coach mobile apps are weaker than the web dashboards almost everywhere.

### Cited Findings
- Everfit (VENDOR): feature modules named Coach, Engage, Manage, Scale; AI workout builder, MacroSnap instant meal scanning, habit tracking with daily insights, community forum, challenges, group check-ins, broadcast messaging, booking, integrated payments incl. HSA/FSA, white-label app, marketplace (beta), forms and questionnaires for check-ins — [Everfit features](https://everfit.io/features/)
- TrueCoach (VENDOR): drag-and-drop workout builder (AMRAP, strength sets), reusable templates, 3,500+ exercise videos, client list filter by name or program due date, archive for clients on a break, automated compliance-risk alerts, progress photos and custom metrics, group chat and media messages for form cues, badges and daily/weekly/monthly habits, wearable sync (Apple Health, Garmin, WHOOP, OURA), printable PDF workouts, nutrition only as documents plus a MyFitnessPal integration, no AI features described on the page — [TrueCoach features](https://truecoach.co/features/)
- Kahunas (VENDOR): 1,700+ exercise library, "Roadmaps" that plan a season in phases on one timeline, check-ins/habits/metrics charted over 7/30/90 days, meal plans with macros per meal from 1.5M+ foods, "Crew" AI assistants that triage clients, draft programs and send scheduled briefings, communities with an "who needs a reply" view, challenges, courses, white-label app with own domain, install without an app store — [Kahunas](https://www.kahunas.io/)
- Trainerize (VENDOR blog, Oct-Nov 2026): recent posts are about AI client check-ins (26 and 29 Oct 2026), a Meal Plan Generator (23 Oct), automation (4 Nov) and an "ABC Trainerize Updates" post (9 Nov 2026) covering AI tools and "smoother experiences across mobile and wearable devices"; excerpt truncated, details not verified — [Trainerize blog](https://www.trainerize.com/blog/)
- Standout interactions praised by coaches in reviews: TrueCoach programming UI is "genuinely one of the cleanest in this space" and the client app is "well-designed" (Reddit, 13 May 2026, poster running 70 clients) — [r/personaltraining](https://reddit.com/r/personaltraining/comments/1tc0k99/after_the_truecoach_outage_looking_at/); CoachRx is "the fastest for program build out, easiest for navigating as well as client contact" per an end client, 5 stars, 9 Aug 2026 — [App Store us CoachRx](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1544150077/sortby=mostrecent/json); Trainerize "super easy and quick to make" programs, though "FAR from perfect" (Reddit, 31 Aug 2026) — [comment](https://reddit.com/r/personaltraining/comments/1w27oac/is_it_just_me_or_does_every_pt_app_trainerize/p6vx7ra/)
- Client-side standout: Everfit's animals/pets gamification is cited as the reason one client stays: "the biggest motivation", 3 stars, 20 Oct 2026 — [App Store us Everfit](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1438926364/sortby=mostrecent/json); Trainerize "checking off items helps motivate me", 5 stars, 6 Nov 2026 — [App Store us Trainerize](https://itunes.apple.com/us/rss/customerreviews/page=1/id=516851502/sortby=mostrecent/json)
- Future (human coach consumer app) client voice: coaching is the product, app is secondary: "Love the personalization and accountability. The app overall works well", 5 stars, 23 Oct 2026; "Virtual training has been even better than an in-person trainer", 5 stars, 2 Nov 2026 — [App Store us Future](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1288178982/sortby=mostrecent/json)
- Caliber: the PC/laptop version is praised by a client: "very, very helpful", 4 stars, 6 Nov 2026; a gb user wants "just to keep track of my own workout and this app is perfect", 5 stars, 7 Nov 2026 — [App Store Caliber](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1482405410/sortby=mostrecent/json)

### Inferences
- The one UI value the market agrees on is speed of program building plus a clean client logging screen. Nobody is praised for navigation or visual design; praise is for "easy", "organized", "no fuss".
- Coach mobile apps are an afterthought (see Q2), so a coach-first mobile experience is an opening.

### Gaps
- Exact tab/sidebar structure, onboarding steps, check-in and assessment flows for each platform: not retrievable without login or help-center fetches; Exa failed. Needs a second pass (help centers, YouTube walkthroughs).
- Exercise.com, Harbiz, Coachify (consumer AI workout app, not a coach OS), Hevy Coach: only store rows, no feature-page data gathered.

## Q2. What coaches and clients PRAISE and COMPLAIN about (review data points and theme counts)

### Takeaway
Of ~75 individual App Store fragments and ~25 Reddit/Trustpilot points collected below, the dominant complaint is not missing features but reliability: bugs after updates, sync, and logging friction. The dominant praise is "easy / organized / keeps me accountable". Billing and cancellation traps are the top 1-star driver for PT Distinction, Coachify and CoachRx.

### Cited Findings
Each line: platform, stars, date, fragment. Store source for all App Store rows is the feed URL for that app id (pattern above); region in brackets.

**Trainerize** (client app unless stated)
- 3*, 8 Nov 2026 [us], coach: "As a coach working with both gym clients and my own private clients, I am beyond frustrated" (switching between accounts)
- 3*, 8 Nov 2026 [us]: "an update a few months back... layout... glitchier than ever"
- 1*, 6 Nov 2026 [us]: new update "forcing me to manually update my steps" despite Apple Health link
- 1*, 21 Oct 2026 [us]: app "won't recognize my login despite repeated attempts"
- 2*, 16 Oct 2026 [gb]: Apple Watch needs several restarts; "not as good as used to be"
- 4*, 2 Nov 2026 [us]: "awesome how customizable it is" but heart-rate data mismatches the watch
- 5*, 6 Nov 2026 [us]: "I love having all my diet and exercise in one App"
- 5*, 7 Nov 2026 [us]: "Excellent app, and very organized"
- Trustpilot, 3.1/5 from 103 reviews: 1*, 2 Nov 2026 "App is buggy, requires quite a few additional purchase add-ons"; 1*, 28 Apr 2026 "now there are a ton of bugs"; 1*, 8 Sep 2026 "App keeps wiping logged sets"; 1*, 1 Oct 2026 "Absolutely useless customer service"; 3*, 16 Oct 2026 "data import quality can be shockingly bad"; 4*, 18 Feb 2025 "the library is an absolute joke though"; 5*, 16 Sep 2026 "intuitive to learn with a huge amount of support"; 5*, 26 Aug 2026 "The absolute best coaching app I've ever tried" — [Trustpilot](https://www.trustpilot.com/review/trainerize.com)
- Reddit r/OnlineCoaching, 5 Feb 2026: Trainerize "felt clunky for macros and habit stuff and I got fed up of the upsells" (poster then recommends PT Distinction; possible vendor-affiliated, unverified) — [thread](https://reddit.com/r/OnlineCoaching/comments/1qnor1p/comparing_online_coaching_platforms_any_experience/)
- Reddit, 25 May 2026: Trainerize publishes incident history at status.trainerize.com; other platforms "offer zero visibility", read as a red flag — [thread](https://reddit.com/r/personaltraining/comments/1tc0k99/after_the_truecoach_outage_looking_at/)

**TrueCoach** (client app 1439127794 and coach app "Connect" 1445214677)
- 2*, 11 Oct 2026 [us]: "features feel behind other fitness apps"; switched from another app that allowed invites
- 2*, 4 Oct 2026 [gb]: "Logging reps and weights very long winded... Caliber app is much easy"
- 3*, 22 Sep 2026 [gb]: a CrossFit client "can't input my exercises for my coach to review"; app is "good but rigid"
- 4*, 5 Nov 2026 [us]: "No complaints outside of my eyes bleeding every time I open it with no dark mode"
- 3*, 7 Oct 2026 [us]: "Trouble loading videos"
- Connect (coach app), 1*, 1 Sep 2025 [gb]: "Completely limited in our ability as coaches to message clients through the app - every time I attempt to open a conversation, it causes the app to crash"
- Connect, 2*, 29 Dec 2024 [us]: "Constant Issues but the price keeps going up"
- Connect, 1*, 24 Sep 2024 [us]: new iOS shows black screen on notifications; "About to switch"
- Connect, 4*, 27 Aug 2020 [us] (older): "Wish I could have both of my TC accounts logged in at the same time"
- Trustpilot, 2.2/5 from 20 reviews: 1*, 7 Nov 2026 "Extremely disappointed with True Coach (Xplor Software)"; 1*, 12 May 2026 "lack of accountability afterwards is what has really destroyed trust"; 4*, 25 Jan 2025 "a little expensive but easy to use for the most part" — [Trustpilot](https://www.trustpilot.com/review/truecoach.co)
- Reddit, 8 May 2026: "they were down for basically 12 full hours, mid week... affected revenue and client relations" — [thread](https://reddit.com/r/personaltraining/comments/1t74i7h/truecoach_outage/); 13 May 2026: coach with 70 clients, ~$11k/mo: outage "cost me a weekend", "two refund requests", "no compensation clause in the TOS" — [thread](https://reddit.com/r/personaltraining/comments/1tc0k99/after_the_truecoach_outage_looking_at/)
- Reddit, 14 May 2026 (5% payment fee, price topic only touched as a UX/trust factor): coach "raising my rates 10%" to offset it — [thread](https://reddit.com/r/personaltraining/comments/1tcyyda/anyone_else_doing_the_math_on_the_truecoach_5/)
- Reddit, 1 Jul 2026: coach's client messages "buried among a bunch of notifications"; asks how to forward or export to Gmail — [thread](https://reddit.com/r/personaltraining/comments/1ukpv14/truecoach_users_any_way_to_get_messages/)

**Everfit** (client 1438926364, coach 1485827117)
- Client 1*, 5 Nov 2026 [us]: "not intuitive and... interferes with the workout... nearly doubles the time of a work out"
- Client 3*, 3 Nov 2026 [us]: wants the daily "save time with autofill" message gone
- Client 1*, 31 Oct 2026 [us]: update "stopped tracking my total weights... the best part"
- Client 3*, 28 Oct 2026 [us]: "Videos Not Playing"; asks for a desktop version
- Client 5*, 28 Oct 2026 [us]: cannot pause the workout timer
- Client 4*, 5 Oct 2026 [us]: PDF export of workouts "not working" correctly
- Coach 3*, 8 Nov 2026 [us]: "can't see a workout preview when picking exercises... I see a tiny thumbnail"
- Coach 1*, 5 Jul 2026 [us]: "so glitchy and crash happy that it straight up can't be used"
- Coach 1*, 2 Jul 2026 [gb]: "Adding workouts to clients is a harder than needs be task"
- Coach 3*, 22 Apr 2026 [us]: "halfway through putting a workout together and the app will glitch... your workout gone"
- Coach 5*, 19 Jan 2026 [us]: "developers do a great job taking in feedback"
- Coach 5*, 20 Jan 2026 [us]: "efficient and flexible... a wide variety" of programming
- Reddit, 8 Aug 2026: coach asks why Everfit "won't let us hide the 'macros' feature on a client's homepage" — [thread](https://reddit.com/r/personaltraining/comments/1vieuas/everfit_why_macros_and_how_to_hide_them/)
- Reddit, 14 Aug 2026: white-label matters only "as you grow"; another: "Nobody will care"; another: "It's all about the UI/UX"; a CoachRx client noticed the new coach logo only when told — [thread](https://reddit.com/r/personaltraining/comments/1vogb8m/does_your_client_app_have_your_branding_or_does/)
- Reddit, 25 Sep 2026: "Everfit running slow... blank white screen" — [thread](https://reddit.com/r/personaltraining/comments/1wq4awv/everfit_running_slow_for_anyone_else/)

**PT Distinction** (55 rows; billing is the story)
- 1*, 26 Sep 2026 [us]: "started charging me two years after I cancelled"
- 1*, 5 Sep 2026 [us]: "still paying... over a year after I thought I had cancelled... No email or billing notice"
- 3*, 25 Dec 2025 [us]: "App is Basic... works but no frills"
- 2*, 3 Aug 2025 [us]: "cumbersome for clients to use to record their own workouts. Having to toggle back-and-forth between pages"
- 3*, 12 Nov 2025 [gb]: wants to "upload photos/screen shots to the workouts and not just videos"
- 5*, 14 May 2025 [us]: "Tracie tailors my nutrition" (coach-delivered value)
- Reddit coach, 17 Jul 2026: PT Distinction "progress tracking features have really saved me time... workouts completed, measurements, habits and check-ins, so you are not... like 5 apps on the go" — [thread](https://reddit.com/r/personaltraining/comments/1un9e8a/whats_the_best_pt_software_for_tracking_progress/)

**Kahunas** (3.3 stars, lowest of the group)
- 1*, 10 Nov 2026 [gb]: "number of times this app goes down for updates / maintenance is ridiculous. No warnings"
- 1*, 2 Jun 2026 [gb]: "nutrition information on food is constantly wrong and it's a pain to update"
- 1*, 12 Aug 2026 [gb]: "Too expensive for what it is and once you have your app you're tied to them"
- 4*, 7 Oct 2026 [us]: "badges don't show up. I always miss messages from my coach"
- 5*, 24 Sep 2026 [gb]: "no other app can really compare, I miss this app so much"
- Hevy Coach 2*, 21 Jun 2026 [gb], coach who used Kahunas before: "So much potential" (Hevy personal app praised)

**My PT Hub** (327 rows)
- 2*, 5 Nov 2026 [us]: "Latest update broke basic functions"... app "just freezes"
- 1*, 5 Nov 2026 [us]: "progress in weights not tracked from workout to workout"; update removed exercise tagging
- 1*, 6 Sep 2026 [us]: client "text my coach to tell him that I don't see anything for the day"; fix is to log out and reload
- 4*, 14 Aug 2026 [gb]: update broke logging a 0.5 jogging speed
- 5*, 10 Feb 2026 [ae]: "Other apps are stupidly expensive. This is hands down the" best
- Reddit, 8 Aug 2026 (16 upvotes): "coaching apps bolting on features. MYPTHUB is just slapping on... AI workout builders... 'no, you don't have to build programs'... backwards" — [thread](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/)

**CoachRx**
- 3*, 17 Oct 2026 [us]: "UI isn't super friendly. An in app timer for between sets/rest would be a win"
- 1*, 24 Sep 2026 [us]: "so many features that require extra work to access"
- 2*, 18 Aug 2026 [us]: "hard time saving information into 'lifestyle'... so confusing"
- 1*, 23 Feb 2026 [us]: "The save button should be at the top... keyboard opening"
- 1*, 8 Jul 2026 [us]: "Bad UI, bad customer service. Refused to refund after trial"
- 5*, 9 Aug 2026 [us]: "fastest for program build out... they helped transfer all" data
- 5*, 1 Aug 2026 [us]: HYROX plan "genuinely personalized instead of one-size-fits-all"
- Reddit, 14 May 2026: "Migration is a couple clicks on CoachRX... more reliability" — [thread](https://reddit.com/r/personaltraining/comments/1tc0k99/after_the_truecoach_outage_looking_at/)

**TrainHeroic**
- 1*, 6 Nov 2026 [gb]: "Hard to navigate"
- 3*, 4 Nov 2026 [us]: "connecting fitness tracker... feels like a miss"
- 3*, 26 Oct 2026 [us]: wants "Bulk update workouts"
- 1*, 15 Oct 2026 [us]: "closes the timer if the phone idles"
- 4*, 4 Sep 2026 [us]: "need to have a method to rearrange exercise order"; "rest timer is great"
- Reddit coach, 15 May 2026: moved TrueCoach to TrainHeroic; marketplace buyers "don't count towards your monthly cost" — [thread](https://reddit.com/r/personaltraining/comments/1tc0k99/after_the_truecoach_outage_looking_at/)
- Reddit coach, 15 May 2026: TrainHeroic for programming plus "the apps chat function and Google Sheets for check ins" — [thread](https://reddit.com/r/personaltraining/comments/1tcyyda/anyone_else_doing_the_math_on_the_truecoach_5/)

**Harbiz** (only 7 rows, Spanish-market; low confidence)
- 2*, 31 Aug 2026 [us]: "la interfaz es terrible y no hay manera de personalizarla" (colour contrast)
- 2*, 14 Nov 2024 [us]: "Sin Wi-Fi no funciona": cannot tick an exercise offline

**Hevy Coach** (9 rows; new coach app)
- 1*, 2 Nov 2026 [gb]: "no longer opens"; coach forced to use phone instead of iPad
- 2*, 17 Jun 2026 [us]: "Coach app is next to useless... you have to use the web front"
- 1*, 8 Apr 2026 [gb]: client profile photos disappear; exercise videos "don't work"
- 5*, 18 Jul 2026 [us]: "Finally found an app that doesn't make my brain hurt. Has everything you need to coach, track, and communicate in a simple layout"
- 5*, 23 May 2026 [us]: "It's no fuss and easy to understand so my clients just buy in"

**Future** (human coach consumer app)
- 1*, 9 Nov 2026 [us]: watchOS app "not loading. Or dying in the middle of a workout"
- 2*, 22 Oct 2026 [us]: "Prices have gone up, quality has declined... trainers are stretched thin"
- 1*, 21 Oct 2026 [us]: "Great coach, terrible company"
- 1*, 16 Oct 2026 [us]: "Price up quality down"
- 5*, 31 Oct 2026 [us]: "Four years and going strong"

**Caliber** (consumer app with coaching)
- 1*, 16 Oct 2026 [us]: "extremely limited exercises"
- 2*, 21 Sep 2026 [us]: "Lots of standard machines not even on there"
- 1*/2*, Jul-Aug 2026 [us]: "Definitely not free", "Scam likely" (trial billing confusion)

**Coachify AI** (consumer AI planner; 117 rows)
- 1*, 10 Jun 2026 [us], 12 Apr 2026, 30 Mar 2026, 25 Feb 2026: cancellation and unauthorised-charge complaints ("Charged $59.99 for a subscription I never authorized")
- 5*, 30 Aug 2026 [us]: "Even if you have zero experience with weight training, it does a great j[ob]"

**Meta, Reddit category-level**
- Founder-style market probing: "Is it just me, or does every PT app (Trainerize, Everfit, TrueCoach) have glaring flaws?" The poster says tools are "clunky for the trainer, annoying for the client to log into, or missing simple tools (like decent nutrition tracking or good exercise swap logic)" (30 Aug 2026, r/personaltraining; comments suggest poster was market-researching) — [thread](https://reddit.com/r/personaltraining/comments/1w27oac/is_it_just_me_or_does_every_pt_app_trainerize/)
- Reddit coach (score 16 post, 8 Aug 2026): "I have used Trainerize, Mypthub, Kahunas and Truecoach, and they all have the exact same issue I have to make my own power tools to use the data effectively as I scale" — [thread](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/)
- Reddit comment, 8 Oct 2026: UI "so bad you need to build your own tools to use it... racing to add AI to the feature list... nobody fixes the basic workflow" — [comment](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/pelpg8a/)
- Reddit comment, 19 Aug 2026: coach "still needs a clean answer to: what happened with this client this week and what do I need to do next?" (the commenter discloses running a competitor, Conviboost) — [comment](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/p4l02hj/)
- Reddit, 2 Nov 2026: new solo coach with 20 online, 5 in-person clients: "analysis paralysis"; best results with spreadsheets for motivated clients, but low-adherence clients need an app that "integrates to their iPhone/Galaxy/MFP" — [thread](https://reddit.com/r/personaltraining/comments/1xm05vb/helpanalysis_paralysis_for_coaching_software/)
- Reddit, 4 Jul 2026: wants one place for "programming, messages, check-ins and client progress" instead of "WhatsApp and spreadsheets" — [thread](https://reddit.com/r/personaltraining/comments/1un9e8a/whats_the_best_pt_software_for_tracking_progress/)

**Theme counts across the data points above (approximate, one count per fragment; fragments can carry two themes)**
- Bugs/crashes/freezes, often right after an update: ~22 (Trainerize x6, My PT Hub x5, Everfit x5, TrueCoach Connect x4, Kahunas x1, Hevy Coach x3, CoachRx x1, Future x1)
- Logging friction/too many taps/rigid structure (client side): ~9 (TrueCoach x3, Everfit x3, PT Distinction x1, TrainHeroic x1, CoachRx x1)
- Wearable/Apple Health sync gaps: ~8 (Trainerize x4, TrainHeroic x2, Kahunas x1, Future x1)
- Billing, cancellation, refund and price-rise complaints: ~14 (PT Distinction x2, Coachify x5, CoachRx x1, TrueCoach x3 incl. 5% fee, Kahunas x1, Future x2)
- Outage or reliability trust: ~7 (TrueCoach x4, Kahunas x1, Everfit x2)
- Support unresponsiveness: ~5 (Trainerize x2, TrueCoach x1, CoachRx x1, Kahunas/Coachify implied)
- Bloat/too many features, AI bolted on, no coach overview: ~5 (Reddit threads above)
- Praise: "easy / simple / organized": ~11; accountability or motivation (checklists, pets, coach): ~6; fast programming: ~4; responsiveness to feedback: ~3

### Inferences
- Counts are indicative only (hand-tallied, recent-skewed). The ranking of themes is more reliable than the numbers.
- Trust events (outage, hidden fee, uncancellable billing) cost more goodwill than missing features; Arabic-first pricing and billing transparency can be a stated product principle.
- Cleanliness plus speed is what wins praise, even for apps with low star ratings.

### Gaps
- Google Play, G2, Capterra reviews: not reached (Exa failure, G2 403). Trustpilot only for Trainerize and TrueCoach.
- No reviews for Exercise.com; Harbiz and Hevy Coach have too few rows to generalise.
- No ae/sa store rows exist for most apps; the feed returned little for Arabic markets. Whether any gcc user reviews exist for Trainerize beyond a few `ae` rows from 2017-2022 (e.g. "Apple Health" sync complaint, 3*, 2020) was not examined.

## Q3. What is genuinely new in 2025-2026 (AI, automation, habits, form review, wearables, community, gamification)

### Takeaway
AI is now the headline feature at every vendor, but coaches in Reddit threads respond with irritation, not excitement, when AI replaces plan-building rather than reduces weekly review work.

### Cited Findings
- Everfit (VENDOR, current): AI workout builder, MacroSnap meal scanning, "AI Suite", AI marketplace matchmaking, community forum and challenges, group check-ins, habit tracking with daily insights, marketplace beta — [Everfit](https://everfit.io/features/)
- Kahunas (VENDOR): "Crew" AI assistants that triage clients, draft programs and send briefings; AI insights that summarise check-ins, habits and metrics — [Kahunas](https://www.kahunas.io/)
- Trainerize (VENDOR blog, Oct-Nov 2026): AI check-in assistance, Meal Plan Generator, AI tools announced 9 Nov 2026 — [blog](https://www.trainerize.com/blog/)
- My PT Hub (as reported by a coach, not verified on vendor page): landing page promotes AI workout builders with the tagline "no, you don't have to build programs" — [Reddit 8 Aug 2026](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/)
- TrueCoach (VENDOR): no AI described; instead automated compliance-risk alerts, wearable sync (Apple Health, Garmin, WHOOP, OURA), HSA/FSA payments via Truemed (Reddit confirms the LMN flow, 7 Oct 2026) — [TrueCoach](https://truecoach.co/features/), [Reddit](https://reddit.com/r/personaltraining/comments/1x06821/has_anyone_used_an_hsa_to_pay_for_personal/)
- Reddit coach take on AI, 15 Aug 2026: most of the "time cost" is "re-reading the same data every week to figure out who actually needs attention" — flag "two or three trend changes (missed check-ins, adherence dropping...)" — [comment](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/p3t99t6/)
- AI check-in framing by Trainerize: "give clients more attention while saving time" (VENDOR) — [blog](https://www.trainerize.com/blog/)

### Inferences
- "Triage" (who needs me today) is where AI is both asked for by users and weakly delivered; plan-generation AI is table stakes and criticised as a distraction.
- Video form review: only TrueCoach's media messages for "form cues" and Everfit "forms" are documented; no dedicated video-form-review workflow evidenced. A PT Distinction client wishes to upload photos/screenshots and "not just videos" (3*, 12 Nov 2025, gb).

### Gaps
- Real adoption/quality of any AI feature: no user reviews found that discuss it; all AI evidence is vendor-authored.
- Habit coaching depth, wearables beyond sync, community usage: no review evidence located.

## Q4. What users repeatedly ASK FOR that nobody delivers well

### Takeaway
Repeated asks cluster around (1) a single "who needs me and what happened this week" overview, (2) reliable offline/simple logging, (3) deep wearable and Apple Health sync, (4) controllable client-facing UI (hide macros, dark mode, branding), (5) a full-power coach mobile app, (6) status transparency and fair billing.

### Cited Findings
- Coach overview across clients: coach "has to make my own power tools to use the data effectively as I scale" (Reddit 8 Aug 2026) and "twenty tabs to go over a client's week" — [thread](https://reddit.com/r/personaltraining/comments/1vitfm6/wow_another_bloated_feature/)
- Message triage: coach missing client messages "buried among a bunch of notifications" (Reddit 1 Jul 2026) — [thread](https://reddit.com/r/personaltraining/comments/1ukpv14/truecoach_users_any_way_to_get_messages/); a Kahunas client: "badges don't show up. I always miss messages from my coach" (4*, 7 Oct 2026 us)
- Offline logging: Harbiz client cannot tick exercises without network (2*, 14 Nov 2024); Trainerize user reports Wi-Fi-dependent login problems (3*, 18 May 2019 ae, older)
- Wearables/Apple Health: Trainerize steps manual entry (1*, 6 Nov 2026), Apple Watch restarts (2*, 16 Oct 2026), TrainHeroic Apple Health (4*, 1 Nov 2026) and tracker connection "feels like a miss" (3*, 4 Nov 2026), Kahunas "log in to Apple Workout" (3*, 24 Oct 2026), Everfit/Google Health thread removed 29 Oct 2026 — [list](https://reddit.com/r/personaltraining/comments/1xip45q/everfit_app_and_google_health/)
- Client-facing control: hide macros (Everfit, Reddit 8 Aug 2026), dark mode (TrueCoach, 4*, 5 Nov 2026), hide upsell prompts (Everfit "autofill" message, 3*, 3 Nov 2026), pause workout timer (Everfit, 5*, 28 Oct 2026), rest timer in-app (CoachRx, 3*, 17 Oct 2026), rearrange exercise order (TrainHeroic, 4*, 4 Sep 2026), bulk update workouts (TrainHeroic, 3*, 26 Oct 2026), exercise preview when choosing exercises (Everfit Coach, 3*, 8 Nov 2026)
- Coach mobile parity: Hevy Coach "next to useless... you have to use the web front" (2*, 17 Jun 2026); Everfit Coach "Adding workouts to clients is harder than needs be" (1*, 2 Jul 2026); Everfit Coach loses unsaved workout on glitch (3*, 22 Apr 2026)
- Multi-account/role: Trainerize coach switching between gym and private accounts (3*, 8 Nov 2026); TrueCoach "both of my TC accounts logged in at the same time" (older, 2020)
- Client logging of off-programme training: TrueCoach CrossFit client "can't input my exercises" (3*, 22 Sep 2026 gb)
- Reliability and transparency: Trainerize praised for a public status page; TrueCoach outage with no compensation (Reddit May 2026); Kahunas "No warnings" before maintenance (1*, 10 Nov 2026)
- Nutrition quality: "decent nutrition tracking or good exercise swap logic" missing (Reddit 30 Aug 2026); Kahunas food data "constantly wrong" (1*, 2 Jun 2026); My PT Hub regular meals not updating (3*, 9 Jul 2026 gb); Trainerize "macro/meal" complaints relayed (Reddit 26 Jan 2026 OnlineCoaching)
- Price and fee fairness (context only; pricing research is out of scope): TrueCoach 5% fee reaction, Kahunas "tied to them", Future "Price up quality down"

### Inferences
- A coach "today" screen that answers "who needs me, what happened this week, what do I do next" is the single most repeated unmet need and none of the evidenced platforms is praised for it.
- Offline-first logging, real Apple Health/Health Connect sync, and a coach mobile app with web parity are repeated gaps.
- Client-side control of what is shown (hide macros, branding) is a cheap differentiator.
- No Arabic or RTL evidence appeared in any review set (the ae rows were English); Arabic-first is an unaddressed segment, but demand cannot be proven from this data.

### Gaps
- Official feature-request boards (Trainerize, Everfit, TrueCoach, Kahunas, My PT Hub): not reached.
- Google Play reviews and G2/Capterra: not reached; Reddit coverage limited to r/personaltraining and r/OnlineCoaching (r/fitness not searched), and "Trainerize" queries via the Arctic Shift search returned HTTP 422, so Trainerize Reddit threads were reached only through multi-platform threads.
- Several Reddit comments are competitor promotion (lvlup, Conviboost, coachingportal, "trainflowy", PT Distinction-adjacent posts) and were excluded or flagged.
