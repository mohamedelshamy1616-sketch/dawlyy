import { describe, it, expect } from 'vitest';
import {
  CsvError, EXERCISE_IMPORT_FIELDS, parseCsv, suggestMapping, mapExerciseRows,
  missingRequiredMappings, toCsv, exerciseImportTemplate,
} from '../src/csv';
import type { ExerciseImportField, ImportRowResult } from '../src/csv';

function mapped(rows: string[][], headers: ExerciseImportField[] = [
  'name_en', 'name_ar', 'category', 'primary_muscles', 'difficulty', 'video_url',
], opts?: Parameters<typeof mapExerciseRows>[2]) {
  const parsed = parseCsv(toCsv(headers, rows));
  return mapExerciseRows(parsed, suggestMapping(parsed.headers), opts);
}

function exercise(result: ImportRowResult | undefined) {
  if (!result?.ok) throw new Error('Expected a valid imported exercise');
  return result.exercise;
}

describe('CSV parsing and serialization', () => {
  it('handles BOM, quoted commas, escapes, CRLF, embedded newlines and cell whitespace', () => {
    const parsed = parseCsv('\ufeff name , note \r\n"Squat, high","say ""up""\nthen brace"\r\n  Press  , ok \r\n');
    expect(parsed).toEqual({ headers: ['name', 'note'], delimiter: ',', rows: [
      ['Squat, high', 'say "up"\nthen brace'], ['  Press  ', ' ok '],
    ] });
    expect(parseCsv('name,note\nA,"first\r\nsecond"').rows).toEqual([['A', 'first\r\nsecond']]);
  });

  it('detects semicolons outside quotes, supports forced tabs and resolves ties to comma', () => {
    expect(parseCsv('"name, with, commas";category\nSquat;Legs').delimiter).toBe(';');
    expect(parseCsv('name\tcategory\nSquat\tLegs', { delimiter: '\t' }).rows).toEqual([['Squat', 'Legs']]);
    expect(parseCsv('a\tb\n1\t2').delimiter).toBe('\t');
    expect(parseCsv('a,b;c').delimiter).toBe(',');
    expect(parseCsv('a;b\tc').delimiter).toBe(',');
  });

  it('skips blank lines, pads short rows and preserves extra or explicitly empty cells', () => {
    expect(parseCsv('\n\r\n name ,category\n\nSquat\nPress,Chest,extra\n,\n""\n').rows)
      .toEqual([['Squat', ''], ['Press', 'Chest', 'extra'], ['', ''], ['', '']]);
    expect(parseCsv('name\n""').rows).toEqual([['']]);
    expect(parseCsv('name').rows).toEqual([]);
  });

  it('throws stable errors and identifies the opening quote physical line', () => {
    for (const text of ['', '\ufeff\r\n\n', '   \n']) {
      expect(() => parseCsv(text)).toThrow(CsvError);
      try { parseCsv(text); } catch (error) { expect(error).toMatchObject({ code: 'empty' }); }
    }
    try {
      parseCsv('name,note\r\nSquat,ok\r\nPress,"unfinished\r\nmore');
      throw new Error('Expected CsvError');
    } catch (error) {
      expect(error).toBeInstanceOf(CsvError);
      expect(error).toMatchObject({ code: 'unterminated_quote', line: 3 });
    }
  });

  it.each([',', ';', '\t'] as const)('round-trips %j with CRLF and optional Excel BOM', (delimiter) => {
    const headers = ['name', 'notes'];
    const rows = [['سكوات', 'comma, semi; tab\t and "quote"'], ['Press', 'line\nline'], ['', 'x\ry']];
    const output = toCsv(headers, rows, { delimiter });
    expect(output.startsWith('\ufeff')).toBe(true);
    expect(output).toContain('\r\n');
    expect(parseCsv(output, { delimiter })).toEqual({ headers, rows, delimiter });
    expect(toCsv(headers, [], { bom: false }).startsWith('\ufeff')).toBe(false);
  });
});

