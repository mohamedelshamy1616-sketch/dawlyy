# DAWLYY reinvention program: state record

Started 2026-11-13 (Africa/Cairo). Controller: the attended Claude Code session (Opus). Update this file at every
phase change. If a session compacts or ends, the next one resumes from "Next action".

## Objective

Mohamed's verdict on 13 Nov: the app works but is ordinary. The design and navigation are weak, and there is no
idea that sets it apart. He wants:

1. The largest possible market research on similar apps worldwide and in MENA. It covers features, store reviews,
   user comments, and a design and navigation comparison against DAWLYY.
2. An idea bank of everything that could make DAWLYY different. His examples:
   - Meal photo to calories.
   - AI analysis of client data that gives the coach tips, which the coach edits before the client sees them.
   - The coach can add, remove or undo anything.
3. A skill that finds the right installed skills and agents for each task.
4. A master prompt written by Codex, plus Codex's critique.
5. Free or cheap AI APIs (OpenRouter and similar) for the AI features. They may also go into freellmapi.
6. An answer on how to give Claude broad permissions.

## Constraints and approvals

- He asked for maximum effort and accepts the usage cost (13 Nov).
- Standing approval, 13 Nov: every permission except anything involving money. It is recorded as item 8 in
  `docs/plans/APPROVALS.md`. Irreversible outward actions still need a specific yes. Accounts, passwords and keys
  stay his.
- Raising the subagent cap from 3 to 6 was blocked by the classifier (self-modification). Mohamed edits
  `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` in `~/.claude/settings.json` himself. It takes effect in a new session.
- Nothing is built until he approves a direction.
- Research and docs are allowed now.
- Standing rules still apply:
  - No spending, account creation, credential handling or pushes outside the hourly watchdog.
  - No messages to real people.
  - Never weaken a test, guard or RLS policy.
  - No copying competitor code, text or visual design.
- The autopilot was paused at 15:35 because it was idle ("done"). Resume it only when a build plan is approved.
- `COMPETITOR_NOTES.md` says not to chase consumer features before launch. Mohamed reversed that on 13 Nov. The
  reversal is recorded in OPEN_DECISIONS.md once he picks the direction.

## Where things are

- Research notes: `docs/research/research_notes/DAWLYY product reinvention research/`.
- The report goes to: `docs/research/reports/DAWLYY product reinvention research.md`.
- Earlier research (business, payments, stack, 7 Nov) is in `docs/research/reports/DAWLYY competitor teardown 2026.md`.
  It is background only; do not redo it.
- Codex brief: in the session scratchpad. Codex answer: saved to `docs/plans/REINVENT_CODEX_PROMPT.md` once it returns.
- Current UI screenshots: `docs/qa/screens/` (305 files).

## Evidence and findings so far

- f9d2781 (onboarding redirect fix) is on origin/main.
- agent-reach doctor returned `[]`, so no channels are installed. Research uses WebSearch, WebFetch, Exa, and
  public store review feeds instead.
- freellmapi (127.0.0.1:3391) is not running. Its providers include openrouter, groq, gemini, cerebras, nvidia,
  cloudflare, mistral, github and huggingface. Production on Vercel cannot call a local router, so any AI feature
  needs a hosted key that Mohamed creates.

## Phases

