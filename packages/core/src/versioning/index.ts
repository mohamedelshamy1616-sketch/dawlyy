import { FormDocument, NutritionDocument, ProgramDocument, IsoDateTime } from '../types';
import type { LocalizedText, PublishState } from '../types';

/**
 * Structural equality for JSON documents. Local on purpose: `node:util` would break the browser bundle,
 * and @dawlyy/core runs in the client PWA (diff previews, offline logic) as well as on the server.
 */
function isDeepStrictEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => isDeepStrictEqual(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(key => Object.hasOwn(right, key) && isDeepStrictEqual(left[key], right[key]));
}

export class VersioningError extends Error {
  constructor(public readonly code: 'nothing_to_publish' | 'invalid_versions') {
    super(code);
    this.name = 'VersioningError';
  }
}

export type VersionRecord<D = unknown> = {
  id: string;
  versionNo: number;
  status: PublishState;
  document: D;
  publishedAt?: IsoDateTime;
  changeNote?: string;
};

export type PublishResult<D> = {
  newVersion: { versionNo: number; status: 'published'; document: D; publishedAt: IsoDateTime; changeNote?: string };
  supersededIds: string[];
};

export type DiffKind = 'added' | 'removed' | 'changed';
export type DiffEntry = { path: string; kind: DiffKind; label: LocalizedText; before?: unknown; after?: unknown };
export type DocumentFlavor = 'program' | 'nutrition' | 'form' | 'generic';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateDocument(document: unknown, flavor?: DocumentFlavor): void {
  const inferred = flavor ?? (record(document)
    ? ('phases' in document ? 'program' : 'meals' in document ? 'nutrition' : 'sections' in document ? 'form' : 'generic')
    : 'generic');
  // Validate without normalizing the generic D or inserting defaults into a snapshot/diff.
  if (inferred === 'program') ProgramDocument.parse(document);
  if (inferred === 'nutrition') NutritionDocument.parse(document);
  if (inferred === 'form') FormDocument.parse(document);
}

export function nextVersionNo(versions: Array<{ versionNo: number }>): number {
  const seen = new Set<number>();
  let maximum = 0;
  for (const { versionNo } of versions) {
    if (seen.has(versionNo)) throw new VersioningError('invalid_versions');
    seen.add(versionNo);
    maximum = Math.max(maximum, versionNo);
  }
  return maximum + 1;
}

export function currentPublished<D>(versions: VersionRecord<D>[]): VersionRecord<D> | null {
  nextVersionNo(versions);
  let current: VersionRecord<D> | null = null;
  for (const version of versions) {
    if (version.status === 'published' && (!current || version.versionNo > current.versionNo)) current = version;
  }
  return current;
}

export function publish<D>(versions: VersionRecord<D>[], draft: { document: D; changeNote?: string }, now: IsoDateTime): PublishResult<D> {
  const versionNo = nextVersionNo(versions);
  IsoDateTime.parse(now);
  validateDocument(draft.document);
  for (const version of versions) validateDocument(version.document);
  const current = currentPublished(versions);
  if (current && isDeepStrictEqual(current.document, draft.document)) throw new VersioningError('nothing_to_publish');
  // spec §29: detach the new snapshot from the editable draft; never mutate history.
  return {
    newVersion: { versionNo, status: 'published', document: structuredClone(draft.document), publishedAt: now,
      ...(draft.changeNote === undefined ? {} : { changeNote: draft.changeNote }) },
    supersededIds: versions.filter(v => v.status === 'published').map(v => v.id),
  };
}

const words: Record<string, { ar: string; en: string }> = {
  phases: { ar: 'المراحل', en: 'Phases' }, weeks: { ar: 'الأسابيع', en: 'Weeks' },
  days: { ar: 'الأيام', en: 'Days' }, workout: { ar: 'التمرين', en: 'Workout' },
  blocks: { ar: 'الأقسام', en: 'Blocks' }, items: { ar: 'التمارين', en: 'Items' },
  sets: { ar: 'المجموعات', en: 'Sets' }, reps: { ar: 'العدات', en: 'Reps' },
  load: { ar: 'الوزن', en: 'Load' }, restSec: { ar: 'الراحة', en: 'Rest' },
  meals: { ar: 'الوجبات', en: 'Meals' }, options: { ar: 'البدائل', en: 'Options' },
  supplements: { ar: 'المكملات', en: 'Supplements' }, targets: { ar: 'الأهداف', en: 'Targets' },
  kcal: { ar: 'السعرات', en: 'Calories' }, proteinG: { ar: 'البروتين', en: 'Protein' },
  carbsG: { ar: 'الكارب', en: 'Carbs' }, fatG: { ar: 'الدهون', en: 'Fat' },
  sections: { ar: 'الأقسام', en: 'Sections' }, questions: { ar: 'الأسئلة', en: 'Questions' },
  label: { ar: 'العنوان', en: 'Label' }, required: { ar: 'إجباري', en: 'Required' },
  name: { ar: 'الاسم', en: 'Name' }, title: { ar: 'العنوان', en: 'Title' },
  order: { ar: 'الترتيب', en: 'Order' }, document: { ar: 'الخطة', en: 'Document' },
};