describe('column mapping', () => {
  it('recognizes English synonyms and all canonical template headers', () => {
    expect(suggestMapping(['Exercise name', 'Also known as', 'Body part', 'Primary muscle',
      'Level', 'YouTube', 'Tips', 'Mistakes'])).toEqual({
      name_en: 0, aliases: 1, category: 2, primary_muscles: 3, difficulty: 4,
      video_url: 5, cues_en: 6, mistakes_en: 7,
    });
    const mapping = suggestMapping([...EXERCISE_IMPORT_FIELDS]);
    EXERCISE_IMPORT_FIELDS.forEach((field, index) => expect(mapping[field]).toBe(index));
  });

  it('recognizes Arabic generic and language-specific names and coaching headers', () => {
    expect(suggestMapping(['اسم التمرين', 'الاسم بالإنجليزي', 'العضلات', 'الفيديو', 'المستوى']))
      .toEqual({ name_ar: 0, name_en: 1, primary_muscles: 2, video_url: 3, difficulty: 4 });
    expect(suggestMapping(['الاسم عربي', 'العضلات المساعدة', 'الفئة', 'الأجهزة', 'النصائح', 'الأخطاء', 'أسماء أخرى']))
      .toEqual({ name_ar: 0, secondary_muscles: 1, category: 2, equipment: 3, cues_ar: 4, mistakes_ar: 5, aliases: 6 });
  });

  it('uses each column and field at most once and reports missing required mappings', () => {
    expect(suggestMapping(['Name', 'name (en)', 'name (ar)', 'mystery'])).toEqual({ name_en: 0, name_ar: 2 });
    // Difficulty became required at mapping time (2026-11-07 review): rows without it would all fail otherwise.
    expect(missingRequiredMappings({})).toEqual(['name_en|name_ar', 'category', 'difficulty']);
    expect(missingRequiredMappings({ name_ar: 0 }, { defaultCategory: 'Legs', defaultDifficulty: 'beginner' })).toEqual([]);
    expect(missingRequiredMappings({ name_en: 0, difficulty: 2 }, { defaultCategory: ' ' })).toEqual(['category']);
    expect(missingRequiredMappings({ name_en: 0, category: 1 })).toEqual(['difficulty']);
    expect(missingRequiredMappings({ name_en: 0, category: 1, difficulty: 2 })).toEqual([]);
  });
});