1. [running] Research: 7 tracks on Sonnet, then the synthesis report. The concurrency cap is 3.
   - Done:
     - consumer_fitness_design_patterns, 13 Nov.
       - It has 30 patterns and about 57 dated reviews.
       - Exa timed out on every call, so the notes rest on WebSearch, WebFetch, the iTunes feed and Arctic Shift.
       - Not covered: Zing, JuggernautAI, Fitness+, NTC visuals and Peloton Guide.
       - No Google Play data, no sourced type, colour or haptics detail, and no RTL check.
       - The UI audit track covers part of this gap. A second pass after Exa recovers covers the rest, if it is
         still needed.
     - ai_nutrition_photo_apps, 13 Nov.
       - Independent tests show photo AI under-counts energy by about 33%.
         - NIH abstract, 102 meals. Cal AI was 345 kcal under, and fat was about 30 g under across all four apps.
         - LLM vision misses energy by 36-64%. Portion size and hidden fat are the weak spots.
       - MyFitnessPal bought Cal AI in March 2026.
       - No competitor has a coach-approval step for AI-logged meals, and Trainerize coaches are asking for one.
       - 2,089 App Store reviews were pulled.
         - Gulf reviews ask for Arabic.
         - Egyptian food is missing from the apps.
         - Billing complaints are heavy.
       - Gaps:
         - No Google Play data.
         - No accuracy test on Egyptian or Gulf dishes.
         - API pricing is partly unverified.
     - global_coach_platforms_ux_reviews, 13 Nov.
       - Reliability and trust events (outages, fees, billing) beat missing features as complaints.
       - Nobody is praised for navigation or visual design.
       - The top unmet need is a "who needs me, what happened this week" view. Coaches resent vendors pushing AI
         plan builders instead.
       - No review mentions Arabic.
       - Gaps: no Google Play, Capterra or G2 data.
     - mena_arabic_apps_user_voice, 13 Nov.
       - 70+ reviews.
       - Coach apps are praised for a named human who follows up. Users hate silence after payment.
       - Arabic calorie apps are praised for being Arabic. Users hate the paywall after the trial and duplicate
         foods.
       - Zero mentions of Ramadan, prayer times, women-only programs, RTL or local payment rails. These ideas are
         inference only and need coach interviews.
       - Gulf subreddits hit 422 and 429 errors.
     - ai_coach_copilot_frontier, 13 Nov.
       - The only AI class shipped and reviewed in public is "AI drafts, coach approves".
         - FitMetrics costs $149/mo plus $0.10 per action.
         - MacroActive and Everfit Smart Response also require review.
       - Coaches accept AI for drafts, summaries and admin. They reject AI that talks to clients unsupervised.
       - The strongest need is reading the week across a whole roster.
       - Top 5 ideas:
         1. Weekly roster triage.
         2. Check-in summary plus a draft reply in the coach's dialect.
         3. Churn flags with an outreach draft.
         4. Plan adjustments shown as a diff.
         5. A red-flag safety guard (pain, eating disorders, pregnancy, medication) with no AI advice.
       - There is no coach-side Arabic copilot anywhere.
       - Law 151/2020: health data is sensitive and transfer abroad is restricted. Sending data to a hosted LLM
         likely counts as a cross-border transfer, so this needs legal review.
     - free_ai_apis_vision_arabic, 13 Nov.
       - GitHub Models was retired on 30 Jul 2026, so freellmapi's `github` provider is dead. Remove it on a later
         freellmapi pass.
       - Gemini's free tier trains on content and forbids personal data and medical use. It is not usable for
         client data.
       - OpenRouter has 13 `:free` models, 7 of them with vision. The free tier allows 50 requests a day, or 1,000
         after a $10 top-up. Requests need `data_collection: deny` and `allow_fallbacks: false`.
       - Recommendation, pending a quality test: Haiku 5.5 as primary. Fallback is Gemini 3.5 Flash-Lite (paid) or
         gpt-6-luna.
       - Cost, recomputed: $0.37 per 1,000 photos and $1.00 per 1,000 summaries. Monthly that is about $3.8 at
         100 clients, $37 at 1k and $376 at 10k (3 photos a day plus 1 summary a week per client). Paid, so it
         needs his yes.
       - Voice: the vendor's own figures give Whisper v3 30.6 WER on Egyptian. Cohere Transcribe Arabic does 16.2.
         Test 30 clips first.
       - Not done: verifying food API pricing. Also no accuracy benchmark exists for any of these models on
         Egyptian food or Egyptian dialect.
     - dawlyy_ui_audit_vs_best, 13 Nov.
       - All 7 Codex defects reproduce.
         - A finished timeline page exists, but nothing links to it.
         - The screens spec accepts a skeleton as "loaded".
       - Coach nav has 11 flat items. Five pages have no entry: foods, tasks, notifications, assessments, intake.
       - Assigning a program takes 5+ taps, and the client page has no program entry.
       - Numerals come in three styles. English shows on Arabic screens ("hips", "kg"). The progress-photo image
         is broken.
       - The Plex Arabic font, RTL mirroring and the 390 px overflow check are all OK.
       - Directions:
         - A. Coach command inbox: coach 11 to 4 destinations; Linear and Wise; effort L.
         - B. Calm daily-first client: client 3 tabs; Claude and Airbnb; effort M.
         - C. Bold sport editorial: Nike and Spotify; effort L. It needs exercise media.
         - A and B combine well. The audit also lists 6 fixes that apply whichever direction is picked.
       - Not captured: the 360 and 430 px widths, the live workout screen, and a throttled network test.
   - All 7 tracks are done.
   - The Sonnet report writer failed at 15:5x on the 5-hour limit (resets 17:40 Cairo) and wrote nothing.
   - The report was handed to Codex at 15:55: brief `scratchpad/codex_report_brief.md`, answer
     `scratchpad/codex_report_answer.md`.
   - Next: review Codex's answer, then save it to `docs/research/reports/DAWLYY product reinvention research.md`.
   - Fallback: after 17:40, resume the Sonnet writer.
   - Queued: none. Next is the report writer, once all three have landed.
   - Former queue, kept for reference:
     - free_ai_apis_vision_arabic: vision and Arabic models, read from the live terms pages.
     - dawlyy_ui_audit_vs_best: audit of our screenshots, 10 top jobs against the leaders, 3 direction options.
   - Each note file goes to the research_notes folder under its track name.
