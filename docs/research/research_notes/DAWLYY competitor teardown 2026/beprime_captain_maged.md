# Beprime / Captain Maged benchmark and DAWLYY identity questions (as of 7 Nov 2026)

Method note: web fetch, iTunes lookup API and raw HTML of public pages. About 12 tool calls. Instagram, TikTok, Google Play, review text, and App Store screenshot content were not reachable or not readable. No proprietary text or assets copied.

## 1. Who is Captain Maged, and is Beprime his brand or a platform company?

### Takeaway
Beprime is a platform (SaaS) company for Egyptian fitness coaches, not a coach brand. "Captain Maged" is one coach app/site that runs on the Beprime platform (a tenant), published under the App Store seller name "youssef ahmed", who appears to be the Beprime operator.

### Cited Findings
- beprime.ink calls itself a coaching-management platform (tagline: "You are the coach, we are the system"); it sells a branded app, website, subscription management, diet/training plans, automation, analytics, AI, CRM and chat to trainers. Footer (c) 2026 BePrime. The home page does not mention Captain Maged. — [beprime.ink](https://www.beprime.ink/)
- captainmaged.com serves a page titled "Prime" with a multi-tenant bootstrap: its code resolves the tenant from hostnames such as `*.beprime.site`, reads per-tenant branding (appName, icons, theme) and sends tenant headers (`x-tenant-subdomain`). Meta description: "Advanced fitness and nutrition tracking application with AI-powered analysis and comprehensive workout management". — [captainmaged.com raw HTML](https://www.captainmaged.com/)
- The App Store seller is "youssef ahmed", bundle id `com.captainmaged.app`, copyright line "Powered By Ahmed Maged". — [App Store EG](https://apps.apple.com/eg/app/captain-maged/id6756163707), [iTunes lookup](https://itunes.apple.com/lookup?id=6756163707&country=eg)
- Beprime's refund page names an InstaPay handle "yousseef.ah@instapay" for payments to Beprime. It resembles the App Store seller name "youssef ahmed". — [beprime.ink/refund-policy](https://www.beprime.ink/refund-policy)

### Inferences
- Captain Maged is a white-label tenant of Beprime's own multi-tenant platform. The developer (Youssef Ahmed) is likely the Beprime operator. The coach is probably "Maged" (copyright "Ahmed Maged", possibly the same person), but this is unproven.
- Captain Maged's app is therefore NOT a white-label of ABC Trainerize, Everfit, PT Distinction, Hupe, Fitr, My PT Hub, Kahunas or FitXpert. It is a custom Beprime build, most likely a web app (PWA) wrapped for iOS.
- Beprime's own marketing site is Next.js (assets under /_next/). The Captain Maged web app is a different, client-rendered front end with tenant theming.

### Gaps
- Coach's real name, Instagram handle, follower count, location, specialty: not found. Instagram/TikTok were unreachable; web search for "Captain Maged" returned nothing relevant; Beprime's social links are "#" placeholders.
- Whether Youssef Ahmed and the coach are related, or whether Ahmed Maged is the coach: unconfirmed.

## 2. Is the iOS app white-label or custom? App Store facts

### Takeaway
Custom, tenant-branded build on Beprime's own stack. Small and young: released 8 Dec 2025, 4.27 stars from 11 ratings, English-only listing, no IAP, "Data Not Collected" label.

### Cited Findings
- Released 2025-12-08; current version released 2026-07-03; v1.1.3 note "health connect"; v1.1.2 "New update and push Notification"; v1.1.0 (23 Dec 2025) "Better loading, scrolling fixes, video player fix"; v1.0.0 on 08/12/2025. — [App Store EG](https://apps.apple.com/eg/app/captain-maged/id6756163707), [iTunes lookup](https://itunes.apple.com/lookup?id=6756163707&country=eg)
- Rating 4.27 from 11 ratings; free; no in-app purchases listed; Health & Fitness; age 9+; 37.6 MB; iOS 15.1+; listed language English only; privacy label "Data Not Collected". — same sources
- Store description: AI-powered insights; track nutrition, workouts, sleep, weight, hydration; personalized plans and smart food alternatives on demand. — [iTunes lookup](https://itunes.apple.com/lookup?id=6756163707&country=eg)
- The privacy policy link points to captainmaged.com/privacy-policy, which shows only "Prime" without JavaScript (client-rendered). — [page](https://www.captainmaged.com/privacy-policy)
- Beprime's features page preloads about 20 app screenshot images (/img-app/...), so Beprime markets this same app UI. — [beprime.ink/features](https://www.beprime.ink/features)

### Inferences
- "Data Not Collected" is inconsistent with a login-based coaching app with chat and plans. The label is probably inaccurate. Flag it; do not rely on it.
- The app is free and payment happens outside the App Store (manual Vodafone Cash / InstaPay, section 4). This avoids Apple's commission but may be an App Review risk.

### Gaps
- Google Play listing: not found.
- Screenshot contents, review text and review themes: not readable (only 11 ratings).
- Android availability and Arabic UI in the app: unconfirmed (listing says English only).

## 3. Client-facing and coach-facing features

### Takeaway
Beprime sells coaches a business-in-a-box; the Captain Maged client app covers tracking plus plans with AI food help.

### Cited Findings
- Beprime coach features: branded app and website, subscription lifecycle with expiry reminders, one profile per client holding diet and training plans, automated onboarding/follow-up/renewal, analytics on commitment, progress, retention, income, AI (food photo analysis, session analysis, linking sleep/water/weight data), built-in CRM and chat, audience segments, data encryption, client self-registration. — [beprime.ink](https://www.beprime.ink/)
- Client app (Captain Maged): tracks nutrition, workouts, sleep, weight, hydration; push notifications (v1.1.2); video player (v1.1.0); health connect integration (v1.1.3). — [App Store EG](https://apps.apple.com/eg/app/captain-maged/id6756163707)

### Inferences
- Exercise videos are implied by the video-player fix. Progress photos, habits and check-in forms are not evidenced.

### Gaps
- No direct view of the app UI, so UX patterns (navigation, check-in cadence, in-app Arabic/RTL) are unverified. The Beprime marketing site itself is Arabic RTL.

## 4. Packages, prices, payment, refunds

### Takeaway
Beprime charges coaches (B2B2C), not clients: 1,000 EGP/month for up to 100 clients, 2,000 EGP/month tier, custom enterprise. Captain Maged's own client pricing is unknown.

### Cited Findings
- Starter: 1,000 EGP/month, up to 100 clients. Ambitious: 2,000 EGP/month (example 150 clients, with a client-count selector). "Sharks" enterprise: custom price, unlimited clients, branded mobile app, dedicated manager. No credit card to start; price lock for one year; ready in under 24 hours. — [beprime.ink](https://www.beprime.ink/)
- Payment: Vodafone Cash transfer and InstaPay transfer, then send the receipt via WhatsApp; activation within 24 working hours after verification. Prices in EGP including taxes; monthly or annual plans; auto-renew unless cancelled; 30 days notice for price changes. — [refund policy](https://www.beprime.ink/refund-policy)
- Refund: full refund within 7 days only if no clients were added and no plans created; none after; request via WhatsApp, answered within 48 working hours, refunded in 5-7 working days via the original method; data kept 90 days after expiry; export allowed. Policy dated April 2026. — [refund policy](https://www.beprime.ink/refund-policy)
- Paymob/card: not mentioned in the policy.

### Gaps
- Captain Maged's client packages (monthly/3-month/VIP) and VIP contents: not found. The web app is behind login.
- /pricing returns 404; pricing sits on the home page.

## 5. Onboarding flow

### Takeaway
Coach onboarding is manual-assisted (WhatsApp, receipt, activation in under 24h). Client intake flow unseen.

### Cited Findings
- Coach: free trial sign-up, WhatsApp as the main CTA, platform ready in under 24 hours. — [beprime.ink](https://www.beprime.ink/)
- Clients self-register; the system handles data, plans, schedules. — same

### Gaps
- Intake form, assessment, first-week experience for Captain Maged clients: not found.

## 6. Ratings, social proof, launch date

### Cited Findings
- App Store EG: 4.27 from 11 ratings; first release 8 Dec 2025; last update 3 Jul 2026. — [iTunes lookup](https://itunes.apple.com/lookup?id=6756163707&country=eg)
- Beprime home page stats show 0% placeholders; social icons link to "#". — [beprime.ink](https://www.beprime.ink/)

### Inferences
- Social proof is very thin. This benchmark is early-stage and small.

### Gaps
- Instagram/TikTok/YouTube/Facebook presence, follower counts, Google Play ratings, forum chatter: not retrievable.

## 7. "B Prime": same as Beprime?

### Takeaway
No distinct fitness product called "B Prime" found. Most likely a spelling variant of BePrime (the site writes "BePrime", logo styled "Be" + "Prime").

### Cited Findings
- A search for "B Prime" fitness app Egypt returned only unrelated Egyptian apps (ElCoach, Gorilla Fit, Coachera, Fit4life Egypt, iCoach Egypt). — [ElCoach launch article](https://www.menabytes.com/just-launched-elcoach/)
- The Captain Maged web app's own title/app name is "Prime". — [captainmaged.com](https://www.captainmaged.com/)

### Inferences
- "B Prime" = Beprime (likelihood high); the tenant default name "Prime" adds to the naming drift.

### Gaps
- Instagram and Google Play checks for "B Prime" not possible.

## 8. FitStation / FitSTN

### Takeaway
Two different products. For an Egyptian coach, "Fitstn" is plausible: a client-only coaching app for coach Ahmed Bassouny. "FitStation" is an older US community fitness app.

### Cited Findings
- Fitstn (App Store id6739849951): publisher Mostafa Hesham; "exclusively designed for Ahmed Bassouny's subscribed clients"; released 8 Jan 2025; v1.0.39; 3.6 from 32 ratings, 1k+ downloads; features: workout and nutrition plans, calories/macros, weekly schedule with supersets, body composition history, WhatsApp chat with coach, subscription package view ("FitPro PACKAGE"). — [mwm.ai](https://mwm.ai/apps/fitstn/6739849951)
- FitStation (Community Fitness, FitStation LLC): social fitness app with Member/Trainer/Gym account types, check-ins, feedback; last listed update 2019 (v1.1.3). — [AppAdvice](https://appadvice.com/app/fitstation-community-fitness/1268620057); built by Scopic ([portfolio](https://scopicsoftware.com/portfolio/fitstation/))
- "Fit Station Gym Club" is a separate Turkish gym app, probably unrelated. — [App Store](https://apps.apple.com/app/id6758675163)

### Inferences
- Publisher name differs from coach name, the same pattern as Captain Maged (seller is a developer, app belongs to a coach). Developers build per-coach apps in Egypt.
- Ahmed Bassouny's nationality is not verified; "Egyptian coach" is an assumption.

### Gaps
- Whether the DAWLYY spec meant Fitstn or another product: the spec author must confirm.

## Verified / Inferred / Could not confirm

Verified
- Beprime is a platform company selling to coaches; prices 1,000 / 2,000 EGP per month, enterprise custom.
- Payment via Vodafone Cash and InstaPay, receipt over WhatsApp; 7-day conditional refund.
- Captain Maged iOS app: seller youssef ahmed, released 8 Dec 2025, 4.27 from 11 ratings, free, English listing, no IAP.
- captainmaged.com code is a tenant-aware platform shell referencing beprime.site.
- Fitstn is a separate per-coach client app (Ahmed Bassouny).

Inferred
- Captain Maged is a Beprime tenant; Youssef Ahmed is the Beprime operator.
- "B Prime" = Beprime.
- The iOS app is a custom wrapped web app, not a third-party white-label.

Could not confirm
- Coach identity, Instagram/TikTok handles, followers, location.
- Client packages, VIP content, client intake flow, in-app Arabic UI, Google Play listing, review text.

## What DAWLYY must match
- Arabic-first RTL experience (Beprime site is Arabic; app listing is English-only).
- Coach-branded app under the coach's name with push notifications and a video player.
- Nutrition and training plans, progress metrics (weight, sleep, hydration), health-platform sync, in-app chat.
- Subscription lifecycle tracking with expiry reminders and renewal nudges.
- Local payment rails: Vodafone Cash and InstaPay at minimum; fast activation.
- Coach analytics (retention, income, commitment).

## Where DAWLYY can clearly beat it
- Payment: automated, reconcilable checkout (Paymob/card/wallet/InstaPay) instead of manual transfer plus WhatsApp receipt and 24h activation.
- Cancel/refund: self-serve, not WhatsApp-only.
- Trust: Beprime has placeholder stats, dead social links, 11 App Store ratings.
- Accurate privacy labels and a working public privacy page (Captain Maged's renders blank without JS and the label says no data collected).
- Native Arabic app UI plus English (Captain Maged declares English only).
- Transparent public pricing page (Beprime /pricing returns 404; client-side pricing unseen).
- Structured intake, assessment, check-ins and progress photos, none of which is evidenced at Beprime.
