'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

import { useLocale, useTranslations } from 'next-intl';
import type { ProgramOp } from '@dawlyy/core/program-edit';
import type { LocalizedText, PlannedSet, WorkoutBlock, WorkoutItem } from '@dawlyy/core/types';
import { LOAD_UNITS } from '@dawlyy/core/types';
import { ExercisePicker } from './exercise-picker';
import { useState } from 'react';
import { replaceSetOps } from './set-ops';

type Props = { dayId: string; item: WorkoutItem; block: WorkoutBlock; blocks: WorkoutBlock[]; index: number; name?: LocalizedText; onOp: (op: ProgramOp) => void; onName: (id: string, name: LocalizedText) => void };

/** Task 4: exercise prescriptions are edited exclusively through item/set core operations. */
export function ItemEditor({ dayId, item, block, blocks, index, name, onOp, onName }: Props) {
  const t = useTranslations('programs'); const locale = useLocale(); const lang = locale === 'ar' ? 'ar' : 'en';
  const [pickerOpen, setPickerOpen] = useState(false);
  const title = name?.[lang] || name?.[lang === 'ar' ? 'en' : 'ar'] || t('exercise');
  const move = (toIndex: number) => onOp({ type: 'item.move', dayId, itemId: item.id, toBlockId: block.id, toIndex });
  const patch = (value: Extract<ProgramOp, { type: 'item.update' }>['patch']) => onOp({ type: 'item.update', dayId, itemId: item.id, patch: value });
  return <article className="grid min-w-0 max-w-full gap-4 rounded-xl border bg-background p-3 [overflow-wrap:anywhere]">
    <Heading level={4} className="font-semibold">{title}</Heading>
    <HStack gap={2} wrap="wrap">
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => setPickerOpen(true)} label={t('replaceExercise')} /><Dialog isOpen={pickerOpen} onOpenChange={setPickerOpen} width="var(--container-lg)" maxHeight="85dvh"><VStack gap={4}><DialogHeader title={t('chooseExercise')} /><ExercisePicker onPick={exercise => { onOp({ type: 'item.replaceExercise', dayId, itemId: item.id, exerciseId: exercise.id }); onName(exercise.id, exercise.name); setPickerOpen(false); }} /><Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => setPickerOpen(false)} label={t('close')} /></VStack></Dialog>
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" isDisabled={index === 0} onClick={() => move(index - 1)} aria-label={t('moveExerciseUp', { name: title })} label={t('moveUp')} />
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" isDisabled={index === block.items.length - 1} onClick={() => move(index + 1)} aria-label={t('moveExerciseDown', { name: title })} label={t('moveDown')} />
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => onOp({ type: 'item.duplicate', dayId, itemId: item.id })} label={t('duplicate')} />
      <Button type="button" className="min-h-11 min-w-11" variant="destructive" onClick={() => onOp({ type: 'item.remove', dayId, itemId: item.id })} label={t('remove')} />
    </HStack>
    {blocks.length > 1 ? <VStack className="grid gap-2"><Selector label={t('moveToBlock')} controlClassName="min-h-11" value={block.id} onChange={value => onOp({ type: 'item.move', dayId, itemId: item.id, toBlockId: value, toIndex: 999 })} options={blocks.map((value, i) => ({ value: value.id, label: `${value.name?.[lang] || value.name?.[lang === 'ar' ? 'en' : 'ar'] || t(`blockKinds.${value.kind}`)} ${new Intl.NumberFormat(locale).format(i + 1)}` }))} /></VStack> : null}
    <Grid gap={3} className="min-w-0" role="group" aria-label={t('setTable')}>
      {item.sets.map(set => <SetEditor key={`${item.id}-${set.setNo}`} dayId={dayId} itemId={item.id} sets={item.sets} set={set} canRemove={item.sets.length > 1} onOp={onOp} />)}
    </Grid>
    <Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => onOp({ type: 'set.add', dayId, itemId: item.id, copyLast: true })} label={t('addSet')} />
    <details className="min-w-0 rounded-lg border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('progression')}</summary><Grid gap={3} className="min-w-0 pt-3">
      <VStack className="grid gap-2"><Selector label={t('progressionType')} controlClassName="min-h-11" value={item.progressionRule?.type ?? ''} onChange={value => {
        if (value === '') patch({ progressionRule: null });
        else if (value === 'reps' || value === 'load' || value === 'rpe') patch({ progressionRule: { type: value, threshold: item.progressionRule?.threshold ?? 10, step: item.progressionRule?.step ?? 1 } });
      }} options={[{ value: '', label: t('none') }, ...(['reps', 'load', 'rpe'] as const).map(value => ({ value, label: t(value) }))]} /></VStack>
      {item.progressionRule ? <Grid gap={3} className="min-w-0 grid-cols-2">{(['threshold', 'step'] as const).map(field => <VStack className="grid min-w-0 gap-2" key={field}><DraftNumberInput label={t(field)} step={null} controlClassName="min-h-11" defaultValue={item.progressionRule?.[field]} key={`${field}-${item.progressionRule?.[field]}`} onValueBlur={raw => { const value = Number(raw); if (raw !== '' && Number.isFinite(value) && item.progressionRule) patch({ progressionRule: { ...item.progressionRule, [field]: value } }); }} /></VStack>)}</Grid> : null}
    </Grid></details>
    <Grid gap={2}><DraftTextInput label={t('coachNote')} id={`coach-note-${item.id}`} controlClassName="min-h-11" defaultValue={item.coachNote?.[lang] ?? ''} key={`${item.id}-${item.coachNote?.[lang] ?? ''}`} onValueBlur={value => patch({ coachNote: value.trim() ? { ...item.coachNote, [lang]: value } : null })} /></Grid>
  </article>;
}

