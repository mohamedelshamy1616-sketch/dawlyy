# Batch E — Arabic/English text normalization and search, CSV exercise import

Modules: `packages/core/src/text/`, `packages/core/src/csv/`. Tests: `packages/core/test/text.test.ts`, `packages/core/test/csv.test.ts`. `csv` imports from `../text`; nothing else may import from outside `../types`, `../text`, `zod`.

Consumers in the next wave: the coach client search (spec §4: name, Client ID, phone/email, package, status, tags), invitation by phone, duplicate-client detection, and the exercise library CSV import screen (spec §11: column mapping, preview, duplicate detection, URL validation, row-level errors, safe retry).

## E1 — text (`src/text/index.ts`)

Egyptian coaches and clients type names in Arabic with or without hamza, with ة or ه, with ى or ي, with tatweel, with Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) or Eastern Persian digits (۰۱۲۳۴۵۶۷۸۹), and in Franco/English. Search must match all of these.

```ts
/** Arabic folding: strip tatweel (U+0640) and harakat/diacritics (U+064B–U+065F, U+0670, U+06D6–U+06ED); أ إ آ ٱ → ا; ى → ي; ة → ه; ؤ → و; ئ → ي; ء stays; Arabic-Indic and Persian digits → 0-9. Non-Arabic text passes through. */
export function foldArabic(s: string): string;

/** Search key: NFKC, foldArabic, lowercase (locale-independent), punctuation and symbols (Unicode P* and S*) → space, whitespace collapsed, trimmed. */
export function searchKey(s: string): string;

/** Tokens of searchKey(s), empty tokens removed. */
export function tokens(s: string): string[];

/** True when every query token is a prefix of some token in some field, or a substring of a field for tokens of length ≥ 3. Empty or whitespace query → true. null/undefined fields are skipped. */
export function matchesQuery(fields: ReadonlyArray<string | null | undefined>, query: string): boolean;

/** Score for ranking search results (higher is better): exact field match 100, field starts with the whole query 60, every token a word prefix 40, substring only 20, no match 0. Ties broken by the caller. */
export function matchScore(fields: ReadonlyArray<string | null | undefined>, query: string): number;

/** Equality on searchKey for duplicate detection; LocalizedText compares ar with ar and en with en, and also cross-compares when one side has only one language. */
export function sameName(a: string | { ar?: string; en?: string }, b: string | { ar?: string; en?: string }): boolean;

/** Digits only (after folding Arabic-Indic digits). */
export function digitsOnly(s: string): string;

/**
 * Phone normalization to E.164. Egyptian mobiles in any common form — 01012345678, 1012345678, +201012345678,
 * 00201012345678, 0020 10 1234 5678, ٠١٠١٢٣٤٥٦٧٨ — become '+201012345678' (prefixes 010, 011, 012, 015, then 8 digits).
 * Any other input starting with + or 00 followed by 8–15 digits becomes '+<digits>'. Everything else → null.
 * `defaultCountry` 'EG' (only value supported now) decides how a national number without a prefix is read.
 */
export function normalizePhone(s: string, opts?: { defaultCountry?: 'EG' }): string | null;

/** Lowercased trimmed email if it looks like local@domain.tld (no spaces, one @, a dot in the domain), else null. */
export function normalizeEmail(s: string): string | null;

/** True when the query looks like a client code such as DW-000123, dw000123, DW 123 (letters then digits); returns the canonical form '<PREFIX>-<digits padded to 6>' or null. */
export function parseClientCode(query: string): string | null;

/** URL-safe slug from English text: lowercase ascii letters, digits and single hyphens; Arabic-only input → '' (caller falls back). */
export function slugify(s: string): string;
```

