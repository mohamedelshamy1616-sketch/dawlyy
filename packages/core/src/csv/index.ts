import { ExerciseSeed, MOVEMENT_PATTERNS, DIFFICULTIES, PLANES } from '../types';
import type { LocalizedText } from '../types';
import { searchKey, sameName, slugify } from '../text';

export type ParsedCsv = { headers: string[]; rows: string[][]; delimiter: ',' | ';' | '\t' };
type Delimiter = ParsedCsv['delimiter'];

export class CsvError extends Error {
  readonly code: 'empty' | 'unterminated_quote';
  readonly line?: number;

  constructor(code: 'empty' | 'unterminated_quote', line?: number) {
    super(code === 'empty' ? 'CSV has no header line.' : `Unterminated quoted field on line ${line ?? 1}.`);
    this.name = 'CsvError';
    this.code = code;
    this.line = line;
  }
}

function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  let nonBlank = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (char === '"') {
      nonBlank = true;
      if (quoted && text.charAt(i + 1) === '"') i += 1;
      else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (nonBlank) break;
    } else if (!quoted && (char === ',' || char === ';' || char === '\t')) {
      counts[char] += 1;
      nonBlank = true;
    } else if (char.trim()) nonBlank = true;
  }
  const maximum = Math.max(counts[','], counts[';'], counts['\t']);
  const winners = ([',', ';', '\t'] as const).filter((delimiter) => counts[delimiter] === maximum);
  return winners.length === 1 ? winners[0] ?? ',' : ',';
}

