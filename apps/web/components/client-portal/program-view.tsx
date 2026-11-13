'use client';
import { muscleLabels } from '@/src/lib/muscles';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import type { PortalExercise, PortalProgram } from '@/src/server/workout/contracts';
import { localized } from './display';

/** Task 5: phase/week selection is local and read-only; every day remains reachable at 360px. */
export function ProgramView({ program, exercises }: { program: PortalProgram; exercises: PortalExercise[] }) {
  const t = useTranslations('workout'); const locale = useLocale();
  const allWeeks = program.document.phases.flatMap(p => p.weeks.map(w => ({ phase: p, week: w })));
  const [weekIndex, setWeekIndex] = useState(Math.max(0, program.progress.currentWeekIndex)); const [dayIndex, setDayIndex] = useState(0);
  const selected = allWeeks[weekIndex] ?? allWeeks[0]; const day = selected?.week.days[dayIndex];
  return <VStack className="flex min-w-0 flex-col gap-5">
    <Heading level={2} className="break-words text-xl font-semibold">{localized(program.name, locale)}</Heading>
    <Selector label={t('phaseWeek')} controlClassName="min-h-11" containerClassName="min-w-0 max-w-full" value={String(weekIndex)}
      onChange={value => { setWeekIndex(Number(value)); setDayIndex(0); }}
      options={allWeeks.map((entry, index) => ({ value: String(index), label: `${localized(entry.phase.name, locale)} · ${t('week', { count: entry.week.index + 1 })}` }))} />
    <HStack wrap="wrap" gap={2} aria-label={t('days')}>{selected?.week.days.map((d, index) => <Button key={d.id} className="min-h-11" aria-pressed={index === dayIndex} variant={index === dayIndex ? 'primary' : 'secondary'} onClick={() => setDayIndex(index)} label={t('day', { count: d.index + 1 })} />)}</HStack>
    {day?.workout ? <><Heading level={3} className="text-lg font-semibold">{localized(day.workout.name, locale)}</Heading><Text as="p">{localized(day.workout.note, locale)}</Text>
      {day.workout.blocks.map(block => <VStack as="section" key={block.id} className="min-w-0 rounded-2xl border p-4"><Heading level={4} className="font-semibold">{localized(block.name, locale) || t(`blocks.${block.kind}`)}</Heading><Text as="p">{localized(block.note, locale)}</Text>
        {block.items.toSorted((a, b) => a.order - b.order).map(item => <Collapsible key={item.id} className="min-w-0 border-b py-3 last:border-0" trigger={<Text className="min-h-11 break-words py-3">{localized(exercises.find(e => e.id === item.exerciseId)?.name, locale) || t('exercise')}</Text>}>
          <ExerciseInfo exercise={exercises.find(e => e.id === item.exerciseId)} /><Text as="p" className="whitespace-pre-wrap break-words">{localized(item.coachNote, locale)}</Text>
          <ul className="space-y-2">{item.sets.map(set => <li key={set.setNo} className="rounded-lg bg-muted p-3">{t('planned', { count: set.setNo })}: {set.reps ?? t('asPrescribed')} {set.load ? `· ${new Intl.NumberFormat(locale).format(set.load.value)} ${t(`units.${set.load.unit}`)}` : ''}
            {set.restSec !== undefined ? ` · ${t('restSeconds', { count: set.restSec })}` : ''}{set.tempo ? ` · ${t('tempo')}: ${set.tempo}` : ''}<Text as="p">{localized(set.note, locale)}</Text></li>)}</ul>
        </Collapsible>)}
      </VStack>)}</> : <Text as="p" className="rounded-xl border p-5">{t('restDay')}</Text>}
  </VStack>;
}

/** Task 5: exercise video and cues use the client library projection. */
export function ExerciseInfo({ exercise }: { exercise?: PortalExercise }) {
  const locale = useLocale(); const t = useTranslations('workout'); const muscles = muscleLabels(exercise?.primaryMuscles ?? [], t);
  return <VStack className="my-2 min-w-0 space-y-2 text-sm">
    {exercise?.videoUrl && /^https?:\/\//i.test(exercise.videoUrl) ? <Button className="min-h-11" href={exercise.videoUrl} target="_blank" rel="noreferrer" label={t('video')} /> : null}
    <ul className="space-y-1">{exercise?.cues.map((cue, index) => <li key={index} className="break-words">{localized(cue, locale)}</li>)}</ul>
    {muscles.length ? <Text as="p">{t('muscles')}: {muscles.join(' · ')}</Text> : null}
  </VStack>;
}
