'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

import { useLocale, useTranslations } from 'next-intl';
import type { ProgramOp } from '@dawlyy/core/program-edit';
import type { LocalizedText, PlannedSet, WorkoutBlock, WorkoutItem } from '@dawlyy/core/types';
import { LOAD_UNITS } from '@dawlyy/core/types';
import { ChevronDown } from 'lucide-react';
import { formatNumber, numberLocale } from '@/src/lib/numbers';
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
  const summary = setSummary(item.sets, t, numberLocale(locale));
  return <details className="group min-w-0 max-w-full rounded-xl border bg-background [overflow-wrap:anywhere]">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
      <span className="grid min-w-0 flex-1 gap-1"><Text className="font-semibold">{title}</Text><Text className="text-sm text-muted-foreground">{summary}</Text></span>
      <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
    </summary>
    <div className="grid min-w-0 gap-4 border-t p-3">
    <HStack gap={2} wrap="wrap">
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => setPickerOpen(true)} label={t('replaceExercise')} /><Dialog isOpen={pickerOpen} onOpenChange={setPickerOpen} width="var(--container-lg)" maxHeight="85dvh"><VStack gap={4}><DialogHeader title={t('chooseExercise')} /><ExercisePicker onPick={exercise => { onOp({ type: 'item.replaceExercise', dayId, itemId: item.id, exerciseId: exercise.id }); onName(exercise.id, exercise.name); setPickerOpen(false); }} /><Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => setPickerOpen(false)} label={t('close')} /></VStack></Dialog>
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" isDisabled={index === 0} onClick={() => move(index - 1)} aria-label={t('moveExerciseUp', { name: title })} label={t('moveUp')} />
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" isDisabled={index === block.items.length - 1} onClick={() => move(index + 1)} aria-label={t('moveExerciseDown', { name: title })} label={t('moveDown')} />
      <Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => onOp({ type: 'item.duplicate', dayId, itemId: item.id })} label={t('duplicate')} />
      <Button type="button" className="min-h-11 min-w-11" variant="destructive" onClick={() => onOp({ type: 'item.remove', dayId, itemId: item.id })} label={t('remove')} />
    </HStack>
    {blocks.length > 1 ? <VStack className="grid gap-2"><Selector label={t('moveToBlock')} controlClassName="min-h-11" value={block.id} onChange={value => onOp({ type: 'item.move', dayId, itemId: item.id, toBlockId: value, toIndex: 999 })} options={blocks.map((value, i) => ({ value: value.id, label: `${value.name?.[lang] || value.name?.[lang === 'ar' ? 'en' : 'ar'] || t(`blockKinds.${value.kind}`)} ${new Intl.NumberFormat(locale).format(i + 1)}` }))} /></VStack> : null}
    <Grid gap={2} className="min-w-0" role="group" aria-label={t('setTable')}>
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
    </div>
  </details>;
}

