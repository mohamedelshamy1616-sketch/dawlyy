import { RED_FLAG_LEXICON, type RedFlagCategory } from './lexicon';
import { normalizeWithMap } from './normalize';

export type RedFlagMatch = { category: RedFlagCategory; matched: string; start: number; end: number };

// Finite, explicit morphology: never strip arbitrary letters or accept substrings.
const PREFIXES = ['', 'و', 'ف', 'ب', 'ل', 'ك', 'ال', 'وال', 'بال', 'فال', 'لل',
  'ول', 'فل', 'وب', 'فب', 'وك', 'فك', 'كال', 'وكال', 'فكال', 'وبال', 'فبال', 'ولل', 'فلل'];
const SUFFIXES = ['', 'ي', 'ك', 'ه', 'ها', 'نا', 'هم', 'كم'];
const NEGATIONS = new Set(['مفيش', 'مش', 'بدون', 'no', 'without']);
const LOAD_CONTEXT = new Set(['تدريب', 'تدريبي', 'تدريبيه', 'اوزان', 'وزن',
  'التدريب', 'التدريبي', 'التدريبيه', 'الاوزان', 'الوزن']);
// "المهم" otherwise looks like ألم + هم; its clitic forms have the same collision.
const NON_FLAG_WORDS = new Set(PREFIXES.map((prefix) => `${prefix}المهم`));

function wordMatches(word: string, term: string): boolean {
  if (NON_FLAG_WORDS.has(word)) return false;
  if (word === term) return true;
  if (!/^[\u0621-\u063a\u0641-\u064a]+$/u.test(term)) return false;
  return PREFIXES.some((prefix) => SUFFIXES.some((suffix) => word === prefix + term + suffix));
}

const entries = (Object.entries(RED_FLAG_LEXICON) as [RedFlagCategory, readonly string[]][])
  .map(([category, terms]) => ({ category, terms: terms.map((term) => term.split(' ')) }));

/** Detection/classification only: no diagnosis, advice, I/O or state mutation. */
export function detectRedFlags(text: string): RedFlagMatch[] {
  const { normalized, starts, ends } = normalizeWithMap(text);
  if (!normalized) return [];
  const words = Array.from(normalized.matchAll(/\S+/gu), (match) => ({
    value: match[0], offset: match.index,
  }));
  const candidates: { category: RedFlagCategory; first: number; last: number; excluded: boolean }[] = [];
  for (let i = 0; i < words.length; i++) {
    for (const { category, terms } of entries) {
      for (const term of terms) {
        if (i + term.length > words.length) continue;
        if (!term.every((word, j) => wordMatches(words[i + j]!.value, word))) continue;
        const after = words[i + term.length]?.value;
        const excluded = NEGATIONS.has(words[i - 1]?.value ?? '')
          || (category === 'pain_injury' && term[term.length - 1] === 'pain' && after === 'free')
          || (category === 'pregnancy' && term[term.length - 1] === 'حمل'
            && LOAD_CONTEXT.has(after ?? ''));
        candidates.push({ category, first: i, last: i + term.length - 1, excluded });
      }
    }
  }
  // An excluded phrase also excludes its contained terms ("no muscle pain").
  const exclusions = candidates.filter((candidate) => candidate.excluded);
  const eligible = candidates.filter((candidate) => !candidate.excluded && !exclusions.some((excluded) =>
    excluded.category === candidate.category && excluded.first <= candidate.first && excluded.last >= candidate.last));
  // Prefer the longest phrase at an identical start, for a useful highlight.
  eligible.sort((a, b) => a.first - b.first || b.last - a.last);
  const found = new Set<RedFlagCategory>();
  const result: RedFlagMatch[] = [];
  for (const { category, first, last } of eligible) {
    if (found.has(category)) continue;
    const start = starts[words[first]!.offset]!;
    const lastWord = words[last]!;
    const end = ends[lastWord.offset + lastWord.value.length - 1]!;
    result.push({ category, matched: text.slice(start, end), start, end });
    found.add(category);
  }
  return result;
}
