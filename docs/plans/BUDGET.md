# DAWLYY budget, from now to public launch

Written 8 Nov 2026 for Mohamed. Prices are in US dollars, checked on 8 Nov 2026 from the sources listed at the end.
Most come from third-party pricing guides, because the official pages did not load in search. Check each official
page before paying. Nothing here is bought or opened without Mohamed's yes naming the item (see `APPROVALS.md`).

## Summary

| Stage | What it is | Monthly | One-off or yearly |
|---|---|---|---|
| A. Build and test on this PC | Now until the app is ready to test | $0 extra | $0 |
| B. Private online beta | A few coaches and test clients, from the phone | $0 to about $45 | domain about $10-15/year |
| C. Public launch in Egypt | Real coaches, real payments | about $65-85 plus usage | domain, lawyer quote, PDPC licence (see below) |
| Per payment (stage C) | Card payment through Paymob | 2.75% + EGP 3 per successful card payment | none |

Stage A costs nothing beyond what Mohamed already pays: his Claude subscription (the autopilot) and his ChatGPT
plan (Codex). The autopilot never buys usage credits or paid overage.

## Stage A: build and test on this PC ($0 extra)

| Item | Cost | Note |
|---|---|---|
| Claude subscription | already paid | The autopilot uses each 5-hour window and waits for the reset; it never buys extra usage |
| ChatGPT plan for Codex | already paid | Codex builds the pure modules and the SQL |
| Local Postgres, Node, Playwright | $0 | Run on this PC |
| GitHub private repo | $0 | Created 8 Nov 2026 |
| Fable 5.1 credits | optional | Only if Mohamed wants Fable for the final review; Opus does it otherwise |

## Stage B: private online beta (about $0 to $45 a month)

| Item | Free option | Paid option | Recommendation |
|---|---|---|---|
| Supabase (database, login, file storage) | Free plan: small database; a free project pauses after a week without traffic | Pro $25/month: 8 GB database, 100K monthly users, $10 compute credit (covers the Micro size) | Free for the first week of testing, Pro as soon as real coaches use it |
| Vercel (hosting) | Hobby: free, but for non-commercial use only | Pro $20/month: one deploying seat and $20 of usage credit | Pro once any coach pays |
| Resend (email) | Free: 3,000 emails/month, 100/day, one domain | Pro $20/month: 50,000 emails | Free is enough for a beta |
| Domain | none | about $10-15/year for a `.com` | Needed for email sending and a clean link |
| **Total** | **$0/month + domain** | **$45/month + domain** | |

## Stage C: public launch in Egypt (about $65-85 a month plus usage)

| Item | Cost | When it grows |
|---|---|---|
| Supabase Pro | $25/month | Small compute $15/month extra when the Micro size is too slow; storage over 8 GB about $0.125/GB; transfer over the quota about $0.09/GB. One estimate for a busier app: about $36/month (Small, 20 GB, 300 GB transfer) |
| Vercel Pro | $20/month | Extra deploying seats $20 each; usage over the $20 credit is pay-as-you-go |
| Resend Pro | $20/month | Only past 3,000 emails/month; then $0.90 per extra 1,000 |
| WhatsApp reminders and login codes (optional) | about $0.004 per utility or login message to Egypt, plus 14% VAT | 2,000 messages a month cost about $8-10. Marketing messages cost about $0.06-0.08 each and are not planned. A WhatsApp provider (BSP) may add its own monthly fee |
| Paymob card payments | 2.75% + EGP 3 per successful card payment; reported with no setup or monthly fee | Paid from each payment, not a bill. Needs a registered business (commercial register and tax card) for the merchant account |
| Domain | about $10-15/year | |
| **Total fixed** | **about $65-85/month + domain** | |

## Legal (Egypt Personal Data Protection Law 151/2020)

The Executive Regulations (Decree 816/2025, issued 1 Nov 2025) give one year to comply, so the deadline was about
1 Nov 2026 and is likely in force now. The app stores health-related data (weight, progress photos, injuries),
which is likely sensitive data. Before the first real client:

| Item | Cost | Note |
|---|---|---|
| Lawyer review of consent texts, privacy notice and hosting choice | quote needed | Must also decide between a cross-border transfer permit (database in Frankfurt) and hosting in Egypt |
| Controller licence from the Personal Data Protection Center | reported exempt from licence fees for 1 to 100,000 records; sources disagree on the cap above that | DAWLYY at launch is far below 100,000 records. Exact fees must come from the official schedule |
| Cross-border transfer permit | reported as 50% of the licence or permit fee | Likely low or zero while exempt; the lawyer confirms |
| Data protection officer | a person, not a fee | Required by the regulations; can be Mohamed or a contractor |

## Only if native apps are added later

The app is a web app that installs to the phone home screen, so these are not needed now.

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Google Play developer account | $25 once |

## Sources (checked 8 Nov 2026)

- Supabase: [supabase.com/pricing](https://supabase.com/pricing.md), [makerkit Supabase pricing](https://makerkit.dev/blog/saas/supabase-pricing), [jetadmin 2026 guide](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)
- Vercel: [Vercel Pro plan docs](https://vercel.com/docs/plans/pro-plan), [temps.sh Pro explained](https://temps.sh/blog/vercel-pricing-2026-pro-plan-explained)
- Resend: [automationatlas Resend pricing 2026](https://automationatlas.io/answers/resend-pricing-explained-2026/), [usecarly Resend pricing](https://www.usecarly.com/blog/resend-pricing/)
- Paymob: [orcaa.cloud Paymob vs Stripe Egypt](https://orcaa.cloud/blog/paymob-vs-stripe-egypt), [Egypt gateways comparison 2026](https://www.kerolosxgad.com/writing/payment-gateways-egypt-comparison)
- WhatsApp: [ChatMaxima Egypt rates](https://chatmaxima.com/whatsapp-api-pricing/egypt/), [Meta pricing docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- Law 151/2020: [ADSERO on the Executive Regulations](https://adsero.me/executive-regulations-issued-for-egypts-personal-data-protection-law-business-impact-and-compliance-considerations/), [Legal500 overview](https://www.legal500.com/developments/thought-leadership/overview-of-the-executive-regulations-of-the-egyptian-personal-data-protection-law/), [dsn group](https://www.dsn-group.com/privacy-notes/egypts-personal-data-protection-law-before-you-process-you-need-a-licence-2860365)
