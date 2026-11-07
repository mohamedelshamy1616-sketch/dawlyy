/**
 * Arabic variants share a search form while standalone hamza remains meaningful.
 * Invisible format characters (Unicode Cf: bidi marks and isolates, zero-width joiners, BOM, soft hyphen) are
 * removed too: names, phones and emails copied from WhatsApp or any RTL screen carry them, and an invisible
 * U+200F inside a search key or a phone number silently breaks every comparison.
 */
export function foldArabic(s: string): string {
  return s
    .replace(/\p{Cf}/gu, '')
    .replace(/[\u0640\u064b-\u065f\u0670\u06d6-\u06ed]/gu, '')
    .replace(/[أإآٱ]/gu, 'ا')
    .replace(/[ىئ]/gu, 'ي')
    .replace(/ة/gu, 'ه')
    .replace(/ؤ/gu, 'و')
    .replace(/[٠-٩۰-۹]/gu, (digit) => {
      const point = digit.charCodeAt(0);
      return String(point - (point >= 0x06f0 ? 0x06f0 : 0x0660));
    });
}

export function searchKey(s: string): string {
  return foldArabic(s.normalize('NFKC')).toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function tokens(s: string): string[] {
  return searchKey(s).split(' ').filter(Boolean);
}

type SearchFields = ReadonlyArray<string | null | undefined>;

function normalizedFields(fields: SearchFields): string[] {
  return fields.filter((field): field is string => field != null).map(searchKey).filter(Boolean);
}

function prefixMatch(fields: string[], queryTokens: string[]): boolean {
  const words = fields.flatMap((field) => field.split(' '));
  return queryTokens.every((token) => words.some((word) => word.startsWith(token)));
}

function tokenMatch(fields: string[], queryTokens: string[]): boolean {
  return queryTokens.every((token) => fields.some((field) =>
    field.split(' ').some((word) => word.startsWith(token))
    || (Array.from(token).length >= 3 && field.includes(token))));
}

export function matchesQuery(fields: SearchFields, query: string): boolean {
  return tokenMatch(normalizedFields(fields), tokens(query));
}

/** An empty search admits all rows but gives none a ranking advantage. */
export function matchScore(fields: SearchFields, query: string): number {
  const key = searchKey(query);
  if (!key) return 0;
  const normalized = normalizedFields(fields);
  if (normalized.some((field) => field === key)) return 100;
  if (normalized.some((field) => field.startsWith(key))) return 60;
  const queryTokens = key.split(' ');
  if (prefixMatch(normalized, queryTokens)) return 40;
  return tokenMatch(normalized, queryTokens) ? 20 : 0;
}

type Name = string | { ar?: string; en?: string };

export function sameName(a: Name, b: Name): boolean {
  const left: { ar?: string; en?: string } = typeof a === 'string' ? { en: searchKey(a) } : {
    ar: searchKey(a.ar ?? ''), en: searchKey(a.en ?? ''),
  };
  const right: { ar?: string; en?: string } = typeof b === 'string' ? { en: searchKey(b) } : {
    ar: searchKey(b.ar ?? ''), en: searchKey(b.en ?? ''),
  };
  const leftValues = [left.ar, left.en].filter((value): value is string => !!value);
  const rightValues = [right.ar, right.en].filter((value): value is string => !!value);
  if (leftValues.length <= 1 || rightValues.length <= 1) {
    return leftValues.some((value) => rightValues.includes(value));
  }
  return (!!left.ar && left.ar === right.ar) || (!!left.en && left.en === right.en);
}

export function digitsOnly(s: string): string {
  return foldArabic(s).replace(/[^0-9]/gu, '');
}

export function normalizePhone(s: string, opts?: { defaultCountry?: 'EG' }): string | null {
  // Ignore the formatting people type or paste (spaces, brackets, dots, dashes, invisible bidi marks), but do not
  // turn arbitrary text into an identity: after that only digits and one leading plus may remain.
  const compact = foldArabic(s).replace(/[\s().-]/gu, '');
  if (!/^\+?[0-9]+$/u.test(compact)) return null;
  const international = compact.startsWith('+') || compact.startsWith('00');
  const digits = compact.startsWith('+') ? compact.slice(1)
    : compact.startsWith('00') ? compact.slice(2) : compact;
  if (international) {
    if (digits.startsWith('20')) {
      // Country code 20 is Egypt only, so validate the national number. "+20 010 …" keeps the trunk zero by
      // mistake and E.164 drops it; a landline (+20 2 …, +20 3 …) is accepted; anything else is not a real number.
      const mobile = /^200?(1[0125][0-9]{8})$/u.exec(digits);
      if (mobile) return `+20${mobile[1]}`;
      return /^20[2-9][0-9]{7,8}$/u.test(digits) ? `+${digits}` : null;
    }
    return /^[0-9]{8,15}$/u.test(digits) ? `+${digits}` : null;
  }
  if ((opts?.defaultCountry ?? 'EG') !== 'EG') return null;
  // National forms 01012345678 and 1012345678, plus 201012345678 as wa.me links and some exports write it.
  // No Egyptian national number is 12 digits starting with 20, so the last form is unambiguous.
  const national = /^(?:20|0)?(1[0125][0-9]{8})$/u.exec(digits);
  return national ? `+20${national[1]}` : null;
}

export function normalizeEmail(s: string): string | null {
  const value = s.replace(/\p{Cf}/gu, '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(value) ? value : null;
}

export function parseClientCode(query: string): string | null {
  const match = /^([a-z]+)\s*-?\s*([0-9]+)$/iu.exec(foldArabic(query.normalize('NFKC')).trim());
  const prefix = match?.[1];
  const digits = match?.[2];
  return prefix && digits ? `${prefix.toUpperCase()}-${digits.padStart(6, '0')}` : null;
}

export function slugify(s: string): string {
  return foldArabic(s.normalize('NFKD')).toLowerCase()
    .replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '');
}
