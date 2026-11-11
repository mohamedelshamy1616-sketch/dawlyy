'use client';

import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { TextInput, type TextInputProps } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { ProgramOp } from '@dawlyy/core/program-edit';
import { BLOCK_KINDS, type LocalizedText, type ProgramDocument, type ProgramDay, type BlockKind } from '@dawlyy/core/types';
import { Dumbbell } from 'lucide-react';
import { EmptyState } from '@/src/components/shell/empty-state';
import { ItemEditor } from './item-editor';
import { ExercisePicker } from './exercise-picker';

/** Task 4: rest toggles, day copying and workout blocks use core operations with accessible move buttons. */
export function DayEditor({ day, document, names, onOp, onName }: { day: ProgramDay; document: ProgramDocument; names: Record<string, LocalizedText>; onOp: (op: ProgramOp) => void; onName: (id: string, name: LocalizedText) => void }) {
  const t = useTranslations('programs'); const locale = useLocale(); const lang = locale === 'ar' ? 'ar' : 'en';
  const [kind, setKind] = useState<BlockKind>('main'); const [target, setTarget] = useState(''); const [pickerBlock, setPickerBlock] = useState<string | null>(null);
  const blocks = day.workout?.blocks ?? [];
  return <Grid gap={4} className="min-w-0 max-w-full">
    <HStack gap={2} wrap="wrap">{(['training', 'rest', 'active_recovery'] as const).map(kind => <Button key={kind} className="min-h-11 min-w-11" type="button" variant={day.kind === kind ? 'primary' : 'secondary'} aria-pressed={day.kind === kind} onClick={() => onOp({ type: 'day.setKind', dayId: day.id, kind })} label={t(`dayKinds.${kind}`)} />)}</HStack>
    <details className="min-w-0 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('copyDay')}</summary><Grid gap={3} className="min-w-0 pt-3"><VStack className="grid min-w-0 gap-2"><Selector label={t('copyTarget')} value={target} onChange={setTarget} controlClassName="min-h-11" options={[{ value: '', label: t('chooseDay') }, ...document.phases.map((phase, pi) => ({ type: 'section' as const, title: phase.name[lang] || phase.name[lang === 'ar' ? 'en' : 'ar'] || t('phaseNumber', { number: new Intl.NumberFormat(locale).format(pi + 1) }), options: phase.weeks.flatMap(week => week.days.filter(value => value.id !== day.id).map(value => ({ value: value.id, label: t('weekDay', { week: new Intl.NumberFormat(locale).format(week.index + 1), day: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + value.index))) }) }))) }))]} /></VStack><Button className="min-h-11 min-w-11" type="button" variant="secondary" isDisabled={!target} onClick={() => { onOp({ type: 'day.copyTo', fromDayId: day.id, toDayIds: [target] }); setTarget(''); }} label={t('copyDay')} /></Grid></details>
    {day.workout ? <VStack className="grid gap-2"><DraftTextInput label={t('workoutName')} controlClassName="min-h-11" key={`${day.id}-${day.workout.name[lang]}`} defaultValue={day.workout.name[lang] || day.workout.name[lang === 'ar' ? 'en' : 'ar'] || ''} onValueBlur={value => { if (value.trim()) onOp({ type: 'workout.update', dayId: day.id, patch: { name: { ...day.workout?.name, [lang]: value } } }); }} /></VStack> : null}
    {!day.workout ? <EmptyState Icon={Dumbbell} title={t('restDayTitle')} description={t('restDayDescription')} /> : null}
    {day.workout && !blocks.length ? <EmptyState Icon={Dumbbell} title={t('noBlocks')} description={t('addBlockHint')} /> : null}
    {blocks.map((block, index) => <section key={block.id} className="grid min-w-0 max-w-full gap-4 rounded-xl border bg-muted/30 p-3">
      <Heading level={3} className="font-semibold">{block.name?.[lang] || block.name?.[lang === 'ar' ? 'en' : 'ar'] || t(`blockKinds.${block.kind}`)}</Heading>
      <Grid gap={3} className="min-w-0 sm:grid-cols-2"><VStack className="grid min-w-0 gap-1"><DraftTextInput label={t('blockName')} controlClassName="min-h-11" key={`${block.id}-${block.name?.[lang] ?? ''}`} defaultValue={block.name?.[lang] ?? ''} onValueBlur={value => onOp({ type: 'block.update', dayId: day.id, blockId: block.id, patch: { name: value.trim() ? { ...block.name, [lang]: value } : null } })} /></VStack><VStack className="grid min-w-0 gap-1"><Selector label={t('blockKind')} controlClassName="min-h-11" value={block.kind} options={BLOCK_KINDS.map(value => ({ value, label: t(`blockKinds.${value}`) }))} onChange={value => { const kind = BLOCK_KINDS.find(kind => kind === value); if (kind) onOp({ type: 'block.update', dayId: day.id, blockId: block.id, patch: { kind } }); }} /></VStack></Grid>
      {block.kind === 'circuit' || block.kind === 'superset' ? <Grid gap={3} className="min-w-0 grid-cols-2">{(['rounds', 'restBetweenRoundsSec'] as const).map(field => <VStack key={field} className="grid min-w-0 gap-1"><DraftNumberInput label={t(field)} controlClassName="min-h-11" min={field === 'rounds' ? 1 : 0} key={`${field}-${block[field]}`} defaultValue={block[field] ?? ''} onValueBlur={value => { if (value !== '') onOp({ type: 'block.update', dayId: day.id, blockId: block.id, patch: { [field]: Number(value) } }); }} /></VStack>)}</Grid> : null}
      <HStack gap={2} wrap="wrap"><Button type="button" className="min-h-11 min-w-11" variant="secondary" isDisabled={index === 0} onClick={() => onOp({ type: 'block.move', dayId: day.id, blockId: block.id, toIndex: index - 1 })} label={t('moveUp')} /><Button type="button" className="min-h-11 min-w-11" variant="secondary" isDisabled={index === blocks.length - 1} onClick={() => onOp({ type: 'block.move', dayId: day.id, blockId: block.id, toIndex: index + 1 })} label={t('moveDown')} /><Button type="button" className="min-h-11 min-w-11" variant="destructive" onClick={() => onOp({ type: 'block.remove', dayId: day.id, blockId: block.id })} label={t('removeBlock')} /></HStack>
      {block.items.map((item, itemIndex) => <ItemEditor key={item.id} dayId={day.id} item={item} block={block} blocks={blocks} index={itemIndex} name={names[item.exerciseId]} onOp={onOp} onName={onName} />)}
      {!block.items.length ? <Text as="p" className="text-sm text-muted-foreground">{t('emptyBlock')}</Text> : null}
      <Button className="min-h-11 min-w-11" type="button" onClick={() => setPickerBlock(block.id)} label={t('addExercise')} /><Dialog isOpen={pickerBlock === block.id} onOpenChange={open => setPickerBlock(open ? block.id : null)} width="var(--container-lg)" maxHeight="85dvh"><VStack gap={4}><DialogHeader title={t('chooseExercise')} /><ExercisePicker onPick={exercise => { onOp({ type: 'item.add', dayId: day.id, blockId: block.id, exerciseId: exercise.id }); onName(exercise.id, exercise.name); setPickerBlock(null); }} /><Button type="button" className="min-h-11 min-w-11" variant="secondary" onClick={() => setPickerBlock(null)} label={t('close')} /></VStack></Dialog>
    </section>)}
    {day.workout ? <Grid gap={2} className="min-w-0 sm:grid-cols-2"><VStack className="grid min-w-0 gap-1"><Selector label={t('blockKind')} controlClassName="min-h-11" value={kind} options={BLOCK_KINDS.map(value => ({ value, label: t(`blockKinds.${value}`) }))} onChange={value => { const kind = BLOCK_KINDS.find(kind => kind === value); if (kind) setKind(kind); }} /></VStack><Button className="min-h-11 min-w-11 self-end" type="button" variant="secondary" onClick={() => onOp({ type: 'block.add', dayId: day.id, kind })} label={t('addBlock')} /></Grid> : null}
  </Grid>;
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
