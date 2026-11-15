'use client';

import { useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import { localize, type LocalizedText, type ProgramDocument, type NutritionDocument, type FormDocument } from '@dawlyy/core/types';
import { useRouter } from '@/i18n/navigation';
import { formatKcal, formatMacro, numberLocale, numeralPolicy } from '@/src/lib/numbers';
import { activityTimestamp, revertBody, versionNumber, type ActivityFormat } from '@/src/server/activity/presentation';
import type { getProgramVersion } from '@/src/server/programs/read';
import type { getNutritionVersion } from '@/src/server/nutrition/read';
import type { getFormVersion } from '@/src/server/forms/read';
import type { revertProgram } from '@/src/server/programs/service';
import type { revertNutrition } from '@/src/server/nutrition/service';
import type { revertForm } from '@/src/server/forms/service';
import type { ActivityKind } from '@/src/server/activity/types';

// Pick from each real version reader, preserving its document type across the JSON boundary.
type Wire<T> = T extends Date ? string : T extends readonly (infer U)[] ? Wire<U>[] : T extends object ? { [K in keyof T]: Wire<T[K]> } : T;
type VersionFields<T extends { versionNo: number; status: string; createdAt: Date; publishedAt: Date | null; document: unknown }> = Wire<Pick<T, 'versionNo' | 'status' | 'createdAt' | 'publishedAt' | 'document'>>;
type VersionBase = { headId: string; name: LocalizedText; canRevert: boolean };
export type VersionDetailData = VersionBase & (
   { kind: 'program'; version: VersionFields<Awaited<ReturnType<typeof getProgramVersion>>> } |
   { kind: 'nutrition'; version: VersionFields<Awaited<ReturnType<typeof getNutritionVersion>>> } |
   { kind: 'form'; formKind: 'intake' | 'checkin' | 'assessment' | 'custom'; version: VersionFields<Awaited<ReturnType<typeof getFormVersion>>> }
 );
type RevertResult = Wire<Awaited<ReturnType<typeof revertProgram>> | Awaited<ReturnType<typeof revertNutrition>> | Awaited<ReturnType<typeof revertForm>>>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const paths = { program: 'programs', nutrition: 'nutrition', form: 'forms' } as const;
const frame = 'min-w-0 max-w-full';

/** A single explicitly confirmed action uses one idempotency key, including a network retry. */
export async function submitVersionRevert(kind: ActivityKind, headId: string, toVersionNo: number, changeNote: string, key: string, request: typeof fetch = fetch): Promise<RevertResult> {
  const body = revertBody(kind, toVersionNo, changeNote);
  if (!Object.hasOwn(paths, kind) || !uuid.test(headId) || !body || !key) throw Object.assign(new Error('Invalid revert'), { status: 400 });
  const response = await request(`/api/v1/${paths[kind]}/${headId}/revert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
  });
  if (response.status !== 201) throw Object.assign(new Error('Draft creation failed'), { status: response.status });
  return response.json() as Promise<RevertResult>;
}

function builderHref(data: VersionDetailData): string | null {
  if (!uuid.test(data.headId)) return null;
  if (data.kind === 'program') return `/coach/programs/${data.headId}`;
  if (data.kind === 'nutrition') return `/coach/nutrition/${data.headId}`;
  return data.formKind === 'intake' ? `/coach/intake/${data.headId}` : data.formKind === 'checkin' ? `/coach/checkins/${data.headId}` : data.formKind === 'assessment' ? `/coach/assessments/${data.headId}` : null;
}

export function VersionLoading() {
  const t = useTranslations('activity');
  return <Text as="p" role="status" aria-live="polite">{t('loading')}</Text>;
}

function ProgramPreview({ document, format }: { document: ProgramDocument; format: ActivityFormat }) {
  const t = useTranslations('activity'); const text = (value?: LocalizedText) => localize(value, format.locale);
  return <VStack gap={4} className={frame}>
    {text(document.goal) ? <Text as="p" wordBreak="break-word">{t('goal')}: {text(document.goal)}</Text> : null}
    {text(document.notes) ? <Text as="p" wordBreak="break-word">{text(document.notes)}</Text> : null}
    {!document.phases.length ? <Text as="p">{t('emptyPreview')}</Text> : document.phases.map(phase => <VStack key={phase.id} gap={3} className={frame}>
      <Heading level={3} className="break-words">{text(phase.name)}</Heading>
      {text(phase.goal) ? <Text as="p" wordBreak="break-word">{text(phase.goal)}</Text> : null}
      {phase.weeks.map(week => <VStack key={week.id} gap={2} className={frame}>
        <Heading level={4}>{t('week', { number: versionNumber(week.index + 1, format) })}</Heading>
        <List density="compact" edge="flush" hasDividers>
          {week.days.map(day => <ListItem key={day.id} label={<Text as="p" weight="semibold" wordBreak="break-word">{t('day', { number: versionNumber(day.index + 1, format) })}: {t(`dayKinds.${day.kind}`)}</Text>}
            description={<VStack gap={2} className={frame}>
              {text(day.note) ? <Text as="p" wordBreak="break-word">{text(day.note)}</Text> : null}
              {day.workout ? <>
                <Text as="p" wordBreak="break-word">{text(day.workout.name)}</Text>
                {day.workout.blocks.map(block => <VStack key={block.id} gap={1} className={frame}>
                  {text(block.name) ? <Text as="p" weight="semibold" wordBreak="break-word">{text(block.name)}</Text> : null}
                  {block.items.map((item, index) => <VStack key={item.id} gap={1} className={frame}>
                    <Text as="p">{t('exercise', { number: versionNumber(index + 1, format) })}: {t('sets', { count: versionNumber(item.sets.length, format) })}</Text>
                    {text(item.coachNote) ? <Text as="p" wordBreak="break-word">{text(item.coachNote)}</Text> : null}
                  </VStack>)}
                </VStack>)}
              </> : null}
            </VStack>} />)}
        </List>
      </VStack>)}
    </VStack>)}
  </VStack>;
}

function NutritionPreview({ document, format }: { document: NutritionDocument; format: ActivityFormat }) {
  const t = useTranslations('activity'); const text = (value?: LocalizedText) => localize(value, format.locale);
  const numbers = { locale: format.locale, numerals: numeralPolicy(format.preferences) };
  return <VStack gap={3} className={frame}>
    <Heading level={3}>{t('targets')}</Heading>
    <Text as="p">{t('kcal', { value: formatKcal(document.targets.kcal, numbers) })}</Text>
    <Text as="p">{t('protein', { value: formatMacro(document.targets.proteinG, numbers) })}</Text>
    <Text as="p">{t('carbs', { value: formatMacro(document.targets.carbsG, numbers) })}</Text>
    <Text as="p">{t('fat', { value: formatMacro(document.targets.fatG, numbers) })}</Text>
    {text(document.instructions) ? <Text as="p" wordBreak="break-word">{text(document.instructions)}</Text> : null}
    {!document.meals.length ? <Text as="p">{t('emptyPreview')}</Text> : <List density="compact" edge="flush" hasDividers>
      {document.meals.map(meal => <ListItem key={meal.id} label={<Text as="p" weight="semibold" wordBreak="break-word">{text(meal.name)}</Text>} description={<VStack gap={1} className={frame}>
        {text(meal.timeHint) ? <Text as="p" wordBreak="break-word">{text(meal.timeHint)}</Text> : null}
        <Text as="p">{t('mealOptions', { count: versionNumber(meal.options.length, format) })}</Text>
        {meal.options.map(option => <VStack key={option.id} gap={1} className={frame}>
          {text(option.name) ? <Text as="p" wordBreak="break-word">{text(option.name)}</Text> : null}
          <Text as="p">{t('mealItems', { count: versionNumber(option.items.length, format) })}</Text>
          {option.items.map(item => text(item.note) ? <Text key={item.id} as="p" wordBreak="break-word">{text(item.note)}</Text> : null)}
        </VStack>)}
      </VStack>} />)}
    </List>}
  </VStack>;
}

function FormPreview({ document, format }: { document: FormDocument; format: ActivityFormat }) {
  const t = useTranslations('activity'); const text = (value?: LocalizedText) => localize(value, format.locale);
  return <VStack gap={3} className={frame}>
    {text(document.intro) ? <Text as="p" wordBreak="break-word">{text(document.intro)}</Text> : null}
    {!document.sections.length ? <Text as="p">{t('emptyPreview')}</Text> : document.sections.map(section => <VStack key={section.id} gap={2} className={frame}>
      <Heading level={3} className="break-words">{text(section.title)}</Heading>
      {text(section.description) ? <Text as="p" wordBreak="break-word">{text(section.description)}</Text> : null}
      <Text as="p" type="supporting">{t('questions', { count: versionNumber(section.questions.length, format) })}</Text>
      <List density="compact" edge="flush" hasDividers>{section.questions.map(question => <ListItem key={question.id} label={<Text as="p" weight="semibold" wordBreak="break-word">{text(question.label)}</Text>} description={<VStack gap={1} className={frame}>
        {text(question.help) ? <Text as="p" wordBreak="break-word">{text(question.help)}</Text> : null}
        {question.options?.map(option => <Text key={option.value} as="p" wordBreak="break-word">{text(option.label)}</Text>)}
      </VStack>} />)}</List>
    </VStack>)}
  </VStack>;
}

/** Exact immutable snapshot; the only mutation is the user's explicit fresh-draft confirmation. */
export function VersionDetail({ data, timezone, preferences }: { data: VersionDetailData; timezone: string; preferences: unknown }) {
  const t = useTranslations('activity'); const locale = numberLocale(useLocale()); const router = useRouter();
  const format = { locale, timezone, preferences }; const builder = builderHref(data);
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [saved, setSaved] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null); const sending = useRef(false); const confirmationId = useId();
  const noteLimit = data.kind === 'nutrition' ? 4000 : 2000;
  const when = activityTimestamp(data.version.createdAt, format);
  const published = data.version.publishedAt ? activityTimestamp(data.version.publishedAt, format) : null;
  const status = ['draft', 'in_review', 'approved', 'published', 'superseded', 'archived'].includes(data.version.status) ? data.version.status : 'unknown';
  async function confirm() {
    if (sending.current || !data.canRevert || !builder || saved) return;
    const body = revertBody(data.kind, data.version.versionNo, note);
    if (!body) { setError('invalidNote'); return; }
    const fingerprint = JSON.stringify([data.kind, data.headId, body]);
    const key = attempt.current?.fingerprint === fingerprint ? attempt.current.key : crypto.randomUUID();
    attempt.current = { fingerprint, key }; sending.current = true; setBusy(true); setError(null);
    try {
      await submitVersionRevert(data.kind, data.headId, data.version.versionNo, note, key);
      setSaved(true); router.push(builder); router.refresh();
    } catch (failure) {
      const status = typeof failure === 'object' && failure !== null && 'status' in failure ? failure.status : 0;
      setError(status === 401 || status === 403 ? 'versionForbidden' : status === 404 ? 'versionUnavailable' : 'revertFailed');
    } finally { sending.current = false; setBusy(false); }
  }
  return <VStack gap={5} width="100%" className={frame} aria-busy={busy || undefined}>
    <HStack gap={2} wrap="wrap" className={frame}>
      <Button href="/coach/settings/activity" variant="ghost" className="min-h-11 min-w-11 max-w-full" label={t('backToActivity')} />
      {builder ? <Button href={builder} variant="secondary" className="min-h-11 min-w-11 max-w-full" label={t('backToBuilder')} /> : null}
      {data.kind !== 'form' && builder ? <Button href={`${builder}/history`} variant="ghost" className="min-h-11 min-w-11 max-w-full" label={t('backToHistory')} /> : null}
    </HStack>
    <Heading level={1}>{t('versionTitle')}</Heading>
    <Heading level={2} className="break-words">{localize(data.name, locale)}</Heading>
    <Text as="p">{t('versionNumber', { number: versionNumber(data.version.versionNo, format) })}</Text>
    <Text as="p">{t('statusLabel')}: {t(`status.${status}`)}</Text>
    <Text as="p">{t('createdAt')}: {when ? <time dateTime={data.version.createdAt}>{when}</time> : t('timeUnavailable')}</Text>
    {published && data.version.publishedAt ? <Text as="p">{t('publishedAt')}: <time dateTime={data.version.publishedAt}>{published}</time></Text> : null}
    <Text as="p" color="secondary">{t(['published', 'superseded', 'archived'].includes(data.version.status) ? 'immutableNotice' : 'draftPreviewNotice')}</Text>
    <VStack gap={4} className={frame}><Heading level={2}>{t('preview')}</Heading>
      {data.kind === 'program' ? <ProgramPreview document={data.version.document} format={format} /> : data.kind === 'nutrition' ? <NutritionPreview document={data.version.document} format={format} /> : <FormPreview document={data.version.document} format={format} />}
    </VStack>
    {data.canRevert && builder ? <VStack gap={3} className={frame}>
      <Text as="p" id={confirmationId}>{t('confirmDescription')}</Text>
      <TextArea label={t('changeNote')} value={note} onChange={setNote} isOptional isDisabled={busy || saved} description={t('noteLimit', { count: versionNumber(noteLimit, format) })} ref={input => { if (input) input.maxLength = noteLimit; }} />
      <Button label={t('confirmRevert')} aria-describedby={confirmationId} variant="primary" className="min-h-11 min-w-11 max-w-full self-start" isDisabled={busy || saved} isLoading={busy} onClick={() => void confirm()} />
      {busy ? <Text as="p" role="status" aria-live="polite">{t('creatingDraft')}</Text> : null}
      {saved ? <Text as="p" role="status" aria-live="polite">{t('draftCreated')}</Text> : null}
      {error ? <Text as="p" role="alert">{t(error)}</Text> : null}
    </VStack> : <Text as="p" color="secondary">{t('viewOnly')}</Text>}
  </VStack>;
}