function word(key: string): LocalizedText {
  return Object.hasOwn(words, key) ? words[key]! : { ar: key, en: key };
}

function elementName(value: unknown, fallback: string): LocalizedText {
  if (record(value)) {
    const name = value.name ?? value.label ?? value.title;
    if (typeof name === 'string') return { ar: name, en: name };
    if (record(name)) {
      const ar = typeof name.ar === 'string' && name.ar ? name.ar : undefined;
      const en = typeof name.en === 'string' && name.en ? name.en : undefined;
      if (ar || en) return { ar: ar ?? en, en: en ?? ar };
    }
  }
  return { ar: fallback, en: fallback };
}

function joinLabel(parts: LocalizedText[]): LocalizedText {
  return {
    ar: parts.map(p => p.ar ?? p.en ?? '').join(' / '),
    en: parts.map(p => p.en ?? p.ar ?? '').join(' / '),
  };
}

function idArray(values: unknown[]): values is Array<Record<string, unknown> & { id: string }> {
  return values.every(value => record(value) && typeof value.id === 'string')
    && new Set(values.map(value => (value as { id: string }).id)).size === values.length;
}

export function diffDocuments(before: unknown, after: unknown, opts?: { flavor?: DocumentFlavor }): DiffEntry[] {
  validateDocument(before, opts?.flavor ?? 'generic');
  validateDocument(after, opts?.flavor ?? 'generic');
  const entries: DiffEntry[] = [];
  function emit(path: string, kind: DiffKind, a: unknown, b: unknown, labels: LocalizedText[]): void {
    entries.push({ path, kind, label: joinLabel(labels.length ? labels : [word('document')]),
      ...(kind === 'added' ? {} : { before: structuredClone(a) }),
      ...(kind === 'removed' ? {} : { after: structuredClone(b) }) });
  }
  function visit(a: unknown, b: unknown, path: string, labels: LocalizedText[]): void {
    if (isDeepStrictEqual(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (idArray(a) && idArray(b)) {
        const oldById = new Map(a.map(value => [value.id, value]));
        const newById = new Map(b.map(value => [value.id, value]));
        const oldOrder = a.filter(value => newById.has(value.id)).map(value => value.id);
        const newOrder = b.filter(value => oldById.has(value.id)).map(value => value.id);
        // Insertion/removal alone is not a reorder of surviving elements.
        if (!isDeepStrictEqual(oldOrder, newOrder)) {
          emit(path, 'changed', a.map(value => value.id), b.map(value => value.id), [...labels, word('order')]);
        }
        for (const value of a) {
          const next = newById.get(value.id);
          const child = `${path}[${value.id}]`;
          const childLabels = [...labels, elementName(next ?? value, value.id)];
          if (!next) emit(child, 'removed', value, undefined, childLabels);
          else visit(value, next, child, childLabels);
        }
        for (const value of b) {
          if (!oldById.has(value.id)) emit(`${path}[${value.id}]`, 'added', undefined, value, [...labels, elementName(value, value.id)]);
        }
      } else {
        for (let index = 0; index < Math.max(a.length, b.length); index++) {
          const value: unknown = b[index] ?? a[index];
          // Sets are compared by position, but displayed using the coach's set number.
          const address = (path === 'sets' || path.endsWith('.sets')) && record(value) && typeof value.setNo === 'number' ? value.setNo : index;
          const child = `${path}[${address}]`;
          const childLabels = [...labels, elementName(value, String(address))];
          if (index >= a.length) emit(child, 'added', undefined, b[index], childLabels);
          else if (index >= b.length) emit(child, 'removed', a[index], undefined, childLabels);
          else visit(a[index], b[index], child, childLabels);
        }
      }
    } else if (record(a) && record(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const child = path ? `${path}.${key}` : key;
        const childLabels = [...labels, word(key)];
        if (!Object.hasOwn(a, key)) emit(child, 'added', undefined, b[key], childLabels);
        else if (!Object.hasOwn(b, key)) emit(child, 'removed', a[key], undefined, childLabels);
        else visit(a[key], b[key], child, childLabels);
      }
    } else emit(path, 'changed', a, b, labels);
  }
  visit(before, after, '', []);
  return entries;
}

export function summarizeDiff(entries: DiffEntry[]): { added: number; removed: number; changed: number; paths: string[] } {
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const entry of entries) counts[entry.kind]++;
  return { ...counts, paths: [...new Set(entries.map(entry => entry.path))] };
}
