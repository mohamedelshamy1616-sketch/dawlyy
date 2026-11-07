import { describe, it, expect } from 'vitest';
import {
  foldArabic, searchKey, tokens, matchesQuery, matchScore, sameName,
  digitsOnly, normalizePhone, normalizeEmail, parseClientCode, slugify,
} from '../src/text';

describe('Arabic folding and search', () => {
  it.each([
    ['أحمد', 'احمد'], ['مروة', 'مروه'], ['مصطفى', 'مصطفي'], ['إسلام', 'اسلام'],
    ['آدم', 'ادم'], ['ٱحمد', 'احمد'], ['محـــمد', 'محمد'], ['مُحَمَّد', 'محمد'],
    ['رؤوف', 'رووف'], ['رائد', 'رايد'], ['ء', 'ء'], ['٠١٠٢٣', '01023'],
    ['۰۱۲۳۴۵۶۷۸۹', '0123456789'], ['a\u0670\u06d6\u06edb', 'ab'], ['Ahmed', 'Ahmed'],
  ])('folds %s to %s', (input, output) => {
    expect(foldArabic(input)).toBe(output);
  });

  it('normalizes compatibility characters, punctuation, symbols and whitespace', () => {
    expect(searchKey('  Ahmed   ALI! ')).toBe('ahmed ali');
    expect(searchKey('ＡＨＭＥＤ + عَلِيّ\t💪')).toBe('ahmed علي');
    expect(tokens('DW-٠٠٠١٢٣')).toEqual(['dw', '000123']);
    expect(tokens('   ! ')).toEqual([]);
  });

  it.each([
    [['أحمد علي', 'DW-000123'], 'احمد', true],
    [['Mohamed Salah'], 'moh sal', true], [['Mohamed'], 'ham', true],
    [['Mohamed'], 'ha', false], [['Mohamed', 'Salah'], 'sal moh', true],
    [[null, undefined, 'مُحَمَّد'], 'محمد', true], [['Ali'], 'moh', false],
    [[], ' ', true], [[], '', true], [['Franco 7amada'], '7am', true],
  ] as const)('matches fields %j with %s', (fields, query, expected) => {
    expect(matchesQuery(fields, query)).toBe(expected);
  });

  it('ranks exact, starts-with, token prefixes, substring and no match', () => {
    expect(matchScore(['Mohamed'], 'mohamed')).toBe(100);
    expect(matchScore(['Mohamed Salah'], 'mohamed')).toBe(60);
    expect(matchScore(['Mohamed Salah'], 'moh sal')).toBe(40);
    expect(matchScore(['Mohamed'], 'ham')).toBe(20);
    expect(matchScore(['Mohamed'], 'ha')).toBe(0);
    expect(matchScore(['Mohamed', 'Salah'], 'moh sal')).toBe(40);
    expect(matchScore([undefined, 'عَلِيّ'], 'علي')).toBe(100);
    expect(matchScore(['Mohamed'], '')).toBe(0);
  });

  it('compares localized names without equating absent names', () => {
    expect(sameName({ ar: 'محمد' }, 'مُحَمَّد')).toBe(true);
    expect(sameName({ ar: 'احمد', en: 'Ahmed' }, { en: 'AHMED' })).toBe(true);
    expect(sameName({ ar: 'Ahmed' }, { en: 'ahmed' })).toBe(true);
    expect(sameName({ ar: 'احمد', en: 'Ali' }, { ar: 'علي', en: 'احمد' })).toBe(false);
    expect(sameName({ ar: ' ', en: 'Ahmed' }, { ar: 'ahmed' })).toBe(true);
    expect(sameName('', {})).toBe(false);
    expect(sameName('!', '?')).toBe(false);
  });
});

