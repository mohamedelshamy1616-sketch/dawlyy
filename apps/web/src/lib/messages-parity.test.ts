import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', 'messages');
const files = readdirSync(join(root, 'en')).filter(name => name.endsWith('.json'));

/**
 * Genuine brand and standard terms that Arabic readers see in Latin letters on purpose. Keep this short:
 * every entry is a value (compared after trimming) that may be identical in ar and en.
 */
const ALLOWED = new Set<string>([
  'DAWLYY', // product name
  'RPE', // rate of perceived exertion, used as is by coaches
  'InBody', // body-composition device brand
  'WhatsApp', // third-party brand
  'Instagram', // third-party brand
  'Google', // third-party brand
  'Apple', // third-party brand
  'PDF', // file format
  'CSV', // file format
  'RIR', // reps in reserve, used as is by coaches
  'BMI', // body mass index, used as is
  'EGP', // ISO currency code
  'USD', // ISO currency code
  'UTC', // time-zone name
  'English', // language name shown in its own language, as language pickers do
]);

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === 'string') out[prefix] = value;
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  return out;
}
const load = (locale: string, file: string) => flatten(JSON.parse(readFileSync(join(root, locale, file), 'utf8')));

/** A value is "only Latin" when, after removing ICU placeholders and punctuation, it still has Latin letters. */
const hasLatinWords = (value: string) => /[A-Za-z]{2,}/.test(value.replace(/\{[^}]*\}/g, ''));

describe('messages ar/en parity', () => {
  it('has the same namespace files in ar and en', () => {
    expect(readdirSync(join(root, 'ar')).filter(name => name.endsWith('.json')).sort()).toEqual([...files].sort());
  });
  it.each(files)('%s: every en key exists in ar and no extra ar keys', (file) => {
    const en = Object.keys(load('en', file)); const ar = Object.keys(load('ar', file));
    expect(en.filter(key => !ar.includes(key)), `keys missing in ar/${file}`).toEqual([]);
    expect(ar.filter(key => !en.includes(key)), `keys only in ar/${file}`).toEqual([]);
  });
  it.each(files)('%s: no ar value is the same Latin-letter text as en', (file) => {
    const en = load('en', file); const ar = load('ar', file);
    const same = Object.keys(en).filter(key => ar[key] !== undefined && ar[key] === en[key] && hasLatinWords(en[key] ?? '') && !ALLOWED.has((en[key] ?? '').trim()));
    expect(same.map(key => `${key} = ${en[key]}`), `ar/${file} repeats English`).toEqual([]);
  });
});
