import { describe, expect, it } from 'vitest';
import { detectRedFlags, normalizeForMatch, RED_FLAG_LEXICON, type RedFlagCategory } from '../src/safety';

// Literal expectations catch missed dialects, substring matches, and over-broad exclusions.
const sentences: [string, RedFlagCategory[]][] = [
  ['ركبتي بتوجعني بعد التمرين', ['pain_injury']],
  ['ضهري واجعني من امبارح', ['pain_injury']],
  ['ظهري يعورني وايد', ['pain_injury']],
  ['بطني بتوجعني', ['pain_injury']],
  ['فيه أَلَـم شديد', ['pain_injury']],
  ['الللم شديد النهارده', ['pain_injury']],
  ['والألم زاد النهارده', ['pain_injury']],
  ['بالألم مش قادر اكمل', ['pain_injury']],
  ['عندي شد عضلي', ['pain_injury']],
  ['حصل التواء في رجلي', ['pain_injury']],
  ['عندي غضروف', ['pain_injury']],
  ['حاسس بتنميل', ['pain_injury']],
  ['ركبتي وارمه', ['pain_injury']],
  ['عندي انزلاق', ['pain_injury']],
  ['تألمت بعد الجري', ['pain_injury']],
  ['ragly wag3any', ['pain_injury']],
  ['ركبتي betwga3ny', ['pain_injury']],
  ['7ases be wag3', ['pain_injury']],
  ['My shoulder hurts', ['pain_injury']],
  ['I have muscle pain', ['pain_injury']],
  ["I can't move my arm", ['pain_injury']],
  ['ouchhhh that hurts', ['pain_injury']],
  ['There is numbness in my foot', ['pain_injury']],
  ['برجّع بعد الأكل', ['eating_disorder']],
  ['مش باكل خالص', ['eating_disorder']],
  ['بجوع نفسي عشان اخس', ['eating_disorder']],
  ['بكره جسمي', ['eating_disorder']],
  ['باخد ملينات للتخسيس', ['eating_disorder']],
  ['خايفه من الاكل', ['eating_disorder']],
  ['ما اكل ايام', ['eating_disorder']],
  ['ارجع بعد الاكل', ['eating_disorder']],
  ['عندي نهم بالاكل', ['eating_disorder']],
  ['ما آكل شي', ['eating_disorder']],
  ['والملينات كل يوم', ['eating_disorder']],
  ['مش بااااكل خالص', ['eating_disorder']],
  ['baraga3 ba3d el akl', ['eating_disorder']],
  ['msh bakol khales', ['eating_disorder']],
  ['bagra3 ba3d el akl', ['eating_disorder']],
  ['I binge at night', ['eating_disorder']],
  ['I purge after meals', ['eating_disorder']],
  ['I am starving myself', ['eating_disorder']],
  ['I hate my body', ['eating_disorder']],
  ['making myself throw up again', ['eating_disorder']],
  ['I have not eaten for days', ['eating_disorder']],
  ['أنا حَامِل', ['pregnancy']],
  ['عندي حمل', ['pregnancy']],
  ['الحمل متعبني', ['pregnancy']],
  ['وبالحمل تعبت', ['pregnancy']],
  ['بارضع ابني', ['pregnancy']],
  ['انا برضع', ['pregnancy']],
  ['فترة رضاعة', ['pregnancy']],
  ['الدورة اتأخرت', ['pregnancy']],
  ['الدوره متاخره', ['pregnancy']],
  ['انا حامل بالشهر الثالث', ['pregnancy']],
  ['قاعده ارضع', ['pregnancy']],
  ['بعد الولاده', ['pregnancy']],
  ['ana 7amel', ['pregnancy']],
  ['ana 7amil', ['pregnancy']],
  ['bardaa el baby', ['pregnancy']],
  ['I am pregnant', ['pregnancy']],
  ['pregnancy test was positive', ['pregnancy']],
  ['I am expecting a baby', ['pregnancy']],
  ['I missed my period', ['pregnancy']],
  ['I am breastfeeding', ['pregnancy']],
  ['بآخد دوا كل يوم', ['medication']],
  ['باخد دواء', ['medication']],
  ['عندي حبوب', ['medication']],
  ['باستخدم أَنْسُـولِين', ['medication']],
  ['باخد كورتيزون', ['medication']],
  ['فيه منشطات', ['medication']],
  ['علاج الغدة اتغير', ['medication']],
  ['دواء الضغط خلص', ['medication']],
  ['ادويه الاكتئاب', ['medication']],
  ['اخذ دواء للسكر', ['medication']],
  ['وبالحبوب تعبت', ['medication']],
  ['دواي خلص', ['medication']],
  ['bakhod dawa', ['medication']],
  ['akhod insulin', ['medication']],
  ['باخد cortisone', ['medication']],
  ['I changed my medication', ['medication']],
  ['I take pills daily', ['medication']],
  ['I take steroids', ['medication']],
  ['thyroid medicine changed', ['medication']],
  ['I use antidepressants', ['medication']],
  ['blood pressure medicine daily', ['medication']],
  ['', []], ['   ، ! ', []], ['العالم جميل', []], ['المهم نكمل', []],
  ['والمهم نكمل', []], ['فالمهم نكمل', []],
  ['انا معلم', []], ['الألماني صاحبي', []], ['painting today', []],
  ['painfulish is an invented word', []], ['pregnantly is invented', []],
  ['no pain today', []], ['without pain today', []], ['pain-free workout', []],
  ['no muscle pain today', []], ['without muscle pain', []],
  ['مفيش ركبتي بتوجعني', []], ['no blood pressure medicine', []],
  ['pain free today', []], ['مفيش ألم', []], ['مش وجع', []], ['بدون إصابة', []],
  ['حمل تدريبي عالي', []], ['الحمل التدريبي زاد', []], ['حمل الأوزان', []],
  ['حمل وزن تقيل', []], ['حمل تدريب', []], ['الحمل وزن', []],
  ['اكلت فراخ ورز', []], ['التمرين تمام', []], ['نمت كويس', []],
  ['شربت مياه كتير', []], ['الوزن ثابت', []], ['I feel good today', []],
  ['Finished my workout', []], ['I ate breakfast', []], ['انا حملت التطبيق', []],
  ['no medication today', []], ['مفيش حمل', []], ['without insulin', []],
  ['مفيش ألم بس عندي إصابة', ['pain_injury']],
  ['حمل تدريبي وانا حامل', ['pregnancy']],
  ['no pain but I take insulin', ['medication']],
  ['pregnant, pain, insulin, binge', ['pregnancy', 'pain_injury', 'medication', 'eating_disorder']],
];

