# AI coach copilot frontier in coaching and fitness software (as of 13 Nov 2026)

Method note. Searched with WebSearch/WebFetch (Exa MCP returned an `overloaded_error` on its one try, so it was not used). Reddit data came from the Arctic Shift API, subreddit r/personaltraining only. Arctic Shift timed out on r/OnlineCoaching and r/fitness_coaches, so those two subreddits are NOT covered. No Facebook, LinkedIn, YouTube or App Store review feeds were read. Items marked [VENDOR] are vendor claims. Reddit links use the post id; open `https://www.reddit.com/comments/<id>` to view a thread. Quotes are short and verbatim from fetched text. Photo-calorie accuracy is out of scope (see sibling note `ai_nutrition_photo_apps.md`).

## 1. What do the named products ship today, and how does it work in the product?

### Takeaway
The only AI feature class that is shipped, shared by several vendors, and reviewed in public is "AI drafts, coach edits": single-workout builders, check-in reply drafts, and natural-language program edits. Everything customer-facing is a draft by default at Trainerize/FitMetrics, Everfit Smart Response and MacroActive. The adaptive-algorithm apps (MacroFactor, Dr. Muscle, Arvo, Fitbod) are consumer products with no coach in the loop.

### Cited Findings
- **ABC Trainerize AI Workout Builder.** Conversational builder using client profile, body stats, training/cardio history and goals; the coach refines the draft before saving; can also build from an uploaded program file. Vendor says every AI-generated workout, meal plan and check-in reply is a draft and nothing is sent automatically; "coach-in-the-loop"; the builder "does not access client names or other personally identifiable information". Smart Meal Planner is "not presented as a replacement for dietitian or clinical nutrition guidance". [VENDOR] — [Trainerize blog, 11 Sep 2026](https://www.trainerize.com/blog/?p=24310)
- Trainerize says more than 40% of workouts created on the platform are AI-generated and that the builder is in open beta (brought to ABC Trainerize in beta early 2026). [VENDOR, via search summary; I did not open the source page for the 40% figure] — [search result list incl. Trainerize blog](https://www.trainerize.com/blog/ai-workout-builder/)
- **FitMetrics** (acquired by ABC Fitness; add-on for every ABC Trainerize coach). Feature table from vendor page: AI check-in replies = coach approves; AI answers to common questions = approval by default; automated check-ins, journey automations, macro/calorie adjustments from wearable data under coach rules = automatic; custom AI trained on coach tone; 54 languages; MCP access for Claude/ChatGPT with confirm-before-write, previews and audit log. FAQ: "By default, you review every drafted reply before anything sends to a client." Pricing: $149/month base (online-only), $99/location for 2+ locations, plus $0.10 per AI action and $0.01 per MCP call. Page contradicts itself on count (220+ actions vs "400 tools"). [VENDOR] — [Trainerize FitMetrics page](https://www.trainerize.com/features/fitmetrics/)
- FitMetrics testimonial claims +25% client capacity; Trainerize cost comparison $1,200/month vs $10,500 for extra coaches at 200 clients. [VENDOR; I found no independent review] — [search result summary](https://www.trainerize.com/features/fitmetrics/)
- The athletechnews article on the FitMetrics acquisition returned HTTP 500; I could not read it. Acquisition and the July 2026 Replify-based "ABC AI Agents" claim come from search summaries only — [athletechnews](https://athletechnews.com/abc-fitness-acquires-fitmetrics-expanding-ai-push-into-coaching/)
- **Everfit.** AI suite page lists: Olly Voice (dictate client messages/assign tasks), Olly AI Assistant (answer questions about a client's data), AI Workout Builder (text notes to workouts), nutrition meal-plan generation, MacroSnap, BI Dashboard (beta), Smart Response (drafts replies in coach's voice; coach "review, edit, and send"). Page gives no pricing and no approval statement except Smart Response. [VENDOR] — [Everfit AI suite](https://everfit.io/ai-suite/)
- **Everfit Program Copilot (beta).** Natural-language edits to multi-week programs from a side panel (add/replace/remove exercises, change sets/reps/RPE/tempo, duplicate/move workouts and weeks). Each message uses one credit; 95% usage notification; thumbs up/down feedback. Help article does not say whether edits are previewed before applying. [VENDOR] — [Everfit help](https://help.everfit.io/en/articles/15376459-program-copilot-beta)
- **Kahunas.** Marketing says check-ins/habits/metrics become a prioritised "who needs you and why" list with an AI summary; Health Score AI (e.g. a consistently high anxiety score prompts "check in on lifestyle stressors, recovery habits"). A Capterra user said they were still awaiting automated check-in; HubFit (a competitor) says Kahunas offers only a basic check-in form. Treat as unverified. [VENDOR] — [Kahunas help (search summary; the page I fetched returned 404)](https://help.kahunas.io/en/articles/250-everything-you-need-to-know-about-health-score-ai)
- **MacroActive "COACH." 1:1 Check-In Agent** (Trainer Console, "Available now", 2026, undated). Gathers community posts, workout notes, food logs, check-in answers; sorts into act-on / wins / no-decision context, each line tagged with its source; maintains client notes (injuries, dated events) that expire; builds a versioned draft with numbered yes/no/skip questions for the coach. "Nothing sends until you send it." Opt-in, enabled by support. [VENDOR] — [MacroActive](https://www.macroactive.com/1-1-check-in-agent)
- **MacroFactor.** Adaptive expenditure ("V3 expenditure algorithm"); Oct 2025 release 5.5.0 added optional step-informed updates and predictive goal adjustment. The Nov 2025 newsletter says nothing about AI in the new Workouts app (beta testers Dec 2025, release early 2026) and nothing about coach features. A competitor (Arvo) says Workouts has no AI program design. — [MacroFactor Nov 2025](https://macrofactor.com/mm-nov-2025/); [Arvo vs MacroFactor](https://arvo.guru/vs/macrofactor)
- **CoachRx** self-describes an integrated assistant "RxBot" [VENDOR, search summary only]. **PT Distinction**: sources conflict (one list gives it AI programming; another says no AI). **TrueCoach and Hevy Coach**: a Sept 2026 roundup found no native AI feature. **Exercise.com**: no AI feature surfaced in snippets. — [CoachRx](https://www.coachrx.app/coachrx-comparison); [Coachway roundup, Sep 2026](https://coachway.io/articles/best-ai-coaching-apps/); [TrainerFu lists](https://www.trainerfu.com/blog/truecoach_alternatives/)
- Coachway (Sep 2026, vendor checks Aug 2026) calls only "drafting a single workout" reliably real in 2026 and says AI nutrition, chat and form analysis are mostly marketing; no covered platform exposes form analysis as a product. [Coachway sells a competing product; claims are its own reading of vendor sites] — [Coachway](https://coachway.io/articles/best-ai-coaching-apps/)
- **WHOOP Coach** (announced Sep 2023, GPT-4, fine-tuned on member data; 50+ languages; can be switched off in Settings) and **Oura Advisor** (explains Readiness/Sleep/Activity scores) are consumer, own-data assistants with no coach in the loop. WHOOP/Oura disclaimer text was not found. — [OpenAI WHOOP page via search](https://openai.com/index/whoop); [Sano Labs comparison, 16 May 2026, updated Oct 2026](https://www.sanolabs.eu/blog/ai-health-assistants-wearable-data-compared/)
- **Auto-progression apps** (review-site claims, mostly self-published or advertorial): Fitbod = recovery-based generator, adapts per workout; Arvo = set-by-set using RIR, online-only; Dr. Muscle = automatic progression with RIR targets and auto-deload on stagnation; FitnessAI = advances prescription when logged reps hit target; JuggernautAI = G2 listing says proprietary algorithms refine plans from user feedback. — [search results incl. Fitbod/Arvo reviews](https://arvo.guru/best-ai-personal-trainer-app); [G2 JuggernautAI](https://www.g2.com/products/juggernautai/reviews)
- **YC / startups.** HYBRD (YC F2024): "HYBRD Brain" restructures a plan when users report travel or injury; FitBench scores AI coaches on scientific accuracy, athlete safety, actionability, conciseness over 25 scenarios, judged by an LLM (Opus 4.6); claims 77% on the CSCS exam [VENDOR]. Imperfect (YC Spring 2026) personalised race coach; Cora (YC W2024) wearable coaching; Adapted (YC W2024) AI physical therapist; Nori (YC F2025) AI health coach. — [HYBRD launch](https://www.ycombinator.com/launches/QAV-hybrd-agentic-coaching-for-athletes); [YC fitness list](https://ycombinator.com/companies/industry/Fitness)
- **Churn/retention tools exist** (CoachMetrics "predictive churn alerts" at $97/month for 50 clients, Athleex retention analytics, ABC Glofox churn predictor for gyms). Outcome numbers (e.g. 52.3% retention, 50-70% churn reduction) are vendor figures; a practitioner blog says alerts alone did little where nobody acted. — [roundup search](https://coachmetrics.vercel.app/); [MobiDev case study](https://mobidev.biz/case-studies/ai-fitness-coach-for-strength-training)

### Inferences
- The "approve before send" default is the industry norm for anything client-facing; DAWLYY matches it for free and should make it visible rather than a setting.
- Per-action usage pricing (FitMetrics $0.10/action) shows LLM cost is passed through; DAWLYY needs a per-coach AI budget.
- Nobody visibly ships Arabic-dialect drafting (FitMetrics claims 54 languages, unproven for dialect).

### Gaps
- Not read: Carbon Diet Coach, Zing Coach, PT Distinction/TrueCoach/Exercise.com/Hevy Coach official AI pages, Oura official page, Product Hunt listings, App Store coach-side review feeds. FitMetrics acquisition article unreadable (HTTP 500). No independent review of FitMetrics AI Check-Ins was found.

## 2. Feature families: who does it best and evidence of real use

### Takeaway
Best-evidenced families: workout drafting (Trainerize, Everfit), check-in reply drafting (FitMetrics, Everfit Smart Response, MacroActive), natural-language program editing (Everfit). Weakest evidence: churn alerts, voice-to-plan, form feedback.

### Cited Findings
- **Program/workout generation.** Trainerize (40%+ of workouts AI-generated, vendor), Everfit (text-to-workout, beta). Real use signal: ideas board request volume (85 votes on the 9 Feb 2026 vendor thread) — [Trainerize ideas](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/50986720-help-shape-what-we-build-next-for-the-ai-workout-b)
- **Check-in summarisation + reply drafting.** FitMetrics (approval default), Everfit Smart Response, MacroActive (source-tagged lines, versioned draft). Evidence of use: vendor testimonials only.
- **Natural-language program edit.** Everfit Program Copilot (credits, beta).
- **Auto-progression / load prescription.** Dr. Muscle, Arvo, Fitbod, FitnessAI, JuggernautAI (consumer; no coach). See section 1.
- **Nutrition adjustment from trend data.** MacroFactor expenditure algorithm; FitMetrics "macro and calorie adjustments" automatic under coach rules [VENDOR].
- **Roster triage / adherence-churn flags.** Kahunas, CoachMetrics, Athleex (vendor).
- **Wearable context.** FitMetrics pulls WHOOP/Oura recovery, sleep, readiness into profiles [VENDOR].
- **Weekly review with approval.** Mudrib (Saudi-dialect consumer app) lists a "weekly review of training with suggested plan changes that need your approval" [VENDOR] — [App Store](https://apps.apple.com/np/app/id6761298892)
- **Form/video feedback.** No covered platform ships it as a product (Coachway). Trainerize idea (12 Apr 2026) asks for AI movement assessments from video. — [Trainerize ideas thread](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/50986720-help-shape-what-we-build-next-for-the-ai-workout-b)
- **Client-facing AI chatbot.** Everfit Olly answers coach questions about a client; FitMetrics answers common client questions with approval default.

### Inferences
- Best-in-family leaders are Trainerize/FitMetrics (breadth), Everfit (edit UX), MacroActive (evidence tagging). Nobody leads on churn or Arabic.

### Gaps
- No usage statistics beyond vendor claims.

## 3. Coach sentiment (30+ dated points)

### Takeaway
Coaches accept AI for drafting, summarising and admin, and reject AI that talks to clients unsupervised or "writes the program". Strongest unmet need: help reading the week across a roster. All Reddit points below are from r/personaltraining via Arctic Shift (the sub skews in-person; online-coach voices are fewer). Several commenters are vendors; flagged.

### Cited Findings
Reddit thread "Does anyone actually use AI for client communication and program design?" (id 1wt3c3x, 29 Sep 2026, 23 comments):
1. 20 Oct 2026 (builder of fitness apps, self-declared): would not let AI message clients alone; drafting and summarising "someone's week", then fix and send, is fine.
2. 2 Oct 2026: "Absolutely not for messaging clients"; Trainerize AI "feels aimed more at scale and metrics than at the kind of relationship based coaching".
3. 29 Sep 2026 (score 20): "My clients would lose their minds if they got AI messages".
4. 29 Sep 2026 (score 6): not using AI "has become a selling point. clients dont want any more robots in their lives".
5. 29 Sep 2026 (score 5): uses AI to build tools that display data they already gather; "would not let AI make decisions or talk to clients".
6. 29 Sep 2026 (score 7): a trainer the commenter knows used AI with clients and "got booted so fast".
7. 29 Sep 2026 (score 10): proofreads a price-increase email with AI, keeps own voice.
8. 29 Sep 2026 (score 2): "The trainerize AI workout builder is trash lol" and not faster than writing the program.
9. 30 Sep 2026 (score 2): asks if AI should distil client progress, metrics and conversations before a check-in call.
10. 30 Sep 2026: uses AI to check emails sound human and friendly.
11. 1 Oct 2026: coach with 160 online clients says "You shouldn't ever need to do 30 check ins in a day" (about 10 calls a week).
12. 1 Oct 2026 (score 2): keeps a ChatGPT project per client with age, injuries, schedule to plan.
13. 29 Sep 2026 (score -6): building an AI chatbot for own clients to answer basic questions (downvoted).
14. 29 Sep 2026: JAMA claim that AI reminders helped diabetic patients as much as human reminders (see correction below).
Thread "Using AI for programming" (id 1w9kic0, 7 Sep 2026, 43 comments):
15. 8 Sep 2026: "we are paid to give personalised input and not generic ai garbage".
16. 8 Sep 2026 (score 2): knows a coach whose whole program is AI; when clients question her she asks ChatGPT for the "why".
17. 9 Sep 2026: AI "does not work well with the state of the client (cannot take the injuries, rest ability etc.) into account".
18. 10 Sep 2026: human should make final decisions; feed revised program back to the model with a note.
Thread "Do you use AI in your programming? Why / why not?" (id 1vs9qzc, 19 Aug 2026, 52 comments):
19. 27 Aug 2026: clients "pay a premium for me to design the program".
20. 21 Aug 2026: only for brainstorming; "never writes my programming".
Thread "Wow another bloated feature" (id 1vitfm6, 8 Aug 2026, score 16): poster complains MyPTHub promotes an AI workout builder rather than making client data easier to review.
21. 8 Oct 2026 comment: platforms are "racing to add AI to the feature list without asking if it actually solves anything".
22. 11 Aug 2026 comment: an AI program one must sanity-check "isn't saving me the expensive part ... reading the week across a roster".
23. 15 Aug 2026 comment: flag two or three trend changes (missed check-ins, adherence dropping, load stalling) and look at full history only then. (Commenters 15/19 Aug include a self-disclosed vendor, Conviboost.)
Thread "Feeling sub par" (id 1vfcxev, 4 Aug 2026, score 10): poster says AI programs improved client results and let them raise prices; replies split: 5 Aug "AI as a tool is not a cop out any more than using a calculator makes you bad at math"; 4 Aug (score 14) advises more study instead.
Thread "Not worried about AI taking my coaching job" (id 1xbd777, 21 Oct 2026, score 19):
24. 21 Oct 2026 (score 9): story of hugging a client who lost a pet; "anybody [who] thinks we do this for any other reason ... is wrong".
25. 21 Oct 2026 (score 5): information has been free for decades "and people still do not follow".
26. 21 Oct 2026: AI "morally unacceptable".
27. 27 Oct 2026: "AI will never replace coaches and trainers".
28. 21 Oct 2026: use AI for "lower-risk admin such as session summaries and draft check-ins" (comment links to a product site; likely promotional).
Other threads:
29. 29 Aug 2026 (id 1w18nk6, 13 comments): a client asks if a trainer using ChatGPT for workouts and diet is normal; replies: GPT is good at sorting macros, trainers "aren't supposed to write diets".
30. 27 Sep 2026 (id 1wrqf9y): poster argues individualised judgment and adjustment matter more as free info grows.
31. 10 Nov 2026 (ids 1xszlxn, 1xsoc25): "Online Coaching in 2027 with AI & Peptides" posts; bodies removed, so content unknown.
Trainerize ideas board (2026, vendor forum; individual comment votes not shown):
32. 25 Mar 2026: chat format "doesn't suit existing client programs or progress"; copy Everfit's tick-the-requirements approach.
33. 1 Apr 2026: give AI a folder of prompts reflecting the coach's style; "chat-only input isn't useful until it saves time".
34. 3 and 6 Apr 2026: upload existing spreadsheets/docs so AI builds a full program.
35. 9 Apr 2026: pull a client's current phase so AI builds the next phase from progression and adherence. 7 Jun 2026 similar.
36. 12 Apr 2026: AI movement assessments from video; "learn from coaches' adjustments over time".
37. 16 Apr 2026: when asked to remove one exercise the AI reverted other exercises. 18 Apr and 23 Mar 2026: AI repeats the same exercises and changes unrequested ones.
38. 25 Apr 2026 (3 votes): AI program adjustments from check-ins (energy, sleep, soreness, compliance), suggest or auto-apply with coach approval; a "review assistant" giving summary and suggested changes. — [ideas thread](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/51236236-ai-program-adjustments-based-on-client-check-ins)
39. 13 Nov 2025 (2 votes): "AI integration" request to fill programs via ChatGPT inside Trainerize. — [ideas](https://ideas.abcfitness.com/forums/167887-coach-trainer-abc-trainerize/suggestions/50705819-ai-integration)
- **Correction:** the 29 Sep commenter's JAMA claim is not verified as stated. The nearest verified study is a 2025 JAMA noninferiority trial of a fully automated AI-led diabetes prevention programme vs human coaches (31.7% vs 31.9% met the primary outcome; AI group sent personalised push notifications). It is not an AI-vs-human message-wording trial. — [JAMA](https://jamanetwork.com/journals/jama/fullarticle/2840703); [PatientCareOnline summary](https://www.patientcareonline.com/view/ai-powered-diabetes-prevention-program-intervention-matches-human-coaching-in-landmark-trial)

### Inferences
- Wants: roster triage, week summaries, draft check-ins, program adjustments with approval, building on existing client data and the coach's own style. Fears: generic output, repetition, unrequested edits, losing the relationship. Refuses: AI speaking to clients unreviewed.
- "Disclosure matters": a client asking whether a trainer using ChatGPT is normal (item 29) suggests clients notice; a visible "AI-assisted, reviewed by your coach" stance needs a coach-controlled toggle.

### Gaps
- r/OnlineCoaching, r/fitness_coaches (API timeouts), Facebook, LinkedIn, YouTube, app-store coach reviews not read. Sentiment is skewed to in-person trainers. No Arabic-language coach sentiment found.

## 4. Safety, liability, regulation, disclaimers

### Takeaway
Keep AI as a coach-facing drafter, never a client-facing advisor; add hard-coded escalation for red-flag topics. Health data under Egyptian law is sensitive and needs explicit consent plus cross-border transfer handling, relevant to a hosted LLM.

### Cited Findings
- **ED precedent.** NEDA took its Tessa chatbot offline (June 2023) after reports that it recommended calorie counting and weight loss to users with eating disorders; critics cited a deficit up to 1,000 kcal/day; about 2,500 people had used it; NEDA blamed "bad actors". — [Fortune, 31 May 2023](https://fortune.com/well/2023/05/31/neda-ai-chatbot-harmful-advice/); [CBS](https://www.cbsnews.com/amp/news/eating-disorder-helpline-chatbot-disabled)
- **Human-in-the-loop pattern in vendors.** Trainerize: coach checks for contraindications and context AI lacks; clinical and safety judgment stays human. FitMetrics: review before send; MCP confirm-before-write with audit log. MacroActive: nothing sends until the coach sends; notes visible/editable. [VENDOR] — sources in section 1.
- **Vendor wording patterns.** Not-a-replacement for dietitian (Trainerize); wellness companion that does not "diagnose, treat, cure, or prevent disease" (Sam, quoted by Sano Labs about its own app, not WHOOP/Oura). — [Sano Labs](https://www.sanolabs.eu/blog/ai-health-assistants-wearable-data-compared/)
- **Mudrib** (Saudi consumer app) says its plans consider injury, health condition and pregnancy and requires approval for plan changes [VENDOR]; the App Store notes the developer's privacy info "has not been verified by Apple". — [App Store](https://apps.apple.com/np/app/id6761298892)
- **FDA (US), 6 Jan 2026:** revised General Wellness and Clinical Decision Support guidances; wearables guidance relaxed; AI chatbots not directly addressed; commentators disagree on reach. Everfit is stated not to be HIPAA-certified (search summary). — [Covington](https://www.cov.com/news-and-insights/insights/2026/01/fda-issues-revised-guidance-on-general-wellness-products); [Foley](https://www.foley.com/insights/publications/2026/01/digital-health-policy-fda-relaxes-restrictions-over-wearables-and-ai-decision-ma/)
- **Egypt PDPL (Law 151/2020):** sensitive data includes physical or psychological health data; explicit/written consent and stricter security for sensitive data; cross-border transfer (including storage) is restricted. Executive Regulations were issued around 1 Nov 2025 with a one-year compliance countdown (sources disagree on the decree number: 81 of 2025 vs 816/2025; and whether transfer needs PDPC licence/permit or an adequacy/safeguards route). Verify against the Official Gazette before relying. — [Chambers](https://chambers.com/articles/a-first-look-at-egypt-s-personal-data-protection-executive-regulations); [CMS](https://cms.law/en/are/legal-updates/egypt-s-pdpl-executive-regulations-issued-one-year-compliance-countdown-begins); [Clyde & Co, Jan 2026](https://www.clydeco.com/zh/insights/2026/01/egypt-regulatory-update-on-data-privacy); [Legal500](https://www.legal500.com/guides/hot-topic/strategic-challenges-and-opportunities-in-cross-border-data-transfers-under-egypts-personal-data-protection-regime)
- ChatGPT Health (Jan 2026) states health chats are not used to train its models (per Sano Labs; check current policy). — [Sano Labs](https://www.sanolabs.eu/blog/ai-health-assistants-wearable-data-compared/)

### Inferences
- A hosted US/EU LLM receiving client health data is a cross-border transfer under the PDPL; DAWLYY needs explicit written client consent, data minimisation (strip names/IDs like Trainerize's builder), and a zero-retention/no-training LLM contract. Legal advice is needed before launch.
- Red-flag classes to hard-route to the coach with no AI advice: disordered-eating language, pain/injury/dizziness/chest symptoms, pregnancy/postpartum, diabetes/medication, minors, self-harm. [I]
- The Gulf/Egypt equivalents of GDPR-style rules for KSA/UAE were not researched.

### Gaps
- No WHOOP/Oura primary disclaimer text found. No platform-store (Apple/Google) rule on AI health advice checked. EU AI Act and KSA/UAE data law not researched. I did not read the primary text of the Egyptian Executive Regulations.

## 5. Arabic / MENA

### Takeaway
Arabic-first AI coaching exists only on the consumer side (Saudi dialect Mudrib, ElCoach, Kilow). No coach-side copilot in Arabic was found, and no public benchmark tests frontier LLMs on Egyptian/Gulf coaching text.

### Cited Findings
- Mudrib: iPhone app; "built in Saudi dialect"; Ramadan and Hajj modes; weekly review needing approval; 14-day trial then SAR 29.99/month; no ratings yet; dialect quality unverified. [VENDOR] — [App Store](https://apps.apple.com/np/app/id6761298892)
- ElCoach: Egypt/Saudi fitness and nutrition app combining AI with expert coaches (coverage from 2020, dated); Miran (Saudi) merged with Welnes (Egypt); Kilow: Saudi Arabic weight-loss app (2025). — [MENAbytes](https://www.menabytes.com/elcoach-seed/); [MENAbytes Miran/Welnes](https://www.menabytes.com/miran-welness-merger/); [ArabFounders](https://arabfounders.net/en/kilow-saudi-weight-loss-app-launch-2025/)
- DialectalArabicMMLU (Oct 2025): 15K QA pairs across five dialects incl. Egyptian and Gulf; evaluated 19 open-weight 1B-13B models; found large cross-dialect gaps. Nile-Chat (ArabicNLP 2025) Egyptian models claim to beat Llama, Jais, ALLaM on Egyptian benchmarks. AraDiCE (COLING 2025): Arabic-specific models beat multilingual on dialect tasks, with challenges in generation. None tested GPT/Claude/Gemini. — [DialectalArabicMMLU](https://arxiv.org/html/2510.27543v1); [Nile-Chat](https://aitopics.org/doc/arxivorg:D5F4DC35); [AraDiCE](https://preview.aclanthology.org/setup/2025.coling-main.283)
- FitMetrics claims 54-language outputs. [VENDOR] — [FitMetrics](https://www.trainerize.com/features/fitmetrics/)

### Inferences
- Coaches write in Egyptian/Gulf dialect plus Arabizi; a model must be tested on coach-style message pairs. Plan a small in-house eval (e.g. 50 real check-ins, coach rates edit distance) before choosing a model. [I]
- Edit-distance feedback (how much the coach rewrites) is the cheapest dialect-quality metric. [I]

### Gaps
- No frontier-model dialect benchmark; no Arabic coach-sentiment; no Egyptian/Gulf coaching-specific LLM evaluation.

## 6. DAWLYY idea bank (35 ideas)

### Takeaway
Top 5 (reasons below): roster triage digest, check-in summary plus draft reply, adherence/churn flags with suggested outreach, check-in-driven program/macro adjustment proposals with diff, and a red-flag safety guard. All are coach-facing, draft-only.

### Cited Findings
Scale: Demand H/M/L (source in brackets, S# = section 3 item). Feasibility on serverless Next.js + Postgres + hosted LLM. Risk H/M/L. [E] = evidence in notes, [I] = inference.

| # | Idea | Demand | Feas. | Risk | E/I |
|---|---|---|---|---|---|
| 1 TOP | Weekly roster triage: ranked "who needs me this week and why", each line cites source rows (check-in, log, weight) | H (S22, S23, S9, Kahunas/MacroActive) | H | L | E |
| 2 TOP | Check-in summary + draft reply in coach's voice, Arabic dialect, approve-before-send, "nothing sends until you send" | H (S1, S9, S28; FitMetrics, Everfit, MacroActive) | H | M | E |
| 3 TOP | Adherence-drop / churn-risk flag with suggested outreach text the coach sends | M (S23; CoachMetrics/Athleex vendor) | H (rules + LLM text) | L | E/I |
| 4 TOP | Proposed program/macro adjustment from check-in data, shown as diff vs current plan; coach accepts/edits per line | H (ideas 25 Apr 2026, S35, S37) | M | M | E |
| 5 TOP | Red-flag guard: scans check-in/chat for pain, ED language, pregnancy, dizziness, medication; pins to top, suppresses AI drafts, prompts coach | M (no coach asked; NEDA, S17) | H (keyword+LLM classifier) | L | I |
| 6 | Pre-call brief: one-screen client summary 5 minutes before a call | M (S9, S11) | H | L | E |
| 7 | Source-tagged evidence on every AI line (click to see raw log) | M (MacroActive pattern) | H | L | E |
| 8 | Coach voice profile learned from sent messages and edits | M (FitMetrics, Everfit) | M | L | E |
| 9 | Edit-diff learning: track how much coach changes a draft, tune prompts | L (none stated) | M | L | I |
| 10 | Dialect switch per client (Egyptian, Gulf, MSA, Arabizi) | L (no source) | H | L | I |
| 11 | Voice note to client note/plan (Arabic transcription) | M (Everfit Olly Voice; TrainingFocus pitch) | M | M | E/I |
| 12 | Client-notes memory: injuries, travel, dated events that expire | M (MacroActive; S12) | H | L | E |
| 13 | Missed-check-in nudge drafts (coach one-click send) | M (S23) | H | L | I |
| 14 | Weekly digest message drafted per client with real numbers inserted by template, not generated | M (FitMetrics placeholders) | H | L | E |
| 15 | Natural-language program edit with preview ("swap squats for leg press in weeks 3-6") | M (Everfit Program Copilot; ideas S35) | M | M | E |
| 16 | Import existing spreadsheet/PDF program into DAWLYY structure | M (ideas 3, 6 Apr 2026) | M | L | E |
| 17 | Next-phase program draft from current phase + adherence | M (ideas 9 Apr, 7 Jun 2026) | M | M | E |
| 18 | Exercise-variety guard (no repeated exercises, honour "unchanged" lines) | M (ideas 23 Mar, 16-18 Apr 2026) | H | L | E |
| 19 | Nutrition target adjustment proposal from weight trend and logged intake (MacroFactor-style, coach approves) | M (FitMetrics automatic macros; MacroFactor) | M | M | E |
| 20 | Ramadan/travel/illness mode: AI proposes lighter plan, coach approves | M (Mudrib Ramadan mode; local) | H | L | E/I |
| 21 | Plateau detector (weight/strength flat 3+ weeks) with options | M (Dr. Muscle deload logic) | H | L | E/I |
| 22 | Client-facing FAQ draft bot answering from coach's own knowledge base, coach approves answers | L (S13 downvoted; FitMetrics approval default) | M | M | E |
| 23 | Win-spotting: surface PRs/milestones for coach to celebrate | L (MacroActive "wins") | H | L | E |
| 24 | Payment-risk flag: lapsed card/renewal window plus engagement drop | M (churn tools) | H | L | I |
| 25 | Renewal-conversation prep: results summary for client's renewal | M | H | L | I |
| 26 | Business dashboard: retention, revenue, clients at risk | M (Everfit BI beta) | H | L | E |
| 27 | Wearable summary (WHOOP/Oura/Apple) folded into brief | L (FitMetrics) | M | M | E |
| 28 | Per-coach AI budget and usage meter | M (FitMetrics $0.10/action; Everfit credits) | H | L | E |
| 29 | Audit log of every AI draft: shown/edited/sent | M (FitMetrics audit log) | H | L | E |
| 30 | Consent screen: client agrees to AI-assisted analysis (PDPL written consent), per-client AI off switch | L-M (law) | H | L | E/I |
| 31 | PII minimisation: strip name/phone before LLM call | M (Trainerize builder) | H | L | E |
| 32 | Coach-side AI evaluation set in Arabic: score drafts on a fixed test set before model change | L | M | L | I |
| 33 | Form-video flagging: client uploads clip, AI notes only "for coach review" | L-M (ideas 12 Apr 2026; no platform ships it) | L | H | E |
| 34 | Group/challenge digest for community coaching | L | H | L | I |
| 35 | MCP/Claude-style assistant for the coach ("ask about any client") read-only | M (Everfit Olly, FitMetrics MCP) | M | M | E |

### Inferences
- **Why the top 5:** (1) the strongest unmet need: "reading the week across a roster" (S22) and the cheapest to make credible with source-tagged rows; (2) the shipped, proven family (FitMetrics, Everfit, MacroActive) and the place Arabic dialect quality can be a differentiator nobody serves; (3) retention is revenue, tools exist but outcome claims are vendor-only, and alerts only matter when the coach acts, so pair with a ready draft; (4) the most-requested missing feature on Trainerize's board; the diff view avoids the "AI reverted my other exercises" failure (S37); (5) cheap, trust-building, and the legal and reputational downside (NEDA) is the largest risk to the whole product.
- Ideas 1 to 3 share one pipeline: weekly job computes features per client in Postgres, one LLM call per client produces summary, flags, draft; storing everything as drafts keeps the model off the critical path (serverless-friendly).
- Do not ship client-facing automatic replies (S3, S4, S6, S13).
- Evidence caveat: demand ratings for ideas 9, 10, 24, 25, 32, 34 are inference only; no coach asked for them in the sources I read.

### Gaps
- No pricing-willingness data for Arabic coaches; no interviews with Egyptian/Gulf coaches; ranking should be validated with 5 to 10 DAWLYY coaches.