/** Spec §11: keep raw data for preview while only headers are trimmed. */
export function parseCsv(text: string, opts?: { delimiter?: Delimiter }): ParsedCsv {
  const source = text.replace(/^\ufeff/u, '');
  const delimiter = opts?.delimiter ?? detectDelimiter(source);
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let nonBlank = false;
  let line = 1;
  let quoteLine = 1;

  const finishRecord = () => {
    if (nonBlank) records.push([...row, cell]);
    row = [];
    cell = '';
    nonBlank = false;
  };

  for (let i = 0; i < source.length; i += 1) {
    const char = source.charAt(i);
    if (quoted) {
      if (char === '"') {
        if (source.charAt(i + 1) === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else {
        cell += char;
        if (char === '\n' || (char === '\r' && source.charAt(i + 1) !== '\n')) line += 1;
      }
    } else if (char === '"' && cell === '') {
      quoted = true;
      quoteLine = line;
      nonBlank = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
      nonBlank = true;
    } else if (char === '\r' || char === '\n') {
      finishRecord();
      if (char === '\r' && source.charAt(i + 1) === '\n') i += 1;
      line += 1;
    } else {
      cell += char;
      if (char.trim()) nonBlank = true;
    }
  }
  if (quoted) throw new CsvError('unterminated_quote', quoteLine);
  finishRecord();
  const header = records.shift();
  if (!header) throw new CsvError('empty');
  const headers = header.map((value) => value.trim());
  return {
    headers, delimiter,
    rows: records.map((values) => [...values, ...Array<string>(Math.max(0, headers.length - values.length)).fill('')]),
  };
}

export const EXERCISE_IMPORT_FIELDS = [
  'name_en', 'name_ar', 'aliases', 'category', 'primary_muscles', 'secondary_muscles', 'movement_pattern',
  'equipment', 'difficulty', 'unilateral', 'compound', 'plane', 'cues_en', 'cues_ar', 'mistakes_en', 'mistakes_ar',
  'video_url', 'tags',
] as const;
export type ExerciseImportField = (typeof EXERCISE_IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ExerciseImportField, number>>;

const HEADER_SYNONYMS: Record<ExerciseImportField, readonly string[]> = {
  name_en: ['name', 'exercise', 'exercise name', 'name (en)', 'english name', 'name english',
    'exercise name en', 'الاسم بالإنجليزي', 'الاسم بالانجليزي', 'الاسم انجليزي', 'اسم التمرين بالإنجليزي', 'الاسم بالإنجليزية'],
  name_ar: ['name (ar)', 'arabic name', 'name arabic', 'exercise name ar',
    'الاسم', 'اسم التمرين', 'الاسم بالعربي', 'الاسم عربي', 'التمرين', 'الاسم بالعربية', 'اسم التمرين بالعربي'],
  aliases: ['alias', 'also known as', 'alternative names', 'أسماء أخرى', 'اسماء بديلة', 'أسماء بديلة'],
  category: ['body part', 'group', 'القسم', 'الفئة', 'التصنيف', 'جزء الجسم'],
  primary_muscles: ['muscles', 'muscle', 'primary muscle', 'primary muscle groups',
    'العضلات', 'العضلة الأساسية', 'العضلات الأساسية', 'العضلة المستهدفة', 'العضلات المستهدفة'],
  secondary_muscles: ['secondary muscle', 'secondary muscle groups', 'العضلات المساعدة', 'العضلات الثانوية'],
  movement_pattern: ['movement', 'pattern', 'نمط الحركة', 'الحركة', 'نوع الحركة'],
  equipment: ['tools', 'الأدوات', 'الأجهزة', 'المعدات'],
  difficulty: ['level', 'المستوى', 'الصعوبة', 'مستوى الصعوبة'],
  unilateral: ['single side', 'single sided', 'أحادي', 'احادي الجانب', 'طرف واحد'],
  compound: ['compound exercise', 'مركب', 'تمرين مركب'],
  plane: ['movement plane', 'المستوى الحركي', 'مستوى الحركة'],
  cues_en: ['cues', 'cue', 'tips', 'instructions', 'english cues', 'tips en', 'النصائح بالإنجليزي'],
  cues_ar: ['arabic cues', 'tips ar', 'النصائح', 'التعليمات', 'نصائح الأداء', 'النصائح بالعربي'],
  mistakes_en: ['mistakes', 'common mistakes', 'english mistakes', 'common mistakes en', 'الأخطاء بالإنجليزي'],
  mistakes_ar: ['arabic mistakes', 'common mistakes ar', 'الأخطاء', 'الأخطاء الشائعة', 'الأخطاء بالعربي'],
  video_url: ['video', 'youtube', 'link', 'video link', 'url', 'الفيديو', 'رابط الفيديو', 'رابط', 'يوتيوب'],
  tags: ['tag', 'labels', 'الوسوم', 'التاجات', 'الكلمات المفتاحية'],
};

export function suggestMapping(headers: string[]): ColumnMapping {
  const synonyms = new Map<string, ExerciseImportField>();
  for (const field of EXERCISE_IMPORT_FIELDS) {
    for (const synonym of [field, ...HEADER_SYNONYMS[field]]) {
      const key = searchKey(synonym);
      if (!synonyms.has(key)) synonyms.set(key, field);
    }
  }
  const mapping: ColumnMapping = {};
  headers.forEach((header, index) => {
    const field = synonyms.get(searchKey(header));
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return mapping;
}

export type ImportIssue = {
  field?: ExerciseImportField;
  code: 'required' | 'invalid_enum' | 'invalid_url' | 'invalid_boolean' | 'duplicate_in_file'
    | 'duplicate_existing' | 'too_long' | 'extra_cells' | 'unknown_category';
  message: LocalizedText;
  value?: string;
};
export type ImportRowResult =
  | { rowNumber: number; ok: true; exercise: ExerciseSeed; warnings: ImportIssue[] }
  | { rowNumber: number; ok: false; errors: ImportIssue[]; warnings: ImportIssue[] };
export type ExistingExercise = { slug?: string; name: { ar?: string; en?: string }; aliases?: string[] };

const MESSAGES: Record<ImportIssue['code'], { ar: string; en: string }> = {
  required: {
    ar: 'الخانة دي ناقصة. كمّلها قبل ما تستورد التمرين.',
    en: 'This field is required. Fill it in before importing the exercise.',
  },
  invalid_enum: {
    ar: 'القيمة دي مش من الاختيارات المتاحة. اختار قيمة صحيحة للخانة دي.',
    en: 'This value is not supported. Choose an allowed value for this field.',
  },
  invalid_url: {
    ar: 'الرابط ده مش رابط فيديو صالح. حط رابط يوتيوب أو رابط يبدأ بـ https أو http.',
    en: 'This link is not a valid video URL. Use a YouTube link or one that starts with https or http.',
  },
  invalid_boolean: {
    ar: 'اكتب نعم أو لا، أو true و false، أو 1 و 0 في الخانة دي.',
    en: 'Use yes/no, true/false, or 1/0 for this field.',
  },
  duplicate_in_file: {
    ar: 'التمرين ده متكرر في صف قبله في نفس الملف. شيل التكرار أو عدّل الاسم.',
    en: 'This exercise duplicates an earlier valid row in this file. Remove it or change the name.',
  },
  duplicate_existing: {
    ar: 'التمرين ده موجود في المكتبة عندك. اختار تحديث الموجود أو شيل الصف من الاستيراد.',
    en: 'This exercise is already in your library. Choose update existing or remove this row.',
  },
  too_long: {
    ar: 'النص ده طويل. قصّره لـ 200 حرف بحد أقصى.',
    en: 'This text is too long. Shorten it to 200 characters or fewer.',
  },
  extra_cells: {
    ar: 'الصف ده فيه خانات زيادة عن عناوين الأعمدة. راجع الفواصل؛ الخانات الزيادة هتتجاهل.',
    en: 'This row has more cells than the header. Check the separators; extra cells will be ignored.',
  },
  unknown_category: {
    ar: 'القسم ده لسه مش عندك. تقدر تضيفه للمكتبة أو تختار قسم موجود.',
    en: 'This category is new. Add it to your library or choose an existing category.',
  },
};

function issue(code: ImportIssue['code'], field?: ExerciseImportField, value?: string): ImportIssue {
  return { code, message: { ...MESSAGES[code] }, ...(field ? { field } : {}), ...(value === undefined ? {} : { value }) };
}

/**
 * Short lists (aliases, muscles, equipment, tags) also split on commas: "Chest, Triceps" is two muscles.
 * Sentence lists (cues, mistakes) do not, because one cue may contain a comma in either language.
 */
const SHORT_LIST_SEPARATORS = /[|;,،؛\r\n]+/u;
const SENTENCE_LIST_SEPARATORS = /[|;؛\r\n]+/u;
const SENTENCE_FIELDS = new Set<ExerciseImportField>(['cues_en', 'cues_ar', 'mistakes_en', 'mistakes_ar']);

function splitList(value: string, field: ExerciseImportField): string[] {
  return value.split(SENTENCE_FIELDS.has(field) ? SENTENCE_LIST_SEPARATORS : SHORT_LIST_SEPARATORS)
    .map((part) => part.trim()).filter(Boolean);
}

function pairText(english: string[], arabic: string[]): LocalizedText[] {
  return Array.from({ length: Math.max(english.length, arabic.length) }, (_, index) => {
    const en = english[index];
    const ar = arabic[index];
    return { ...(en ? { en } : {}), ...(ar ? { ar } : {}) };
  });
}

function enumLookup<T extends string>(values: readonly T[], synonyms: Record<string, T>): Map<string, T> {
  return new Map([
    ...values.map((value): [string, T] => [searchKey(value), value]),
    ...Object.entries(synonyms).map(([key, value]): [string, T] => [searchKey(key), value]),
  ]);
}

type Difficulty = (typeof DIFFICULTIES)[number];

const DIFFICULTY_LOOKUP = enumLookup(DIFFICULTIES, {
  'مبتدئ': 'beginner', easy: 'beginner', 'سهل': 'beginner', 'متوسط': 'intermediate', medium: 'intermediate',
  'متقدم': 'advanced', 'محترف': 'advanced', hard: 'advanced', 'صعب': 'advanced',
});
const PLANE_LOOKUP = enumLookup(PLANES, {
  'سهمي': 'sagittal', 'جبهي': 'frontal', 'أفقي': 'transverse', 'متعدد': 'multi',
});
const MOVEMENT_LOOKUP = enumLookup(MOVEMENT_PATTERNS, {
  deadlift: 'hinge', 'hip hinge': 'hinge', row: 'pull_horizontal', 'pull up': 'pull_vertical',
  'chin up': 'pull_vertical', pulldown: 'pull_vertical', 'pull down': 'pull_vertical',
  pullup: 'pull_vertical', chinup: 'pull_vertical', 'lat pulldown': 'pull_vertical',
  bench: 'push_horizontal', 'bench press': 'push_horizontal', 'press horizontal': 'push_horizontal',
  'push up': 'push_horizontal', pushup: 'push_horizontal',
  'overhead press': 'push_vertical', dip: 'push_vertical', dips: 'push_vertical',
  'romanian deadlift': 'hinge', rdl: 'hinge', 'hip thrust': 'hinge', 'step up': 'lunge',
  'farmer walk': 'carry', 'farmers walk': 'carry', 'farmer carry': 'carry',
  plank: 'anti_rotation', curl: 'isolation', extension: 'isolation', raise: 'isolation',
});
const TRUE_KEYS = new Set(['true', 'yes', 'y', '1', 'نعم', 'اه', 'أيوه'].map(searchKey));
const FALSE_KEYS = new Set(['false', 'no', 'n', '0', 'لا'].map(searchKey));

function videoUrl(value: string): string | null {
  if (!/^https?:\/\//iu.test(value) || /\s/u.test(value)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
  const host = url.hostname.toLowerCase();
  const youtube = ['youtube.com', 'youtube-nocookie.com'].some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (host === 'youtu.be' || youtube) {
    const segments = url.pathname.split('/').filter(Boolean);
    const id = host === 'youtu.be' && segments.length === 1 ? segments[0]
      : url.pathname === '/watch' ? url.searchParams.get('v')
      : segments.length === 2 && ['shorts', 'embed', 'live'].includes(segments[0] ?? '') ? segments[1] : null;
    if (!id || !/^[a-z0-9_-]+$/iu.test(id)) return null;
    return `https://www.youtube.com/watch?v=${id}`;
  }
  return url.href;
}

/** Both localized names and aliases identify exercises (spec §11 duplicate preview). */
function sameExercise(a: ExistingExercise, b: ExistingExercise): boolean {
  if (sameName(a.name, b.name)) return true;
  return (a.aliases ?? []).some((alias) => sameName(alias, b.name)
    || (b.aliases ?? []).some((other) => sameName(alias, other)))
    || (b.aliases ?? []).some((alias) => sameName(alias, a.name));
}

const SCHEMA_FIELDS: Record<string, ExerciseImportField> = {
  slug: 'name_en', aliases: 'aliases', category: 'category', primaryMuscles: 'primary_muscles',
  secondaryMuscles: 'secondary_muscles', movementPattern: 'movement_pattern', equipment: 'equipment',
  difficulty: 'difficulty', unilateral: 'unilateral', compound: 'compound', plane: 'plane',
  tags: 'tags', videoUrl: 'video_url',
};
const LIST_FIELDS = new Set<ExerciseImportField>([
  'aliases', 'primary_muscles', 'secondary_muscles', 'equipment', 'cues_en', 'cues_ar', 'mistakes_en', 'mistakes_ar', 'tags',
]);

type ImportOptions = {
  /** The library the import lands in, system rows included. Pass slugs: update mode needs them to target a row. */
  existing?: ExistingExercise[];
  defaultCategory?: string;
  /** Used for rows whose difficulty cell is empty; a value that is present but unknown is still an error. */
  defaultDifficulty?: Difficulty;
  categories?: string[];
  onExisting?: 'error' | 'update';
};

/**
 * Blank rows (every cell empty, which Excel writes for formatted but unused rows) are skipped: no result and not
 * counted. rowNumber stays the parsed row index + 1, so the preview table and the row errors always agree.
 */
export function mapExerciseRows(
  parsed: ParsedCsv,
  mapping: ColumnMapping,
  opts?: ImportOptions,
): { results: ImportRowResult[]; summary: { total: number; valid: number; invalid: number; duplicates: number; warnings: number } } {
  const results: ImportRowResult[] = [];
  const accepted: ExerciseSeed[] = [];
  // New rows never take a slug the library already uses: (tenant_id, slug) is unique in the database.
  const usedSlugs = new Set<string>((opts?.existing ?? []).flatMap((entry) => (entry.slug ? [entry.slug] : [])));
  // Existing exercises that an earlier row of this file already updates (update mode).
  const claimedSlugs = new Set<string>();
  const categories = opts?.categories === undefined ? undefined : new Set(opts.categories.map(searchKey));

  parsed.rows.forEach((row, index) => {
    if (row.every((cell) => !cell.trim())) return;
    const rowNumber = index + 1;
    const errors: ImportIssue[] = [];
    const warnings: ImportIssue[] = [];
    const read = (field: ExerciseImportField): string => {
      const column = mapping[field];
      return column === undefined || !Number.isInteger(column) || column < 0 || column >= parsed.headers.length
        ? '' : (row[column] ?? '').trim();
    };
    const text = Object.fromEntries(
      EXERCISE_IMPORT_FIELDS.map((field) => [field, read(field)]),
    ) as Record<ExerciseImportField, string>;
    const list = (field: ExerciseImportField) => splitList(text[field], field);
    const addError = (code: ImportIssue['code'], field: ExerciseImportField, value?: string) => {
      if (!errors.some((entry) => entry.code === code && entry.field === field)) errors.push(issue(code, field, value));
    };

    // Trailing empty cells (a trailing separator on every line) are harmless; only content beyond the header warns.
    if (row.slice(parsed.headers.length).some((cell) => cell.trim())) warnings.push(issue('extra_cells'));
    for (const field of EXERCISE_IMPORT_FIELDS) {
      const values = LIST_FIELDS.has(field) ? list(field) : [text[field]];
      for (const value of values) if (Array.from(value).length > 200) addError('too_long', field, value);
    }
    const name: LocalizedText = {
      ...(text.name_en ? { en: text.name_en } : {}), ...(text.name_ar ? { ar: text.name_ar } : {}),
    };
    if (!text.name_en && !text.name_ar) addError('required', mapping.name_en === undefined && mapping.name_ar !== undefined ? 'name_ar' : 'name_en');
    const category = text.category || opts?.defaultCategory?.trim() || '';
    if (!category) addError('required', 'category');
    else {
      if (Array.from(category).length > 200) addError('too_long', 'category', category);
      if (categories && !categories.has(searchKey(category))) warnings.push(issue('unknown_category', 'category', category));
    }
    // Muscles are optional: many coaches import names and video links first and fill in details later.
    const primaryMuscles = list('primary_muscles');

    const readEnum = <T extends string>(field: ExerciseImportField, lookup: Map<string, T>): T | undefined => {
      const value = text[field];
      if (!value) return undefined;
      const normalized = lookup.get(searchKey(value));
      if (normalized === undefined) addError('invalid_enum', field, value);
      return normalized;
    };
    const readBoolean = (field: 'unilateral' | 'compound'): boolean | undefined => {
      const value = text[field];
      if (!value) return undefined;
      const key = searchKey(value);
      if (TRUE_KEYS.has(key)) return true;
      if (FALSE_KEYS.has(key)) return false;
      addError('invalid_boolean', field, value);
      return undefined;
    };
    const difficulty = text.difficulty ? readEnum('difficulty', DIFFICULTY_LOOKUP) : opts?.defaultDifficulty;
    if (!text.difficulty && !opts?.defaultDifficulty) addError('required', 'difficulty');
    const movementPattern = readEnum('movement_pattern', MOVEMENT_LOOKUP) ?? 'other';
    const plane = readEnum('plane', PLANE_LOOKUP);
    const unilateral = readBoolean('unilateral');
    const compound = readBoolean('compound');
    const video = text.video_url ? videoUrl(text.video_url) : undefined;
    if (video === null) addError('invalid_url', 'video_url', text.video_url);

    const aliases = list('aliases');
    const englishAlias = aliases.find((alias) => /[a-z]/iu.test(alias) && slugify(alias));
    // A slug derived from English text may identify an existing exercise; the row-<n> fallback never does, because
    // two different Arabic-only exercises from two imports both start as row-3.
    const derivedSlug = slugify(text.name_en) || (englishAlias ? slugify(englishAlias) : '');
    const baseSlug = derivedSlug || `row-${rowNumber}`;
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) { slug = `${baseSlug}-${suffix}`; suffix += 1; }

    // The shared schema remains the final contract, including defaults for optional columns.
    const validated = ExerciseSeed.safeParse({
      slug, name, aliases, category, primaryMuscles, secondaryMuscles: list('secondary_muscles'),
      movementPattern, equipment: list('equipment'), difficulty, unilateral, compound, plane,
      cues: pairText(list('cues_en'), list('cues_ar')),
      commonMistakes: pairText(list('mistakes_en'), list('mistakes_ar')),
      tags: list('tags'), videoUrl: video ?? undefined,
    });
    if (!validated.success) {
      for (const failure of validated.error.issues) {
        const root = String(failure.path[0] ?? '');
        if (root === 'name' && errors.some((entry) => entry.field === 'name_en' || entry.field === 'name_ar')) continue;
        const field = root === 'name' ? (failure.path[1] === 'ar' ? 'name_ar' : 'name_en')
          : root === 'cues' ? (failure.path[2] === 'ar' ? 'cues_ar' : 'cues_en')
          : root === 'commonMistakes' ? (failure.path[2] === 'ar' ? 'mistakes_ar' : 'mistakes_en')
          : SCHEMA_FIELDS[root];
        if (!field || errors.some((entry) => entry.field === field)) continue;
        const code: ImportIssue['code'] = failure.code === 'too_big' ? 'too_long'
          : field === 'video_url' ? 'invalid_url'
          : !text[field] || failure.code === 'too_small' ? 'required' : 'invalid_enum';
        addError(code, field, text[field]);
      }
    }

    if (!validated.success || errors.length > 0) {
      // Invalid rows reserve neither names nor slugs, so a corrected row can safely follow.
      results.push({ rowNumber, ok: false, errors, warnings });
      return;
    }
    const exercise = validated.data;
    const existing = opts?.existing?.find((entry) => sameExercise(exercise, entry)
      || (!!derivedSlug && !!entry.slug && entry.slug === derivedSlug));
    const updating = !!existing && opts?.onExisting === 'update';
    if (existing) {
      const duplicate = issue('duplicate_existing');
      if (updating) {
        warnings.push(duplicate);
        if (existing.slug) exercise.slug = existing.slug;
      } else errors.push(duplicate);
    }
    if (accepted.some((entry) => sameExercise(exercise, entry))
      || (updating && claimedSlugs.has(exercise.slug))) {
      errors.push(issue('duplicate_in_file'));
    }
    if (errors.length > 0) results.push({ rowNumber, ok: false, errors, warnings });
    else {
      accepted.push(exercise);
      usedSlugs.add(exercise.slug);
      if (updating) claimedSlugs.add(exercise.slug);
      results.push({ rowNumber, ok: true, exercise, warnings });
    }
  });

  const valid = results.filter((row) => row.ok).length;
  return {
    results,
    summary: {
      total: results.length, valid, invalid: results.length - valid,
      duplicates: results.filter((row) => [...row.warnings, ...(row.ok ? [] : row.errors)]
        .some((entry) => entry.code === 'duplicate_in_file' || entry.code === 'duplicate_existing')).length,
      warnings: results.reduce((sum, row) => sum + row.warnings.length, 0),
    },
  };
}

export function missingRequiredMappings(
  mapping: ColumnMapping,
  opts?: { defaultCategory?: string; defaultDifficulty?: Difficulty },
): string[] {
  const missing: string[] = [];
  if (mapping.name_en === undefined && mapping.name_ar === undefined) missing.push('name_en|name_ar');
  if (mapping.category === undefined && !opts?.defaultCategory?.trim()) missing.push('category');
  if (mapping.difficulty === undefined && !opts?.defaultDifficulty) missing.push('difficulty');
  return missing;
}

// Spreadsheet apps evaluate a cell that starts with = + - @ (or a tab or carriage return) as a formula: CSV injection.
const FORMULA_START = /^[=+\-@\t\r]/u;
const PLAIN_NUMBER = /^[+-]?[0-9]+(?:[.,][0-9]+)?$/u;

/**
 * formulaSafe (default true) prefixes such cells with an apostrophe so Excel shows them as text; plain numbers such as
 * -2.5 stay as they are. Turn it off only for files that never open in a spreadsheet: those cells do not round-trip.
 */
export function toCsv(
  headers: string[],
  rows: string[][],
  opts?: { delimiter?: Delimiter; bom?: boolean; formulaSafe?: boolean },
): string {
  const delimiter = opts?.delimiter ?? ',';
  const formulaSafe = opts?.formulaSafe !== false;
  const escape = (raw: string): string => {
    const value = formulaSafe && FORMULA_START.test(raw) && !PLAIN_NUMBER.test(raw) ? `'${raw}` : raw;
    const needsQuotes = value === '' || value.includes(delimiter) || /["\r\n]/u.test(value) || /^\s|\s$/u.test(value);
    return needsQuotes ? `"${value.replace(/"/gu, '""')}"` : value;
  };
  return `${opts?.bom === false ? '' : '\ufeff'}${[headers, ...rows]
    .map((row) => row.map(escape).join(delimiter)).join('\r\n')}\r\n`;
}

export function exerciseImportTemplate(): string {
  const example: Record<ExerciseImportField, string> = {
    name_en: 'Barbell Back Squat', name_ar: 'سكوات بالبار', aliases: 'Back Squat|سكوات خلفي',
    category: 'Legs', primary_muscles: 'Quads|Glutes', secondary_muscles: 'Hamstrings|Core',
    movement_pattern: 'squat', equipment: 'Barbell|Squat Rack', difficulty: 'beginner',
    unilateral: 'no', compound: 'yes', plane: 'sagittal',
    cues_en: 'Brace your core|Keep your feet planted', cues_ar: 'شد بطنك|ثبت رجلك على الأرض',
    mistakes_en: 'Knees collapsing inward', mistakes_ar: 'متدخلش ركبك لجوه',
    video_url: '', tags: 'strength|lower body',
  };
  return toCsv([...EXERCISE_IMPORT_FIELDS], [EXERCISE_IMPORT_FIELDS.map((field) => example[field])]);
}
