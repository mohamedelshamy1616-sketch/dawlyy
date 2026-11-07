
DAWLYY
ONLINE COACHING OPERATING SYSTEM
FINAL MASTER BUILD & DEVELOPER HANDOFF SPECIFICATION
Web App First  •  API-First  •  Native-App Ready  •  Arabic / English  •  Multi-Tenant SaaS
Version 4.0 — Consolidated final handoff31 October 2026
SOURCE OF TRUTH: This document consolidates the original 40-section master, the 63-section consolidated specification, and all approved product decisions and additions from the DAWLYY project conversation.

DOCUMENT CONTROL & BUILD DIRECTIVE
This is the authoritative product requirements document (PRD) and developer handoff for DAWLYY. If an older version conflicts with this document, this version wins.
Build a production-grade Online Coaching Operating System, not merely a workout tracker or static UI prototype.
The Coach/Owner is the final authority. AI and automation may analyze, draft, calculate, organize and recommend; they must not silently publish or materially change coaching plans.
The product must be easy for a first-time client and operationally powerful for a coach. Use progressive disclosure: simple defaults first, advanced controls when needed.
Build backend/domain logic and APIs first, then responsive web application. Keep APIs reusable for future native iOS/Android applications.
All configurable rules must be implemented as configuration, not hard-coded examples. Preserve history, versions, permissions and audit trails.
The product is online-coaching-first. Physical PT session booking, gym class booking, gym capacity, gym POS/inventory and unrelated gym management are excluded from the initial product.
Requirement language
MUST = required for the defined release/scope. SHOULD = expected unless a documented technical reason prevents it. MAY = optional/configurable.
A feature marked Later Phase must be architecturally anticipated where stated, but is not a blocker for the first usable release.
The programmer must not silently resolve ambiguities by inventing business rules. Record assumptions and obtain Owner approval for decisions that affect behavior, cost, privacy or scope.
PRODUCT NORTH STAR
Client question: “What do I need to do today?”
Coach question: “Which clients require my decision today?”
DAWLYY = Simple Client Experience + Powerful Coach Operating System + Automation + Structured Data + Coach-Controlled AI.
Core lifecycle: Lead/Client → Package → Account → optional Intake → optional Assessment → Program + Nutrition → Tracking → Follow-up → Coach Review → Adjustment → Reassessment → Comparison → Next Phase → Renewal.
Every workflow step is configurable. Intake and assessment are optional unless the coach explicitly makes them required for a package/client.
1. PRODUCT SCOPE & RELEASE STRATEGY
DAWLYY is a modular SaaS for online fitness coaching, initially serving the DAWLYY business and designed to support coaches globally over time.
Initial product: responsive web app with a simple client portal and desktop-first coach workspace.
Future direction: a complete fitness-industry platform for online coaches, personal trainers, gyms and other fitness businesses. Do not force gym/PT operations into the MVP.
Support multiple tenants/businesses from the architecture foundation, even if the first tenant is DAWLYY only.
Separate MVP essentials from later capabilities using feature flags and modular services.
Out of initial scope: physical PT booking, gym class scheduling, physical capacity/slots, gym POS/inventory, marketplace and complex social feed.
2. USERS, ROLES & PERMISSIONS
A solo coach must be able to use the entire platform without creating a team. Team functionality is optional.
Do not require seven fixed roles. Provide an Owner account with full control by default.
Owner may optionally create a team and configure each staff member individually.
Provide optional role presets (Coach, Assistant, Nutrition Coach, Assessment/Rehab Specialist, Business Manager) as starting templates only; permissions remain editable.
Granular permissions must be configurable by module, client assignment, action (view/create/edit/delete/approve/publish/export) and data sensitivity.
Enforce permissions on the server/API, not only by hiding UI controls.
Client accounts can access only their own client-facing data. Private coach notes, internal risk flags and other clients' data must never be exposed.
Owner controls business settings, packages, templates, team, client assignment, automations, billing/access, AI approvals, exports and reports.
Record permission changes and sensitive actions in the audit log.
3. MULTI-TENANT SAAS FOUNDATION
Hierarchy: Platform → Tenant/Business → Team → Coach → Clients.
Every tenant-owned record must carry tenant scope and be isolated server-side.
Tenant branding, users, clients, packages, templates, integrations, storage, usage and SaaS billing are isolated.
Platform administration must not imply default access to private client health/media data.
Support tenant-level configuration and plan/usage limits without hard-coding DAWLYY-only assumptions.
Prepare for future tenant self-service onboarding, subscription tiers and feature entitlements.
4. ACCOUNT & CLIENT IDENTITY
One persistent Client ID links a client's complete coaching history.
Support invitation, email/password, phone OTP, magic link where supported, password reset/recovery and session/device management.
Prevent duplicate active client identities while allowing an existing client to be assigned to another package or coach under controlled rules.
Separate identity/account status from subscription/access status. Expiry must not delete client history.
Coach search should support name, Client ID, phone/email, package, status, tags and priority.
Support client profile, goals, schedule, training history, preferences, restrictions and coach notes with appropriate privacy controls.
5. PACKAGE BUILDER & ENTITLEMENTS
Packages are reusable service configurations, not hard-coded VIP/Weekly/Monthly logic.
Coach can create unlimited packages with duration, price/currency, support level, follow-up type, included features, tracking cadence and renewal policy.
Each entitlement supports enabled/disabled, frequency, limits, duration, turnaround expectations, allowed media types and exceptions.
VIP means access/support availability as configured; it does NOT mean daily check-ins by default.
Coach can override a package entitlement for one client without changing the master package.
Package assignment generates dated schedule events according to the package's rules.
Enforce entitlements on server/API and reflect them in the client UI.
Allow one-off negotiated exceptions/extensions, recording actor, reason, old/new dates and affected entitlements.
6. INTAKE ENGINE & FORM BUILDER
The coach owns intake design. A default DAWLYY intake template may be provided, but is not mandatory or fixed.
Coach can create multiple intake templates, edit, duplicate, archive, reorder sections/questions, add/remove questions and set required/optional status.
Support conditional logic, branching, visibility rules, question dependencies and per-client customization without changing the master template.
Question types: text, long text, number, date, time, yes/no, single choice, multiple choice, rating/scale, photo, video, file and supported structured fields.
Default intake can cover personal data, goals, injuries/medical/surgical/digestive history, allergies/intolerances, training history, schedule, sleep/wake, training availability, meal count, food preferences, outside meals, hydration, salt/sugar, supplements and cheat/free-meal preferences.
Client can update relevant routine details (sleep/wake times, work schedule, training time, meals/day, availability); updates must be timestamped and visible to coach.
Coach can send, skip, manually complete, mark information as already known, or customize the form for one client.
Historical submissions retain the exact form version and answers. Editing the template must not rewrite prior submissions.
Show completion status and missing required fields; reminders stop when completed or skipped.
7. ASSESSMENT ENGINE & TEST LIBRARY
Assessment is optional and fully controlled by the coach.
Provide optional default assessment templates, but allow multiple specialized templates for different goals, conditions, injuries and populations.
Coach can create, edit, duplicate, replace, reorder or remove tests; add custom tests with their own instructions, videos and capture guidance.
Possible tests include plank, crunches, side plank L/R, squat, overhead squat, push-up, pull-up, mobility, endurance, strength, cardio, photos, measurements, InBody and custom timed/repetition tests.
Coach can assign all, selected or no tests. Assessment must not block program delivery unless explicitly required.
Client sees only assigned tests and clear instructions, timers/counters where applicable and upload status.
Store raw result, unit, side, date, test definition/version, media, notes and form-quality status.
Coach reviews each test and may mark reviewed, approved, needs resubmission or skipped.
8. ASSESSMENT REVIEW, FINDINGS & REPORT
Convert evidence into structured findings while preserving raw source data.
Finding fields include category/area, severity, confidence, evidence, client context, coach note, AI suggestion and status.
Examples may include low overhead mobility, limited ankle/hip mobility, weak glutes, low core endurance or shoulder-control concerns; these are examples, not diagnoses.
Generate coach-facing reports with raw results, findings and suggested actions. Client-facing report is published only after coach approval.
AI may draft summaries and possible findings, but must show evidence and uncertainty and must not diagnose.
Keep original uploads/raw values alongside normalized values and AI-generated interpretation.
9. ASSESSMENT → PROGRAM DECISION ENGINE
Create a structured bridge from findings to programming recommendations.
Map findings to coach-approved corrective blocks, mobility, warm-ups, substitutions, program constraints, volume/intensity changes or reassessment tests.
Example mapping: limited ankle mobility plus weak glutes may prompt a coach to consider a mobility/corrective block or squat variation.
Coach can accept, edit, reject or ignore every recommendation.
Never apply a material change to a published program without coach approval.
Store finding, evidence, recommendation, decision, linked action and later outcome.
10. WORKOUT / PROGRAM ENGINE
Full program builder for phases, cycles, weeks and days.
Support split structures (e.g. Upper/Lower, PPL, Arnold, Bro Split, custom), phases, cycles, weeks, training days and rest days.
Support warm-up, activation, main exercises, supersets, circuits, drop sets, rest-pause and other configurable set methods, cardio, mobility, corrective/rehab work and cooldown.
Exercise prescription fields: sets, reps, load, tempo, rest, RPE/RIR, duration, distance, target pace, method, notes and progression rules.
Support blank/manual creation, reusable templates, import and AI-generated editable drafts.
Coach can save draft, review and publish. Published plan is an immutable version; later edits create a new version.
Client-specific modifications must not change the master template or another client's plan.
Allow program start/end dates, phase labels, schedule and program review date.
11. EXERCISE LIBRARY & VIDEO LIBRARY
The exercise library must be coach-owned and easy to browse.
Provide horizontal category tabs such as Chest, Back, Shoulders, Arms, Legs, Glutes, Core, Calves, Cardio, Mobility and Corrective; categories are configurable.
Clicking a category shows exercises created/imported by the coach, with search, filters, video preview and key metadata.
System default library may be supplied, but coach can hide, replace, edit or supplement it.
Exercise fields: Arabic/English names, aliases, primary/secondary muscles, movement pattern, equipment, difficulty, unilateral/bilateral, plane, compound/isolation, cues, common mistakes, contraindications, progressions/regressions, alternatives, tags, video and thumbnail.
Support coach-owned demo videos, YouTube links and custom video uploads.
Support Excel/CSV import with column mapping, preview, duplicate detection, URL validation, row-level errors and safe retry.
12. MINI-PLAN / BLOCK LIBRARY
Reusable blocks speed up common programming work.
Support warm-up, cooldown, mobility, corrective, rehab, core, activation, cardio and micro-program blocks.
One-click insertion into a program or workout; inserted content becomes a client-specific instance.
Editing a client instance never changes the master block.
Version, tag, search, duplicate and archive mini-plans.
13. CLIENT WORKOUT EXPERIENCE & LOGGING
The client workout screen must be fast, clear and usable during training.
Show exercise order, demonstration video, cues, planned sets/reps/load/tempo/rest and coach notes.
Client logs actual sets, reps, load, RPE/RIR, pain/discomfort, difficulty, completion, skipped or modified status.
Show exercise history when opening an exercise: prior dates, sets, reps, loads, RPE/RIR, notes and completion.
Show last comparable session's performance before or during logging.
Client can add exercise-specific notes such as pain, discomfort, difficulty or unavailable equipment.
Support rest timer, session timer, pause/resume, elapsed duration, start/end timestamps and workout completion summary.
At workout end, compare with last comparable session: load, reps, sets, volume, completion and percentage changes; flag when conditions are not comparable.
Offline-friendly logging: preserve entries locally during weak connection and safely sync without duplicate records.
Technique video upload is shown only when package/client permissions allow it.
14. EXERCISE SUBSTITUTION & PROGRESSION
Coach retains control over all alternatives and progression rules.
Coach can configure substitutions globally, per package, per client, per exercise or per workout.
Alternatives may be coach-approved only, or system-suggested when the coach explicitly enables that mode.
Suggestions should consider movement pattern, goal, equipment, restrictions and relevant assessment findings.
Client may request or choose an alternative only if enabled by coach.
Every substitution logs original exercise, alternative, reason, date, workout/session and actor.
Coach controls notification behavior: immediate alert, dashboard-only, digest or no alert. Avoid excessive alerts for routine substitutions.
Progression rules may use reps, RPE/RIR, load, completion and coach-defined thresholds. Never silently rewrite a published plan.
15. WORKOUT ADHERENCE & COACH MONITORING
Provide useful operational visibility without confusing app activity with actual training.
Coach dashboard shows clients currently training based on an explicitly started active workout session, not merely because the app is open.
Show session duration, weekly training frequency, daily/weekly/monthly trends, missed workouts, repeated skips and unusually long sessions.
Views: daily, weekly and monthly; filters by coach, client, package, program and status.
Coach can message a client or create a follow-up task when adherence declines.
Clearly distinguish planned, started, completed, skipped, abandoned and partially completed sessions.
Do not claim precise calories burned from workout logs alone.
16. NUTRITION ENGINE & DIET BUILDER
Flexible diet construction controlled by the coach.
Support fixed meal plans, flexible macro targets, training/rest-day targets, carb cycling, intermittent fasting, meal timing, multiple options, food substitutions, outside food, water, steps, cardio, supplements and free/cheat meals.
Meal timing may be based on client sleep/wake time, work/lifestyle, training time, meals/day, preferences, allergies/intolerances and relevant intake information.
AI may assist in drafting a customized diet from the intake and coach instructions; coach edits and approves before publication.
Coach can define calories, protein, carbohydrates, fats, meal count, snacks, meal timing, food choices, household measures and instructions.
Each meal can have multiple approved options. Client can choose among them if enabled.
Support raw vs cooked food weights, grams, large tablespoons, cups, pieces, cans, slices and other household measures.
Coach can reuse a prior client's diet for another client if they judge it suitable, or adapt it to the new client's intake. Do not impose a blanket prohibition on diet reuse.
System may flag differences or conflicts (allergies, intolerances, schedule, calorie/macro mismatch), but coach retains freedom to reuse, edit or publish.
Published diet changes create a new version; AI must not silently change targets or meals.
17. FOOD DATABASE & FOOD MEASUREMENT
Egyptian/Arabic food coverage is a product differentiator.
Food database supports Arabic and English names, local aliases, Egyptian foods, raw/cooked variants, serving size, grams, calories, protein, carbs, fat, fiber and available micronutrients.
Support household measures and piece counts as well as grams. Provide conversion assumptions and identify estimates as approximate.
Coach can add custom foods, recipes and branded/packaged foods.
Support restaurant/outside foods and packaged products where data is available.
Food substitution should calculate an equivalent quantity based on coach-selected equivalence rules and macro tolerance.
Preserve the source/brand/label and whether values are database values, imported label values or estimates.
18. FOOD PHOTO & MEAL COMPLIANCE ASSISTANT
Photo analysis is an estimate and a coaching aid, not a precise measurement.
Client may upload a meal photo linked to a meal log, check-in or assigned meal.
AI may estimate food items, portion size, calories, protein, carbs and fat, and compare the meal with the assigned plan.
Allow client to add ingredients, cooking method, oil, sauces and portion corrections; allow coach/client to correct AI recognition.
Provide confidence/uncertainty and clearly label estimates. Do not present exact macros from an image as fact.
AI may offer practical suggestions (e.g. approximate portion adjustment) but must not silently change the diet or calorie/macro targets.
Store original image, AI estimate, user corrections and final logged values with timestamps.
19. SUPPLEMENTS ENGINE
Supplements are structured under the relevant meal/time in the diet plan.
Coach can create multiple supplement templates and add/edit product, brand/manufacturer (optional), dose, unit, timing, frequency, start/end and notes.
Group supplements under meal/time sections (e.g. after breakfast, before sleep, during training).
Support coach-owned reusable templates; no fixed universal stack or hard-coded dose recommendations.
Reminders can be relative to meals/times, e.g. after breakfast ask whether the client has taken supplements.
Client can mark taken/skipped and optionally record a reason.
AI suggestions require coach review and must not be presented as medical advice or automatically prescribed.
20. TRACKING ENGINE
Central tracking with source, timestamp and missing-data states.
Track bodyweight, workout performance, cardio, nutrition, water, steps, sleep, habits and custom metrics.
Coach controls weighing cadence: daily fasted, selected days, weekly, or another custom schedule. Daily weighing is not mandatory.
Support manual entry and connected wearable/imported data where consented.
Store timestamp, timezone, source (manual/imported/device/AI estimate), unit and correction history.
Show missing entries and configurable reminders. Coach can message a client when entries are missing.
Water targets and reminders are coach-defined and configurable.
21. MEASUREMENTS, PROGRESS PHOTOS & INBODY
All progress evidence is private, dated and comparable.
Coach defines measurement templates (waist, chest, arm, thigh, calf, neck and custom measurements), units and cadence.
Coach sets progress-photo cadence and required poses (front/side/back or custom).
Coach controls weighing frequency and InBody schedule according to package/follow-up type.
Automated reminders are generated only for configured events and stop when completed, skipped or rescheduled.
InBody input supports manual entry, PDF/image OCR and future device/API input. Preserve original report and normalized fields.
Compare InBody records, measurements and photos over time; show supported fields and absolute/percentage deltas.
Photo comparison may align side-by-side or timeline; AI may summarize visible differences with uncertainty but must not claim exact body-fat or muscle mass from photos.
Coach can see missing weigh-ins/measurements/photos and send a follow-up message.
22. CHECK-IN ENGINE & FOLLOW-UP SCHEDULING
Check-ins are package/client-configurable and distinct from daily access/support.
Support weekly, monthly and custom check-ins, with dynamic conditional questions and configurable required fields.
States: scheduled, due, submitted, waiting for coach, reviewed, overdue, skipped, rescheduled and cancelled.
Coach can create, skip, reschedule, manually complete or customize an event for one client.
DAWLYY date rule: Start Date = Day 0; Tracking Day 1 begins the next calendar day. First weekly check-in is Start Date + 7 days unless a client/package override is set.
Support four weekly check-ins per four-week cycle where the package is configured that way; do not hard-code three.
Generate schedules from package templates, but allow per-client edits without changing the master package.
Keep weekly check-ins weekly; VIP daily access does not create daily check-ins.
23. TECHNIQUE REVIEW ENGINE
Technique review is fully coach-defined by package and client.
Coach sets start/end period, cadence, caps, number of videos per week/month, allowed exercises, turnaround expectation and notifications.
Example configuration: first two weeks of a Weekly/VIP package require one hard set from each exercise; after that technique review may end unless reopened. This is an example configuration, not a global hard-coded rule.
VIP may allow open-ended/daily video submissions only if coach enables it and sets capacity/limits.
Support multiple attempts, pass/review/re-upload, text/voice feedback and optional timestamp comments.
Coach may skip, pause, reopen or change technique review for one client.
Use queues, caps and digests to prevent coach overload.
24. CALENDAR & TIMEZONE ENGINE
Calendar is exclusively for online-coaching operations.
Events include intake, assessments, check-ins, technique reviews, photos, measurements, weigh-ins, InBody, reassessment, program/diet review, tasks, renewal and reminders.
Support one-time, daily, weekly, biweekly, four-week, monthly and relative-to-start/end recurrence.
Use client/business timezone explicitly; handle daylight-saving/timezone changes safely.
Pause, freeze, cancel or extend subscription according to policy and recalculate dependent events with an audit trail.
Coach can add, edit, skip, reschedule or cancel events.
Do not include physical PT bookings or gym class scheduling in this calendar.
25. NOTIFICATION CENTER & MESSAGING
Unified communication with delivery state and coach control.
Support in-app, push, email and future SMS/WhatsApp-ready channels, subject to provider availability and consent.
Track queued, sent, delivered, failed, read and cancelled states; retry safely without duplicates.
Respect language, timezone, quiet hours, channel preferences and opt-outs.
1:1 messages support text, images, videos, files and voice notes; voice notes can be transcribed and searchable.
Automated messages follow configurable approval rules. Coach can use templates and bulk actions where safe.
Keep private internal notes separate from client-visible conversation.
26. CLIENT HOME & CLIENT NAVIGATION
Client UI should answer today's actions immediately and avoid operational complexity.
Home: today's workout, meals, water, steps, check-in, messages and due items.
My Program: current program, phase, weekly schedule and workouts.
Workout: exercise video, instructions, sets/reps, logging, history, rest timer and completion.
Nutrition: meals, options, macros, water, supplements, outside food and free-meal schedule.
Tracking: weight, water, steps, sleep, habits and enabled metrics.
Progress: approved graphs, measurements, photos and InBody.
Check-ins/Assessment/Technique: only when enabled/assigned.
Messages, Notifications, Calendar, Subscription and Profile/Settings.
Client sees only features included in package and enabled by coach.
27. COACH WORKSPACE & CLIENT 360
Coach workspace should reduce clicks and surface decisions.
Dashboard/Action Queue: who needs attention today, overdue check-ins, pending technique reviews, missing data, expiring subscriptions, payment issues and adherence decline.
Counts are clickable into filtered queues. Tasks support priority, due date, assignee, status, snooze, reassign, escalation and source event.
Client 360 timeline combines profile, package, intake, assessment, findings, programs, diets, tracking, check-ins, photos, measurements, InBody, messages, tasks, payments and subscription history.
Coach can see current and previous check-ins alongside relevant evidence in one review workspace.
Support bulk actions only when safe and auditable.
Private notes and client-visible notes must be visually and technically distinct.
28. TEAM COLLABORATION & APPROVAL
Optional team collaboration; solo mode remains fully functional.
Assign tasks to staff, add internal comments/mentions and hand off client work.
Sensitive objects may use Draft → Review → Approval → Publish.
Permission determines who can view, edit, approve, publish and export.
Record actor, timestamp, affected version and reason for important actions.
29. TEMPLATE, VERSION & CHANGE CONTROL
Universal versioning protects client history and reusable assets.
Support templates for programs, workouts, diets, intake forms, assessments, packages, supplements, mini-plans, reports and automations.
Master template → client-specific copy. Client changes never mutate the master.
Draft → Review → Publish. Published versions are immutable snapshots.
Editing a published object creates a new version; preserve prior versions and assignment history.
Provide a diff view showing added, removed and changed fields where practical.
Every change records actor, timestamp, reason (where applicable) and affected client/version.
30. SUBSCRIPTION ACCESS, EXPIRY & EXTENSIONS
Access state and payment state are separate.
On expiry, restrict active coaching services/content according to package rules while retaining historical data.
Client sees subscription end date, remaining days/countdown, access status and renewal instructions.
Renewal or coach-approved extension restores access according to the new dates/entitlements.
Manual negotiated extension must record actor, reason, previous dates, new dates and dependent schedule changes.
Support active, grace, paused/frozen, expired, cancelled and suspended states as configured.
Never delete history when access expires.
31. AUTOMATION ENGINE
Stateful event-driven automation: Trigger → Conditions → Action → Notification → Escalation → Completion.
Use cases: overdue check-ins, missing weigh-ins, measurements/photos/InBody due, incomplete onboarding, failed payments, expiring subscriptions, low adherence and AI approval tasks.
Automation stops or changes state when requirement is completed, skipped, cancelled or rescheduled.
Idempotency prevents duplicate tasks, notifications and payments.
Coach can enable/disable rules and configure timing, channels, quiet hours, retries and escalation.
Every automated action is traceable to the rule and event that created it.
32. AI PLATFORM & GOVERNANCE
AI is a controlled assistant layer across coaching workflows.
Use cases: workout/diet drafts, assessment/check-in/InBody/progress summaries, meal-photo estimates, food substitutions, voice commands, risk/renewal signals and structured actions.
Context Builder sends only relevant authorized client context; tenant/client permissions apply to every AI request.
Structured outputs must be schema-validated and reviewed for missing/invalid fields.
Material outputs require coach approval before publish or client-facing delivery.
Store model/provider, prompt version, knowledge version, context version, output, confidence, edits, approval and final action.
Provide provider abstraction, fallback, rate limits, cost/usage tracking, audit and feature flags.
AI must state uncertainty, avoid medical diagnosis and never silently change calorie/macro targets, published plans or entitlements.
33. VOICE-FIRST COACH ASSISTANT
Arabic and English voice input is a first-class coach workflow.
Coach can dictate a workout day, split, program, warm-up, exercises, sets/reps, tempo, rest, cardio, mobility and cooldown.
Coach can dictate a diet with calories, macros, meals/snacks, water, supplements/timing and free/cheat meal cadence.
Coach can modify an existing template using voice commands (add/remove/replace exercise, change sets/reps, adjust meal, etc.).
Pipeline: audio → transcription → intent/field extraction → validation → editable draft → coach approval → publish.
Support Arabic, English and mixed Arabic-English fitness terminology.
Voice output must remain editable. Never publish from voice input without coach review.
Store transcript and draft history; audio retention must be configurable.
34. AI KNOWLEDGE BASE & COACH MEMORY
Future knowledge layer for the coach's own methodology.
Coach may upload approved SOPs, programming rules, nutrition rules, assessment standards and educational material.
AI uses only authorized, relevant knowledge sources and identifies internal source references to the coach.
Coach edits are stored as workflow feedback/quality signals, not silently treated as model training.
Keep tenant knowledge isolated.
35. BUSINESS MANAGEMENT, LEADS & CLIENT PAYMENTS
Separate client coaching revenue from DAWLYY SaaS subscription revenue.
Lead funnel: new → contacted → qualified → consultation → offer → won/lost; include source, notes, follow-up, expected value and referral.
Client payment records support manual payment, amount, currency, date, method, proof/reference, verification status, invoice/receipt, refund and partial refund records.
Payment gateway integration is deferred from MVP. Design an abstraction/data model ready for future Paymob, Stripe, Fawry and other providers.
Manual methods such as Vodafone Cash may be recorded in MVP without a gateway integration.
DAWLYY SaaS billing is a separate future/tenant-level subsystem with plan limits for clients, staff, storage, AI, branding and integrations.
Support renewal, pause/freeze/resume, cancellation, grace periods and payment/access state machines.
36. REPORTS, ANALYTICS & INTEGRATIONS
Operational, coaching, business and product intelligence.
Coach analytics: adherence, progress, workload, overdue tasks, client attention and retention.
Business analytics: active clients, revenue, package performance, conversion, churn and payment failures.
Product analytics: funnel completion, feature usage and drop-off.
Potential integrations: WhatsApp Business API, Google Calendar, Apple Health, Google Health Connect, Garmin, Fitbit, Withings, MyFitnessPal, email/SMS and webhook/Zapier-style tools.
Wearable data is imported only with explicit connection/consent. Label measured/imported values separately from app estimates.
Integrations are modular and feature-flagged; do not block core MVP on advanced integrations.
37. LEGAL, CONSENT, PRIVACY & SECURITY
Health-related data, photos and videos require first-class privacy controls.
Terms of Service, Privacy Policy, coaching/health disclaimer and informed consent.
Separate consent where appropriate for health data, photos, videos, AI processing and communications; record version, timestamp and withdrawal.
Role-based access, least-privilege APIs, tenant isolation, encrypted transport/storage and private media URLs.
Audit access and sensitive actions; separate internal notes from client-visible data.
Support export, deletion/deactivation/archive and retention policies in line with applicable law and business policy.
Backups, restore testing, rate limiting and secure secrets management are required.
38. MEDIA, UPLOADS & WEAK-CONNECTION RELIABILITY
Uploads must be reliable under real mobile network conditions.
Support resumable/chunked uploads, progress, pause/resume, retry queue and background upload where supported.
Compress media, generate thumbnails, validate formats/sizes and process media asynchronously.
Interrupted connections must not silently lose a client upload.
Private media access must be authorized per request; use expiring/signed URLs where appropriate.
Define retention/deletion rules and audit access to sensitive photos/videos.
39. DATA QUALITY & VALIDATION
Preserve original sources and prevent corrupt values from contaminating coaching decisions.
Validate ranges, units, dates, duplicates, required fields and contradictory entries.
Flag impossible/outlier values rather than silently accepting or changing them.
Keep original source alongside normalized/imported/OCR values.
Do not feed obviously corrupt data into AI/calculation engines without warning.
Clearly identify estimated, imported, manually entered and coach-confirmed values.
40. COACH OVERRIDE & CONTROL — NON-NEGOTIABLE
The coach must never be trapped by a rigid workflow.
Coach can skip intake, assessment, individual tests and any non-mandatory workflow step.
Coach can start directly with program + nutrition + schedule.
Coach can add a step not included in the package, remove/skip/reschedule events and override entitlements for one client.
Coach can manually create anything AI can create.
Coach can edit, reject or ignore AI output and approve/publish material content only after review.
Every override is auditable and must not mutate the master package/template.
41. COACH DECISION / CHANGE ENGINE
Turn data into evidence-backed suggestions.
Potential actions include continue, review calories, adjust cardio, review training volume/recovery, request missing data or schedule reassessment.
Every suggestion shows supporting evidence, time period, confidence and relevant limitations.
Coach actions: accept, edit, reject, snooze or ignore.
Track decision and later outcome; never autonomously change a published plan.
42. EXERCISE PROGRESSION, SUBSTITUTION & ADHERENCE
Combine progression logic with client behavior and equipment constraints.
Coach-defined progression rules based on reps, RPE/RIR, load and completion.
Substitution considers movement pattern, goal, equipment and restrictions.
Custom habits, frequency, completion, streaks, milestones and adherence percentage.
Nutrition compliance may include calories, protein, meals, water, substitutions and planned free/cheat meals.
Client Attention/Risk Score is an operational attention signal, not a medical diagnosis. Show contributing evidence and allow coach override.
43. PHOTO / VIDEO INTELLIGENCE
Media review supports coaching but does not replace professional judgment.
Technique video player supports multiple attempts, optional timestamp comments, pass/review/re-upload and comparison.
Progress photo capture is standardized and private, with before/after, timeline and side-by-side comparison.
AI image interpretation must show uncertainty and must not claim exact body composition from photos.
Private media URLs, authorization per request, access logs and retention/deletion rules are mandatory.
44. SEARCH, IMPORT, EXPORT & PDF
Data must be portable and useful outside the application.
Global search across clients, exercises, programs, diets, check-ins, InBody, measurements, messages, templates, tasks and payments.
Import clients, exercises, programs, foods, templates and supported measurements with preview, validation, row errors and safe retry.
Export client data, programs, diets, reports, billing and audit data according to permissions.
Workout and nutrition plans must export as polished PDFs with all relevant details and clickable video links and/or QR codes where useful.
PDF supports Arabic/English, RTL/LTR, readable mobile/print layouts and optional DAWLYY branding.
Each PDF identifies the exact published version and date. PDF is an export, not a replacement for structured records.
45. LOCALIZATION, ACCESSIBILITY & UNITS
Arabic/English and RTL/LTR are first-class throughout.
Support localized dates, numbers, currency, pluralization and timezone.
Support kg/lb, cm/ft-in, km/mi, ml/oz and coach-selected household measures.
Egyptian/Arabic food aliases and coaching terminology.
Accessible forms, readable typography, keyboard navigation, contrast and captions/transcripts where applicable.
Do not embed text direction or language assumptions into business logic.
46. PLATFORM ENGINEERING & OPERATIONS
Production-grade engineering is required from the foundation.
Relational database with tenant isolation, constraints, indexes and migration strategy.
Private object/media storage; background jobs for reminders, notifications, AI, OCR, video processing, reports and automations.
Cache/aggregation for dashboards and Client 360; search/indexing for clients, exercises, templates and messages.
Idempotency keys for payments, notifications, imports and critical events.
Event log for important events such as checkin.completed, program.published and payment.failed.
Development, staging and production environments with separate secrets/data.
Observability: logs, metrics, traces, error tracking, job monitoring and system-health dashboard.
Rate limiting for login, OTP, AI, uploads, messaging and APIs.
Automated backups, restore testing and defined RPO/RTO targets.
47. FEATURE FLAGS, TENANT LIMITS & USAGE
Features and usage limits must be configurable.
Feature flags for AI Voice, WhatsApp, InBody OCR, wearables, PDF branding and future capabilities.
SaaS plan limits may include clients, staff, storage, AI, branding and integrations.
Usage dashboard for AI, storage, video processing, notifications, messaging/API usage and active clients.
Feature flags must support internal testing, staged rollout and tenant-specific enablement.
48. TESTING & ACCEPTANCE
Testing must cover business logic, privacy and end-to-end workflows.
Unit, integration, end-to-end, permission, tenant-isolation, automation, upload, AI-approval, billing and localization tests.
Test client A cannot access client B; staff cannot access unassigned clients without permission.
Test package entitlements are server-enforced and client overrides do not mutate master package.
Test skipped workflow steps do not block clients; reminders stop when completed/skipped/cancelled.
Test duplicate webhooks/actions are idempotent; AI cannot publish without approval.
Test published versions remain immutable and old versions remain available to authorized users.
Test offline workout logs and uploads sync without loss or duplication.
49. DEMO, SEED DATA & ENVIRONMENTS
Provide realistic demo data for acceptance and onboarding.
Seed demo tenant with Owner, optional staff, clients, packages, exercises, foods, programs, diets, check-ins, InBody records and automations.
Provide clean Development, Staging and Production environments.
Demo data must be clearly separated from production data and removable/resettable.
50. COMPETITIVE BLUEPRINT & RESEARCH REFERENCES
Use competitor products as workflow/UX benchmarks, not as material to copy.
Benchmarks discussed: FITXPERT, Be Prime / Trainerize, B Prime, FitStation/FitSTN (exact identity to be confirmed), Heavy – Gym Tracker Workout Log and Strong – Workout Tracker Gym Log.
Use lawful public research and UX benchmarking. Do not copy proprietary code, assets, branding or protected content.
Separate verified public capabilities from assumptions/inferences and items requiring further research.
Heavy and Strong are references for workout logging, exercise history, progression charts, rest timer and session summaries, not a mandate to clone their interfaces.
51. END-TO-END CLIENT LIFECYCLE
Expected default journey; every step remains configurable.
Coach creates/selects a package and assigns it to a client.
Client account/Client ID is created or linked; start/end dates and entitlements are established.
Coach sends intake or marks information as known/skips it.
Coach assigns assessment or skips it.
Coach publishes program + nutrition + schedule; client immediately sees today's actions.
System generates configured check-ins, tracking, technique, measurement, photo, InBody and review events.
Client logs workouts, nutrition, water, weight and assigned uploads.
Coach reviews the Action Queue and Client 360; AI drafts summaries/recommendations where enabled.
Coach approves/edits/rejects changes; new versions are published.
Reassessment compares baseline and current data; renewal workflow begins before expiry.
52. DATA MODEL — CORE ENTITIES
The exact physical schema is a technical design decision, but the domain model must cover these objects and relationships.
Tenant, BusinessSettings, User, RolePreset, Permission, Team, CoachAssignment, ClientProfile, ClientID, HealthProfile, TrainingHistory, Goal, Injury, Allergy/Intolerance.
Package, PackageVersion, Entitlement, ClientEntitlementOverride, Subscription, AccessState, PaymentRecord, Invoice, Refund, Renewal.
Form, FormVersion, Section, Question, ConditionalRule, Submission, Response.
Assessment, AssessmentVersion, TestDefinition, TestAssignment, TestResult, Finding, AssessmentReview, FindingAction.
Program, ProgramVersion, Phase, Cycle, Week, TrainingDay, Workout, WorkoutSession, ExercisePrescription, ExerciseSetLog, ExerciseNote, ExerciseSubstitution.
Exercise, ExerciseMedia, ExerciseTag, ExerciseAlternative, ImportBatch, ImportRow, MiniPlan, MiniPlanVersion.
NutritionPlan, NutritionVersion, Meal, MealOption, Food, Recipe, FoodServing, MacroTarget, CycleRule, FreeMealRule, MealPhoto, FoodEstimate.
Supplement, SupplementTemplate, SupplementPlan, SupplementLog.
WeightLog, WaterLog, SleepLog, Habit, HabitLog, CardioLog, MeasurementType, MeasurementSet, ProgressPhotoSet, InBodyRecord.
CheckInTemplate, CheckInSubmission, TechniqueReview, TechniqueVideo, CalendarEvent, ReminderRule, Notification, DeliveryLog.
Conversation, Message, VoiceNote, Attachment, Task, RiskFlag, RenewalFlag, Template, TemplateVersion, AuditLog.
AIRequest, AIOutput, AIRecommendation, CoachApproval, KnowledgeSource, Report, ReportSnapshot, AnalyticsEvent, IntegrationConnection, UsageRecord.
53. API & INTEGRATION CONTRACT
Backend/domain logic must be independent of the frontend.
Define documented API contracts for authentication, tenants, clients, packages, entitlements, intake, assessments, programs, exercises, nutrition, tracking, check-ins, media, messaging, billing, reports and AI.
Use consistent validation/error formats, pagination, filtering, sorting, authorization and versioning.
Critical business rules (entitlements, expiry, approvals, versioning, schedule generation) must run server-side.
Use background jobs for long-running tasks and expose job status to the UI.
Use webhooks/events for integration boundaries; protect against replay and duplicate delivery.
Provide API documentation and a staging environment for acceptance testing.
54. SCREEN-BY-SCREEN COACH NAVIGATION
Minimum coach workspace screens. Exact visual design may evolve, but required workflows must remain available.
Dashboard / Action Queue: priority counts, pending work, filters, tasks, overdue and expiring items.
Clients: searchable list, filters, status, package and assignment.
Client 360: overview, timeline, notes, package/access, current plan, tracking, uploads and history.
Packages: package builder, entitlements, follow-up templates and client overrides.
Intake Builder: template list, form editor, conditional logic, preview and submissions.
Assessment Builder/Review: test library, templates, assignments, evidence, findings and report.
Program Builder: phases, weeks, days, workouts, exercise library, templates, mini-plans and publish history.
Exercise Library: categories, search, filters, videos, custom exercises and imports.
Nutrition Builder: diet versions, meal options, macro targets, food database, substitutions and supplements.
Tracking & Progress: weight, workouts, adherence, water, habits, measurements, photos and InBody.
Check-ins & Technique: due/submitted/review queues, feedback and approvals.
Calendar & Tasks: online-coaching events, due dates, tasks and reminders.
Messages: conversations, attachments, voice notes and templates.
Reports & Analytics: client progress, adherence, business and retention reports.
Team & Permissions: optional team setup, per-user permission editor and assignments.
AI Workspace: drafts, evidence, approvals, history, cost/usage and knowledge base.
Billing & Settings: client payment records, access/renewals, branding, language, notifications, integrations and usage.
55. SCREEN-BY-SCREEN CLIENT NAVIGATION
Client navigation is simplified and package-aware.
Home / Today: next actions and due items.
My Program: program phase, weekly plan and workout list.
Workout Session: exercise instructions, logging, history, timer, notes and finish summary.
Nutrition: meals, options, macros, food logging, meal photos, water and supplements.
Tracking: weight, water, steps, sleep, habits and enabled metrics.
Progress: approved reports, graphs, measurements, progress photos and InBody.
Check-ins / Assessment / Technique: only when assigned and entitled.
Messages / Notifications / Calendar.
Subscription: package, start/end dates, remaining days, access status and renewal.
Profile / Settings: personal details, language, privacy, connected devices and notification preferences.
56. STATE MACHINES & BUSINESS RULES
Implement explicit state transitions rather than ad hoc booleans.
Subscription/access states: pending, active, grace, paused/frozen, expired, cancelled, suspended; payment state remains separate.
Check-in states: scheduled, due, submitted, waiting_for_coach, reviewed, overdue, skipped, rescheduled, cancelled.
Workout session states: not_started, active, paused, completed, partially_completed, skipped, abandoned.
Media review states: requested, uploaded, processing, queued_for_review, approved, needs_resubmission, rejected, archived.
Publishing states: draft, in_review, approved, published, superseded, archived.
Automation states: pending, running, completed, cancelled, failed, retrying.
All state changes must validate permissions, dates, dependencies and idempotency; retain history.
57. DEFINITION OF DONE
DAWLYY is ready for production only when all applicable acceptance criteria pass.
Solo Owner can operate the full coaching workflow without creating a team.
Owner can optionally add staff and configure granular permissions.
Coach can onboard a known client without intake/assessment and start with program + nutrition + schedule.
Coach can customize forms, assessments, packages, follow-up, technique review, tracking cadence and entitlements.
Coach can create programs/diets manually, from templates, import or AI draft; client receives only approved published versions.
Client can log workouts with exercise history, notes, substitutions and session timing.
Coach can review adherence, missing data, active sessions and client progress.
Food database, household measures, meal photo estimates and supplements work with clear estimate/source labels.
Subscription expiry restricts active access while preserving history; extension/renewal restores access correctly.
Arabic/English and RTL/LTR work throughout.
Security, tenant isolation, audit, backup/restore, upload reliability and critical automated tests pass.
58. FINAL BUILD DIRECTIVE
Build the platform as modular, scalable online-coaching software.
Do not reduce this specification to static screens. Implement real business logic: generated schedules, entitlements, overrides, reminders, immutable history, calculations, comparisons, task queues, notifications and versioned publishing.
Use seed/demo data so the coach dashboard demonstrates a realistic lifecycle.
Where a requirement is configurable, build a configuration mechanism. Where a feature is package-dependent, enforce entitlements. Where AI is involved, implement draft/review/approve/publish. Where data changes, preserve history.
Deliver working increments with documented assumptions, API contracts, test evidence and a list of deferred features.
Do not add physical PT booking or gym-management functionality to the initial scope.
59. CHANGE CONTROL & SOURCE BASIS
This version consolidates the earlier master specification and the approved additions made during the DAWLYY project conversation.
Baseline sources reviewed: DAWLYY_AI_PROGRAMMER_MASTER_SPECIFICATION_v1.docx (40-section original) and DAWLYY_FINAL_AI_PROGRAMMER_MASTER_SPECIFICATION_v2.docx (63-section consolidated version).
Approved additions incorporated: optional/custom team permissions; coach-owned intake and assessment builders; detailed exercise library and workout logging; substitution controls and notification options; workout adherence dashboard; AI food-photo estimates; coach-controlled diet reuse; household measures; supplement templates/reminders; configurable weigh-ins, measurements, InBody and technique review; subscription countdown/extensions; deferred payment gateways; PDF exports; UX simplicity; competitor benchmark expansion.
Conflict resolution: explicit Owner/Coach override first; then tenant/package/client configuration; then version/history/audit; then privacy/safety; then automation convenience.
Do not restore the obsolete blanket rule that diets must never be reused between clients. Coach may reuse/adapt a diet after reviewing suitability; system may flag potential conflicts.
Do not treat optional role names, assessment tests, default intake questions, supplement doses or technique cadence as fixed mandatory defaults.
60. MVP VS LATER PHASES
Recommended delivery sequencing to control cost and prevent building advanced features before the core workflow works.
P0 / Core MVP: authentication, tenant/solo-owner foundation, client profiles, packages/entitlements, subscription access, Client 360, customizable intake, optional assessments, program builder, exercise library, nutrition builder, food database basics, supplements, workout logging/history, tracking, check-ins, calendar/reminders, messaging, templates/versioning, coach dashboard/action queue, privacy/security and Arabic/English.
P1 / Coaching intelligence: advanced assessment templates/findings, technique review, photo/measurement/InBody workflows, reassessment comparisons, substitutions/progression, advanced automation, PDF export, richer adherence reports, imports and meal photo estimates.
P2 / AI and integrations: voice workout/diet builder, AI check-in/assessment/progress summaries, AI food-photo recognition, wearables, advanced analytics, knowledge base and deeper integrations.
Later platform expansion: native iOS/Android apps, multi-business self-service onboarding, gym/PT operations, advanced WhatsApp integrations and other fitness-business modules.
Payment gateway integrations (Paymob/Stripe/Fawry etc.) are not required for MVP. Keep architecture ready; manual payment recording is sufficient initially.
Release sequencing may be adjusted by Owner and programmer, but scope changes must be documented with impact on cost/time.
61. UX ACCEPTANCE PRINCIPLES
The application must remain simple in everyday use even as its feature set grows.
Progressive disclosure: show essential fields first; advanced controls are expandable.
Common coach actions should take as few steps as practical; avoid navigating multiple screens for routine edits.
Client home should require almost no explanation; use clear cards/statuses rather than dense operational tables.
Coach dashboard may use dense tables and filters because it is an operational tool.
Clear statuses: Complete, Due, Overdue, Waiting for Coach, Waiting for Client, Needs Review, Expired.
Every upload shows progress and confirmation; every form shows completion status.
Every plan edit has Save/Publish distinction and version history.
Avoid duplicate data entry, excessive notifications, unnecessary required forms and complex settings in daily workflows.
Use sensible defaults while allowing coach control.
62. REQUIRED DEVELOPER DELIVERABLES
The programmer must deliver more than a clickable prototype.
Technical architecture diagram and deployment plan.
Database ERD/schema and migration strategy.
API documentation and authentication/authorization model.
Screen inventory and navigation map for coach and client.
Working responsive web application with backend business logic.
Automated test suite and acceptance-test results.
Staging environment and demo accounts/data.
Backup/restore procedure, monitoring and error reporting.
Admin/Owner guide and basic client usage guide.
Known limitations, deferred features, third-party dependencies and recurring costs.
Source code repository and deployment/access handover according to the development agreement.
63. PROJECT SIGN-OFF & BUILD READINESS
Use this checklist before production launch and before declaring a milestone complete.
Owner has reviewed and approved the screen flows and scope for the milestone.
All critical requirements in the relevant release are implemented and tested.
No unresolved high-severity security, privacy, tenant-isolation or data-loss defects remain.
All manual assumptions and scope deviations are documented and approved.
Data export, backup and restore have been tested.
Client and coach workflows have been tested in Arabic RTL and English LTR.
Owner has access to source code, staging/production environments, credentials and documentation as agreed.

