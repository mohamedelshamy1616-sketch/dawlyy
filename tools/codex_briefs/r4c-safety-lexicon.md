# Batch R4c: `packages/core/src/safety/`, the red-flag lexicon

Contract: `docs/plans/2026-11-13-reinvent-build-plan.md`, wave R4, item R4c (the lexicon part only; the server
integration is a later task). Read it. The point: when a client writes about pain, injury, disordered eating,
pregnancy or medication, the coach must see it first. The guard never generates advice; it only detects and
classifies.

## Files you may write

- Anything inside `packages/core/src/safety/` (an `index.ts` barrel, `normalize.ts`, `lexicon.ts`, `detect.ts`).
- `packages/core/test/safety.test.ts`.

Nothing else. Claude adds the `./safety` export to `packages/core/package.json` and `src/index.ts` itself. Read
`packages/core/src/text/index.ts` first: it already has Arabic folding. Reuse it by import where it fits, but do
not edit it.

## What to build

```ts
export type RedFlagCategory = 'pain_injury' | 'eating_disorder' | 'pregnancy' | 'medication';
export type RedFlagMatch = { category: RedFlagCategory; matched: string; start: number; end: number };
export function normalizeForMatch(text: string): string;
export function detectRedFlags(text: string): RedFlagMatch[];
```

- `normalizeForMatch`: lowercase Latin; strip Arabic diacritics (tashkeel, U+064B to U+065F, U+0670) and tatweel
  (U+0640); fold alef forms (أ إ آ ٱ to ا), alef maqsura to ya (ى to ي), ta marbuta to ha (ة to ه), hamza on
  waw/ya (ؤ to و, ئ to ي); Arabic-Indic and Persian digits to Western; collapse whitespace and punctuation to
  single spaces; collapse a letter repeated 3 or more times to one ("الللم" to "الم", "ouchhhh" to "ouch").
- `matched` in the result is the original substring of the input (so the coach sees what the client wrote), with
  `start` and `end` as offsets into the ORIGINAL text. Keep an index map from normalized to original positions.
- Matching is on whole words or whole phrases of the normalized text, never inside another word. Arabic clitics
  must still match: allow the prefixes و ف ب ل ك ال and combinations (وال، بال، فال، لل) before a term, and the
  attached pronoun suffixes ي ك ه ها نا هم كم before or after where Arabic attaches them (for example "ركبتي",
  "ضهري", "بطني"). Implement this as explicit prefix and suffix lists, not as a fuzzy match.
- Return one match per category at most (the first in text order), sorted by `start`. Empty text returns `[]`.

## The lexicon (`lexicon.ts`)

One exported constant `RED_FLAG_LEXICON: Record<RedFlagCategory, readonly string[]>` of terms already in
normalized form. Cover Egyptian and Gulf spellings, common misspellings, Franco-Arabic (Latin-letter Arabic as
Egyptians type it, for example "wag3", "betwga3ny", "7amel"), and English. At least 25 terms per category. Examples
of what each category means:

- `pain_injury`: pain, ache, hurts, injury, sprain, torn, swelling, numbness, "can't move", plus body parts with pain
  words ("ركبتي بتوجعني", "ضهري واجعني", "ظهري يعورني" in Gulf, "شد عضلي", "التواء", "غضروف", "انزلاق").
- `eating_disorder`: vomiting after eating, making myself throw up, binge, purge, laxatives for weight, not eating
  for days, starving myself, "I hate my body", fear of eating ("برجّع بعد الأكل", "مش باكل خالص", "ملينات").
- `pregnancy`: pregnant, pregnancy, expecting, missed period, breastfeeding ("حامل", "حمل", "الحمل", "بارضع",
  "رضاعة", "الدورة اتأخرت").
- `medication`: medication, pills, insulin, steroids, thyroid medicine, antidepressants, blood pressure medicine,
  "بآخد دوا", "حبوب", "أنسولين", "كورتيزون", "منشطات", "علاج الغدة".

False-positive guards: the guard must not fire on a term inside another word ("ألم" inside "العالم", "المهم",
"معلم", "تألمت"? decide and test), or on sports words that look like pain words but are not ("muscle pain" is a
match; "pain-free" and "no pain" are NOT: handle a short list of negations right before the term: "مفيش", "مش",
"بدون", "no", "without", "free" right after for English "pain free"). Keep negation handling simple and tested.
Training words such as "حمل" in the sense of "load" ("حمل تدريبي", "الحمل التدريبي", "حمل الأوزان") are a known
ambiguity of `pregnancy`: exclude the phrases with "تدريب", "اوزان", "وزن" right after, and test them.

## Tests (`packages/core/test/safety.test.ts`)

At least 80 sentences in a table: `[text, expectedCategories[]]`. At least 15 per category that must match, in
Egyptian Arabic, Gulf Arabic, Franco-Arabic and English, with and without diacritics, with tatweel, with repeated
letters, with clitics; and at least 20 that must NOT match (false-positive guards, negations, training-load "حمل",
everyday sentences a client writes in a check-in). Plus unit tests for `normalizeForMatch` (each folding rule) and
for `start`/`end` mapping back to the original text with diacritics present.

## Answer

Files written; every export with its signature; the term count per category; every ambiguity you resolved and how.