Acceptance tests: foldArabic folds 'أحمد' and 'احمد' to the same string, 'مروة'/'مروه', 'مصطفى'/'مصطفي', 'إسلام'/'اسلام', tatweel 'محـــمد', harakat 'مُحَمَّد', digits '٠١٠٢٣' → '01023'; searchKey('  Ahmed   ALI! ') = 'ahmed ali'; matchesQuery(['أحمد علي', 'DW-000123'], 'احمد') true, (['Mohamed Salah'], 'moh sal') true, (['Mohamed'], 'ham') true (substring ≥ 3), (['Mohamed'], 'ha') false; matchScore ordering exact > starts-with > word prefixes > substring; sameName({ar:'محمد'}, 'مُحَمَّد') true; normalizePhone for every Egyptian form listed plus a Saudi '+966501234567' and '00966501234567', invalid '0101234' → null, landline '0223456789' → null; normalizeEmail; parseClientCode('dw 123') = 'DW-000123', ('DW-000123') same, ('ahmed') null; slugify('Barbell Back Squat (High Bar)') = 'barbell-back-squat-high-bar', slugify('سكوات') = ''.

## E2 — csv (`src/csv/index.ts`)

```ts
export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: ',' | ';' | '\t' };

/**
 * RFC 4180 parser: quoted fields, "" escapes, embedded newlines inside quotes, CRLF or LF, a UTF-8 BOM stripped,
 * delimiter auto-detected from the first line among , ; tab (most frequent outside quotes; ties → ','), or forced by opts.
 * Header cells trimmed; data cells kept as-is except a trailing \r. Fully empty lines are skipped.
 * Rows shorter than the header are padded with ''; longer rows keep their extra cells (the mapper reports them).
 * Throws CsvError 'empty' when there is no header line, 'unterminated_quote' with the 1-based line number in `line`.
 */
export function parseCsv(text: string, opts?: { delimiter?: ',' | ';' | '\t' }): ParsedCsv;

export const EXERCISE_IMPORT_FIELDS = [
  'name_en', 'name_ar', 'aliases', 'category', 'primary_muscles', 'secondary_muscles', 'movement_pattern',
  'equipment', 'difficulty', 'unilateral', 'compound', 'plane', 'cues_en', 'cues_ar', 'mistakes_en', 'mistakes_ar',
  'video_url', 'tags',
] as const;
export type ExerciseImportField = (typeof EXERCISE_IMPORT_FIELDS)[number];
/** field → 0-based column index. */
export type ColumnMapping = Partial<Record<ExerciseImportField, number>>;

/** Header synonyms, compared with searchKey: English ("name", "exercise", "exercise name", "name (en)", "video", "youtube", "link", "muscles", "primary muscle", "category", "body part", "level", "difficulty", "equipment", "tags", "aliases", "also known as", "cues", "tips", "mistakes", …) and Arabic ("الاسم", "اسم التمرين", "الاسم بالعربي", "الاسم عربي", "التمرين", "الفيديو", "رابط الفيديو", "العضلات", "العضلة الأساسية", "العضلات المساعدة", "القسم", "الفئة", "المستوى", "الأدوات", "الأجهزة", "النصائح", "الأخطاء", "أسماء أخرى", …). A header with Arabic letters and a generic "name" meaning maps to name_ar; English generic "name" maps to name_en. Each column maps to at most one field and each field to at most one column (first best match wins). */
export function suggestMapping(headers: string[]): ColumnMapping;

export type ImportIssue = {
  field?: ExerciseImportField;
  code: 'required' | 'invalid_enum' | 'invalid_url' | 'invalid_boolean' | 'duplicate_in_file' | 'duplicate_existing' | 'too_long' | 'extra_cells' | 'unknown_category';
  message: LocalizedText;
  value?: string;
};
export type ImportRowResult =
  | { rowNumber: number; ok: true; exercise: ExerciseSeed; warnings: ImportIssue[] }
  | { rowNumber: number; ok: false; errors: ImportIssue[]; warnings: ImportIssue[] };

export type ExistingExercise = { slug?: string; name: { ar?: string; en?: string }; aliases?: string[] };

/**
 * Map parsed rows to ExerciseSeed (validated with ExerciseSeed.parse from ../types; a Zod failure becomes row errors, never a throw).
 * rowNumber is the 1-based data row number (header is row 0) so the UI can say "row 7".
 * Rules:
 *  - name: at least one of name_en / name_ar → else 'required'. Each text field ≤ 200 chars → 'too_long'.
 *  - list fields (aliases, muscles, equipment, cues, mistakes, tags) split on | ; ، ؛ and newlines, trimmed, empties dropped. cues_en[i] and cues_ar[i] pair into LocalizedText by position; unpaired entries keep one language.
 *  - booleans: true/false/yes/no/y/n/1/0/نعم/لا/اه/أيوه → else 'invalid_boolean'; empty → schema default.
 *  - difficulty: beginner/intermediate/advanced plus مبتدئ/متوسط/متقدم/محترف(advanced) and easy/medium/hard → else 'invalid_enum'.
 *  - movement_pattern: the MOVEMENT_PATTERNS values, spaces or dashes allowed ("push horizontal"), plus common words (squat, deadlift→hinge, hip hinge→hinge, row→pull_horizontal, pull up/chin up/pulldown→pull_vertical, bench/press horizontal→push_horizontal, overhead press→push_vertical, lunge, carry, rotation, plank→anti_rotation, curl/extension/raise→isolation); empty → 'other'.
 *  - plane: sagittal/frontal/transverse/multi and Arabic سهمي/جبهي/أفقي/متعدد; empty → schema default.
 *  - category: empty → opts.defaultCategory, else 'required'; when opts.categories is given and the value is not one of them (compared with searchKey) → warning 'unknown_category' (the row stays valid; the coach can add the category).
 *  - video_url: must be http(s) with a host; YouTube forms (youtu.be/ID, youtube.com/watch?v=ID, /shorts/ID, /embed/ID) normalized to https://www.youtube.com/watch?v=ID; anything else that fails → 'invalid_url' (row invalid).
 *  - slug: slugify(name_en) else slugify of the first English alias else `row-<rowNumber>`; made unique inside the file by appending -2, -3.
 *  - duplicates: a row whose name (either language) or any alias is sameName with an earlier valid row → error 'duplicate_in_file'; with opts.existing (name or aliases, or equal slug) → error 'duplicate_existing' unless opts.onExisting === 'update', in which case it is a warning and the row stays valid with `exercise.slug` set to the existing slug.
 *  - extra cells beyond the header → warning 'extra_cells'.
 */
export function mapExerciseRows(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  opts?: { existing?: ExistingExercise[]; defaultCategory?: string; categories?: string[]; onExisting?: 'error' | 'update' },
): { results: ImportRowResult[]; summary: { total: number; valid: number; invalid: number; duplicates: number; warnings: number } };

/** The fields a mapping still lacks for a usable import: ['name_en|name_ar'] when neither name column is mapped, plus 'category' when it is unmapped and no default category is given. */
export function missingRequiredMappings(mapping: ColumnMapping, opts?: { defaultCategory?: string }): string[];

/** Serialize rows back to CSV (for "download errors" and templates): quotes fields containing the delimiter, quotes or newlines; CRLF line endings; optional BOM for Excel (default true). */
export function toCsv(headers: string[], rows: string[][], opts?: { delimiter?: ',' | ';' | '\t'; bom?: boolean }): string;

/** A template CSV with every EXERCISE_IMPORT_FIELDS header and one filled example row in Arabic and English. */
export function exerciseImportTemplate(): string;

export class CsvError extends Error { readonly code: 'empty' | 'unterminated_quote'; readonly line?: number }
```

All `message` texts are LocalizedText in Egyptian Arabic and English that tell the coach what to fix ("الرابط ده مش رابط فيديو صالح. حط رابط يوتيوب أو رابط يبدأ بـ https", "This link is not a valid video URL. Use a YouTube link or one that starts with https").

Acceptance tests: parseCsv with quoted commas, escaped quotes, embedded newline, CRLF, BOM, semicolon auto-detect, tab forced, unterminated quote error with line; suggestMapping on an English header row and on an Arabic header row ("اسم التمرين، الاسم بالإنجليزي، العضلات، الفيديو، المستوى"); a 6-row file mixing a valid row, a missing-name row, a bad URL row, a YouTube short link normalized, an in-file duplicate (Arabic name with hamza vs without), and an existing duplicate; onExisting 'update' turns the existing duplicate into a valid row with the existing slug; summary counts; toCsv round-trips through parseCsv; exerciseImportTemplate parses and maps to a valid row.
