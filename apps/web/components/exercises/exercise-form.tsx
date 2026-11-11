'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput';
import { TextArea, type TextAreaProps } from '@astryxdesign/core/TextArea';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { DIFFICULTIES, MOVEMENT_PATTERNS, PLANES, type LocalizedText } from '@dawlyy/core/types';
import { useRouter } from '@/i18n/navigation';
import { exerciseInput } from '@/src/server/exercises/validation';
import type { getExercise } from '@/src/server/exercises/service';
import { exerciseRequest } from './http';

type Detail = Awaited<ReturnType<typeof getExercise>>;
const listFields = ['aliases', 'primaryMuscles', 'secondaryMuscles', 'equipment', 'progressions', 'regressions', 'alternatives', 'tags'] as const;
const rowFields = ['cues', 'commonMistakes', 'contraindications'] as const;

/** Task 4: shared localized create/edit form and read-only system detail. */
export function ExerciseForm({ exercise, canEdit, canCreate }: { exercise?: Detail; canEdit: boolean; canCreate: boolean }) {
  const t = useTranslations('exercises');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selections, setSelections] = useState({ movementPattern: exercise?.movementPattern ?? 'other', difficulty: exercise?.difficulty ?? 'beginner', plane: exercise?.plane ?? 'sagittal' });
  const [unilateral, setUnilateral] = useState(exercise?.unilateral ?? false);
  const [compound, setCompound] = useState(exercise?.compound ?? true);
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
  return <VStack gap={5} className="min-w-0 max-w-full">
    <HStack gap={2} wrap="wrap"><Button variant="secondary" className="min-h-11 min-w-11" href="/coach/exercises" label={t('back')} />
      {exercise && !exercise.editable && canEdit && canCreate ? <Button className="min-h-11 min-w-11" isDisabled={busy} onClick={() => action('customise')} label={t('customise')} /> : null}
      {exercise && canEdit ? <Button className="min-h-11 min-w-11" variant="secondary" isDisabled={busy} onClick={() => action(hidden ? 'unhide' : 'hide')} label={hidden ? t('unhide') : t('hide')} /> : null}
    </HStack>
    {exercise && !exercise.editable ? <Text as="p" className="rounded-lg bg-brand-soft p-4">{t('systemReadonly')}</Text> : null}
    {hidden ? <Text as="p">{t('hidden')}</Text> : null}
    {exercise?.thumbnailUrl ? <Image src={exercise.thumbnailUrl} unoptimized width={640} height={360} alt="" className="max-w-full rounded-xl object-cover" /> : null}
    {error ? <Text as="p" role="alert">{error}</Text> : null}
    <form onSubmit={save} className="flex min-w-0 flex-col gap-5">
      <fieldset disabled={!writable || busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-3 font-semibold">{t('details')}</legend>
        <VStack><DraftTextInput label={t('fields.name_ar')} dir="rtl" htmlName="name_ar" defaultValue={exercise?.name.ar} controlClassName="min-h-11" ref={input => { if (input) { input.maxLength = 200; input.lang = 'ar'; } }} /></VStack>
        <VStack><DraftTextInput label={t('fields.name_en')} dir="ltr" htmlName="name_en" defaultValue={exercise?.name.en} controlClassName="min-h-11" ref={input => { if (input) { input.maxLength = 200; input.lang = 'en'; } }} /></VStack>
        <VStack><DraftTextInput label={t('category')} htmlName="category" isRequired defaultValue={exercise?.category} controlClassName="min-h-11" ref={input => { if (input) { input.maxLength = 200; input.required = true; } }} /></VStack>
        <VStack><Selector label={t('pattern')} htmlName="movementPattern" isDisabled={!writable || busy} controlClassName="min-h-11" value={selections.movementPattern} onChange={value => { const selection = MOVEMENT_PATTERNS.find(option => option === value); if (selection) setSelections(previous => ({ ...previous, movementPattern: selection })); }} options={MOVEMENT_PATTERNS.map(value => ({ value, label: t(`patterns.${value}`) }))} /></VStack>
        <VStack><Selector label={t('difficulty')} htmlName="difficulty" isDisabled={!writable || busy} controlClassName="min-h-11" value={selections.difficulty} onChange={value => { const selection = DIFFICULTIES.find(option => option === value); if (selection) setSelections(previous => ({ ...previous, difficulty: selection })); }} options={DIFFICULTIES.map(value => ({ value, label: t(`difficulties.${value}`) }))} /></VStack>
        <VStack><Selector label={t('plane')} htmlName="plane" isDisabled={!writable || busy} controlClassName="min-h-11" value={selections.plane} onChange={value => { const selection = PLANES.find(option => option === value); if (selection) setSelections(previous => ({ ...previous, plane: selection })); }} options={PLANES.map(value => ({ value, label: t(`planes.${value}`) }))} /></VStack>
        {listFields.map((field) => <VStack key={field} className="min-w-0"><DraftTextArea label={t(`form.${field}`)} htmlName={field} defaultValue={exercise?.[field].join(' | ')} controlClassName="min-h-20" /><Text className="text-xs text-muted-foreground">{t('listHelp')}</Text></VStack>)}
        <CheckboxInput className="min-h-11" label={t('form.unilateral')} htmlName="unilateral" value={unilateral} onChange={setUnilateral} isDisabled={!writable || busy} />
        <CheckboxInput className="min-h-11" label={t('form.compound')} htmlName="compound" value={compound} onChange={setCompound} isDisabled={!writable || busy} />
        <VStack className="min-w-0"><DraftTextInput label={t('form.videoUrl')} type="url" htmlName="videoUrl" defaultValue={exercise?.videoUrl ?? ''} controlClassName="min-h-11" /><Text className="text-xs text-muted-foreground">{t('videoHelp')}</Text></VStack>
        <VStack className="min-w-0"><DraftTextInput label={t('form.thumbnailMediaId')} htmlName="thumbnailMediaId" defaultValue={exercise?.thumbnailMediaId ?? ''} controlClassName="min-h-11" /><Text className="text-xs text-muted-foreground">{t('thumbnailHelp')}</Text></VStack>
      </fieldset>
      {exercise?.videoUrl ? <a href={exercise.videoUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center underline">{t('watchVideo')}</a> : null}
      {rowFields.map((field) => <fieldset key={field} disabled={!writable || busy} className="flex min-w-0 flex-col gap-3 rounded-xl border p-4"><legend className="ps-2 pe-2 font-semibold">{t(`form.${field}`)}</legend>
        {rows[field].length === 0 ? <Text as="p" className="text-muted-foreground">{t('noNotes')}</Text> : null}
        {rows[field].map((row, index) => <Grid gap={2} key={index} className="min-w-0 sm:grid-cols-2">
          <VStack><TextArea label={t('languages.ar')} dir="rtl" ref={input => { if (input) input.lang = 'ar'; }} value={row.ar ?? ''} maxLength={200} onChange={value => rowChange(field, index, 'ar', value)} controlClassName="min-h-11" /></VStack>
          <VStack><TextArea label={t('languages.en')} dir="ltr" ref={input => { if (input) input.lang = 'en'; }} value={row.en ?? ''} maxLength={200} onChange={value => rowChange(field, index, 'en', value)} controlClassName="min-h-11" /></VStack>
          {writable ? <Button type="button" variant="secondary" className="min-h-11 min-w-11" onClick={() => setRows((previous) => ({ ...previous, [field]: previous[field].filter((_, position) => position !== index) }))} label={t('removeRow')} /> : null}
        </Grid>)}
        {writable ? <Button type="button" variant="secondary" className="min-h-11 min-w-11" onClick={() => setRows((previous) => ({ ...previous, [field]: [...previous[field], {}] }))} label={t('addRow')} /> : null}
      </fieldset>)}
      {writable ? <Button type="submit" className="min-h-11 min-w-11" isDisabled={busy} label={busy ? t('saving') : t('save')} /> : null}
    </form>
  </VStack>;
}

/** Keep the existing blur-triggered edit boundary while Astryx owns the field. */
function DraftTextInput({ defaultValue = '', onValueBlur, ...props }: Omit<TextInputProps, 'value' | 'onChange' | 'onBlur'> & { defaultValue?: string; onValueBlur?: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  return <TextInput {...props} value={value} onChange={setValue} onBlur={event => onValueBlur?.((event.currentTarget as HTMLInputElement).value)} />;
}

/** Retain form-backed initial text while Astryx uses a controlled value. */
function DraftTextArea({ defaultValue = '', ...props }: Omit<TextAreaProps, 'value' | 'onChange'> & { defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  return <TextArea {...props} value={value} onChange={setValue} />;
}
