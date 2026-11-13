import { foldArabic } from '../text/index';

/** Internal mapping uses UTF-16 offsets, like String.slice and the public match API. */
export function normalizeWithMap(text: string): {
  normalized: string; starts: number[]; ends: number[];
} {
  const units: { char: string; start: number; end: number }[] = [];
  let offset = 0;
  for (const original of text) {
    const start = offset;
    offset += original.length;
    const folded = foldArabic(original).toLowerCase();
    if (!folded) {
      // Include trailing tashkeel/tatweel in the original word's highlight.
      const previous = units[units.length - 1];
      if (previous) previous.end = offset;
      continue;
    }
    for (const char of folded) {
      const value = /[\p{L}\p{N}]/u.test(char) ? char : ' ';
      const previous = units[units.length - 1];
      if (value === ' ' && previous?.char === ' ') previous.end = offset;
      else units.push({ char: value, start, end: offset });
    }
  }

  const collapsed: typeof units = [];
  for (let i = 0; i < units.length;) {
    const first = units[i]!;
    let end = i + 1;
    while (end < units.length && units[end]!.char === first.char) end++;
    if (/\p{L}/u.test(first.char) && end - i >= 3) {
      collapsed.push({ ...first, end: units[end - 1]!.end });
    } else {
      for (let j = i; j < end; j++) collapsed.push(units[j]!);
    }
    i = end;
  }
  if (collapsed[0]?.char === ' ') collapsed.shift();
  if (collapsed[collapsed.length - 1]?.char === ' ') collapsed.pop();
  const starts: number[] = [];
  const ends: number[] = [];
  for (const unit of collapsed) {
    // Both halves of astral letters point to the same original codepoint.
    for (let i = 0; i < unit.char.length; i++) {
      starts.push(unit.start);
      ends.push(unit.end);
    }
  }
  return { normalized: collapsed.map((unit) => unit.char).join(''), starts, ends };
}

export function normalizeForMatch(text: string): string {
  return normalizeWithMap(text).normalized;
}
