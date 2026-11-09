'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { ProgramOp } from '@dawlyy/core/program-edit';
import type { LocalizedText, PlannedSet, WorkoutBlock, WorkoutItem } from '@dawlyy/core/types';
import { LOAD_UNITS } from '@dawlyy/core/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
    <h4 className="font-semibold">{title}</h4>
    <div className="flex flex-wrap gap-2">
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}><DialogTrigger asChild><Button type="button" className="min-h-11" variant="outline">{t('replaceExercise')}</Button></DialogTrigger><DialogContent showCloseButton={false} aria-describedby={undefined} className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>{t('chooseExercise')}</DialogTitle></DialogHeader><ExercisePicker onPick={exercise => { onOp({ type: 'item.replaceExercise', dayId, itemId: item.id, exerciseId: exercise.id }); onName(exercise.id, exercise.name); setPickerOpen(false); }} /><Button type="button" className="min-h-11" variant="outline" onClick={() => setPickerOpen(false)}>{t('close')}</Button></DialogContent></Dialog>
      <Button type="button" className="min-h-11" variant="outline" disabled={index === 0} onClick={() => move(index - 1)} aria-label={t('moveExerciseUp', { name: title })}>{t('moveUp')}</Button>
      <Button type="button" className="min-h-11" variant="outline" disabled={index === block.items.length - 1} onClick={() => move(index + 1)} aria-label={t('moveExerciseDown', { name: title })}>{t('moveDown')}</Button>
      <Button type="button" className="min-h-11" variant="outline" onClick={() => onOp({ type: 'item.duplicate', dayId, itemId: item.id })}>{t('duplicate')}</Button>
      <Button type="button" className="min-h-11" variant="destructive" onClick={() => onOp({ type: 'item.remove', dayId, itemId: item.id })}>{t('remove')}</Button>
    </div>
    {blocks.length > 1 ? <label className="grid gap-2">{t('moveToBlock')}<select value={block.id} onChange={e => onOp({ type: 'item.move', dayId, itemId: item.id, toBlockId: e.target.value, toIndex: 999 })} className="min-h-11 max-w-full rounded-lg border bg-background px-3">{blocks.map((value, i) => <option key={value.id} value={value.id}>{value.name?.[lang] || value.name?.[lang === 'ar' ? 'en' : 'ar'] || t(`blockKinds.${value.kind}`)} {new Intl.NumberFormat(locale).format(i + 1)}</option>)}</select></label> : null}
    <div className="grid min-w-0 gap-3" role="group" aria-label={t('setTable')}>
      {item.sets.map(set => <SetEditor key={`${item.id}-${set.setNo}`} dayId={dayId} itemId={item.id} sets={item.sets} set={set} canRemove={item.sets.length > 1} onOp={onOp} />)}
    </div>
    <Button type="button" className="min-h-11" variant="outline" onClick={() => onOp({ type: 'set.add', dayId, itemId: item.id, copyLast: true })}>{t('addSet')}</Button>
    <details className="min-w-0 rounded-lg border p-3"><summary className="min-h-11 cursor-pointer font-medium">{t('progression')}</summary><div className="grid min-w-0 gap-3 pt-3">
      <label className="grid gap-2">{t('progressionType')}<select className="min-h-11 max-w-full rounded-lg border bg-background px-3" value={item.progressionRule?.type ?? ''} onChange={e => {
        const value = e.target.value; if (value === '') patch({ progressionRule: null });
        else if (value === 'reps' || value === 'load' || value === 'rpe') patch({ progressionRule: { type: value, threshold: item.progressionRule?.threshold ?? 10, step: item.progressionRule?.step ?? 1 } });
      }}><option value="">{t('none')}</option>{(['reps', 'load', 'rpe'] as const).map(type => <option key={type} value={type}>{t(type)}</option>)}</select></label>
      {item.progressionRule ? <div className="grid min-w-0 grid-cols-2 gap-3">{(['threshold', 'step'] as const).map(field => <label className="grid min-w-0 gap-2" key={field}>{t(field)}<Input type="number" step="any" className="min-h-11" defaultValue={item.progressionRule?.[field]} key={`${field}-${item.progressionRule?.[field]}`} onBlur={e => { const value = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(value) && item.progressionRule) patch({ progressionRule: { ...item.progressionRule, [field]: value } }); }} /></label>)}</div> : null}
    </div></details>
    <div className="grid gap-2"><Label htmlFor={`coach-note-${item.id}`}>{t('coachNote')}</Label><Input id={`coach-note-${item.id}`} className="min-h-11" defaultValue={item.coachNote?.[lang] ?? ''} key={`${item.id}-${item.coachNote?.[lang] ?? ''}`} onBlur={e => patch({ coachNote: e.target.value.trim() ? { ...item.coachNote, [lang]: e.target.value } : null })} /></div>
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
    <legend className="px-1 font-medium">{t('setNumber', { number: new Intl.NumberFormat(locale).format(set.setNo) })}</legend>
    <div className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
      {(['reps', 'tempo'] as const).map(field => <label key={field} className="grid min-w-0 gap-1 text-sm">{t(field)}<Input className="min-h-11" defaultValue={set[field] ?? ''} key={`${field}-${set[field] ?? ''}`} maxLength={field === 'reps' ? 32 : 16} onBlur={e => patch({ [field]: e.target.value })} /></label>)}
      <label className="grid min-w-0 gap-1 text-sm">{t('load')}<Input type="number" min={0} step="any" className="min-h-11" key={`load-${set.load?.value}`} defaultValue={set.load?.value ?? ''} onBlur={e => { if (e.target.value === '') { if (set.load) clear('load'); } else if (Number.isFinite(Number(e.target.value))) patch({ load: { value: Number(e.target.value), unit: set.load?.unit ?? 'kg' } }); }} /></label>
      <label className="grid min-w-0 gap-1 text-sm">{t('unit')}<select className="min-h-11 min-w-0 max-w-full rounded-lg border bg-background px-2" value={set.load?.unit ?? 'kg'} onChange={e => { const unit = LOAD_UNITS.find(value => value === e.target.value); if (unit) patch({ load: { value: set.load?.value ?? 0, unit } }); }}>{LOAD_UNITS.map(unit => <option key={unit} value={unit}>{t(`units.${unit}`)}</option>)}</select></label>
      {(['restSec', 'rpe', 'rir', 'durationSec', 'distanceM'] as const).map(field => <label className="grid min-w-0 gap-1 text-sm" key={field}>{t(field)}<Input type="number" className="min-h-11" key={`${field}-${set[field]}`} defaultValue={set[field] ?? ''} min={field === 'rpe' || field === 'durationSec' || field === 'distanceM' ? 1 : 0} max={field === 'rpe' || field === 'rir' ? 10 : undefined} step={field === 'rpe' || field === 'distanceM' ? 'any' : 1} onBlur={e => { if (e.target.value === '') { if (set[field] !== undefined) clear(field); } else if (Number.isFinite(Number(e.target.value))) patch({ [field]: Number(e.target.value) }); }} /></label>)}
      <label className="grid min-w-0 gap-1 text-sm">{t('setNote')}<Input className="min-h-11" defaultValue={set.note?.[lang] ?? ''} key={`note-${set.note?.[lang] ?? ''}`} onBlur={e => { if (e.target.value.trim()) patch({ note: { ...set.note, [lang]: e.target.value } }); else if (set.note) clear('note'); }} /></label>
    </div>
    <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" variant="outline" onClick={() => { const { setNo, ...prescription } = set; void setNo; onOp({ type: 'set.applyToAll', dayId, itemId, patch: prescription }); }}>{t('applyAllSets')}</Button><Button type="button" className="min-h-11" variant="destructive" disabled={!canRemove} onClick={() => onOp({ type: 'set.remove', dayId, itemId, setNo: set.setNo })}>{t('removeSet')}</Button></div>
  </fieldset>;
}
