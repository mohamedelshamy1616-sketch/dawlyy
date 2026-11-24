'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack } from '@astryxdesign/core/VStack';
import type { ProposalCode, WeekReview } from '@dawlyy/core/review';
import { Link } from '@/i18n/navigation';
import { formatNumber, formatKcal, formatMacro, numberLocale, type NumberLocale, type NumeralSystem } from '@/src/lib/numbers';
import type { ReviewDraftDto, ReviewProposalDraft } from '@/src/server/review/types';
import { createMutationAttempts } from '@/src/lib/mutation-attempts';

const frame = 'min-w-0 max-w-full';
const link = 'inline-flex min-h-11 min-w-11 max-w-full items-center break-words rounded-lg underline focus-ring';
type Flag = WeekReview['summary']['redFlags'][number];
type ApprovalResult = { draftId: string; status: 'approved'; conversationId: string; messageId: string; notified: boolean };

/** R4b: same-origin failures carry codes; raw server text never becomes product copy. */
export class ReviewRequestError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}

/** R4b: explicit read/write transport; callers retain write keys across indeterminate failures. */
export async function reviewRequest<T>(path: string, options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT'; body?: unknown; key?: string } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers();
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (method !== 'GET') headers.set('Idempotency-Key', options.key ?? crypto.randomUUID());
  const response = await fetch(path, { method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body), credentials: 'same-origin', cache: 'no-store' });
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
    const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'request_failed';
    throw new ReviewRequestError(response.status, code);
  }
  return data as T;
}

/** R4b: convert template number tokens once, never reformat a coach's saved prose. */
export function initialReviewText(draft: ReviewDraftDto | null, locale: NumberLocale, numerals: NumeralSystem): string {
  if (!draft) return '';
  if (numerals === 'latn' || draft.text !== draft.review.draft.text) return draft.text;
  return draft.text.replace(/-?\d+(?:\.\d+)?/g, token => formatNumber(Number(token), { locale, numerals, maximumFractionDigits: 2 }));
}

/** R4b: the route fallback is the only permanently busy presentation. */
export function ReviewLoading({ settings = false }: { settings?: boolean }) {
  const t = useTranslations('review');
  return <Text as="p" role="status" aria-live="polite" aria-busy="true">{t(settings ? 'settings.loading' : 'loading')}</Text>;
}

