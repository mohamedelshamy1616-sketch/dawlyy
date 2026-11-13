# AI nutrition and meal-photo-to-calories apps: teardown for DAWLYY (as of Nov 2026)

Scope note: research run with about 15 tool calls. Exa timed out twice, so web search plus direct fetches were used. App Store feed data was pulled by script on 2026-11-13. Vendor-authored claims are marked **[VENDOR]**. Items I could not source are in the Gaps lists, not in the findings.

## 1. Apps covered: how each photo flow works, speed, uncertainty handling, correction

### Takeaway
Photo logging is now table stakes (Cal AI, MyFitnessPal, Lose It!, SnapCalorie, Foodvisor, Yazio, Lifesum, MacroFactor all have it), but few sources document the confirm/edit flow in detail. The sourced differentiators: MacroFactor splits a meal into editable ingredient entries and prefers verified database items; SnapCalorie uses LiDAR depth on Pro iPhones; MyFitnessPal positions its scan as the accuracy-over-speed product after buying Cal AI.

### Cited Findings
- MyFitnessPal acquired Cal AI (closed Dec 2025, announced 2 Mar 2026, terms undisclosed); Cal AI stays a separate app; MFP's CEO said Cal AI is for people who prefer speed over accuracy and MFP's photo scan for the reverse, and that MFP users can fine-tune inputs "down to specifying three pickles, not two". Cal AI data is linked to MFP's database (20M foods, 68,500 brands, 380+ restaurant chains per TechCrunch) — [TechCrunch, 2 Mar 2026](https://techcrunch.com/2026/03/02/myfitnesspal-has-acquired-cal-ai-the-viral-calorie-app-built-by-teens)
- MacroFactor photo/text/voice AI logging **[VENDOR, own comparison page]**: breaks a meal into individual food entries (recipes plus single foods) shown on a unified "plate", favours verified database entries, creates a new entry only when needed, and says it "does not rely on LLMs to generate all food entries"; the user adjusts ingredients and portions until the log matches. Claims it beat Cal AI against weighed portions in one internal test (no sample size) and needs 10 actions vs 19 for Cal AI in its own "Food Logging Speed Index". Says Cal AI sometimes hid ingredients when confidence was low. Pricing listed there: 7-day trial, $11.99/mo, $71.99/yr; Cal AI about $9.99/mo — [MacroFactor vs Cal AI](https://macrofactor.com/macrofactor-vs-cal-ai/)
- MacroFactor staff on Reddit (r/MacroFactor, thread "Is MacroFactor more accurate than Cal AI?", about May 2025) acknowledged "weird entropy in the requests that like to add extra ingredients or map them incorrectly", with model upgrades coming — [thread](https://reddit.com/r/MacroFactor/comments/1kqpvdg/is_macrofactor_more_accurate_than_cal_ai/)
- SnapCalorie **[VENDOR, App Store listing]**: measures volume with LiDAR on iPhone Pro; estimates portion visually on other phones; voice notes can assume average portions if none given; claims about twice the accuracy of visual portion estimation — [App Store](https://apps.apple.com/us/app/-/id1574239307)
- Cal AI advertised "92% accuracy" (quoted by a Saudi reviewer, 2024-10-12, who found it "extremely inaccurate"); a review roundup also lists 92-97% for common foods. I found no independent verification — [SA feed](https://itunes.apple.com/sa/rss/customerreviews/page=1/id=6480417616/sortby=mostrecent/json); [Fitia review (secondary)](https://fitia.app/learn/article/ai-calorie-photo-apps-accuracy-2026/)
- Cal AI user reviews mention a "fix issue / fix results" button and label/barcode scan as fallbacks (quotes in section 3) — [US feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=6480417616/sortby=mostrecent/json)
- Foodvisor reviewer (2026-11-09, 4 stars): photo AI "not accurate" but the item can be adjusted after the photo; barcode works. Another (2026-11-08, 5 stars) likes photo plus describe-what-you-ate — [Foodvisor feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=1064020872/sortby=mostrecent/json)
- Yazio replaced manual Quick Add with "AI Quick Add"; a reviewer (2026-07-24, 1 star) says it is slower and often miscalculates — [Yazio feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=946099227/sortby=mostrecent/json)
- Lifesum reviewer (2026-10-16, 1 star): AI wrong "90% of the time" and "no way to edit"; another (2026-11-07) says AI just errors — [Lifesum feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=286906691/sortby=mostrecent/json)
- MyFitnessPal reviewer (2026-11-09, 2 stars): the old meal scan was better; the new AI meal logging adds "4-5 unnecessary steps" and is less accurate — [MFP feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=341232718/sortby=mostrecent/json)
- App Store listings (us store, rating and count at fetch): Cal AI 4.80 (375,257), MacroFactor 4.84 (24,004), MyFitnessPal 4.71 (2,392,702), Lose It! 4.77 (784,315), SnapCalorie 4.73 (7,043), Foodvisor 4.60 (18,436), Yazio 4.70 (51,851), Lifesum 4.65 (151,030), Fastic 4.80 (246,093), Carbon 4.83 (8,151), Noom 4.70 (874,252) — [iTunes search API](https://itunes.apple.com/search?term=cal+ai&entity=software&country=us)
- Trainerize: no AI food-photo calorie feature found; coaches request one on its ideas board; MacroFactor reviewed as having no coach view — [Trainerize ideas](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/48128330-use-ai-to-calculate-macros-and-calories-through-fo); [coachway (secondary)](https://coachway.io/articles/best-calorie-tracking-apps-for-coaching-clients/)

### Inferences
- The common design: AI proposes an ingredient list plus portions, user edits. MacroFactor's ingredient-level breakdown and MFP's item-level editing target the exact complaints (wrong ingredient, wrong amount).
- No competitor found is coach-in-the-loop; that is an open gap DAWLYY can own.

### Gaps
- Step-by-step flows, tap counts and claimed latency for MFP Meal Scan / voice log, Lose It! Snap It, Foodvisor, Yazio, Lifesum, Fastic, Carbon, Noom: not found in fetchable sources. Needs hands-on testing.
- Bitesnap: the iTunes search returned an unrelated "BiteSnap: AI Calorie Counter" (id 6747975537, 1 rating); the original Bitesnap was not found, so no data.
- Noom and Fastic photo features: no sourced detail.

## 2. Measured accuracy: independent studies (2024-2026)

### Takeaway
Independent evidence says photo AI underestimates energy (about a third in a 2026 NIH-led abstract on commercial apps) and general LLMs show 36-64% energy error with systematic under-estimation of large portions. Food identification is good (F1 about 89%); portion size and hidden fat are the weak point. No Arabic-food accuracy study was found.

### Cited Findings
- NIH-led conference abstract (NUTRITION 2026, 25-28 Jul 2026), 102 nutrient-controlled meals, apps: Appediet, Cal AI, Lose It!, MyFitnessPal. Photo AI underestimated energy by about 33%. Mean underestimate: Appediet 252 kcal, MyFitnessPal 327, Lose It! 333, Cal AI 345 (95% CI 296-392). Carbs under by about 14 g (Cal AI, Lose It!); fat under by about 30 g in all four. Preliminary follow-up on 200+ more meals suggests worse on low-carb/high-fat meals. Conference abstract, not peer reviewed — [Healio, 4 Aug 2026](https://www.healio.com/news/primary-care/20260804/ai-photobased-calorietracking-tools-underestimate-them-by-33); [News-Medical, 26 Jul 2026](https://www.news-medical.net/news/20260726/Photo-based-calorie-tracking-apps-fall-short-in-estimating-meal-nutrition.aspx)
- Fridolfsson et al., Current Developments in Nutrition, 2025: ChatGPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro on 52 standardised photos. Energy MAPE 35.8% / 35.8% / 64.2%; protein 60.7% / 61.7% / 109.9%; carbs 47.9% / 72.8% / 66.1%; fat 51.8% / 41.7% / 89.6%. Mean energy bias -10.0 / -18.9 / +65.0 kcal. Underestimation grows with portion size (energy slope -0.45 / -0.34 / -0.41); small portions 20-30 percentage points more accurate than large. Authors: comparable to traditional self-report, not suitable for precise clinical or athletic use — [PMC12513282](https://pmc.ncbi.nlm.nih.gov/articles/PMC12513282/)
- O'Hara et al., Nutrients, Feb 2025: ChatGPT-4 vs 7 dietitians on 38 medium-portion meal photos. Dietitian ICC: energy 0.56, protein 0.67, carbohydrate 0.31; removing ChatGPT did not significantly change them. Food ID precision 93.0%, recall 84.6%, F1 88.6%. Meal weight matched for small meals, underestimated for medium and large; underestimated weight in 76.3% of photos; mean absolute percentage difference 26.9% across nutrients; 10 of 16 nutrients significantly different. Small exploratory study — [PMC11858203](https://pmc.ncbi.nlm.nih.gov/articles/PMC11858203/)
- arXiv 2507.07048 (2025): eight multimodal models; accuracy depends heavily on prompt wording; contextual metadata helps (snippet only, numbers not read) — [arXiv](https://arxiv.org/pdf/2507.07048)
- DiaBot custom GPT-4o (AJCN, Dec 2025): recognised 74% of food items from images alone vs 59% for stock GPT-4o (snippet only) — [UMN](https://experts.umn.edu/en/publications/customized-multimodal-diabot-gpt-4o-enhances-accuracy-of-image-ba/)
- Registered trial NCT05343585 compares Nutrition AI automated vs with user correction against weighed food; protocol only, no results found — [ClinicalTrials.gov](https://clinicaltrials.gov/study/NCT05343585)
- Listed but not read: Nutrients 2026 hospital-meal study (registered dietitians estimating 15 meals from photos); Kim et al., Proc Nutr Soc 2025 (ZOE PREDICT meal photos, LLM photologging) — [Nutrients 18(966)](https://mdpi-res.com/d_attachment/nutrients/nutrients-18-00966/article_deploy/nutrients-18-00966.pdf); [Cambridge](https://www.cambridge.org/core/journals/proceedings-of-the-nutrition-society/article/leveraging-imagebased-ai-for-dietary-assessment-evaluating-a-large-language-model-with-realworld-meal-photos-from-the-zoe-predict-cohorts/64BD22D52D629009CED6A8EF65B3E75A)

### Inferences
- The bias is directional (under-count, worse for big portions and fat). A correction (fat/oil prompt, upward nudge on large portions) is plausible but must be validated on DAWLYY's own data.
- Home portions in Egypt and the Gulf (large rice mounds, shared trays, oil-heavy mahshi and kabsa) sit in the high-error zone.

### Gaps
- No independent test of Egyptian or Gulf dishes with any commercial app or LLM.
- Full NIH abstract (per-app percentages, protein) not available; Healio gives none.
- SnapCalorie independent accuracy, including a "15% average error" figure seen on a blog, could not be traced to a primary source.
- PubMed and Google Scholar were not queried directly; coverage is via web search.

## 3. User reviews: 61 sampled data points and theme counts

### Takeaway
Of 2,089 recent App Store reviews pulled (11 apps; us, eg, sa, ae; pages 1-2 of most-recent), 607 are 1-star and 988 are 5-star. Keyword counts: praise-of-ease about 563, paywall/subscription/billing about 249, accuracy complaints about 82 (strict phrases only). Billing and cancellation complaints concentrate on Cal AI, Foodvisor, Fastic, Noom; accuracy complaints on Cal AI, MacroFactor database, Lifesum, Foodvisor. Arabic-language requests recur in Saudi and UAE reviews.

Method: script in the session scratchpad; keyword regex on title plus text (accuracy: inaccura|not accurate|way off|wrong|overestimat|underestimat|incorrect; paywall: paywall|subscri|charged|cancel|refund|free trial; praise: easy|quick|fast|simple|convenient|intuitive|love). Themes overlap and are indicative, not hand-coded. The 61-row table was picked automatically (2 per theme per app where available). The Apple RSS feed returns no per-review permalink; each row's source is the feed URL `https://itunes.apple.com/{store}/rss/customerreviews/page={1|2}/id={APP_ID}/sortby=mostrecent/json` with IDs: Cal AI 6480417616, MacroFactor 1553503471, MyFitnessPal 341232718, Lose It! 297368629, SnapCalorie 1574239307, Foodvisor 1064020872, YAZIO 946099227, Lifesum 286906691, Fastic 1459260306, Carbon 1437820611, Noom 634598719. Feed content rotates; pulled 2026-11-13.

### Cited Findings
- Store-level counts (2,089 reviews): 5-star 988, 1-star 607, 2-star 173, 4-star 168, 3-star 153 — feed pattern above
- Cal AI, Saudi store 2024-11-23 (1 star): asks why there is no Arabic, "many in the Arab community use this application"; 2025-09-26 (5 stars): "if you add Arabic... I'll subscribe right away"; 2026-01-06 (2 stars): scan "way off most of the time", database lacks foods the user cooks — [SA feed](https://itunes.apple.com/sa/rss/customerreviews/page=1/id=6480417616/sortby=mostrecent/json)
- MyFitnessPal, Egypt 2024-08-23 (5 stars): "Not all food is available, specially egyptian food"; Saudi 2026-10-17 and 2026-07-24: Arabic language requested — [EG feed](https://itunes.apple.com/eg/rss/customerreviews/page=1/id=341232718/sortby=mostrecent/json); [SA feed](https://itunes.apple.com/sa/rss/customerreviews/page=1/id=341232718/sortby=mostrecent/json)
- Cal AI UAE 2025-10-14 (1 star): "WEIGH YOUR FOOD", calls it a scam; UAE 2024-09-21 (5 stars): scanning saves time, can fall back to label scan or manual — [AE feed](https://itunes.apple.com/ae/rss/customerreviews/page=1/id=6480417616/sortby=mostrecent/json)
- Cal AI Egypt 2026-07-07 (1 star): free 7-day trial then billed, no refund — [EG feed](https://itunes.apple.com/eg/rss/customerreviews/page=1/id=6480417616/sortby=mostrecent/json)
- r/loseit 2026-09-30, "How are you guys dealing with the inaccuracy of AI calorie logging apps?" (31 comments): top reply says a 2D image cannot tell 150 g of rice from 300 g, and the slow part of tracking is searching the app, not weighing (saved meals = one tap); another commenter wants apps to show what the AI thinks everything is and let the user correct it. A commenter suspects the post is market research by a would-be vendor — [thread](https://reddit.com/r/loseit/comments/1wu1poh/how_are_you_guys_dealing_with_the_inaccuracy_of/)
- r/loseit 2026-11-03, "Do you actually trust photo-based calorie scanners...": post removed by moderators, no content — [thread](https://reddit.com/r/loseit/comments/1xmedhz/do_you_actually_trust_photobased_calorie_scanners/)
- r/MacroFactor (2025): users find AI photo useful for restaurant meals "tweaking it based on your best estimates"; experienced weighers say they guess better than an AI — [thread](https://reddit.com/r/MacroFactor/comments/1kqpvdg/is_macrofactor_more_accurate_than_cal_ai/)
- r/MacroFactor 2026-04-06 "MacroFactor vs Cal AI" (score 38) is the vendor's own post — [thread](https://reddit.com/r/MacroFactor/comments/1se5lkk/new_app_insight_macrofactor_vs_cal_ai_which_app/)
- Cal AI 1-star 2026-10-21: reviewer suspects the app was "vibe coded", weak on UX and nutrition science — [US feed](https://itunes.apple.com/us/rss/customerreviews/page=1/id=6480417616/sortby=mostrecent/json)

Table of 61 sampled reviews (all Apple App Store; Store = country code; theme = keyword rule that selected it; 1-3 stars for accuracy and paywall, 4-5 for praise):

| # | App | Store | Date | Stars | Theme | Title - excerpt |
|--|--|--|--|--|--|--|
| 1 | Cal AI | us | 2026-11-03 | 1 | accuracy | Terribly inaccurate - I’ll take a picture of the food and the Protein will not be even close to accurate.. even the barcode reader I scanned a package of ground beef and it input the serving s |
| 2 | Cal AI | us | 2026-11-01 | 3 | accuracy | Good concept but wildly overestimates macros - It’s all in the title. If you upload photos, the app typically wildly overestimates macros. Like if there 8 medium shrimp on my plate, it’ll say I ate 35g protein. I’ll k |
| 3 | Cal AI | us | 2026-11-08 | 1 | paywall | Impossible to cancel subscription - I subscribed with my google account. No longer wanted the subscription but the subscription didn’t appear in my google account. I attempted to delete my cal ai account bu |
| 4 | Cal AI | us | 2026-10-29 | 1 | paywall | Free trial isn’t free + bad support - I signed up on 10/17 for a 30 day free trial and actually really liked the app itself. The issue is that I was charged for the full month on 10/27. My email receipt from  |
| 5 | Cal AI | us | 2026-11-09 | 5 | praise | Love this app! - Super easy and accurate. I’ve been using this app for over a year now and it’s made food tracking so much more convenient. I’ve been able to successfully shred, build mus |
| 6 | Cal AI | us | 2026-11-09 | 5 | praise | I love it! - It is awesome. I use it for everything I consume. If you feel like you need to adjust for something, there is a fix issue button. It’s amazing how sometimes it will pick  |
| 7 | MacroFactor | us | 2026-10-30 | 1 | accuracy | Stick with MyFitnessPal - This app mostly works. But there are so many inaccurate nutrition facts. I have to constantly edit/customize nutrition facts on common foods because they are wildly off.  |
| 8 | MacroFactor | us | 2026-10-26 | 1 | accuracy | Disappointing Experience — Not Worth the Subscription Price - I’ve been using MacroFactor since March, and unfortunately, my experience has deteriorated to the point where I can no longer justify paying for it. I purchased an annual |
| 9 | MacroFactor | us | 2026-10-30 | 1 | paywall | Overpriced subscription, terrible database - Paying for a subscription and can’t even scan a mainstream protein shake label, 106g of protein logged when the shake said 30g 😐 |
| 10 | MacroFactor | us | 2026-10-21 | 3 | paywall | Annoying Subscription Reminders - The app is great at calculating macros for you and works well in general. The most annoying thing is that almost 3!out of 5 times I open it to log throughout the day, it’ |
| 11 | MacroFactor | us | 2026-11-10 | 5 | praise | Game Changer - I’ve been using this app for the past 1.5 years and can’t imagine going without it. It keeps things simple, but really feels like I’m in control of my weight now, and can |
| 12 | MacroFactor | us | 2026-11-09 | 5 | praise | Best macro tracker app - Love the app! Makes it super easy to track my macros! |
| 13 | MyFitnessPal | us | 2026-11-06 | 2 | accuracy | Diary Food Search Becoming Filled With Junk - I’ve used this app for years on and off. It used to be a lot better with regards to food choices and accuracy. Now, all I see are way too many “junk” incorrect nutrition  |
| 14 | MyFitnessPal | us | 2026-11-04 | 2 | accuracy | Protein and Fiber is incorrect - I’ve been using this app for a very long time, years and trusted the output and looking over the macros it’s giving me on items I’m weighing out and putting correctly in  |
| 15 | MyFitnessPal | us | 2026-11-10 | 1 | paywall | Constantly Logs Out - Slow PITA. Disappointing subscription. Loses settings. |
| 16 | MyFitnessPal | us | 2026-11-10 | 1 | paywall | Great app with one limitation - I’ve used this app for 5+ years and have always loved it and I pay for the top tier subscription. They do a good job evolving and doing cool things with the user interfac |
| 17 | MyFitnessPal | us | 2026-11-10 | 5 | praise | Ms - I love MFP! I have used it over 15 years with my streak being over 686 weeks! I’m down 113 pounds with the help of My Fitness Pal. If you’re trying to get to goal and sta |
| 18 | MyFitnessPal | us | 2026-11-10 | 5 | praise | Get it now! - The best app for logging. I’ve tried a few others to log but I love how this app works and it’s perfect for syncing up my Apple Watch. |
| 19 | Lose It! | us | 2026-11-01 | 1 | accuracy | Inaccurate data and doesn’t sync between devices - If you want to have certainty that the data on each food you enter is accurate, you must enter it yourself or check any food on the list. Really sucks. Also, it does not  |
| 20 | Lose It! | eg | 2026-07-31 | 1 | accuracy | Update - Since I updated the app its not like before most items r not found & the scan issue is not accurate |
| 21 | Lose It! | us | 2026-11-10 | 1 | paywall | Wish I had bought lifetime - I’ve been using this app for months and I loved it! Has so many excellent features that make tracking a breeze. However they recently switched over to annual subscription |
| 22 | Lose It! | us | 2026-11-09 | 1 | paywall | Paying for a subscription  can’t even open the app - This is outrageous how they can charge you for something and I can’t even use the app every time I open it just crashes. I reinstalled it crashes. Yet I paid for the whol |
| 23 | Lose It! | us | 2026-11-10 | 5 | praise | Would love a pastel theme! - This app has been my go to for years now. It is truly helped me so much! I was able to buy the lifetime and have been on this app everyday since. Despite the app’s name i |
| 24 | Lose It! | us | 2026-11-10 | 5 | praise | Amazing Buddy - Love the lose it app. Supports me on my health journey. Additional resources are relevant and helpful. Recommend it for your everyday buddy. |
| 25 | SnapCalorie | us | 2026-09-16 | 1 | accuracy | Very inaccurate - Almost no reporting or identification of sugars |
| 26 | SnapCalorie | ae | 2026-07-14 | 3 | accuracy | Miscalculation - It gets the portions wrong a lot of times sometimes it will double the portion size, and it gave a problem to understand what a per 100g when scanning labels , it assumes |
| 27 | SnapCalorie | us | 2026-10-30 | 1 | paywall | Customer service and subscription scam - Stay clear of this product, you can use many other free AI products that do exactly what this does.   When you have a customer service issue they don’t care about the cus |
| 28 | SnapCalorie | us | 2026-11-10 | 5 | praise | Pick your method to log… - Whether you want to weigh your food, manually enter a new food, scan a barcode, snap a picture of the label or just take a picture of your plate…this app allows you to do |
| 29 | SnapCalorie | us | 2026-11-09 | 5 | praise | Great app! - I love this app it’s been so helpful! |
| 30 | Foodvisor | us | 2026-10-27 | 1 | accuracy | Data is inaccurate - The food logging data base and ai isn’t accurate. Also, this refund policy is also not accurate nor is it honored. There’s a lot of great apps out there and this isn’t on |
| 31 | Foodvisor | us | 2026-10-22 | 1 | accuracy | Food info wrong. - I’ve been using this app off and on this year there are a lot of foods that are not put in correctly and there is no way to change it and trying to figure out how to cont |
| 32 | Foodvisor | us | 2026-11-10 | 1 | paywall | Rip off! Dishonest! Won’t respond to emails or cancelation requests/demands - They continued to charge my card for two more months. I finally had to close my card. |
| 33 | Foodvisor | us | 2026-10-29 | 1 | paywall | Basic App and NO SUPPORT - I purchased this app and filled out the extensive questionnaire plus added the add on workout program and meal plan for it to turn out to be a very basic app with feature |
| 34 | Foodvisor | us | 2026-11-09 | 4 | praise | Great! Only one critique - I love this app so far! Only complaint is that the AI is not accurate when taking a picture, but the barcode scanner works and with the AI you can adjust the item with pr |
| 35 | Foodvisor | us | 2026-11-08 | 5 | praise | great app! - i love the option to take a photo of your food and log it that way, as well as describing what you ate, which makes it a lot easier to log foods |
| 36 | YAZIO | us | 2026-08-12 | 3 | accuracy | It’s not as good as it used to be - I used to really like this app. It wasn’t perfect but it let me track my food without nagging me about weight. I keep using it but it’s just so frustrating. Everything tr |
| 37 | YAZIO | us | 2026-07-24 | 1 | accuracy | Love the app hate the new update unless it’s a bug - Please bring back the old Quick Add feature where users could manually enter calories, carbs, protein, and fat. The new AI Quick Add is slower and often calculates incorr |
| 38 | YAZIO | us | 2026-11-09 | 3 | paywall | Great app but - Great app easy to use but the subscription is over priced it’s sad to see that tbh I hope you guys make it lower price |
| 39 | YAZIO | us | 2026-10-19 | 1 | paywall | Every few days crashes - Every few days crashes stating iPhone doesn’t have enough storage for app. It does, it is over 1/2 empty. Just started happening this month -at least to me. I’m sorry I p |
| 40 | YAZIO | us | 2026-10-19 | 5 | praise | Love this app! - I love being able to track my calories. It makes me aware of what I’m eating and obviously more careful because I don’t want to go over my points. It keeps me motivated t |
| 41 | YAZIO | us | 2026-09-27 | 5 | praise | Love! - Very simple and has many features. I also find the AI tracker to be pretty accurate. One thing I wish was a feature is progress photos. It’s still a wonderful app and ver |
| 42 | Lifesum | us | 2026-11-07 | 1 | accuracy | AI does not work - The AI takes no action and just keeps saying something went wrong.  Waste of time.  Better off just manually keeping a log in a pad of paper |
| 43 | Lifesum | us | 2026-10-16 | 1 | accuracy | Terribly Inaccurate - Both the manual entering and AI use are horribly wrong 90% of the time and I do not see a way to edit. Despite the exact bar code being scanned and or a picture of the pr |
| 44 | Lifesum | us | 2026-10-27 | 1 | paywall | Paywall - Everything requires a payment for small petty things |
| 45 | Lifesum | us | 2026-09-17 | 3 | paywall | Used to be a great app, now too many bugs and usability issues - Lifesum used to be a very good app with many useful free features. Over time, more and more basic features have moved behind the paywall. I don’t necessarily have a probl |
| 46 | Lifesum | us | 2026-10-26 | 5 | praise | Best Food Diary App!! - I love this app. It’s easy to use and overall just aesthetically pleasing. I’ve been using it for a while now, and the only thing I wish they would change is the water in |
| 47 | Lifesum | us | 2026-09-10 | 4 | praise | It keeps tweaking - Love this app, but sometimes it doesn’t tell me the accurate calories burned , then all of sudden it does . |
| 48 | Fastic | sa | 2024-12-17 | 1 | accuracy | Great User Interface “only” - - Their support did not answer my email - Food database has wrong or missing data - wrong data caused me health issues  - I couldn’t find a way to refund Uninstalling aft |
| 49 | Fastic | us | 2026-10-19 | 1 | paywall | I WANT OUT - After nearly a year of continuing to have problems and issues with this app, I simply want out. I cannot seem to locate how to end my subscription. Links that I click in  |
| 50 | Fastic | us | 2026-10-07 | 1 | paywall | Seriously don’t use this app - They will scam you thinking you are getting a free year subscription but charge you 44.99 after 3 days! Ridiculous company. I deleted my account and emailed them! They ha |
| 51 | Fastic | us | 2026-10-30 | 5 | praise | Great app! - I really love this app and find it to be a fantastic support for building a healthy lifestyle. My only suggestion is to update the larger Home Screen widget view so that  |
| 52 | Fastic | us | 2026-10-30 | 5 | praise | Fastic is great! - I have used Fastic for over five years now. It keeps focused and on track. I love the memes that are included to keep you motivated. |
| 53 | Carbon | us | 2026-10-08 | 2 | paywall | Measuring Required - The app offers very limited weight and measurement options when logging food, so plan to modify everything you eat and log to their tight parameters. Plan to cancel and f |
| 54 | Carbon | us | 2026-04-06 | 1 | paywall | Bar code scanner not work - Be great app but bar code scanner and label scanner works 50% of the time. Contacted support who can’t resolve the issue or offer a refund I now must go through Apple |
| 55 | Carbon | us | 2026-11-02 | 5 | praise | Great updates! - Each update builds on the previous version. Ease of use and intuitive interface makes tracking easy |
| 56 | Carbon | us | 2026-10-30 | 4 | praise | Helped me lose 10 pounds and maintain that for a year. - App is easy to use once you learn how. Facilitates taking control of your food choices. Hint, use an early choice from the list that’s close to what you eat rather than s |
| 57 | Noom | us | 2026-09-29 | 2 | accuracy | Food Database worthless - I can’t track my food in the Noom app because so much of the nutrition data is wrong. Light & Fit yogurt is listed as having 5 grams of protein when it has 12. Kind break |
| 58 | Noom | us | 2026-11-09 | 1 | paywall | I feel scammed - I signed up for Noom Med wanting to try GLP-1. I know I can’t do needles, so requested the pill format. The first shipment came as injectable. I immediately messaged in t |
| 59 | Noom | us | 2026-11-04 | 1 | paywall | Still Got Charged After Canceling Subscription - I cancelled on the app, and confirmed it, but it still tried to charge me after. Disappointing. |
| 60 | Noom | us | 2026-11-08 | 4 | praise | Easy to use; could be better - They can improve their food database. I have to add a lot of the nutritional information. There are other apps that carry more nutritional information and I don’t have to |
| 61 | Noom | us | 2026-11-01 | 5 | praise | Success! - I just need positive accountability and a little control! I love what Noom offers and the constant support and behavior patterns I can see work and build on. It is a life |

Tallies inside the 61 sample by selection design: accuracy 18 rows, paywall/billing 21, praise 22. Use the 2,089-review counts above for prevalence.

### Inferences
- Photo accuracy complaints are about portion and macros (shrimp protein, rice, protein off) and misidentification; the praised parts are speed and fallback to barcode, label or manual. A "fix this" affordance is explicitly praised for Cal AI.
- Paywall friction (trial then charge, hard to cancel, onboarding that ends in a paywall) is the biggest non-accuracy complaint. Arabic UI is a real unmet demand in SA and AE reviews of the main apps.
- Egyptian-food gaps show up in only one sampled review (MFP Egypt), so demand size is not measured.

### Gaps
- Google Play reviews were not pulled. Reddit searches on r/CICO and r/caloriecount via the archive errored or returned nothing relevant; no hand-coded Reddit theme count. The 50-point target is met by App Store data only.
- Counts cover about 100 most-recent reviews per store, skewed to Oct-Nov 2026 and to the US store.

## 4. Food-recognition APIs and datasets

### Takeaway
Official pricing pages were mostly not retrievable and sources conflict; treat prices as unverified until checked on the vendor site. FatSecret and USDA are the cheapest data sources; Passio and LogMeal are the real photo-recognition options; none documents Egyptian dish coverage. Roboflow and academic sets are too small to ship but useful as evaluation seeds.

### Cited Findings
- Passio Nutrition-AI: Starter $99/month with 1M tokens included, refills $25 per 1M (Passio platform page as summarised by search); token-based usage; SDK needs a key; no official free tier found; third-party directories give conflicting prices ($25/mo; $300 and $3,000 tiers) — [Passio platform](https://www.passio.ai/platform); [token pricing](https://passio.gitbook.io/nutrition-ai/getting-started/token-system-and-pricing)
- LogMeal: advertises 1,300+ dishes worldwide **[VENDOR]**; limited free calls and paid from about $49/mo per a directory (unverified; an academic table says "depends on project"); Middle Eastern coverage not named — [App Store listing](https://apps.apple.com/app/id1578738525); [directory](https://thedailyworkflow.com/service/LogMeal)
- FatSecret Platform API: Premier Free tier for start-ups, non-profits and students, attribution required; image recognition and NLP are optional paid add-ons, and a March 2026 support reply says they are not in any standard tier including Premier Free (docs conflict) — [editions](https://platform.fatsecret.com/api-editions); [forum thread](https://groups.google.com/g/fatsecret-platform-api/c/B4SziL4FpCg); [image recognition docs](https://platform.fatsecret.com/docs/v1/image.recognition)
- Edamam: Nutrition Analysis API shows a free Developer tier, $69/mo Enterprise Core, custom above; Food Database API paid plans from about $14/mo, image-vision 100,000 calls/mo for $14 per one listing; pricing has changed over time — [Edamam nutrition API](https://developer.edamam.com/edamam-nutrition-api); [Food DB](https://developer.edamam.com/food-database-api)
- Nutritionix: no official pricing retrieved; third-party figures ($449/mo; $1,850+/mo) conflict and are unverified — [GreenChoice comparison (vendor-run)](https://about.greenchoicenow.com/nutrition-data-api-comparison)
- USDA FoodData Central: default 1,000 requests per hour per IP, key blocked 1 hour if exceeded (official guide); public-domain status stated only by third-party pages in my results — [API guide](https://fdc.nal.usda.gov/api-guide)
- Calorie Mama (Azumio): docs at dev.caloriemama.ai; API pricing not found — [Azumio listing](https://apis.io/providers/azumio/)
- Arabic and Middle-East calorie apps (store listings and aggregators, so developer claims): Khtwa (Arabic AI tracker, chat in Arabic or English, paid photo tier, about 1K+ Play downloads), Momken (claims 3M+ English and Arabic foods), Zadi (claims 200+ Arabic, Gulf, South Asian dishes), Kilo (Saudi meals and chains), Sahati (150+ Moroccan dishes; no match for an Egyptian "Sohati"), NutriTrack calorie counter — [Khtwa](https://play.google.com/store/apps/details?id=app.khtwa); [Momken](https://apps.apple.com/us/app/id1598782737); [Zadi](https://apps.apple.com/app/id6762077377); [Kilo](https://mwm.ai/apps/kilo-calorie-tracker/6760403552); [Sahati](https://mwm.ai/apps/sahati/6786821819)
- Datasets and papers: Roboflow "Egyptian Food Classification" (10 classes incl. koshary, molokhia, taamia; about 1.2k images; CC BY 4.0; no calorie labels) — [Roboflow](https://universe.roboflow.com/ai-team-91xlw/egyptian-food-classification-u59lm); Nile University lightweight Egyptian-cuisine classifier (Enhanced MobileNet, 75% top-1) — [NU](https://nu.edu.eg/publications/light-weight-food-image-classification-egyptian-cuisine); GCC-30 (30 traditional Arabic dishes, SlowDeepFood paper) — [diglib.eg.org PDF](https://diglib.eg.org:443/bitstream/handle/10.2312/stag20211476/073-083.pdf); IAU Saudi Arabic-dish calorie app (fine-tuned MobileNetV2 plus volume and density) — [IAU](https://iau.sa.elsevierpure.com/en/publications/study-onarabic-food-calorie-estimation-app-using-image-processing/); AUB 2025 thesis, 174-class Lebanese taxonomy mapped to nutritionist composition tables — [AUB](https://scholarworks.aub.edu.lb/items/b4a5f886-4834-48a3-bdf1-31aeedde9ce3); 2026 preprint, 3,000+ verified images of 13 Saudi dishes — [Preprints.org](https://www.preprints.org/manuscript/202610.2117)

### Inferences
- Pragmatic stack: a vision LLM proposes dish and ingredients; a local table of Egyptian and Gulf dishes with nutritionist- or coach-verified per-portion macros (the AUB approach) supplies the numbers; USDA or FatSecret cover generic ingredients. Dish coverage of commercial APIs for koshari, ful, molokhia, mahshi must be tested with a fixed photo set before any contract.
- Licensing and caching rights (storing results, attribution) differ by vendor and were not covered.

### Gaps
- Official current pricing for LogMeal, Edamam, Nutritionix, Calorie Mama; terms of service and data retention for all; Egyptian-dish coverage of any commercial API: not verified.
- No dataset found pairing Egyptian or Gulf dish photos with weighed portions and calories.
- Khtwa, Zadi and Momken coverage of koshari and ful not tested.

## 5. UX patterns: "AI estimates, human confirms", and coach trust in client logs

### Takeaway
Evidence for specific patterns is thin and mostly practitioner opinion; the strongest supports are the portion-bias studies and the review complaints. Design proposals below are labelled as inference.

### Cited Findings
- Practitioner post: show the source of each entry (photo vs text vs database) so results are not all equally confident; ranked alternatives the user can tap recover much of the identification loss (opinion and vendor claim, no study cited) — [DEV post](https://dev.to/johns23424234324234/ai-food-logging-needs-a-confidence-handoff-not-a-magic-result-2m8e); [Fitia (vendor)](https://fitia.app/learn/article/photo-calorie-apps-accuracy/)
- Users praise an easy correction button (Cal AI "fix issue") and ingredient-level editing; users condemn flows with no edit (Lifesum review 2026-10-16) — App Store feeds above
- A coach-software vendor blog argues that flagging off-target clients turns roster-wide review into a short list (vendor opinion) — [TrainerFu](https://www.trainerfu.com/blog/ai-nutrition-coaching-how-to-add-it-to-your-personal-training-business/)

### Inferences (design proposals for DAWLYY, not sourced facts)
1. Show the AI result as an editable ingredient list with portion steppers in home measures (spoon, cup, one koshari plate size, one piece), and a range rather than one number.
2. Label each entry's provenance (photo AI, coach library, barcode, manual) with a confidence tag; low confidence forces confirmation before saving.
3. Because large portions and fat are under-counted, prompt for oil, ghee or sauce and plate size; offer a one-tap "bigger or smaller than usual".
4. The coach sees logs with provenance and an "edited by client" marker, can approve or correct, and can add a dish to a coach-verified library; corrections feed that library so repeat meals become one tap (Reddit: search, not weighing, is the slow part).
5. Coach trust metrics: share of entries confirmed or edited, photo kept next to the number, weekly drift flag against the plan.

### Gaps
- No peer-reviewed UX study on confidence indicators or portion sliders in food logging found; no source confirming a coach-approval step for AI-recognised entries in any competitor.