describe('red flags', () => {
  it.each(sentences)('classifies %s', (text, expected) => {
    expect(detectRedFlags(text).map((match) => match.category)).toEqual(expected);
  });

  it.each([
    ['OUCH', 'ouch'], ['أ إ آ ٱ', 'ا ا ا ا'], ['ى ة ؤ ئ', 'ي ه و ي'],
    ['أَلَـم\u0670', 'الم'], ['١٢٣٤٥٦٧٨٩٠ ۱۲۳۴۵۶۷۸۹۰', '1234567890 1234567890'],
    ['  pain—\tfree،\n today! ', 'pain free today'], ['الللم ouchhhh', 'الم ouch'],
    ['لل oo 111', 'لل oo 111'], ['\u200fألم\u200e', 'الم'],
  ])('normalizes %s', (text, expected) => {
    expect(normalizeForMatch(text)).toBe(expected);
  });

  it('strips every required tashkeel codepoint', () => {
    for (let code = 0x064b; code <= 0x065f; code++) {
      expect(normalizeForMatch(`ا${String.fromCharCode(code)}لم`)).toBe('الم');
    }
  });

  it('preserves original offsets including diacritics, tatweel and surrogate pairs', () => {
    expect(detectRedFlags('💪 أَلَـمٌ! INSULIN')).toEqual([
      { category: 'pain_injury', matched: 'أَلَـمٌ', start: 3, end: 10 },
      { category: 'medication', matched: 'INSULIN', start: 12, end: 19 },
    ]);
  });

  it('maps phrase separators, clitics and collapsed repetitions to the original slice', () => {
    for (const text of ['  رُكبتي،  بتوجعني! ', '  والآآآلمُ! ', '  ouchhhhh! ']) {
      const match = detectRedFlags(text)[0]!;
      expect(match.start).toBe(2);
      expect(match.end).toBe(text.indexOf('!'));
      expect(match.matched).toBe(text.slice(2, text.indexOf('!')));
    }
  });

  it('keeps the first occurrence of each category in source order', () => {
    expect(detectRedFlags('insulin pain hurts pregnant pills').map(({ category, start }) => ({ category, start })))
      .toEqual([
        { category: 'medication', start: 0 }, { category: 'pain_injury', start: 8 },
        { category: 'pregnancy', start: 19 },
      ]);
  });

  it('matches explicit Arabic affixes on phrase words without flagging body parts alone', () => {
    for (const prefix of ['', 'و', 'ف', 'ب', 'ل', 'ك', 'ال', 'وال', 'بال', 'فال', 'لل']) {
      expect(detectRedFlags(`${prefix}ألم`)[0]?.category).toBe('pain_injury');
    }
    for (const suffix of ['ي', 'ك', 'ه', 'ها', 'نا', 'هم', 'كم']) {
      expect(detectRedFlags(`ركبت${suffix} بتوجعني`)[0]?.category).toBe('pain_injury');
    }
    expect(detectRedFlags('ركبتي ضهري بطني')).toEqual([]);
  });

  it('has normalized, distinct terms with at least 25 per category', () => {
    for (const terms of Object.values(RED_FLAG_LEXICON)) {
      expect(terms.length).toBeGreaterThanOrEqual(25);
      expect(new Set(terms).size).toBe(terms.length);
      for (const term of terms) expect(normalizeForMatch(term)).toBe(term);
    }
  });
});