/** R4b: coach-owned evidence, prose and explicit approval; mounting never builds or sends. */
export function ReviewWorkspace({ clientId, initial, numerals = 'latn', initialError, canSend = false, canPropose = false, canViewNutrition = false }: {
  clientId: string;
  initial: ReviewDraftDto | null;
  numerals?: NumeralSystem;
  initialError?: 'forbidden' | 'request';
  canSend?: boolean;
  canPropose?: boolean;
  canViewNutrition?: boolean;
}) {
  const t = useTranslations('review');
  const locale = numberLocale(useLocale());
  const [draft, setDraft] = useState(initialError === 'forbidden' ? null : initial);
  const [text, setText] = useState(() => initialReviewText(initialError === 'forbidden' ? null : initial, locale, numerals));
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [attempts] = useState(createMutationAttempts);
  const [requiresRebuild, setRequiresRebuild] = useState(false);
  const [flags, setFlags] = useState<Flag[]>(initialError === 'forbidden' ? [] : initial?.review.summary.redFlags ?? []);
  const [sent, setSent] = useState<ApprovalResult | null>(null);
  const [saved, setSaved] = useState(false);
  const options = { locale, numerals };
  const n = (value: number | null, maximumFractionDigits = 1) => formatNumber(value, { ...options, maximumFractionDigits });
  const pick = (name: { ar?: string | undefined; en?: string | undefined }) => name[locale] ?? name.en ?? name.ar ?? '';
  const date = (value: string) => value.replace(/\d/g, digit => formatNumber(Number(digit), { ...options, maximumFractionDigits: 0 }));
  const base = `/api/v1/clients/${clientId}/review`;
  const stale = draft?.status === 'stale' || requiresRebuild;
  const blocked = flags.length > 0 || (draft?.review.mustHandleFlags === true && !requiresRebuild);
  const editable = draft?.status === 'draft' && !stale;
  const dirty = draft !== null && text !== draft.text;

  async function mutate<T>(path: string, method: 'POST' | 'PATCH', body?: unknown): Promise<T> {
    const fingerprint = JSON.stringify([path, method, body]);
    const key = attempts.begin(base, fingerprint);
    try {
      const value = await reviewRequest<T>(path, { method, body, key });
      attempts.succeeded(base);
      return value;
    } catch (failure) {
      if (failure instanceof ReviewRequestError && failure.status < 500 &&
          !(failure.status === 409 && failure.code === 'idempotency_in_progress')) attempts.refused(base, key);
      throw failure;
    }
  }
  async function fail(failure: unknown) {
    if (failure instanceof ReviewRequestError && failure.status === 403) {
      setDraft(null); setText(''); setFlags([]); setError('forbidden'); return;
    }
    const code = failure instanceof ReviewRequestError ? failure.code : 'request_failed';
    if (code === 'review_stale') { setDraft(current => current ? { ...current, status: 'stale' } : current); setRequiresRebuild(true); setError('stale'); }
    else if (code === 'red_flags_open') {
      setError('red_flags_open');
      try { const current = await reviewRequest<{ items: Flag[] }>(`/api/v1/red-flags?status=open&clientId=${clientId}&limit=100`); setFlags(current.items); }
      catch { setRequiresRebuild(true); }
    } else if (code === 'nutrition_draft_exists' || code === 'proposal_version_mismatch' || code === 'draft_not_editable') setError(code);
    else setError('request');
  }
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(null); setSaved(false);
    try { await action(); } catch (failure) { await fail(failure); }
    finally { working.current = false; setBusy(false); }
  }
  function adopt(value: ReviewDraftDto) {
    setDraft(value); setText(initialReviewText(value, locale, numerals)); setFlags(value.review.summary.redFlags);
    setRequiresRebuild(false); setSent(null);
  }
  async function build() { adopt(await mutate<ReviewDraftDto>(base, 'POST', { locale })); }
  async function refresh() { const latest = await reviewRequest<{ draft: ReviewDraftDto | null }>(base); if (latest.draft) adopt(latest.draft); else { setDraft(null); setText(''); setFlags([]); } }
  async function save() {
    if (!draft || !editable) return;
    const result = await mutate<ReviewDraftDto>(`${base}/${draft.id}`, 'PATCH', { text: text.trim() });
    setDraft(result); setSaved(true);
  }
  async function approve() {
    if (!draft || !editable || blocked || !canSend || !text.trim() || text.trim().length > 4000) return;
    if (dirty) await save();
    const result = await mutate<ApprovalResult>(`${base}/${draft.id}/approve`, 'POST', {});
    setSent(result); setDraft(current => current ? { ...current, status: 'approved', text: text.trim() } : current);
  }
  async function proposal(proposalCode: ProposalCode) {
    if (!draft || !editable || blocked || !canPropose) return;
    const result = await mutate<ReviewProposalDraft>(`${base}/${draft.id}/proposal`, 'POST', { proposalCode });
    setDraft(current => current ? { ...current, proposalDraft: result } : current);
  }
  async function handle(flag: Flag) {
    await mutate(`/api/v1/red-flags/${flag.id}/handle`, 'POST');
    setFlags(current => current.filter(item => item.id !== flag.id)); setRequiresRebuild(true);
  }

  const title = <VStack gap={2} className={frame}>
    <Link href={`/coach/clients/${clientId}?tab=week`} className={link}>{t('backClient')}</Link>
    <Heading level={1} wordBreak="break-word">{t('title')}</Heading>
    <Text as="p" color="secondary" wordBreak="break-word">{t('description')}</Text>
  </VStack>;
  if (error === 'forbidden') return <VStack gap={4} className={frame} dir={locale === 'ar' ? 'rtl' : 'ltr'}>{title}<Text as="p" role="alert">{t('errors.forbidden')}</Text></VStack>;

  const summary = draft?.review.summary;
  const unavailable = new Set(draft?.evidenceUnavailable ?? []);
  const empty = summary && !unavailable.has('programs') && !unavailable.has('nutrition') && !unavailable.has('tracking') && summary.adherence.workouts.done === 0 && (summary.adherence.meals?.daysLogged ?? 0) === 0 && summary.checkin.submittedOn === null && summary.weight.first === null && summary.measurements.length === 0 && summary.prs.length === 0;
  const publishedSource = draft?.review.proposals[0]?.change.fromVersionId;
  void publishedSource;

  return <VStack gap={6} className={frame} dir={locale === 'ar' ? 'rtl' : 'ltr'} data-testid="review-workspace" aria-busy={busy}>
    {title}
    {error && error !== 'stale' ? <Text as="p" role="alert">{t(`errors.${error}`)}</Text> : null}
    {busy ? <Text as="p" role="status" aria-live="polite">{t('working')}</Text> : null}
    {!draft ? <VStack gap={3} className={frame}>
      <Heading level={2}>{t('empty.title')}</Heading><Text as="p">{t('empty.body')}</Text>
      <HStack gap={2} wrap="wrap"><Button label={t('build')} size="lg" className="min-h-11" variant="primary" isDisabled={busy} onClick={() => void run(build)} /><Button label={t('refresh')} size="lg" className="min-h-11" variant="secondary" isDisabled={busy} onClick={() => void run(refresh)} /></HStack>
    </VStack> : <>
      <Text as="p" role="status" aria-live="polite">{t(`status.${draft.status}`)}</Text>
      {stale ? <VStack gap={2} className={frame}><Text as="p" role="alert">{t('stale')}</Text><Button label={t('rebuild')} size="lg" className="min-h-11" variant="primary" isDisabled={busy} onClick={() => void run(build)} /></VStack> : null}
      {summary ? <VStack as="section" gap={3} className={frame} aria-labelledby="review-evidence-title">
        <Heading level={2} id="review-evidence-title">{t('summary.title')}</Heading>
        {empty ? <Text as="p" role="status">{t('summary.emptyWeek')}</Text> : null}
        <List edge="flush" density="spacious" hasDividers className={frame}>
          <ListItem label={<Text weight="semibold">{t('summary.workouts')}</Text>} description={<Text as="p">{unavailable.has('programs') ? t('unavailable.programs') : t('summary.workoutValue', { done: n(summary.adherence.workouts.done, 0), planned: n(summary.adherence.workouts.planned, 0), percent: n(summary.adherence.workouts.percent, 0), previous: n(summary.adherence.workouts.previousPercent, 0) })}</Text>} />
          <ListItem label={<Text weight="semibold">{t('summary.meals')}</Text>} description={<Text as="p">{unavailable.has('nutrition') ? t('unavailable.nutrition') : summary.adherence.meals ? t('summary.mealValue', { days: n(summary.adherence.meals.daysLogged, 0), total: n(summary.adherence.meals.daysInPeriod, 0), percent: n(summary.adherence.meals.percent, 0), kcal: formatKcal(summary.adherence.meals.avgKcal, options), target: formatKcal(summary.adherence.meals.targetKcal, options) }) : t('summary.noNutrition')}</Text>} />
          <ListItem label={<Text weight="semibold">{t('summary.checkin')}</Text>} description={<Text as="p">{summary.checkin.submittedOn ? <time dateTime={summary.checkin.submittedOn}>{date(summary.checkin.submittedOn)}</time> : t('summary.noCheckin')}</Text>} />
          <ListItem label={<Text weight="semibold">{t('summary.weight')}</Text>} description={<Text as="p">{unavailable.has('tracking') ? t('unavailable.tracking') : summary.weight.first && summary.weight.last ? t('summary.weightValue', { first: n(summary.weight.first.kg), last: n(summary.weight.last.kg), delta: n(summary.weight.deltaKg), weekly: n(summary.weight.kgPerWeek) }) : t('summary.noWeight')}</Text>} />
          {summary.checkin.changes.map(answer => <ListItem key={answer.questionId} label={<Text wordBreak="break-word">{answer.label[locale]}</Text>} description={<Text as="p" wordBreak="break-word">{t('summary.answerValue', { current: typeof answer.current === 'number' ? n(answer.current) : typeof answer.current === 'boolean' ? t(answer.current ? 'yes' : 'no') : Array.isArray(answer.current) ? answer.current.join('، ') : answer.current ?? t('missing'), previous: typeof answer.previous === 'number' ? n(answer.previous) : typeof answer.previous === 'boolean' ? t(answer.previous ? 'yes' : 'no') : Array.isArray(answer.previous) ? answer.previous.join('، ') : answer.previous ?? t('missing') })}</Text>} />)}
          {!unavailable.has('tracking') ? summary.measurements.map(measurement => <ListItem key={measurement.key} label={<Text wordBreak="break-word">{t('summary.measurement', { name: measurement.key })}</Text>} description={<Text as="p">{t('summary.measurementValue', { first: n(measurement.first), last: n(measurement.last), delta: n(measurement.delta) })}</Text>} />) : null}
          {!unavailable.has('programs') ? summary.prs.map(pr => <ListItem key={`pr-${pr.exerciseId}`} label={<Text wordBreak="break-word">{t('summary.pr', { name: pick(pr.name) })}</Text>} description={<Text as="p">{t('summary.prValue', { load: n(pr.topLoadKg), previous: n(pr.previousTopLoadKg) })}</Text>} />) : null}
          {!unavailable.has('programs') ? summary.stalls.map(stall => <ListItem key={`stall-${stall.exerciseId}`} label={<Text wordBreak="break-word">{t('summary.stall', { name: pick(stall.name) })}</Text>} description={<Text as="p">{t('summary.stallValue', { sessions: n(stall.stalledSessions, 0) })}</Text>} />) : null}
          {summary.attentionReasons.map(reason => <ListItem key={reason.code} label={<Text wordBreak="break-word">{t(`attention.${reason.code}`)}</Text>} />)}
        </List>
        {draft.evidenceUnavailable.filter(source => !['programs', 'nutrition', 'tracking'].includes(source)).map(source => <Text as="p" key={source}>{t(`unavailable.${source}`)}</Text>)}
      </VStack> : null}
      {blocked || requiresRebuild ? <VStack as="section" gap={3} className={frame} aria-labelledby="review-flags-title">
        <Heading level={2} id="review-flags-title">{t('flags.title')}</Heading><Text as="p" role="alert">{t('flags.blocked')}</Text>
        <List edge="flush" hasDividers density="spacious" className={frame}>{flags.map(flag => <ListItem key={flag.id} label={<Text wordBreak="break-word">{t(`flags.category.${flag.category}`)}</Text>} description={<VStack gap={2} className={frame}><Text as="p">{t(`flags.source.${flag.source}`)}</Text><Button label={t('flags.handle')} size="lg" className="min-h-11" variant="secondary" isDisabled={busy} onClick={() => void run(() => handle(flag))} /></VStack>} />)}</List>
        {requiresRebuild ? <Text as="p" role="status">{t('flags.rebuild')}</Text> : null}
      </VStack> : null}
      <VStack as="section" gap={3} className={frame} aria-labelledby="review-reply-title">
        <Heading level={2} id="review-reply-title">{t('reply.title')}</Heading>
        <Text as="p" color="secondary">{t('reply.hint')}</Text>
        <TextArea label={t('reply.label')} value={text} onChange={value => { setText(value); setSaved(false); }} isReadOnly={!editable} isDisabled={busy} rows={8} maxLength={4000} containerClassName={frame} controlClassName="min-h-11" />
        <Text as="p" type="supporting">{t('reply.characters', { count: n(text.length, 0), max: n(4000, 0) })}</Text>
        {saved ? <Text as="p" role="status">{t('reply.saved')}</Text> : null}
        {!canSend && draft.status === 'draft' ? <Text as="p">{t('reply.noSendPermission')}</Text> : null}
        <HStack gap={2} wrap="wrap">
          <Button label={t('reply.save')} size="lg" className="min-h-11" variant="secondary" isDisabled={busy || !editable || !dirty || !text.trim() || text.trim().length > 4000} onClick={() => void run(save)} />
          <Button label={t('reply.approve')} size="lg" className="min-h-11" variant="primary" isDisabled={busy || !editable || blocked || !canSend || !text.trim() || text.trim().length > 4000} onClick={() => void run(approve)} />
          {!stale ? <Button label={t('rebuild')} size="lg" className="min-h-11" variant="ghost" isDisabled={busy} onClick={() => void run(build)} /> : null}
        </HStack>
        {sent ? <VStack gap={2} className={frame}><Text as="p" role="status">{t(sent.notified ? 'reply.sent' : 'reply.sentNotNotified')}</Text><Link className={link} href={`/coach/messages/${sent.conversationId}`}>{t('reply.openMessage')}</Link></VStack> : null}
      </VStack>
      <VStack as="section" gap={3} className={frame} aria-labelledby="review-proposal-title">
        <Heading level={2} id="review-proposal-title">{t('proposal.title')}</Heading><Text as="p" color="secondary">{t('proposal.hint')}</Text>
        {draft.proposalDraft ? <VStack gap={2} className={frame}><Text as="p" role="status">{t('proposal.created', { version: n(draft.proposalDraft.versionNo, 0) })}</Text>{canViewNutrition ? <HStack gap={2} wrap="wrap"><Link className={link} href={`/coach/nutrition/${draft.proposalDraft.planId}/history`}>{t('proposal.history')}</Link><Link className={link} href={`/coach/nutrition/${draft.proposalDraft.planId}`}>{t('proposal.publish')}</Link></HStack> : null}</VStack> : draft.review.proposals.length ? <List edge="flush" density="spacious" hasDividers className={frame}>{draft.review.proposals.map(item => <ListItem key={item.code} label={<Text weight="semibold">{t(`proposal.codes.${item.code}`)}</Text>} description={<VStack gap={2} className={frame}><Text as="p">{t('proposal.targets', { kcal: formatKcal(item.change.targets.kcal, options), protein: formatMacro(item.change.targets.proteinG, options), carbs: formatMacro(item.change.targets.carbsG, options), fat: formatMacro(item.change.targets.fatG, options) })}</Text><Button label={t('proposal.apply')} size="lg" className="min-h-11" variant="secondary" isDisabled={busy || !editable || blocked || !canPropose} onClick={() => void run(() => proposal(item.code))} /></VStack>} />)}</List> : <Text as="p">{t('proposal.empty')}</Text>}
        {!canPropose && !draft.proposalDraft ? <Text as="p">{t('proposal.noPermission')}</Text> : null}
        {draft.status === 'approved' && !draft.proposalDraft ? <Text as="p">{t('proposal.approvedImmutable')}</Text> : null}
      </VStack>
    </>}
  </VStack>;
}