2. [done 13 Nov] Codex master prompt and critique: `docs/plans/REINVENT_CODEX_PROMPT.md`. The prompt has phases
   0-7 with gates. The critique lists 7 concrete UI defects and 10 differentiation hypotheses. Its biggest gap:
   there is no demand-side evidence yet (interviews, willingness to pay).
3. [done 13 Nov] Codebase audit at the API level: `research_notes/.../dawlyy_edit_delete_undo_audit.md`.
   - Programs, nutrition plans and forms have versions and revert.
   - Clients, exercises, programs and forms cannot be archived or deleted.
   - Payment, meal log and measurement have no correction.
   - There is no undo toast, no trash, no activity log and no module toggles.
4. [todo] Our-side design comparison: our screens against competitor patterns, flow by flow. Give evidence and
   direction options; Mohamed picks.
5. [done 13 Nov] Skill finder: `~/.claude/skills/skill-router` (SKILL.md + scripts/route.py).
   - It does BM25 over 352 loaded skills and agents.
   - skill-scout and skill-stocktake did not cover routing.
   - Tested by hand with 7 queries; the skill-creator eval loop was skipped.
   - It recommended ecc:competitive-platform-analysis and ecc:competitive-report-structure for the synthesis.
   - The advisor model is already `fable` in settings.json; nothing changed.
6. [todo] Direction proposal to Mohamed, then a build plan in waves.

## Next action

As each running researcher finishes, launch the next queued track. Add Codex's critique points to the UI audit
brief: Astryx is the incumbent design system; the 11,030 px program editor; the 11 equal nav items; the History
"coming soon" tab; the workout-start screenshot marked PASS that shows a skeleton. When all 7 tracks have landed,
run the report writer, then master-prompt phases 0-3, then put the direction choice to Mohamed.

## 13 Nov 18:30: build approved and started

Mohamed said "gather everything you want, start the build at once, then test everything, then publish right
away, be very careful and focused". He delegated the direction, and A+B was taken (OPEN_DECISIONS 23).

- Report: saved after a spot check. The cost table matches the recomputation. The report is more conservative
  than the notes; for example, the NIH figure appears only as secondary reporting.
- Plan: `docs/plans/2026-11-13-reinvent-build-plan.md`.
- Playbook: P8 to P10 added.
- DONE gate: now needs `docs/qa/REINVENT_REVIEW.md`.
- Commit 96ada68.
- Autopilot: handed off to P8 on opus high. A worker is alive at 18:27.
- My job now:
  - Watch the worker.
  - Run P10 after its DONE: back up staging, run `staging.mjs migrate` for 0008, check RLS, deploy, smoke test.
  - Find out how Vercel deploys (Git integration or manual) before P10.
- Earlier times in this file read 15:5x and 16:17. The Bash TZ clock was 2 hours off; the real time was 17:55 to
  18:20.
