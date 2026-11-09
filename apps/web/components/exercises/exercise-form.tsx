'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { DIFFICULTIES, MOVEMENT_PATTERNS, PLANES, type LocalizedText } from '@dawlyy/core/types';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Link, useRouter } from '@/i18n/navigation';
import { exerciseInput } from '@/src/server/exercises/validation';
import type { getExercise } from '@/src/server/exercises/service';
import { exerciseRequest } from './http';

type Detail = Awaited<ReturnType<typeof getExercise>>;
const listFields = ['aliases', 'primaryMuscles', 'secondaryMuscles', 'equipment', 'progressions', 'regressions', 'alternatives', 'tags'] as const;
const rowFields = ['cues', 'commonMistakes', 'contraindications'] as const;
const selectStyle = 'min-h-11 w-full min-w-0 rounded-lg border bg-background ps-3 pe-3';

/** Task 4: shared localized create/edit form and read-only system detail. */
export function ExerciseForm({ exercise, canEdit, canCreate }: { exercise?: Detail; canEdit: boolean; canCreate: boolean }) {
  const t = useTranslations('exercises');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(exercise?.hidden ?? false);
  const [rows, setRows] = useState<Record<(typeof rowFields)[number], LocalizedText[]>>({ cues: exercise?.cues ?? [], commonMistakes: exercise?.commonMistakes ?? [], contraindications: exercise?.contraindications ?? [] });
  const request = useRef<{ body: string; key: string } | null>(null);
  const writable = exercise ? exercise.editable && canEdit : canCreate;
  function rowChange(field: (typeof rowFields)[number], index: number, locale: 'ar' | 'en', value: string) {
    setRows((previous) => ({ ...previous, [field]: previous[field].map((row, position) => position === index ? { ...row, [locale]: value } : row) }));
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    const text = (field: string) => String(data.get(field) ?? '').trim();
    const input = {
      name: { ar: text('name_ar') || undefined, en: text('name_en') || undefined },
      category: text('category'), movementPattern: text('movementPattern'), difficulty: text('difficulty'), plane: text('plane'),
      unilateral: data.has('unilateral'), compound: data.has('compound'),
      ...Object.fromEntries(listFields.map((field) => [field, text(field).split(/[|\n]/u).map((value) => value.trim()).filter(Boolean)])),
      ...Object.fromEntries(rowFields.map((field) => [field, rows[field].filter((row) => row.ar?.trim() || row.en?.trim())])),
      videoUrl: text('videoUrl') || null, thumbnailMediaId: text('thumbnailMediaId') || null,
    };
    const parsed = exerciseInput.safeParse(input);
    if (!parsed.success) { setError(t('errors.validation')); return; }
    const serialized = JSON.stringify(parsed.data);
    const previous = request.current;
    const requestKey = previous && previous.body === serialized ? previous.key : crypto.randomUUID();
    request.current = { body: serialized, key: requestKey };
    setBusy(true);
    try {
      const saved = await exerciseRequest<{ id: string }>(exercise ? `/${exercise.id}` : '', { method: exercise ? 'PATCH' : 'POST', body: parsed.data, key: requestKey });
      router.push(`/coach/exercises/${saved.id}`); router.refresh();
    } catch { setError(t('errors.request')); } finally { setBusy(false); }
  }
  const actionKeys = useRef<Partial<Record<'customise' | 'hide' | 'unhide', string>>>({});
  async function action(operation: 'customise' | 'hide' | 'unhide') {
    if (!exercise) return;
    setBusy(true); setError('');
    const key = actionKeys.current[operation] ?? crypto.randomUUID();
    actionKeys.current[operation] = key;
    try {
      const result = await exerciseRequest<{ id: string }>(`/${exercise.id}/${operation}`, { method: 'POST', key });
      // A successful toggle must get a fresh key when the same operation is used again.
      delete actionKeys.current[operation];
      if (operation === 'customise') router.push(`/coach/exercises/${result.id}`);
      else setHidden(operation === 'hide');
      router.refresh();
    } catch { setError(t('errors.request')); } finally { setBusy(false); }
  }
  return <div className="flex min-w-0 max-w-full flex-col gap-5">
    <div className="flex flex-wrap gap-2"><Button asChild variant="outline" className="min-h-11"><Link href="/coach/exercises">{t('back')}</Link></Button>
      {exercise && !exercise.editable && canEdit && canCreate ? <Button className="min-h-11" disabled={busy} onClick={() => action('customise')}>{t('customise')}</Button> : null}
      {exercise && canEdit ? <Button className="min-h-11" variant="outline" disabled={busy} onClick={() => action(hidden ? 'unhide' : 'hide')}>{hidden ? t('unhide') : t('hide')}</Button> : null}
    </div>
    {exercise && !exercise.editable ? <p className="rounded-lg bg-brand-soft p-4">{t('systemReadonly')}</p> : null}
    {hidden ? <p>{t('hidden')}</p> : null}
    {exercise?.thumbnailUrl ? <Image src={exercise.thumbnailUrl} unoptimized width={640} height={360} alt="" className="max-w-full rounded-xl object-cover" /> : null}
    {error ? <p role="alert">{error}</p> : null}
    <form onSubmit={save} className="flex min-w-0 flex-col gap-5">
      <fieldset disabled={!writable || busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">{t('details')}</legend>
        <label>{t('fields.name_ar')}<Input dir="rtl" lang="ar" name="name_ar" maxLength={200} defaultValue={exercise?.name.ar} className="min-h-11" /></label>
        <label>{t('fields.name_en')}<Input dir="ltr" lang="en" name="name_en" maxLength={200} defaultValue={exercise?.name.en} className="min-h-11" /></label>
        <label>{t('category')}<Input name="category" required maxLength={200} defaultValue={exercise?.category} className="min-h-11" /></label>
        <label>{t('pattern')}<select name="movementPattern" defaultValue={exercise?.movementPattern ?? 'other'} className={selectStyle}>{MOVEMENT_PATTERNS.map((value) => <option key={value} value={value}>{t(`patterns.${value}`)}</option>)}</select></label>
        <label>{t('difficulty')}<select name="difficulty" defaultValue={exercise?.difficulty ?? 'beginner'} className={selectStyle}>{DIFFICULTIES.map((value) => <option key={value} value={value}>{t(`difficulties.${value}`)}</option>)}</select></label>
        <label>{t('plane')}<select name="plane" defaultValue={exercise?.plane ?? 'sagittal'} className={selectStyle}>{PLANES.map((value) => <option key={value} value={value}>{t(`planes.${value}`)}</option>)}</select></label>
        {listFields.map((field) => <label key={field} className="min-w-0">{t(`form.${field}`)}<Textarea name={field} defaultValue={exercise?.[field].join(' | ')} className="min-h-20" /><span className="text-xs text-muted-foreground">{t('listHelp')}</span></label>)}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="unilateral" defaultChecked={exercise?.unilateral ?? false} />{t('form.unilateral')}</label>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="compound" defaultChecked={exercise?.compound ?? true} />{t('form.compound')}</label>
        <label className="min-w-0">{t('form.videoUrl')}<Input type="url" name="videoUrl" defaultValue={exercise?.videoUrl ?? ''} className="min-h-11" /><span className="text-xs text-muted-foreground">{t('videoHelp')}</span></label>
        <label className="min-w-0">{t('form.thumbnailMediaId')}<Input name="thumbnailMediaId" defaultValue={exercise?.thumbnailMediaId ?? ''} className="min-h-11" /><span className="text-xs text-muted-foreground">{t('thumbnailHelp')}</span></label>
      </fieldset>
      {exercise?.videoUrl ? <a href={exercise.videoUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center underline">{t('watchVideo')}</a> : null}
      {rowFields.map((field) => <fieldset key={field} disabled={!writable || busy} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4"><legend className="ps-2 pe-2 font-semibold">{t(`form.${field}`)}</legend>
        {rows[field].length === 0 ? <p className="text-muted-foreground">{t('noNotes')}</p> : null}
        {rows[field].map((row, index) => <div key={index} className="grid min-w-0 gap-2 sm:grid-cols-2">
          <label>{t('languages.ar')}<Textarea dir="rtl" lang="ar" value={row.ar ?? ''} maxLength={200} onChange={(event) => rowChange(field, index, 'ar', event.target.value)} /></label>
          <label>{t('languages.en')}<Textarea dir="ltr" lang="en" value={row.en ?? ''} maxLength={200} onChange={(event) => rowChange(field, index, 'en', event.target.value)} /></label>
          {writable ? <Button type="button" variant="outline" className="min-h-11" onClick={() => setRows((previous) => ({ ...previous, [field]: previous[field].filter((_, position) => position !== index) }))}>{t('removeRow')}</Button> : null}
        </div>)}
        {writable ? <Button type="button" variant="outline" className="min-h-11" onClick={() => setRows((previous) => ({ ...previous, [field]: [...previous[field], {}] }))}>{t('addRow')}</Button> : null}
      </fieldset>)}
      {writable ? <Button type="submit" className="min-h-11" disabled={busy}>{busy ? t('saving') : t('save')}</Button> : null}
    </form>
  </div>;
}