describe('exercise row import', () => {
  const sixRows = [
    ['Squat', 'أحمد سكوات', 'Legs', 'Quads', 'beginner', ''],
    ['', '', 'Legs', 'Quads', 'beginner', ''],
    ['Bad URL', '', 'Legs', 'Quads', 'beginner', 'javascript:alert(1)'],
    ['Press', 'ضغط', 'Chest', 'Pecs', 'medium', 'https://youtu.be/abc_123-xyz?t=4'],
    ['Other Squat', 'احمد سكوات', 'Legs', 'Quads', 'beginner', ''],
    ['Existing Row', '', 'Back', 'Lats', 'hard', ''],
  ];
  const existing = [{ slug: 'saved-row', name: { en: 'Existing Row' } }];

  it('returns row errors, normalized videos and counts for a mixed six-row file', () => {
    const output = mapped(sixRows, undefined, { existing });
    expect(output.summary).toEqual({ total: 6, valid: 2, invalid: 4, duplicates: 2, warnings: 0 });
    expect(output.results.map((row) => row.rowNumber)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const [index, code] of [[1, 'required'], [2, 'invalid_url'],
      [4, 'duplicate_in_file'], [5, 'duplicate_existing']] as const) {
      const row = output.results[index];
      expect(row?.ok).toBe(false);
      if (row && !row.ok) expect(row.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code })]));
    }
    expect(exercise(output.results[3]).videoUrl).toBe('https://www.youtube.com/watch?v=abc_123-xyz');
  });

  it('allows updates with the existing slug and a duplicate warning, deterministically', () => {
    const output = mapped(sixRows, undefined, { existing, onExisting: 'update' });
    expect(output.summary).toEqual({ total: 6, valid: 3, invalid: 3, duplicates: 2, warnings: 1 });
    expect(exercise(output.results[5]).slug).toBe('saved-row');
    expect(output.results[5]?.warnings[0]?.code).toBe('duplicate_existing');
    expect(mapped(sixRows, undefined, { existing, onExisting: 'update' })).toEqual(output);
  });

  it('splits lists and pairs localized cues/mistakes by position with schema defaults', () => {
    const output = mapped([[
      'Squat', 'سكوات', '', 'Quads|Glutes؛Core،Back;Hamstrings\nCalves', 'مبتدئ',
      'A|B', 'Dumbbell;Bench', 'Brace|Chest up', 'شد بطنك', 'Rush', 'متستعجلش|ثبت رجلك', 'strength،legs',
    ]], ['name_en', 'name_ar', 'category', 'primary_muscles', 'difficulty', 'aliases',
      'equipment', 'cues_en', 'cues_ar', 'mistakes_en', 'mistakes_ar', 'tags'], { defaultCategory: 'Legs' });
    expect(exercise(output.results[0])).toMatchObject({
      name: { en: 'Squat', ar: 'سكوات' }, category: 'Legs', difficulty: 'beginner',
      primaryMuscles: ['Quads', 'Glutes', 'Core', 'Back', 'Hamstrings', 'Calves'],
      aliases: ['A', 'B'], equipment: ['Dumbbell', 'Bench'], tags: ['strength', 'legs'],
      cues: [{ en: 'Brace', ar: 'شد بطنك' }, { en: 'Chest up' }],
      commonMistakes: [{ en: 'Rush', ar: 'متستعجلش' }, { ar: 'ثبت رجلك' }],
      movementPattern: 'other', unilateral: false, compound: true, plane: 'sagittal',
    });
  });

  it.each(['true', 'yes', 'y', '1', 'نعم', 'اه', 'أيوه'])('parses true boolean %s', (value) => {
    expect(exercise(mapped([['A', 'Legs', 'Quads', 'easy', value]],
      ['name_en', 'category', 'primary_muscles', 'difficulty', 'unilateral']).results[0]).unilateral).toBe(true);
  });
  it.each(['false', 'no', 'n', '0', 'لا'])('parses false boolean %s', (value) => {
    expect(exercise(mapped([['A', 'Legs', 'Quads', 'easy', value]],
      ['name_en', 'category', 'primary_muscles', 'difficulty', 'compound']).results[0]).compound).toBe(false);
  });
  it.each([
    ['beginner', 'beginner'], ['easy', 'beginner'], ['مبتدئ', 'beginner'],
    ['intermediate', 'intermediate'], ['medium', 'intermediate'], ['متوسط', 'intermediate'],
    ['advanced', 'advanced'], ['hard', 'advanced'], ['متقدم', 'advanced'], ['محترف', 'advanced'],
  ])('normalizes difficulty %s', (input, expected) => {
    expect(exercise(mapped([['A', '', 'Legs', 'Quads', input, '']]).results[0]).difficulty).toBe(expected);
  });

  it.each([
    ['squat', 'squat'], ['deadlift', 'hinge'], ['hip hinge', 'hinge'], ['row', 'pull_horizontal'],
    ['pull up', 'pull_vertical'], ['chin-up', 'pull_vertical'], ['pulldown', 'pull_vertical'],
    ['bench', 'push_horizontal'], ['press horizontal', 'push_horizontal'], ['push-horizontal', 'push_horizontal'],
    ['overhead press', 'push_vertical'], ['lunge', 'lunge'], ['carry', 'carry'], ['rotation', 'rotation'],
    ['plank', 'anti_rotation'], ['curl', 'isolation'], ['extension', 'isolation'], ['raise', 'isolation'],
    ['pull_vertical', 'pull_vertical'], ['push vertical', 'push_vertical'], ['pull horizontal', 'pull_horizontal'],
    ['anti rotation', 'anti_rotation'], ['isolation', 'isolation'], ['locomotion', 'locomotion'], ['other', 'other'],
  ])('normalizes movement %s', (input, expected) => {
    expect(exercise(mapped([['A', 'Legs', 'Quads', 'easy', input]],
      ['name_en', 'category', 'primary_muscles', 'difficulty', 'movement_pattern']).results[0]).movementPattern).toBe(expected);
  });
  it.each([
    ['سهمي', 'sagittal'], ['جبهي', 'frontal'], ['أفقي', 'transverse'], ['متعدد', 'multi'],
    ['sagittal', 'sagittal'], ['frontal', 'frontal'], ['transverse', 'transverse'], ['multi', 'multi'],
  ])('normalizes plane %s', (input, expected) => {
    expect(exercise(mapped([['A', 'Legs', 'Quads', 'easy', input]],
      ['name_en', 'category', 'primary_muscles', 'difficulty', 'plane']).results[0]).plane).toBe(expected);
  });

  it.each([
    ['https://youtu.be/ID_123-abc', 'https://www.youtube.com/watch?v=ID_123-abc'],
    ['http://youtube.com/watch?v=ID_123-abc&feature=share', 'https://www.youtube.com/watch?v=ID_123-abc'],
    ['https://www.youtube.com/shorts/ID_123-abc', 'https://www.youtube.com/watch?v=ID_123-abc'],
    ['https://m.youtube.com/embed/ID_123-abc', 'https://www.youtube.com/watch?v=ID_123-abc'],
    ['https://coach.example/demo.mp4', 'https://coach.example/demo.mp4'],
  ])('validates video URL %s', (input, expected) => {
    expect(exercise(mapped([['A', '', 'Legs', 'Quads', 'easy', input]]).results[0]).videoUrl).toBe(expected);
  });

  it('rejects malformed and incomplete video links without throwing', () => {
    for (const url of ['ftp://host/file', 'not a URL', 'https://', 'https:example.com', 'https://youtu.be/',
      'https://youtube.com/watch', 'https://youtube.com/shorts/', 'https://youtube.com/watch?v=bad%20id']) {
      const row = mapped([['A', '', 'Legs', 'Quads', 'easy', url]]).results[0];
      expect(row?.ok).toBe(false);
      if (row && !row.ok) expect(row.errors).toContainEqual(expect.objectContaining({ field: 'video_url', code: 'invalid_url' }));
    }
  });

  it('localizes every issue and distinguishes required, enum, boolean and length failures', () => {
    const row = mapped([['x'.repeat(201), '', '', '', 'expert', 'maybe', 'diagonal', 'sideways']],
      ['name_en', 'name_ar', 'category', 'primary_muscles', 'difficulty', 'unilateral', 'movement_pattern', 'plane']).results[0];
    expect(row?.ok).toBe(false);
    if (row && !row.ok) {
      expect(row.errors).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'name_en', code: 'too_long' }),
        expect.objectContaining({ field: 'category', code: 'required' }),
        expect.objectContaining({ field: 'difficulty', code: 'invalid_enum' }),
        expect.objectContaining({ field: 'unilateral', code: 'invalid_boolean' }),
        expect.objectContaining({ field: 'movement_pattern', code: 'invalid_enum' }),
        expect.objectContaining({ field: 'plane', code: 'invalid_enum' }),
      ]));
      for (const issue of row.errors) {
        expect(issue.message.ar).toMatch(/[\u0600-\u06ff]/);
        expect(issue.message.en?.length ?? 0).toBeGreaterThan(0);
      }
    }
    const schemaFailure = mapped([['A', '', 'Legs', '', '', '']]).results[0];
    expect(schemaFailure?.ok).toBe(false);
    // Primary muscles are optional since the 2026-11-07 review; difficulty is still required.
    if (schemaFailure && !schemaFailure.ok) {
      expect(schemaFailure.errors).toEqual([expect.objectContaining({ field: 'difficulty', code: 'required' })]);
    }
  });

  it('warns on extra cells and unknown categories using normalized comparison', () => {
    const parsed = parseCsv('name,category,muscles,level\nA,أرجل,Quads,easy,extra\nB,Chest,Pecs,easy');
    const output = mapExerciseRows(parsed, suggestMapping(parsed.headers), { categories: ['ارجل'] });
    expect(output.summary).toMatchObject({ valid: 2, warnings: 2 });
    expect(output.results[0]?.warnings.map((issue) => issue.code)).toEqual(['extra_cells']);
    expect(output.results[1]?.warnings.map((issue) => issue.code)).toEqual(['unknown_category']);
  });

  it('finds alias/name duplicates, ignoring invalid predecessors', () => {
    const output = mapped([
      ['First', 'Quads', 'easy', 'Shared'], ['Shared', 'Quads', 'easy', ''],
      // Invalid through its difficulty: empty muscles stopped being an error in the 2026-11-07 review.
      ['Invalid', 'Quads', 'expert', 'Retry'], ['Retry', 'Quads', 'easy', ''],
    ], ['name_en', 'primary_muscles', 'difficulty', 'aliases'], { defaultCategory: 'Legs' });
    expect(output.results.map((row) => row.ok)).toEqual([true, false, false, true]);
    expect(output.summary.duplicates).toBe(1);
    const aliasExisting = mapped([['New', 'Quads', 'easy', 'saved alias']],
      ['name_en', 'primary_muscles', 'difficulty', 'aliases'], {
        defaultCategory: 'Legs', existing: [{ name: { ar: 'قديم' }, aliases: ['Saved Alias'] }],
      });
    expect(aliasExisting.summary.duplicates).toBe(1);
  });

  it('finds duplicates between localized names and aliases in either direction', () => {
    const existing = [{ name: { ar: 'أحمد', en: 'Ahmed' }, aliases: ['Saved Alias'] }];
    const output = mapped([
      ['saved alias', 'Quads', 'easy', ''], ['New', 'Quads', 'easy', 'احمد'],
    ], ['name_en', 'primary_muscles', 'difficulty', 'aliases'], { defaultCategory: 'Legs', existing });
    expect(output.summary).toMatchObject({ valid: 0, invalid: 2, duplicates: 2 });
  });

  it('checks every list item length without limiting the whole list to 200 characters', () => {
    const headers: ExerciseImportField[] = ['name_en', 'category', 'primary_muscles', 'difficulty', 'cues_en'];
    const valid = mapped([['A', 'Legs', 'Quads', 'easy', `${'a'.repeat(150)}|${'b'.repeat(150)}`]], headers);
    expect(valid.results[0]?.ok).toBe(true);
    const invalid = mapped([['A', 'Legs', 'Quads', 'easy', 'a'.repeat(201)]], headers).results[0];
    expect(invalid?.ok).toBe(false);
    if (invalid && !invalid.ok) expect(invalid.errors).toContainEqual(expect.objectContaining({ field: 'cues_en', code: 'too_long' }));
  });

  it('preserves inputs and returns fresh issue messages on repeated imports', () => {
    const parsed = parseCsv('name,category,muscles,level\nA,Legs,Quads,easy');
    const mapping = suggestMapping(parsed.headers);
    const existing = [{ slug: 'saved', name: { en: 'A' }, aliases: ['Alias'] }];
    const before = JSON.stringify({ parsed, mapping, existing });
    const output = mapExerciseRows(parsed, mapping, { existing, onExisting: 'update' });
    expect(JSON.stringify({ parsed, mapping, existing })).toBe(before);
    const message = output.results[0]?.warnings[0]?.message;
    if (message) message.en = 'Modified by caller';
    expect(mapExerciseRows(parsed, mapping, { existing, onExisting: 'update' }).results[0]?.warnings[0]?.message.en)
      .not.toBe('Modified by caller');
  });

  it('uses English aliases or row numbers for Arabic slugs and makes collisions unique', () => {
    const output = mapped([
      ['سكوات', 'Quads', 'easy', 'English Alias'], ['ضغط', 'Quads', 'easy', ''],
    ], ['name_ar', 'primary_muscles', 'difficulty', 'aliases'], { defaultCategory: 'Legs' });
    expect(output.results.map((row) => exercise(row).slug)).toEqual(['english-alias', 'row-2']);
    const collisions = mapped([
      ['Café', 'Quads', 'easy'], ['Cafe', 'Quads', 'easy'], ['Cafe-2', 'Quads', 'easy'],
    ], ['name_en', 'primary_muscles', 'difficulty'], { defaultCategory: 'Legs' });
    expect(collisions.results.map((row) => exercise(row).slug)).toEqual(['cafe', 'cafe-2', 'cafe-2-2']);
  });

  it('detects equal existing slugs and prevents two updates targeting the same slug', () => {
    const output = mapped([
      ['Café', 'Quads', 'easy'], ['Different', 'Quads', 'easy'],
    ], ['name_en', 'primary_muscles', 'difficulty'], {
      defaultCategory: 'Legs', onExisting: 'update',
      existing: [{ slug: 'cafe', name: { en: 'Different' } }],
    });
    expect(exercise(output.results[0]).slug).toBe('cafe');
    expect(output.results[1]?.ok).toBe(false);
    const row = output.results[1];
    if (row && !row.ok) expect(row.errors).toContainEqual(expect.objectContaining({ code: 'duplicate_in_file' }));
  });

  it('returns an empty summary and a fully usable bilingual template', () => {
    expect(mapExerciseRows({ headers: [], rows: [], delimiter: ',' }, {}).summary)
      .toEqual({ total: 0, valid: 0, invalid: 0, duplicates: 0, warnings: 0 });
    const parsed = parseCsv(exerciseImportTemplate());
    expect(parsed.headers).toEqual([...EXERCISE_IMPORT_FIELDS]);
    const output = mapExerciseRows(parsed, suggestMapping(parsed.headers));
    expect(output.summary).toEqual({ total: 1, valid: 1, invalid: 0, duplicates: 0, warnings: 0 });
    expect(exercise(output.results[0]).name).toEqual({ en: 'Barbell Back Squat', ar: 'سكوات بالبار' });
  });
});