APPENDIX A — CRITICAL ACCEPTANCE TEST SCENARIOS
Create a solo Owner account and operate all core coach modules without creating a team.
Create an optional team member and grant access only to selected clients/modules; verify denied access through direct API requests.
Create two tenants and verify no cross-tenant record or media access.
Create a package with selected entitlements, assign it to Client A, and verify server-side enforcement.
Override one entitlement for Client A and verify the master package and Client B remain unchanged.
Assign a client with intake skipped and assessment skipped; publish program + nutrition + schedule successfully.
Create two intake templates with different questions and conditional logic; submit one and verify historical version preservation.
Create an assessment template, assign only selected tests, receive media/results, create findings and publish only after coach approval.
Create a workout template, assign it to two clients, customize one client and verify the other/master remain unchanged.
Open an exercise and verify prior performance history is visible; log a new session and compare with the prior comparable session.
Substitute an exercise and verify original, alternative, reason, actor and date are recorded; verify notification preference is respected.
Start a workout session, pause/resume, finish, and verify duration and completed/skipped exercise states.
Log offline workout data, reconnect, and verify no data loss or duplicate entries.
Create a diet from a prior client template for a new client; verify the coach can proceed while system flags relevant allergy/schedule conflicts.
Upload a meal photo and verify estimates are labelled approximate, confidence is shown and user corrections are stored.
Use household measures and verify conversions show the assumptions and approximate status.
Create supplement reminders relative to a meal and verify client can mark taken/skipped.
Set weekly weigh-ins rather than daily and verify no daily weighing reminder is generated.
Configure check-ins at Start Date + 7 days and four per four-week cycle; verify generated dates and client-specific rescheduling.
Configure technique review for first two weeks, then stop; verify it can be reopened for one client.
Expire a subscription; verify active access is restricted, countdown/status is visible before expiry, and history remains.
Extend a subscription manually; verify actor/reason/dates and dependent events are recorded.
Verify reminders stop when an event is completed, skipped or cancelled.
Generate workout and nutrition PDFs in Arabic RTL and English LTR with correct version/date and clickable media links.
Verify AI output remains draft until coach approval and all prompts/context/versions/edits are auditable.
Verify photo/video access requires authorization and private media URLs expire as configured.
Test backups and restore; verify restored data integrity.
APPENDIX B — OPEN TECHNICAL DECISIONS FOR THE DEVELOPMENT KICKOFF
These are implementation choices, not missing product requirements. The programmer should propose options, costs and trade-offs, then obtain Owner approval before locking them in:
Technology stack, hosting/cloud provider, database and object storage.
Authentication provider and OTP/email delivery providers.
Video/image processing pipeline and storage/egress cost model.
AI providers/models, usage limits, privacy terms and estimated cost per active client.
Notification providers and which channels are included in the first release.
Payment gateway timing and provider selection; gateway integration is deferred from MVP.
Exact visual design system, screen wireframes and responsive breakpoints.
Retention/deletion periods, backup frequency and RPO/RTO targets.
Initial launch languages and any local legal/compliance review needed.
Milestone plan, budget, delivery dates, warranty/support and ownership of source code.
APPENDIX C — IMPORTANT CLARIFICATIONS THAT MUST NOT BE MISINTERPRETED
Solo coach mode is a first-class use case; team setup is optional.
Role presets are suggestions only. Granular per-user permissions are required when a team is used.
Intake and assessment are optional. Coach can skip them and start with a plan.
Coach owns intake and assessment design; defaults are editable starting points only.
Exercise categories are browse tabs; the coach's own library content is displayed within each category.
Workout history must be visible at exercise level, not only in a global report.
Client exercise notes and substitutions must be recorded and visible to coach.
Substitution notifications are configurable; do not spam the coach.
Active workout detection depends on a started session, not app-open status.
Workout calorie burn must not be presented as precise from logs alone.
Coach may reuse/adapt a diet from another client. Do not implement a blanket prohibition.
Food-photo macros and household conversions are estimates and must be labelled as such.
Supplement templates and doses are coach-defined; there is no universal default stack.
Daily weigh-in is optional; coach controls cadence.
Technique review duration, video caps and turnaround are package/client-configurable.
VIP support does not mean daily check-ins.
Subscription expiry restricts access but never deletes history; countdown and approved extension must be supported.
Payment gateway integrations are deferred from MVP; manual payment records are acceptable initially.
PDF exports are required for workout and nutrition plans.
Do not add physical PT booking or gym management to the online-coaching MVP.
APPENDIX D — COMPETITOR BENCHMARKING NOTES
Trainerize / Be Prime: benchmark client-facing workout/nutrition delivery, tracking, habits, messaging, integrations and coach workflows. Verify exact features and plan availability before treating any as confirmed.
FITXPERT: benchmark coach-business CRM, client management, plan builders, subscriptions, automation, branding and reporting.
B Prime: retain as a separate reference named by the Owner; verify exact product identity/features during research rather than assuming equivalence with Be Prime.
FitStation / FitSTN: identity needs confirmation before feature-level benchmarking.
Heavy and Strong: benchmark workout logging, exercise history, progression charts, rest timer and workout summaries.
Use public product information and observed UX patterns only. Do not copy source code, proprietary assets, branding or protected content.
APPENDIX E — RELEASE PRIORITY SUMMARY
Priority
 | Scope
 | Delivery intent
 | P0 — Core MVP
 | Auth, solo/tenant foundation, clients, packages/access, Client 360, intake, optional assessment, program/exercise library, nutrition/food basics, supplements, workout logging/history, tracking, check-ins, calendar/reminders, messaging, templates/versioning, coach dashboard, security/localization.
 | First usable production coaching platform.
 | P1 — Coaching intelligence
 | Advanced assessment/findings, technique review, photos/measurements/InBody, reassessment, substitutions/progression, advanced automation, PDF export, richer reports, imports, meal-photo estimates.
 | Increase coaching efficiency and differentiation.
 | P2 — AI & integrations
 | Voice workout/diet creation, AI summaries, AI photo recognition, wearables, knowledge base, advanced analytics and deeper integrations.
 | Expand automation and intelligence after core stability.
 | Later
 | Native apps, self-service multi-business onboarding, gym/PT operations and advanced WhatsApp ecosystem.
 | Long-term platform expansion; not MVP blockers.
 | END OF AUTHORITATIVE DAWLYY MASTER BUILD SPECIFICATION — VERSION 4.0
