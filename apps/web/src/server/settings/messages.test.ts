import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIONS, MODULES } from '@dawlyy/core/authz';
import { LEGAL_SECTIONS } from '../../../components/legal/sections';
import { CONSENT_KINDS } from './constants';

type Tree = { [key: string]: string | Tree };

function load(locale: 'ar' | 'en', namespace: 'settings' | 'legal'): Tree {
  return JSON.parse(readFileSync(new URL(`../../../messages/${locale}/${namespace}.json`, import.meta.url), 'utf8')) as Tree;
}

function keys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => typeof value === 'string' ? [`${prefix}${key}`] : [`${prefix}${key}`, ...keys(value, `${prefix}${key}.`)]);
}

function at(tree: Tree, path: string): string | Tree | undefined {
  return path.split('.').reduce<string | Tree | undefined>((node, part) => (typeof node === 'object' ? node[part] : undefined), tree);
}

describe('Task 11 messages', () => {
  it.each(['settings', 'legal'] as const)('%s holds the same keys in Arabic and English', (namespace) => {
    expect(keys(load('ar', namespace)).sort()).toEqual(keys(load('en', namespace)).sort());
  });

  it('has a non-empty string behind every leaf key in both locales', () => {
    for (const locale of ['ar', 'en'] as const) {
      for (const namespace of ['settings', 'legal'] as const) {
        const tree = load(locale, namespace);
        for (const key of keys(tree)) {
          const value = at(tree, key);
          if (typeof value === 'string') expect(value.trim().length, `${locale}/${namespace}/${key}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('flags every public legal page as a draft and gives each page every clause', () => {
    for (const locale of ['ar', 'en'] as const) {
      const legal = load(locale, 'legal');
      expect(at(legal, 'draftBanner')).toEqual(locale === 'en' ? 'Draft for legal review (Egypt Law 151/2020)' : expect.stringContaining('151'));
      for (const [doc, sections] of Object.entries(LEGAL_SECTIONS)) {
        expect(typeof at(legal, `${doc}.title`)).toBe('string');
        expect(typeof at(legal, `${doc}.intro`)).toBe('string');
        for (const section of sections) {
          expect(typeof at(legal, `${doc}.sections.${section}.title`), `${locale} ${doc} ${section}`).toBe('string');
          expect(typeof at(legal, `${doc}.sections.${section}.body`), `${locale} ${doc} ${section}`).toBe('string');
        }
      }
      const all = JSON.stringify(legal);
      expect(all).toContain('[PLACEHOLDER:');
      if (locale === 'en') {
        for (const needed of ['[PLACEHOLDER: company name', '[PLACEHOLDER: company address', '[PLACEHOLDER: retention period', '[PLACEHOLDER: name and email of the data protection contact']) {
          expect(all).toContain(needed);
        }
      }
    }
  });

  it('names every module, action and consent kind that the screens render', () => {
    for (const locale of ['ar', 'en'] as const) {
      const settings = load(locale, 'settings');
      for (const mod of MODULES) expect(typeof at(settings, `permissions.modules.${mod}`), `${locale} module ${mod}`).toBe('string');
      for (const action of ACTIONS) expect(typeof at(settings, `permissions.actions.${action}`), `${locale} action ${action}`).toBe('string');
      for (const kind of CONSENT_KINDS) {
        expect(typeof at(settings, `consent.kinds.${kind}.title`), `${locale} consent ${kind}`).toBe('string');
        expect(typeof at(settings, `legal.kinds.${kind}`), `${locale} record ${kind}`).toBe('string');
      }
    }
  });
});
