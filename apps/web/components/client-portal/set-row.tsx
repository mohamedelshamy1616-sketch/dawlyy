'use client';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { SET_TAGS } from '@dawlyy/db/schema';
import { convertLoad, type PerformedSet } from '@dawlyy/core/workout';
import type { PlannedSet, WorkoutItem } from '@dawlyy/core/types';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Grid } from '@astryxdesign/core/Grid';
import type { PortalExercise, SetWrite } from '@/src/server/workout/contracts';
import { queueSet } from '@/src/lib/outbox/store';
import { parseWorkoutNumber } from '@/src/server/workout/logic';
import { useOutbox } from './client-runtime';
import { localized } from './display';

/** Task 5 / G2/G3: previous performance is prefilled, every edit persists locally before acknowledgement. */
export function SetRow({ sessionUuid, item, blockId, warmup, plan, previous, saved, unit, exercises, disabled, onComplete }: {
  sessionUuid: string; item: WorkoutItem; blockId: string; warmup: boolean; plan: PlannedSet; previous?: PerformedSet;
  saved?: SetWrite; unit: 'kg' | 'lb'; exercises: PortalExercise[]; disabled: boolean; onComplete: (seconds: number) => void;
}) {
  const t = useTranslations('workout'); const locale = useLocale(); const { db } = useOutbox(); const [failure, setFailure] = useState(false); const [busy, setBusy] = useState(false);
  const [value, setValue] = useState<SetWrite>(() => saved ?? { clientUuid: crypto.randomUUID(), clientUpdatedAt: new Date().toISOString(),
    sessionClientUuid: sessionUuid, exerciseId: item.exerciseId, itemId: item.id, blockId, setNo: plan.setNo,
    tag: warmup ? 'warmup' : 'working', completed: false, skipped: false, painFlag: false,
    reps: previous?.reps ?? (plan.reps && /^\d+$/.test(plan.reps) ? Number(plan.reps) : undefined),
    load: previous?.load !== undefined ? convertLoad(previous.load, previous.loadUnit ?? unit, unit) : plan.load && (plan.load.unit === 'kg' || plan.load.unit === 'lb') ? convertLoad(plan.load.value, plan.load.unit, unit) : undefined,
    loadUnit: unit, rpe: previous?.rpe, rir: previous?.rir, restSec: plan.restSec, durationSec: plan.durationSec, distanceM: plan.distanceM });
  const draft = useRef(value);
  async function edit(patch: Partial<SetWrite>) {
    if (!db || disabled) return;
    const next = { ...draft.current, ...patch }; draft.current = next; setBusy(true);
    try { await queueSet(db, next); setValue(next); setFailure(false); if (patch.completed) onComplete(plan.restSec ?? 60); }
    catch { setFailure(true); } finally { setBusy(false); }
  }
  const numeric = (field: 'reps' | 'load' | 'rpe' | 'rir' | 'durationSec' | 'distanceM', max: number, min = 0) => <NumberInput key={field}
    label={field === 'load' ? t('loadWithUnit', { unit: t(`units.${unit}`) }) : t(field)} hasClear value={value[field]}
    containerClassName="min-w-0 max-w-full" controlClassName="min-h-11 text-base" isDisabled={disabled || !db}
    min={min} max={max} step={field === 'load' || field === 'rpe' || field === 'distanceM' ? 0.1 : 1}
    isIntegerOnly={field === 'reps' || field === 'rir' || field === 'durationSec'} data-testid={`set-${plan.setNo}-${field}`}
    onInput={event => {
      const number = parseWorkoutNumber((event.target as HTMLInputElement).value);
      const integer = field === 'reps' || field === 'rir' || field === 'durationSec';
      if (number !== undefined && (number === null || number >= min && number <= max && (!integer || Number.isInteger(number)))) void edit({ [field]: number });
    }}
    onChange={number => { if (number === null || Number.isFinite(number) && number >= min && number <= max) void edit({ [field]: number }); }} />;
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-xl border bg-card p-3 shadow-card-edge" data-testid="set-row">
    <legend className="px-2 text-sm font-semibold">{t('setNumber', { count: plan.setNo })}</legend>
    <Text as="p" className="break-words text-sm text-muted-foreground">{t('prescription')}: {plan.reps ?? t('asPrescribed')}{plan.load ? ` · ${fmt.format(plan.load.value)} ${t(`units.${plan.load.unit}`)}` : ''}{plan.tempo ? ` · ${t('tempo')}: ${plan.tempo}` : ''}{plan.restSec !== undefined ? ` · ${t('restSeconds', { count: plan.restSec })}` : ''}</Text>
    {previous ? <Text as="p" className="text-sm" data-testid="last-time">{t('lastTime')}: {fmt.format(previous.reps ?? 0)} {t('repUnit')} · {fmt.format(convertLoad(previous.load ?? 0, previous.loadUnit ?? unit, unit))} {t(`units.${unit}`)}</Text> : null}
    <Grid columns={2} gap={3} className="min-w-0">{numeric('reps', 10000)}{numeric('load', 999999.99)}{numeric('rpe', 10, 1)}{numeric('rir', 100)}
      {plan.durationSec !== undefined ? numeric('durationSec', 86400) : null}{plan.distanceM !== undefined ? numeric('distanceM', 99999999) : null}</Grid>
    <Selector label={t('tag')} value={value.tag} isDisabled={disabled} controlClassName="min-h-11" options={SET_TAGS.map(tag => ({ value: tag, label: t(`tags.${tag}`) }))} onChange={tag => void edit({ tag: tag as SetWrite['tag'] })} />
    <CheckboxInput label={t('painFlag')} className="min-h-11" value={value.painFlag} isDisabled={disabled} onChange={painFlag => void edit({ painFlag })} />
    <TextInput label={t('setNote')} controlClassName="min-h-11 text-base" value={value.note ?? ''} isDisabled={disabled} onChange={note => void edit({ note: note.slice(0, 4000) })} />
    {item.alternatives?.length ? <Selector label={t('substitute')} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full" value={value.exerciseId} isDisabled={disabled}
      onChange={exerciseId => void edit({ exerciseId, substitutedFor: exerciseId === item.exerciseId ? null : item.exerciseId })}
      options={[item.exerciseId, ...item.alternatives].filter(id => exercises.some(e => e.id === id)).map(id => ({ value: id, label: localized(exercises.find(e => e.id === id)?.name, locale) }))} /> : <Text as="p">{t('substitutionCoach')}</Text>}
    <HStack wrap="wrap" gap={2}><Button className="min-h-11 flex-1" isDisabled={disabled || busy || !db} onClick={() => void edit({ completed: !value.completed, skipped: false })} data-testid="complete-set" label={t(value.completed ? 'setDone' : 'completeSet')} />
      <Button className="min-h-11" variant="secondary" isDisabled={disabled || busy || !db} onClick={() => void edit({ skipped: !value.skipped, completed: false })} label={t(value.skipped ? 'undoSkip' : 'skip')} /></HStack>
    {failure ? <Text as="p" role="alert" className="text-sm text-destructive">{t('storageError')}</Text> : null}
  </fieldset>;
}