describe('real-world spreadsheets (integration review)', () => {
  it('skips Excel blank rows and ignores trailing empty cells without renumbering rows', () => {
    const parsed = parseCsv('name,category,level\r\nSquat,Legs,easy,\r\n,,,\r\n , , ,\r\nPress,Chest,easy,\r\n');
    const output = mapExerciseRows(parsed, suggestMapping(parsed.headers));
    expect(output.summary).toEqual({ total: 2, valid: 2, invalid: 0, duplicates: 0, warnings: 0 });
    expect(output.results.map((row) => row.rowNumber)).toEqual([1, 4]);
  });

  it('splits short lists on commas but keeps commas inside cues and mistakes', () => {
    const output = mapped([[
      'Bench Press', 'Chest', 'Pecs, Triceps،Front delts', 'easy', 'Bench, Rack',
      'Feet flat, back tight|Bar to mid chest', 'انزل ببطء، وشد بطنك', 'Bouncing, flaring elbows',
    ]], ['name_en', 'category', 'primary_muscles', 'difficulty', 'equipment', 'cues_en', 'cues_ar', 'mistakes_en']);
    expect(exercise(output.results[0])).toMatchObject({
      primaryMuscles: ['Pecs', 'Triceps', 'Front delts'], equipment: ['Bench', 'Rack'],
      cues: [{ en: 'Feet flat, back tight', ar: 'انزل ببطء، وشد بطنك' }, { en: 'Bar to mid chest' }],
      commonMistakes: [{ en: 'Bouncing, flaring elbows' }],
    });
  });

  it('imports rows without muscles and fills only empty difficulty cells from the default', () => {
    const output = mapped([['Squat', 'Legs', '', ''], ['Press', 'Chest', '', 'expert']],
      ['name_en', 'category', 'primary_muscles', 'difficulty'], { defaultDifficulty: 'intermediate' });
    expect(exercise(output.results[0])).toMatchObject({ primaryMuscles: [], difficulty: 'intermediate' });
    const row = output.results[1];
    expect(row?.ok).toBe(false);
    if (row && !row.ok) expect(row.errors).toContainEqual(expect.objectContaining({ field: 'difficulty', code: 'invalid_enum' }));
  });

  it('never hands out a library slug and never treats a row-number slug as identity', () => {
    const existing = [{ slug: 'row-2', name: { ar: 'ضغط قديم' } }, { slug: 'squat', name: { en: 'Back Squat' } }];
    const headers: ExerciseImportField[] = ['name_ar', 'name_en', 'difficulty'];
    const rows = [['سكوات', '', 'easy'], ['ضغط', '', 'easy'], ['', 'Squat', 'easy']];
    const errorMode = mapped(rows, headers, { defaultCategory: 'Legs', existing });
    expect(errorMode.results.map((row) => row.ok)).toEqual([true, true, false]);
    expect(errorMode.results.slice(0, 2).map((row) => exercise(row).slug)).toEqual(['row-1', 'row-2-2']);
    // Before the fix, row 2 matched the unrelated library row "row-2" and update mode overwrote it.
    const updateMode = mapped(rows, headers, { defaultCategory: 'Legs', existing, onExisting: 'update' });
    expect(updateMode.results.map((row) => exercise(row).slug)).toEqual(['row-1', 'row-2-2', 'squat']);
    expect(updateMode.results.map((row) => row.warnings.map((issue) => issue.code))).toEqual([[], [], ['duplicate_existing']]);
  });

  it('neutralizes spreadsheet formulas on export but keeps plain numbers', () => {
    const output = toCsv(['name', 'value'], [
      ['=HYPERLINK("http://x","y")', '-2.5'], ['@SUM(A1)', '+20'], ['-Squat', '1,5'], ['\tTab', '0'],
    ], { bom: false });
    expect(parseCsv(output).rows).toEqual([
      ['\'=HYPERLINK("http://x","y")', '-2.5'], ["'@SUM(A1)", '+20'], ["'-Squat", '1,5'], ["'\tTab", '0'],
    ]);
    expect(parseCsv(toCsv(['a'], [['=1+1']], { formulaSafe: false })).rows).toEqual([['=1+1']]);
  });

  it.each([
    ['https://www.youtube.com/live/ID_123-abc', 'https://www.youtube.com/watch?v=ID_123-abc'],
    ['https://www.youtube-nocookie.com/embed/ID_123-abc', 'https://www.youtube.com/watch?v=ID_123-abc'],
  ])('normalizes the YouTube form %s', (input, expected) => {
    expect(exercise(mapped([['A', '', 'Legs', '', 'easy', input]]).results[0]).videoUrl).toBe(expected);
  });

  it.each([
    ['Pullup', 'movement_pattern', 'pull_vertical'], ['Push-up', 'movement_pattern', 'push_horizontal'],
    ['RDL', 'movement_pattern', 'hinge'], ['Hip thrust', 'movement_pattern', 'hinge'], ['Dips', 'movement_pattern', 'push_vertical'],
    ['Farmers walk', 'movement_pattern', 'carry'], ['Step-up', 'movement_pattern', 'lunge'],
  ] as const)('maps the common word %s', (input, _field, expected) => {
    expect(exercise(mapped([['A', 'Legs', 'easy', input]],
      ['name_en', 'category', 'difficulty', 'movement_pattern']).results[0]).movementPattern).toBe(expected);
  });

  it.each([['سهل', 'beginner'], ['صعب', 'advanced']])('maps the Egyptian difficulty word %s', (input, expected) => {
    expect(exercise(mapped([['A', 'Legs', input]], ['name_en', 'category', 'difficulty']).results[0]).difficulty).toBe(expected);
  });
});