function SetEditor({ dayId, itemId, sets, set, canRemove, onOp }: { dayId: string; itemId: string; sets: PlannedSet[]; set: PlannedSet; canRemove: boolean; onOp: (op: ProgramOp) => void }) {
  const t = useTranslations('programs'); const locale = useLocale(); const lang = locale === 'ar' ? 'ar' : 'en';
  const patch = (value: Partial<Omit<PlannedSet, 'setNo'>>) => onOp({ type: 'set.update', dayId, itemId, setNo: set.setNo, patch: value });
  function clear(field: keyof Omit<PlannedSet, 'setNo'>) {
    const prescriptions = sets.map(value => { const next = { ...value }; if (value.setNo === set.setNo) delete next[field]; return next; });
    for (const operation of replaceSetOps(dayId, itemId, sets.length, prescriptions)) onOp(operation);
  }
  const o = { locale: numberLocale(locale) };
  return <div role="group" aria-label={t('setNumber', { number: formatNumber(set.setNo, o) })} className="grid min-w-0 gap-1 rounded-lg border p-2">
    <div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 lg:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <Text className="flex min-h-11 items-center justify-center text-sm font-medium text-muted-foreground">{formatNumber(set.setNo, o)}</Text>
      <DraftTextInput label={t('reps')} controlClassName="min-h-11" defaultValue={set.reps ?? ''} key={`reps-${set.reps ?? ''}`} onValueBlur={value => patch({ reps: value })} ref={input => { if (input) input.maxLength = 32; }} />
      <DraftNumberInput label={t('load')} min={0} step={null} controlClassName="min-h-11" key={`load-${set.load?.value}`} defaultValue={set.load?.value ?? ''} onValueBlur={value => { if (value === '') { if (set.load) clear('load'); } else if (Number.isFinite(Number(value))) patch({ load: { value: Number(value), unit: set.load?.unit ?? 'kg' } }); }} />
      <DraftNumberInput label={t('restShort')} controlClassName="min-h-11" key={`restSec-${set.restSec}`} defaultValue={set.restSec ?? ''} min={0} step={1} onValueBlur={value => { if (value === '') { if (set.restSec !== undefined) clear('restSec'); } else if (Number.isFinite(Number(value))) patch({ restSec: Number(value) }); }} />
    </div>
    <details className="min-w-0"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium" aria-label={t('moreSetOptions', { number: formatNumber(set.setNo, o) })}>{t('more')}</summary>
      <Grid gap={3} className="min-w-0 grid-cols-2 pt-2 lg:grid-cols-4">
        <Selector label={t('unit')} controlClassName="min-h-11" value={set.load?.unit ?? 'kg'} onChange={value => { const unit = LOAD_UNITS.find(unit => unit === value); if (unit) patch({ load: { value: set.load?.value ?? 0, unit } }); }} options={LOAD_UNITS.map(value => ({ value, label: t(`units.${value}`) }))} />
        {(['rpe', 'rir', 'durationSec', 'distanceM'] as const).map(field => <DraftNumberInput key={`${field}-${set[field]}`} label={t(field)} controlClassName="min-h-11" defaultValue={set[field] ?? ''} min={field === 'rpe' || field === 'durationSec' || field === 'distanceM' ? 1 : 0} max={field === 'rpe' || field === 'rir' ? 10 : undefined} step={field === 'rpe' || field === 'distanceM' ? null : 1} onValueBlur={value => { if (value === '') { if (set[field] !== undefined) clear(field); } else if (Number.isFinite(Number(value))) patch({ [field]: Number(value) }); }} />)}
        <DraftTextInput label={t('tempo')} controlClassName="min-h-11" defaultValue={set.tempo ?? ''} key={`tempo-${set.tempo ?? ''}`} onValueBlur={value => patch({ tempo: value })} ref={input => { if (input) input.maxLength = 16; }} />
        <div className="col-span-2 min-w-0 lg:col-span-3"><DraftTextInput label={t('setNote')} controlClassName="min-h-11" defaultValue={set.note?.[lang] ?? ''} key={`note-${set.note?.[lang] ?? ''}`} onValueBlur={value => { if (value.trim()) patch({ note: { ...set.note, [lang]: value } }); else if (set.note) clear('note'); }} /></div>
      </Grid>
      <HStack gap={2} wrap="wrap" className="pt-2"><Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => { const { setNo, ...prescription } = set; void setNo; onOp({ type: 'set.applyToAll', dayId, itemId, patch: prescription }); }} label={t('applyAllSets')} /><Button type="button" className="min-h-11 min-w-11" variant="destructive" isDisabled={!canRemove} onClick={() => onOp({ type: 'set.remove', dayId, itemId, setNo: set.setNo })} label={t('removeSet')} /></HStack>
    </details>
  </div>;
}

/** One line for a collapsed exercise row, for example "3 x 8-10 @ 60 kg, rest 90s". The first set stands for the prescription. */
function setSummary(sets: PlannedSet[], t: ReturnType<typeof useTranslations>, locale: 'ar' | 'en'): string {
  const first = sets[0];
  if (!first) return t('summaryNoSets');
  const o = { locale };
  const parts = [first.reps ? t('summarySets', { count: formatNumber(sets.length, o), reps: first.reps }) : t('summaryCount', { count: formatNumber(sets.length, o) })];
  if (first.load) parts[0] += ` ${t('summaryLoad', { load: formatNumber(first.load.value, { ...o, maximumFractionDigits: 2 }), unit: t(`units.${first.load.unit}`) })}`;
  if (first.restSec !== undefined) parts.push(t('summaryRest', { seconds: formatNumber(first.restSec, o) }));
  return parts.join(', ');
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