function SetEditor({ dayId, itemId, sets, set, canRemove, onOp }: { dayId: string; itemId: string; sets: PlannedSet[]; set: PlannedSet; canRemove: boolean; onOp: (op: ProgramOp) => void }) {
  const t = useTranslations('programs'); const locale = useLocale(); const lang = locale === 'ar' ? 'ar' : 'en';
  const patch = (value: Partial<Omit<PlannedSet, 'setNo'>>) => onOp({ type: 'set.update', dayId, itemId, setNo: set.setNo, patch: value });
  function clear(field: keyof Omit<PlannedSet, 'setNo'>) {
    const prescriptions = sets.map(value => { const next = { ...value }; if (value.setNo === set.setNo) delete next[field]; return next; });
    for (const operation of replaceSetOps(dayId, itemId, sets.length, prescriptions)) onOp(operation);
  }
  return <fieldset className="grid min-w-0 gap-3 rounded-lg border p-3">
    <legend className="ps-1 pe-1 font-medium">{t('setNumber', { number: new Intl.NumberFormat(locale).format(set.setNo) })}</legend>
    <Grid gap={3} className="min-w-0 grid-cols-2 lg:grid-cols-4">
      {(['reps', 'tempo'] as const).map(field => <VStack key={field} className="grid min-w-0 gap-1 text-sm"><DraftTextInput label={t(field)} controlClassName="min-h-11" defaultValue={set[field] ?? ''} key={`${field}-${set[field] ?? ''}`} onValueBlur={value => patch({ [field]: value })} ref={input => { if (input) { input.maxLength = field === 'reps' ? 32 : 16; } }} /></VStack>)}
      <VStack className="grid min-w-0 gap-1 text-sm"><DraftNumberInput label={t('load')} min={0} step={null} controlClassName="min-h-11" key={`load-${set.load?.value}`} defaultValue={set.load?.value ?? ''} onValueBlur={value => { if (value === '') { if (set.load) clear('load'); } else if (Number.isFinite(Number(value))) patch({ load: { value: Number(value), unit: set.load?.unit ?? 'kg' } }); }} /></VStack>
      <VStack className="grid min-w-0 gap-1 text-sm"><Selector label={t('unit')} controlClassName="min-h-11" value={set.load?.unit ?? 'kg'} onChange={value => { const unit = LOAD_UNITS.find(unit => unit === value); if (unit) patch({ load: { value: set.load?.value ?? 0, unit } }); }} options={LOAD_UNITS.map(value => ({ value, label: t(`units.${value}`) }))} /></VStack>
      {(['restSec', 'rpe', 'rir', 'durationSec', 'distanceM'] as const).map(field => <VStack className="grid min-w-0 gap-1 text-sm" key={field}><DraftNumberInput label={t(field)} controlClassName="min-h-11" key={`${field}-${set[field]}`} defaultValue={set[field] ?? ''} min={field === 'rpe' || field === 'durationSec' || field === 'distanceM' ? 1 : 0} max={field === 'rpe' || field === 'rir' ? 10 : undefined} step={field === 'rpe' || field === 'distanceM' ? null : 1} onValueBlur={value => { if (value === '') { if (set[field] !== undefined) clear(field); } else if (Number.isFinite(Number(value))) patch({ [field]: Number(value) }); }} /></VStack>)}
      <VStack className="grid min-w-0 gap-1 text-sm"><DraftTextInput label={t('setNote')} controlClassName="min-h-11" defaultValue={set.note?.[lang] ?? ''} key={`note-${set.note?.[lang] ?? ''}`} onValueBlur={value => { if (value.trim()) patch({ note: { ...set.note, [lang]: value } }); else if (set.note) clear('note'); }} /></VStack>
    </Grid>
    <HStack gap={2} wrap="wrap"><Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => { const { setNo, ...prescription } = set; void setNo; onOp({ type: 'set.applyToAll', dayId, itemId, patch: prescription }); }} label={t('applyAllSets')} /><Button type="button" className="min-h-11 min-w-11" variant="destructive" isDisabled={!canRemove} onClick={() => onOp({ type: 'set.remove', dayId, itemId, setNo: set.setNo })} label={t('removeSet')} /></HStack>
  </fieldset>;
}

/** Keep the existing blur-triggered edit boundary while Astryx owns the field. */
function DraftTextInput({ defaultValue = '', onValueBlur, ...props }: Omit<TextInputProps, 'value' | 'onChange' | 'onBlur'> & { defaultValue?: string; onValueBlur?: (value: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  return <TextInput {...props} value={value} onChange={setValue} onBlur={event => onValueBlur?.((event.currentTarget as HTMLInputElement).value)} />;
}

/** Preserve native number constraints and raw blur edits; NumberInput clamps on blur. */
function DraftNumberInput({ defaultValue = '', min, max, step, onValueBlur, ...props }: Omit<TextInputProps, 'type' | 'value' | 'onChange' | 'onBlur' | 'ref'> & { defaultValue?: number | string; min?: number; max?: number; step?: number | null; onValueBlur: (value: string) => void }) {
  const [value, setValue] = useState(String(defaultValue));
  return <TextInput {...props} value={value} onChange={setValue} onBlur={event => onValueBlur((event.currentTarget as HTMLInputElement).value)} ref={input => {
    if (input) {
      input.type = 'number';
      input.min = min === undefined ? '' : String(min);
      input.max = max === undefined ? '' : String(max);
      input.step = step === null ? 'any' : String(step ?? 1);
    }
  }} />;
}
