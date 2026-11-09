import { describe, expect, it } from 'vitest';
import { suggestMapping, toCsv } from '@dawlyy/core/csv';
import { previewImport } from './import';
import { allowedVideoUrl, exercisePatch } from './validation';

describe('Task 4 exercise import', () => {
  it('maps English and Arabic headers', () => {
    expect(suggestMapping(['Exercise name', 'Category', 'Difficulty'])).toEqual({ name_en: 0, category: 1, difficulty: 2 });
    expect(suggestMapping(['اسم التمرين', 'القسم', 'المستوى'])).toEqual({ name_ar: 0, category: 1, difficulty: 2 });
  });
  it('allows only HTTPS video hosts and the configured storage origin', () => {
    for (const url of ['https://youtu.be/abc', 'https://www.youtube.com/watch?v=abc', 'https://player.vimeo.com/video/1']) expect(allowedVideoUrl(url)).toBe(true);
    for (const url of ['http://youtu.be/abc', 'javascript:alert(1)', 'data:text/plain,a', 'https://youtube.com.evil.test/a', 'https://youtube.com@evil.test/a', 'https://evil.test/a']) expect(allowedVideoUrl(url)).toBe(false);
    expect(allowedVideoUrl('https://storage.test/storage/v1/object/sign/tenant-assets/a', 'https://storage.test')).toBe(true);
    expect(allowedVideoUrl('https://storage.test/other', 'https://storage.test')).toBe(false);
  });
  it('detects Arabic-folded duplicates in the visible library and earlier file rows', () => {
    const csv = toCsv(['name_ar', 'category', 'difficulty'], [['إطالة', 'mobility', 'beginner'], ['اطاله', 'mobility', 'beginner']]);
    expect(previewImport(csv, undefined, []).rows.map((row) => row.status)).toEqual(['ok', 'duplicate']);
    expect(previewImport(csv, undefined, [{ name: { ar: 'اطالة' } }]).rows.map((row) => row.status)).toEqual(['duplicate', 'duplicate']);
  });
  it('reports invalid rows and unsafe URLs without accepting them', () => {
    const csv = toCsv(['name_en', 'category', 'difficulty', 'video_url'], [['', 'legs', 'beginner', ''], ['Squat', 'legs', 'bad', ''], ['Press', 'chest', 'beginner', 'http://youtube.com/watch?v=a']]);
    const result = previewImport(csv, undefined, []);
    expect(result.counts.error).toBe(3);
    expect(result.rows.every((row) => row.errors.length > 0 && !row.normalized)).toBe(true);
  });
  it('reports missing mappings and malformed CSV', () => {
    expect(previewImport('name_en\nSquat', undefined, []).missingRequiredMappings).toEqual(['category', 'difficulty']);
    expect(() => previewImport('name_en\n"broken', undefined, [])).toThrow();
  });
  it('keeps PATCH defaults out of omitted fields', () => {
    expect(exercisePatch.parse({ name: { en: 'New name' } })).toEqual({ name: { en: 'New name' } });
  });
  it('rejects a file over 2,000 rows', () => {
    const csv = toCsv(['name_en', 'category', 'difficulty'], Array.from({ length: 2001 }, (_, index) => [`Exercise ${index}`, 'legs', 'beginner']));
    expect(() => previewImport(csv, undefined, [])).toThrowError(expect.objectContaining({ code: 'import_too_large' }));
  });
});
