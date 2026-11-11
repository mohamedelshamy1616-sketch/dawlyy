'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { completion, evaluateVisibility, validateAnswers } from '@dawlyy/core/forms';
import { Answers, localize, type FormDocument } from '@dawlyy/core/types';
import { z } from 'zod';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { AnswerView } from './answer-view';
import { QuestionInput } from './question-input';
import { FormRequestError, formRequest } from './http';
import { submissionSchema, type FormBundle } from './contracts';

const draftSchema = z.object({ versionId: z.string(), answers: Answers, clientUuid: z.uuid(), clientUpdatedAt: z.iso.datetime() });
type Props = { bundle: FormBundle; preview?: boolean; readOnly?: boolean };

/** Strictly increasing client timestamps so the server's null-safe newer-wins rule accepts every sync. */
function nextStamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous || '1970-01-01') + 1)).toISOString();
}

/** Task 7: shared conditional runner, per-submission local autosave, staged sections and immutable version identity. */
export function FormRunner({ bundle, preview = false, readOnly = false }: Props) {
  const locale = useLocale() === 'ar' ? 'ar' : 'en';
  const t = useTranslations('forms');
  const status = useTranslations('status');
  const [answers, setAnswers] = useState<Answers>(bundle.submission?.answers ?? {});
  const [submission, setSubmission] = useState(bundle.submission);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showIssues, setShowIssues] = useState(false);
  const clientUuid = useRef(bundle.submission?.clientUuid ?? '');
  const updatedAt = useRef('');
  const submitKey = useRef('');
  const document = bundle.version.document;
  const locked = readOnly || !!submission && !['due', 'overdue', 'scheduled'].includes(submission.state);
  const storageKey = `dawlyy:forms:${bundle.clientId}:${bundle.submission?.id ?? bundle.handle}`;
  const activeKey = useRef(storageKey);
  const number = new Intl.NumberFormat(locale);

  useEffect(() => {
    if (preview || locked) return;
    clientUuid.current ||= crypto.randomUUID();
    try {
      const raw = localStorage.getItem(storageKey);
      const draft = raw ? draftSchema.safeParse(JSON.parse(raw)) : null;
      if (draft?.success && draft.data.versionId === bundle.version.id && (!bundle.submission?.clientUpdatedAt || draft.data.clientUpdatedAt > bundle.submission.clientUpdatedAt)) {
        clientUuid.current = bundle.submission?.clientUuid || draft.data.clientUuid;
        updatedAt.current = draft.data.clientUpdatedAt;
        const recovered = draft.data.answers;
        queueMicrotask(() => { setAnswers(recovered); setNotice('runner.restored'); });
      }
    } catch { queueMicrotask(() => setNotice('runner.localUnavailable')); }
  }, [preview, locked, storageKey, bundle.version.id, bundle.submission?.clientUpdatedAt, bundle.submission?.clientUuid]);

  // Hidden questions are never shown and never required (core evaluateVisibility).
  const visible = evaluateVisibility(document, answers);
  const progress = completion(document, answers);
  const issues = showIssues ? validateAnswers(document, answers) : [];
  const section = document.sections[Math.min(step, document.sections.length - 1)];

  function change(id: string, value: Answers[string]) {
    const next = { ...answers, [id]: value };
    setAnswers(next); setNotice(''); submitKey.current = '';
    if (preview) return;
    clientUuid.current ||= crypto.randomUUID();
    updatedAt.current = nextStamp(updatedAt.current);
    try { localStorage.setItem(activeKey.current, JSON.stringify({ versionId: bundle.version.id, answers: next, clientUuid: clientUuid.current, clientUpdatedAt: updatedAt.current })); }
    catch { setNotice('runner.localUnavailable'); }
  }
  async function save() {
    clientUuid.current ||= crypto.randomUUID();
    updatedAt.current ||= new Date().toISOString();
    const result = submissionSchema.parse(await formRequest(`/submissions/${submission?.id ?? bundle.handle}/answers`, 'PUT', { answers, clientUuid: clientUuid.current, clientUpdatedAt: updatedAt.current }, crypto.randomUUID()));
    setSubmission(result); setAnswers(result.answers);
    // Move drafts to the real submission id once the first save allocates it.
    const key = `dawlyy:forms:${result.clientId}:${result.id}`;
    try {
      localStorage.setItem(key, JSON.stringify({ versionId: bundle.version.id, answers: result.answers, clientUuid: result.clientUuid ?? clientUuid.current, clientUpdatedAt: result.clientUpdatedAt ?? updatedAt.current }));
      if (key !== activeKey.current) localStorage.removeItem(activeKey.current);
      activeKey.current = key;
    } catch { setNotice('runner.localUnavailable'); }
    return result;
  }
  async function persist(submit: boolean) {
    if (busy || locked) return;
    setShowIssues(submit); setNotice('');
    if (submit && validateAnswers(document, answers).length) {
      const first = validateAnswers(document, answers)[0]?.questionId;
      const index = document.sections.findIndex(item => item.questions.some(question => question.id === first));
      if (index >= 0) setStep(index);
      setNotice('errors.missing_required');
      return;
    }
    if (preview) { setNotice('runner.previewOnly'); return; }
    setBusy(true);
    try {
      const saved = submit && submitKey.current && submission ? submission : await save();
      if (submit) {
        submitKey.current ||= crypto.randomUUID();
        const result = submissionSchema.parse(await formRequest(`/submissions/${saved.id}/submit`, 'POST', undefined, submitKey.current));
        setSubmission(result); setNotice('runner.sent');
        try { localStorage.removeItem(activeKey.current); localStorage.removeItem(storageKey); } catch { /* Server copy has been saved. */ }
      } else setNotice('runner.saved');
    } catch (error) {
      const key = error instanceof FormRequestError && t.has(`errors.${error.code}`) ? `errors.${error.code}` : 'errors.request_failed';
      setNotice(key);
    } finally { setBusy(false); }
  }

  const sections = locked ? document.sections : section ? [section] : [];
  const lockedLabel = submission?.state === 'reviewed' ? status('complete') : submission?.state === 'skipped' ? t('state.skipped') : status('waitingForCoach');
  const intro = localize(document.intro, locale);
  return <VStack gap={5} maxWidth="100%">
    {bundle.submission?.coachFeedback
      ? <Banner status="info" title={t('review.feedback')} collapsible={false}><Text as="p" wordBreak="break-word">{bundle.submission.coachFeedback}</Text></Banner>
      : null}
    {!locked
      ? <VStack gap={1}>
        <HStack hAlign="between" gap={2} wrap="wrap">
          <Text type="supporting">{t('runner.progress', { answered: number.format(progress.answered), total: number.format(progress.total) })}</Text>
          {document.sections.length > 1 ? <Text type="supporting">{t('runner.step', { current: number.format(Math.min(step, document.sections.length - 1) + 1), total: number.format(document.sections.length) })}</Text> : null}
        </HStack>
        <ProgressBar label={t('runner.completion')} isLabelHidden value={progress.pct} max={100} hasValueLabel formatValueLabel={value => new Intl.NumberFormat(locale, { style: 'percent' }).format(value / 100)} />
      </VStack>
      : <Text weight="semibold" color="accent" as="p">{lockedLabel}</Text>}
    {intro ? <Text color="secondary" as="p">{intro}</Text> : null}
    {sections.map(item => {
      const shown = item.questions.filter(question => visible.visible.has(question.id));
      return <VStack key={item.id} gap={4}>
        <Heading level={2}>{localize(item.title, locale)}</Heading>
        {item.description ? <Text color="secondary" as="p">{localize(item.description, locale)}</Text> : null}
        {!shown.length ? <EmptyState isCompact title={t('runner.emptySection')} description={t('runner.emptySectionHint')} /> : null}
        {shown.map(question => {
          const issue = issues.find(error => error.questionId === question.id);
          return <VStack key={question.id} gap={1}>
            {locked
              ? <>
                <Text weight="semibold" as="p">{localize(question.label, locale)}</Text>
                <AnswerView question={question} value={answers[question.id]} />
              </>
              : <QuestionInput question={question} value={answers[question.id]} clientId={bundle.clientId} preview={preview} disabled={busy}
                error={issue ? localize(issue.message, locale) : undefined} onChange={value => change(question.id, value)} />}
          </VStack>;
        })}
      </VStack>;
    })}
    {notice
      ? <Banner status={notice.startsWith('errors.') ? 'error' : 'info'} title={t(notice)} collapsible={false} />
      : null}
    {!locked
      ? <HStack gap={2} wrap="wrap">
        <Button label={t('runner.previous')} size="lg" variant="secondary" isDisabled={busy || step === 0} onClick={() => setStep(value => value - 1)} />
        {step < document.sections.length - 1
          ? <Button label={t('runner.next')} size="lg" variant="primary" isDisabled={busy} onClick={() => setStep(value => value + 1)} />
          : <Button label={busy ? t('runner.saving') : t('runner.submit')} size="lg" variant="primary" isLoading={busy} onClick={() => void persist(true)} />}
        <Button label={t('runner.saveLater')} size="lg" variant="secondary" isDisabled={busy} onClick={() => void persist(false)} />
      </HStack>
      : null}
  </VStack>;
}

/** Task 7: isolated builder preview uses the exact runner and visibility implementation. */
export function FormPreview({ document }: { document: FormDocument }) {
  return <FormRunner key={JSON.stringify(document)} preview bundle={{ clientId: 'preview', head: { id: 'preview', formKind: 'checkin', name: document.sections[0]?.title ?? { en: 'Preview' } }, version: { id: 'preview', versionNo: 1, document }, event: null, submission: null, handle: 'preview' }} />;
}