describe('contact and identity normalization', () => {
  it('extracts both Arabic digit sets', () => {
    expect(digitsOnly('+٢٠ (۱۰) 123-45678')).toBe('201012345678');
  });

  it.each([
    '01012345678', '1012345678', '+201012345678', '00201012345678',
    '0020 10 1234 5678', '٠١٠١٢٣٤٥٦٧٨', '۰۱۰۱۲۳۴۵۶۷۸', '(010) 1234-5678',
  ])('normalizes Egyptian mobile %s', (input) => {
    expect(normalizePhone(input, { defaultCountry: 'EG' })).toBe('+201012345678');
  });

  it.each(['011', '012', '015'])('accepts mobile prefix %s', (prefix) => {
    expect(normalizePhone(`${prefix}12345678`)).toBe(`+2${prefix}12345678`);
  });

  it('accepts explicit international numbers and rejects malformed input', () => {
    expect(normalizePhone('+966501234567')).toBe('+966501234567');
    expect(normalizePhone('00966501234567')).toBe('+966501234567');
    expect(normalizePhone('+12345678')).toBe('+12345678');
    expect(normalizePhone('+123456789012345')).toBe('+123456789012345');
    for (const value of ['0101234', '0223456789', '01312345678', '+1234567',
      '+1234567890123456', 'call 01012345678', '++201012345678', '010+12345678', '']) {
      expect(normalizePhone(value)).toBeNull();
    }
  });

  it('normalizes simple emails and rejects missing or repeated parts', () => {
    expect(normalizeEmail(' Coach.Name+gym@Example.COM ')).toBe('coach.name+gym@example.com');
    for (const value of ['a b@example.com', 'a@@example.com', 'a@example', '@example.com',
      'a@.com', 'a@example.', 'a@example..com', '']) expect(normalizeEmail(value)).toBeNull();
  });

  it('canonicalizes client codes while preserving long identifiers', () => {
    expect(parseClientCode('dw 123')).toBe('DW-000123');
    expect(parseClientCode('DW-000123')).toBe('DW-000123');
    expect(parseClientCode('dw000123')).toBe('DW-000123');
    expect(parseClientCode('dw-١٢٣')).toBe('DW-000123');
    expect(parseClientCode('abc1234567')).toBe('ABC-1234567');
    for (const value of ['ahmed', '123', 'DW-12-3', 'DW 1 hi']) expect(parseClientCode(value)).toBeNull();
  });

  it('drops invisible bidi and zero-width characters pasted from RTL screens', () => {
    expect(foldArabic('‏أحمد‎')).toBe('احمد');
    expect(searchKey('⁧محمد⁩ ‍علي')).toBe('محمد علي');
    expect(matchesQuery(['محمد علي'], '‏محمد')).toBe(true);
    expect(sameName({ ar: 'محمد‌' }, 'محمد')).toBe(true);
    expect(parseClientCode('‪DW-000123‬')).toBe('DW-000123');
    expect(normalizeEmail('‎coach@example.com‏')).toBe('coach@example.com');
  });

  it.each([
    '‪+20 10 1234 5678‬', '⁨+201012345678⁩', '201012345678', '20 10 1234 5678',
    '+20 010 1234 5678', '0020 010 1234 5678', '(+20) 10 1234 5678',
  ])('normalizes the pasted or exported Egyptian form %j', (input) => {
    expect(normalizePhone(input)).toBe('+201012345678');
  });

  it('validates +20 numbers as Egyptian and still rejects non-numbers', () => {
    expect(normalizePhone('+20 2 2345 6789')).toBe('+20223456789');
    expect(normalizePhone('+20 3 555 1234')).toBe('+2035551234');
    for (const value of ['2010123456789', '20223456789', '+(20)1012345678x', '+20 01312345678', '+2010123456789']) {
      expect(normalizePhone(value)).toBeNull();
    }
  });

  it('makes ASCII slugs without transliterating Arabic', () => {
    expect(slugify('Barbell Back Squat (High Bar)')).toBe('barbell-back-squat-high-bar');
    expect(slugify('سكوات')).toBe('');
    expect(slugify('  Café -- Press ٢ ')).toBe('cafe-press-2');
  });
});
