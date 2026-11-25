'use client';
import { ViewTransition, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { evaluateVisibility } from '@dawlyy/core/forms';
import { localize } from '@dawlyy/core/types';
import { useRouter } from '@/i18n/navigation';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { AnswerView } from '../form-runner/answer-view';
import { submitReview } from './review-submit';
import { FormRequestError } from '../form-runner/http';
import { coachFormPath, type FormKind, type ReviewDetail } from './contracts';

/** Task 7: results travel as number | string | null; blank clears, numeric text becomes a number. */
function toResult(text: string): number | string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : trimmed;
}

/** Task 7: read-only answers in the form's order, coach feedback and, for assessments, per-test result fields. */
export function ReviewPanel({ detail, canReview }: { detail: ReviewDetail; canReview: boolean }) {
  const t = useTranslations('forms');
  const status = useTranslations('status');
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const router = useRouter();
  const { submission, document } = detail;
  const assessment = submission.formKind === 'assessment';
  const open = ['submitted', 'waiting_for_coach'].includes(submission.state);
  const [feedback, setFeedback] = useState(submission.coachFeedback ?? '');
  const [results, setResults] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(submission.results ?? {}).map(([key, value]) => [key, value === null || value === undefined ? '' : String(value)])));
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState('');
  const [done, setDone] = useState(false);
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const visible = evaluateVisibility(document, submission.answers).visible;
  const sections = document.sections.map(section => ({ ...section, questions: section.questions.filter(question => visible.has(question.id)) }));
  const kind = (['intake', 'checkin', 'assessment'].includes(submission.formKind) ? submission.formKind : 'checkin') as FormKind;
  const when = submission.submittedAt ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(submission.submittedAt)) : '';

  async function review(openNext = false) {
    setBusy(true); setErrorKey('');
    try {
      const entries = Object.entries(results).map(([key, value]) => [key, toResult(value)] as const).filter(([, value]) => value !== null);
      await submitReview(submission.id, feedback, assessment && entries.length ? Object.fromEntries(entries) : undefined);
      setDone(true);
      if (openNext) router.replace(`/coach/checkins?afterReview=${submission.id}`);
      else router.refresh();
    } catch (error) { setErrorKey(error instanceof FormRequestError && t.has(`errors.${error.code}`) ? error.code : 'request_failed'); } finally { setBusy(false); }
  }

  const locked = !open || !canReview || done;
  return <VStack gap={4} maxWidth="100%">
    <Card>
      <VStack gap={2}>
        <HStack gap={2} wrap="wrap" vAlign="center">
          <ViewTransition name={`submission-${submission.id}`} default="none" share="review-name"><Heading level={2} wordBreak="break-word">{detail.clientName}</Heading></ViewTransition>
          <Badge label={submission.state === 'reviewed' || done ? status('complete') : status('waitingForCoach')} variant={submission.state === 'reviewed' || done ? 'success' : 'warning'} />
        </HStack>
        <Text as="p" wordBreak="break-word">{localize(detail.name, locale)}</Text>
        {when ? <Text type="supporting" as="p">{t('queue.submittedAt', { when })}</Text> : null}
      </VStack>
    </Card>

    {assessment
      ? <Card>
        <VStack gap={3}>
          <Heading level={3}>{t('review.results')}</Heading>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('review.test')}</TableHeaderCell>
                <TableHeaderCell>{t('review.answer')}</TableHeaderCell>
                <TableHeaderCell>{t('review.score')}</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sections.flatMap(section => section.questions).map(question => <TableRow key={question.id}>
                <TableCell><Text wordBreak="break-word">{localize(question.label, locale)}</Text></TableCell>
                <TableCell><AnswerView question={question} value={submission.answers[question.id]} /></TableCell>
                <TableCell>
                  <TextInput label={t('review.scoreFor', { test: localize(question.label, locale) })} isLabelHidden size="lg" value={results[question.id] ?? ''} isDisabled={locked}
                    onChange={value => setResults(old => ({ ...old, [question.id]: value }))} />
                </TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </VStack>
      </Card>
      : sections.map(section => <Card key={section.id}>
        <VStack gap={3}>
          <Heading level={3}>{localize(section.title, locale)}</Heading>
          {section.questions.map(question => <VStack key={question.id} gap={1}>
            <Text weight="semibold" as="p" wordBreak="break-word">{localize(question.label, locale)}</Text>
            <AnswerView question={question} value={submission.answers[question.id]} />
          </VStack>)}
        </VStack>
      </Card>)}

    <Card>
      <VStack gap={3}>
        <TextArea label={t('review.feedback')} description={t('review.feedbackHint')} rows={4} value={feedback} isDisabled={locked} onChange={setFeedback} />
        {errorKey ? <Banner status="error" title={t(`errors.${errorKey}`)} collapsible={false} /> : null}
        {done ? <Banner status="success" title={t('review.done')} collapsible={false} /> : null}
        {!open && !done ? <Banner status="info" title={t('review.alreadyReviewed')} collapsible={false} /> : null}
        <HStack gap={2} wrap="wrap">
          {canReview && open && !done
            ? <>
              <Button label={t('review.reviewed')} variant="primary" size="lg" isLoading={busy} onClick={() => void review()} />
              {kind === 'checkin' ? <Button label={t('review.sendNext')} size="lg" isDisabled={busy} onClick={() => void review(true)} /> : null}
              <Button label={t('review.resubmit')} variant="secondary" size="lg" isDisabled={busy} onClick={() => setResubmitOpen(true)} />
            </>
            : null}
          <Button label={t('review.back')} variant="ghost" size="lg" href={coachFormPath(kind)} />
        </HStack>
      </VStack>
    </Card>

    <Dialog isOpen={resubmitOpen} onOpenChange={setResubmitOpen} purpose="info" padding={4}>
      <DialogHeader title={t('review.resubmitTitle')} onOpenChange={setResubmitOpen} />
      <VStack gap={3} paddingBlockStart={3}>
        <Text as="p">{t('review.resubmitBody')}</Text>
        <HStack gap={2} hAlign="end" wrap="wrap">
          <Button label={t('builder.cancel')} variant="secondary" size="lg" onClick={() => setResubmitOpen(false)} />
          <Button label={t('review.resubmitGo')} variant="primary" size="lg" href={`${coachFormPath(kind)}?tab=templates`} />
        </HStack>
      </VStack>
    </Dialog>
  </VStack>;
}
