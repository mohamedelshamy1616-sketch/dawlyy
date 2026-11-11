# Competitor notes: ElCoach (public information only)

Source: the public Google Play listing (com.elcoach.me, read 12 Nov 2026) and elcoach.me. Nothing here comes from
decompiling or copying the app. Do not reverse-engineer, copy code, copy copy-text or copy visual design from any
competitor. Use this file only to check that DAWLYY is better where it matters.

## What ElCoach is

A consumer fitness app with self-serve workout and meal plans (home, gym, calisthenics), calorie-based nutrition,
2 to 5 meals a day, intermittent fasting, a weekly shopping list, a supplement schedule, 30-day challenges, step
tracking, offline workouts, 24/7 expert chat, a free plan and a paid "Plus" tier. 4.1 stars, 13.5K reviews, 1M+ downloads. Latest update (9 Nov 2026) adds friend challenges, weekly challenges, a journey progress view and a bigger workout library.

## What its users complain about (public reviews)

1. The app hangs on "loading forever" and a paying yearly member could not open it for months.
2. The training calendar gets the day wrong ("thinks I trained today's session yesterday").
3. Exercise alternatives that make no sense for the goal.
4. No decent demo before paying for a year.
5. The meal plan repeated the same breakfast, lunch, dinner and snack for days (a 2022 review).
6. Almost everything except the basic plans is behind the subscription.
7. Wished for: the workout continuing automatically to the next exercise with an alert, and music.

## Where DAWLYY must be clearly better (check in P6 and P7)

| Their weakness | DAWLYY check |
|---|---|
| Endless loading | Every client screen shows content or a clear empty or error state fast; no spinner without a timeout and a retry. Test on the 390 px screens. |
| Wrong day in the calendar | Schedule, freeze, extend and recalculate are exact. Keep beta-gate test 09 green in `ar` and `en`; add a timezone case near midnight. |
| Nonsense exercise swaps | Swaps come from the coach's own library, never auto-generated. |
| Same meals every day | The nutrition plan shows variety and the coach can swap a food; check the two-food plan flow stays editable. |
| Paid before trying | The demo coach with 3 clients (`pnpm` seed) is the try-before-you-buy path. Keep it working. |

## Different product, different game

ElCoach sells plans to consumers. DAWLYY is the operating system for the coach: clients, packages, payments,
check-ins, programs and nutrition. Do not chase their consumer features (step tracker, challenges, shopping list)
before launch. Revisit them after launch, one at a time, as our own design.
